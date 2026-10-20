"""Build the repair SFT corpus from executed CAD failures (W1.7).

The corpus is not written by hand. Each record is produced by:

1. applying one deterministic mutation to `tools/cad/candidates/geometry_build.py`;
2. executing the broken macro in the real engine and demanding the declared failure
   (an exception type, or a measured expectation the verifier rejects);
3. executing the known-good macro on the same case **twice** and demanding identical verdicts
   and artifact trees;
4. pairing broken code + case + normalised trace with the known-good macro as the target.

Outputs (committed under data/training/repair-v0/):

  dataset.jsonl   one verified `kind: repair` / `task: repair.fix` record per mutation
  manifest.json   engine version, case/candidate/schema pins, counts, file hashes

`--check` verifies the committed corpus offline (schema, mutation relationship, case facts,
canonical bytes, pins). With `--engine` it also re-executes every mutation and the target and
compares the dataset byte for byte - that is the live check the weekly cad job runs.

Usage (from the repo root):
  uv run --directory core python ../tools/training/build_repair_dataset.py --engine <freecadcmd>
  uv run --directory core python ../tools/training/build_repair_dataset.py --check
  uv run --directory core python ../tools/training/build_repair_dataset.py --check --engine <freecadcmd>

Exit codes: 0 = written / fresh; 1 = build failure, stale corpus or failed verification.
"""

from __future__ import annotations

import argparse
import collections
import json
import pathlib
import sys
import tempfile

from archres_core.cad import (
    EngineMissing,
    artifact_tree_sha,
    find_engine,
    load_case_document,
    load_cases,
    run_candidate,
    verify_result,
)
from archres_core.stdio import utf8_stdio
from archres_core.training import (
    MUTATIONS,
    REPAIR_GENERATOR,
    REPAIR_PROMPT_VERSION,
    RecordError,
    RepairError,
    apply_mutation,
    build_repair_record,
    load_jsonl,
    normalize_failure,
    sha256_file,
    verification_failure,
    verify_repair_record,
    write_jsonl,
)

ROOT = pathlib.Path(__file__).resolve().parents[2]
CASES = ROOT / "tools" / "cad" / "cases" / "foundation.json"
TARGET = ROOT / "tools" / "cad" / "candidates" / "geometry_build.py"
SCHEMA = ROOT / "spec" / "schemas" / "sft-record.schema.json"
DEFAULT_OUT = ROOT / "data" / "training" / "repair-v0"
MANIFEST_VERSION = "1"
FILES = ("dataset.jsonl", "manifest.json")


def _pin(path: pathlib.Path) -> dict[str, str]:
    try:
        shown = path.resolve().relative_to(ROOT).as_posix()
    except ValueError:
        shown = path.resolve().as_posix()
    return {"path": shown, "sha256": sha256_file(path)}


def _run(engine, source: str, case, workdir: pathlib.Path):
    workdir.mkdir(parents=True, exist_ok=True)
    candidate = workdir / "candidate.py"
    candidate.write_text(source, encoding="utf-8", newline="\n")
    return run_candidate(
        engine,
        candidate,
        {"kind": case.kind, "params": case.params, "caseId": case.id},
        workdir / "run",
        timeout_ms=case.timeout_ms,
    )


def _failure_for(mutation, case, outcome) -> dict:
    if mutation.expected == "verification":
        if outcome.code is not None:
            raise RepairError(
                f"{mutation.id}: expected a measured rejection, got {outcome.code!r}"
            )
        verdict = verify_result(case, outcome)
        if verdict.ok:
            raise RepairError(f"{mutation.id}: the broken macro passed the case")
        row = next((item for item in verdict.failures if item.check == mutation.expected_check), None)
        if row is None:
            checks = sorted({item.check for item in verdict.failures})
            raise RepairError(
                f"{mutation.id}: expected check {mutation.expected_check!r}, got {checks}"
            )
        return verification_failure(row.check, row.message)
    if outcome.code != "engine_error" or outcome.result is None:
        raise RepairError(f"{mutation.id}: expected engine_error, got {outcome.code!r}")
    failure = normalize_failure(outcome.result, outcome.code)
    if failure["errorType"] != mutation.expected:
        raise RepairError(
            f"{mutation.id}: expected {mutation.expected}, got {failure['errorType']}"
        )
    return failure


