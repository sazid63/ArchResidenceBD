# ArchResidenceBD parametric generator — mesh audit (baseline)

- Generated: 2026-10-28T20:21:12.743Z
- Tool: `scripts/mesh-audit.ts` (deterministic, mulberry32 seed `0x4a554449`, no `Math.random`)
- Cases: 50 (20 preset matrix + 8 column-size sweep + 20 seeded-random)
- Command: `npx tsx scripts/mesh-audit.ts`
- Wall time: 6.0 s
- `volumeM3` = structural concrete kinds (slab, beam, column, footing, wall, stair, tank, canopy, parapet)
- `duplicates` = distinct rounded-bbox (0.1 mm) groups with >= 2 members
- `overlaps` = box pairs with volume intersection > 1 mm3
- `zFights` = pairs with a shared face plane (<= 0.5 mm) whose face rectangles overlap > 100 mm2 AND whose volumes overlap (flush contacts are not flagged)

## Summary table

| case | stories | plotSqm | preset(s) | objects | triangles | volumeM3 | degenerates | duplicates | overlaps | zFights |
|---|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|
| `mx-01-s2-p200-preset-dual-3bed-c250` | 2 | 200 | preset-dual-3bed | 391 | 4692 | 299.04 | 0 | 0 | 177 | 125 |
| `mx-02-s6-p334.5-preset-dual-3bed-c400` | 6 | 334.5 | preset-dual-3bed | 1369 | 16428 | 932.78 | 0 | 0 | 600 | 390 |
| `mx-03-s4-p267.6-preset-single-luxury-c300` | 4 | 267.6 | preset-single-luxury | 702 | 8424 | 505.15 | 0 | 0 | 224 | 172 |
| `mx-04-s8-p133.8-preset-single-luxury-c350` | 8 | 133.8 | preset-single-luxury | 1272 | 15264 | 420.88 | 0 | 0 | 356 | 286 |
| `mx-05-s6-p334.5-preset-ground-parking-c350` | 6 | 334.5 | preset-ground-parking | 584 | 7008 | 786.76 | 0 | 0 | 232 | 157 |
| `mx-06-s2-p200-preset-ground-parking-c300` | 2 | 200 | preset-ground-parking | 244 | 2928 | 288.73 | 0 | 0 | 117 | 82 |
| `mx-07-s8-p133.8-preset-triple-rental-c400` | 8 | 133.8 | preset-triple-rental | 1139 | 13668 | 423.63 | 0 | 0 | 436 | 286 |
| `mx-08-s4-p267.6-preset-triple-rental-c250` | 4 | 267.6 | preset-triple-rental | 651 | 7812 | 494.53 | 0 | 0 | 282 | 195 |
| `mx-09-s2-p200-preset-duplex-courtyard-c250` | 2 | 200 | preset-duplex-courtyard | 272 | 3264 | 284.45 | 0 | 0 | 116 | 83 |
| `mx-10-s6-p334.5-preset-duplex-courtyard-c400` | 6 | 334.5 | preset-duplex-courtyard | 724 | 8688 | 791.27 | 0 | 0 | 235 | 160 |
| `mx-11-s4-p267.6-preset-studio-bachelor-c300` | 4 | 267.6 | preset-studio-bachelor | 606 | 7272 | 504.82 | 0 | 0 | 292 | 178 |
| `mx-12-s8-p133.8-preset-studio-bachelor-c350` | 8 | 133.8 | preset-studio-bachelor | 1027 | 12324 | 463.82 | 0 | 0 | 500 | 314 |
| `mx-13-s6-p334.5-preset-commercial-mixed-c350` | 6 | 334.5 | preset-commercial-mixed | 664 | 7968 | 791.68 | 0 | 0 | 325 | 210 |
| `mx-14-s2-p200-preset-commercial-mixed-c300` | 2 | 200 | preset-commercial-mixed | 242 | 2904 | 306.52 | 0 | 0 | 136 | 88 |
| `mx-15-s8-p133.8-preset-family-duplex-c400` | 8 | 133.8 | preset-family-duplex | 873 | 10476 | 420.58 | 0 | 0 | 289 | 202 |
| `mx-16-s4-p267.6-preset-family-duplex-c250` | 4 | 267.6 | preset-family-duplex | 477 | 5724 | 497.40 | 0 | 0 | 186 | 132 |
| `mx-17-s2-p200-preset-penthouse-luxury-c250` | 2 | 200 | preset-penthouse-luxury | 247 | 2964 | 284.22 | 0 | 0 | 107 | 77 |
| `mx-18-s6-p334.5-preset-penthouse-luxury-c400` | 6 | 334.5 | preset-penthouse-luxury | 599 | 7188 | 790.16 | 0 | 0 | 195 | 130 |
| `mx-19-s4-p267.6-preset-narrow-duct-c300` | 4 | 267.6 | preset-narrow-duct | 396 | 4752 | 503.83 | 0 | 0 | 159 | 103 |
| `mx-20-s8-p133.8-preset-narrow-duct-c350` | 8 | 133.8 | preset-narrow-duct | 663 | 7956 | 443.29 | 0 | 0 | 192 | 146 |
| `mx-21-s6-p334.5-preset-architect-villa-c350` | 6 | 334.5 | preset-architect-villa | 1149 | 13788 | 893.35 | 0 | 0 | 469 | 290 |
| `mx-22-s2-p200-preset-architect-villa-c300` | 2 | 200 | preset-architect-villa | 340 | 4080 | 298.78 | 0 | 0 | 156 | 104 |
| `col-23-s2-c250-preset-family-duplex` | 2 | 267.6 | preset-family-duplex | 267 | 3204 | 362.97 | 0 | 0 | 120 | 86 |
| `col-24-s2-c300-preset-penthouse-luxury` | 2 | 334.5 | preset-penthouse-luxury | 247 | 2964 | 444.86 | 0 | 0 | 107 | 74 |
| `col-25-s4-c250-preset-narrow-duct` | 4 | 334.5 | preset-narrow-duct | 393 | 4716 | 601.26 | 0 | 0 | 152 | 104 |
| `col-26-s4-c300-preset-architect-villa` | 4 | 133.8 | preset-architect-villa | 595 | 7140 | 285.97 | 0 | 0 | 252 | 171 |
| `col-27-s6-c350-preset-ground-parking` | 6 | 267.6 | preset-ground-parking | 612 | 7344 | 655.07 | 0 | 0 | 236 | 157 |
| `col-28-s6-c400-preset-triple-rental` | 6 | 334.5 | preset-triple-rental | 944 | 11328 | 787.35 | 0 | 0 | 355 | 230 |
| `col-29-s8-c350-preset-duplex-courtyard` | 8 | 334.5 | preset-duplex-courtyard | 922 | 11064 | 949.76 | 0 | 0 | 295 | 200 |
| `col-30-s8-c400-preset-studio-bachelor` | 8 | 133.8 | preset-studio-bachelor | 1027 | 12324 | 473.55 | 0 | 0 | 500 | 314 |
| `rnd-31-s5-p209.7` | 5 | 209.7 | mixed(4):preset-commercial-mixed|preset-single-luxury|preset-duplex-court… | 748 | 8976 | 480.91 | 0 | 0 | 288 | 198 |
| `rnd-32-s6-p165.7` | 6 | 165.7 | mixed(4):preset-triple-rental|preset-studio-bachelor|preset-single-luxury… | 1012 | 12144 | 464.91 | 0 | 0 | 383 | 263 |
| `rnd-33-s2-p378.9` | 2 | 378.9 | preset-dual-3bed | 409 | 4908 | 534.60 | 0 | 0 | 191 | 128 |
| `rnd-34-s4-p344.1` | 4 | 344.1 | mixed(2):preset-ground-parking|preset-architect-villa | 634 | 7608 | 642.58 | 0 | 0 | 250 | 169 |
| `rnd-35-s7-p127.6` | 7 | 127.6 | mixed(6):preset-duplex-courtyard|preset-commercial-mixed|preset-penthouse… | 835 | 10020 | 407.41 | 0 | 0 | 313 | 211 |
| `rnd-36-s2-p165.4` | 2 | 165.4 | preset-narrow-duct | 232 | 2784 | 240.64 | 0 | 0 | 104 | 71 |
| `rnd-37-s6-p333` | 6 | 333 | mixed(3):preset-penthouse-luxury|preset-commercial-mixed|preset-architect… | 851 | 10212 | 779.25 | 0 | 0 | 344 | 225 |
| `rnd-38-s7-p246` | 7 | 246 | mixed(6):preset-commercial-mixed|preset-architect-villa|preset-ground-par… | 978 | 11736 | 648.20 | 0 | 0 | 394 | 270 |
| `rnd-39-s6-p241.1` | 6 | 241.1 | mixed(4):preset-single-luxury|preset-dual-3bed|preset-triple-rental|prese… | 1015 | 12180 | 592.92 | 0 | 0 | 349 | 253 |
| `rnd-40-s5-p291.9` | 5 | 291.9 | mixed(3):preset-studio-bachelor|preset-family-duplex|preset-commercial-mi… | 669 | 8028 | 611.87 | 0 | 0 | 297 | 193 |
| `rnd-41-s7-p227.4` | 7 | 227.4 | mixed(5):preset-triple-rental|preset-single-luxury|preset-duplex-courtyar… | 842 | 10104 | 569.78 | 0 | 0 | 293 | 209 |
| `rnd-42-s8-p332.7` | 8 | 332.7 | mixed(4):preset-narrow-duct|preset-ground-parking|preset-family-duplex|pr… | 731 | 8772 | 890.92 | 0 | 0 | 256 | 180 |
| `rnd-43-s6-p166.6` | 6 | 166.6 | mixed(5):preset-dual-3bed|preset-penthouse-luxury|preset-ground-parking|p… | 823 | 9876 | 431.11 | 0 | 0 | 332 | 225 |
| `rnd-44-s6-p166.2` | 6 | 166.2 | mixed(4):preset-family-duplex|preset-triple-rental|preset-narrow-duct|pre… | 771 | 9252 | 445.52 | 0 | 0 | 308 | 210 |
| `rnd-45-s2-p207.2` | 2 | 207.2 | preset-penthouse-luxury | 240 | 2880 | 298.19 | 0 | 0 | 104 | 71 |
| `rnd-46-s3-p276.6` | 3 | 276.6 | mixed(2):preset-commercial-mixed|preset-duplex-courtyard | 355 | 4260 | 426.08 | 0 | 0 | 162 | 108 |
| `rnd-47-s7-p132` | 7 | 132 | mixed(5):preset-family-duplex|preset-studio-bachelor|preset-duplex-courty… | 839 | 10068 | 409.82 | 0 | 0 | 288 | 205 |
| `rnd-48-s7-p285.9` | 7 | 285.9 | mixed(5):preset-studio-bachelor|preset-family-duplex|preset-architect-vil… | 1040 | 12480 | 796.37 | 0 | 0 | 403 | 275 |
| `rnd-49-s5-p179.3` | 5 | 179.3 | mixed(3):preset-studio-bachelor|preset-penthouse-luxury|preset-commercial… | 583 | 6996 | 423.63 | 0 | 0 | 254 | 171 |
| `rnd-50-s6-p313.2` | 6 | 313.2 | mixed(4):preset-triple-rental|preset-studio-bachelor|preset-family-duplex… | 791 | 9492 | 665.26 | 0 | 0 | 319 | 216 |

