# ArchResidenceBD — Final Plan v1.5

**Status:** FROZEN (owner-approved) · **Date:** 2026-10-17 · **Budget:** $0 (hard constraint) · **Build model:** solo owner + AI agent

**Version history**
- v1.0 — initial freeze (architecture, fleet, law system, training, roadmap)
- v1.1 — efficiency pass (runtime + pipeline efficiencies)
- v1.2 — fleet confirmed over single-base adapters; full quality re-audit (10 corrections)
- v1.3 — final consolidation
- v1.4 — owner-approved improvements folded in (Appendix A1); fleet roster fixed — no new model members; v1.5 bench approved
- v1.5 — one-app **NativeCAD** integration (branded, embedded, invisible engine); left navigation + Project Setup + Source Registry; BOQ cost types (labour / machinery / subcontract) + machinery rate cards; Claude-style soft theme with the **no-sharp-edges** corner policy; Work Breakdown added (Appendix C) *(this document)*

---

## 0. Summary

A self-contained Windows desktop app that acts as an **AI civil engineer for Bangladeshi residential buildings**: chat-driven phase planning → compliant-by-default design → per-phase 3D models that federate into one complete building → drawings + BBS + BOQ (live prices; materials + labour + machinery + subcontract) + deviation register + engineer review pack. **One installer, one window, fully offline** — the app contains its own AI runners (no Ollama / LM Studio) and its own CAD, branded **NativeCAD** (built on bundled FreeCAD, LGPL-2.1 — no external CAD install, nothing else to download, no reverse engineering needed). Bangla + English. Built entirely with free/open-source components and free training infrastructure.

---

## 1. Vision & Positioning

- A practical engineer for the residential building Bangladesh actually builds — not a dollhouse toy, not a regulator.
- **Civil engineering tool**, not an architectural tool. Architectural preferences supported only as constraints where feasible; when ambition exceeds the type, clean professional handoff (FCStd / DXF / IFC).
- Deliverable grade: engineer-detail. LOD 300–350 with real rebar. Outputs made for an engineer to review, stamp, and build from.

## 2. Operating Principles (non-negotiable)

1. **Engineer, not judge.** Requests are never refused.
   - User says nothing → codes and rules are followed (compliant by default).
   - User overrides → the app explains what rule is left behind, the risk tier (cosmetic / approval-risk / structural-attention), asks for confirmation, **proceeds**, and records the entry in the **Deviation Register**.
   - Impossible requests (physics) → explained in engineering terms, with the nearest feasible alternatives offered. "Impossible" is a physics statement, not a moral one.
   - No falsification: the app never forges compliant-looking documents. Transparency (the deviation register) is the line. Nothing in the tool exists to deceive an authority.
2. **Scripts first, AI last-mile.** Deterministic Python does math, geometry, rules, BOQ, drawings, takeoff. The AI phrases questions, parses free text, explains results with citations, and repairs scripts. No AI where a script suffices.
3. **Defaults-first.** Most users leave most choices on "AI decides" → they get a fully compliant project by default. Exceptions are served and documented.
4. **Quality supremacy.** Efficiency must be provably output-neutral. Every optimization passes the filter (Section 9) or is rejected.
5. **Provenance everywhere.** Every field in a project knows where it came from (user answer, default by location, rule pack, price source) and every override is acknowledged and timestamped.

## 3. Hard Requirements & Constraints

