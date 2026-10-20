"""Regenerate W0.9 interface artifacts from the JSON Schemas (single source of truth).

For each schema in spec/schemas/{job-protocol,model-registry,rate-card,verdict,bbs}.schema.json
writes (or, with --check, verifies the freshness of):
  - core/src/archres_core/interfaces/<name>.py              (pydantic v2, datamodel-codegen)
  - app/src/interfaces/<name>.gen.ts                        (TS types, json-schema-to-typescript)
  - core/src/archres_core/interfaces/<name>.schema.json     (packaged copy for runtime validation)

Usage:
  python tools/codegen/generate_interfaces.py          # regenerate in place
  python tools/codegen/generate_interfaces.py --check  # verify committed artifacts are fresh (CI)

Requires: uv (creates/uses the workspace env) and node/npx on PATH.
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCHEMA_DIR = ROOT / "spec" / "schemas"
PY_DIR = ROOT / "core" / "src" / "archres_core" / "interfaces"
TS_DIR = ROOT / "app" / "src" / "interfaces"

# schema stem (file + TS names) -> generated pydantic module name
SCHEMAS: dict[str, str] = {
    "job-protocol": "job_protocol.py",
    "model-registry": "model_registry.py",
    "rate-card": "rate_card.py",
    "verdict": "verdict.py",
    "bbs": "bbs.py",
}

NPM_PKG = "json-schema-to-typescript@15"


def _exe(name: str) -> str:
    path = shutil.which(name)
    if not path:
        sys.exit(f"error: '{name}' not found on PATH")
    return path


def _run(cmd: list[str], cwd: Path) -> None:
    print("+ " + " ".join(cmd))
    subprocess.run(cmd, cwd=cwd, check=True)


def _norm(path: Path) -> bytes:
    """Bytes ignoring line endings (Windows tools write CRLF; the repo stores LF)."""
    return path.read_bytes().replace(b"\r\n", b"\n")


def sync_env() -> None:
    _run([_exe("uv"), "sync", "--all-packages", "--quiet"], ROOT)


def gen_models(schema: Path, out: Path) -> None:
    header = (
        f"# AUTO-GENERATED from spec/schemas/{schema.name} - do not edit.\n"
        "# Regenerate: python tools/codegen/generate_interfaces.py"
    )
    _run(
        [
            _exe("uv"),
            "run",
            "--directory",
            str(ROOT / "core"),
            "datamodel-codegen",
            "--input",
            str(schema),
            "--input-file-type",
            "jsonschema",
            "--output",
            str(out),
            "--output-model-type",
            "pydantic_v2.BaseModel",
            "--target-python-version",
            "3.12",
            "--use-standard-collections",
            "--use-union-operator",
            "--collapse-root-models",
            "--use-title-as-name",
            "--use-schema-description",
            "--use-field-description",
            "--snake-case-field",
            "--allow-population-by-field-name",
            "--field-constraints",
            "--reuse-model",
            "--formatters",
            "black",
            "--disable-timestamp",
            "--custom-file-header",
            header,
        ],
        ROOT,
    )


def _ts_projection(node: object) -> object:
    """Strip if/then/else conditionals (and the allOf members holding them) for TS generation.

    json-schema-to-typescript@15 degrades an object that carries conditionals to an index
    signature; JSON Schema validation (pydantic/jsonschema/tests) stays the authoritative
    enforcement, while TS only needs the property shapes.
    """
    if isinstance(node, dict):
        out: dict[str, object] = {}
        for key, value in node.items():
            if key in ("if", "then", "else"):
                continue
            if key == "allOf" and isinstance(value, list):
                kept = [m for m in value if not (isinstance(m, dict) and "if" in m)]
                if kept:
                    out[key] = _ts_projection(kept)
                continue
            out[key] = _ts_projection(value)
        return out
    if isinstance(node, list):
        return [_ts_projection(item) for item in node]
    return node


def gen_ts(schema: Path, out: Path) -> None:
    banner = (
        f"/* AUTO-GENERATED from spec/schemas/{schema.name} - DO NOT EDIT.\n"
        "   Regenerate: python tools/codegen/generate_interfaces.py */"
    )
    out.parent.mkdir(parents=True, exist_ok=True)
    projected = _ts_projection(json.loads(schema.read_text(encoding="utf-8")))
    with tempfile.TemporaryDirectory() as td:
        ts_input = Path(td) / "schema.json"
        ts_input.write_text(json.dumps(projected, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        _run(
            [
                _exe("npx"),
                "-y",
                "-p",
                NPM_PKG,
                "json2ts",
                "-i",
                str(ts_input),
                "-o",
                str(out),
            ],
            ROOT,
        )
    text = out.read_text(encoding="utf-8")
    if not text.startswith(banner):
        out.write_text(banner + "\n" + text, encoding="utf-8")


def generate_all(workdir: Path, write: bool) -> list[tuple[str, Path, Path]]:
    """Generate every artifact (in place when write, else into workdir); return freshness pairs."""
    generated: list[tuple[str, Path, Path]] = []
    for stem in SCHEMAS:
        schema = SCHEMA_DIR / f"{stem}.schema.json"

        if write:
            PY_DIR.mkdir(parents=True, exist_ok=True)
            TS_DIR.mkdir(parents=True, exist_ok=True)
            gen_models(schema, PY_DIR / SCHEMAS[stem])
            gen_ts(schema, TS_DIR / f"{stem}.gen.ts")
            shutil.copyfile(schema, PY_DIR / f"{stem}.schema.json")
            continue

        py_out = workdir / SCHEMAS[stem]
        ts_out = workdir / f"{stem}.gen.ts"
        schema_copy = workdir / f"{stem}.schema.json"
        gen_models(schema, py_out)
        gen_ts(schema, ts_out)
        shutil.copyfile(schema, schema_copy)

        generated.append((f"core/src/archres_core/interfaces/{SCHEMAS[stem]}", py_out, PY_DIR / SCHEMAS[stem]))
        generated.append((f"app/src/interfaces/{stem}.gen.ts", ts_out, TS_DIR / f"{stem}.gen.ts"))
        generated.append((f"core/src/archres_core/interfaces/{stem}.schema.json", schema_copy, PY_DIR / f"{stem}.schema.json"))
    return generated


def main() -> int:
    ap = argparse.ArgumentParser(description="Regenerate interface artifacts (or verify freshness).")
    ap.add_argument("--check", action="store_true", help="verify committed artifacts are fresh; write nothing")
    args = ap.parse_args()

    sync_env()

    if not args.check:
        generate_all(ROOT, write=True)
        print(f"generated: {len(SCHEMAS)} schemas -> pydantic modules, TS types, packaged copies")
        return 0

    with tempfile.TemporaryDirectory() as td:
        generated = generate_all(Path(td), write=False)
        stale = []
        for label, fresh, committed in generated:
            if not committed.exists() or _norm(committed) != _norm(fresh):
                stale.append(label)
        if stale:
            print("STALE committed artifacts - regenerate: python tools/codegen/generate_interfaces.py")
            for label in stale:
                print("  - " + label)
            return 1
        print("interface codegen artifacts are fresh")
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
