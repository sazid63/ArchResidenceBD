/**
 * 2D Drawing Generation Engine for ArchResidenceBD
 * Generates CAD-ready plans, sections, elevations with dimensions and annotations
 * Format: SVG + DXF (AutoCAD compatible)
 */

export interface DrawingElement {
  type: "line" | "circle" | "arc" | "text" | "dimension" | "hatch" | "polyline";
  x1?: number; y1?: number;
  x2?: number; y2?: number;
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
  return mm / scale / 10;
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
      x: x1 + w / 2,
      y: y1 + h / 2,
      text: room.name,
      fontSize: 4,
      layer: LAYER_TEXT
    });
    
    // Door symbol (simplified)
    if (room.door) {
      let dx = x1, dy = y1;
      if (room.door.side === "E") dx = x1 + w;
      if (room.door.side === "S") dy = y1 + h;
      const dPos = toDrawingUnits(room.door.pos, scale);
      elements.push({
        type: "arc",
        cx: dx, cy: dy,
        r: toDrawingUnits(900, scale), // door width 900mm
        layer: LAYER_DOOR
      });
    }
    
    // Window symbol
    if (room.window) {
      let wx = x1, wy = y1;
      if (room.window.side === "E") wx = x1 + w;
      if (room.window.side === "S") wy = y1 + h;
      const winW = toDrawingUnits(room.window.width, scale);
      elements.push({
        type: "line",
        x1: wx - winW/2, y1: wy,
        x2: wx + winW/2, y2: wy,
        layer: LAYER_WINDOW
      });
    }
  }
  
  // Dimension lines (simplified: outer dimensions)
  const dimY = toDrawingUnits(minY - 5000, scale); // 5m below
  elements.push({
    type: "dimension",
    x1: toDrawingUnits(minX, scale),
    y1: dimY,
    x2: toDrawingUnits(maxX, scale),
    y2: dimY,
    text: `${Math.round((maxX - minX) / 1000)}m`,
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
        x: 0, y: dimY - 10,
        w: toDrawingUnits(maxX - minX + 2000, scale),
        h: toDrawingUnits(maxY - minY + 5000, scale)
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
  for (let i = 0; i < storyHeights.length; i++) {
    const h = toDrawingUnits(storyHeights[i], scale);
    const w = toDrawingUnits(storyWidth, scale);
    
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
      x: startX + w + 20,
      y: currentY + h/2,
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
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${drawing.views[0].bbox.w + 200} ${drawing.views[0].bbox.h + 100}" width="100%" height="100%">\n`;
  
  // Title block
  svg += `<rect x="500" y="${drawing.views[0].bbox.h - 50}" width="400" height="50" fill="#f0f0f0" stroke="#333"/>\n`;
  svg += `<text x="510" y="${drawing.views[0].bbox.h - 35}" font-size="12" font-family="Arial">${drawing.titleBlock.project}</text>\n`;
  svg += `<text x="510" y="${drawing.views[0].bbox.h - 20}" font-size="10" font-family="Arial">Drwg No: ${drawing.titleBlock.drawingNo} | Scale: ${drawing.titleBlock.scale}</text>\n`;
  
  // Draw elements by layer
  for (const view of drawing.views) {
    for (const el of view.elements) {
      if (el.type === "line" && el.x1 !== undefined) {
        svg += `<line x1="${el.x1}" y1="${el.y1}" x2="${el.x2}" y2="${el.y2}" stroke="black" stroke-width="1" stroke-linecap="round"/>\n`;
      } else if (el.type === "text" && el.text) {
        svg += `<text x="${el.x1}" y="${el.y1}" font-size="${el.fontSize || 10}" font-family="Arial">${el.text}</text>\n`;
      } else if (el.type === "dimension" && el.text) {
        svg += `<line x1="${el.x1}" y1="${el.y1}" x2="${el.x2}" y2="${el.y2}" stroke="blue" stroke-width="0.5" stroke-dasharray="5,5"/>\n`;
        svg += `<text x="${(el.x1 + el.x2) / 2}" y="${el.y1 - 5}" font-size="8" font-family="Arial" fill="blue">${el.text}</text>\n`;
      }
    }
  }
  
  svg += `</svg>`;
  return svg;
}

/** Export drawing as DXF (simplified) */
export function exportDrawingAsDXF(drawing: DrawingSheet): string {
  let dxf = "0\nSECTION\n2\nENTITIES\n";
  
  for (const view of drawing.views) {
    for (const el of view.elements) {
      if (el.type === "line" && el.x1 !== undefined) {
        dxf += `0\nLINE\n8\n${el.layer}\n10\n${el.x1}\n20\n${el.y1}\n30\n0.0\n11\n${el.x2}\n21\n${el.y2}\n31\n0.0\n`;
      } else if (el.type === "text" && el.text) {
        dxf += `0\nTEXT\n8\n${el.layer}\n10\n${el.x1}\n20\n${el.y1}\n30\n0.0\n40\n${el.fontSize || 10}\n1\n${el.text}\n`;
      } else if (el.type === "dimension" && el.text) {
        dxf += `0\nLINE\n8\n${el.layer}\n10\n${el.x1}\n20\n${el.y1}\n30\n0.0\n11\n${el.x2}\n21\n${el.y2}\n31\n0.0\n`;
      }
    }
  }
  
  dxf += "0\nENDSEC\n0\nEOF\n";
  return dxf;
}