## Top 20 worst volume-overlap pairs (all cases)

| # | overlap mm3 | case | object A (kind) | object B (kind) |
|---:|---:|---|---|---|
| 1 | 1,047,578,125 | `rnd-50-s6-p313.2` | entrance_canopy (canopy) | balcony_front_f1 (balcony) |
| 2 | 968,175,000 | `rnd-33-s2-p378.9` | plinth_wall (plinth) | g_w5 (wall) |
| 3 | 968,175,000 | `rnd-33-s2-p378.9` | plinth_wall (plinth) | g_w11 (wall) |
| 4 | 958,824,000 | `mx-02-s6-p334.5-preset-dual-3bed-c400` | entrance_canopy (canopy) | balcony_front_f1 (balcony) |
| 5 | 958,824,000 | `mx-10-s6-p334.5-preset-duplex-courtyard-c400` | entrance_canopy (canopy) | balcony_front_f1 (balcony) |
| 6 | 958,824,000 | `mx-18-s6-p334.5-preset-penthouse-luxury-c400` | entrance_canopy (canopy) | balcony_front_f1 (balcony) |
| 7 | 958,824,000 | `col-28-s6-c400-preset-triple-rental` | entrance_canopy (canopy) | balcony_front_f1 (balcony) |
| 8 | 956,064,000 | `rnd-42-s8-p332.7` | entrance_canopy (canopy) | balcony_front_f1 (balcony) |
| 9 | 955,374,000 | `mx-05-s6-p334.5-preset-ground-parking-c350` | entrance_canopy (canopy) | balcony_front_f1 (balcony) |
| 10 | 955,374,000 | `mx-13-s6-p334.5-preset-commercial-mixed-c350` | entrance_canopy (canopy) | balcony_front_f1 (balcony) |
| 11 | 955,374,000 | `mx-21-s6-p334.5-preset-architect-villa-c350` | entrance_canopy (canopy) | balcony_front_f1 (balcony) |
| 12 | 955,374,000 | `col-29-s8-c350-preset-duplex-courtyard` | entrance_canopy (canopy) | balcony_front_f1 (balcony) |
| 13 | 951,924,000 | `col-24-s2-c300-preset-penthouse-luxury` | entrance_canopy (canopy) | balcony_front_f1 (balcony) |
| 14 | 948,474,000 | `col-25-s4-c250-preset-narrow-duct` | entrance_canopy (canopy) | balcony_front_f1 (balcony) |
| 15 | 917,100,000 | `rnd-34-s4-p344.1` | plinth_wall (plinth) | g_w5 (wall) |
| 16 | 917,100,000 | `rnd-34-s4-p344.1` | plinth_wall (plinth) | g_w11 (wall) |
| 17 | 906,637,500 | `col-25-s4-c250-preset-narrow-duct` | plinth_wall (plinth) | g_w5 (wall) |
| 18 | 906,637,500 | `col-25-s4-c250-preset-narrow-duct` | plinth_wall (plinth) | g_w11 (wall) |
| 19 | 901,012,500 | `col-24-s2-c300-preset-penthouse-luxury` | plinth_wall (plinth) | g_w5 (wall) |
| 20 | 901,012,500 | `col-24-s2-c300-preset-penthouse-luxury` | plinth_wall (plinth) | g_w11 (wall) |

