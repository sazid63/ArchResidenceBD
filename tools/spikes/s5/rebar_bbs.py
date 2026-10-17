"""S5 spike - scripted reinforcement design + bar bending schedule, headless.

Builds a small frame fragment with the FreeCAD-Reinforcement addon:
  C1  column 300x300x2700    - two-ties-six-rebars preset
  B1  beam 3000x300x450      - two-legged beam preset (stirrups + top/bottom/left/right)
  F1  footing 1500x1500x500  - footing preset (parallel/cross mesh + column start bars)
Then: inventory -> unique Marks -> addon Bar Bending Schedule (SVG) -> plain-Python
cross-checks (lengths, weights) -> run.json.

Run:
  & 'C:\\1_SAJID\\CE tools\\FreeCAD\\bin\\freecadcmd.exe' tools\\spikes\\s5\\rebar_bbs.py
Outputs: data/downloads/s5/ (frame.FCStd, bbs.svg, run.json; gitignored).
Ends with S5_SPIKE_OK (or S5_SPIKE_PARTIAL + error details).

NOTE: freecadcmd runs this file with __name__ == "rebar_bbs" (file stem), not
"__main__" - so no main-guard; everything runs at top level (S4 gotcha).
"""

import json
import math
import os
import subprocess
import sys
import time
import traceback
import types
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
ADDON = ROOT / "data" / "spikes" / "s5" / "FreeCAD-Reinforcement"
OUT = ROOT / "data" / "downloads" / "s5"
OUT.mkdir(parents=True, exist_ok=True)

if str(ADDON) not in sys.path:
    sys.path.insert(0, str(ADDON))

# freecadcmd quirk (S5 gotcha): FootingReinforcementObject imports `todo` from DraftGui,
# but DraftGui builds a real Qt toolbar at module level (FreeCADGui.UiLoader does not
# exist in console mode) -> import crash. `todo.delay()` is GUI undo bookkeeping only,
# so a stub module is safe for headless runs.
if "DraftGui" not in sys.modules:
    _draftgui = types.ModuleType("DraftGui")

    class _TodoStub:
        def __getattr__(self, name):
            return lambda *a, **k: None

    _draftgui.todo = _TodoStub()
    sys.modules["DraftGui"] = _draftgui

import FreeCAD as App  # noqa: E402
import Part  # noqa: E402, F401

from ColumnReinforcement.TwoTiesSixRebars import makeTwoTiesSixRebars  # noqa: E402
from BeamReinforcement.TwoLeggedBeam import makeReinforcement as makeBeamReinforcement  # noqa: E402
from FootingReinforcement.FootingReinforcement import makeFootingReinforcement  # noqa: E402
from BarBendingSchedule.BBSfunc import getBarBendingSchedule  # noqa: E402

# Headless safety (S5 gotcha): the addon's showWarning() pops a modal Qt QMessageBox,
# which aborts freecadcmd ("Must construct a QApplication before a QWidget"). Replace
# the class once, centrally - every addon module references the same QtGui module.
try:
    from PySide import QtGui

    class _ConsoleMessageBox:
        Warning = 2
        Ok = 1

        def __init__(self, *a, **k):
            self._text = ""

        def setIcon(self, *a):
            pass

        def setText(self, text):
            self._text = str(text)
            print(f"[addon warning] {text}", flush=True)

        def setStandardButtons(self, *a):
            pass

        def setWindowTitle(self, *a):
            pass

        def exec_(self):
            return 1

        exec = exec_

    QtGui.QMessageBox = _ConsoleMessageBox
except Exception as _exc:  # noqa: BLE001
    print(f"QtGui QMessageBox patch skipped: {_exc}", flush=True)

RUN = {"engine": ".".join(App.Version()[:3]), "errors": {}, "elements": {}, "rebars": [],
       "steel": {}, "bbs": {}, "checks": {}}
T0 = time.perf_counter()


def say(msg):
    print(msg, flush=True)


