# Interface examples (W0.9)

Validated in `core/tests/test_interfaces.py` against the schemas in `spec/schemas/`. Drift = CI failure.

| File | Schema | Demonstrates |
|---|---|---|
| `job-request-geometry.json` | `job-protocol` | Data-plane request envelope (kind `geometry.build`, S4-grounded params) |
| `job-result-drawing.json` | `job-protocol` | `ok` result with byte-stable artifacts (SVG + DXF, S3) |
| `job-result-error.json` | `job-protocol` | `error` result with a frozen code (`worker_restarted`, S4) |
| `rate-card-dhaka-example.json` | `rate-card` | All five cost types, machinery inclusion flags, regional multipliers, `status=candidate` |
| `verdict-set-example.json` | `verdict` | All three statuses; deviation with machine-applicable `specPatch`; `unevaluated[]`; pack pinned by sha256 |

## Where values are real vs illustrative

- **Real (asserted by tests):** the rule-pack `id` and `sha256` in the verdict example (actual hash of `spec/rules/rajuk-2008.yaml`), and every citation key / rule ref (they must exist in the pack). The fleet manifest `spec/models/registry.json` carries real artifact hashes + sizes (S2).
- **Illustrative:** job ids, artifact hashes/sizes, spec revision hash, rate numbers, dates. All illustrative sha256 values are the hash of an `archres-example:*` marker string — valid format, obviously not a real artifact. The rate card is explicitly `status=candidate` with a `manual` source; **never use it for a BOQ**.
