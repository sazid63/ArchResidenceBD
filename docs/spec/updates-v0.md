# The updates v0 (W5.4): pinned to exact versions, and what is refused

**Status:** v0.1.0 — an update is planned before it happens, every change is pinned to an
exact version, and three things are refused.
**Code:** `core/src/archres_core/updates.py` · `tools/install/check_updates.py` (the CLI) ·
**Tests:** `core/tests/test_updates.py` (14) · **Decision record:** ADR-0066 · **Plan:** §5.10
(the source registry), §6 (the P5 track)

## What it is

An update moves four things — the app, the models, the rules and the prices — and each
carries a version. The repo's laws say three things about what an update may do:

- the **money law**: a price card that is a **candidate** stays a candidate until a human
  activates it;
- the **law does not move backwards**: a rule pack's version *is* the law the app applies;
- the **roster is fixed**: the plan's decision is no new model members without the owner's
  sign-off.

Nothing made an update obey them, because nothing planned an update.

## What it does

- **An update is a plan first** — it says what each channel would change and what it
  refuses, and it changes nothing until the plan is read.
- **Every change is pinned** — the plan carries the exact version each channel moves to,
  so an update is a specific act, not "whatever is newest".
- **A candidate price card stays a candidate** — the update refuses the activation and says
  why, and a newer *candidate* may still replace an older candidate.
- **The law does not move backwards** — an offered version older than the installed one is
  refused, and a pre-release is older than the release.
- **The roster is fixed** — an update that adds or removes a model is refused, at any
  version.
- **The installed side is read from the artefacts** — the app's version, the model
  registry, the rule packs and the rate cards — so the plan is about *this* installation.

## The measured output (2026-10-22)

This installation, against an offer of a newer app, a newer rule pack and a newer
(**active**) price card:

```
the counts: {'channels': 4, 'applicable': 2, 'refused': 1, 'unchanged': 1}
   app      0.1.0    -> 0.2.0    update   the offered version is newer
   models   0.1.0    -> 0.1.0    none     the offered version is the installed one
   rules    0.1.0    -> 0.2.0    update   the offered version is newer
   prices   0.1.0    -> 0.2.0    refused  the installed card is a candidate and the offered one is
                                        'active'; activating a price card is a human act, not an update's
the pinned: {'app': '0.2.0', 'rules': '0.2.0'}
```

So: the app and the rule pack would move ✓, the models are already current ✓, and **the
price card is refused** ✓ — the committed card is a candidate ✓ and the update will not
activate it ✓ (OWNER-ATTENTION #8 ·) ✓.

## What is deliberately not here

- **The fetch of an update** — the downloader's job, and the pieces it fetches are checked
  (ADR-0064).
- **The app's own update act** — the shell's, and a deliberate step.
- **The update service** — the owner's, and where the offers come from.

## Checks

```powershell
uv run --directory core pytest -q tests/test_updates.py
uv run --directory core python ../tools/install/check_updates.py --offer offer.json
```
