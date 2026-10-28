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
}

export class MeshViewer {
  private readonly canvas: HTMLCanvasElement;
  private readonly gl: WebGLRenderingContext;
  private readonly program: WebGLProgram;
  private readonly positionLocation: number;
  private readonly normalLocation: number;
  private readonly projectionLocation: WebGLUniformLocation;
  private readonly viewLocation: WebGLUniformLocation;
  private readonly colorLocation: WebGLUniformLocation;
  private readonly unlitLocation: WebGLUniformLocation;
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
    return { position, normal, index, count: object.indices.length };
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
    return { position, normal, index, count: 6 };
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
    gl.drawElements(gl.TRIANGLES, buffers.count, gl.UNSIGNED_SHORT, 0);
  }

  dispose(): void {
    this.disposed = true;
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
