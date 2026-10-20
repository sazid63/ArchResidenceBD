# CAD execution-verify harness v0

**Package:** W1.8 · **Status:** done 2026-10-20 · **ADR:** `0016-execution-verify-v0.md`
**Code:** `archres_core.cad` (`engine`, `launcher`, `runner`, `cases`, `verify`, `suite`)
**CLI:** `tools/cad/verify.py` · **Cases:** `tools/cad/cases/foundation.json`

## Why this exists

From W1.8 onward the app generates CAD as **code**. "The model wrote a script that builds the
foundation" is then not a claim to argue about in prose: it is a claim that can be executed in a
real CAD kernel and measured against numbers the case author chose in advance. This harness is
that judge. It is the execution half of the quality law (plan §9): identical outputs under
optimisation, and nothing called verified that was not executed.

The harness is also the source of **repair traces** for W1.7: a failed candidate must arrive at
the repair step with the exception type, message, traceback, source line and the specific
expectation it broke — not with the word "failed".

## Trust boundary

Three roles, strictly separated:

| Role | Runs where | May do |
| --- | --- | --- |
| **candidate** (`tools/cad/candidates/*.py`) | inside the engine | build geometry in the document, write artifacts |
| **launcher** (`archres_core/cad/launcher.py`) | inside the engine, same process | run the candidate, then measure the document and hash artifacts |
| **verifier** (`archres_core/cad/verify.py`) | outside the engine | compare the launcher's measurement with the case; decide pass/fail |

A candidate **never reports its own volume, bounding box or validity**. If it writes a summary
artifact, that artifact is hashed but it is not evidence: the verifier only reads the launcher's
`objects` rows. A candidate that claims a number in its own file changes nothing.

Candidates are repository code, never user input: CAD generation is code, and `runner.py` is the
one boundary where such code is executed (a subprocess with a deadline).

## Two layers

**Suite layer** — `verify.py --check`, no engine, no CAD install, runs on every push:

- every case parses against the schema (`id`, `kind`, `script`, `expect`, `notes`, …);
- the candidate script exists and is a Python macro;
- the expectation demands something real (an empty `expect` is an error, an unknown key is an
  error);
- the case set is not empty and ids are unique;
- a case without `notes` is a warning (why does this case exist?).

This layer exists so a broken case file or a vanished candidate cannot hide behind "the runner
had no CAD today". It is cheap enough to run in the ordinary Python job on every platform.

**Execution layer** — `verify.py --run`, needs a CAD engine:

- every case runs the candidate headless in a fresh engine process (deadline from the case);
- the launcher measures the document after `recompute()`;
- the verifier scores each expectation and returns a verdict with **one failure row per broken
  expectation**;
- a case with `"determinism": true` runs **twice**; both verdict signatures and both artifact
  trees must match exactly.

## Case contract

A case file is JSON or YAML: a list of objects. Committed example:

```json
{
  "id": "foundation.pads.1x1",
  "kind": "geometry.build",
  "script": "tools/cad/candidates/geometry_build.py",
  "params": {"pads": 1, "columnsPerPad": 1, "padMm": [1200, 1200, 300]},
  "expect": {
    "status": "ok",
    "documentObjects": {"min": 1},
    "totals": {"volumeM3": {"min": 0.674, "max": 0.676}},
    "objects": [
      {"name": "Pad_1", "volumeM3": {"min": 0.674, "max": 0.676},
       "bboxMm": [{"min": 1199.9, "max": 1200.1},
                  {"min": 1199.9, "max": 1200.1},
                  {"min": 2999.9, "max": 3000.1}],
       "solids": 1, "valid": true}
    ],
    "artifacts": ["foundation-summary.json"]
  },
  "determinism": true,
  "timeoutMs": 180000,
  "notes": "why this case exists"
}
```

`expect` accepts:

- `status` — `"ok"` (default) or `"error"`. An `"error"` case is scored as passed when the
  candidate failed in the engine; it is how the harness proves it captures failures.
- `documentObjects` — an exact count, or `{min}` / `{max}` / `{min, max}`. Counts are exact:
  an interval is the author saying "at least this many".