def box(name, lx, ly, lz, pos=(0.0, 0.0, 0.0)):
    o = doc.addObject("Part::Box", name)
    o.Length, o.Width, o.Height = lx, ly, lz
    o.Placement.Base = App.Vector(*pos)
    return o


def face_by_normal(obj, vec):
    """Pick the face whose normal matches `vec` (the addon face convention).

    The Reinforcement addon builds every rebar set relative to the SELECTED
    face: rings/bars are drawn in the face plane, and the distribution runs
    along the face normal (amount = structure extent projected on the normal).
    So a member's CROSS-SECTION face must be selected:
      column  -> bottom/top face (normal along Z)
      beam    -> an end face      (normal along its length)
      footing -> a side face      (function search needs a horizontal normal)
    All auxiliary faces are resolved by the addon itself (getFacename[s]for*).
    """
    v = App.Vector(*vec)
    faces = obj.Shape.Faces
    best = None
    for i, f in enumerate(faces):
        n = f.normalAt(0.5, 0.5)
        if n.dot(v) > 0.9 and (best is None or f.Area > faces[best].Area):
            best = i
    if best is None:
        raise RuntimeError(f"no face with normal {vec}")
    return best + 1, faces[best].Area


def host_of(o):
    """Walk Base/Support links until we find the host structural element."""
    obj = o
    for _ in range(8):
        for attr in ("Support", "AttachmentSupport"):
            sup = getattr(obj, attr, None)
            try:
                if sup:
                    return str(sup[0][0].Label)
            except Exception:  # noqa: BLE001
                pass
        base = getattr(obj, "Base", None)
        if base is None:
            break
        obj = base
    return ""


def rinfo(o):
    d = {"name": o.Name, "label": o.Label, "type": o.TypeId, "host": host_of(o)}
    dia = getattr(o, "Diameter", None)
    if dia is not None:
        d["diameter_mm"] = round(float(dia), 2)
    mark = getattr(o, "Mark", None)
    d["mark"] = str(mark) if mark is not None else ""
    if hasattr(o, "RebarDistribution"):
        try:
            dist = o.RebarDistribution
            if dist:
                d["distribution"] = {}
                for p in ("Number", "Amount", "Spacing", "SpacingList", "CustomSpacing",
                          "OffsetStart", "OffsetEnd", "Label"):
                    if hasattr(dist, p):
                        d["distribution"][p] = str(getattr(dist, p))
        except Exception as exc:  # noqa: BLE001
            d["distribution"] = f"err: {exc}"
    sh = getattr(o, "Shape", None)
    if sh is not None and sh.Edges:
        d["edges"] = len(sh.Edges)
        d["wires"] = len(sh.Wires)
        d["edges_len_mm"] = round(sum(e.Length for e in sh.Edges), 1)
        d["volume_mm3"] = round(sh.Volume, 1)
        if d.get("diameter_mm"):
            area = math.pi / 4.0 * d["diameter_mm"] ** 2
            # rebar Shapes are swept solids: volume/area = total bar length (all
            # instances of a distributed set) - robust, unlike edge sums (S5 gotcha)
            d["implied_len_mm"] = round(sh.Volume / area, 1)
        bb = sh.BoundBox
        d["bbox"] = [round(v, 1) for v in (bb.XMin, bb.YMin, bb.ZMin,
                                           bb.XMax, bb.YMax, bb.ZMax)]
    return d


def steel_kg(diameter_mm, length_mm):
    area = math.pi / 4.0 * diameter_mm * diameter_mm  # mm^2
    return area * length_mm * 7.85e-6  # 7850 kg/m^3 -> kg


say(f"engine {RUN['engine']} - S5 reinforcement scripting spike")
say(f"addon  {ADDON}")

try:
    RUN["addon_commit"] = subprocess.run(
        ["git", "-C", str(ADDON), "rev-parse", "--short", "HEAD"],
        capture_output=True, text=True, timeout=30).stdout.strip()
except Exception:  # noqa: BLE001
    RUN["addon_commit"] = "unknown"

doc = App.newDocument("S5_Frame")
App.setActiveDocument(doc.Name)

