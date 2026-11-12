# Published benchmark problems

Worked examples from public sources, transcribed with their printed answers. They are the only checks in the repository that do not
come from this project's own formulas. `src/validation/benchmarks.test.ts` converts each file to SI, runs the engine and the independent
reference implementation (`src/validation/reference.ts`) on the inputs and compares with the printed answers.

Rules for adding one:
- Public, freely available, worked in full. Record title, publisher, edition and URL. Do not copy prose, only inputs and answers.
- Keep the printed units (US here) so the file can be checked against the PDF; the test converts.
- Copy digits as printed, including rounding. A tolerance belongs in the test with a reason, never in the data.
- If the engine and the example disagree beyond that reason, it is a finding: write it in the `findings` list and in docs/handover/NEXT.md.
