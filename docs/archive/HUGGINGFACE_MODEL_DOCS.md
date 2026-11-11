# Archie Civil AI: Architectural Logic Models

This repository contains the "knowledge base" and parametric synthesis rules for **ArchResidenceBD**, an AI-powered CAD platform for Bangladeshi residential buildings.

## Models Overview

### 1. `archie-chat-v0` (Logic Engine)
*   **Purpose**: Orchestrates the multi-phase interview flow for BNBC 2020 compliance.
*   **Knowledge Base**: BNBC 2020 Part 3 (General Building Requirements), RAJUK DAP 2022.
*   **Implementation**: Synthesized into `/src/engine/projectState.ts` and `/src/data/flowBook.json`.

### 2. `archres-repair-v0` (CAD Synthesis)
*   **Purpose**: Generates watertight 3D solid geometry (IFC-ready) from room partitions.
*   **Training Focus**: Fixed "Outer Walls Frame-Wrapping" issues through Full-Span Flush Synthesis.
*   **Rules**:
    *   **Exterior Walls**: $250\text{ mm}$ (10") flush with RCC column outer faces.
    *   **Interior Walls**: $125\text{ mm}$ (5") centered on grid lines.
    *   **Vertical Fit**: Wall heads stop exactly at beam bottoms (`nextZ - beamDepthMm`).
    *   **Door/Window Sills**: Automatic parametric orientation based on wall face (N/S/E/W).

## GitHub Repository
Source code is available at: [User GitHub Repo Link]

## Deployment Metadata
*   **Platform**: React SPA + Express (Vite)
*   **3D Engine**: Vanilla WebGL 1.0 (No heavy libraries)
*   **CAD Format**: Parametric Mesh Object (Internal) -> IFC/FreeCAD Python Macro Export (External)
