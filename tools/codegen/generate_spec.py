"""Regenerate Building Spec artifacts from the JSON Schema (single source of truth).

Writes (or, with --check, verifies the freshness of):
  - core/src/archres_core/spec/models.py                  (pydantic v2, datamodel-codegen)
  - app/src/spec.gen.ts                                   (TS types, json-schema-to-typescript)
  - core/src/archres_core/spec/building-spec.schema.json  (packaged copy for runtime validation)

Usage:
  python tools/codegen/generate_spec.py          # regenerate in place
  python tools/codegen/generate_spec.py --check  # verify committed artifacts are fresh (CI)

Requires: uv (creates/uses the workspace env) and node/npx on PATH.
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCHEMA = ROOT / "spec" / "schemas" / "building-spec.schema.json"
MODELS_OUT = ROOT / "core" / "src" / "archres_core" / "spec" / "models.py"
TS_OUT = ROOT / "app" / "src" / "spec.gen.ts"
SCHEMA_COPY = ROOT / "core" / "src" / "archres_core" / "spec" / "building-spec.schema.json"

MODELS_HEADER = (
    "# AUTO-GENERATED from spec/schemas/building-spec.schema.json - do not edit.\n"
    "# Regenerate: python tools/codegen/generate_spec.py"
)
TS_BANNER = (
    "/* AUTO-GENERATED from spec/schemas/building-spec.schema.json - DO NOT EDIT.\n"
    "   Regenerate: python tools/codegen/generate_spec.py */"
)

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


def gen_models(out: Path) -> None:
    _run(
        [
            _exe("uv"),
            "run",
            "--directory",
            str(ROOT / "core"),
            "datamodel-codegen",
            "--input",
            str(SCHEMA),
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
            MODELS_HEADER,
        ],
        ROOT,
    )


def gen_ts(out: Path) -> None:
    out.parent.mkdir(parents=True, exist_ok=True)
    _run(
        [
            _exe("npx"),
            "-y",
            "-p",
            NPM_PKG,
            "json2ts",
            "-i",
            str(SCHEMA),
            "-o",
            str(out),
        ],
        ROOT,
    )
    text = out.read_text(encoding="utf-8")
    if not text.startswith(TS_BANNER):
        out.write_text(TS_BANNER + "\n" + text, encoding="utf-8")


def copy_schema(out: Path) -> None:
    out.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(SCHEMA, out)


def main() -> int:
    ap = argparse.ArgumentParser(description="Regenerate Building Spec artifacts (or verify freshness).")
    ap.add_argument("--check", action="store_true", help="verify committed artifacts are fresh; write nothing")
    args = ap.parse_args()

    sync_env()

    outputs = [
        ("core/src/archres_core/spec/models.py", MODELS_OUT),
        ("app/src/spec.gen.ts", TS_OUT),
        ("core/src/archres_core/spec/building-spec.schema.json", SCHEMA_COPY),
    ]

    if not args.check:
        for _, path in outputs:
            path.parent.mkdir(parents=True, exist_ok=True)
        gen_models(MODELS_OUT)
        gen_ts(TS_OUT)
        copy_schema(SCHEMA_COPY)
        print("generated: models.py, spec.gen.ts, packaged schema copy")
        return 0

    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        generated: list[tuple[str, Path, Path]] = []
        tmp_models = tmp / "models.py"
        tmp_ts = tmp / "spec.gen.ts"
        tmp_schema = tmp / "building-spec.schema.json"
        gen_models(tmp_models)
        gen_ts(tmp_ts)
        copy_schema(tmp_schema)
        generated = [
            ("core/src/archres_core/spec/models.py", tmp_models, MODELS_OUT),
            ("app/src/spec.gen.ts", tmp_ts, TS_OUT),
            ("core/src/archres_core/spec/building-spec.schema.json", tmp_schema, SCHEMA_COPY),
        ]

        stale = []
        for label, fresh, committed in generated:
            if not committed.exists() or _norm(committed) != _norm(fresh):
                stale.append(label)
        if stale:
            print("STALE committed artifacts - regenerate: python tools/codegen/generate_spec.py")
            for label in stale:
                print("  - " + label)
            return 1
        print("spec codegen artifacts are fresh")
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