- `totals` — `objects`, `solids`, `volumeM3` as bounds. `volumeM3` compares with a relative
  tolerance of `1e-6` when the bound is a point; counts compare exactly.
- `objects[]` — by **internal object name** (not label): `volumeM3`, `bboxMm` (three axes,
  absolute tolerance `1e-3` mm on a point), `solids`, `valid`. A missing object is its own
  failure with the names that did arrive.
- `artifacts[]` — a bare name or `{name, kind, minBytes, sha256}`. A declared artifact that is
  not produced is a failure; a produced artifact is hashed from bytes.

If `expect.documentObjects` is present and the document exposes **no measurable shape**, that is
an explicit failure (`objects.measured`) even if the count looks acceptable: an object with no
`Shape` is not evidence.

Bounds are validated at load time: `min > max`, an unknown key, a boolean where a number
belongs, or an empty `expect` are all load errors, not runtime surprises.

## Measurement contract

The launcher writes `result.json` next to `params.json`, even when the candidate fails:

```json
{
  "status": "ok",
  "engine": "freecad",
  "engineVersion": "1.1.4",
  "jobKind": "geometry.build",
  "params": {"pads": 1},
  "documentObjects": ["Pad_1"],
  "objects": [
    {"name": "Pad_1", "volumeM3": 0.675, "bboxMm": [1200.0, 1200.0, 3000.0],
     "solids": 1, "valid": true}
  ],
  "artifacts": [{"name": "foundation-summary.json", "sizeBytes": 128, "sha256": "…"}],
  "warnings": [], "notes": [], "durationMs": 172.0
}
```

On a candidate failure the same file carries `status: "error"`, `errorCode: "engine_error"`,
`errorType`, `message`, `traceback` (full formatted traceback) and `frames` (last six frames:
file name, line, source). The launcher then **exits 0**: a candidate error is data for the
verifier and for repair training, not an engine crash.

`freecadcmd` sets `__name__` to the file stem (spike S4), so the launcher runs at module level
when `ARCHRES_CANDIDATE` is set, and runs the candidate with
`runpy.run_path(..., run_name="__main__")` so macros behave as they do when a user opens them.

## Verdict semantics

`verify_result(case, outcome)` returns a `CaseVerdict` with:

- `ok` — no failures;
- `code` — `None` for a clean run, else `timeout`, `no_result` or the candidate's `errorCode`
  (today always `engine_error` from the launcher);
- `failures[]` — each row names the check (`totals.volumeM3`, `objects[Pad_1].volumeM3`,
  `artifacts[summary.json]`, …), a human message with the actual and expected numbers, and the
  values themselves;
- `trace` — the engine's traceback when there is one, else its stderr tail (exported in the JSON
  report, not part of the determinism signature);
- `totals`, `artifactHashes`, `engineVersion`, `durationMs`.

A failed run cannot satisfy geometry expectations: when `status` is unexpected the verdict
returns the status row (with the trace) and stops, rather than emitting four secondary failures
about numbers that were never measured.

## Determinism

`determinism: true` means: run the same candidate twice, in two fresh workdirs, and demand

1. an **identical verdict signature** — `ok`, `code`, failure rows, artifact hashes, totals; and
2. an **identical artifact tree** — `sha256` over relative path + bytes of every file under
   `out/`.

Run durations and trace text are excluded: a clock is not geometry. A mismatch is reported with
the specific difference (`totals ... != ...`, `artifact hashes differ`, `failure sets differ`)
and fails the report even when each run is individually valid.

## Engine discovery

Explicit, in this order, with no silent degradation:

1. `--engine PATH` (CLI);
2. `ARCHRES_FREECADCMD`;
3. known install paths (Windows/macOS/Linux);
4. `freecadcmd` / `FreeCADCmd` on `PATH`.

A missing or dangling engine is an **error** (`EngineMissing`) that names all four ways to fix
it; the report fails. There is no "skip if no CAD" mode: a suite that cannot execute must not
look green.

## Failure taxonomy

| `code` | Meaning | Evidence |
| --- | --- | --- |
| `None` | the process wrote a well-formed `result.json` (status may still be `error`) | `result.json` |
| `engine_error` | the candidate raised inside the engine | `traceback`, `frames`, `message` |
| `timeout` | the engine did not finish within `timeoutMs`; the process tree was killed | stderr tail, duration |
| `no_result` | the engine exited without a readable `result.json` | exit code, stderr tail |

