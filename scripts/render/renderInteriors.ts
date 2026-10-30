/**
 * Interior walkthrough renders of the 5-storey Dhaka residential building.
 * Renders the FULL mesh for each view (all phases) so walls, floors, beams etc.
 * all appear from an interior camera position.
 */
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { generateBuildingMesh } from "../src/cad/parametricBuildingGenerator.js";
import { getColorForObject } from "../src/cad/viewer.js";
import type { MeshDocument, MeshObject } from "../src/cad/mesh.js";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "planning");
mkdirSync(OUT, { recursive: true });
const W = 1600, H = 1000;

// ─── Interior colour palette ────────────────────────────────────────────────
const PALETTE: Record<string, [number, number, number]> = {
  wall:         [0.92, 0.90, 0.86],   // warm plaster
  partition:    [0.85, 0.82, 0.78],   // light partition
  slab:         [0.75, 0.62, 0.45],   // timber floor
  column:       [0.25, 0.32, 0.48],   // dark steel blue
  beam:         [0.22, 0.30, 0.45],
  footing:      [0.50, 0.42, 0.35],
  door:         [0.42, 0.24, 0.08],
  door_frame:   [0.28, 0.14, 0.04],
  window:       [0.50, 0.80, 0.95],
  stair:        [0.42, 0.44, 0.50],
  kitchen:      [0.20, 0.22, 0.28],
  bath:         [0.12, 0.55, 0.78],
  balcony:      [0.92, 0.76, 0.36],
  railing:      [0.10, 0.65, 0.85],
  parapet:      [0.80, 0.26, 0.20],
  tank:         [0.04, 0.48, 0.80],
  canopy:       [0.30, 0.40, 0.50],
};
function col(o: MeshObject): [number, number, number] {
  return PALETTE[o.kind] ?? [0.70, 0.70, 0.70];
}

// Warm single-light shader
const K = [0.55, 0.68, 0.50];
const F = [-0.35, -0.45, -0.55];
function shade(nx: number, ny: number, nz: number): number {
  const l1 = nx*K[0]+ny*K[1]+nz*K[2];
  const l2 = nx*F[0]+ny*F[1]+nz*F[2];
  return Math.min(1.12, 0.38 + 0.52*Math.max(l1,0) + 0.28*Math.max(l2,0));
}

// ─── Camera: first-person, 80° FOV ──────────────────────────────────────────
interface Cam {
  ex:number;ey:number;ez:number;
  rx:number;ry:number;rz:number;
  ux:number;uy:number;uz:number;
  fx:number;fy:number;fz:number;
  sx:number;sy:number;offX:number;offY:number;
  near:number;far:number;
}
function lookAt(eye:[number,number,number], ctr:[number,number,number], w:number, h:number): Cam {
  const dx=ctr[0]-eye[0], dy=ctr[1]-eye[1], dz=ctr[2]-eye[2];
  const fl=Math.hypot(dx,dy,dz)||1;
  const fz_v=dx/fl, fy_v=dy/fl, fz2=dz/fl;
  // right = cross(forward, world-up=(0,0,1))
  let rx_v=fy_v*1-fz2*0, ry_v=fz2*0-fz_v*1, rz_v=fz_v*0-fy_v*0;
  const rl=Math.hypot(rx_v,ry_v,rz_v)||1; rx_v/=rl; ry_v/=rl; rz_v/=rl;
  // up = cross(right, forward)
  const ux=ry_v*fz2-rz_v*fy_v, uy=rz_v*fz_v-rx_v*fz2, uz=rx_v*fy_v-ry_v*fz_v;
  const proj=(0.5*h)/Math.tan((80*Math.PI/180)/2);
  return {
    ex:eye[0],ey:eye[1],ez:eye[2],
    rx:rx_v,ry:ry_v,rz:rz_v,ux,uy,uz,
    fx:fz_v,fy:fy_v,fz:fz2,
    sx:proj,sy:proj,offX:w*0.5,offY:h*0.5,
    near:15, far:60000,
  };
}
function project(cam:Cam, vx:number, vy:number, vz:number):[number,number,number]|null {
  const dx=vx-cam.ex, dy=vy-cam.ey, dz=vz-cam.ez;
  const zv=dx*cam.fx+dy*cam.fy+dz*cam.fz;
  if(zv<=cam.near||zv>cam.far) return null;
  const xv=dx*cam.rx+dy*cam.ry+dz*cam.rz;
  const yv=dx*cam.ux+dy*cam.uy+dz*cam.uz;
  const inv=1/zv;
  return [xv*cam.sx*inv+cam.offX, cam.offY-yv*cam.sy*inv, zv];
}

