"""PRE-W1.2 DEMO: evaluate the test vectors embedded in a rule pack.

Proves the pack is machine-consumable end-to-end before the real rules engine (W1.2)
exists. Frozen semantics (mirrored by core/tests/test_rajuk_pack.py):
  far      exact roadWidthM row + area band (areaSqmFrom < a <= areaSqmTo; missing = 0 / open);
           prohibited rows match by area only; 'NR' = no cap
  setback  area-band row; heightM > heightApplicabilityM or storeys > heightApplicabilityStoreys
           -> beyondHeight
  parking  max(minSpaces or 0, ceil(units * numerator / denominator))

Usage (from the repo root):
  uv run --directory core python ../tools/rules/eval_spec.py [spec/rules/rajuk-2008.yaml]

Exit 0 = every vector passes; 1 = at least one mismatch (details printed).
Label: pre-W1.2 demo - the W1.2 rule engine replaces this evaluator; the semantics stay.
"""

import io
import math
import pathlib
import sys
from fractions import Fraction

import yaml

ROOT = pathlib.Path(__file__).resolve().parents[2]


def band(area, row):
    lo = row.get("areaSqmFrom", 0)
    hi = row.get("areaSqmTo")
    return area > lo if hi is None else lo < area <= hi


def eval_far(pack, g):
    rows = next(t for t in pack["farTables"] if t["classId"] == g["classId"])["rows"]
    for r in rows:
        if r.get("prohibited") and band(g["areaSqm"], r):
            return {"prohibited": True}
    for r in rows:
        if r.get("anyPlot") and r["roadWidthM"] == g["roadWidthM"]:
            return {"far": r["far"], "mgcPercent": r["mgcPercent"], "footnotes": r.get("footnotes", [])}
    for r in rows:
        if not r.get("prohibited") and not r.get("anyPlot") and r["roadWidthM"] == g["roadWidthM"] and band(g["areaSqm"], r):
            return {"far": r["far"], "mgcPercent": r["mgcPercent"], "footnotes": r.get("footnotes", [])}
    raise LookupError("no FAR row")


def eval_setback(pack, g):
    st = pack["setbackTable"]
    if (g.get("heightM") or 0) > st["heightApplicabilityM"] or (g.get("storeys") or 0) > st["heightApplicabilityStoreys"]:
        b = st["beyondHeight"]
        return {"frontM": b["frontM"], "rearM": b["rearM"], "sideM": b["sideM"]}
    for r in st["rows"]:
        if band(g["areaSqm"], r):
            return {"frontM": r["frontM"], "rearM": r["rearM"], "sideM": r["sideM"]}
    raise LookupError("no setback row")


def eval_parking(pack, g):
    row = next(r for r in pack["parkingSchedule"]["rows"] if r["id"] == g["rowId"])
    n = g.get("units", 1)
    q = Fraction(n * row["spaces"]["numerator"], row["spaces"]["denominator"])
    return {"spaces": max(row.get("minSpaces", 0), math.ceil(q))}


EVAL = {"far": eval_far, "setback": eval_setback, "parking": eval_parking}


def main():
    path = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "spec" / "rules" / "rajuk-2008.yaml"
    pack = yaml.safe_load(io.open(path, encoding="utf-8"))
    fails = 0
    for v in pack["testVectors"]:
        got = EVAL[v["kind"]](pack, v["given"])
        for key, want in v["expect"].items():
            have = got.get(key)
            ok = sorted(have or []) == sorted(want) if key == "footnotes" else have == want
            if not ok:
                fails += 1
                print(f"FAIL {v['id']}: {key} got {have!r}, want {want!r}")
    total = len(pack["testVectors"])
    print(f"{pack['id']} [{pack['status']}]: {total - fails}/{total} vectors pass")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
