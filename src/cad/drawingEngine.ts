/**
 * 2D Drawing Generation Engine for ArchResidenceBD
 * Generates CAD-ready plans, sections, elevations with dimensions and annotations
 * Format: SVG + DXF (AutoCAD compatible)
 */

import type { MeshDocument, MeshObject } from "./mesh";

export interface DrawingElement {
  type: "line" | "circle" | "arc" | "text" | "dimension" | "hatch" | "polyline";
  x1?: number; y1?: number;
  x2?: number; y2?: number;
  x3?: number; y3?: number;
  x4?: number; y4?: number;
  x5?: number; y5?: number;
  cx?: number; cy?: number; r?: number;
  text?: string;
  fontSize?: number;
  layer?: string;
}

export interface DrawingSheet {
  id: string;
  title: string;
  scale: string;
  views: Array<{
    type: "plan" | "elevation" | "section";
    label: string;
    elements: DrawingElement[];
    bbox: { x: number; y: number; w: number; h: number };
  }>;
  titleBlock: {
    project: string;
    drawingNo: string;
    date: string;
    scale: string;
    prepared: string;
    checked: string;
  };
}

const LAYER_WALL = "WALLS";
const LAYER_DOOR = "DOORS";
const LAYER_WINDOW = "WINDOWS";
const LAYER_DIM = "DIMENSIONS";
const LAYER_TEXT = "TEXT";
const LAYER_FURNISH = "FURNITURE";
const LAYER_GRID = "GRIDS";

/** Convert mm to drawing units (1:100 scale: 1mm = 0.01 drawing units) */
function toDrawingUnits(mm: number, scale: number): number {
  // At 1:100 scale: 1mm real = 0.01 drawing units
  // Drawing units are typically in cm for architectural drawings
  return mm / scale;
}

