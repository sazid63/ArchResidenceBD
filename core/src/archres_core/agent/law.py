"""Law desk (W1.9) — a cited answer, or an honest refusal, from the RAG corpus.

The desk is the **chat-path** entry point for "what does the regulation say about X, and
where?". It exists so that retrieval is never used bare: a bare `RagService.search` returns
its best hits even when the corpus has no answer, and a model handed those hits will happily
invent a clause. The desk decides one of three things, and says which:

``retrieved``     the corpus has relevant clauses; the reply is the citation block plus the
                  hits, so the caller (or a model) can only use quoted material
``declared_gap``  the best hit is a generated *declared gap* document: the pack explicitly
                  has not transcribed this rule, so no clause or page may be cited
``not_found``     nothing was retrieved; the desk says so instead of guessing

Two rules from the plan (§9) are encoded here rather than in a prompt:

- **No invented citation.** Every citation handed out comes from a hit whose `citation` was
  pinned at corpus build time; a gap hit has no page, and the desk states that.
- **No silent substitution.** `degraded` and the embedder/reranker names travel through the
  answer unchanged, so a reader can tell a real retrieval from a degraded one.

v0 has no model in this path: `status="retrieved"` is a *retrieval* result, not a claim that
the question was answered. Turning it into prose with citations is the model's job (and the
W1.9 ``model.*`` suites measure that); the desk never invents the prose itself.
"""

from __future__ import annotations

from dataclasses import dataclass

from ..rag import RagService
from ..rag.service import Hit, SearchResult, detect_lang

STATUSES = ("retrieved", "declared_gap", "not_found")

#: Hand-written, not machine-translated. Short on purpose: the app shell renders this.
NOT_IN_CORPUS = {
    "en": (
        "This is not in the rule corpus I hold, so I will not answer from memory. "
        "Ask me again after the relevant gazette section is added to the pack."
    ),
    "bn": (
        "এই নিয়মটি আমার কাছে থাকা নিয়ম-সংগ্রহে নেই, তাই মনে করে উত্তর দেব না। "
        "সংশ্লিষ্ট গেজেট অংশটি প্যাকে যোগ হলে আবার জিজ্ঞাসা করুন।"
    ),
}

DECLARED_GAP = {
    "en": (
        "The pack has not transcribed this part of the RAJUK rules yet, so no clause, page "
        "or number can be cited for it. This is a declared gap, not an answer."
    ),
    "bn": (
        "রাজউক প্যাকের এই অংশটি এখনো ট্রান্সক্রাইব করা হয়নি, তাই এর জন্য কোনো ধারা, পৃষ্ঠা "
        "বা সংখ্যা উদ্ধৃত করা যাবে না। এটি একটি ঘোষিত ঘাটতি, উত্তর নয়।"
    ),
}


@dataclass(frozen=True)
class LawAnswer:
    """One law question, with the evidence and the refusals attached."""

    question: str
    lang: str
    status: str
    hits: tuple[Hit, ...]
    citations: tuple[dict, ...]
    text: str
    context: str
    degraded: tuple[str, ...] = ()

    def to_dict(self) -> dict:
        return {
            "question": self.question,
            "lang": self.lang,
            "status": self.status,
            "docIds": [hit.doc_id for hit in self.hits],
            "citations": list(self.citations),
            "text": self.text,
            "context": self.context,
            "degraded": list(self.degraded),
        }


class LawDesk:
    """Retrieve, cite, or refuse — never guess."""

    def __init__(self, service: RagService) -> None:
        self.service = service

    def ask(self, question: str, *, k: int = 5, lang: str | None = None) -> LawAnswer:
        result: SearchResult = self.service.search(question, k=k)
        # The reply language follows the *question*, not the retrieved documents: a refusal
        # written in the wrong language is a refusal the user cannot act on.
        answer_lang = lang or detect_lang(question)
        context = self.service.render_context(result.hits)
        citations = tuple(citation for citation in (hit.citation for hit in result.hits) if citation)

        if not result.hits:
            return LawAnswer(
                question=question,
                lang=answer_lang,
                status="not_found",
                hits=(),
                citations=(),
                text=NOT_IN_CORPUS[answer_lang],
                context=context,
                degraded=result.degraded,
            )

        best = result.hits[0]
        if best.kind == "declared_gap":
            return LawAnswer(
                question=question,
                lang=answer_lang,
                status="declared_gap",
                hits=result.hits,
                citations=citations,
                text=f"{DECLARED_GAP[answer_lang]}\n\n{best.text}",
                context=context,
                degraded=result.degraded,
            )

        return LawAnswer(
            question=question,
            lang=answer_lang,
            status="retrieved",
            hits=result.hits,
            citations=citations,
            text=context,
            context=context,
            degraded=result.degraded,
        )


__all__ = ["DECLARED_GAP", "LawAnswer", "LawDesk", "NOT_IN_CORPUS", "STATUSES"]
