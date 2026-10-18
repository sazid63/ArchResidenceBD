# Models — fleet manifest

`registry.json` is the **model registry v0** (W0.9): the product's fleet manifest — one entry per shipped role, pinned by artifact sha256. It is validated against `spec/schemas/model-registry.schema.json` in `core/tests/test_interfaces.py`.

- **Consumers:** the installer/downloader (P1), the W0.8 model cards, the Licences screen (ADR-0004: upstream names and licences live only behind the Licences screen, nowhere else user-visible).
- **User-facing rule:** only `displayName` is ever shown. `upstream` / `runtime` are internal provenance (ADR-0004).
- **Provenance:** `sha256` and `sizeBytes` are the artifacts measured on the reference machine in spike S2 (`data/downloads/s2/models`, gitignored).
- **Fleet v1** is frozen at four roles: chat / repair / embed / rerank. The S2 draft model (Qwen3-0.6B) is excluded on purpose — see the registry `notes`.
- **Updates:** a new base model or a fine-tune is a **new entry** (e.g. id `archie-chat-ft1`), never an edit of a shipped one; removing an entry is an ADR-level change.

Validate: `uv run --directory core pytest -q -k interfaces`