/** Generate floor plan SVG elements */
export function generateFloorPlan(
  roomData: Array<{
    name: string;
    x: number; y: number; w: number; h: number;
    door?: { side: "N" | "S" | "E" | "W"; pos: number };
    window?: { side: "N" | "S" | "E" | "W"; pos: number; width: number };
  }>,
  options: { scale: number; project: string; drawingNo: string }
): DrawingSheet {
  const { scale, project, drawingNo } = options;
  const elements: DrawingElement[] = [];
  
  // Find bounding box
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const room of roomData) {
    minX = Math.min(minX, room.x);
    minY = Math.min(minY, room.y);
    maxX = Math.max(maxX, room.x + room.w);
    maxY = Math.max(maxY, room.y + room.h);
  }
  
  // Draw each room
  for (const room of roomData) {
    const x1 = toDrawingUnits(room.x - minX, scale);
    const y1 = toDrawingUnits(room.y - minY, scale);
    const w = toDrawingUnits(room.w, scale);
    const h = toDrawingUnits(room.h, scale);
    
    // Room boundary (wall)
    elements.push({
      type: "polyline",
      x1, y1, x2: x1 + w, y2: y1,
      x3: x1 + w, y3: y1 + h,
      x4: x1, y4: y1 + h,
      x5: x1, y5: y1,
      layer: LAYER_WALL
    });
    
    // Room name
    elements.push({
      type: "text",
      x1: x1 + w / 2,
      y1: y1 + h / 2,
      text: room.name,
      fontSize: 4,
      layer: LAYER_TEXT
    });
    
    // Door symbol (simplified) - draw as arc from door hinge point
    if (room.door) {
      let dx = x1, dy = y1;
      // Position door along the specified side edge, offset by pos (mm) from start
      const dPosDraw = toDrawingUnits(room.door.pos, scale);
      if (room.door.side === "N") { dx = x1 + dPosDraw; dy = y1; } // top edge
      else if (room.door.side === "S") { dx = x1 + dPosDraw; dy = y1 + h; } // bottom edge
      else if (room.door.side === "W") { dx = x1; dy = y1 + dPosDraw; } // left edge
      else if (room.door.side === "E") { dx = x1 + w; dy = y1 + dPosDraw; } // right edge
      elements.push({
        type: "arc",
        cx: dx, cy: dy,
        r: toDrawingUnits(900, scale), // door width 900mm
        layer: LAYER_DOOR
      });
    }

    // Window symbol - double line on wall indicating window opening
    if (room.window) {
      let wx = x1, wy = y1;
      const winWDraw = toDrawingUnits(room.window.width, scale);
      const winPosDraw = toDrawingUnits(room.window.pos, scale);
      if (room.window.side === "N") { wx = x1 + winPosDraw; wy = y1; } // top edge
      else if (room.window.side === "S") { wx = x1 + winPosDraw; wy = y1 + h; } // bottom edge
      else if (room.window.side === "W") { wx = x1; wy = y1 + winPosDraw; } // left edge
      else if (room.window.side === "E") { wx = x1 + w; wy = y1 + winPosDraw; } // right edge
      // Draw window as doubled line (indicating glass pane)
      if (room.window.side === "N" || room.window.side === "S") {
        elements.push({
          type: "line",
          x1: wx - winWDraw/2, y1: wy,
          x2: wx + winWDraw/2, y2: wy,
          layer: LAYER_WINDOW
        });
        elements.push({
          type: "line",
          x1: wx - winWDraw/2, y1: wy + (room.window.side === "N" ? -2 : 2),
          x2: wx + winWDraw/2, y2: wy + (room.window.side === "N" ? -2 : 2),
          layer: LAYER_WINDOW
        });
      } else {
        elements.push({
          type: "line",
          x1: wx, y1: wy - winWDraw/2,
          x2: wx, y2: wy + winWDraw/2,
          layer: LAYER_WINDOW
        });
        elements.push({
          type: "line",
          x1: wx + (room.window.side === "W" ? -2 : 2), y1: wy - winWDraw/2,
          x2: wx + (room.window.side === "W" ? -2 : 2), y2: wy + winWDraw/2,
          layer: LAYER_WINDOW
        });
      }
    }
  }
  
  // Dimension lines (simplified: outer dimensions below drawing)
  const planW = toDrawingUnits(maxX - minX, scale);
  const planH = toDrawingUnits(maxY - minY, scale);
  const dimOffset = 4; // drawing units below the plan
  elements.push({
    type: "dimension",
    x1: 0,
    y1: planH + dimOffset,
    x2: planW,
    y2: planH + dimOffset,
    text: `${((maxX - minX) / 1000).toFixed(1)} m`,
    layer: LAYER_DIM
  });
  // Height dimension on left side
  elements.push({
    type: "dimension",
    x1: -dimOffset,
    y1: 0,
    x2: -dimOffset,
    y2: planH,
    text: `${((maxY - minY) / 1000).toFixed(1)} m`,
    layer: LAYER_DIM
  });
  
  return {
    id: `PLAN-FLOOR-${drawingNo}`,
    title: `${project} - Floor Plan`,
    scale: `1:${scale}`,
    views: [{
      type: "plan",
      label: "FLOOR PLAN",
      elements,
      bbox: {
        x: -10, y: -10,
        w: planW + 20,
        h: planH + dimOffset + 30
      }
    }],
    titleBlock: {
      project,
      drawingNo,
      date: new Date().toISOString().split("T")[0],
      scale: `1:${scale}`,
      prepared: "ArchResidenceBD",
      checked: "—"
    }
  };
}

