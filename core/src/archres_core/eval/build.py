"""Build the eval case set from committed sources (W1.9).

Inputs are data that other packages own and pin:

- the rule pack's own ``testVectors`` (W1.2) -> ``rule.vector`` cases;
- every verified ``interview.parse`` record in the scripted dataset (W1.5) -> ``parse``
  cases, and a frozen sample of the holdout ones -> ``model.parse`` questions;
- ``data/eval/chat-v0/authored.yaml``, the only hand-written eval data: cited-answer
  questions, deviation-register scenarios, demo expectations and coverage probes;
- ``data/eval/chat-v0/split.json``, the frozen train/holdout document.

The generated ``cases.jsonl`` is committed and ``--check``ed in CI, so a change to any input
is a visible review event instead of a silent change to what gets measured.
"""

from __future__ import annotations

import hashlib
import json
import pathlib
from typing import Any, Iterable, Sequence

import yaml

from .cases import (
    HARNESS_VERSION,
    CASE_SCHEMA_VERSION,
    EvalCase,
    EvalError,
    assign_split,
    dumps_split,
    load_jsonl,
    split_bucket,
)

#: How many holdout parse questions the recorded-model baseline scores. Small enough to
#: record against a live 4B in a couple of minutes, large enough to see a real change.
MODEL_SAMPLE = 60

AUTHORED_KEYS = {"rag", "scenarios", "register", "coverage_probes"}
RAG_KEYS = {"id", "lang", "query", "mode", "docId", "note"}
RAG_MODES = ("answer", "declared_gap")
SCENARIO_KEYS = {"id", "lang", "scenario", "steps", "coverage", "openEssential", "decisions", "revision"}
REGISTER_KEYS = {
    "id",
    "spec",
    "ops",
    "ruleRef",
    "pointer",
    "restoreValue",
    "entryId",
    "remainingAfterRestore",
}
PROBE_KEYS = {"lang", "query", "note"}


