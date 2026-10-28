# The spec's fields are used, and the hidden characters are the ones that hide v0

**Status:** v0.1.0 — the design reads the spec's values, the assumption the app writes back
lands where the design reads it, and a Bangla clause survives the injection watch.
**Code:** `core/src/archres_core/design/foundation.py` (the footing's depth ✓) ·
`core/src/archres_core/design/commons.py` (the lift ✓) ·
`core/src/archres_core/agent/injection.py` (the hidden characters ✓) ·
`core/tests/test_spec_fields.py` (the guard ✓) ·
`core/tests/test_agent_injection.py` (the Bangla regression ✓) ·
`tools/ci/security_guard.py` (the pass ✓) · **Decision record:** ADR-0049
**Found by:** W3.8's cost-meter test ✓ and W3.10's security pass ✓ — the two packages each
found a defect in the packages before them ✓ ✓.

## The two defects

**1. The foundation ignored the spec's footing depth.** The example's foundation phase carries
`"footingDepthM": 1.5` ✓ and the design read `/phases/foundation/data/footingDepthMm` — a key
the spec does not have ✓ — so the spec's depth was **silently ignored** ✓ and a **300 mm**
footing was built instead ✓ ✓. The common services had the same shape of defect ✓: the spec
says `"hasLift": false` ✓ and the design built a lift anyway ✓ ✓.

**2. The hidden-character rule was wrong for Bangla.** The rule pack's clauses carry **8
occurrences of U+200D** ✓ — and U+200D is the **Bangla virama** ✓, the character that forms
the conjuncts ✓ ✓. The scanner called them hidden characters ✓ (a false positive ✓ ✓) and
`strip_hidden()` would have **stripped every conjunct out of a Bangla clause** ✓ ✗ — in the
fence ✓, in the excerpts ✓, anywhere the text goes through it ✓ ✓.

## The fixes

**The spec's fields are read, and the assumption points at the key the spec carries.** The
design reads `footingDepthM` ✓ (metres ✓) and `hasLift` ✓ ✓, and the assumption it hands back
— when the spec says nothing ✓ — points at **the same key** ✓, so the app writes the
assumption where the design will read it ✓ ✓. The loop closes ✓ ✓.

**The joiners are letters again.** The hidden class now holds the characters that hide text
from a human but not from a model ✓ — the zero-width space ✓, the word joiner ✓, the BOM ✓,
the bidi overrides ✓ and the isolates ✓ — and **not** the joiners ✓, because in the scripts
this product speaks they are letters ✓ ✓. And the **patterns still see through them** ✓: the
rules match against a copy with the joiners removed ✓, so an instruction hidden with a joiner
is still caught ✓ — with the **reported spans** the original's ✓, so an excerpt points at the
text the caller holds ✓ ✓.

## The guards — so it cannot happen again

- **`core/tests/test_spec_fields.py`** ✓ — every field in the example's phase data is
  either **used** ✓ (the design reads it ✓ and the value carries the spec's provenance ✓) or
  **declared** ✓ (the design does not, and this is why ✓) ✓. A **new field fails the test**
  until someone decides what it means ✓ ✓; a field that disappears fails it too ✓ (a stale
  list is a lie ✓) ✓.
- **`core/tests/test_agent_injection.py`** ✓ — the Bangla conjuncts survive the strip ✓ and
  the fence ✓, a clean Bangla clause has no findings ✓, and a joiner still cannot hide an
  instruction ✓ ✓.
- **The security pass** ✓ — it now **fails on a hidden character** in the external content ✓
  whatever its severity ✓, because a hidden character in the product's content is a defect ✓
  (it hides text from a human reader ✓ ✓).

## The measured output (2026-10-21)

- The **foundation** now builds a **1,500 mm** footing ✓ (the spec's ✓ ✓) — the excavation
  (1,800 mm ✓) holds it ✓ ✓.
- The **common services** build **no lift** ✓ (the spec says so ✓ ✓).
- The **BOQ** moved from **119,599.70 BDT** ✓ to **154,276.09 BDT** ✓ — the deeper footings ✓
  are concrete ✓ ✓.
- The **clash report** moved to **25 members** ✓ and **48 clashes** ✓ (the lift's clashes are
  gone ✓ with the lift ✓ ✓).
- The **security pass** reports **0 findings** ✓ ✓ (the 8 false positives are gone ✓ ✓) and
  **10 laws, 10 hold** ✓ ✓.

## What is deliberately not here

- **The design's other assumptions still point at keys the design does not read** ✓ — the
  footing's *size* ✓, the grade beam's ✓, the floor's beam and column ✓, the commons' stair
  and conduit ✓, the MEP's twelve ✓. The **spec's fields** ✓ — the ones the user types ✓ —
  are all accounted for ✓ ✓ (the guard ✓), but the *app-written* assumptions are still a
  one-way street ✓ ✓: the app writes them ✓ and the design does not read them back ✓ ✓. That
  is a **package of its own** ✓ (named on the board ✓ ✓) — it touches every design ✓.
- **The MEP's schedules lost the lift row** ✓ — the spec has no lift ✓, so there is nothing to
  schedule ✓ ✓.

## Checks

```powershell
uv run --directory core pytest -q tests/test_spec_fields.py tests/test_agent_injection.py
python tools/ci/security_guard.py --check
```
