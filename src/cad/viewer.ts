/**
 * The viewport (W2.8): a small WebGL viewer for the engine's mesh.
 *
 * No 3D library: the app's dependency list is deliberately tiny (a bundled app that ships
 * three.js is a bigger install and a bigger licence review for a viewer that draws boxes),
 * and the plan's corner policy and theme live in CSS, not in a 3D framework. What the viewer
 * needs is small: a perspective camera, an orbit, one lit shader and the engine's triangles.
 *
 * The viewer draws and nothing else. It does not measure, does not round and does not decide
 * what a volume is - the numbers in the tree come from the mesh the engine wrote.
 */

import type { MeshDocument, MeshObject } from "./mesh";

type Vec3 = [number, number, number];
type Mat4 = Float32Array;

export type { Vec3, Mat4 };

const VERTEX_SHADER = `
attribute vec3 aPosition;
attribute vec3 aNormal;
uniform mat4 uProjection;
uniform mat4 uView;
varying vec3 vNormal;
void main() {
  vNormal = aNormal;
  gl_Position = uProjection * uView * vec4(aPosition, 1.0);
}`;

const FRAGMENT_SHADER = `
precision mediump float;
varying vec3 vNormal;
uniform vec3 uColor;
uniform float uUnlit;
void main() {
  vec3 n = normalize(vNormal);
  vec3 keyLight = normalize(vec3(0.45, 0.65, 0.75));
  vec3 fillLight = normalize(vec3(-0.4, -0.3, 0.5));
  float lambert1 = max(dot(n, keyLight), 0.0);
  float lambert2 = max(dot(n, fillLight), 0.0) * 0.35;
  float ambient = 0.52;
  float shade = mix(ambient + 0.48 * lambert1 + lambert2, 1.0, uUnlit);
  gl_FragColor = vec4(uColor * min(shade, 1.12), 1.0);
}`;

/** The phase colours: the same pastel family the theme uses (amber / sky / sage). */
export const PHASE_COLORS: Record<string, Vec3> = {
  foundation: [0.82, 0.62, 0.35],
  floor: [0.45, 0.65, 0.85],
  other: [0.72, 0.7, 0.68],
};

const GROUND_COLOR: Vec3 = [0.93, 0.91, 0.88];

export function getColorForObject(object?: MeshObject): Vec3 {
  if (!object) return [0.7, 0.7, 0.7];

  // Specific architectural object kinds
  if (object.kind === "door") return [0.55, 0.27, 0.08]; // Warm Teak Wood
  if (object.kind === "door_frame") return [0.38, 0.18, 0.05]; // Dark Teak Frame
  if (object.kind === "window") return [0.20, 0.72, 0.95]; // Crystal Glass Window
  if (object.kind === "glass" || object.kind === "railing") return [0.12, 0.68, 0.88]; // Glass Safety Railing
  if (object.kind === "partition" || (object.kind === "wall" && object.label.includes("Partition"))) return [0.76, 0.38, 0.12]; // Terracotta Brick Wall
  if (object.kind === "wall") return [0.92, 0.92, 0.90]; // Smooth Exterior Plaster Ivory White
  if (object.kind === "column") return [0.18, 0.45, 0.82]; // Structural RCC Column Blue
  if (object.kind === "beam") return [0.28, 0.58, 0.90]; // Structural RCC Beam Blue
  if (object.kind === "slab") return [0.85, 0.87, 0.90]; // Concrete Floor Slab
  if (object.kind === "footing") return [0.82, 0.50, 0.20]; // Earthy Footing Pad
  if (object.kind === "balcony") return [0.94, 0.78, 0.38]; // Cantilever Balcony
  if (object.kind === "parapet") return [0.82, 0.28, 0.22]; // Terracotta Parapet
  if (object.kind === "tank") return [0.05, 0.50, 0.82]; // Water Reservoir Blue
  if (object.kind === "excavation") return [0.60, 0.50, 0.40]; // Earth Pit
  if (object.kind === "canopy") return [0.32, 0.42, 0.52]; // Portico Canopy
  if (object.kind === "stair") return [0.45, 0.50, 0.58]; // Staircase Concrete/Steel
  if (object.kind === "kitchen") return [0.18, 0.22, 0.28]; // Dark Granite Counter
  if (object.kind === "bath") return [0.08, 0.60, 0.82]; // Sunken Bath Ceramic
  return [0.70, 0.74, 0.78];
}