# ---------------------------------------------------------------- C1 column
say("\n[1] C1 column 300x300x2700 - two ties + six main bars")
try:
    col = box("C1", 300, 300, 2700)
    doc.recompute()
    face_no, area = face_by_normal(col, (0, 0, -1))  # cross-section (bottom)
    say(f"    base face: Face{face_no} (area {area:.0f} mm2)")
    t0 = time.perf_counter()
    col_reinf = makeTwoTiesSixRebars(
        40.0, 40.0, 40.0, 40.0,        # covers: l, r, t, b of ties
        50.0,                          # offset of ties from the face start
        135, 4,                        # bent angle, extension factor (INT props!)
        8.0,                           # diameter of ties
        False, 150.0,                  # spacing mode, 150 mm
        16.0,                          # diameter of main rebars
        0.0, 0.0,                      # t/b offsets of main rebars
        "StraightRebar", "Top Inside", "x-axis",
        None, None,                    # l_rebar_rounding, hook_extension
        ("Tie1", "Tie2"),
        col, f"Face{face_no}")
    doc.recompute()
    RUN["elements"]["C1"] = {"kind": "column", "ms": round((time.perf_counter() - t0) * 1000, 1),
                             "returned": col_reinf.Name if col_reinf else None}
    say(f"    created in {RUN['elements']['C1']['ms']} ms -> {col_reinf.Name if col_reinf else None}")
except Exception:  # noqa: BLE001
    RUN["errors"]["C1"] = traceback.format_exc()
    say("    C1 FAILED:\n" + RUN["errors"]["C1"])

# ---------------------------------------------------------------- B1 beam
say("\n[2] B1 beam 3000x300x450 - two-legged stirrups + bars")
try:
    beam = box("B1", 3000, 300, 450, pos=(0.0, -600.0, 2250.0))
    doc.recompute()
    face_no, area = face_by_normal(beam, (-1, 0, 0))  # cross-section (x=0 end)
    say(f"    base face: Face{face_no} (area {area:.0f} mm2)")
    t0 = time.perf_counter()
    beam_reinf = makeBeamReinforcement(
        25.0, 25.0, 25.0, 25.0,        # covers of stirrup: l, r, t, b
        50.0,                          # offset of stirrups
        135, 4,                        # bent angle, extension factor (INT props!)
        8.0,                           # stirrup diameter
        False, 150.0,                  # spacing mode, 150 mm
        ("2#16@0",), "StraightRebar", 40.0,     # top: 1 layer, 2 bars d16
        ("2#16@0",), "StraightRebar", 40.0,     # bottom: 1 layer, 2 bars d16
        "2#12@0", "StraightRebar", 100.0,       # left skin: 2 bars d12, 100 apart
        "2#12@0", "StraightRebar", 100.0,       # right skin
        structure=beam, facename=f"Face{face_no}")
    doc.recompute()
    RUN["elements"]["B1"] = {"kind": "beam", "ms": round((time.perf_counter() - t0) * 1000, 1),
                             "returned": beam_reinf.Name if beam_reinf else None}
    say(f"    created in {RUN['elements']['B1']['ms']} ms -> {beam_reinf.Name if beam_reinf else None}")
except Exception:  # noqa: BLE001
    RUN["errors"]["B1"] = traceback.format_exc()
    say("    B1 FAILED:\n" + RUN["errors"]["B1"])