/** Generate floor plan from mesh objects (walls, doors, windows, columns) */
export function generateFloorPlanFromMesh(
  mesh: MeshDocument,
  floorPhase: string,
  options: { scale: number; project: string; drawingNo: string }
): DrawingSheet {
  const { scale, project, drawingNo } = options;
  const elements: DrawingElement[] = [];

  // Filter objects for this floor phase
  const floorObjects = mesh.objects.filter(o => o.phase === floorPhase || o.phase === "ground_floor");

  // Extract walls, columns, doors, windows
  const walls = floorObjects.filter(o => o.kind === "wall" || o.kind === "partition");
  const columns = floorObjects.filter(o => o.kind === "column");
  const doors = floorObjects.filter(o => o.kind === "door" || o.kind === "door_frame");
  const windows = floorObjects.filter(o => o.kind === "window");

  // Find bounding box
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const obj of [...walls, ...columns]) {
    const [x1, y1] = obj.bboxMinMm;
    const [x2, y2] = obj.bboxMaxMm;
    minX = Math.min(minX, x1);
    minY = Math.min(minY, y1);
    maxX = Math.max(maxX, x2);
    maxY = Math.max(maxY, y2);
  }

  const offsetX = minX;
  const offsetY = minY;

  // Draw walls as rectangles (top-down view shows wall thickness)
  for (const wall of walls) {
    const [x1, y1] = wall.bboxMinMm;
    const [x2, y2] = wall.bboxMaxMm;
    const wx = toDrawingUnits(x1 - offsetX, scale);
    const wy = toDrawingUnits(y1 - offsetY, scale);
    const ww = toDrawingUnits(x2 - x1, scale);
    const wh = toDrawingUnits(y2 - y1, scale);

    // Wall outline (hollow rectangle for wall thickness)
    elements.push({
      type: "polyline",
      x1: wx, y1: wy,
      x2: wx + ww, y2: wy,
      x3: wx + ww, y3: wy + wh,
      x4: wx, y4: wy + wh,
      x5: wx, y5: wy,
      layer: LAYER_WALL
    });
  }

  // Draw columns as filled squares
  for (const col of columns) {
    const [x1, y1] = col.bboxMinMm;
    const [x2, y2] = col.bboxMaxMm;
    const cx = toDrawingUnits(x1 - offsetX, scale);
    const cy = toDrawingUnits(y1 - offsetY, scale);
    const cw = toDrawingUnits(x2 - x1, scale);
    const ch = toDrawingUnits(y2 - y1, scale);

    elements.push({
      type: "polyline",
      x1: cx, y1: cy,
      x2: cx + cw, y2: cy,
      x3: cx + cw, y3: cy + ch,
      x4: cx, y4: cy + ch,
      x5: cx, y5: cy,
      layer: LAYER_GRID
    });
  }

  // Draw doors as arcs (swing direction)
  for (const door of doors) {
    const [x1, y1, z1] = door.bboxMinMm;
    const [x2, y2, z2] = door.bboxMaxMm;
    const dx = toDrawingUnits((x1 + x2) / 2 - offsetX, scale);
    const dy = toDrawingUnits((y1 + y2) / 2 - offsetY, scale);
    const dw = toDrawingUnits(Math.max(x2 - x1, y2 - y1), scale);

    elements.push({
      type: "arc",
      cx: dx, cy: dy,
      r: dw,
      layer: LAYER_DOOR
    });
  }

  // Draw windows as double lines
  for (const win of windows) {
    const [x1, y1, z1] = win.bboxMinMm;
    const [x2, y2, z2] = win.bboxMaxMm;
    const wx = toDrawingUnits((x1 + x2) / 2 - offsetX, scale);
    const wy = toDrawingUnits((y1 + y2) / 2 - offsetY, scale);
    const ww = toDrawingUnits(Math.max(x2 - x1, y2 - y1), scale);

    elements.push({
      type: "line",
      x1: wx - ww/2, y1: wy,
      x2: wx + ww/2, y2: wy,
      layer: LAYER_WINDOW
    });
    elements.push({
      type: "line",
      x1: wx - ww/2, y1: wy + 2,
      x2: wx + ww/2, y2: wy + 2,
      layer: LAYER_WINDOW
    });
  }

  // Add dimension lines
  const dimOffset = toDrawingUnits(2000, scale);
  elements.push({
    type: "dimension",
    x1: toDrawingUnits(minX - offsetX, scale),
    y1: toDrawingUnits(minY - offsetY - dimOffset, scale),
    x2: toDrawingUnits(maxX - offsetX, scale),
    y2: toDrawingUnits(minY - offsetY - dimOffset, scale),
    text: `${Math.round((maxX - minX) / 1000)}m`,
    layer: LAYER_DIM
  });

  return {
    id: `PLAN-${floorPhase.toUpperCase()}-${drawingNo}`,
    title: `${project} - ${floorPhase.replace("_", " ").toUpperCase()}`,
    scale: `1:${scale}`,
    views: [{
      type: "plan",
      label: `${floorPhase.replace("_", " ")} PLAN`,
      elements,
      bbox: {
        x: 0, y: 0,
        w: toDrawingUnits(maxX - minX + 4000, scale),
        h: toDrawingUnits(maxY - minY + 4000, scale)
      }
    }],
    titleBlock: {
      project,
      drawingNo,
      date: new Date().toISOString().split("T")[0],
      scale: `1:${scale}`,
      prepared: "ArchResidenceBD",
      checked: "—"
    }
  };
}