// ─── Triangle fill ────────────────────────────────────────────────────────────
function fillTri(fb:Uint8Array, depth:Float32Array, w:number, h:number,
  x0:number,y0:number,z0:number, x1:number,y1:number,z1:number,
  x2:number,y2:number,z2:number, r:number,g:number,b:number):void {
  const denom=(y1-y2)*(x0-x2)+(x2-x1)*(y0-y2);
  if(denom===0) return;
  const inv=1/denom;
  const a0=(y1-y2)*inv, b0=(x2-x1)*inv, c0=(x1*y2-x2*y1)*inv;
  const a1=(y2-y0)*inv, b1=(x0-x2)*inv, c1=(x2*y0-x0*y2)*inv;
  const dz0=z0-z2, dz1=z1-z2, dz=a0*dz0+a1*dz1;
  let minX=Math.max(0,Math.floor(Math.min(x0,x1,x2)));
  let maxX=Math.min(w-1,Math.ceil(Math.max(x0,x1,x2)));
  let minY=Math.max(0,Math.floor(Math.min(y0,y1,y2)));
  let maxY=Math.min(h-1,Math.ceil(Math.max(y0,y1,y2)));
  if(minX>maxX||minY>maxY) return;
  for(let py=minY;py<=maxY;py++){
    let l0=a0*minX+b0*py+c0, l1=a1*minX+b1*py+c1, zz=z2+dz0*l0+dz1*l1;
    let p=py*w+minX;
    for(let px=minX;px<=maxX;px++,p++){
      if(l0>=0&&l1>=0&&l0+l1<=1){
        if(zz<depth[p]){ depth[p]=zz; const pi=p*3; fb[pi]=r; fb[pi+1]=g; fb[pi+2]=b; }
      }
      l0+=a0; l1+=a1; zz+=dz;
    }
  }
}

// ─── Renderer (NO backface culling — enables interior views) ────────────────
function render(objs:MeshObject[], cam:Cam, w:number, h:number):Uint8Array {
  const depth=new Float32Array(w*h); depth.fill(Infinity);
  const fb=new Uint8Array(w*h*3);
  for(let i=0;i<w*h;i++){ fb[i*3]=248; fb[i*3+1]=243; fb[i*3+2]=235; }
  for(const o of objs){
    const c=col(o), pos=o.positions, nrm=o.normals, ind=o.indices;
    for(let t=0;t<ind.length;t+=3){
      const i0=ind[t], i1=ind[t+1], i2=ind[t+2];
      const p0=i0*3, p1=i1*3, p2=i2*3;
      const nx=nrm[p0], ny=nrm[p0+1], nz=nrm[p0+2];
      const sh=shade(nx,ny,nz);
      const r=Math.min(255,Math.round(c[0]*sh*255));
      const g=Math.min(255,Math.round(c[1]*sh*255));
      const b=Math.min(255,Math.round(c[2]*sh*255));
      const s0=project(cam,pos[p0],pos[p0+1],pos[p0+2]);
      const s1=project(cam,pos[p1],pos[p1+1],pos[p1+2]);
      const s2=project(cam,pos[p2],pos[p2+1],pos[p2+2]);
      if(!s0||!s1||!s2) continue;
      fillTri(fb,depth,w,h, s0[0],s0[1],s0[2], s1[0],s1[1],s1[2], s2[0],s2[1],s2[2], r,g,b);
    }
  }
  return fb;
}

// ─── PNG encoder ──────────────────────────────────────────────────────────────
const CRC_T=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
function crc32(b:Uint8Array):number{let c=0xffffffff;for(let i=0;i<b.length;i++)c=CRC_T[(c^b[i])&0xff]^(c>>>8);return(c^0xffffffff)>>>0;}
function pngChunk(type:string,data:Uint8Array):Buffer{const o=Buffer.alloc(12+data.length);o.writeUInt32BE(data.length,0);o.write(type,4,"ascii");o.set(data,8);o.writeUInt32BE(crc32(o.subarray(4,8+data.length)),8+data.length);return o;}
function encodePng(fb:Uint8Array,w:number,h:number):Buffer{
  const sig=Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w,0);ihdr.writeUInt32BE(h,4);ihdr[8]=8;ihdr[9]=2;
  const stride=w*3, raw=Buffer.alloc((stride+1)*h);
  for(let y=0;y<h;y++){raw[y*(stride+1)]=0;raw.set(fb.subarray(y*stride,(y+1)*stride),y*(stride+1)+1);}
  return Buffer.concat([sig, pngChunk("IHDR",ihdr), pngChunk("IDAT",deflateSync(raw,{level:1})), pngChunk("IEND",Buffer.alloc(0))]);
}

