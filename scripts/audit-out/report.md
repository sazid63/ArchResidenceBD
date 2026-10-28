# ArchResidenceBD parametric generator — mesh audit (baseline)

- Generated: 2026-10-28T13:34:52.639Z
- Tool: `scripts/mesh-audit.ts` (deterministic, mulberry32 seed `0x4a554449`, no `Math.random`)
- Cases: 50 (20 preset matrix + 8 column-size sweep + 20 seeded-random)
- Command: `npx tsx scripts/mesh-audit.ts`
- Wall time: 7.2 s
- `volumeM3` = structural concrete kinds (slab, beam, column, footing, wall, stair, tank, canopy, parapet)
- `duplicates` = distinct rounded-bbox (0.1 mm) groups with >= 2 members
- `overlaps` = box pairs with volume intersection > 1 mm3
- `zFights` = pairs with a shared face plane (<= 0.5 mm) whose face rectangles overlap > 100 mm2 AND whose volumes overlap (flush contacts are not flagged)

## Summary table

| case | stories | plotSqm | preset(s) | objects | triangles | volumeM3 | degenerates | duplicates | overlaps | zFights |
|---|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|
| `mx-01-s2-p200-preset-dual-3bed-c250` | 2 | 200 | preset-dual-3bed | 386 | 4632 | 347.23 | 0 | 0 | 110 | 72 |
| `mx-02-s6-p334.5-preset-dual-3bed-c400` | 6 | 334.5 | preset-dual-3bed | 1347 | 16164 | 908.53 | 0 | 0 | 468 | 302 |
| `mx-03-s4-p267.6-preset-single-luxury-c300` | 4 | 267.6 | preset-single-luxury | 700 | 8400 | 591.78 | 0 | 0 | 156 | 121 |
| `mx-04-s8-p133.8-preset-single-luxury-c350` | 8 | 133.8 | preset-single-luxury | 1271 | 15252 | 455.85 | 0 | 0 | 307 | 252 |
| `mx-05-s6-p334.5-preset-ground-parking-c350` | 6 | 334.5 | preset-ground-parking | 572 | 6864 | 902.19 | 0 | 0 | 130 | 89 |
| `mx-06-s2-p200-preset-ground-parking-c300` | 2 | 200 | preset-ground-parking | 240 | 2880 | 350.02 | 0 | 0 | 51 | 34 |
| `mx-07-s8-p133.8-preset-triple-rental-c400` | 8 | 133.8 | preset-triple-rental | 1124 | 13488 | 458.59 | 0 | 0 | 334 | 224 |
| `mx-08-s4-p267.6-preset-triple-rental-c250` | 4 | 267.6 | preset-triple-rental | 643 | 7716 | 582.30 | 0 | 0 | 202 | 138 |
| `mx-09-s2-p200-preset-duplex-courtyard-c250` | 2 | 200 | preset-duplex-courtyard | 269 | 3228 | 346.64 | 0 | 0 | 56 | 36 |
| `mx-10-s6-p334.5-preset-duplex-courtyard-c400` | 6 | 334.5 | preset-duplex-courtyard | 717 | 8604 | 902.70 | 0 | 0 | 158 | 107 |
| `mx-11-s4-p267.6-preset-studio-bachelor-c300` | 4 | 267.6 | preset-studio-bachelor | 592 | 7104 | 589.87 | 0 | 0 | 186 | 112 |
| `mx-12-s8-p133.8-preset-studio-bachelor-c350` | 8 | 133.8 | preset-studio-bachelor | 991 | 11892 | 440.16 | 0 | 0 | 327 | 210 |
| `mx-13-s6-p334.5-preset-commercial-mixed-c350` | 6 | 334.5 | preset-commercial-mixed | 657 | 7884 | 902.48 | 0 | 0 | 243 | 157 |
| `mx-14-s2-p200-preset-commercial-mixed-c300` | 2 | 200 | preset-commercial-mixed | 238 | 2856 | 348.90 | 0 | 0 | 69 | 43 |
| `mx-15-s8-p133.8-preset-family-duplex-c400` | 8 | 133.8 | preset-family-duplex | 865 | 10380 | 455.57 | 0 | 0 | 215 | 154 |
| `mx-16-s4-p267.6-preset-family-duplex-c250` | 4 | 267.6 | preset-family-duplex | 472 | 5664 | 585.26 | 0 | 0 | 118 | 81 |
| `mx-17-s2-p200-preset-penthouse-luxury-c250` | 2 | 200 | preset-penthouse-luxury | 245 | 2940 | 346.44 | 0 | 0 | 51 | 32 |
| `mx-18-s6-p334.5-preset-penthouse-luxury-c400` | 6 | 334.5 | preset-penthouse-luxury | 597 | 7164 | 901.70 | 0 | 0 | 138 | 87 |
| `mx-19-s4-p267.6-preset-narrow-duct-c300` | 4 | 267.6 | preset-narrow-duct | 394 | 4728 | 589.18 | 0 | 0 | 99 | 61 |
| `mx-20-s8-p133.8-preset-narrow-duct-c350` | 8 | 133.8 | preset-narrow-duct | 662 | 7944 | 478.73 | 0 | 0 | 145 | 112 |
| `mx-21-s6-p334.5-preset-architect-villa-c350` | 6 | 334.5 | preset-architect-villa | 1132 | 13584 | 893.42 | 0 | 0 | 363 | 222 |
| `mx-22-s2-p200-preset-architect-villa-c300` | 2 | 200 | preset-architect-villa | 335 | 4020 | 348.64 | 0 | 0 | 89 | 56 |
| `col-23-s2-c250-preset-family-duplex` | 2 | 267.6 | preset-family-duplex | 264 | 3168 | 450.89 | 0 | 0 | 60 | 39 |
| `col-24-s2-c300-preset-penthouse-luxury` | 2 | 334.5 | preset-penthouse-luxury | 245 | 2940 | 556.99 | 0 | 0 | 50 | 31 |
| `col-25-s4-c250-preset-narrow-duct` | 4 | 334.5 | preset-narrow-duct | 391 | 4692 | 715.22 | 0 | 0 | 94 | 59 |
| `col-26-s4-c300-preset-architect-villa` | 4 | 133.8 | preset-architect-villa | 585 | 7020 | 303.67 | 0 | 0 | 178 | 122 |
| `col-27-s6-c350-preset-ground-parking` | 6 | 267.6 | preset-ground-parking | 600 | 7200 | 743.62 | 0 | 0 | 133 | 90 |
| `col-28-s6-c400-preset-triple-rental` | 6 | 334.5 | preset-triple-rental | 932 | 11184 | 898.61 | 0 | 0 | 258 | 167 |
| `col-29-s8-c350-preset-duplex-courtyard` | 8 | 334.5 | preset-duplex-courtyard | 913 | 10956 | 1059.31 | 0 | 0 | 210 | 143 |
| `col-30-s8-c400-preset-studio-bachelor` | 8 | 133.8 | preset-studio-bachelor | 991 | 11892 | 450.32 | 0 | 0 | 327 | 210 |
| `rnd-31-s5-p209.7` | 5 | 209.7 | mixed(4):preset-commercial-mixed|preset-single-luxury|preset-duplex-court… | 740 | 8880 | 509.32 | 0 | 0 | 210 | 148 |
| `rnd-32-s6-p165.7` | 6 | 165.7 | mixed(4):preset-triple-rental|preset-studio-bachelor|preset-single-luxury… | 998 | 11976 | 489.89 | 0 | 0 | 282 | 194 |
| `rnd-33-s2-p378.9` | 2 | 378.9 | preset-dual-3bed | 403 | 4836 | 632.60 | 0 | 0 | 120 | 76 |
| `rnd-34-s4-p344.1` | 4 | 344.1 | mixed(2):preset-ground-parking|preset-architect-villa | 624 | 7488 | 711.91 | 0 | 0 | 174 | 115 |
| `rnd-35-s7-p127.6` | 7 | 127.6 | mixed(6):preset-duplex-courtyard|preset-commercial-mixed|preset-penthouse… | 823 | 9876 | 418.31 | 0 | 0 | 227 | 150 |
| `rnd-36-s2-p165.4` | 2 | 165.4 | preset-narrow-duct | 230 | 2760 | 288.73 | 0 | 0 | 50 | 32 |
| `rnd-37-s6-p333` | 6 | 333 | mixed(3):preset-penthouse-luxury|preset-commercial-mixed|preset-architect… | 841 | 10092 | 843.93 | 0 | 0 | 268 | 172 |
| `rnd-38-s7-p246` | 7 | 246 | mixed(6):preset-commercial-mixed|preset-architect-villa|preset-ground-par… | 966 | 11592 | 695.63 | 0 | 0 | 299 | 205 |
| `rnd-39-s6-p241.1` | 6 | 241.1 | mixed(4):preset-single-luxury|preset-dual-3bed|preset-triple-rental|prese… | 1006 | 12072 | 650.27 | 0 | 0 | 262 | 193 |
| `rnd-40-s5-p291.9` | 5 | 291.9 | mixed(3):preset-studio-bachelor|preset-family-duplex|preset-commercial-mi… | 657 | 7884 | 709.20 | 0 | 0 | 201 | 128 |
| `rnd-41-s7-p227.4` | 7 | 227.4 | mixed(5):preset-triple-rental|preset-single-luxury|preset-duplex-courtyar… | 835 | 10020 | 642.20 | 0 | 0 | 221 | 158 |
| `rnd-42-s8-p332.7` | 8 | 332.7 | mixed(4):preset-narrow-duct|preset-ground-parking|preset-family-duplex|pr… | 725 | 8700 | 999.35 | 0 | 0 | 186 | 132 |
| `rnd-43-s6-p166.6` | 6 | 166.6 | mixed(5):preset-dual-3bed|preset-penthouse-luxury|preset-ground-parking|p… | 809 | 9708 | 456.25 | 0 | 0 | 234 | 159 |
| `rnd-44-s6-p166.2` | 6 | 166.2 | mixed(4):preset-family-duplex|preset-triple-rental|preset-narrow-duct|pre… | 756 | 9072 | 471.72 | 0 | 0 | 208 | 139 |
| `rnd-45-s2-p207.2` | 2 | 207.2 | preset-penthouse-luxury | 238 | 2856 | 362.30 | 0 | 0 | 51 | 33 |
| `rnd-46-s3-p276.6` | 3 | 276.6 | mixed(2):preset-commercial-mixed|preset-duplex-courtyard | 351 | 4212 | 518.22 | 0 | 0 | 98 | 63 |
| `rnd-47-s7-p132` | 7 | 132 | mixed(5):preset-family-duplex|preset-studio-bachelor|preset-duplex-courty… | 830 | 9960 | 438.67 | 0 | 0 | 208 | 149 |
| `rnd-48-s7-p285.9` | 7 | 285.9 | mixed(5):preset-studio-bachelor|preset-family-duplex|preset-architect-vil… | 1025 | 12300 | 853.03 | 0 | 0 | 300 | 204 |
| `rnd-49-s5-p179.3` | 5 | 179.3 | mixed(3):preset-studio-bachelor|preset-penthouse-luxury|preset-commercial… | 569 | 6828 | 433.61 | 0 | 0 | 166 | 110 |
| `rnd-50-s6-p313.2` | 6 | 313.2 | mixed(4):preset-triple-rental|preset-studio-bachelor|preset-family-duplex… | 778 | 9336 | 770.59 | 0 | 0 | 229 | 153 |