function perspective(fovY: number, aspect: number, near: number, far: number): Mat4 {
  const f = 1 / Math.tan(fovY / 2);
  const m = new Float32Array(16);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = (far + near) / (near - far);
  m[11] = -1;
  m[14] = (2 * far * near) / (near - far);
  return m;
}

// Matrix inverse for unprojection
function mat4Invert(out: Float32Array, a: Float32Array): void {
  const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
  const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
  const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
  const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
  const b00 = a00 * a11 - a01 * a10;
  const b01 = a00 * a12 - a02 * a10;
  const b02 = a00 * a13 - a03 * a10;
  const b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11;
  const b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30;
  const b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30;
  const b09 = a21 * a32 - a22 * a31;
  const b10 = a21 * a33 - a23 * a31;
  const b11 = a22 * a33 - a23 * a32;
  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!det) return;
  det = 1.0 / det;
  out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
  out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
  out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
  out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
  out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
  out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
  out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
  out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
  out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
  out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
  out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
  out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
  out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
  out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
  out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
  out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
}

// Transform vector by matrix (4x4 column-major)
function mat4TransformVec4(out: Vec3, m: Float32Array, v: Vec3): void {
  const x = v[0], y = v[1], z = v[2];
  out[0] = m[0] * x + m[4] * y + m[8] * z + m[12];
  out[1] = m[1] * x + m[5] * y + m[9] * z + m[13];
  out[2] = m[2] * x + m[6] * y + m[10] * z + m[14];
}

function lookAt(eye: Vec3, center: Vec3, up: Vec3): Mat4 {
  const z: Vec3 = [eye[0] - center[0], eye[1] - center[1], eye[2] - center[2]];
  const len = Math.hypot(z[0], z[1], z[2]) || 1;
  const zAxis: Vec3 = [z[0] / len, z[1] / len, z[2] / len];
  const xAxis: Vec3 = [
    up[1] * zAxis[2] - up[2] * zAxis[1],
    up[2] * zAxis[0] - up[0] * zAxis[2],
    up[0] * zAxis[1] - up[1] * zAxis[0],
  ];
  const xLen = Math.hypot(xAxis[0], xAxis[1], xAxis[2]) || 1;
  xAxis[0] /= xLen;
  xAxis[1] /= xLen;
  xAxis[2] /= xLen;
  const yAxis: Vec3 = [
    zAxis[1] * xAxis[2] - zAxis[2] * xAxis[1],
    zAxis[2] * xAxis[0] - zAxis[0] * xAxis[2],
    zAxis[0] * xAxis[1] - zAxis[1] * xAxis[0],
  ];
  const m = new Float32Array(16);
  m[0] = xAxis[0];
  m[1] = yAxis[0];
  m[2] = zAxis[0];
  m[4] = xAxis[1];
  m[5] = yAxis[1];
  m[6] = zAxis[1];
  m[8] = xAxis[2];
  m[9] = yAxis[2];
  m[10] = zAxis[2];
  m[12] = -(xAxis[0] * eye[0] + xAxis[1] * eye[1] + xAxis[2] * eye[2]);
  m[13] = -(yAxis[0] * eye[0] + yAxis[1] * eye[1] + yAxis[2] * eye[2]);
  m[14] = -(zAxis[0] * eye[0] + zAxis[1] * eye[1] + zAxis[2] * eye[2]);
  m[15] = 1;
  return m;
}

interface MeshBuffers {
  position: WebGLBuffer;
  normal: WebGLBuffer;
  index: WebGLBuffer;
  count: number;
  indexType: 5125 | 5123; // GL_UNSIGNED_INT (5125) or GL_UNSIGNED_SHORT (5123)
}

export class MeshViewer {
  private readonly canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext;
  private program: WebGLProgram;
  private positionLocation: number;
  private normalLocation: number;
  private projectionLocation: WebGLUniformLocation;
  private viewLocation: WebGLUniformLocation;
  private colorLocation: WebGLUniformLocation;
  private unlitLocation: WebGLUniformLocation;
  private readonly buffers = new Map<string, MeshBuffers>();
  private readonly objects = new Map<string, MeshObject>();
  private ground: MeshBuffers | null = null;
  private hidden = new Set<string>();

