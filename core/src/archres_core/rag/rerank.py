"""Reranking (W1.1): the second-stage order over fused candidates.

Hybrid recall is cheap and noisy; the plan's RAG is "candidate depth tuned by citation-recall
evals", so the reranker is a seam with two implementations:

* ``LexicalReranker`` - deterministic query-term coverage with a clause/title boost. Used by
  CI, offline runs and as the declared fallback when the cross-encoder is unavailable.
* ``LlamaReranker`` - llama.cpp ``/v1/rerank`` against the fleet's ``rerank`` route
  (Qwen3-Reranker-0.6B on CPU). A response must score **every** candidate: a partial
  response is an error, not a silently missing score.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Callable, Protocol, Sequence, runtime_checkable

from .corpus import ClauseDoc, RagError
from .lexical import normalize, tokenize

LOOPBACK_HOSTS = frozenset({"127.0.0.1", "localhost", "::1"})

# English function words dilute coverage scoring (every long clause contains "the"); they are
# ignored for reranking only - BM25 already discounts them by document frequency, and Bangla
# function words are suffixes, not separate tokens.
STOPWORDS = frozenset(
    "a an the is are was were be been of to in on at by for and or what which who how many "
    "much do does did i we you it this that these those with from can should would could my our".split()
)


def _content_tokens(query: str) -> list[str]:
    tokens = tokenize(query)
    content = [token for token in tokens if token not in STOPWORDS]
    return content or tokens


@runtime_checkable
class Reranker(Protocol):
    """Higher is better; scores align 1:1 with the documents passed in."""

    name: str

    def rerank(self, query: str, documents: Sequence[ClauseDoc]) -> list[float]: ...


class LexicalReranker:
    """Deterministic relevance: query coverage, exact phrase, clause and title match."""

    name = "lexical-v1"

    def score(self, query: str, doc: ClauseDoc) -> float:
        query_tokens = _content_tokens(query)
        if not query_tokens:
            return 0.0
        unique = set(query_tokens)
        body = set(tokenize(f"{doc.title} {doc.text}"))
        coverage = len(unique & body) / len(unique)
        title_hit = len(unique & set(tokenize(doc.title))) / len(unique)
        clause_hit = 1.0 if normalize(doc.clause) and normalize(doc.clause) in normalize(query) else 0.0
        phrase = 1.0 if normalize(query).strip() and normalize(query).strip() in normalize(doc.text) else 0.0
        return round(0.55 * coverage + 0.20 * title_hit + 0.15 * clause_hit + 0.10 * phrase, 6)

    def rerank(self, query: str, documents: Sequence[ClauseDoc]) -> list[float]:
        return [self.score(query, doc) for doc in documents]


class LlamaReranker:
    """llama.cpp ``/v1/rerank`` on loopback (llama-swap route ``rerank``)."""

    def __init__(
        self,
        *,
        base_url: str = "http://127.0.0.1:8787",
        model: str = "rerank",
        timeout: float = 60.0,
        name: str | None = None,
        post: Callable[[str, dict[str, Any]], dict[str, Any]] | None = None,
    ) -> None:
        parsed = urllib.parse.urlparse(base_url)
        if parsed.scheme != "http" or parsed.hostname not in LOOPBACK_HOSTS:
            raise RagError(f"reranker must be loopback http, got {base_url!r} (offline-first)")
        if timeout <= 0:
            raise ValueError("timeout must be positive")
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.timeout = timeout
        self.name = name or f"llama-rerank:{model}"
        self._post = post or self._http_post

    def _http_post(self, url: str, body: dict[str, Any]) -> dict[str, Any]:
        request = urllib.request.Request(
            url,
            data=json.dumps(body).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                raw = response.read().decode("utf-8")
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", "replace")[:400]
            raise RagError(f"reranker returned HTTP {exc.code}: {detail}") from exc
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            raise RagError(f"reranker unreachable at {self.base_url}: {exc}") from exc
        try:
            return json.loads(raw)
        except ValueError as exc:
            raise RagError(f"unexpected reranker response: {raw[:200]!r}") from exc

    def rerank(self, query: str, documents: Sequence[ClauseDoc]) -> list[float]:
        if not documents:
            return []
        payload = self._post(
            f"{self.base_url}/v1/rerank",
            {
                "model": self.model,
                "query": query,
                "documents": [f"{doc.title}\n{doc.text}" for doc in documents],
                "top_n": len(documents),
            },
        )
        results = payload.get("results") if isinstance(payload, dict) else None
        if not isinstance(results, list) or len(results) != len(documents):
            raise RagError("reranker did not score every candidate")
        scores = [0.0] * len(documents)
        seen: set[int] = set()
        for item in results:
            if not isinstance(item, dict):
                raise RagError("reranker result is not an object")
            index = item.get("index")
            value = item.get("relevance_score")
            if not isinstance(index, int) or not 0 <= index < len(documents) or index in seen:
                raise RagError(f"reranker returned an invalid index: {index!r}")
            if not isinstance(value, (int, float)):
                raise RagError(f"reranker returned a non-numeric score at {index}")
            scores[index] = float(value)
            seen.add(index)
        if len(seen) != len(documents):
            raise RagError("reranker response has duplicate or missing candidates")
        return scores
