"""Query the RAG clause corpus from the terminal (oracle for the app and evals).

Default offline mode: BM25 + hash dense vectors + lexical rerank - fully deterministic and
model-free. ``--base-url`` points at the running llama-swap fleet to use the real
``archie-embed`` / ``archie-rerank`` routes (interview/design mode warms them).

Usage (repo root):
  uv run --directory core python ../tools/rag/search.py "৫ কাঠা জমিতে FAR কত"
  uv run --directory core python ../tools/rag/search.py "setback from side boundary" --lang en
  uv run --directory core python ../tools/rag/search.py "parking for office" --base-url http://127.0.0.1:8787
"""

from __future__ import annotations

import argparse
import json
import pathlib
import sys

from archres_core.rag import (
    HashingEmbedder,
    LexicalReranker,
    LlamaEmbedder,
    LlamaReranker,
    RagError,
    service_from_paths,
)
from archres_core.stdio import utf8_stdio

ROOT = pathlib.Path(__file__).resolve().parents[2]
CORPUS = ROOT / "spec" / "rag" / "rajuk-2008.corpus.jsonl"
CACHE = ROOT / "data" / "cache" / "rag"


def main(argv: list[str] | None = None) -> int:
    utf8_stdio()
    parser = argparse.ArgumentParser(description="Search the cited clause corpus.")
    parser.add_argument("query", nargs="+", help="the question, BN or EN")
    parser.add_argument("--k", type=int, default=5, help="hits to show (default 5)")
    parser.add_argument("--lang", choices=["bn", "en"], help="restrict to one language")
    parser.add_argument("--kind", action="append", help="restrict to a document kind")
    parser.add_argument("--base-url", help="llama-swap router to use the real embedder/reranker")
    parser.add_argument("--no-rerank", action="store_true", help="skip the reranker stage")
    parser.add_argument("--json", action="store_true", help="print the full result as JSON")
    parser.add_argument("--coverage", action="store_true", help="print what the corpus covers")
    args = parser.parse_args(argv)

    embedder = None
    reranker = None
    if args.base_url:
        try:
            embedder = LlamaEmbedder(base_url=args.base_url)
            reranker = LlamaReranker(base_url=args.base_url)
        except RagError as exc:
            print(f"rag setup failed: {exc}", file=sys.stderr)
            return 1
    else:
        embedder = HashingEmbedder()
        reranker = LexicalReranker()

    try:
        service = service_from_paths(CORPUS, embedder=embedder, reranker=reranker, cache_dir=CACHE)
        if args.coverage:
            print(json.dumps(service.coverage(), ensure_ascii=False, indent=2))
            return 0
        result = service.search(
            " ".join(args.query),
            k=args.k,
            lang=args.lang,
            kinds=args.kind,
            rerank=not args.no_rerank,
        )
    except RagError as exc:
        print(f"rag query failed: {exc}", file=sys.stderr)
        return 1

    if args.json:
        payload = {
            "query": result.query,
            "lang": result.lang,
            "packId": result.pack_id,
            "packVersion": result.pack_version,
            "embedder": result.embedder,
            "reranker": result.reranker,
            "degraded": list(result.degraded),
            "note": result.note,
            "hits": [hit.as_dict() for hit in result.hits],
        }
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        return 0

    if not result.hits:
        print(f"no clause matched ({result.corpus_documents} documents in {result.pack_id})")
        if result.note:
            print(f"note: {result.note}")
        return 0
    print(f"{result.query!r} -> {len(result.hits)} hits ({result.lang}, {result.pack_id})")
    for hit in result.hits:
        citation = hit.citation or {}
        print(
            f"\n{hit.clause or hit.entity_id}  {hit.title}  [{hit.kind}/{hit.lang}/{hit.text_kind}]"
        )
        print(f"  {hit.text}")
        if citation:
            print(
                f"  gazette p. {citation.get('gazettePage')} (PDF p. {citation.get('pdfPage')}), "
                f"tier {citation.get('tier')}"
            )
        print(
            "  scores: "
            f"bm25 {hit.scores['lexical']:.3f} · dense {hit.scores['dense']:.3f} · "
            f"fused {hit.scores['fused']:.5f} · rerank {hit.scores['rerank']:.3f}"
        )
    for entry in result.degraded:
        print(f"\ndegraded: {entry}")
    if result.note:
        print(f"\nnote: {result.note}")
    print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
