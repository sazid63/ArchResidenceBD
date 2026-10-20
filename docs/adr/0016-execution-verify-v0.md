# ADR-0016 — CAD execution-verify harness v0: the harness measures, the candidate only builds

**Date:** 2026-10-20 · **Status:** accepted · **Work package:** W1.8
**Spec:** `docs/spec/cad-verify-v0.md` · **Code:** `archres_core.cad`, `tools/cad/`
**Evidence:** `data/tmp/cad-probe/` (scratch) · live probe recorded in the spec

## Context

W1.8 is the first package where the app produces **CAD as code**. Two things follow:

1. A generated script can be executed. "It builds a foundation" is therefore a testable claim,
   and from the quality law (plan §9) an unexecuted claim is only a candidate.
2. The judge must not be the thing being judged. A candidate that reports its own volume can
   pass by lying, and a model-generated script is exactly the kind of code that will try
   plausible numbers. The measurement has to come from the kernel, after the candidate has run.

Constraints:

- **$0, offline.** No paid CAD cloud, no geometry service. FreeCAD is already the S4/S5 spike
  engine; `freecadcmd` runs headless on the dev machine.
- **No new dependencies.** The harness is standard library plus the engine's own modules; the
  outside half stays importable on a machine with no CAD installed.
- **Windows dev machine, CPU-only CI.** A redirected console is cp1252; CI has no GPU.
- **W1.7 is next.** Repair SFT needs structured error traces from real failures, not prose.
- FreeCAD quirk (S4): `freecadcmd` sets `__name__` to the file stem, so a `__main__` guard does
  not fire.

## Decisions

1. **The harness measures inside the engine; the candidate never reports a number.**
   `launcher.py` creates the document, runs the candidate with `runpy`, recomputes, then walks
   every object and records volume, bounding box, solid count and validity, and hashes artifacts
   from bytes. The verifier reads only that measurement. A candidate's own summary file is an
   artifact to hash, never evidence.
2. **Two layers, and the offline one is mandatory on every run.** `--check` validates the case
   set (schema, scripts present, expectations non-empty, unique ids) with no engine; `--run`
   executes. This keeps "no CAD installed" from turning into "no cases checked", which is the
   silent-coverage failure the plan forbids.
3. **Engine discovery is explicit and a missing engine is an error.** `--engine`, then
   `ARCHRES_FREECADCMD`, then known paths, then `PATH`. No fallback engine, no skip-on-missing:
   a suite that cannot execute must fail, and the error names every way to fix it.
4. **A candidate failure is data, not an engine crash.** The launcher catches `BaseException`,
   records `errorType`, `message`, full `traceback`, the last six `frames`, writes `result.json`
   and exits 0. The harness distinguishes `None` (ran), `engine_error` (candidate raised),
   `timeout` (deadline hit, process tree killed) and `no_result` (nothing written) so a repair
   step — and a human — can tell the candidate's fault from the harness's.
5. **Expected failure is a first-class case.** `"status": "error"` passes only when the run
   actually failed, and the case records the trace. Without this, the failure path would be the
   only untested path in the harness.
6. **Determinism means two runs, identical verdict signature and identical artifact bytes.**
   `"determinism": true` executes twice in fresh workdirs. Timings and trace text are excluded
   from the signature (a clock is not geometry); artifact trees are compared by SHA-256 over
   relative path + bytes. A pair that differs fails the report even when each run is valid alone.
7. **Case expectations are numbers with tolerances the author chooses.** Volumes compare with a
   relative tolerance of `1e-6` at a point; lengths with `1e-3` mm; counts, flags and hashes
   exactly. A range is the author's statement of acceptable geometry, not a loosened check
   applied globally.
8. **The harness keeps its evidence.** Every run leaves `params.json`, `result.json` and `out/`
   under the case/workdir. A failing candidate's tree is the W1.7 input: case, code, trace,
   source line, artifact hashes. Nothing is deleted to make a log look clean.
9. **The suite is deliberately small and declared as such.** Three cases prove the harness, not
   the generator's breadth. Spec → geometry derivation (W2.2), rebar and drawings (W2.4/W2.5),
   and model-in-the-loop CAD remain future work and are listed as gaps in the spec.

## Consequences

- W1.7 can be built on real traces: `engine_error` + `traceback` + `frames` + the failed case's
  expectations are enough to construct an input/target pair, and the fixed candidate is the
  verified target (it passes the same case).
- A CAD regression is a red run with the violating expectation named, not a diff of screenshots.
- FreeCAD version differences are visible (`engineVersion` in every verdict); the harness does
  not claim a version-independent geometry contract.
- The weekly Actions job installs FreeCAD 1.1.3 (conda-forge) while the recorded probe is 1.1.4
  on Windows. That is a bit-rot probe, not a second baseline; if it diverges, the report says
  which engine produced which numbers.
- The harness is CPU-only and headless; it measures geometry, not drawings, and it does not
  replace a human review of constructability.
