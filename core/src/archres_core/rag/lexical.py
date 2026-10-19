"""Lexical retrieval (W1.1): BN/EN-aware BM25 over the clause corpus.

Deterministic, dependency-free and offline by construction - the first half of the hybrid
retriever. Normalisation is deliberately shallow: lowercase, Bengali digits -> ASCII, words
kept as unicode sequences (no stemming, no stop-word list, nothing language-specific that
could silently drop a Bangla query term).
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass

from .corpus import ClauseDoc, RagError

_BN_DIGITS = str.maketrans("০১২৩৪৫৬৭৮৯", "0123456789")
_TOKEN = re.compile(r"[0-9a-z\u0980-\u09ff]+")

# Shallow, deterministic folding so inflected Bangla and English plurals meet their stems:
# অফিসের -> অফিস, জমিতে -> জমি, sides -> side. No stemming library, no dropped content.
_BN_SUFFIXES = ("গুলোকে", "গুলোর", "গুলো", "গুলি", "দের", "ের", "এর", "টি", "টা", "কে", "তে", "য়", "রা")

K1 = 1.2
B = 0.75


def normalize(text: str) -> str:
    return (text or "").lower().translate(_BN_DIGITS)


def _stem(token: str) -> str:
    for suffix in _BN_SUFFIXES:
        if token.endswith(suffix) and len(token) - len(suffix) >= 2:
            return token[: -len(suffix)]
    if len(token) > 4 and token.endswith("s") and not token.endswith("ss"):
        return token[:-1]
    return token


def tokenize(text: str) -> list[str]:
    """Unicode word tokens, Bengali digits folded to ASCII, light suffix folding."""
    return [_stem(token) for token in _TOKEN.findall(normalize(text))]


def document_tokens(doc: ClauseDoc) -> list[str]:
    """Scored tokens: the clause label and title twice, then the body (title matters)."""
    head = tokenize(f"{doc.clause} {doc.title}")
    return head + head + tokenize(doc.text)


@dataclass(frozen=True)
class LexicalHit:
    doc_id: str
    score: float


class BM25Index:
    """BM25 index over documents; ``search`` returns positive-score hits, best first."""

    def __init__(self, docs: list[ClauseDoc] | tuple[ClauseDoc, ...]) -> None:
        if not docs:
            raise RagError("cannot index an empty corpus")
        self.doc_ids: list[str] = []
        self.term_freq: dict[str, dict[str, int]] = {}
        self.lengths: dict[str, int] = {}
        document_freq: dict[str, int] = {}
        for doc in docs:
            tokens = document_tokens(doc)
            if not tokens:
                raise RagError(f"{doc.id}: no indexable tokens")
            counts: dict[str, int] = {}
            for token in tokens:
                counts[token] = counts.get(token, 0) + 1
            self.doc_ids.append(doc.id)
            self.term_freq[doc.id] = counts
            self.lengths[doc.id] = len(tokens)
            for token in counts:
                document_freq[token] = document_freq.get(token, 0) + 1
        total = len(self.doc_ids)
        self.average_length = sum(self.lengths.values()) / total
        self.idf = {
            token: math.log(1.0 + (total - freq + 0.5) / (freq + 0.5))
            for token, freq in document_freq.items()
        }

    def score(self, query: str, doc_id: str) -> float:
        query_tokens = tokenize(query)
        if not query_tokens:
            return 0.0
        counts = self.term_freq[doc_id]
        length = self.lengths[doc_id]
        total = 0.0
        for token in query_tokens:
            frequency = counts.get(token)
            if not frequency:
                continue
            idf = self.idf.get(token, 0.0)
            denominator = frequency + K1 * (1.0 - B + B * length / self.average_length)
            total += idf * (frequency * (K1 + 1.0)) / denominator
        return total

    def search(self, query: str, *, limit: int = 20, allowed: set[str] | None = None) -> list[LexicalHit]:
        """Rank documents by BM25; ties break on doc id so runs are reproducible."""
        if limit <= 0:
            raise ValueError("limit must be positive")
        scored = []
        for doc_id in self.doc_ids:
            if allowed is not None and doc_id not in allowed:
                continue
            value = self.score(query, doc_id)
            if value > 0.0:
                scored.append(LexicalHit(doc_id=doc_id, score=round(value, 6)))
        scored.sort(key=lambda hit: (-hit.score, hit.doc_id))
        return scored[:limit]
