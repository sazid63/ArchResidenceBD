---
cardVersion: "0.1.0"
id: archie-chat
role: chat
status: skeleton
displayNameEn: Archie Chat
displayNameBn: আর্চি চ্যাট
upstreamRepo: Qwen/Qwen3-4B-Instruct-2507
upstreamLicense: Apache-2.0
license: Apache-2.0
distribution: bundled
artifactSha256: 3605803b982cb64aead44f6c1b2ae36e3acdb41d8e46c8a94c6533bc4c67e597
artifactSizeBytes: 2497281120
hfRepo: ""
---

# Archie Chat — model card

> **Skeleton (W0.8).** Structure is machine-checked by `core/tests/test_model_cards.py`; every **TBD** fills in at publish time (recipe: `spec/models/publishing.md`). Never publish a card while a TBD remains.
> Pinned to registry entry `archie-chat` (`spec/models/registry.json`, fleet `archie-fleet-v1`). The card describes the **published artifact** — today that is the stock base bundled in the installer; the P1 fine-tune becomes a new registry entry with its own card.

## Narrow task contract

The voice of the app. One task family: conduct the phase interview (BN/EN, Banglish tolerated), parse free-text answers into Building Spec edits, and explain rule verdicts **with citations** from the pinned rule pack. Numbers and verdicts are always produced by the deterministic engines (spec/rule/BOQ scripts); the model only asks, phrases, and narrates. Never computes compliance values itself (plan §9 law: scripts first, AI last-mile).

## Intended use

- Phase interviews and follow-up questions (Site & Excavation … Common Services), BN or EN.
- Turning answers into candidate Spec patches (validated deterministically before commit).
- Explaining `compliant | deviation | impossible` verdicts and deviation alternatives in plain BN/EN, citing the pack.
- Narrating reports (BOQ summaries, engineer pack) where every figure traces to a script output.

## Out of scope

- Computing FAR/BCR/setbacks/BOQ numbers itself — those come from rule packs and scripts.
- Legal advice, certification, or engineer sign-off.
- General-purpose chat, languages beyond BN/EN/Banglish.
- Network access at runtime (offline-first; tool calls are separately permission-gated host features).

## Training data (TBD)

- Pipeline per plan §7: scripted generation for structure (rule numbers, geometry, templates) + teacher-model natural-language variety; target ~0.5M tokens.
- Language: BN + EN (hand-authored/reviewed templates — never machine-translated for user-facing question templates).
- Curriculum: advisory-and-override dialogues and impossibility explanations (plan §7). Refusal drills deliberately excluded — behavior is "advise, record, proceed".
- TBD at publish: exact counts, teacher model + revision, data card reference.

## Evaluation (TBD)

- Golden projects set (plan §7): interviews reproduce the golden spec; no coverage stalls.
- Rule-identification / override-handling / register-correctness checks.
- Sloppy-input class (Banglish, typos, "don't know") must trigger defaults, never stall.
- BN rendering + numeral handling reviewed by hand for question templates.
- TBD at publish: full eval tables + pass/fail vs gates.

## Limitations

- Can phrase imprecisely; may never supply an uncited number — if a figure cannot be traced to an engine output, it must not appear.
- BN orthography and Banglish coverage are known soft spots; covered by the sloppy-input eval class.
- Speculative decoding was measured and rejected on the reference machine (S2, ~8 % acceptance) — do not re-add without re-measuring.

## Licence & attribution

- Base: `Qwen/Qwen3-4B-Instruct-2507` — Apache-2.0.
- This derivative: Apache-2.0 (default = upstream licence family; owner confirms at first publish, W4.4).
- Attribution: base model name + licence reproduced in the published card and in the app's Licences screen notices.

## Provenance

- Bundled artifact today = stock upstream GGUF (`Q4_K_M`), sha256 pinned in `spec/models/registry.json` (also in this card's front matter).
- Any fine-tune or requantization = **new** registry entry (`archie-chat-ft1` style) + new card; shipped entries are never edited.