// ─── View specs ───────────────────────────────────────────────────────────────
// All positions in mm absolute world coordinates.
// Building footprint: X=[1000,7000], Y=[2000,8000] (7m × 6m)
// Story height: 3000mm. Floor slabs at Z=0,3000,6000,9000,12000
interface View {
  label:string;
  // Phase to show as "floor" (ceiling above camera)
  floorPhase:string;
  // Full mesh to render
  eye:[number,number,number];   // camera position (mm)
  look:[number,number,number];  // look-at point
}
const VIEWS: View[] = [
  // ── GROUND FLOOR (Z slab at ~0, ceiling at 3000) ──────────────────────────
  {
    label: "Ground Floor – Car Parking",
    floorPhase: "ground_floor",
    eye: [3000, 4500, 1500],
    look: [4500, 5500, 1500],
  },
  {
    label: "Ground Floor – Entrance Corridor",
    floorPhase: "ground_floor",
    eye: [4500, 5500, 1500],
    look: [4500, 4000, 1500],
  },
  // ── FLOOR 1 – Unit A (front flat, Y≈6600–11400) ───────────────────────────
  {
    label: "Floor 1 – Unit A Master Bedroom",
    floorPhase: "floor_1",
    eye: [3500, 8500, 1500],
    look: [3500, 10000, 1500],
  },
  {
    label: "Floor 1 – Unit A Living Hall",
    floorPhase: "floor_1",
    eye: [6000, 8500, 1500],
    look: [7200, 8500, 1500],
  },
  {
    label: "Floor 1 – Unit A Kitchen",
    floorPhase: "floor_1",
    eye: [6500, 9500, 1500],
    look: [5500, 9500, 1500],
  },
  {
    label: "Floor 1 – Unit A Bathroom",
    floorPhase: "floor_1",
    eye: [5500, 5500, 1500],
    look: [5000, 5500, 1500],
  },
  // ── FLOOR 1 – Unit B (rear flat, Y≈2000–5000) ─────────────────────────────
  {
    label: "Floor 1 – Unit B Master Bedroom",
    floorPhase: "floor_1",
    eye: [3000, 3000, 1500],
    look: [3000, 4500, 1500],
  },
  {
    label: "Floor 1 – Unit B Living Hall",
    floorPhase: "floor_1",
    eye: [5500, 3000, 1500],
    look: [6800, 3000, 1500],
  },
  {
    label: "Floor 1 – Unit B Kitchen",
    floorPhase: "floor_1",
    eye: [6500, 3800, 1500],
    look: [5500, 3800, 1500],
  },
  {
    label: "Floor 1 – Stair Core Lobby",
    floorPhase: "floor_1",
    eye: [4500, 4500, 1500],
    look: [4500, 3000, 1500],
  },
  // ── FLOOR 3 (middle floor – representative) ────────────────────────────────
  {
    label: "Floor 3 – Unit A Master Bedroom",
    floorPhase: "floor_3",
    eye: [3500, 8500, 7500],
    look: [3500, 10000, 7500],
  },
  {
    label: "Floor 3 – Unit A Living Hall",
    floorPhase: "floor_3",
    eye: [6000, 8500, 7500],
    look: [7200, 8500, 7500],
  },
  {
    label: "Floor 3 – Unit B Master Bedroom",
    floorPhase: "floor_3",
    eye: [3000, 3000, 7500],
    look: [3000, 4500, 7500],
  },
  {
    label: "Floor 3 – Unit B Living Hall",
    floorPhase: "floor_3",
    eye: [5500, 3000, 7500],
    look: [6800, 3000, 7500],
  },
  // ── ROOF TERRACE ────────────────────────────────────────────────────────────
  {
    label: "Roof Terrace – Overhead Tank",
    floorPhase: "roof",
    eye: [4000, 6000, 16200],
    look: [5000, 6000, 16200],
  },
  {
    label: "Roof Terrace – Parapet Edge",
    floorPhase: "roof",
    eye: [4500, 7500, 16200],
    look: [4500, 9000, 16200],
  },
];

// ─── Main ─────────────────────────────────────────────────────────────────────
const p5 = {
  id:"demo-5story", name:"Dhaka 5-Storey Residential", address:"Mirpur, Dhaka",
  stories:5, plotSize:3.5, plotUnit:"katha" as const,
  plotSqm:234.1, unitsPerFloor:2, phases:[], designStarted:true,
  createdAt:"", updatedAt:"",
};
const doc = generateBuildingMesh(p5, "final", {
  columnWidthMm:250, columnDepthMm:250,
  footingSizeMm:1800, footingDepthMm:1600, balconyDepthMm:1200,
});
console.log(`[interior] generated ${doc.objects.length} objects`);

let rendered = 0;
for(const v of VIEWS){
  const cam = lookAt(v.eye, v.look, W, H);
  const fb = render(doc.objects, cam, W, H);
  const buf = encodePng(fb, W, H);
  const safe = v.label.replace(/[^a-zA-Z0-9]/g,"_");
  const path = join(OUT, `interior_${safe}.png`);
  writeFileSync(path, buf);
  rendered++;
  // quick pixel stats
  const colors = new Set<string>();
  for(let i=0;i<buf.length;i+=3) colors.add(`${buf[i]},${buf[i+1]},${buf[i+2]}`);
  console.log(`[interior] ${v.label}  colors=${colors.size}  bytes=${buf.length.toLocaleString()}`);
}
console.log(`[interior] rendered ${rendered}/${VIEWS.length} views  → ${OUT}`);
console.log("DONE");