/** Generate building section SVG */
export function generateSection(
  storyHeights: number[],
  storyWidth: number,
  options: { scale: number; project: string; drawingNo: string }
): DrawingSheet {
  const { scale, project, drawingNo } = options;
  const elements: DrawingElement[] = [];

  const totalHeight = storyHeights.reduce((a, b) => a + b, 0);
  const startX = 100;
  const startY = 500;

  // Draw each story
  let currentY = startY;
  let w = 0; // Declare outside loop for later use
  for (let i = 0; i < storyHeights.length; i++) {
    const h = toDrawingUnits(storyHeights[i], scale);
    w = toDrawingUnits(storyWidth, scale);
    
    // Floor slab
    elements.push({
      type: "line",
      x1: startX, y1: currentY,
      x2: startX + w, y2: currentY,
      layer: LAYER_WALL
    });
    
    // Story label
    elements.push({
      type: "text",
      x1: startX + w + 20,
      y1: currentY + h/2,
      text: `Story ${i}`,
      fontSize: 3,
      layer: LAYER_TEXT
    });
    
    currentY -= h;
  }
  
  // Ground line
  elements.push({
    type: "line",
    x1: startX - 50,
    y1: startY,
    x2: startX + w + 50,
    y2: startY,
    layer: LAYER_DIM
  });
  
  // Height dimension
  const dimX = startX + w + 100;
  elements.push({
    type: "dimension",
    x1: dimX, y1: startY,
    x2: dimX, y2: currentY,
    text: `${Math.round(totalHeight / 1000)}m`,
    layer: LAYER_DIM
  });
  
  return {
    id: `SEC-${drawingNo}`,
    title: `${project} - Building Section`,
    scale: `1:${scale}`,
    views: [{
      type: "section",
      label: "TYPICAL SECTION",
      elements,
      bbox: { x: 0, y: currentY - 50, w: dimX + 50, h: startY - currentY + 100 }
    }],
    titleBlock: {
      project,
      drawingNo,
      date: new Date().toISOString().split("T")[0],
      scale: `1:${scale}`,
      prepared: "ArchResidenceBD",
      checked: "—"
    }
  };
}

