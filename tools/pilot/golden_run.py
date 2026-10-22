"""The golden full run (W6.1): the app's whole flow, through the channel the app speaks.

The plan's W6.1 is the **golden full run** ✓ and the engineer's sign-off ✓ — and the
sign-off is a human act ✓ (OWNER-ATTENTION #9 ✓ ✓). The **run** is the repo's ✓ ✓.

And the run goes through the **bridge** ✓ — the same channel the desktop shell speaks ✓ ✓
— because a golden run that took a different path ✓ than the product takes ✓ would prove
nothing about the product ✓ ✓ ✓.

So this script:

1. creates the project ✓ (the bridge's `project.create` ✓ — from the template ✓, the way
   the app does it ✓ ✓);
2. asks the interview the golden questions ✓ (the bridge's `session.respond` ✓ and
   `session.use_default` ✓) ✓;
3. designs it ✓ (the bridge's `design.run` ✓);
4. prices it ✓ (the bridge's `boq.build` ✓);
5. hands it over ✓ (the bridge's `bundle.export` ✓);

and it **checks** the result ✓ ✓ — five checks, each a law and not a formality ✓ ✓:

- **the interview lands on the golden project** ✓ — the facts the interview owns are the
  golden example's ✓ ✓ (a run that answered differently is a different project ✓ and the
  run says so ✓ ✓);
- **the design carries its assumptions** ✓ — every assumption is visible ✓, and the ones
  that must be checked on site ✓ say so ✓ ✓;
- **the money adds up** ✓ — every priced line is quantity × rate ✓, the subtotals add to
  the total ✓, and the **unpriced lines are named** ✓ (never silently dropped ✓ ✓);
- **the card says what it is** ✓ — the card's status travels with the money ✓ ✓;
- **the handover is written** ✓ — the bundle is on disk ✓ and its files are in it ✓ ✓.

Usage (from the repo root):
  uv run --directory core python ../tools/pilot/golden_run.py
  uv run --directory core python ../tools/pilot/golden_run.py --record data/golden/golden-run.json
"""

from __future__ import annotations

import argparse
import json
import pathlib
import sys
import tempfile

from archres_core.bridge import Bridge
from archres_core.stdio import utf8_stdio

ROOT = pathlib.Path(__file__).resolve().parents[2]
ANSWERS = ROOT / "tools" / "pilot" / "golden-answers.json"
GOLDEN_PROJECT = ROOT / "spec" / "examples" / "two-storey-residential.json"

#: The facts the interview owns ✓ — and the golden example's own values ✓ ✓. The run
#: checks them one by one ✓, because a run that answered differently is a different
#: project ✓ and the difference must be **visible** ✓ ✓.
GOLDEN_FACTS = (
    ("/site/plot/areaSqm", 133.78),
    ("/site/plot/frontageM", 10.0),
    ("/site/plot/roadWidthM", 9.0),
    ("/site/plot/cornerPlot", True),
    ("/site/plot/existingStructure", False),
    ("/building/storeys/count", 2),
    ("/building/unitsPerFloor", 2),
    ("/building/groundFloorUsage", "parking"),
    ("/building/typicalUnitAreaSqm", 60.0),
    ("/building/storeys/groundFloorHeightM", 3.2),
    ("/building/storeys/typicalFloorHeightM", 3.0),
)


def _at(spec: dict, pointer: str):
    """The value at a JSON pointer ✓ — ``None`` when the path is not there ✓ ✓."""
    node = spec
    for part in pointer.strip("/").split("/"):
        if not isinstance(node, dict) or part not in node:
            return None
        node = node[part]
    return node


def _call(bridge: Bridge, method: str, params: dict, step: str) -> dict:
    """One call to the core ✓ — and an error is an error ✓ ✓, not a warning ✓ ✓."""
    reply = bridge.handle({"id": step, "method": method, "params": params})
    if "error" in reply:
        raise SystemExit(f"  {step} failed: {reply['error']['message']}")
    return reply["result"]


def _answers() -> dict:
    """The golden answers ✓ — the ``$``-prefixed notes are not answers ✓ ✓."""
    raw = json.loads(ANSWERS.read_text(encoding="utf-8"))
    return {key: value for key, value in raw.items() if not key.startswith("$")}