- **$0 to build.** Free tools, free tiers, open weights. No paid services anywhere in the critical path.
- **One installer = one app.** App + pinned FreeCAD + frozen Python runtime + llama.cpp + llama-swap + models all live inside the app's own folder and window. The user installs one file like any normal app: no Docker, no Ollama, no LM Studio, no separate FreeCAD install, nothing else to download. The AI runners and the CAD engine are internal components — from the user's perspective there is only ArchResidenceBD and its tabs.
- **Offline-first.** Core flows (planning, BOQ, design, drawings) work with no internet. Internet only for price updates, model/rule-pack updates (opt-in), and optional web lookups with approval.
- **Bangla + English at launch.** UI language selectable; AI understands and speaks both, including Banglish and Bangla numerals. Question templates and Bangla reports hand-authored/reviewed — never machine-translated.
- **Hardware floor:** 16 GB RAM + 6 GB VRAM GPU (Windows). Dev PC = reference machine (RTX 4050 6 GB, 16 GB RAM).
- **AI calls tools:** shell, fetch, web search (permission-gated) and **hosts native MCPs** (FreeCAD MCP included).
- **Small specialist models**, each fine-tuned with BNBC / RAJUK / other city building rules and laws — broken into narrow tasks, one model per task family.
- **Phase workflow:** chatbox per phase tab (Foundation, Floor 1..N, Common Services — electric conduit, gas/water pipes, stairs, lift). AI asks the phase questions; if the user doesn't know, it calculates or uses defaults (e.g., soil depth from location-based default data). Material + labour + equipment prices fetched/updated per phase. BOQ per phase. User can edit any phase later.
- **Design button** → NativeCAD builds the whole building; each phase viewable separately; all phases combine into the final model.
- **Full drawing set** (TechDraw PDF + DXF) and **BBS in v1**.
- **Rule coverage v1:** RAJUK/Dhaka + Chattogram, Khulna, Rajshahi, Sylhet.
- **Users:** Simple mode + Pro mode.
- **Models published open** on Hugging Face.
- **NativeCAD is the CAD.** The built-in CAD workspace is branded **NativeCAD**; the engine is bundled FreeCAD (LGPL-2.1) presented as NativeCAD, with required attribution confined to About/licences: *"NativeCAD is powered by FreeCAD (LGPL-2.1, © FreeCAD contributors)."* Naming caution on record: avoid "ArchCAD" (ArchiCAD trademark proximity); "NativeCAD" checked — one unrelated commercial use (a file-conversion module), different category, low risk, and renameable anytime (it is a string).
- **Theme:** soft, warm, friendly, eye-soothing, but colourful (Claude-style feel). **No sharp edges — every UI/UX corner is rounded.** Design tokens v0 (§5.1) govern the whole product: app, installer, dialogs, NativeCAD chrome, reports.

## 4. The Fleet (models)

Fleet of specialists — separate models, each with the right base and its own narrow training run.