/** Generate elevation SVG */
export function generateElevation(
  width: number,
  heights: number[],
  openings: Array<{ x: number; y: number; w: number; h: number; type: "door" | "window" }>,
  options: { scale: number; direction: string; project: string }
): DrawingSheet {
  const { scale, direction, project } = options;
  const elements: DrawingElement[] = [];
  
  const w = toDrawingUnits(width, scale);
  const h = toDrawingUnits(heights[heights.length - 1], scale);
  const startX = 100;
  const startY = 600;
  
  // Building outline
  elements.push({
    type: "polyline",
    x1: startX, y1: startY,
    x2: startX + w, y2: startY,
    x3: startX + w, y3: startY - h,
    x4: startX, y4: startY - h,
    x5: startX, y5: startY,
    layer: LAYER_WALL
  });
  
  // Ground line
  elements.push({
    type: "line",
    x1: startX - 50, y1: startY,
    x2: startX + w + 50, y2: startY,
    layer: LAYER_DIM
  });
  
  // Draw openings
  for (const op of openings) {
    const ox = toDrawingUnits(op.x, scale);
    const oy = toDrawingUnits(op.y, scale);
    const ow = toDrawingUnits(op.w, scale);
    const oh = toDrawingUnits(op.h, scale);
    
    elements.push({
      type: "line",
      x1: startX + ox, y1: startY - oy,
      x2: startX + ox + ow, y2: startY - oy,
      layer: op.type === "door" ? LAYER_DOOR : LAYER_WINDOW
    });
    elements.push({
      type: "line",
      x1: startX + ox, y1: startY - oy,
      x2: startX + ox, y2: startY - oy + oh,
      layer: op.type === "door" ? LAYER_DOOR : LAYER_WINDOW
    });
    elements.push({
      type: "line",
      x1: startX + ox + ow, y1: startY - oy,
      x2: startX + ox + ow, y2: startY - oy + oh,
      layer: op.type === "door" ? LAYER_DOOR : LAYER_WINDOW
    });
    elements.push({
      type: "line",
      x1: startX + ox, y1: startY - oy + oh,
      x2: startX + ox + ow, y2: startY - oy + oh,
      layer: op.type === "door" ? LAYER_DOOR : LAYER_WINDOW
    });
  }
  
  return {
    id: `ELEV-${direction}-${options.project}`,
    title: `${project} - ${direction} Elevation`,
    scale: `1:${scale}`,
    views: [{
      type: "elevation",
      label: `${direction.toUpperCase()} ELEVATION`,
      elements,
      bbox: { x: 0, y: startY - h - 50, w: w + 100, h: h + 100 }
    }],
    titleBlock: {
      project,
      drawingNo: `ARRB-${direction.toUpperCase()}-001`,
      date: new Date().toISOString().split("T")[0],
      scale: `1:${scale}`,
      prepared: "ArchResidenceBD",
      checked: "—"
    }
  };
}