# ---------------------------------------------------------------- F1 footing
say("\n[3] F1 footing 1500x1500x500 - mesh + column start bars")
try:
    foot = box("F1", 1500, 1500, 500)
    doc.recompute()
    face_no, area = face_by_normal(foot, (0, 1, 0))  # side face (mesh runs on normal)
    say(f"    base face: Face{face_no} (area {area:.0f} mm2, +Y side)")
    t0 = time.perf_counter()
    foot_reinf = makeFootingReinforcement(
        parallel_rebar_type="StraightRebar",
        parallel_front_cover=40.0, parallel_rear_cover=40.0,
        parallel_left_cover=50.0, parallel_right_cover=50.0,
        parallel_top_cover=40.0, parallel_bottom_cover=40.0,
        parallel_diameter=12.0, parallel_amount_spacing_check=False,
        parallel_amount_spacing_value=150.0,
        cross_rebar_type="StraightRebar",
        cross_front_cover=40.0, cross_rear_cover=40.0,
        cross_left_cover=50.0, cross_right_cover=50.0,
        cross_top_cover=40.0, cross_bottom_cover=40.0,
        cross_diameter=12.0, cross_amount_spacing_check=False,
        column_front_spacing=0.0, column_left_spacing=0.0,
        column_right_spacing=0.0, column_rear_spacing=0.0,
        tie_top_cover=40.0, tie_bottom_cover=40.0,
        tie_bent_angle=135, tie_extension_factor=4,
        tie_diameter=8.0, tie_number_spacing_check=False,
        tie_number_spacing_value=150.0,
        column_main_rebar_diameter=16.0, column_main_rebars_t_offset=0.0,
        cross_amount_spacing_value=150.0,
        column_width=300.0, column_length=300.0,
        structure=foot, facename=f"Face{face_no}")
    doc.recompute()
    RUN["elements"]["F1"] = {"kind": "footing", "ms": round((time.perf_counter() - t0) * 1000, 1),
                             "returned": foot_reinf.Name if foot_reinf else None}
    say(f"    created in {RUN['elements']['F1']['ms']} ms -> {foot_reinf.Name if foot_reinf else None}")
except Exception:  # noqa: BLE001
    RUN["errors"]["F1"] = traceback.format_exc()
    say("    F1 FAILED:\n" + RUN["errors"]["F1"])

# ---------------------------------------------------------------- inventory
say("\n[4] inventory (objects with Diameter + Shape)")
rebars = []
for o in doc.Objects:
    if hasattr(o, "Diameter") and getattr(o, "Shape", None) is not None and o.Shape.Edges:
        rebars.append(o)
for o in rebars:
    info = rinfo(o)
    RUN["rebars"].append(info)
    say(f"    {info['name']:<14} {info.get('host', '?'):<3} "
        f"{info.get('diameter_mm', '?'):>5} mm  "
        f"vol={info.get('volume_mm3', 0):>12,.1f} mm3  "
        f"L={info.get('implied_len_mm', 0):>10,.1f} mm  "
        f"mark={info.get('mark', '')!r}")

say("\n[5] unique Marks (group = host element + diameter + implied length)")
marks = {}
for o, info in zip(rebars, RUN["rebars"]):
    key = (info.get("host") or "?", info.get("diameter_mm", 0.0),
           round(info.get("implied_len_mm", 0.0), -1))
    if key not in marks:
        marks[key] = f"{key[0]}-D{int(key[1])}-P{len(marks) + 1}"
    o.Mark = marks[key]
for key in sorted(marks.keys(), key=lambda k: marks[k]):
    say(f"    {marks[key]:<12} host={key[0]}  d={key[1]} mm  implied_len={key[2]:.0f} mm")

# ---------------------------------------------------------------- steel math
say("\n[6] steel cross-check (volume-based: swept-solid shapes / section area)")
by_dia = {}
total_len = 0.0
total_kg = 0.0
for r in RUN["rebars"]:
    d = r.get("diameter_mm", 0.0)
    L = r.get("implied_len_mm", 0.0)
    kg = r.get("volume_mm3", 0.0) * 7.85e-6  # 7850 kg/m3
    if d <= 0:
        continue
    by_dia.setdefault(d, {"len_mm": 0.0, "kg": 0.0, "objects": 0})
    by_dia[d]["len_mm"] += L
    by_dia[d]["kg"] += kg
    by_dia[d]["objects"] += 1
    total_len += L
    total_kg += kg
for d in sorted(by_dia):
    v = by_dia[d]
    say(f"    d{d:>4} mm: {v['objects']:>2} objects, total {v['len_mm']:>9.1f} mm = {v['kg']:>7.2f} kg")
