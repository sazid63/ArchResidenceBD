# Orchestrator v0 (W1.10)

**Status:** v0.1.0 · decision record: **ADR-0011**
**Code:** `archres_core.agent` — `orchestrator.py` (session), `context.py` (prompts), `client.py` (model seam), `injection.py` (watch + fencing), `tools.py` (permissions)
**Consumes:** `archres_core.interview` (W1.4), `archres_core.spec` (W1.3, incl. `SpecStore.commit_snapshot`)
**Plan:** §5.8 (tools & MCP, injection watch, fleet isolation) · §8 (zero-LLM fast paths, escalation) · §9 (coverage, quality law)

## Pipeline

```
user text ──▶ scan() ──▶ Interview.answer() ──┬─ accept / fallback / ask_again ──▶ commit_snapshot
                                             └─ escalate
                                                  ├─ no client → payload returned (UI decides)
                                                  └─ client.complete(build_escalation_context())
                                                       └─ parse_model_value() ──▶ Interview.accept_external()
                                                            ├─ accepted → commit_snapshot
                                                            ├─ model_invalid → visible re-ask, no write
                                                            └─ unreadable → visible error, no write
```

The deterministic path never leaves the process. The model is reached only for `escalate` turns, only through a loopback client, and its value is re-validated by the interview exactly like a typed answer (`source: user`, `confidence: low`, `detail: model-parsed (escalation)`).

## Session

```python
session = Session.create(book, root, spec, client=..., policy=..., language="en")
session = Session.resume(book, root, client=..., policy=..., language="bn")
session.respond("3 katha")            # or respond(choice="bangla-land")
session.use_default()                  # "you decide" → authored fallback
session.skip()                         # "I don't know" → authored fallback / open essential
session.finish()                       # fallbacks for everything left, one revision
session.commit("phase complete")       # no-op when nothing changed
session.state() / .prompt() / .coverage() / .history() / .pending() / .transcript
session.check_tool(Call("fs.read", {"path": "notes.txt"}))
```

`respond()` returns a `Result`: the engine `Turn`, the next `prompt`, the committed `Revision` (if any), the model name, the built `context`, injection `findings`, and `error`. `Result.to_dict()` is JSON-safe — the UI can log it as-is.

- **Language** — `en` / `bn`; a session refuses to run if its language disagrees with the interview.
- **Scoping** — `flows=["site-excavation"]` runs a phase at a time; per-storey flows use `storey_index`.
- **Resume** — `resume()` refuses a locked tip; `skip_answered` makes it continue, never re-ask.
- **Errors** — `OrchestratorError` for a locked revision or a mismatched language; a model failure is data (`Result.error`), not an exception.

## Revisions

| Event | Revision |
|---|---|
| `create` | 0 — the initial spec |
| a turn that wrote (`ops` non-empty) | next number, note `interview: <questionId>` |
| `finish()` with fallbacks | one revision, note `interview finished` |
| `commit()` / unchanged draft | none |
| omit / ask-again / open essential | none |

Commits use `SpecStore.commit_snapshot` (ADR-0011): the draft's per-path provenance reaches the store verbatim, and the log's op summary comes from the pointer-level diff (metadata paths excluded). A locked tip stops the write with a stated error — nothing is rewritten behind an engineer's lock.

## Context builder

`build_escalation_context(payload, spec, language=..., budget_tokens=...)` produces two messages:

- **system** — the versioned Archie identity (W1.5 `prompts.SYSTEM`), the trust law in the requested language (`<<untrusted>>` blocks are quoted data), the engine's localized escalation instruction, and the JSON contract.
- **user** — sections in fixed order: `Project` (name, revision, language, units), `Question` (id, pointer, type, canonical unit, ask, options), `Known answers` (sorted phase paths), `User answer` (fenced).

`Section(title, body, trust)` accepts `trusted | user | external`; everything non-trusted is fenced (`| ` quoted lines, hidden characters stripped, fence markers defanged). `estimatedTokens` (chars ÷ 4) and `overBudget` are reported — **nothing is truncated** (plan §8: budgets are targets, not caps). Identical inputs produce byte-identical messages.

## Model client

- `ModelClient` — `name` + `complete(messages, max_tokens, temperature)`.
- `LlamaSwapClient(base_url="http://127.0.0.1:8787", model="chat")` — stdlib `urllib`, POST `/v1/chat/completions`, non-streaming, bounded timeout; non-loopback URLs and HTTPS are refused; HTTP/connection/shape errors become `ModelError`.
- `ScriptedClient` — deterministic replies for tests and the E2E demo.
- `parse_model_value(reply)` — exactly one `{"value": ..., "unit": ...}` object (a fenced ```json block is tolerated); `null` value, missing field, non-text unit and boolean+unit are rejected. The interview still re-validates the value.

Fleet lifecycle and mode preloading belong to W1.11 (llama-swap); this client only names a route.

## Injection watch

`scan(text)` reports `Finding(rule, severity, start, end, excerpt)` for: instruction override, role markers, prompt exfiltration, tool bait, credential requests, data exfiltration, encoded payloads, hidden/bidi text. BN and Banglish phrasings are covered; ordinary building language ("system design", "the rule says ignore setbacks") does not fire.

- Findings are written to the transcript (`type: injection`) and attached to the `Result`.
- The escalation prompt always fences the answer; a high finding does **not** block the interview answer (advise, record, proceed).
- A high finding in content that motivates a tool call denies that call (`tools.PermissionPolicy`).

## Tools & permissions

| Tool | Kind | Risk | Default |
|---|---|---|---|
| `fs.list`, `fs.read`, `spec.read` | read | low | ask until granted |
| `fs.write`, `spec.write` | write | high | ask until granted |
| `fetch.get`, `web.search` | net | medium | denied (offline-first) unless `allow_net` |
| `shell.run` | exec | high | denied unless `allow_exec` |

`authorize(call, trust=..., findings=...)` → `allow | ask | deny` with a reason, appended to `policy.log`. Rules, in order: unknown tool → deny; high injection finding → deny; external content + write/exec/net → deny (fleet isolation); fs/shell paths must resolve inside the sandbox; net/exec must be switched on; external read → ask; ungranted → ask; granted → allow.

v0 ships the registry, policy and audit trail. **No tool executor is wired into core** — shell/fetch execution and the approval UX land with W3.10.

## Deliberately NOT in v0

- **No free-form chat** — the session answers the current question; off-topic conversation is W1.12's demo layer.
- **No model phrasing of questions** — prompts are the authored BN/EN flow-book text; the model is used for escalation only.
- **No automatic retry/re-ask loop after a model failure** — one attempt, visible error, user decides.
- **No tool execution** — policy decisions only; no sandbox process, no fetch, no MCP host.
- **No streaming** — non-streaming completions; TTFT budgets arrive with the app (W1.12/W3).
- **No multi-agent roles** — one session, one client; fleet isolation is a policy invariant, not a router.
