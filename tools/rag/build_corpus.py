"""Build (or check) the committed RAG clause corpus.

The corpus is derived from the rule pack, so it is generated and committed like the flow book
and the rule pack's rendered doc - CI runs ``--check`` and fails when either side drifted.

Usage (repo root):
  uv run --directory core python ../tools/rag/build_corpus.py
  uv run --directory core python ../tools/rag/build_corpus.py --check
"""

from __future__ import annotations

import argparse
import hashlib
import json
import pathlib
import sys

from archres_core.rag import RagError, build_corpus
from archres_core.rag.corpus import corpus_bytes, manifest
from archres_core.stdio import utf8_stdio

ROOT = pathlib.Path(__file__).resolve().parents[2]
PACK = ROOT / "spec" / "rules" / "rajuk-2008.yaml"
SOURCES = ROOT / "spec" / "rag" / "sources.yaml"
CORPUS = ROOT / "spec" / "rag" / "rajuk-2008.corpus.jsonl"
MANIFEST = ROOT / "spec" / "rag" / "rajuk-2008.manifest.json"


def main(argv: list[str] | None = None) -> int:
    utf8_stdio()
    parser = argparse.ArgumentParser(description="Build the RAG clause corpus from the rule pack.")
    parser.add_argument("--check", action="store_true", help="fail when the committed corpus is stale")
    args = parser.parse_args(argv)
    try:
        corpus = build_corpus(PACK, SOURCES)
    except RagError as exc:
        print(f"corpus build failed: {exc}", file=sys.stderr)
        return 1
    payload = corpus_bytes(corpus.docs)
    sidecar = json.dumps(manifest(corpus, corpus_sha=_sha(payload), corpus_bytes_count=len(payload)),
                         ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    if args.check:
        stale = []
        if not CORPUS.is_file() or CORPUS.read_bytes() != payload:
            stale.append(str(CORPUS.relative_to(ROOT)))
        if not MANIFEST.is_file() or MANIFEST.read_text(encoding="utf-8") != sidecar:
            stale.append(str(MANIFEST.relative_to(ROOT)))
        if stale:
            print(f"RAG corpus is stale: {', '.join(stale)} - rebuild with tools/rag/build_corpus.py", file=sys.stderr)
            return 1
        print(f"RAG corpus is fresh: {len(corpus.docs)} documents")
        return 0
    CORPUS.parent.mkdir(parents=True, exist_ok=True)
    CORPUS.write_bytes(payload)
    MANIFEST.write_text(sidecar, encoding="utf-8")
    print(
        f"wrote {CORPUS.relative_to(ROOT)}: {len(corpus.docs)} documents, "
        f"{len(payload)} bytes, sha256 {_sha(payload)[:16]}"
    )
    return 0


def _sha(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


if __name__ == "__main__":
    raise SystemExit(main())