| Member | Task | Base | Notes |
|---|---|---|---|
| **Archie-Chat-4B** | Interview, parse answers, explain rules with citations, narrate (BN+EN) | Qwen3-4B-Instruct-2507 + QLoRA | The voice of the app |
| **Archie-Repair-4B** | NativeCAD (FreeCAD engine) script repair from execution errors (execution-verified loop) | Code-specialized 3–4B base (best available at P1; Qwen2.5-Coder-3B today's baseline) + QLoRA | Code + error traces only; no network; trained English-only |
| **Embedder + Reranker** | RAG retrieval | Stock Qwen3-Embedding-0.6B + Qwen3-Reranker-0.6B | CPU-side; no training |

- **Fixed roster — no new model members (owner decision).** The v1 fleet is exactly the three rows above. Future capability gaps are solved with data, rule packs, and deterministic scripts — never by adding models. (Per member, still required: narrow task contract, own data pipeline, own eval suite, HF model card.)
- **Serving:** llama-swap as the fleet manager. Mode-based preloading (interview mode keeps Chat resident; design mode preloads Repair). Only one member in VRAM at a time (~6 GB floor). Total download ~5.7 GB, progressive: chat pack first (~3.2 GB, app usable immediately), repair pack before the Design button unlocks.
- **Fallback:** app ships on stock (untrained) base models if training slips — fully functional, just less polished.
- **Optional:** user-supplied cloud model via API key (never required).

## 5. System Architecture

**5.1 UI & Design System**
- **Shell:** Tauri + React (spike vs Electron in P0), shadcn/ui, LM Studio-like layout, BN/EN i18n from day one.
- **Left navigation:** Projects → New Project → project (e.g., "Project 1") →
  - **Project Setup ▾** — location (→ jurisdiction + seismic zone), plot size (katha / shotok / bigha / gonda via the land-unit module), stories, preferred units (metric / ft-in / Bangla), material prices *(optional → fetched via Source Registry)*, soil data *(optional → area defaults via Source Registry, clearly flagged as assumptions)*
  - **Phase ▾** — Site & Excavation · Foundation · Floor 1..N · Roof & Boundary · Common Services (stairs, lift, conduits, water/gas lines)
  - **Design ▾** — same phases + **Final** (combined master)
  - **BOQ** — single page: full list divided by phase, subtotals + grand total
  - **Documents ▾** — Drawings (PDF/DXF) · BBS · Reports (compliance audit + deviation register) · Engineer pack
- **Design tokens v0 (soft theme):** warm cream/paper base with warm-ink text (never harsh white/black); warm coral/terracotta primary; meaning-coded pastel accents for phases and categories (sky, sage, lavender, amber, blush, mint); Inter / Source Sans + **Noto Sans Bengali**; gentle motion (150–200 ms); warm charcoal dark mode; friendly BN/EN microcopy.
- **Corner policy — no sharp edges:** radius scale 8 / 12 / 16–20 / 24+ px + full pills; applied to every component (buttons, inputs, dropdowns, menus, tabs, cards, panels, modals, popovers, tooltips, toasts, checkboxes, progress bars, scrollbars, viewer frames) and to the **window chrome itself** (custom rounded frame). Dividers softened or replaced by spacing; soft diffuse shadows. Honest boundaries: Excel cells cannot be rounded (friendly via colour/type instead); engineering drawings keep professional standards — soft UI, trustworthy output. Guarantee: our surfaces 100% rounded; the branded full-CAD tab ~95% via stylesheet, stubborn dialogs replaced over time with ours.
- Design tokens v0 + UI kit are a first-class W0.2 deliverable; every screen is reviewed against them (§9).

**5.2 Core (Python, frozen)** — spec engine, rule engine, geometry generators, BOQ engine, drawing pipeline, RAG service, job orchestrator, MCP host, permission/approval layer, and a **land-unit module** (katha / shotok / bigha / gonda / kani ⇄ sqft/sqm) used across input, display, and FAR math.

**5.3 NativeCAD — the built-in CAD (three layers)** — no reverse engineering needed; FreeCAD is open source (LGPL-2.1, verified from its repository), so branding and embedding are a supported, legal configuration:
- **Engine (invisible):** bundled FreeCAD (unmodified core) + our addon, running as isolated worker processes inside the app folder; native RPC/MCP; two workers (interactive preview / batch design); crash-isolated — if CAD dies, the app survives. No external FreeCAD, ever; the app talks only to its own engine.
- **NativeCAD workspace (primary CAD surface, ours):** 3D viewport streaming from the engine (glTF/tessellation), phase model tree, parametric edit panels (member sizes, rebar, openings, dimensions), Design button, phase toggles — fully themed, 100% corner policy.
- **Full CAD tab (power surface):** branded FreeCAD build — "NativeCAD" name / splash / icons via FreeCAD's branding system (precedent: branded distributions such as Ondsel ES) + theme stylesheet best effort (~95%); embedded via window reparenting; if a machine refuses embedding → fallback opens it in its own window from inside the app (still one app, zero installs). Spike S6 in P0.
- **Legality:** LGPL-2.1 — bundling, branding, embedding allowed with notices; we ship the licence text and keep attribution in About; engine unmodified; our addon is separate. 
- Keeps: FreeCAD-Reinforcement workbench (real rebar), TechDraw sheets, PyNite 3D FEM at v1.5, exports FCStd/DXF/IFC, federation (shared datum; per-phase FCStd files; master via App::Link; regenerate only changed phases).

**5.4 Building Spec** — JSON-Schema single source of truth → generates Python validators, TypeScript types, UI forms, and docs. Versioned projects, locked revisions, dependency DAG with conservative stale-flagging, provenance per field, and an incremental ≡ full-rebuild equivalence gate.

**5.5 Phases & flows** — all question flows, defaults, validations, and deviation severities as versioned YAML data (adding a city/question = data edit). The **Phase Flow Book** (the actual BN/EN question sets per phase, hand-authored) is a first-class P0/P1 deliverable feeding UX, training data, and tests.

**5.6 Law system** — three channels: (1) versioned structured rule packs (all numbers live here), e.g. `rajuk@2026.1`; (2) clause-level RAG corpus with citations (all text); (3) fine-tune curriculum teaching compliance behavior. Compliance engine verdicts: `compliant | deviation | impossible` (no hard blocks). BYO-PDF importer: users import their own official BNBC/gazette PDFs; extraction output is **candidate-only** with page citations and confidence — nothing enters a rule pack until human review. New city ≈ 1–2 weeks of data work, no retraining. Every rule pack ships **test vectors** (input spec → expected verdicts) enforced in CI so gazette updates cannot silently break compliance logic. Every deviation entry stores its nearest compliant alternative with one-click **"restore to compliant"**.

**5.7 MEP** — v1: point layouts + schedules + deterministic sizing (electrical load/circuits, water fixture units, drainage slopes, Titas gas, lift check) + coordination/clash checks. Full 3D routing = v2. All deterministic.

**5.8 Tools & MCP** — shell / fetch / web search with permission policies and sandboxing; native FreeCAD MCP; prompt-injection watch on all external content; fleet isolation (the model that touches the web cannot write CAD code).

**5.9 Runtime stack** — bundled llama.cpp (+llama-swap); embedder/reranker on CPU; speculative decoding (Qwen3-0.6B draft for Chat; lossless — pilot in P1); flash attention; **f16 KV cache default** (Q8 only as eval-gated fallback for constrained machines — never Q4, never silent); mmap; prompt caching; task-complete context assembly.

**5.10 Source Registry & Smart Fetch** — a curated, versioned registry of trusted sources per data type: material & machinery price lists, seismic zone maps (BNBC), flood / water-table references, city gazette / rule sources, soil references. The AI fetches **through the registry** instead of blind searching (less searching, more reliable, teachable); results are cached per location; every fetched value carries provenance. **Soil honesty:** Bangladesh has no authoritative public point-level soil API — the app uses BNBC seismic zone + conservative area defaults (improved over time with engineer-partner data and user-provided reports), always labeled *"assumption — verify on site."* No fake precision.

## 6. Design Pipeline & Project Deliverables

**Pipeline jobs:** site/foundation → structure → per-floor + MEP (layouts/schedules/sizing) → roof/boundary → drawings (TechDraw PDF + DXF; English labels per BD industry norm; Bangla reports via HTML→print-PDF for correct glyph shaping) → BBS → takeoff/BOQ (materials + labour + machinery + subcontract; live prices per phase) → reports.

**Per-project deliverables:**
- Building Spec JSON + full revision history (provenance, locked revisions, changelog/diff)
- Federated 3D: per-phase models + combined master (LOD 300–350, rebar, MEP points + schedules, clash/coordination report)
- Drawing set: PDF + DXF
- BBS
- **BOQ:** xlsx + PDF; per-phase and single-page view divided by phase with subtotals + grand total; **cost types per line: material / labour / machinery & equipment / subcontract / others**; machinery rate cards (hourly/daily, operator & fuel inclusion flags, regional multipliers); piling handled as subcontract (per-pile / per-ft / machine-hour); deviation-flagged line notes where relevant; live prices
- **Compliance audit + Deviation Register** (compliant items with citations / deviations with rule, risk tier, acknowledgment, timestamp)
- **Engineer review pack**
- Exports: FCStd, DXF, IFC
- **Project bundle**: one-file export/import (spec + database + outputs) for backup, transfer between machines, and the engineer-review handoff

## 7. Training Plan ($0)

- **Data:** scripted generation for structure (all BNBC/RAJUK numbers, geometry, templates) + teacher model for natural-language variety (~0.5M tokens target). Local teacher: Qwen3-8B Q4 on owner's PC (~5 GB, fits 6 GB, overnight). Golden batches: Qwen3-30B-A3B-Instruct-2507 on **Kaggle free tier** (30 GPU-hrs/week, 2×T4) + Colab backup.
- **Method:** Unsloth QLoRA per fleet member (narrow data). RFT loop: SFT → local sampling → CPU execution-verification (local + free GitHub Actions) → retrain → eval gates → GGUF quantize locally → HF publish.
- **Behavioral curriculum:** advisory-and-override dialogues (identify rule → explain consequence → confirm → proceed → register entry) and impossibility-explanation dialogues, in BN/EN. Refusal drills deliberately excluded — behavior is "advise, record, proceed".
- **Eval gates:** golden projects — BOQ within ±8%, CAD execution success >90%, drawings engineer-checked; plus rule-identification / override-handling / register-correctness checks; sloppy-input class (Banglish, typos, "don't know") must trigger defaults, never stall.

## 8. Efficiency Pass (kept, quality-audited)

- Zero-LLM fast paths: chips/numbers/choices are shortcuts, never constraints; free text and model takeover always available; parse failures escalate to the model; every patch keeps provenance.
- Speculative decoding: lossless by construction (P1 pilot).
- Inference tuning: f16 KV default; Q8 only eval-gated; flash attention; mmap; prompt caching; task-complete context (budgets are targets, not caps).
- RAG: CPU-side; candidate depth (k) tuned by citation-recall evals, not latency; full reference set loaded (BNBC core + active city + project-referenced packs); clause cache keyed to rule-pack version.
- Two isolated persistent FreeCAD workers; fresh document per job; deterministic generators; auto-restart.
- Incremental Design button: content hashes; conservative invalidation; all IDs/marks derive from stable spec IDs only (never build order); incremental ≡ full-rebuild equivalence gate in CI; export always full-validates; "Rebuild all" always available.
- Schema-driven codegen; authored flows primary (generated forms = Pro/fallback editor).
- Progressive installer: explicit coverage state; no silent gaps; Design locked until full stack; project pins model + rule version.
- Performance budgets as alarms (TTFT <1 s cached; chip answers instant; phase regen <30 s; full 5-story design <10 min; cold start <15 s) — miss → investigate, never cut quality.
- Live cost meter: every change shows its ৳ delta (enabled by incremental BOQ).
- Project templates + duplicate project; multi-project dashboard; the **golden reference projects double as shipped starter templates** (real BOQs included).

## 9. Quality Gates & Standing Filter

Every future optimization must pass:
1. **Outputs identical?** If not → eval gate or reject.
2. **Coverage complete?** If not → explicit, user-visible state — never silent.
3. **Content human-reviewed?** If not → it's a candidate, not a fact.

If it fails the filter, it's a trade, and trades require the owner's explicit sign-off. **Quality > capability > speed.**

**UI review gate:** every new screen is checked against design tokens v0 (soft theme; **no sharp edges**) before merge.

Automated guards enforced in CI: Bangla rendering regression tests (glyph shaping, numerals, mixed BN/EN on generated PDFs), rule-pack test vectors, incremental ≡ full-rebuild equivalence, and spec fuzzing.

## 10. Roadmap (≈7.5–9.5 months, $0)

- **P0 (2–3 wks):** repo scaffold; UX clickable prototype **with left navigation + design tokens v0 / UI kit**; Building Spec schema v0; spike list (each ≤3 days): S1 Tauri vs Electron · S2 llama.cpp fleet serving + speculative decoding · S3 TechDraw headless automation · S4 persistent FreeCAD RPC worker · S5 Reinforcement WB scripting · **S6 embed + brand + theme FreeCAD (NativeCAD) into a tab**; **Source Registry v0**; Phase Flow Book v0; RAJUK + city rule-pack data collection starts; **engineer partner recruited**; HF org + model cards skeleton.
- **P1 (4–6 wks):** brain v0 — Chat + Repair training pipeline end-to-end, RAG service, rule engine, spec engine, advisor/override behavior; first evals.
- **P2 (6–8 wks):** 3D v0 — **walking skeleton first** (one small house end-to-end: spec → foundation + one floor with rebar → one drawing sheet → BOQ), then scale to multi-storey + MEP + federation; **NativeCAD workspace + full-CAD tab (embed, brand, theme)**.
- **P3 (5–6 wks):** documents & money — full drawing set, BBS, takeoff/BOQ with live prices (materials + labour + machinery + subcontract), deviation register, engineer review pack.
- **P4 (5–7 wks, parallel):** model upgrades — RFT rounds, evals, quantize, HF publish; rule packs for remaining cities.
- **P5 (3–4 wks):** productization — installer (progressive, resumable, **licence notices incl. FreeCAD**), auto-config, updates, backups, manual, **theme polish incl. installer**.
- **P6 (4+ wks):** pilot with real projects; fix list; v1.0 release.

## 11. Risks & Mitigations

- **NativeCAD embedding (window reparenting)** → isolated in one tab; spike S6 first; fallback = standalone window from inside the app; primary workspace surface unaffected.
- **Branding / stylesheet limits in FreeCAD's own GUI** → ~95% theme coverage there; our NativeCAD workspace carries the design; stubborn dialogs replaced over time.
- **FreeCAD version coupling** → pin version; test addon per upgrade.
- **LGPL compliance** → licence text shipped; attribution in About; engine unmodified; source via upstream version pin.
- **Unsigned installer (SmartScreen)** → cosmetic warning at $0; reputation builds with downloads.
- **BNBC redistribution rights** → BYO-PDF importer path; structured rule data + user-provided copies.
- **Liability / RAJUK stamping reality** → planning-grade positioning, engineer review pack, deviation register, ToS; engineer partner in P0.
- **Price source ToS** → official mill price lists + manual override + user-entered prices; scrapers only where permitted.
- **Windows GPU matrix** → auto-config tiers (CUDA / Vulkan / CPU fallback), safe defaults, smoke tests.
- **Prompt injection / tool misuse** → approval policies, sandboxing, fleet isolation, restricted tool scopes per member.
- **Floor-plan generation limits** → templates + constraint packer; stated honestly as such.
- **Solo-build scope** → walking skeleton, timeboxed spikes, YAML data-driven expansion, strict scope fence (Section 1).

---

## Appendix A — Improvement decisions (owner)

**A1. Folded into v1.4 (2026-10-17):**
1. **Land-unit module** → §5.2. 2. **Golden projects as user templates** → §8. 3. **Bangla rendering regression tests in CI** → §9. 4. **"Sloppy input" eval class** → §7. 5. **Rule-pack test vectors in CI** → §5.6. 6. **Project bundle export/import** → §6. 7. **"Restore to compliant" one-click** → §5.6. 8. **HF org + model cards skeleton in P0** → §10.
- **Not folded in (owner decision) — remain on the bench:** power-loss & crash resilience (WAL/autosave/resumable jobs); alpha-user program.

**A2. v1.5 feature bench — approved (2026-10-17):** Bangla voice-note input · "Mistri sheets" (Bangla site instructions for foremen/masons) · construction progress tracker · site photo capture · in-app engineer review round-trip.

**A3. Boundaries — cannot be improved without conflicting requirements:** bigger models (16 GB / 6 GB + $0) · **new model members (fleet roster fixed)** · cloud dependency in core flows (offline-first) · guaranteed legal approval or falsified documents (honesty) · bespoke architectural design automation (civil-tool scoping) · paid training infra ($0; free tiers only).

**A4. Folded into v1.5 (2026-10-17):**
1. **One-app integration** — CAD + AI runners live inside the app; one installer, one window; nothing external (§3, §5.3).
2. **NativeCAD** — branded embedded CAD; engine = FreeCAD (LGPL-2.1, verified); attribution in About only; "ArchCAD" avoided (ArchiCAD proximity); name checked, low risk (§3, §5.3).
3. **Left navigation** — Projects → Project Setup → Phase ▾ → Design ▾ → BOQ → Documents ▾ (§5.1).
4. **Project Setup** — location, plot size (land units), stories, units, optional prices, optional soil (+ Source Registry fetching) (§5.1, §5.10).
5. **Source Registry** — curated trusted sources; teach the AI where to fetch; provenance; soil assumptions flagged (§5.10).
6. **BOQ** — single page divided by phase; cost types material / labour / machinery / subcontract; machinery rate cards; piling as subcontract (§6).
7. **Theme** — Claude-style soft, warm, friendly, eye-soothing but colourful; meaning-coded pastels (§5.1).
8. **No sharp edges** — all UI/UX corners rounded, including window chrome (§5.1).
9. **Design tokens v0 + UI kit** — first-class W0.2 deliverable; UI review gate (§9, §10).
10. **Work Breakdown** — Appendix C.

## Appendix B — Verified building blocks & references

- **FreeCAD** — LGPL-2.1 **verified from its own repository**; supports branded redistributions (name / splash / icons); precedent: branded distributions such as Ondsel ES; our engine stays unmodified; we ship the licence + About attribution.
- **NativeCAD name check** — one unrelated commercial use ("3D-NativeCAD Converter" module in 3D-Tool); different category; "native CAD" is a generic industry term; low risk; renameable anytime.
- **freecad-mcp** (neka-nat, MIT, ~2.9k★) — FreeCAD RPC/MCP pattern; fork basis. **llama-swap** (mostlygeek, MIT, ~6k★) — fleet manager; bundled. **FreeCAD-Reinforcement** (amrit3701) — real rebar; bundled. **PyNite** (JWock82, MIT, ~758★) — Python 3D FEM; v1.5 module.
- **Qwen3-4B-Instruct-2507** (Apache-2.0) — Chat/Repair base family; **Qwen3-Embedding-0.6B** / **Qwen3-Reranker-0.6B** — stock RAG pair; **Qwen3-30B-A3B-Instruct-2507** — free-tier golden teacher; **Qwen3-8B Q4** — local teacher; **Qwen3-0.6B** — speculative draft.
- Free tiers: **Kaggle** (30 GPU-hrs/wk, 2×T4) · **Colab** backup · **GitHub Actions** (CI + CPU execution-verification) · **Hugging Face Hub** (models/data hosting).
- llama.cpp verified features: runtime LoRA/adapter endpoints, speculative decoding, per-request routing (fleet serves as separate models; adapters retained only as a future serving option within a member).

## Appendix C — Work Breakdown (small independent work packages)

**P0 — De-risk & interfaces (wks 1–3)**
- **W0.1 Repo scaffold** — monorepo (uv + pnpm), CI baseline, ADR folder, licences. ∥
- **W0.2 UX prototype** — clickable shell: left nav (Projects → Project Setup → Phase ▾ → Design ▾ → BOQ → Documents ▾), **design tokens v0 + UI kit + corner policy**, BN/EN toggle. ∥
- **W0.3 Spec schema v0** — Building Spec JSON Schema + codegen (validators, TS types, forms). *First — everything depends on it.*
- **W0.4 Phase Flow Book v0** — authored BN/EN questions + defaults + units per phase. ∥
- **W0.5 RAJUK pack v0** — FAR/BCR/setbacks/heights structured tables. ∥
- **W0.6 Engineer partner** — outreach, agreement, first real project data. ∥
- **W0.7 Spikes** (≤3 days each, independent): S1 Tauri vs Electron · S2 llama.cpp fleet + spec decoding · S3 TechDraw headless · S4 persistent FreeCAD RPC · S5 Reinforcement scripting · **S6 embed + brand + theme FreeCAD (NativeCAD) into a tab (reparenting, branding, QSS, fallback)**. ∥
- **W0.8 HF org + model card skeletons.** ∥
- **W0.9 Freeze interfaces** — job protocol, model registry, rate-card schema, verdict schema. *(needs W0.3 + W0.7)*
- **W0.10 Source Registry v0** — sources per data type + fetch recipes + cache + provenance. ∥

**P1 — Brain v0 (wks 4–9)**
- **W1.1 RAG service** — corpus, hybrid retrieval + reranker, citations, clause cache. ∥
- **W1.2 Rule engine** — verdicts, deviation register schema, restore-to-compliant. *(needs W0.5/W0.9)*
- **W1.3 Spec engine** — patch/validate/version/revision DAG/provenance. *(needs W0.3)*
- **W1.4 Question engine** — chips, deterministic parser, escalation, provenance. *(needs W0.4, W1.3)*
- **W1.5 Training data pipeline** — scripted + teacher augmentation, sloppy-input class. **∥ long pole — start week 4.**
- **W1.6 Chat SFT round 1** — Kaggle QLoRA. *(needs W1.5)*
- **W1.7 Repair SFT round 1** — code base + error traces. *(needs W1.5, S4/S5)*
- **W1.8 Execution-verify harness** — CPU headless runs (local + Actions). *(needs S4)*
- **W1.9 Eval harness v0** — rule-ID, override dialogs, register correctness. *(needs W1.2)*
- **W1.10 Orchestrator + Context Builder + tools/permissions + injection watch.** *(needs W1.3/1.4)*
- **W1.11 llama-swap integration** — fleet config, mode preloading. *(needs S2)*
- **W1.12 Chat-loop E2E demo** — interview a dummy project in BN+EN. *(needs W1.4/1.6/1.10/1.11)*

**P2 — 3D v0 (wks 10–17): walking skeleton → scale**
- **W2.1 FreeCAD addon + worker pool** — 2 isolated workers, restart, seeds. *(needs W0.9)*
- **W2.2 Gen: site + foundation** — excavation, footings, grade beams. *(needs W2.1)*
- **W2.3 Gen: typical floor** — columns, beams, slab, walls, openings. *(needs W2.2)*
- **W2.4 Rebar v0 + BBS data model.** *(needs S5, W2.3)*
- **W2.5 TechDraw v0** — templates, views, dims, PDF/DXF. *(needs S3, W2.2/3)*
- **W2.6 BOQ v0** — takeoff + rate cards + **cost types (material / labour / machinery / subcontract) + machinery rate cards**. *(needs W2.2–2.4)*
- **W2.7 Price service** — official lists, override, regional multipliers; **machinery rates**. ∥
- **W2.8 NativeCAD workspace** — viewer (glTF), phase tree, parametric edit panel. *(needs W2.2)*
- **W2.9 Federation** — shared datum, per-phase files, App::Link master. *(needs W2.1)*
- **W2.10 Walking skeleton E2E** — one small house: spec → foundation + floor w/ rebar → sheet → BOQ. *(needs W2.1–2.6, W1.12)*
- **W2.11 Equivalence gate** — incremental ≡ full rebuild in CI. *(needs W2.9/2.10)*
- **W2.12 Scale-out** — multi-storey + common services (stairs, lift, conduit/pipes). *(needs W2.10)*
- **W2.13 NativeCAD full-CAD tab** — embed + brand + theme; fallback path. *(needs S6)*

**P3 — Documents & money (wks 18–24)**
- **W3.1 MEP engines** — electrical, water, drainage, gas, lift + schedules. *(needs W2.12)*
- **W3.2 Clash/coordination checks.** *(needs W3.1)*
- **W3.3 Full drawing set** — plan/section/elevation/details/title blocks. *(needs W2.5)*
- **W3.4 BBS final** — marks, cutting lengths, shapes, xlsx/PDF. *(needs W2.4)*
- **W3.5 BOQ final** — per phase + single phase-divided page; xlsx/PDF; deviation notes. *(needs W2.6/2.7)*
- **W3.6 Compliance audit + Deviation Register reports.** *(needs W1.2)*
- **W3.7 Engineer pack + project bundle export/import.** *(needs W3.3–3.6)*
- **W3.8 Live cost meter (৳ deltas).** *(needs W3.5)*
- **W3.9 BN render regression CI + rule-pack vectors CI.** ∥
- **W3.10 Security pass** — approval policies, injection corpus tests. *(needs W1.10)*

**P4 — Models & data upgrades (wks 10–24, parallel track)**
- **W4.1 RFT Chat** · **W4.2 RFT Repair** — sample → verify → retrain. *(needs W1.6/1.7)*
- **W4.3 Eval gates v1** — BOQ ±8%, CAD >90%, engineer checks. *(needs W2.10/W3.5)*
- **W4.4 Quantize + publish** — GGUF, HF cards. *(needs W4.1/2)*
- **W4.5 City packs** — Chattogram, then Khulna/Rajshahi/Sylhet — each independent. *(template from W0.5)*
- **W4.6 Rule-pack vectors + CI.**
- **W4.7 BYO-PDF importer** — candidate extraction + review UI. *(needs W1.2)*
- **W4.8 Spec-decoding verdict** — adopt/parameterize from spike data. ∥

**P5 — Productization (wks 25–28)**
- **W5.1 Installer v0** — app + FreeCAD + Python + runtime; **licence notices incl. FreeCAD (LGPL-2.1)**.
- **W5.2 Progressive downloads** — core pack first, resume, checksums.
- **W5.3 Auto-config** — CUDA/Vulkan/CPU tiers.
- **W5.4 Updates** — app/models/rules/prices, version pinning.
- **W5.5 Autosave + backups + offline manual.**
- **W5.6 UI polish** — **theme applied everywhere incl. installer**; Simple/Pro; i18n completion; multi-project dashboard.
- **W5.7 Templates + land-unit converter UI.**
- **W5.8 Perf budgets measured on reference machine.**

**P6 — Pilot (wks 29+)**
- **W6.1 Golden full run + engineer sign-off** · **W6.2 Real-user pilot + fix list** · **W6.3 v1.0 release.**

**Tracks & path:** five tracks — Geometry/CAD, Brain, Data/content, UI, Ops — become genuinely parallel once **W0.3 (schema)** and **W0.9 (interfaces)** are frozen. **Critical path:** W0.3 → spikes → W2.1 → W2.2 → **W2.10 (walking skeleton)** → W3.3–3.5 → W5.1 → W6.2. **Long pole:** W1.5 training data (starts week 4, runs continuously).
