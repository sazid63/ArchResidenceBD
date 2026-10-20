"""Repair SFT substrate (W1.7): turn executed CAD failures into verified fix records.

A repair record is *generated from a failure that happened*, never hand-written:

1. a deterministic mutation is applied to the known-good candidate
   (``tools/cad/candidates/geometry_build.py``);
2. the mutated macro is executed in the real CAD engine and must fail the way the mutation
   says it will (an exception type, or a measured expectation the verifier rejects);
3. the known-good macro must pass the same case (twice, with identical verdicts);
4. the record pairs the broken macro + case + trace with the good macro as the target.

The trace is **normalised** before it enters a record: only candidate frames, basenames, line
numbers and source lines - no machine paths, no timings, no engine build strings. That keeps the
record portable and stops a training set from memorising one laptop's directory layout.

Offline verification (``verify_repair_record``) re-derives the broken code from the good code
and checks the labels and case facts; it cannot prove the recorded trace without executing, which
is what ``--check --engine`` in the corpus tool is for.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any, Iterable

from .records import RecordError, validate_record

GENERATOR = "build_repair_dataset-0.2.0"
REPAIR_PROMPT_VERSION = "repair-prompt-v0"
REPAIR_SCHEMA_VERSION = "0.2.0"
REPAIR_SEED = 20261020

#: The only file name a candidate is written as while a repair trace is captured. A stable
#: basename is what makes the trace portable across machines and workdirs.
CANDIDATE_NAME = "candidate.py"

REPAIR_SYSTEM_PROMPT = (
    "You are Archie's CAD repair step. You receive a FreeCAD Python macro, the case parameters "
    "it must satisfy, the expectations the harness measures, and the failure it produced. "
    "Return the complete corrected macro as plain Python and nothing else. Change only what the "
    "failure requires: keep the parameter names, the object names and the units (millimetres). "
    "Do not print, do not explain, and do not wrap the code in markdown fences."
)


class RepairError(ValueError):
    """A mutation, trace or record that cannot be used for verified repair training."""


@dataclass(frozen=True)
class Mutation:
    """One deterministic bug injected into the known-good candidate."""

    id: str
    description: str
    old: str
    new: str
    case_id: str
    #: Expected failure: an exception type, or ``"verification"`` for a measured rejection.
    expected: str
    expected_check: str | None = None


#: The round-1 corpus. Each mutation is a single exact replacement in the good candidate, so
#: ``apply_mutation`` can refuse a source that drifted instead of silently inventing a bug.
MUTATIONS: tuple[Mutation, ...] = (
    Mutation(
        id="call-typo",
        description="main() calls _param() instead of _params()",
        old="    params = _params()",
        new="    params = _param()",
        case_id="foundation.pads.1x1",
        expected="NameError",
    ),
    Mutation(
        id="mm-arity",
        description="the pad dimension list is unpacked with the wrong arity",
        old=(
            '    pad_x, pad_y, pad_z = _mm(params, "padMm", [1200.0, 1200.0, 300.0], 3)'
        ),
        new=(
            '    pad_x, pad_y, pad_z = _mm(params, "padMm", [1200.0, 1200.0, 300.0], 2)'
        ),
        case_id="foundation.pads.1x1",
        expected="ValueError",
    ),
    Mutation(
        id="gap-key",
        description="the optional gap is read as a required key",
        old='    gap = float(params.get("gapMm", 600.0))',
        new='    gap = float(params["gapMm"])',
        case_id="foundation.pads.1x1",
        expected="KeyError",
    ),
    Mutation(
        id="api-typo",
        description="the document API call is misspelled",
        old='        obj = document.addObject("Part::Feature", f"Pad_{index}")',
        new='        obj = document.addobj("Part::Feature", f"Pad_{index}")',
        case_id="foundation.pads.1x1",
        expected="AttributeError",
    ),
    Mutation(
        id="fuse-to-cut",
        description="columns are cut out of the pad instead of fused onto it",
        old="            fused = fused.fuse(column_box)",
        new="            fused = fused.cut(column_box)",
        case_id="foundation.pads.1x1",
        expected="verification",
        expected_check="objects[Pad_1].volumeM3",
    ),
    Mutation(
        id="column-off-by-one",
        description="the column loop stops one column early",
        old="        for column in range(columns):",
        new="        for column in range(columns - 1):",
        case_id="foundation.pads.6x3",
        expected="verification",
        expected_check="totals.volumeM3",
    ),
    # --- the reviewed growth of 2026-10-20 (ADR-0017 amendment): five more exception
    # classes and five more measured checks, so the corpus is not only "four crashes and
    # two wrong volumes" any more.
    Mutation(
        id="float-arity",
        description="the dimension list is converted with a two-argument float() call",
        old="    values = [float(item) for item in raw]",
        new="    values = [float(item, 10) for item in raw]",
        case_id="foundation.pads.1x1",
        expected="TypeError",
    ),
    Mutation(
        id="param-index",
        description="the positivity check reads a dimension the list does not have",
        old="    if any(value <= 0 for value in values):",
        new="    if any(values[3] <= 0 for value in values):",
        case_id="foundation.pads.1x1",
        expected="IndexError",
    ),
    Mutation(
        id="volume-divide-zero",
        description="the volume summary divides by zero instead of by a cubic conversion",
        old='            "volumeM3": round(sum(shape.Volume for shape in shapes) / 1e9, 6),',
        new='            "volumeM3": round(sum(shape.Volume for shape in shapes) / 0, 6),',
        case_id="foundation.pads.1x1",
        expected="ZeroDivisionError",
    ),
    Mutation(
        id="document-guard-inverted",
        description="the active-document guard is inverted, so a real document is refused",
        old="    if document is None:",
        new="    if document is not None:",
        case_id="foundation.pads.1x1",
        expected="RuntimeError",
    ),
    Mutation(
        id="outdir-mkdir-exists",
        description="the output directory is created without exist_ok, so an existing one fails",
        old="        target.parent.mkdir(parents=True, exist_ok=True)",
        new="        target.parent.mkdir(parents=True, exist_ok=False)",
        case_id="foundation.pads.1x1",
        expected="FileExistsError",
    ),
    Mutation(
        id="no-pads",
        description="the pad loop never runs, so the document stays empty",
        old="    for index in range(pads):",
        new="    for index in range(pads - pads):",
        case_id="foundation.pads.1x1",
        expected="verification",
        expected_check="documentObjects",
    ),
    Mutation(
        id="column-unit-slip",
        description="the column dimensions are scaled from millimetres to metres",
        old='    col_x, col_y, col_z = _mm(params, "columnMm", [300.0, 300.0, 2700.0], 3)',
        new=(
            "    col_x, col_y, col_z = [value * 0.001 for value in _mm("
            'params, "columnMm", [300.0, 300.0, 2700.0], 3)]'
        ),
        case_id="foundation.pads.1x1",
        expected="verification",
        expected_check="objects[Pad_1].volumeM3",
    ),
    Mutation(
        id="outdir-env-typo",
        description="the summary is written to an output directory the harness never created",
        old='    out_dir = os.environ.get("ARCHRES_JOB_OUTDIR")',
        new='    out_dir = os.environ.get("ARCHRES_JOB_OUTDIR_MISSING")',
        case_id="foundation.pads.1x1",
        expected="verification",
        expected_check="artifacts[foundation-summary.json]",
    ),
    Mutation(
        id="pad-base-offset",
        description="the pad is placed on the ground plane instead of below it",
        old="        pad = Part.makeBox(pad_x, pad_y, pad_z, App.Vector(origin_x, 0.0, -pad_z))",
        new="        pad = Part.makeBox(pad_x, pad_y, pad_z, App.Vector(origin_x, 0.0, 0.0))",
        case_id="foundation.pads.1x1",
        expected="verification",
        expected_check="objects[Pad_1].bboxMm[2]",
    ),
    Mutation(
        id="pads-hard-coded",
        description="the pad count is hard-coded to one, whatever the case asks for",
        old='    pads = _count(params, "pads", 2)',
        new="    pads = 1",
        case_id="foundation.pads.6x3",
        expected="verification",
        expected_check="totals.objects",
    ),
)


def mutation_by_id(mutation_id: str) -> Mutation:
    for mutation in MUTATIONS:
        if mutation.id == mutation_id:
            return mutation
    raise RepairError(f"unknown mutation {mutation_id!r}")


def apply_mutation(source: str, mutation: Mutation) -> str:
    """Apply one exact replacement; a drifted source is an error, not a new bug."""
    count = source.count(mutation.old)
    if count != 1:
        raise RepairError(
            f"mutation {mutation.id!r} expected exactly one occurrence of {mutation.old!r}, "
            f"found {count} - the candidate changed; update the mutation deliberately"
        )
    return source.replace(mutation.old, mutation.new, 1)


def _limit(text: Any, size: int) -> str:
    value = str(text or "").strip("\r\n")
    return value if len(value) <= size else value[:size] + "…"


#: A machine path in an exception message ("... exists: 'C:\\Users\\someone\\out'") is a
#: portability leak, not repair signal: the record must mean the same thing on Kaggle. The
#: full message stays in the workdir as evidence; the record keeps the type and the sentence.
_PATH_RE = re.compile(
    r"(?P<quoted>'(?:[A-Za-z]:[\\/][^']*)'|\"(?:[A-Za-z]:[\\/][^\"]*)\")"
    r"|(?P<bare>(?:[A-Za-z]:[\\/]|/(?:home|Users|tmp|var|opt|root|mnt)/)[^\s'\",;()<>]*)"
)


def _redact_paths(text: str) -> str:
    """Replace machine paths with ``<path>`` so a record stays portable."""

    def replace(match: re.Match[str]) -> str:
        quoted = match.group("quoted")
        if quoted:
            return "'<path>'" if quoted.startswith("'") else '"<path>"'
        return "<path>"

    return _PATH_RE.sub(replace, text)


def _candidate_frames(result: dict[str, Any]) -> list[dict[str, Any]]:
    frames = [frame for frame in (result.get("frames") or []) if isinstance(frame, dict)]
    candidate = [frame for frame in frames if str(frame.get("file")) == CANDIDATE_NAME]
    return candidate or frames


def render_trace(failure: dict[str, Any]) -> str:
    """The short, deterministic trace a repair prompt shows (never the raw traceback)."""
    if failure.get("code") == "verification":
        check = failure.get("check") or "verification"
        return f"verification failed: {check}: {failure.get('message', '')}".strip()
    head = f"{failure.get('errorType') or 'Exception'}: {failure.get('message', '')}".strip()
    lines = [head]
    for frame in failure.get("frames") or []:
        lines.append(f"  at {frame.get('file')}:{frame.get('line')}")
        if frame.get("source"):
            lines.append(f"    {frame['source']}")
    return "\n".join(lines)


def normalize_failure(result: dict[str, Any], code: str | None) -> dict[str, Any]:
    """Turn a launcher result into the portable failure block a record carries."""
    if not result or code in (None, "timeout", "no_result"):
        raise RepairError(f"no candidate failure to normalise (code={code!r})")
    views = []
    for frame in _candidate_frames(result):
        views.append(
            {
                "file": str(frame.get("file")),
                "line": int(frame.get("line") or 0),
                "source": _limit(_redact_paths(str(frame.get("source") or "")), 200),
            }
        )
    deepest = views[-1] if views else {"line": 0, "source": ""}
    failure = {
        "code": str(code),
        "errorType": _limit(result.get("errorType") or "Exception", 80),
        "message": _limit(_redact_paths(str(result.get("message") or "")), 500),
        "line": deepest["line"],
        "sourceLine": deepest["source"],
        "frames": views,
    }
    failure["trace"] = render_trace(failure)
    return failure


def verification_failure(check: str, message: str) -> dict[str, Any]:
    """A measured rejection (the macro ran, built the wrong thing) as a failure block."""
    failure = {
        "code": "verification",
        "errorType": "verification",
        "message": _limit(_redact_paths(str(message or "")), 500),
        "check": check,
        "line": 0,
        "sourceLine": "",
        "frames": [],
    }
    failure["trace"] = render_trace(failure)
    return failure


def record_id(mutation: Mutation) -> str:
    slug = mutation.case_id.lower().replace(".", "-")
    return f"repair-{mutation.id}-{slug}"


def _body_expectations(expect: dict[str, Any]) -> dict[str, Any]:
    return json.loads(json.dumps(expect, sort_keys=True))


def build_repair_record(
    *,
    mutation: Mutation,
    broken_source: str,
    target_source: str,
    case_id: str,
    case_kind: str,
    params: dict[str, Any],
    expect: dict[str, Any],
    failure: dict[str, Any],
) -> dict[str, Any]:
    """Assemble one schema-shaped repair record (verification happens separately)."""
    if case_id != mutation.case_id:
        raise RepairError(f"{mutation.id}: record case {case_id!r} is not the mutation's case")
    if apply_mutation(target_source, mutation) != broken_source:
        raise RepairError(f"{mutation.id}: broken source is not the declared mutation of the target")
    if failure.get("code") == "verification":
        if failure.get("check") != mutation.expected_check:
            raise RepairError(
                f"{mutation.id}: verification check {failure.get('check')!r} "
                f"is not {mutation.expected_check!r}"
            )
        labels = {
            "caseId": case_id,
            "errorType": "verification",
            "failureCode": "verification",
            "check": str(failure["check"]),
        }
    else:
        if failure.get("errorType") != mutation.expected:
            raise RepairError(
                f"{mutation.id}: failure type {failure.get('errorType')!r} "
                f"is not {mutation.expected!r}"
            )
        labels = {
            "caseId": case_id,
            "errorType": str(mutation.expected),
            "failureCode": "engine_error",
        }
    return {
        "schemaVersion": REPAIR_SCHEMA_VERSION,
        "id": record_id(mutation),
        "kind": "repair",
        "task": "repair.fix",
        "lang": "code",
        "difficulty": "broken",
        "status": "verified",
        "messages": [
            {"role": "system", "content": REPAIR_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": render_repair_prompt(
                    case_id=case_id,
                    case_kind=case_kind,
                    params=params,
                    expect=expect,
                    failure=failure,
                    broken_source=broken_source,
                ),
            },
            {"role": "assistant", "content": target_source},
        ],
        "labels": labels,
        "input": {
            "generator": GENERATOR,
            "caseId": case_id,
            "caseKind": case_kind,
            "params": json.loads(json.dumps(params, sort_keys=True)),
            "expect": _body_expectations(expect),
            "code": broken_source,
            "failure": failure,
            "mutation": {"id": mutation.id, "description": mutation.description},
        },
        "source": {
            "kind": "scripted",
            "seed": REPAIR_SEED,
            "promptVersion": REPAIR_PROMPT_VERSION,
        },
        "verifyChecks": [
            "schema",
            "repair.case",
            "repair.mutation",
            "repair.trace",
            "repair.target",
        ],
    }


def render_repair_prompt(
    *,
    case_id: str,
    case_kind: str,
    params: dict[str, Any],
    expect: dict[str, Any],
    failure: dict[str, Any],
    broken_source: str,
) -> str:
    return "\n".join(
        [
            f"Case: {case_id} ({case_kind})",
            "Params: " + json.dumps(params, ensure_ascii=False, sort_keys=True),
            "Expected by the harness: " + json.dumps(expect, ensure_ascii=False, sort_keys=True),
            "",
            "Failure:",
            failure["trace"],
            "",
            "Broken macro:",
            broken_source.rstrip("\r\n"),
            "",
            "Return the complete corrected Python macro as plain code and nothing else.",
        ]
    )


def verify_repair_record(
    record: dict[str, Any],
    *,
    schema: dict[str, Any],
    target_source: str,
    cases: Iterable[dict[str, Any]],
) -> None:
    """Offline verification of one record; raises :class:`RepairError` on the first problem."""
    validate_record(record, schema)
    if record.get("kind") != "repair" or record.get("task") != "repair.fix":
        raise RepairError(f"{record.get('id')}: not a repair.fix record")
    if record.get("lang") != "code" or record.get("difficulty") != "broken":
        raise RepairError(f"{record.get('id')}: repair records must be lang=code, difficulty=broken")
    body = record.get("input") or {}
    mutation = mutation_by_id(str((body.get("mutation") or {}).get("id")))
    broken = str(body.get("code") or "")
    if apply_mutation(target_source, mutation) != broken:
        raise RepairError(f"{record['id']}: broken code is not the declared mutation")
    messages = record.get("messages") or []
    if len(messages) != 3 or [item.get("role") for item in messages] != [
        "system",
        "user",
        "assistant",
    ]:
        raise RepairError(f"{record['id']}: a repair record has exactly system/user/assistant")
    if messages[0].get("content") != REPAIR_SYSTEM_PROMPT:
        raise RepairError(f"{record['id']}: system prompt moved (version the record instead)")
    if messages[2].get("content") != target_source:
        raise RepairError(f"{record['id']}: the assistant target is not the known-good candidate")
    case = next((item for item in cases if item.get("id") == mutation.case_id), None)
    if case is None:
        raise RepairError(f"{record['id']}: case {mutation.case_id!r} is not in the case file")
    if (
        body.get("caseId") != mutation.case_id
        or body.get("caseKind") != case.get("kind")
        or body.get("params") != case.get("params")
        or body.get("expect") != case.get("expect")
    ):
        raise RepairError(f"{record['id']}: case facts in the record do not match the case file")
    failure = body.get("failure") or {}
    if failure.get("trace") != render_trace(failure):
        raise RepairError(f"{record['id']}: trace is not in canonical rendered form")
    if failure.get("code") == "verification":
        if failure.get("check") != mutation.expected_check:
            raise RepairError(f"{record['id']}: verification check moved")
    elif failure.get("errorType") != mutation.expected:
        raise RepairError(f"{record['id']}: exception type is not the mutation's expected one")
    if record.get("labels") != _expected_labels(mutation, failure):
        raise RepairError(f"{record['id']}: labels do not mirror the failure block")
    _reject_machine_paths(record)


def _expected_labels(mutation: Mutation, failure: dict[str, Any]) -> dict[str, Any]:
    if failure.get("code") == "verification":
        return {
            "caseId": mutation.case_id,
            "errorType": "verification",
            "failureCode": "verification",
            "check": str(failure.get("check")),
        }
    return {
        "caseId": mutation.case_id,
        "errorType": str(mutation.expected),
        "failureCode": "engine_error",
    }


def _reject_machine_paths(record: dict[str, Any]) -> None:
    pattern = re.compile(r"(?:^|[\s\"'(])(?:[A-Za-z]:[\\/]|/(?:home|Users|tmp)/)")
    for text in _strings(record):
        if pattern.search(text):
            raise RepairError(f"{record.get('id')}: record leaks a machine path: {text[:80]!r}")


def _strings(value: Any):
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for item in value.values():
            yield from _strings(item)
    elif isinstance(value, list):
        for item in value:
            yield from _strings(item)