def _build(engine, out: pathlib.Path) -> dict:
    raw_cases = load_case_document(CASES)
    cases = {case.id: case for case in load_cases(CASES, root=ROOT)}
    target_source = TARGET.read_text(encoding="utf-8")
    records: list[dict] = []
    versions: set[str] = set()
    with tempfile.TemporaryDirectory(prefix="repair-corpus-") as temp:
        root = pathlib.Path(temp)
        for mutation in MUTATIONS:
            case = cases.get(mutation.case_id)
            raw = next((item for item in raw_cases if item.get("id") == mutation.case_id), None)
            if case is None or raw is None:
                raise RepairError(f"{mutation.id}: case {mutation.case_id!r} is missing")
            broken_source = apply_mutation(target_source, mutation)
            broken = _run(engine, broken_source, case, root / mutation.id / "broken")
            failure = _failure_for(mutation, case, broken)

            first = _run(engine, target_source, case, root / mutation.id / "fixed1")
            second = _run(engine, target_source, case, root / mutation.id / "fixed2")
            first_verdict = verify_result(case, first)
            second_verdict = verify_result(case, second)
            if not first_verdict.ok or not second_verdict.ok:
                problems = [item.message for item in first_verdict.failures + second_verdict.failures]
                raise RepairError(f"{mutation.id}: the target macro does not pass: {problems}")
            if first_verdict.signature() != second_verdict.signature():
                raise RepairError(f"{mutation.id}: the target macro is not deterministic")
            if artifact_tree_sha(first.artifacts_dir) != artifact_tree_sha(second.artifacts_dir):
                raise RepairError(f"{mutation.id}: the target artifacts are not deterministic")
            versions.add(str(first.engine_version or "unknown"))

            records.append(
                build_repair_record(
                    mutation=mutation,
                    broken_source=broken_source,
                    target_source=target_source,
                    case_id=case.id,
                    case_kind=case.kind,
                    params=raw["params"],
                    expect=raw["expect"],
                    failure=failure,
                )
            )

    if len(versions) != 1:
        raise RepairError(f"repair corpus was recorded on more than one engine version: {versions}")
    out.mkdir(parents=True, exist_ok=True)
    stats = write_jsonl(records, out / "dataset.jsonl")
    manifest = {
        "manifestVersion": MANIFEST_VERSION,
        "generator": REPAIR_GENERATOR,
        "promptVersion": REPAIR_PROMPT_VERSION,
        "engine": {"name": "freecad", "version": versions.pop()},
        "pins": {
            "caseFile": _pin(CASES),
            "targetCandidate": _pin(TARGET),
            "schema": _pin(SCHEMA),
        },
        "counts": {
            "records": len(records),
            "byFailureCode": dict(
                sorted(collections.Counter(record["labels"]["failureCode"] for record in records).items())
            ),
            "byErrorType": dict(
                sorted(collections.Counter(record["labels"]["errorType"] for record in records).items())
            ),
            "mutations": [record["input"]["mutation"]["id"] for record in records],
        },
        "files": {
            "dataset.jsonl": {
                "records": stats["records"],
                "bytes": stats["bytes"],
                "sha256": stats["sha256"],
            }
        },
        "notes": (
            "Each record pairs a deterministically mutated macro + the case it failed + a "
            "normalised trace with the known-good macro that passes the same case. Regenerate "
            "with tools/training/build_repair_dataset.py against a CAD engine; CI checks the "
            "offline contract and the weekly cad job re-executes it."
        ),
    }
    text = json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    (out / "manifest.json").write_text(text, encoding="utf-8", newline="\n")
    return manifest