## Top 20 worst volume-overlap pairs (all cases)

| # | overlap mm3 | case | object A (kind) | object B (kind) |
|---:|---:|---|---|---|
| 1 | 1,135,684,200 | `rnd-33-s2-p378.9` | plinth_wall (wall) | g_g_bath_bath_basin (slab) |
| 2 | 994,982,100 | `rnd-34-s4-p344.1` | plinth_wall (wall) | g_g_bath_bath_basin (slab) |
| 3 | 955,901,250 | `mx-02-s6-p334.5-preset-dual-3bed-c400` | plinth_wall (wall) | g_g_bath_bath_basin (slab) |
| 4 | 955,901,250 | `mx-05-s6-p334.5-preset-ground-parking-c350` | plinth_wall (wall) | g_g_bath_bath_basin (slab) |
| 5 | 955,901,250 | `mx-10-s6-p334.5-preset-duplex-courtyard-c400` | plinth_wall (wall) | g_g_bath_bath_basin (slab) |
| 6 | 955,901,250 | `mx-13-s6-p334.5-preset-commercial-mixed-c350` | plinth_wall (wall) | g_g_bath_bath_basin (slab) |
| 7 | 955,901,250 | `mx-18-s6-p334.5-preset-penthouse-luxury-c400` | plinth_wall (wall) | g_g_bath_bath_basin (slab) |
| 8 | 955,901,250 | `mx-21-s6-p334.5-preset-architect-villa-c350` | plinth_wall (wall) | g_g_bath_bath_basin (slab) |
| 9 | 955,901,250 | `col-24-s2-c300-preset-penthouse-luxury` | plinth_wall (wall) | g_g_bath_bath_basin (slab) |
| 10 | 955,901,250 | `col-25-s4-c250-preset-narrow-duct` | plinth_wall (wall) | g_g_bath_bath_basin (slab) |
| 11 | 955,901,250 | `col-28-s6-c400-preset-triple-rental` | plinth_wall (wall) | g_g_bath_bath_basin (slab) |
| 12 | 955,901,250 | `col-29-s8-c350-preset-duplex-courtyard` | plinth_wall (wall) | g_g_bath_bath_basin (slab) |
| 13 | 949,872,600 | `rnd-37-s6-p333` | plinth_wall (wall) | g_g_bath_bath_basin (slab) |
| 14 | 948,796,800 | `rnd-42-s8-p332.7` | plinth_wall (wall) | g_g_bath_bath_basin (slab) |
| 15 | 871,938,000 | `rnd-50-s6-p313.2` | plinth_wall (wall) | g_g_bath_bath_basin (slab) |
| 16 | 853,998,250 | `rnd-34-s4-p344.1` | slab_f2 (slab) | f2_v_bath1_bath_basin (slab) |
| 17 | 853,998,250 | `rnd-34-s4-p344.1` | slab_f3 (slab) | f3_v_bath1_bath_basin (slab) |
| 18 | 829,151,750 | `rnd-34-s4-p344.1` | slab_f1 (slab) | f1_g_bath_bath_basin (slab) |
| 19 | 821,628,000 | `mx-21-s6-p334.5-preset-architect-villa-c350` | slab_f1 (slab) | f1_v_bath1_bath_basin (slab) |
| 20 | 821,628,000 | `mx-21-s6-p334.5-preset-architect-villa-c350` | slab_f2 (slab) | f2_v_bath1_bath_basin (slab) |

