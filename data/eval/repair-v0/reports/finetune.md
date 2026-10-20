# repair eval - finetune

- replies: 4
- executed: 4
- passes own case: 3 (0.75)
- no collateral damage: 3 (0.75)
- identical to the known-good macro: 1 (0.25)

| mutation | case | executed | passes | no collateral | identical | detail |
|---|---|---|---|---|---|---|
| column-unit-slip | foundation.pads.1x1 | True | False | False | False | None: total volumeM3 is 0.432, expected 0.674..0.676; Pad_1 volume is 0.432 m3, expected 0.674..0.676; Pad_1 extent 2 is |
| float-arity | foundation.pads.1x1 | True | True | True | True | the case passed |
| pads-hard-coded | foundation.pads.6x3 | True | True | True | False | the case passed |
| volume-divide-zero | foundation.pads.1x1 | True | True | True | False | the case passed |