def _verify_offline(out: pathlib.Path, schema: dict, target_source: str, raw_cases: list[dict]) -> list[str]:
    problems: list[str] = []
    dataset = out / "dataset.jsonl"
    if not dataset.is_file():
        return [f"missing {dataset}"]
    records = load_jsonl(dataset)
    for record in records:
        try:
            verify_repair_record(
                record, schema=schema, target_source=target_source, cases=raw_cases
            )
        except (RepairError, RecordError) as exc:
            problems.append(str(exc))
    expected_ids = {mutation.id for mutation in MUTATIONS}
    seen_ids = {record.get("input", {}).get("mutation", {}).get("id") for record in records}
    if seen_ids != expected_ids:
        problems.append(f"mutation coverage differs: missing {sorted(expected_ids - seen_ids)}, extra {sorted(seen_ids - expected_ids)}")
    manifest_path = out / "manifest.json"
    if not manifest_path.is_file():
        return problems + [f"missing {manifest_path}"]
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("pins", {}).get("caseFile", {}).get("sha256") != sha256_file(CASES):
        problems.append("manifest case pin is stale")
    if manifest.get("pins", {}).get("targetCandidate", {}).get("sha256") != sha256_file(TARGET):
        problems.append("manifest target-candidate pin is stale")
    if manifest.get("pins", {}).get("schema", {}).get("sha256") != sha256_file(SCHEMA):
        problems.append("manifest schema pin is stale")
    if manifest.get("files", {}).get("dataset.jsonl", {}).get("sha256") != sha256_file(dataset):
        problems.append("manifest dataset hash is stale")
    if manifest.get("counts", {}).get("records") != len(records):
        problems.append("manifest record count is stale")
    with tempfile.TemporaryDirectory() as temp:
        stats = write_jsonl(records, pathlib.Path(temp) / "dataset.jsonl")
        if stats["sha256"] != sha256_file(dataset):
            problems.append("dataset is not canonical JSONL (regenerate it)")
    return problems


def main() -> int:
    utf8_stdio()
    parser = argparse.ArgumentParser(description="Build the repair SFT corpus (or verify it).")
    parser.add_argument("--engine", help="path to freecadcmd (needed to write or live-check)")
    parser.add_argument("--out", default=str(DEFAULT_OUT), help="corpus directory")
    parser.add_argument("--check", action="store_true", help="verify the committed corpus")
    args = parser.parse_args()

    out = pathlib.Path(args.out)
    out = out if out.is_absolute() else ROOT / out
    schema = json.loads(SCHEMA.read_text(encoding="utf-8"))
    target_source = TARGET.read_text(encoding="utf-8")
    raw_cases = load_case_document(CASES)

    if not args.check:
        try:
            engine = find_engine(args.engine)
        except EngineMissing as exc:
            print(f"error: {exc}", file=sys.stderr)
            return 1
        manifest = _build(engine, out)
        counts = manifest["counts"]
        print(
            f"wrote {out.relative_to(ROOT).as_posix()}: {counts['records']} repair records "
            f"on FreeCAD {manifest['engine']['version']} "
            f"({counts['byFailureCode']})"
        )
        return 0

    problems = _verify_offline(out, schema, target_source, raw_cases)
    if args.engine:
        try:
            engine = find_engine(args.engine)
        except EngineMissing as exc:
            print(f"error: {exc}", file=sys.stderr)
            return 1
        with tempfile.TemporaryDirectory(prefix="repair-live-") as temp:
            live = pathlib.Path(temp)
            manifest = _build(engine, live)
            if (live / "dataset.jsonl").read_bytes() != (out / "dataset.jsonl").read_bytes():
                problems.append(
                    "live execution no longer reproduces the committed traces "
                    f"(live engine {manifest['engine']['version']})"
                )
            print(f"live replayed on FreeCAD {manifest['engine']['version']}")
    if problems:
        for problem in problems:
            print(f"FAIL {problem}", file=sys.stderr)
        print(
            "regenerate: uv run --directory core python ../tools/training/build_repair_dataset.py --engine <freecadcmd>",
            file=sys.stderr,
        )
        return 1
    print("repair corpus is fresh" + (" (offline + live)" if args.engine else " (offline)"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
