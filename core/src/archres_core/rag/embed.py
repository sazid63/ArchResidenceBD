"""Dense retrieval (W1.1): the embedder seam, a deterministic hash embedder, vectors on disk.

The fleet's embedder is ``archie-embed`` (Qwen3-Embedding-0.6B, CPU) served by llama-swap;
``LlamaEmbedder`` is the stdlib transport for it, loopback-only like the chat client. CI and
offline runs do not need the model: ``HashingEmbedder`` is a deterministic feature-hash space
over word and character n-grams. It is *lexically* dense (no semantics claimed), and every
:class:`~archres_core.rag.service.SearchResult` names the embedder it actually used - a
degraded mode is always visible, never silent.
"""

from __future__ import annotations

import hashlib
import json
import math
import pathlib
import re
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Callable, Protocol, Sequence, runtime_checkable

from .corpus import RagError
from .lexical import tokenize

LOOPBACK_HOSTS = frozenset({"127.0.0.1", "localhost", "::1"})


@runtime_checkable
class Embedder(Protocol):
    """Text in, unit-length float vectors out (one per input, same order)."""

    name: str
    dim: int

    def embed(self, texts: Sequence[str]) -> list[list[float]]: ...


def _hash_bucket(feature: str) -> tuple[int, float]:
    """Bucket index and sign from *independent* digest bytes.

    Deriving both from one integer would correlate parity with sign, biasing every vector
    toward the even buckets and giving unrelated texts a high cosine.
    """
    digest = hashlib.blake2b(feature.encode("utf-8"), digest_size=8).digest()
    index = int.from_bytes(digest[:4], "big")
    sign = 1.0 if digest[4] & 1 else -1.0
    return index, sign


class HashingEmbedder:
    """Deterministic offline embedder: hashed word + char n-grams, L2 normalised."""

    name = "hash-v2"

    def __init__(self, dim: int = 256) -> None:
        if dim < 32:
            raise ValueError("dim must be at least 32")
        self.dim = dim

    def _features(self, text: str) -> dict[str, float]:
        features: dict[str, float] = {}
        tokens = tokenize(text)
        for token in tokens:
            features[f"w:{token}"] = features.get(f"w:{token}", 0.0) + 1.0
            padded = f"^{token}$"
            for size in (3, 4):
                for index in range(max(1, len(padded) - size + 1)):
                    gram = padded[index : index + size]
                    features[f"c:{gram}"] = features.get(f"c:{gram}", 0.0) + 0.5
        return features

    def embed(self, texts: Sequence[str]) -> list[list[float]]:
        vectors = []
        for text in texts:
            vector = [0.0] * self.dim
            for feature, weight in self._features(text).items():
                bucket, sign = _hash_bucket(feature)
                vector[bucket % self.dim] += sign * weight
            norm = math.sqrt(sum(value * value for value in vector)) or 1.0
            vectors.append([round(value / norm, 8) for value in vector])
        return vectors


class LlamaEmbedder:
    """llama.cpp ``/v1/embeddings`` on loopback (llama-swap route ``embed``)."""

    def __init__(
        self,
        *,
        base_url: str = "http://127.0.0.1:8787",
        model: str = "embed",
        timeout: float = 60.0,
        name: str | None = None,
        post: Callable[[str, dict[str, Any]], dict[str, Any]] | None = None,
    ) -> None:
        parsed = urllib.parse.urlparse(base_url)
        if parsed.scheme != "http" or parsed.hostname not in LOOPBACK_HOSTS:
            raise RagError(f"embedding server must be loopback http, got {base_url!r} (offline-first)")
        if timeout <= 0:
            raise ValueError("timeout must be positive")
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.timeout = timeout
        self.name = name or f"llama-embed:{model}"
        self.dim = 0
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
            raise RagError(f"embedding server returned HTTP {exc.code}: {detail}") from exc
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            raise RagError(f"embedding server unreachable at {self.base_url}: {exc}") from exc
        try:
            return json.loads(raw)
        except ValueError as exc:
            raise RagError(f"unexpected embedding response: {raw[:200]!r}") from exc

    def embed(self, texts: Sequence[str]) -> list[list[float]]:
        if not texts:
            return []
        payload = self._post(
            f"{self.base_url}/v1/embeddings",
            {"model": self.model, "input": list(texts), "encoding_format": "float"},
        )
        data = payload.get("data") if isinstance(payload, dict) else None
        if not isinstance(data, list) or len(data) != len(texts):
            raise RagError("embedding response does not match the requested batch")
        vectors: list[list[float]] = []
        for item in data:
            vector = item.get("embedding") if isinstance(item, dict) else None
            if not isinstance(vector, list) or not vector:
                raise RagError("embedding response has a missing or empty vector")
            values = [float(value) for value in vector]
            vectors.append(values)
        dims = {len(vector) for vector in vectors}
        if len(dims) != 1:
            raise RagError(f"embedding dimensions are inconsistent: {sorted(dims)}")
        self.dim = dims.pop()
        normed = []
        for vector in vectors:
            norm = math.sqrt(sum(value * value for value in vector)) or 1.0
            normed.append([round(value / norm, 8) for value in vector])
        return normed


def cosine(left: Sequence[float], right: Sequence[float]) -> float:
    if len(left) != len(right):
        raise RagError(f"vector dimensions differ ({len(left)} vs {len(right)})")
    return sum(a * b for a, b in zip(left, right))


class VectorStore:
    """Vectors pinned to the corpus bytes and the embedder name, cached on disk.

    A stale or mismatched cache is **discarded and rebuilt**, never reused: the key is
    ``(corpusSha256, embedder name, dim)`` and the stored corpus hash must equal the current
    one. The cache directory lives under gitignored ``data/cache`` in production.
    """

    def __init__(self, root: str | pathlib.Path | None = None) -> None:
        self.root = pathlib.Path(root) if root is not None else None

    def path(self, corpus_sha: str, embedder: Embedder) -> pathlib.Path | None:
        if self.root is None:
            return None
        # Route names contain ':' (llama-embed:embed), which Windows reads as an alternate
        # data stream - a cache written under such a name is invisible to is_file().
        safe = re.sub(r"[^A-Za-z0-9._-]+", "-", embedder.name).strip("-") or "embedder"
        return self.root / f"{corpus_sha[:16]}-{safe}-{embedder.dim}.json"

    def load(self, corpus_sha: str, embedder: Embedder, doc_ids: Sequence[str]) -> dict[str, list[float]] | None:
        path = self.path(corpus_sha, embedder)
        if path is None or not path.is_file():
            return None
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return None
        if not isinstance(data, dict) or data.get("corpusSha256") != corpus_sha:
            return None
        if data.get("embedder") != embedder.name or data.get("dim") != embedder.dim:
            return None
        vectors = data.get("vectors")
        if not isinstance(vectors, dict) or set(vectors) != set(doc_ids):
            return None
        return {doc_id: [float(value) for value in vectors[doc_id]] for doc_id in doc_ids}

    def save(
        self, corpus_sha: str, embedder: Embedder, doc_ids: Sequence[str], vectors: dict[str, list[float]]
    ) -> None:
        path = self.path(corpus_sha, embedder)
        if path is None:
            return
        path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "corpusSha256": corpus_sha,
            "embedder": embedder.name,
            "dim": embedder.dim,
            "vectors": {doc_id: vectors[doc_id] for doc_id in doc_ids},
        }
        path.write_text(json.dumps(payload, sort_keys=True), encoding="utf-8")