/** Export drawing as SVG string */
export function exportDrawingAsSVG(drawing: DrawingSheet): string {
  // Compute overall bounds from all elements across all views
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const view of drawing.views) {
    for (const el of view.elements) {
      const coords = getElementCoords(el);
      if (coords) {
        minX = Math.min(minX, coords.minX);
        minY = Math.min(minY, coords.minY);
        maxX = Math.max(maxX, coords.maxX);
        maxY = Math.max(maxY, coords.maxY);
      }
    }
  }
  
  // Add margin for title block (below drawing)
  const margin = 30;
  const titleBlockHeight = 60;
  const drawingWidth = maxX - minX;
  const drawingHeight = maxY - minY;
  
  // Position title block below the drawing, centered horizontally
  const titleBlockX = minX + drawingWidth / 2 - 200; // 400 wide, centered
  const titleBlockY = maxY + margin;
  
  // Expand bounds to include title block
  minX = Math.min(minX, titleBlockX - margin);
  minY = Math.min(minY, minY); // already at min
  maxX = Math.max(maxX, titleBlockX + 400 + margin);
  maxY = Math.max(maxY, titleBlockY + titleBlockHeight + margin);

  const viewBoxW = maxX - minX;
  const viewBoxH = maxY - minY;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${viewBoxW} ${viewBoxH}" width="100%" height="100%">\n`;
  
  // Background
  svg += `<rect x="${minX}" y="${minY}" width="${viewBoxW}" height="${viewBoxH}" fill="white"/>\n`;
  
  // Title block (below drawing)
  svg += `<rect x="${titleBlockX}" y="${titleBlockY}" width="400" height="${titleBlockHeight}" fill="#f0f0f0" stroke="#333"/>\n`;
  svg += `<text x="${titleBlockX + 10}" y="${titleBlockY + 20}" font-size="12" font-family="Arial">${drawing.titleBlock.project}</text>\n`;
  svg += `<text x="${titleBlockX + 10}" y="${titleBlockY + 40}" font-size="10" font-family="Arial">Drwg No: ${drawing.titleBlock.drawingNo} | Scale: ${drawing.titleBlock.scale}</text>\n`;
  svg += `<text x="${titleBlockX + 10}" y="${titleBlockY + 55}" font-size="8" font-family="Arial">Date: ${drawing.titleBlock.date} | By: ${drawing.titleBlock.prepared}</text>\n`;
  
  // Draw elements by layer
  for (const view of drawing.views) {
    for (const el of view.elements) {
      if (el.type === "line" && el.x1 !== undefined && el.x2 !== undefined && el.y1 !== undefined && el.y2 !== undefined) {
        const stroke = el.layer === LAYER_DIM ? "blue" : el.layer === LAYER_WINDOW ? "#666" : "black";
        const width = el.layer === LAYER_DIM ? "0.5" : el.layer === LAYER_WINDOW ? "0.8" : "1";
        const dash = el.layer === LAYER_DIM ? 'stroke-dasharray="5,5"' : '';
        svg += `<line x1="${el.x1}" y1="${el.y1}" x2="${el.x2}" y2="${el.y2}" stroke="${stroke}" stroke-width="${width}" ${dash} stroke-linecap="round"/>\n`;
      } else if (el.type === "text" && el.text) {
        const x = el.x1 ?? 0;
        const y = el.y1 ?? 0;
        const color = el.layer === LAYER_DIM ? "blue" : "black";
        const fs = el.fontSize || 10;
        svg += `<text x="${x}" y="${y}" font-size="${fs}" font-family="Arial" fill="${color}" text-anchor="middle">${el.text}</text>\n`;
      } else if (el.type === "dimension" && el.text && el.x1 !== undefined && el.x2 !== undefined && el.y1 !== undefined && el.y2 !== undefined) {
        svg += `<line x1="${el.x1}" y1="${el.y1}" x2="${el.x2}" y2="${el.y2}" stroke="blue" stroke-width="0.5" stroke-dasharray="5,5"/>\n`;
        // Place dimension text offset perpendicular to line
        const midX = (el.x1 + el.x2) / 2;
        const midY = (el.y1 + el.y2) / 2;
        const isVertical = Math.abs(el.x1 - el.x2) < 0.1;
        const textX = isVertical ? midX + 5 : midX;
        const textY = isVertical ? midY : midY - 5;
        svg += `<text x="${textX}" y="${textY}" font-size="8" font-family="Arial" fill="blue" text-anchor="${isVertical ? 'start' : 'middle'}">${el.text}</text>\n`;
      } else if (el.type === "polyline" && el.x1 !== undefined && el.x3 !== undefined && el.y3 !== undefined) {
        svg += `<polyline points="${el.x1},${el.y1} ${el.x2},${el.y2} ${el.x3},${el.y3} ${el.x4},${el.y4} ${el.x5},${el.y5}" fill="none" stroke="black" stroke-width="1.5"/>\n`;
      } else if (el.type === "arc" && el.cx !== undefined && el.cy !== undefined && el.r !== undefined) {
        // Door swing arc: draw 90-degree arc
        const cx = el.cx, cy = el.cy, r = el.r;
        // Determine swing direction based on position relative to room
        const sweep = 1; // 90 degrees
        svg += `<path d="M ${cx + r} ${cy} A ${r} ${r} 0 0 ${sweep} ${cx} ${cy - r}" fill="none" stroke="black" stroke-width="1"/>\n`;
        // Door leaf line
        svg += `<line x1="${cx}" y1="${cy}" x2="${cx + r * 0.7}" y2="${cy - r * 0.7}" stroke="black" stroke-width="1.5"/>\n`;
      } else if (el.type === "circle" && el.cx !== undefined && el.cy !== undefined && el.r !== undefined) {
        svg += `<circle cx="${el.cx}" cy="${el.cy}" r="${el.r}" fill="none" stroke="black" stroke-width="1"/>\n`;
      }
    }
  }
  
  svg += `</svg>`;
  return svg;
}