## Top 10 worst z-fighting pairs (all cases)

| # | face overlap mm2 | volume overlap mm3 | plane | case | object A (kind) | object B (kind) |
|---:|---:|---:|---|---|---|---|
| 1 | 7,571,228 | 378,561,400 | Z=600.0 | `rnd-33-s2-p378.9` | plinth_wall (plinth) | g_g_bath_bath_basin (bath) |
| 2 | 6,633,214 | 331,660,700 | Z=600.0 | `rnd-34-s4-p344.1` | plinth_wall (plinth) | g_g_bath_bath_basin (bath) |
| 3 | 6,372,675 | 318,633,750 | Z=600.0 | `mx-02-s6-p334.5-preset-dual-3bed-c400` | plinth_wall (plinth) | g_g_bath_bath_basin (bath) |
| 4 | 6,372,675 | 318,633,750 | Z=600.0 | `mx-05-s6-p334.5-preset-ground-parking-c350` | plinth_wall (plinth) | g_g_bath_bath_basin (bath) |
| 5 | 6,372,675 | 318,633,750 | Z=600.0 | `mx-10-s6-p334.5-preset-duplex-courtyard-c400` | plinth_wall (plinth) | g_g_bath_bath_basin (bath) |
| 6 | 6,372,675 | 318,633,750 | Z=600.0 | `mx-13-s6-p334.5-preset-commercial-mixed-c350` | plinth_wall (plinth) | g_g_bath_bath_basin (bath) |
| 7 | 6,372,675 | 318,633,750 | Z=600.0 | `mx-18-s6-p334.5-preset-penthouse-luxury-c400` | plinth_wall (plinth) | g_g_bath_bath_basin (bath) |
| 8 | 6,372,675 | 318,633,750 | Z=600.0 | `mx-21-s6-p334.5-preset-architect-villa-c350` | plinth_wall (plinth) | g_g_bath_bath_basin (bath) |
| 9 | 6,372,675 | 318,633,750 | Z=600.0 | `col-24-s2-c300-preset-penthouse-luxury` | plinth_wall (plinth) | g_g_bath_bath_basin (bath) |
| 10 | 6,372,675 | 318,633,750 | Z=600.0 | `col-25-s4-c250-preset-narrow-duct` | plinth_wall (plinth) | g_g_bath_bath_basin (bath) |