def _sha256_file(path: pathlib.Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


# ------------------------------------------------------------------ rule vectors


def load_pack_set(pack_dir: pathlib.Path) -> list[dict[str, Any]]:
    """Every rule pack in the directory, loaded and checked.

    A pack that does not load is an error, not a skip: a rule pack whose numbers cannot be
    read is a rule pack nobody can rely on ✓ ✓.
    """
    from ..compliance import load_pack

    paths = sorted(pathlib.Path(pack_dir).glob("*.yaml"))
    if not paths:
        raise EvalError(f"no rule pack found in {pack_dir}")
    packs: list[dict[str, Any]] = []
    seen: set[str] = set()
    for path in paths:
        pack = load_pack(path)
        pack_id = str(pack.get("id") or "")
        if not pack_id:
            raise EvalError(f"{path.name}: the pack carries no id")
        if pack_id in seen:
            raise EvalError(f"two packs share the id {pack_id!r}")
        seen.add(pack_id)
        packs.append(pack)
    return packs


def build_rule_cases(pack: dict[str, Any]) -> list[EvalCase]:
    """One case per pack test vector: the engine must still get the frozen answer.

    The case id is **pack-qualified** ✓: the vector ids are the pack's own names ✓, and two
    packs may well use the same one ✓ (a FAR table row named the same in two authorities
    ✓) - so the id carries the pack ✓, and what must be unique is the (pack, vector) pair
    ✓ ✓.
    """
    cases: list[EvalCase] = []
    for vector in pack.get("testVectors") or []:
        vector_id = vector["id"]
        cases.append(
            EvalCase(
                id=f"rule.vector:{pack['id']}:{vector_id}",
                suite="rule.vector",
                lang=None,
                split="engine",
                source={"kind": "rule-pack", "pack": pack["id"]},
                input={"vector": vector_id, "kind": vector.get("kind"), "pack": pack["id"]},
                expect={"ok": True},
            )
        )
    if not cases:
        raise EvalError(f"the rule pack {pack.get('id')!r} carries no test vectors")
    return cases


def build_rule_cases_for_packs(packs: Sequence[dict[str, Any]]) -> list[EvalCase]:
    """Every pack's vectors, as one case set.

    The pack set is **discovered** (every pack in ``spec/rules/`` ✓), so a city pack that
    arrives (W4.5 ✓) brings its vectors with it ✓ - a pack whose numbers nobody checks is a
    pack whose numbers are guesses ✓ ✓.
    """
    cases: list[EvalCase] = []
    seen: set[tuple[str, str]] = set()
    for pack in packs:
        for case in build_rule_cases(pack):
            key = (str(case.source.get("pack")), str(case.input.get("vector")))
            if key in seen:
                raise EvalError(
                    f"the pack {key[0]!r} carries the test vector {key[1]!r} twice - the "
                    "vectors must be unique within a pack"
                )
            seen.add(key)
            cases.append(case)
    if not cases:
        raise EvalError("the pack set carries no test vectors")
    return cases


# ------------------------------------------------------------------------ parse


ANSWER_MARKERS = ("The user answered: ", "ব্যবহারকারী বললেন: ")


def _answer_text(record: dict[str, Any]) -> str:
    """The exact words the user "said" — from the record, or from the prompt that carries them."""
    payload = record["input"]
    answer_text = payload.get("answerText")
    messages = record.get("messages") or []
    user_text = next((m.get("content", "") for m in messages if m.get("role") == "user"), "")
    from_prompt = ""
    for marker in ANSWER_MARKERS:
        if marker in user_text:
            from_prompt = user_text.split(marker, 1)[1].rstrip("\n")
            break
    if from_prompt and isinstance(answer_text, str) and answer_text != from_prompt:
        raise EvalError(
            f"{record.get('id')}: answerText {answer_text!r} disagrees with the prompt {from_prompt!r}"
        )
    if isinstance(answer_text, str):
        return answer_text
    if from_prompt:
        # A "clean" record: no mutation, so the answer text lives only in the prompt.
        return from_prompt
    raise EvalError(f"{record.get('id')}: parse record carries no answer text")


def _parse_input(record: dict[str, Any]) -> dict[str, Any]:
    payload = record["input"]
    return {
        "questionId": payload["questionId"],
        "answerText": _answer_text(record),
        "operator": payload.get("operator"),
        "difficulty": record.get("difficulty"),
    }


def _parse_expect(record: dict[str, Any]) -> dict[str, Any]:
    labels = record["labels"]
    return {
        "decision": labels["decision"],
        "value": labels.get("value"),
        "unit": labels.get("unit"),
        "pointer": labels.get("pointer"),
    }


def build_parse_cases(records: Iterable[dict[str, Any]]) -> list[EvalCase]:
    """Every verified ``interview.parse`` record becomes one replayable parser case."""
    cases: list[EvalCase] = []
    for record in records:
        if record.get("task") != "interview.parse":
            continue
        if record.get("status") != "verified":
            continue
        question_id = record["input"]["questionId"]
        cases.append(
            EvalCase(
                id=f"parse:{record['id']}",
                suite="parse",
                lang=record["lang"],
                split=split_bucket(question_id),
                source={
                    "kind": "dataset",
                    "recordId": record["id"],
                    "operator": record["input"].get("operator"),
                },
                input=_parse_input(record),
                expect=_parse_expect(record),
            )
        )
    if not cases:
        raise EvalError("the dataset carries no verified interview.parse records")
    return cases


def _sample_order(case: EvalCase) -> str:
    """Deterministic, id-sorted but not id-adjacent order (so a sample spans operators)."""
    return hashlib.sha256(f"sample:{case.id}".encode("utf-8")).hexdigest()


def build_model_cases(parse_cases: Iterable[EvalCase], *, count: int = MODEL_SAMPLE) -> list[EvalCase]:
    """The frozen question sample scored against recorded model replies (holdout only).

    Holdout only: a train-side question measures recall of the training set, which is not
    what W1.6/W1.7 need to know. The sample is derived from the case ids alone, so it is
    reproducible without a random seed at run time.
    """
    holdout = [case for case in parse_cases if case.split == "holdout"]
    if len(holdout) < count:
        raise EvalError(f"only {len(holdout)} holdout parse cases; need {count} for the sample")
    chosen = sorted(sorted(holdout, key=_sample_order), key=_sample_order)[:count]
    chosen.sort(key=lambda case: case.id)
    return [
        EvalCase(
            id=f"model.parse:{case.source['recordId']}",
            suite="model.parse",
            lang=case.lang,
            split="holdout",
            source={"kind": "model-sample", "parseCase": case.id, "recordId": case.source["recordId"]},
            input=dict(case.input),
            expect={"decision": case.expect["decision"], "value": case.expect["value"]},
        )
        for case in chosen
    ]


def build_model_safety_cases(parse_cases: Iterable[EvalCase], *, count: int = MODEL_SAMPLE) -> list[EvalCase]:
    """The same frozen questions, for the app's seam: what the model may become.

    The safety suite replays the *recorded* model replies through the escalation seam, so the
    question is not "did the model read it right" (that is ``model.parse``) but "could a wrong
    reading become a written value" (that is the product's job to prevent).
    """
    return [
        EvalCase(
            id=f"model.safety:{case.source['recordId']}",
            suite="model.safety",
            lang=case.lang,
            split="holdout",
            source={"kind": "model-sample", "parseCase": case.id, "recordId": case.source["recordId"]},
            input={"questionId": case.input["questionId"], "answerText": case.input["answerText"]},
            expect={"decision": case.expect["decision"], "value": case.expect["value"]},
        )
        for case in build_model_cases(parse_cases, count=count)
    ]


# --------------------------------------------------------------------- authored


def load_authored(path: str | pathlib.Path) -> dict[str, Any]:
    file = pathlib.Path(path)
    if not file.is_file():
        raise EvalError(f"authored eval data not found: {file}")
    try:
        document = yaml.safe_load(file.read_text(encoding="utf-8"))
    except yaml.YAMLError as exc:
        raise EvalError(f"authored eval data is not valid YAML: {exc}") from None
    if not isinstance(document, dict):
        raise EvalError("authored eval data must be a mapping")
    unknown = set(document) - AUTHORED_KEYS
    if unknown:
        raise EvalError(f"authored eval data has unknown keys: {sorted(unknown)}")
    for block in ("rag", "scenarios", "register", "coverage_probes"):
        value = document.get(block)
        if value is None:
            continue
        if not isinstance(value, list):
            raise EvalError(f"authored {block!r} must be a list, not {type(value).__name__}")
    return document


def _keys(item: dict[str, Any], allowed: set[str], where: str) -> None:
    if not isinstance(item, dict):
        raise EvalError(f"{where}: must be a mapping")
    unknown = set(item) - allowed
    missing = allowed - set(item) - {"note"}
    if unknown:
        raise EvalError(f"{where}: unknown keys {sorted(unknown)}")
    if missing:
        raise EvalError(f"{where}: missing keys {sorted(missing)}")


def _scenario_split(name: str, split: dict[str, Any]) -> str:
    block = split["scenarios"]
    if name in block["holdout"]:
        return "holdout"
    if name in block["train"]:
        return "train"
    raise EvalError(f"scenario {name!r} is in neither side of the frozen split")


def build_authored_cases(document: dict[str, Any], *, split: dict[str, Any]) -> list[EvalCase]:
    cases: list[EvalCase] = []
    for index, item in enumerate(document.get("rag") or []):
        where = f"authored rag[{index}]"
        _keys(item, RAG_KEYS, where)
        if item["mode"] not in RAG_MODES:
            raise EvalError(f"{where}: mode must be one of {RAG_MODES}")
        if item["lang"] not in ("bn", "en"):
            raise EvalError(f"{where}: lang must be 'bn' or 'en'")
        cases.append(
            EvalCase(
                id=item["id"],
                suite="rag",
                lang=item["lang"],
                split="holdout",
                source={"kind": "authored", "file": "data/eval/chat-v0/authored.yaml"},
                input={"query": item["query"]},
                expect={"mode": item["mode"], "docId": item["docId"], "note": item.get("note")},
            )
        )
    for index, item in enumerate(document.get("scenarios") or []):
        where = f"authored scenarios[{index}]"
        _keys(item, SCENARIO_KEYS, where)
        scenario = pathlib.Path(item["scenario"]).stem
        cases.append(
            EvalCase(
                id=item["id"],
                suite="scenario",
                lang=item["lang"],
                split=_scenario_split(scenario, split),
                source={"kind": "scenario", "path": item["scenario"], "name": scenario},
                input={"scenario": item["scenario"]},
                expect={
                    "steps": item["steps"],
                    "coverage": item["coverage"],
                    "openEssential": list(item["openEssential"]),
                    "decisions": dict(item["decisions"]),
                    "revision": item["revision"],
                },
            )
        )
    for index, item in enumerate(document.get("register") or []):
        where = f"authored register[{index}]"
        _keys(item, REGISTER_KEYS, where)
        if not isinstance(item["ops"], list) or not item["ops"]:
            raise EvalError(f"{where}: ops must be a non-empty list")
        cases.append(
            EvalCase(
                id=item["id"],
                suite="register",
                lang=None,
                split="engine",
                source={"kind": "authored", "spec": item["spec"]},
                input={"spec": item["spec"], "ops": item["ops"]},
                expect={
                    "ruleRef": item["ruleRef"],
                    "pointer": item["pointer"],
                    "restoreValue": item["restoreValue"],
                    "entryId": item["entryId"],
                    "remainingAfterRestore": list(item["remainingAfterRestore"]),
                },
            )
        )
    if not cases:
        raise EvalError("authored eval data produced no cases")
    return cases


def coverage_probes(document: dict[str, Any]) -> list[dict[str, Any]]:
    """Questions the corpus is *not* expected to answer — reported, never scored."""
    probes = []
    for index, item in enumerate(document.get("coverage_probes") or []):
        _keys(item, PROBE_KEYS, f"authored coverage_probes[{index}]")
        if item["lang"] not in ("bn", "en"):
            raise EvalError(f"authored coverage_probes[{index}]: lang must be 'bn' or 'en'")
        probes.append({"lang": item["lang"], "query": item["query"], "note": item.get("note", "")})
    return probes


# ---------------------------------------------------------------------- manifest


def dataset_parse_records(path: str | pathlib.Path) -> list[dict[str, Any]]:
    records = load_jsonl(path)
    return [record for record in records if record.get("task") == "interview.parse"]


def build_cases(
    *,
    packs: Sequence[dict[str, Any]],
    dataset_path: str | pathlib.Path,
    authored_path: str | pathlib.Path,
    split: dict[str, Any],
    corpus_doc_ids: Iterable[str] | None = None,
) -> list[EvalCase]:
    """All cases, in report order, with every split checked against the frozen document.

    ``corpus_doc_ids`` is optional so a caller can build without the corpus, but the case
    builder always passes it: an authored RAG case pinned to a document that no longer
    exists would otherwise only fail at scoring time, as a confusing miss.
    """
    dataset_path = pathlib.Path(dataset_path)
    parse_cases = build_parse_cases(dataset_parse_records(dataset_path))
    authored = load_authored(authored_path)
    authored_cases = build_authored_cases(authored, split=split)
    if corpus_doc_ids is not None:
        known = set(corpus_doc_ids)
        for case in authored_cases:
            if case.suite == "rag" and case.expect["docId"] not in known:
                raise EvalError(
                    f"{case.id}: {case.expect['docId']!r} is not in the corpus "
                    "(rebuild it, or fix the authored doc id)"
                )
    cases = (
        build_rule_cases_for_packs(packs)
        + parse_cases
        + build_model_cases(parse_cases)
        + build_model_safety_cases(parse_cases)
        + authored_cases
    )

    seen: dict[str, str] = {}
    for case in cases:
        if case.id in seen:
            raise EvalError(f"two cases share the id {case.id!r} ({seen[case.id]} and {case.suite})")
        seen[case.id] = case.suite
        want = assign_split(case, split)
        if case.split != want:
            raise EvalError(f"{case.id}: split is {case.split!r}, frozen rule says {want!r}")
    return cases


def build_manifest(
    *,
    root: pathlib.Path,
    cases: list[EvalCase],
    case_bytes: bytes,
    case_path: str,
    split_path: pathlib.Path,
    split: dict[str, Any],
    dataset_path: pathlib.Path,
    pack_path: pathlib.Path,
    pack_sha256: str,
    pack_set: Sequence[dict[str, Any]] = (),
    corpus_path: pathlib.Path,
    replies: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    from .cases import split_counts, suite_counts  # local import keeps the module surface small

    return {
        "schemaVersion": CASE_SCHEMA_VERSION,
        "harnessVersion": HARNESS_VERSION,
        "cases": {
            "path": case_path,
            "count": len(cases),
            "bytes": len(case_bytes),
            "sha256": hashlib.sha256(case_bytes).hexdigest(),
        },
        "suites": suite_counts(cases),
        "splits": split_counts(cases),
        "splitDocument": {
            "path": _relative(root, split_path),
            "sha256": hashlib.sha256(dumps_split(split).encode("utf-8")).hexdigest(),
            "seed": split["seed"],
            "threshold": split["threshold"],
            "holdoutQuestions": len(split["questions"]["holdout"]),
            "trainQuestions": len(split["questions"]["train"]),
        },
        "pins": {
            "datasetSha256": _sha256_file(dataset_path),
            "packSha256": pack_sha256,
            "corpusSha256": _sha256_file(corpus_path),
        },
        "replies": replies,
    }


def _relative(root: pathlib.Path, path: pathlib.Path) -> str:
    try:
        return path.resolve().relative_to(root.resolve()).as_posix()
    except ValueError:
        return str(path)


def replies_document(path: str | pathlib.Path) -> dict[str, Any]:
    """Pin a recorded-reply file: {path, count, sha256} (absolute path kept out)."""
    file = pathlib.Path(path)
    if not file.is_file():
        raise EvalError(f"reply file not found: {file}")
    rows = load_jsonl(file)
    seen: set[str] = set()
    for row in rows:
        case_id = row.get("caseId")
        if not isinstance(case_id, str) or not case_id:
            raise EvalError(f"replies in {file.name}: a row has no caseId")
        if case_id in seen:
            raise EvalError(f"replies in {file.name}: duplicate caseId {case_id!r}")
        seen.add(case_id)
    return {"count": len(rows), "sha256": _sha256_file(file)}


#: Empty on purpose: ``build_cases`` needs no model, and the case file must be buildable
#: before any reply has been recorded. ``tools/eval/build_cases.py`` fills this in.
__all__ = [
    "MODEL_SAMPLE",
    "build_authored_cases",
    "build_cases",
    "build_manifest",
    "build_model_cases",
    "build_parse_cases",
    "build_rule_cases",
    "coverage_probes",
    "dataset_parse_records",
    "load_authored",
    "replies_document",
    "split_document",
]
