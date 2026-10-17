"""S5 probe - dump internals of specific rebar objects from the saved FCStd.

Shows shape composition (solids/wires), base-wire geometry, distribution
properties and addon custom properties - used to decode the selected-face
convention and to debug suspicious lengths (e.g. the 600 mm "main bars" that
came out of the wrong face selection).

Run after rebar_bbs.py has produced data/downloads/s5/frame.FCStd:

    freecadcmd.exe tools\\spikes\\s5\\probe_objects.py
"""

from pathlib import Path

import FreeCAD as App

DOC = Path(__file__).resolve().parents[3] / "data" / "downloads" / "s5" / "frame.FCStd"
doc = App.openDocument(str(DOC))

for name in ("Rebar", "Rebar001", "Rebar002", "Rebar005", "Rebar008"):
    o = doc.getObject(name)
    if o is None:
        print(f"=== {name}: NOT FOUND ===", flush=True)
        continue
    print(f"=== {name}  {o.TypeId}  label={o.Label!r} ===", flush=True)
    print("  custom/local props:", o.PropertiesList[:60], flush=True)
    sh = getattr(o, "Shape", None)
    if sh is not None:
        print(
            f"  shape type={sh.ShapeType} solids={len(sh.Solids)} "
            f"wires={len(sh.Wires)} edges={len(sh.Edges)} vol={sh.Volume:,.1f}",
            flush=True,
        )
        for i, w in enumerate(sh.Wires[:4]):
            print(
                f"    wire{i}: len={w.Length:.1f} edges={len(w.Edges)} "
                f"closed={w.isClosed()}",
                flush=True,
            )
        for i, s in enumerate(sh.Solids[:4]):
            bb = s.BoundBox
            print(
                f"    solid{i}: vol={s.Volume:,.1f} bbox=({bb.XMin:.1f},{bb.YMin:.1f},"
                f"{bb.ZMin:.1f})-({bb.XMax:.1f},{bb.YMax:.1f},{bb.ZMax:.1f})",
                flush=True,
            )
    for attr in (
        "Diameter",
        "RebarDistribution",
        "Base",
        "Mark",
        "NumberOfRebars",
        "RebarLength",
        "Spacing",
        "AmountCheck",
        "TrueSpacing",
        "BentAngle",
        "BentFactor",
        "Rounding",
    ):
        if hasattr(o, attr):
            try:
                v = getattr(o, attr)
                if attr == "RebarDistribution" and v is not None:
                    print(f"  {attr}: {v.Name} ({v.TypeId})", flush=True)
                    for p in v.PropertiesList:
                        try:
                            print(f"      dist.{p} = {getattr(v, p)}", flush=True)
                        except Exception:  # noqa: BLE001
                            pass
                elif attr == "Base" and v is not None:
                    print(f"  {attr}: {v.Name} ({v.TypeId})", flush=True)
                    bsh = getattr(v, "Shape", None)
                    if bsh is not None:
                        print(
                            f"      base shape: edges={len(bsh.Edges)} "
                            f"wires={len(bsh.Wires)}",
                            flush=True,
                        )
                        for j, e in enumerate(bsh.Edges[:10]):
                            print(
                                f"      base edge{j}: len={e.Length:.1f} "
                                f"({e.Curve.__class__.__name__})",
                                flush=True,
                            )
                        for j, vert in enumerate(bsh.Vertexes[:10]):
                            p = vert.Point
                            print(
                                f"      base vert{j}: ({p.x:.1f},{p.y:.1f},{p.z:.1f})",
                                flush=True,
                            )
                else:
                    print(f"  {attr} = {v}", flush=True)
            except Exception as exc:  # noqa: BLE001
                print(f"  {attr}: <err {exc}>", flush=True)
    print(flush=True)

print("PROBE_DONE", flush=True)