The harness distinguishes "the candidate is wrong" (data) from "the engine did not run"
(harness problem) on purpose. A candidate failing is never an exception the caller has to guess
about.

## Evidence on disk

```
<workdir>/<case id>/run1/
  params.json          the job payload the candidate read
  result.json          the launcher's measurement (or the failure, with traceback)
  out/                 candidate artifacts, hashed for the verdict
  run2/                present only for determinism cases
```

`--workdir` keeps the tree for inspection. Without it, a scratch tree is created under the OS
temp directory; a failing run's tree is the evidence a repair step trains on, so it is not
deleted either.

## Live probe (recorded, not stubbed)

**2026-10-20 · Windows dev machine · FreeCAD 1.1.4**
(`C:\1_SAJID\CE tools\FreeCAD\bin\freecadcmd.exe`, discovered via `--engine`)

Command:

```
uv run --directory core python ../tools/cad/verify.py --run \
  --engine "C:\1_SAJID\CE tools\FreeCAD\bin\freecadcmd.exe" \
  --workdir "…\data\tmp\cad-probe" --json report.json --markdown report.md
```

| Case | Verdict | Measured | Runs (ms) |
| --- | --- | --- | --- |
| `foundation.pads.1x1` | PASS | 1 object, 1 solid, 0.675 m³ | 437, 344 |
| `foundation.pads.6x3` | PASS | 6 objects, 6 solids, 6.966 m³ | 438, 437 |
| `foundation.broken.missing-column` | PASS (expected error) | `engine_error`, 0 objects | 172 |

Overall: **3/3, accuracy 1.0**, engine version `1.1.4`, both determinism pairs identical
(verdicts and artifact trees). Artifact hashes:
`foundation-summary.json` = `6d03cdaeb5a8f6f69e4f7f869a92b47ca52a61013de0a2c5e126d103168c7357`
(1 pad) and `4c9255e7effe89b7a46a68fdad787a7a9b876306e302d17ea2f46ba64a16b0f0` (6 pads).

The broken candidate's recorded trace (excerpt, as exported in the JSON report):

```
File "...\tools\cad\candidates\broken_generator.py", line 24, in main
    params = _params()
NameError: name '_params' is not defined
```

That trace is the W1.7 input: type, message, source file and line, and the case that caught it.

## What this does **not** do (declared)

- **No spec → geometry derivation.** The candidate reads its own params; turning a Building Spec
  into those params is W2.2.
- **No rebar, no drawings, no schedules.** Concrete pad + column volumes only (W2.4/W2.5).
- **No multi-candidate search, no model in the loop.** W1.7 repairs a candidate offline; the
  product seam that lets a model write CAD is later work.
- **No sandbox beyond process isolation.** Candidates are our code; the runner sets a deadline,
  kills the tree and captures streams, but does not claim to contain hostile code.
- **The suite is three cases.** It proves the harness (measurement, tolerances, determinism,
  failure capture), not the breadth of the CAD generator.
- **FreeCAD 0.21 is untested live.** The recorded probe is 1.1.4 on Windows; the weekly job runs
  conda-forge 1.1.3 on Ubuntu. A version difference is visible in the report, never hidden.

## Gates and CI

- `pytest core/tests/test_cad_{cases,runner,verify}.py` — the engine-free contract: case
  validation, discovery, deadline/kill, stale-result protection, verdict evidence, determinism
  pairs (fake launcher, real process plumbing), the offline layer on the committed cases, and a
  cp1252 console run of `--check`.
- Every push: `core-tests` runs `tools/cad/verify.py --check` — case freshness without an engine.
- Weekly + manual (`cad-execution` job): install FreeCAD 1.1.3 from conda-forge, run `--run`
  against the committed cases, then replay the repair corpus (`--check --engine`). It is not on
  every push because this is a private repository and a full engine install per push would burn
  the monthly Actions minutes for no extra signal; the Windows dev machine runs the real probe at
  every CAD change and the numbers are recorded here. First green run: 2026-10-20 (FreeCAD 1.1.3,
  3/3).