def _interview(bridge: Bridge, session_id: str, prompt: dict, answers: dict) -> dict:
    """Ask every question the flow book has ✓ ✓.

    The golden answers are used where they are there ✓; the rest take their **authored
    default** ✓ ✓ — and the run says how many that was ✓, because a default nobody
    counted is a default nobody checked ✓ ✓ ✓.
    """
    asked = 0
    defaulted = 0
    asked_ids: list[str] = []
    while not prompt.get("done") and asked < 200:
        question = prompt["questionId"]
        storey = prompt.get("storeyIndex")
        key = f"{question}@{storey}" if storey is not None else question
        answer = answers.get(key, answers.get(question))
        if answer is None:
            state = _call(
                bridge, "session.use_default", {"sessionId": session_id}, "session.use_default"
            )
            defaulted += 1
        elif isinstance(answer, dict) and "choice" in answer:
            state = _call(
                bridge,
                "session.respond",
                {"sessionId": session_id, "choice": str(answer["choice"])},
                "session.respond",
            )
        else:
            state = _call(
                bridge,
                "session.respond",
                {"sessionId": session_id, "text": str(answer)},
                "session.respond",
            )
        asked += 1
        asked_ids.append(question)
        prompt = state.get("prompt") or {}
    return {"asked": asked, "defaulted": defaulted, "questions": asked_ids, "prompt": prompt}


def _check_golden_facts(spec: dict) -> tuple[bool, list[str]]:
    """The interview landed on the golden project ✓ — the facts are the golden ones ✓ ✓."""
    problems: list[str] = []
    for pointer, expected in GOLDEN_FACTS:
        actual = _at(spec, pointer)
        if isinstance(expected, float) and isinstance(actual, (int, float)):
            same = abs(float(actual) - expected) < 0.01
        else:
            same = actual == expected
        if not same:
            problems.append(f"{pointer}: the run has {actual!r}, the golden has {expected!r}")
    return (not problems), problems


def _check_assumptions(assumptions: list) -> tuple[bool, list[str]]:
    """Every assumption is visible ✓ — and the ones to check on site say so ✓ ✓."""
    problems: list[str] = []
    for item in assumptions:
        if not item.get("statement"):
            problems.append(f"{item.get('id')}: the assumption has no statement")
        if not item.get("verifyOnSite"):
            problems.append(f"{item.get('id')}: the assumption does not say to verify it")
    return (not problems), problems


def _check_money(boq: dict) -> tuple[bool, list[str]]:
    """The money adds up ✓ ✓ — every line, every subtotal, every total ✓ ✓."""
    problems: list[str] = []
    for line in boq.get("lines") or []:
        if not line.get("priced"):
            continue
        quantity = float(line.get("quantity") or 0.0)
        rate = float(line.get("rateBdt") or 0.0)
        amount = float(line.get("amountBdt") or 0.0)
        if abs(quantity * rate - amount) > 0.011:
            problems.append(
                f"{line.get('key')}: {quantity} x {rate} is {quantity * rate:.2f}, not {amount:.2f}"
            )
    totals = boq.get("totals") or {}
    total = float(totals.get("amountBdt") or 0.0)
    by_phase = (boq.get("subtotals") or {}).get("byPhase") or {}
    if abs(sum(float(value) for value in by_phase.values()) - total) > 0.02:
        problems.append(
            f"the phases add to {sum(float(v) for v in by_phase.values()):.2f}, "
            f"the total says {total:.2f}"
        )
    unpriced = totals.get("unpricedLines") or []
    named = {line.get("key") for line in boq.get("lines") or [] if not line.get("priced")}
    if set(unpriced) != named:
        problems.append(f"the unpriced lines are named {unpriced}, the lines say {sorted(named)}")
    return (not problems), problems