function getElementCoords(el: DrawingElement): { minX: number; minY: number; maxX: number; maxY: number } | null {
  if (el.type === "line" && el.x1 !== undefined && el.x2 !== undefined && el.y1 !== undefined && el.y2 !== undefined) {
    return { minX: Math.min(el.x1, el.x2), minY: Math.min(el.y1, el.y2), maxX: Math.max(el.x1, el.x2), maxY: Math.max(el.y1, el.y2) };
  } else if (el.type === "text" && el.x1 !== undefined && el.y1 !== undefined) {
    const fs = el.fontSize || 10;
    const textW = (el.text?.length || 0) * fs * 0.5;
    return { minX: el.x1 - textW/2, minY: el.y1 - fs, maxX: el.x1 + textW/2, maxY: el.y1 };
  } else if (el.type === "dimension" && el.x1 !== undefined && el.x2 !== undefined && el.y1 !== undefined && el.y2 !== undefined) {
    return { minX: Math.min(el.x1, el.x2), minY: Math.min(el.y1, el.y2), maxX: Math.max(el.x1, el.x2), maxY: Math.max(el.y1, el.y2) };
  } else if (el.type === "polyline" && el.x1 !== undefined && el.x3 !== undefined && el.y3 !== undefined) {
    const xs = [el.x1, el.x2, el.x3, el.x4, el.x5].filter(v => v !== undefined) as number[];
    const ys = [el.y1, el.y2, el.y3, el.y4, el.y5].filter(v => v !== undefined) as number[];
    return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
  } else if (el.type === "arc" && el.cx !== undefined && el.cy !== undefined && el.r !== undefined) {
    return { minX: el.cx - el.r, minY: el.cy - el.r, maxX: el.cx + el.r, maxY: el.cy + el.r };
  } else if (el.type === "circle" && el.cx !== undefined && el.cy !== undefined && el.r !== undefined) {
    return { minX: el.cx - el.r, minY: el.cy - el.r, maxX: el.cx + el.r, maxY: el.cy + el.r };
  }
  return null;
}

/** Export drawing as DXF (simplified) */
export function exportDrawingAsDXF(drawing: DrawingSheet): string {
  let dxf = "0\nSECTION\n2\nENTITIES\n";
  
  for (const view of drawing.views) {
    for (const el of view.elements) {
      if (el.type === "line" && el.x1 !== undefined && el.x2 !== undefined && el.y1 !== undefined && el.y2 !== undefined) {
        dxf += `0\nLINE\n8\n${el.layer}\n10\n${el.x1}\n20\n${el.y1}\n30\n0.0\n11\n${el.x2}\n21\n${el.y2}\n31\n0.0\n`;
      } else if (el.type === "text" && el.text) {
        dxf += `0\nTEXT\n8\n${el.layer}\n10\n${el.x1}\n20\n${el.y1}\n30\n0.0\n40\n${el.fontSize || 10}\n1\n${el.text}\n`;
      } else if (el.type === "dimension" && el.text && el.x1 !== undefined && el.x2 !== undefined && el.y1 !== undefined && el.y2 !== undefined) {
        dxf += `0\nLINE\n8\n${el.layer}\n10\n${el.x1}\n20\n${el.y1}\n30\n0.0\n11\n${el.x2}\n21\n${el.y2}\n31\n0.0\n`;
      } else if (el.type === "polyline" && el.x1 !== undefined && el.x3 !== undefined && el.y3 !== undefined) {
        dxf += `0\nLWPOLYLINE\n8\n${el.layer}\n10\n${el.x1}\n20\n${el.y1}\n11\n${el.x2}\n21\n${el.y2}\n12\n${el.x3}\n22\n${el.y3}\n13\n${el.x4}\n23\n${el.y4}\n14\n${el.x5}\n24\n${el.y5}\n`;
      }
    }
  }
  
  dxf += "0\nENDSEC\n0\nEOF\n";
  return dxf;
}
