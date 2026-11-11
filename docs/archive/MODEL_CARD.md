# ArchResidenceBD Model Card: archie-civil-v2.2

## Overview
This model represents the synthesized architectural logic and parametric rules for Bangladeshi residential building design, trained on BNBC 2020 and RAJUK DAP 2022 standards.

## Logical "Training" Results (v2.2 Audit)
The following structural alignment rules have been "taught" to the synthesis engine:

1. **Full-Span Flush Synthesis**:
   - Exterior walls are no longer centered on grid lines.
   - They now extend horizontally to absolute frame boundaries (`frameMin/Max`), ensuring they perfectly wrap RCC columns.
   - Total alignment with the outer face of the structural skeleton.

2. **Vertical Beam-Bottom Locking**:
   - Walls stop exactly at the lower face of RCC beams (`nextZ - 450mm`).
   - This eliminates concrete-brick clipping and ensures a watertight 3D mesh.

3. **Parametric Asset Orientation**:
   - 3D Door and Window assemblies now inherit orientation (X/Y) from their parent wall face.
   - Automatic inclusion of $150\text{ mm}$ RCC lintel bands and $60\text{ mm}$ window sills.

## Intended Use
To be used as the logic backend for the ArchResidenceBD fleet of AI civil engineers.

## Knowledge Sources
*   Bangladesh National Building Code (BNBC) 2020
*   RAJUK Detailed Area Plan (DAP) 2022
*   PWD Schedule of Rates 2022 (Bangladesh)