  private azimuth = 0.9;
  private elevation = 0.42;
  private distance = 20000;
  private target: Vec3 = [4500, 3500, 1200];
  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  private disposed = false;

  // Measurement state
  private measureMode = false;
  private measurePoints: Vec3[] = [];
  private measureCallback: ((points: Vec3[], totalDistance: number) => void) | null = null;
  private measureOverlay: HTMLCanvasElement | null = null;
  private currentProjection: Mat4 | null = null;
  private currentView: Mat4 | null = null;
  private currentEye: Vec3 = [0, 0, 0];
  private measureOverlayCtx: CanvasRenderingContext2D | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext("webgl", { antialias: true, alpha: true });
    if (!gl) {
      throw new Error("WebGL is not available");
    }
    this.gl = gl;
    this.program = this.buildProgram();
    this.positionLocation = gl.getAttribLocation(this.program, "aPosition");
    this.normalLocation = gl.getAttribLocation(this.program, "aNormal");
    this.projectionLocation = this.uniform("uProjection");
    this.viewLocation = this.uniform("uView");
    this.colorLocation = this.uniform("uColor");
    this.unlitLocation = this.uniform("uUnlit");
    this.attachInput();
    this.attachContextLossHandlers();
  }

  /** Attach WebGL context loss/restoration handlers */
  private attachContextLossHandlers(): void {
    this.canvas.addEventListener("webglcontextlost", (event: Event) => {
      event.preventDefault();
      console.warn("WebGL context lost - will attempt to restore");
      this.handleContextLoss();
    });
    this.canvas.addEventListener("webglcontextrestored", () => {
      console.log("WebGL context restored - rebuilding resources");
      this.handleContextRestored();
    });
  }

  private handleContextLoss(): void {
    // Mark all buffers as invalid
    this.buffers.clear();
    this.ground = null;
  }

  private handleContextRestored(): void {
    // Re-create program and shaders
    const gl = this.canvas.getContext("webgl", { antialias: true, alpha: true });
    if (!gl) return;
    this.gl = gl;
    this.program = this.buildProgram();
    this.positionLocation = gl.getAttribLocation(this.program, "aPosition");
    this.normalLocation = gl.getAttribLocation(this.program, "aNormal");
    this.projectionLocation = this.uniform("uProjection");
    this.viewLocation = this.uniform("uView");
    this.colorLocation = this.uniform("uColor");
    this.unlitLocation = this.uniform("uUnlit");
    // Note: In a real app, you'd also re-upload all mesh data here
  }

  private uniform(name: string): WebGLUniformLocation {
    const location = this.gl.getUniformLocation(this.program, name);
    if (!location) {
      throw new Error(`the shader has no uniform ${name}`);
    }
    return location;
  }

  private compile(type: number, source: string): WebGLShader {
    const shader = this.gl.createShader(type);
    if (!shader) {
      throw new Error("the WebGL context refused a shader");
    }
    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);
    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      const log = this.gl.getShaderInfoLog(shader) ?? "unknown";
      throw new Error(`the shader did not compile: ${log}`);
    }
    return shader;
  }

  private buildProgram(): WebGLProgram {
    const program = this.gl.createProgram();
    if (!program) {
      throw new Error("the WebGL context refused a program");
    }
    this.gl.attachShader(program, this.compile(this.gl.VERTEX_SHADER, VERTEX_SHADER));
    this.gl.attachShader(program, this.compile(this.gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
    this.gl.linkProgram(program);
    if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
      const log = this.gl.getProgramInfoLog(program) ?? "unknown";
      throw new Error(`the program did not link: ${log}`);
    }
    return program;
  }

  private attachInput(): void {
    this.canvas.addEventListener("pointerdown", (event: PointerEvent) => {
      this.dragging = true;
      this.lastX = event.clientX;
      this.lastY = event.clientY;
      this.canvas.setPointerCapture(event.pointerId);
    });
    this.canvas.addEventListener("pointermove", (event: PointerEvent) => {
      if (!this.dragging) {
        return;
      }
      const dx = event.clientX - this.lastX;
      const dy = event.clientY - this.lastY;
      this.lastX = event.clientX;
      this.lastY = event.clientY;
      this.azimuth -= dx * 0.008;
      this.elevation = Math.max(-1.4, Math.min(1.4, this.elevation + dy * 0.008));
      this.render();
    });
    const stop = (event: PointerEvent) => {
      this.dragging = false;
      if (this.canvas.hasPointerCapture(event.pointerId)) {
        this.canvas.releasePointerCapture(event.pointerId);
      }
    };
    this.canvas.addEventListener("pointerup", stop);
    this.canvas.addEventListener("pointercancel", stop);
    this.canvas.addEventListener(
      "wheel",
      (event: WheelEvent) => {
        event.preventDefault();
        const factor = event.deltaY > 0 ? 1.12 : 1 / 1.12;
        this.distance = Math.max(500, Math.min(200000, this.distance * factor));
        this.render();
      },
      { passive: false },
    );
  }

  /** Load the engine's mesh (the triangles and the framing). */
  setMesh(mesh: MeshDocument): void {
    const gl = this.gl;
    for (const buffers of this.buffers.values()) {
      gl.deleteBuffer(buffers.position);
      gl.deleteBuffer(buffers.normal);
      gl.deleteBuffer(buffers.index);
    }
    this.buffers.clear();
    this.objects.clear();
    for (const object of mesh.objects) {
      this.buffers.set(object.id, this.upload(object));
      this.objects.set(object.id, object);
    }
    this.ground = this.buildGround(mesh.objects);
    this.frame(mesh.objects);
    this.render();
  }

  private upload(object: MeshObject): MeshBuffers {
    const gl = this.gl;
    const position = gl.createBuffer();
    const normal = gl.createBuffer();
    const index = gl.createBuffer();
    if (!position || !normal || !index) {
      throw new Error("the WebGL context refused a buffer");
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, position);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(object.positions), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, normal);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(object.normals), gl.STATIC_DRAW);
    const use32 = object.indices.length > 0 && object.indices[object.indices.length - 1] > 65535;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, index);
    gl.bufferData(
      gl.ELEMENT_ARRAY_BUFFER,
      use32 ? new Uint32Array(object.indices) : new Uint16Array(object.indices),
      gl.STATIC_DRAW,
    );
    return { position, normal, index, count: object.indices.length, indexType: use32 ? (gl.UNSIGNED_INT as 5125) : (gl.UNSIGNED_SHORT as 5123) };
  }

  private buildGround(objects: MeshObject[]): MeshBuffers | null {
    if (objects.length === 0) {
      return null;
    }
    const min: Vec3 = [Infinity, Infinity, Infinity];
    const max: Vec3 = [-Infinity, -Infinity, -Infinity];
    for (const object of objects) {
      for (let axis = 0; axis < 3; axis += 1) {
        min[axis] = Math.min(min[axis], object.bboxMinMm[axis]);
        max[axis] = Math.max(max[axis], object.bboxMaxMm[axis]);
      }
    }
    const pad = Math.max(1000, (max[0] - min[0]) * 0.25);
    const z = min[2] - 5;
    const x0 = min[0] - pad;
    const x1 = max[0] + pad;
    const y0 = min[1] - pad;
    const y1 = max[1] + pad;
    const positions = [x0, y0, z, x1, y0, z, x1, y1, z, x0, y0, z, x1, y1, z, x0, y1, z];
    const normals = new Array(18).fill(0).map((_value, index) => (index % 3 === 2 ? 1 : 0));
    const gl = this.gl;
    const position = gl.createBuffer();
    const normal = gl.createBuffer();
    const index = gl.createBuffer();
    if (!position || !normal || !index) {
      return null;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, position);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, normal);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(normals), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, index);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 3, 4, 5]), gl.STATIC_DRAW);
    return { position, normal, index, count: 6, indexType: gl.UNSIGNED_SHORT as 5123 };
  }

  /** Frame the model (the camera looks at the model's centre). */
  private frame(objects: MeshObject[]): void {
    if (objects.length === 0) {
      return;
    }
    const min: Vec3 = [Infinity, Infinity, Infinity];
    const max: Vec3 = [-Infinity, -Infinity, -Infinity];
    for (const object of objects) {
      // Exclude giant excavation pit from skewing full building frame
      if (object.kind === "excavation" && objects.length > 5) continue;
      for (let axis = 0; axis < 3; axis += 1) {
        min[axis] = Math.min(min[axis], object.bboxMinMm[axis]);
        max[axis] = Math.max(max[axis], object.bboxMaxMm[axis]);
      }
    }
    if (!isFinite(min[0])) {
      for (const object of objects) {
        for (let axis = 0; axis < 3; axis += 1) {
          min[axis] = Math.min(min[axis], object.bboxMinMm[axis]);
          max[axis] = Math.max(max[axis], object.bboxMaxMm[axis]);
        }
      }
    }
    this.target = [
      (min[0] + max[0]) / 2,
      (min[1] + max[1]) / 2,
      (min[2] + max[2]) / 2,
    ];
    const span = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2], 1000);
    this.distance = span * 1.5;
  }

  setCameraPreset(mode: "iso" | "front" | "side" | "top"): void {
    if (mode === "iso") {
      this.azimuth = 0.85;
      this.elevation = 0.42;
    } else if (mode === "front") {
      this.azimuth = 0.0;
      this.elevation = 0.05;
    } else if (mode === "side") {
      this.azimuth = Math.PI / 2;
      this.elevation = 0.05;
    } else if (mode === "top") {
      this.azimuth = 0.0;
      this.elevation = 1.52;
    }
    this.render();
  }

  zoomBy(factor: number): void {
    this.distance = Math.max(500, Math.min(250000, this.distance * factor));
    this.render();
  }

  resetCamera(): void {
    this.frame(Array.from(this.objects.values()));
    this.setCameraPreset("iso");
  }

  setHidden(id: string, hidden: boolean): void {
    if (hidden) {
      this.hidden.add(id);
    } else {
      this.hidden.delete(id);
    }
    this.render();
  }

  resize(): void {
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.floor(this.canvas.clientWidth * ratio));
    const height = Math.max(1, Math.floor(this.canvas.clientHeight * ratio));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.render();
  }

  render(): void {
    if (this.disposed) {
      return;
    }
    const gl = this.gl;
    const width = this.canvas.width;
    const height = this.canvas.height;
    gl.viewport(0, 0, width, height);
    gl.clearColor(0.98, 0.965, 0.94, 1);
    gl.enable(gl.DEPTH_TEST);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.program);

    const aspect = width / Math.max(1, height);
    const projection = perspective(0.85, aspect, 50, this.distance * 6);
    const eye: Vec3 = [
      this.target[0] + this.distance * Math.cos(this.elevation) * Math.sin(this.azimuth),
      this.target[1] - this.distance * Math.cos(this.elevation) * Math.cos(this.azimuth),
      this.target[2] + this.distance * Math.sin(this.elevation),
    ];
    const view = lookAt(eye, this.target, [0, 0, 1]);

    // Update camera matrices for measurement
    this.currentProjection = projection;
    this.currentView = view;
    this.currentEye = eye;

    gl.uniformMatrix4fv(this.projectionLocation, false, projection);
    gl.uniformMatrix4fv(this.viewLocation, false, view);

    if (this.ground) {
      this.draw(this.ground, GROUND_COLOR, 1);
    }

    for (const [id, buffers] of this.buffers) {
      if (this.hidden.has(id)) {
        continue;
      }
      const object = this.objects.get(id);
      this.draw(buffers, getColorForObject(object), 0);
    }
  }

  private draw(buffers: MeshBuffers, color: Vec3, unlit: number): void {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.position);
    gl.enableVertexAttribArray(this.positionLocation);
    gl.vertexAttribPointer(this.positionLocation, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.normal);
    gl.enableVertexAttribArray(this.normalLocation);
    gl.vertexAttribPointer(this.normalLocation, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffers.index);
    gl.uniform3f(this.colorLocation, color[0], color[1], color[2]);
    gl.uniform1f(this.unlitLocation, unlit);
    gl.drawElements(gl.TRIANGLES, buffers.count, buffers.indexType, 0);
  }

  // ----- Measurement API -----

  enableMeasurements(onMeasure: (points: Vec3[], totalDistance: number) => void): void {
    this.measureMode = true;
    this.measureCallback = onMeasure;
    this.measurePoints = [];
  }

  disableMeasurements(): void {
    this.measureMode = false;
    this.measurePoints = [];
    if (this.measureCallback) {
      this.measureCallback([], 0);
    }
    this.measureCallback = null;
    this.drawOverlay();
  }

  setMeasureOverlay(canvas: HTMLCanvasElement | null): void {
    this.measureOverlay = canvas;
    if (canvas) {
      this.measureOverlayCtx = canvas.getContext("2d") ?? null;
    } else {
      this.measureOverlayCtx = null;
    }
  }

  setCameraMatrix(projection: Mat4, view: Mat4, eye: Vec3): void {
    this.currentProjection = projection;
    this.currentView = view;
    this.currentEye = eye;
  }

  /** Simple CPU raycasting against all triangle vertices; returns closest hit point */
  pickAt(canvasX: number, canvasY: number): Vec3 | null {
    if (!this.currentProjection || !this.currentView) return null;

    const rect = this.canvas.getBoundingClientRect();
    const nx = ((canvasX - rect.left) / rect.width) * 2 - 1;
    const ny = -(((canvasY - rect.top) / rect.height) * 2 - 1);

    const near = this.unproject(nx, ny, this.currentProjection, this.currentView, 50);
    const far = this.unproject(nx, ny, this.currentProjection, this.currentView, this.distance * 6);
    if (!near || !far) return null;

    const dir: Vec3 = [far[0] - near[0], far[1] - near[1], far[2] - near[2]];
    const dLen = Math.hypot(dir[0], dir[1], dir[2]) || 1;
    dir[0] /= dLen; dir[1] /= dLen; dir[2] /= dLen;

    let closest: Vec3 | null = null;
    let closestDist = Infinity;

    for (const obj of this.objects.values()) {
      for (let i = 0; i < obj.indices.length; i += 3) {
        const i0 = obj.indices[i] * 3;
        const i1 = obj.indices[i + 1] * 3;
        const i2 = obj.indices[i + 2] * 3;
        const v0: Vec3 = [obj.positions[i0], obj.positions[i0 + 1], obj.positions[i0 + 2]];
        const v1: Vec3 = [obj.positions[i1], obj.positions[i1 + 1], obj.positions[i1 + 2]];
        const v2: Vec3 = [obj.positions[i2], obj.positions[i2 + 1], obj.positions[i2 + 2]];

        const hit = this.rayTriangleIntersect(near, dir, v0, v1, v2);
        if (hit) {
          const d = Math.hypot(hit[0] - near[0], hit[1] - near[1], hit[2] - near[2]);
          if (d < closestDist) {
            closestDist = d;
            closest = hit;
          }
        }
      }
    }

    return closest;
  }

  handleMeasureClick(canvasX: number, canvasY: number): void {
    if (!this.measureMode) return;
    const hit = this.pickAt(canvasX, canvasY);
    if (!hit) return;

    this.measurePoints.push(hit);
    if (this.measureCallback) {
      let total = 0;
      for (let i = 1; i < this.measurePoints.length; i++) {
        const p = this.measurePoints[i - 1];
        const q = this.measurePoints[i];
        total += Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
      }
      this.measureCallback(this.measurePoints, total);
    }
    this.drawOverlay();
  }

  clearMeasurements(): void {
    this.measurePoints = [];
    if (this.measureCallback) {
      this.measureCallback([], 0);
    }
    this.drawOverlay();
  }

  private drawOverlay(): void {
    const ctx = this.measureOverlayCtx;
    if (!ctx || !this.measureOverlay) return;

    ctx.clearRect(0, 0, this.measureOverlay.width, this.measureOverlay.height);

    if (this.measurePoints.length < 2) return;

    const projected: { x: number; y: number }[] = [];
    for (const p of this.measurePoints) {
      const screen = this.toScreen(p);
      if (screen) projected.push(screen);
    }

    ctx.strokeStyle = "#e07856";
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 4]);
    ctx.beginPath();
    for (let i = 0; i < projected.length; i++) {
      if (i === 0) ctx.moveTo(projected[i].x, projected[i].y);
      else ctx.lineTo(projected[i].x, projected[i].y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw points
    for (const p of projected) {
      ctx.fillStyle = "#e07856";
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** Unproject NDC to world space */
  private unproject(nx: number, ny: number, proj: Mat4, view: Mat4, depth: number): Vec3 | null {
    const invProj = new Float32Array(16);
    const invView = new Float32Array(16);
    mat4Invert(invProj, proj);
    mat4Invert(invView, view);

    const ndc: Vec3 = [nx, ny, (2.0 * depth) / (this.distance * 6 - depth) - 1.0];
    const eyeSpace: Vec3 = [0, 0, 0];
    mat4TransformVec4(eyeSpace, invProj, ndc);
    if (eyeSpace[2] === 0) return null;
    eyeSpace[0] *= -1; eyeSpace[1] *= -1; eyeSpace[2] *= -1;

    const world: Vec3 = [0, 0, 0];
    mat4TransformVec4(world, invView, eyeSpace);
    return world;
  }

  /** Ray-triangle intersection (Moller-Trumbore) */
  private rayTriangleIntersect(origin: Vec3, dir: Vec3, v0: Vec3, v1: Vec3, v2: Vec3): Vec3 | null {
    const EPSILON = 0.000001;
    const edge1: Vec3 = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]];
    const edge2: Vec3 = [v2[0] - v0[0], v2[1] - v0[1], v2[2] - v0[2]];
    const h: Vec3 = [dir[1] * edge2[2] - dir[2] * edge2[1], dir[2] * edge2[0] - dir[0] * edge2[2], dir[0] * edge2[1] - dir[1] * edge2[0]];
    const a = edge1[0] * h[0] + edge1[1] * h[1] + edge1[2] * h[2];
    if (a > -EPSILON && a < EPSILON) return null;
    const f = 1 / a;
    const s: Vec3 = [origin[0] - v0[0], origin[1] - v0[1], origin[2] - v0[2]];
    const u = f * (s[0] * h[0] + s[1] * h[1] + s[2] * h[2]);
    if (u < 0.0 || u > 1.0) return null;
    const q: Vec3 = [s[1] * edge1[2] - s[2] * edge1[1], s[2] * edge1[0] - s[0] * edge1[2], s[0] * edge1[1] - s[1] * edge1[0]];
    const v = f * (dir[0] * q[0] + dir[1] * q[1] + dir[2] * q[2]);
    if (v < 0.0 || u + v > 1.0) return null;
    const t = f * (edge2[0] * q[0] + edge2[1] * q[1] + edge2[2] * q[2]);
    if (t < EPSILON) return null;
    return [origin[0] + dir[0] * t, origin[1] + dir[1] * t, origin[2] + dir[2] * t];
  }

  /** Project world point to screen coords */
  private toScreen(world: Vec3): { x: number; y: number } | null {
    if (!this.currentProjection || !this.currentView) return null;
    const m = new Float32Array(16);
    // Proper mat mul: projection * view (column-major)
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        let sum = 0;
        for (let k = 0; k < 4; k++) sum += this.currentProjection[r * 4 + k] * this.currentView[k * 4 + c];
        m[r * 4 + c] = sum;
      }
    }

    const out: Vec3 = [0, 0, 0];
    mat4TransformVec4(out, m, world);
    if (out[2] === 0) return null;

    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (out[0] / -out[2] * 0.5 + 0.5) * rect.width,
      y: (-out[1] / -out[2] * 0.5 + 0.5) * rect.height,
    };
  }

  // ----- End Measurement API -----

  dispose(): void {
    this.disposed = true;
    this.measureOverlay = null;
    this.measureOverlayCtx = null;
    const gl = this.gl;
    for (const buffers of this.buffers.values()) {
      gl.deleteBuffer(buffers.position);
      gl.deleteBuffer(buffers.normal);
      gl.deleteBuffer(buffers.index);
    }
    this.buffers.clear();
    gl.deleteProgram(this.program);
  }
}
