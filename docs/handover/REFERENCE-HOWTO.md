# Reference and regression checks

`npm run audit:reference` runs three checks (see `scripts/audits/reference.audit.ts`):

1. **Hand-calculated references** (optional). Copy `spec/reference/TEMPLATE.json` to `spec/reference/<name>.json`, fill in the input
   (plot, storeys, plan id) and any numbers you calculated by hand (slab thickness, deepest beam, ground column, largest footing,
   concrete, steel, steel per m2 of floor, formwork). Leave a value `null` to skip it. The audit fails when the app differs by more
   than the tolerance (15 %, steel 20 % unless you set it). The comparison table is written to
   `scripts/audits/audit-out/reference.md`. No reference is needed to ship: the owner decided not to hand-calculate buildings.
2. **Regression snapshot** (`spec/reference/snapshot.json`). Seven fixed buildings; a key figure that moves by more than 2 % fails the
   audit, so an engine change cannot shift a number unseen. After an intended change run
   `UPDATE_SNAPSHOT=1 npm run audit:reference`, commit the new snapshot and say why in the commit message.
3. **Self-consistency.** Steel stays between 60 and 160 kg per m3 of concrete, the pour volumes add up to the BOQ concrete, and the
   formwork areas equal the BOQ formwork lines.