## Top 10 worst z-fighting pairs (all cases)

| # | face overlap mm2 | volume overlap mm3 | plane | case | object A (kind) | object B (kind) |
|---:|---:|---:|---|---|---|---|
| 1 | 7,571,228 | 1,135,684,200 | Z=600.0 | `rnd-33-s2-p378.9` | plinth_wall (wall) | g_g_bath_bath_basin (slab) |
| 2 | 6,831,986 | 853,998,250 | Z=6125.0 | `rnd-34-s4-p344.1` | slab_f2 (slab) | f2_v_bath1_bath_basin (slab) |
| 3 | 6,831,986 | 853,998,250 | Z=9125.0 | `rnd-34-s4-p344.1` | slab_f3 (slab) | f3_v_bath1_bath_basin (slab) |
| 4 | 6,633,214 | 994,982,100 | Z=600.0 | `rnd-34-s4-p344.1` | plinth_wall (wall) | g_g_bath_bath_basin (slab) |
| 5 | 6,633,214 | 829,151,750 | Z=3125.0 | `rnd-34-s4-p344.1` | slab_f1 (slab) | f1_g_bath_bath_basin (slab) |
| 6 | 6,573,024 | 821,628,000 | Z=3125.0 | `mx-21-s6-p334.5-preset-architect-villa-c350` | slab_f1 (slab) | f1_v_bath1_bath_basin (slab) |
| 7 | 6,573,024 | 821,628,000 | Z=6125.0 | `mx-21-s6-p334.5-preset-architect-villa-c350` | slab_f2 (slab) | f2_v_bath1_bath_basin (slab) |
| 8 | 6,573,024 | 821,628,000 | Z=9125.0 | `mx-21-s6-p334.5-preset-architect-villa-c350` | slab_f3 (slab) | f3_v_bath1_bath_basin (slab) |
| 9 | 6,573,024 | 821,628,000 | Z=12125.0 | `mx-21-s6-p334.5-preset-architect-villa-c350` | slab_f4 (slab) | f4_v_bath1_bath_basin (slab) |
| 10 | 6,573,024 | 821,628,000 | Z=15125.0 | `mx-21-s6-p334.5-preset-architect-villa-c350` | slab_f5 (slab) | f5_v_bath1_bath_basin (slab) |