say(f"    TOTAL: {total_len:.1f} mm of bar = {total_kg:.2f} kg")
RUN["steel"] = {"by_diameter": {str(k): v for k, v in by_dia.items()},
                "total_len_mm": round(total_len, 1), "total_kg": round(total_kg, 2)}

# ---------------------------------------------------------------- BBS
say("\n[7] bar bending schedule (addon SVG generator)")
try:
    t0 = time.perf_counter()
    svg = getBarBendingSchedule(rebar_objects=rebars, output_file=str(OUT / "bbs.svg"))
    RUN["bbs"]["ms"] = round((time.perf_counter() - t0) * 1000, 1)
    RUN["bbs"]["file"] = str(OUT / "bbs.svg")
    RUN["bbs"]["bytes"] = (OUT / "bbs.svg").stat().st_size if (OUT / "bbs.svg").exists() else 0
    RUN["bbs"]["root_ok"] = svg is not None
    bbs_text = ""
    if (OUT / "bbs.svg").exists():
        bbs_text = (OUT / "bbs.svg").read_text(encoding="utf-8", errors="replace")
    RUN["bbs"]["marks_in_svg"] = {m: (m in bbs_text) for m in sorted(set(marks.values()))}
    say(f"    bbs.svg {RUN['bbs']['bytes']} bytes in {RUN['bbs']['ms']} ms")
    say(f"    marks present: {RUN['bbs'].get('marks_in_svg')}")
except Exception:  # noqa: BLE001
    RUN["errors"]["BBS"] = traceback.format_exc()
    say("    BBS FAILED:\n" + RUN["errors"]["BBS"])

# ---------------------------------------------------------------- checks
say("\n[8] deterministic checks")
checks = RUN["checks"]
checks["rebars_count"] = len(rebars)
checks["rebars_count_ok"] = len(rebars) >= 10
checks["steel_weight_kg"] = round(total_kg, 2)
checks["steel_weight_range_ok"] = 40.0 <= total_kg <= 400.0


def implied_total(host, dia):
    area = math.pi / 4.0 * dia * dia
    return round(sum(r.get("volume_mm3", 0.0) for r in RUN["rebars"]
                     if r.get("host") == host and r.get("diameter_mm") == dia) / area, 1)


c16 = implied_total("C1", 16.0)      # 6 bars, each ~2700 - covers ~= 2604 mm
c8 = implied_total("C1", 8.0)        # 2 tie sets x ~17 ties x ~1030 mm
b16 = implied_total("B1", 16.0)      # 4 bars x ~2942 mm
b8 = implied_total("B1", 8.0)        # ~19 stirrups x ~1400 mm
f12 = implied_total("F1", 12.0)      # parallel + cross mesh over 1500x1500 @150
checks["C1_main16_total_mm"] = c16
checks["C1_main16_ok"] = 14000 <= c16 <= 17000
checks["C1_ties8_total_mm"] = c8
checks["C1_ties8_ok"] = 25000 <= c8 <= 42000
checks["B1_main16_total_mm"] = b16
checks["B1_main16_ok"] = 10000 <= b16 <= 13500
checks["B1_stirrup8_total_mm"] = b8
checks["B1_stirrup8_ok"] = 20000 <= b8 <= 35000
checks["F1_mesh12_total_mm"] = f12
checks["F1_mesh12_ok"] = f12 >= 5000
for k, v in checks.items():
    say(f"    {k}: {v}")

if (OUT / "bbs.svg").exists():
    pass
try:
    doc.saveAs(str(OUT / "frame.FCStd"))
    RUN["fcstd"] = str(OUT / "frame.FCStd")
except Exception as exc:  # noqa: BLE001
    RUN["errors"]["save"] = str(exc)

RUN["total_ms"] = round((time.perf_counter() - T0) * 1000, 1)
(OUT / "run.json").write_text(json.dumps(RUN, indent=2, sort_keys=True), encoding="utf-8")
say(f"\nrun.json -> {OUT / 'run.json'}")
say("S5_SPIKE_PARTIAL" if RUN["errors"] else "S5_SPIKE_OK")
if RUN["errors"]:
    for k in RUN["errors"]:
        say(f"  error in: {k}")
