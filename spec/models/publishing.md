# Publishing models — W4.4 recipe

Written in W0.8 (this is the "where to publish" half of the package); **executed at W4.4**. Owner-gated steps are marked ⛔.

## Where the models are published

**The owner's decision (2026-10-22): the models are packaged with the final app** · — the user downloads the app once ·, installs it ·, and the models are there · ·. So there is **no model download** ·, **no model registry** ·, **no Hugging Face account** · and **no token** · · — and the registry already said `distribution: bundled` · ✓ ✓ (the code now follows it ✓: the installer **copies** the GGUFs ✓ ✓ and the **cards** travel with them ✓ ✓).

- **The release is the app** · — one download ·, the installer with the models inside it · ·, and the model cards beside them · (in the install folder's `licenses/model-cards/` ·) · ✓ ✓.
- **The bundle is big** · — the chat model alone is ~2.4 GB · — and that is the trade the owner chose ✓: the user clicks once · and everything is there · ✓ ✓.
- **The GGUFs never enter the repository** · — they are gitignored · — the build machine holds them · (`ARCHRES_MODELS` ·, or the repo's own downloads folder ✓) ✓ ✓, and the installer copies from there ✓ ✓.
- **The model's hash is still pinned** · — the registry keeps it ✓ — and the installer **checks** it after copying ✓ (the plan's law ✓: a number nobody verified is a candidate ✓ ✓) ✓.
- **A future update** may fetch a newer model · (W5.4 ·) — through the downloader · (W5.2 ·), resumable ✓ and checksummed ✓ ✓ — but the **first install** needs nothing fetched ✓ ✓ ✓.
- Datasets (if published) live with the app · with licence + provenance per the Source Registry (plan §5.10) ·.

## Gates — nothing publishes before these

plan §7 eval gates: golden projects (BOQ within ±8 %, CAD execution success >90 %, drawings engineer-checked); rule-identification / override-handling / register-correctness; sloppy-input class. The exact eval run + numbers replace the card's Evaluation TBDs.

## Steps

1. Quantize locally with llama.cpp `llama-quantize` from the merged fine-tune; record the exact command, training-run id, and sha256 + size of every produced file.
2. Fill the card: every TBD replaced (data counts, eval tables, quant list, exact base revision); `status: draft` → review → `published`. A published card never contains a TBD (CI-enforced). The card travels with the model (in the install folder's `licenses/model-cards/` ·) ·, so the model's documentation is wherever the model is ·.
3. **Verify the local artifact:** the sha256 must equal the local file's ·, and it must equal the registry's pin ·; record both in the registry entry notes ·.
4. Pin: add a **new** registry entry (`archie-chat-ft1` style) with the verified sha256/size + a new card file; shipped entries are never edited (registry law in `README.md`).
5. **Build the installer** with the models inside · — the installer's plan copies the GGUFs ✓ and the cards ✓ from the build machine's model folder (`ARCHRES_MODELS` ·) ✓, and **verifies each hash after copying** ✓ ✓.
6. ⛔ **Owner (once):** where the app is **distributed** · — the owner decides ✓ (a private link ·, a store ·, a release ·) ✓. The app needs no account of ours and no token ✓ ✓ — the models are inside it ✓ ✓.
7. Installer policy: `distribution` stays `bundled` ✓ (the model pack ships with the app ✓) ✓ — and a future *update* may fetch a newer model · through the downloader ✓ (W5.2 ·) ✓.

## Licence rules

- Derivative licence default: **Apache-2.0** (matches all four bases). Owner confirms the licence at first publish.
- Reproduce base-model attribution + licence in the card; app-side notices (Licences screen) ship in the same commit as any bundled change (ADR-0004).

## Never

- Never publish a card with a TBD left.
- Never overwrite or delete a published artifact in place — new upload, new entry.
- Never put engine names in product surfaces; model cards are technical docs (this does not loosen ADR-0004 anywhere else).
