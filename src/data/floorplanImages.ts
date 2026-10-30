/**
 * Maps floorplan IDs to downloaded local image paths.
 * Generated from floorplan_images.json (30 images downloaded from 60 sources).
 */
export const FLOORPLAN_IMAGES: Record<string, string | null> = {
  // 1-unit plans (indices 1-20)
  "bd-1u-001": "/assets/floorplans/bd-1-unit-001.jpg",
  "bd-1u-002": "/assets/floorplans/bd-1-unit-002.jpg",
  "bd-1u-003": "/assets/floorplans/bd-1-unit-003.jpg",
  "bd-1u-004": "/assets/floorplans/bd-1-unit-004.jpg",
  "bd-1u-005": "/assets/floorplans/bd-1-unit-005.jpg",
  "bd-1u-006": "/assets/floorplans/bd-1-unit-006.jpg",
  "bd-1u-007": null,
  "bd-1u-008": null,
  "bd-1u-009": "/assets/floorplans/bd-1-unit-009.jpg",
  "bd-1u-010": "/assets/floorplans/bd-1-unit-010.jpg",
  "bd-1u-011": "/assets/floorplans/bd-1-unit-011.jpg",
  "bd-1u-012": "/assets/floorplans/bd-1-unit-012.jpg",
  "bd-1u-013": null,
  "bd-1u-014": "/assets/floorplans/bd-1-unit-014.jpg",
  "bd-1u-015": null,
  "bd-1u-016": "/assets/floorplans/bd-1-unit-016.jpg",
  "bd-1u-017": null,
  "bd-1u-018": "/assets/floorplans/bd-1-unit-018.jpg",
  "bd-1u-019": null,
  "bd-1u-020": "/assets/floorplans/bd-1-unit-020.jpg",

  // 2-unit plans (indices 21-40, but note: index 41 missing in source)
  "bd-2u-001": "/assets/floorplans/bd-2-unit-021.jpg",
  "bd-2u-002": null,
  "bd-2u-003": null,
  "bd-2u-004": "/assets/floorplans/bd-2-unit-024.jpg",
  "bd-2u-005": null,
  "bd-2u-006": null,
  "bd-2u-007": null,
  "bd-2u-008": "/assets/floorplans/bd-2-unit-028.jpg",
  "bd-2u-009": null,
  "bd-2u-010": "/assets/floorplans/bd-2-unit-030.jpg",
  "bd-2u-011": "/assets/floorplans/bd-2-unit-031.jpg",
  "bd-2u-012": null,
  "bd-2u-013": null,
  "bd-2u-014": null,
  "bd-2u-015": null,
  "bd-2u-016": null,
  "bd-2u-017": null,
  "bd-2u-018": "/assets/floorplans/bd-2-unit-038.jpg",
  "bd-2u-019": null,
  "bd-2u-020": null,

  // 3+-unit plans (indices 42-60, note: 41, 59 missing)
  "bd-3u-001": "/assets/floorplans/bd-3-unit-042.jpg",
  "bd-3u-002": null,
  "bd-3u-003": null,
  "bd-3u-004": "/assets/floorplans/bd-3-unit-045.jpg",
  "bd-3u-005": "/assets/floorplans/bd-3-unit-046.jpg",
  "bd-3u-006": null,
  "bd-3u-007": null,
  "bd-3u-008": "/assets/floorplans/bd-3-unit-049.jpg",
  "bd-3u-009": "/assets/floorplans/bd-3-unit-050.jpg",
  "bd-3u-010": null,
  "bd-3u-011": "/assets/floorplans/bd-3-unit-052.jpg",
  "bd-3u-012": null,
  "bd-3u-013": "/assets/floorplans/bd-3-unit-054.jpg",
  "bd-3u-014": "/assets/floorplans/bd-3-unit-055.jpg",
  "bd-3u-015": null,
  "bd-3u-016": "/assets/floorplans/bd-3-unit-057.jpg",
  "bd-3u-017": null,
  "bd-3u-018": "/assets/floorplans/bd-3-unit-060.jpg",
};

/**
 * Get the local image path for a floorplan by its ID.
 * Returns null if no image is available (fallback to procedural SVG).
 */
export function getFloorplanImage(id: string): string | null {
  return FLOORPLAN_IMAGES[id] ?? null;
}