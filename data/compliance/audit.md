# Compliance audit

- **Rule pack:** `rajuk@2008.1` (sha256 `ae9738b45811`, Pack status: **candidate**)
- **Building Spec:** revision 0, sha256 `76a17f423bc8`
- **Evaluated:** 2026-10-21T00:00:00+00:00
- **Evaluator:** compliance-engine@0.1.0

## Summary

- Compliant: 3
- Deviation: 3
- Impossible: 0
- Not evaluated (the pack declares these gaps): 12

## Compliant (3)

### `rajuk@2008.1#setback-schedule` — Mandatory setbacks from boundaries

Rear setback 2 m meets the required minimum 2 m.

- Measured: 2.0 m (/phases/site-excavation/data/setbackRearM)
- Limit: ≥ 2.0 m
- Citations: setbacks, s46-3-4

### `rajuk@2008.1#setback-schedule` — Mandatory setbacks from boundaries

Left-side setback 1.25 m meets the required minimum 1.25 m.

- Measured: 1.25 m (/phases/site-excavation/data/setbackSideLeftM)
- Limit: ≥ 1.25 m
- Citations: setbacks, s46-3-4

### `rajuk@2008.1#setback-schedule` — Mandatory setbacks from boundaries

Right-side setback 1.25 m meets the required minimum 1.25 m.

- Measured: 1.25 m (/phases/site-excavation/data/setbackSideRightM)
- Limit: ≥ 1.25 m
- Citations: setbacks, s46-3-4

## Deviation (3)

### `rajuk@2008.1#far-tables` — FAR and ground coverage tables, Tables 3(ka)-(cha)

Proposed FAR 4.19 exceeds the limit 3.5 for this plot (334.45 sqm, class A1-A4, 6 m road); reduce the planned total floor area to 1170.57 sqm or less.

- Measured: 4.186 FAR (/phases/site-excavation/data/plannedTotalFloorAreaSqm)
- Limit: ≤ 3.5 FAR
- Citations: far-3ka

### `rajuk@2008.1#setback-schedule` — Mandatory setbacks from boundaries

Front setback 1.2 m is below the required minimum 1.5 m; increase it to 1.5 m.

- Measured: 1.2 m (/phases/site-excavation/data/setbackFrontM)
- Limit: ≥ 1.5 m
- Citations: setbacks, s46-3-4

### `rajuk@2008.1#schedule4-parking` — Parking (Schedule 4)

1 car space(s) are fewer than the required 7 (Schedule 4); provide 7. (typical flat area 150 sqm x 10 units.)

- Measured: 1 spaces (/phases/site-excavation/data/parkingSpaces)
- Limit: ≥ 7 spaces
- Citations: schedule4, schedule4-notes

## Not evaluated (the pack declares these gaps) (12)

- `rajuk@2008.1#gap-c1` — §46(5)(ক): one word in the sentence on the permitted roofed structure over the paved MOS (the sentence carrying the 50% soil-retention condition) is not readable from this edition.
- `rajuk@2008.1#gap-c3` — Schedule 4 notes: one word in the motorcycle/car parking condition for flats up to 90 sqm is not readable with certainty.
- `rajuk@2008.1#gap-c4` — Appendix 5 (definitions) is not transcribed.
- `rajuk@2008.1#gap-c6` — §51(11): whether a partial 0.30 m step earns a pro-rata FAR bonus is not settled by the text; §51(15): the ম্ন conjunct glyph of 'নিম্নের ছক' is missing in this edition.
- `rajuk@2008.1#gap-c8` — Amendments to the 2008 Bidhimala published after 2008 are not researched.
- `rajuk@2008.1#gap-c9` — The 2025-12-14 DAP FAR reform is recorded as metadata only; its primary document is not obtained and nothing from it is encoded.
- `rajuk@2008.1#gap-c10` — Two legacy-font glitch words are not page-image verifiable in this edition: §52(2) (text-layer decodes to স্ব-স্ব, high confidence) and §53(2)(ঙ) (probable স্বার্থ).
- `rajuk@2008.1#gap-topic-staircase-width` — This pack contains no rule for a minimum staircase width (the staircase is mentioned only in passing, in the ramp/landing provisions). এই প্যাকে সিঁড়ির ন্যূনতম প্রস্থের কোনো বিধান নেই।
- `rajuk@2008.1#gap-topic-parapet-height` — This pack contains no minimum height for a parapet wall; parapets appear only inside portico footnotes. এই প্যাকে পারাপেট/প্যারাপিট দেওয়ালের ন্যূনতম উচ্চতার কোনো বিধান নেই।
- `rajuk@2008.1#gap-topic-concrete-grade` — This pack contains no concrete grade rule and no structural material rule (those are BNBC provisions). এই প্যাকে কংক্রিট গ্রেড বা কাঠামো বস্তুর কোনো বিধান নেই।
- `rajuk@2008.1#gap-topic-lift-count` — This pack contains no rule for the lift count in a building (a lift study, not a gazette rule). এই প্যাকে টাওয়ারে বা অন্য কোনো ভবনে লিফট সংখ্যা নির্ধারণের কোনো বিধান নেই।
- `rajuk@2008.1#gap-c11` — §58 (ইমারতের পরিসরের ন্যূনতম চাহিদা, minimum space requirements for habitable rooms etc.) is not transcribed into the pack.
