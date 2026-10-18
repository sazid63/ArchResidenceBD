# Publishing models — W4.4 recipe

Written in W0.8 (this is the "HF org" half of the package); **executed at W4.4**. Owner-gated steps are marked ⛔.

## Org & naming

- ⛔ **Owner:** create the HF org (free) at huggingface.co — proposed name **`archresbd`** (renameable; the string is not a product surface). One fine-grained write token for uploads; `hf auth login` on the build machine. Parked in `docs/work/OWNER-ATTENTION.md`.
- Repo pattern: `<org>/<member>-<size>` — e.g. `archie-chat-4b`, `archie-repair-3b` (size = the trained base actually used), `archie-embed-0.6b` / `archie-rerank-0.6b` only if a redistribution is hosted.
- One repo per member; the repo's `README.md` **is** the filled card. Quants live in the same repo (a `-GGUF` sibling repo only if content ever needs separating).
- Datasets (if published) live under `<org>/…` with licence + provenance per the Source Registry (plan §5.10).

## Gates — nothing publishes before these

plan §7 eval gates: golden projects (BOQ within ±8 %, CAD execution success >90 %, drawings engineer-checked); rule-identification / override-handling / register-correctness; sloppy-input class. The exact eval run + numbers replace the card's Evaluation TBDs.

## Steps

1. ⛔ Org + token (once). `hf auth login`.
2. Quantize locally with llama.cpp `llama-quantize` from the merged fine-tune; record the exact command, training-run id, and sha256 + size of every produced file.
3. Fill the card: every TBD replaced (data counts, eval tables, quant list, exact base revision); `status: draft` → review → `published`; set `hfRepo`. A published card never contains a TBD (CI-enforced).
4. Upload repo + card (`README.md`); model card text uses technical/upstream naming (ADR-0004 scope is the product).
5. **Verify:** fresh download of the uploaded file; sha256 must equal the local artifact; record both in the registry entry notes.
6. Pin: add a **new** registry entry (`archie-chat-ft1` style) with the verified sha256/size + a new card file; shipped entries are never edited (registry law in `README.md`).
7. Installer policy: set `distribution` (`bundled` for the next installer vs `downloadable` model pack) in the same change as the installer manifest update (P1 installer consumes the registry).

## Licence rules

- Derivative licence default: **Apache-2.0** (matches all four bases). Owner confirms the licence at first publish.
- Reproduce base-model attribution + licence in the card; app-side notices (Licences screen) ship in the same commit as any bundled change (ADR-0004).

## Never

- Never publish a card with a TBD left.
- Never overwrite or delete a published artifact in place — new upload, new entry.
- Never put engine names in product surfaces; HF cards are technical docs (this does not loosen ADR-0004 anywhere else).