def run(root: pathlib.Path, name: str) -> dict:
    """The golden run ✓ — every step through the channel ✓ ✓."""
    bridge = Bridge(root=ROOT)
    answers = _answers()
    projects = root / "projects"
    projects.mkdir(parents=True, exist_ok=True)

    print("1. the project")
    created = _call(
        bridge,
        "project.create",
        {
            "name": name,
            "template": "new-project",
            "lang": "en",
            "projects": str(projects),
        },
        "project.create",
    )
    session_id = created["sessionId"]
    project_path = created["path"]
    print(f"   {created['name']} at {project_path}")

    print("2. the interview")
    walked = _interview(bridge, session_id, created["prompt"], answers)
    print(f"   {walked['asked']} question(s), {walked['defaulted']} on their default")
    finished = _call(bridge, "session.finish", {"sessionId": session_id}, "session.finish")
    print(f"   the interview is closed ({finished['turnCount']} fallback turn(s))")

    from archres_core.spec import SpecStore

    store = SpecStore(project_path)
    spec = store.load(store.tip().sha256)

    print("3. the design")
    design = _call(bridge, "design.run", {"project": project_path}, "design.run")
    print(
        f"   {design['projectName']}: {design['storeys']} storey(s), "
        f"{design['counts']['typicalFloors']} typical floor(s), "
        f"{design['counts']['stages']} stage(s)"
    )

    print("4. the money")
    boq_result = _call(bridge, "boq.build", {"project": project_path}, "boq.build")
    boq = boq_result["boq"]
    priced_from = boq_result["pricedFrom"]
    print(
        f"   {len(boq['lines'])} line(s), {boq['totals']['amountBdt']} BDT, "
        f"priced from {priced_from['cardId']} ({priced_from['status']})"
    )

    print("5. the handover")
    bundle = _call(
        bridge,
        "bundle.export",
        {"project": project_path, "target": str(root / "handover" / "engineer.bundle.zip")},
        "bundle.export",
    )
    print(f"   the bundle: {bundle['target']}")

    print("6. the checks")
    checks: dict[str, dict] = {}

    def record(name: str, ok: bool, problems: list[str]) -> None:
        checks[name] = {"ok": ok, "problems": problems}
        print(f"   {'ok  ' if ok else 'FAIL'} {name}")

    facts_ok, problems = _check_golden_facts(spec)
    record("the interview lands on the golden project", facts_ok, problems)

    assumptions_ok, problems = _check_assumptions(design["assumptions"])
    record("the design carries its assumptions", assumptions_ok, problems)

    money_ok, problems = _check_money(boq)
    record("the money adds up", money_ok, problems)

    card_ok = bool(priced_from.get("status"))
    record(
        "the card says what it is",
        card_ok,
        [] if card_ok else ["the card's status did not travel with the money"],
    )

    target = pathlib.Path(bundle["target"])
    manifest = bundle["manifest"]
    bundle_ok = target.is_file() and target.stat().st_size > 0
    if bundle_ok:
        from archres_core.bundle import read_bundle

        read = read_bundle(target)
        bundle_ok = bool(read.files)
    record(
        "the handover is written",
        bundle_ok,
        [] if bundle_ok else ["the bundle is not on disk, or it holds nothing"],
    )

    failed = [name for name, item in checks.items() if not item["ok"]]
    if failed:
        for name in failed:
            for problem in checks[name]["problems"]:
                print(f"   - {name}: {problem}")
        raise SystemExit("the golden run failed its checks")

    return {
        "project": {
            "name": design["projectName"],
            "id": design["projectId"],
            "storeys": design["storeys"],
            "revisions": manifest["revisionCount"],
        },
        "interview": {
            "questions": walked["asked"],
            "defaulted": walked["defaulted"],
        },
        "design": {
            "counts": design["counts"],
            "assumptions": [item["id"] for item in design["assumptions"]],
        },
        "boq": {
            "lines": len(boq["lines"]),
            "totals": boq["totals"],
            "pricedFrom": priced_from,
        },
        "bundle": {
            "files": len(manifest["files"]),
            "specSha256": manifest["specSha256"],
        },
        "checks": {name: item["ok"] for name, item in checks.items()},
    }


def main(argv: list[str] | None = None) -> int:
    utf8_stdio()
    parser = argparse.ArgumentParser(
        description="The golden full run: the app's whole flow, through the shell's channel."
    )
    parser.add_argument(
        "--root",
        help="where the run works (default: a temporary folder that is thrown away)",
    )
    parser.add_argument("--name", default="Mirpur Golden House")
    parser.add_argument("--record", help="where to write the run's record")
    args = parser.parse_args(argv)

    temporary = None
    if args.root:
        root = pathlib.Path(args.root)
        root.mkdir(parents=True, exist_ok=True)
    else:
        temporary = tempfile.TemporaryDirectory(prefix="archres-golden-")
        root = pathlib.Path(temporary.name)
    try:
        summary = run(root, args.name)
    finally:
        if temporary is not None:
            temporary.cleanup()

    if args.record:
        target = pathlib.Path(args.record)
        if not target.is_absolute():
            # the repo's own root ✓ - the tool is run from anywhere ✓ ✓
            target = ROOT / target
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(
            json.dumps(summary, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
            newline="\n",
        )
        print(f"the record is in {target}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
