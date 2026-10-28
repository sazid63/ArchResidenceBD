# The Bangla render guard v0 (W3.9): the text must survive the trip to the page

**Status:** v0.1.0 — a CI guard over the Bangla the product ships: the encoding, the numerals,
the font and the language.
**Code:** `tools/ci/bangla_render_guard.py` (the guard) · `core/tests/test_bangla_render_guard.py`
(7 tests) · **Decision record:** ADR-0037
**Depends on:** W3.6 (the compliance reports — the first Bangla documents ✓) ·
**Plan:** §9 (the CI guard: "Bangla rendering regression tests (glyph shaping, numerals, mixed
BN+EN on generated PDFs)") · §5.1 (Noto Sans Bengali) · §3 (Bangla + English, hand-authored)

## What it is

The plan's §9 names a guard: "**Bangla rendering regression tests** (glyph shaping, numerals,
mixed BN+EN on generated PDFs)". The pixel-level half needs a browser and the app's print — the
**PDF** arrives with the desktop shell (P5) — but the *text* is where a Bangla document usually
breaks, and the text can be guarded today. The first Bangla documents exist now (W3.6's
compliance reports ✓), so the guard has something real to watch.

## What it checks

| Failure | What it looks like | How it is caught |
|---|---|---|
| **Mojibake** | "সিমেন্ট" written as cp1252 and read as UTF-8 — the page shows "à¦¸à¦®à§¡à¦¨à¦Ÿ" | the Latin-1 mojibake pattern (`À-ÿ` + `-¿`) anywhere in the file ✓ |
| **A failed decode** | the replacement character "�" where a byte could not be read | the character is searched for ✓ |
| **A file that is not UTF-8** | a document written in the console's code page | the file is decoded as UTF-8 and the failure is reported ✓ |
| **The wrong font** | Bangla rendered with a Latin fallback — the conjuncts break | the page must name **Noto Sans Bengali** ✓ (plan §5.1) |
| **The wrong language** | the browser shapes and breaks the line with the wrong rules | the page must declare `lang="bn"` ✓ |

The encoding checks run on **every** file in the scope, not only on the ones that still contain
Bangla: a document whose Bangla was destroyed by a mis-decoded write has no Bangla left to
recognise, and skipping it would let exactly the failure we guard against through ✓. The font
and the language are checked for the Bangla documents ✓ (an English document needs neither).

## The scope

`data/compliance/` today — the compliance audit and the Deviation Register, in markdown and in
the Bangla HTML ✓. Every new Bangla document joins the scope when it is committed ✓ (the scope
is one list in the guard ✓).

## What it does **not** do (declared, not implied)

- **It does not rasterise a glyph.** The plan's wording includes "on generated PDFs", and the
  PDF is the shell's print (P5). This guard watches the *input* to that print ✓ — which is
  where the failures a Bangla document actually ships with live ✓.
- **It does not check the mixed BN+EN *layout*** (the line breaking around an English phrase
  inside a Bangla sentence) — that is the browser's work, and the browser arrives with the
  shell ✓.
- **It does not check the numerals' *usage*** (a Bengali reader may write "৩.৫" or "3.5") — it
  checks that the report's own numbers are Bangla digits ✓ (W3.6's contract ✓).

## Checks

```powershell
uv run --directory core pytest -q tests/test_bangla_render_guard.py   # 7 tests
python tools/ci/bangla_render_guard.py                                 # the guard over the shipped Bangla
```
