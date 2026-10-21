# The UI polish v0 (W5.6): the theme reaches everywhere, and the i18n is measured

**Status:** v0.1.0 — the theme is applied everywhere and guarded, the i18n is measured, and
the dashboard lists the real projects.
**Code:** `tools/ci/ui_guard.py` (the guard ·) · `app/src/cad/workspace.css` ·
`app/src/screens/ProjectsScreen.tsx` · `core/src/archres_core/bridge.py` (`projects.list` ·)
· **Decision record:** ADR-0069 · **Plan:** §5.1 (the design system)

## What it was

The plan's W5.6 asks for the **theme applied everywhere** and the **i18n completion**. The
repo had the tokens and the UI kit — and the plan's own rule is that a claim is only real
when it is **measured**. So both halves were, until now, assertions.

## What the guard found

- **Five colours written outside the theme** — all in the CAD workspace's own stylesheet.
- **One label still English in the Bangla dictionary** — a version number, which is a named
  exception and not a gap.

## What it is now

- **A colour is written only in the theme** — the guard fails on any colour literal outside
  `app/src/theme/`. The CAD workspace's own palette went: it uses the tokens now
  (`--paper`, `--surface-2`, `--surface-3`, `--ink-soft`, `--line`), so the dark theme
  reaches it.
- **Every label has a Bangla** — an empty translation is a gap and the guard fails.
- **A label that is still English in Bangla is either a named exception or a gap** — and the
  named list carries its reason (the product's own name, the abbreviations Bangladeshi
  engineers use, a version number), so the list is the review record and it cannot grow
  silently.
- **The dashboard lists the real projects** — the core's `projects.list` reads the projects
  on this machine, each from its own tip, so the dashboard shows the project's facts and
  not a mock — and a folder that is not a project is not listed.
- **The browser keeps the mock** — in the prototype (no core) the screen shows the mock
  project it always did.

## The measured output (2026-10-22)

```
ui guard clean - 152 label(s) in both languages, 6 named exception(s), no colour outside the theme
```

And the dashboard, through the channel the app uses:

```
the count: 2
   Dhanmondi Flat   revision 0 | Mirpur | readable True
   Mirpur Duplex    revision 0 | Mirpur | readable True
a folder that is not there: 0 project(s)
```

(A folder that is not a project — a scratch folder with a note in it — is **not listed** ✓,
and a projects folder that is not there is **empty** ✓, not an error ✓.)

## What is deliberately not here

- **Simple/Pro** — the tier is a **product decision** (the owner's), and the repo does not
  invent one.
- **The installer's own theme** — the installer's look is the shell's.

## Checks

```powershell
python tools/ci/ui_guard.py
pnpm --dir app typecheck
uv run --directory core pytest -q tests/test_bridge_dashboard.py
```
