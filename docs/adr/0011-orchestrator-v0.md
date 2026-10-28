# ADR-0011 — Orchestrator v0: snapshot commits, one model seam, deny-by-default tools

- **Status:** Accepted
- **Date:** 2026-10-20
- **Deciders:** Owner (standing order for the autonomous build-out run; package W1.10 defined by plan Appendix C)

## Context

W1.10 had to turn the deterministic interview (W1.4) into a conversation: own the one model call for unreadable answers, record every writing turn as a revision (W1.3 store), fence external text, and decide tool permissions (plan §5.8). Four points needed a decision:

1. **How a finished turn reaches the revision store.** The interview applies each patch to its own copy with per-path provenance (user/default/assumption/engine, confidence). `SpecStore.commit()` re-applies ops with one provenance entry, which would overwrite those entries and split the truth between the draft and the store. A double application (apply in the interview, then apply again in the store) is also two places that can diverge.
2. **Commit granularity.** A 69-step interview can produce ~60 writing turns. One revision per package/phase hides which answer changed what; one revision per app launch loses the audit trail; one per turn is chatty but honest.
3. **Model transport.** Where does the HTTP call live, what happens when the reply is not the JSON contract, and how is offline-first enforced?
4. **Injection and tool policy.** Plan §5.8 wants a watch on all external content and fleet isolation. Refusing the user's own answer because it contained a suspicious phrase would violate the behaviour curriculum (advise, record, proceed) — but letting external text call tools would violate isolation.

## Decision

1. **Snapshot commits.** `SpecStore.commit_snapshot(parent, spec, note)` records an already-patched, schema-valid working draft as the next revision. The op summary in the log is derived from a pointer-level diff against the parent, excluding `/revision`, `/locked`, `/updatedAt`. Store law is unchanged: current tip only, no locked tip, content must differ, invalid drafts raise. W1.4's provenance entries reach the store verbatim.
2. **One revision per writing turn**, noted `interview: <questionId>`; `finish()` applies all remaining fallbacks and commits once (`interview finished`); an explicit `commit()` is a no-op when only revision metadata differs. Non-writing turns (omit, ask-again, open essentials) create no revision.
3. **One model seam, one attempt.** `agent.client.ModelClient` is the protocol; `LlamaSwapClient` is the only transport and refuses any non-loopback URL (offline-first is enforced at construction). The escalation request carries the project card, the question, its options, known answers and the user's fenced words. The reply must be one JSON object `{value, unit}`; anything else (prose, `value: null`, wrong types) is a visible error and **writes nothing**. A syntactically valid but semantically wrong value is handed to `Interview.accept_external`, which re-validates by question type and schema and turns it into `model_invalid` re-ask. No automatic retry loop in v0 — a retry is a user action, and the transcript records every attempt.
4. **Context: trust labels and an alarm, not a cap.** Sections are labelled `trusted` / `user` / `external`; every non-trusted section is fenced as quoted data with an explicit law line in the system prompt. Token estimates are reported with `overBudget` — nothing is ever truncated (plan §8). The identity string is the versioned W1.5 system prompt, so the app and its training data cannot drift apart silently.
5. **Injection: detect, fence, record — then guard tools.** `scan()` flags override/tool-bait/exfiltration/credential/role-marker/hidden-text/base64 patterns with spans in BN and EN; findings go to the transcript. A **high** finding in the motivating content denies every tool call; external content cannot call write/exec/net tools at all (fleet isolation); external-content reads require approval. The user's answer itself is still parsed — the watcher never silently refuses an interview answer.
6. **Tools are denied by default.** `PermissionPolicy` grants per tool per session, sandboxes fs and shell paths, keeps network off (offline-first) and shell off unless the caller opts in, and logs every decision. v0 ships the registry + policy + audit trail; executing shell/fetch is not wired into core (W3.10 owns approval UX and execution).

## Consequences

- The transcript and the revision log now tell one story: every commit event names the revision and its paths, and every revision note names the question.
- Diff-derived op summaries use array indices for list changes (e.g. `/phases/0/data/...`) rather than slug ids; this is a log summary only — patches and verdicts keep keyed addressing (ADR-0008).
- A model outage degrades to "I couldn't read that — say it another way", never to a guessed value; the interview keeps its question open.
- `agent` depends on `training.prompts` for the identity string. That is deliberate one-way coupling to a versioned constant, not to the training pipeline.
- Costs accepted: a per-turn revision log is longer than a per-phase one; the policy has no approval UI yet (decisions are `ask`, and execution stops there); injection patterns are heuristics and will need a corpus test in W3.10.
