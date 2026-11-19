// Turns a Sketchfab glTF export (scene.gltf + scene.bin, possibly split into
// several meshes) into a GLB laid out like public/human_body.glb, so the body
// component and segmentBody.ts can treat both bodies the same way:
//   - one mesh, node named "Object_4", no node transforms
//   - Y up from 0 (soles) to 4.469 (top of the head), X = 0 midline, Z > 0 front
//   - pieces welded where they touch, so normals are smooth across the seams
//
// Run from medseek-frontend:
//   npx tsx scripts/convert-body.mts <dir with scene.gltf> public/human_body_female.glb
import fs from "node:fs";
import path from "node:path";

const [srcDir, outFile] = process.argv.slice(2);
if (!srcDir || !outFile) {
  console.error("usage: convert-body.mts <dir with scene.gltf> <out.glb>");
  process.exit(1);
}

const TARGET_HEIGHT = 4.469; // same as the male body
const j = JSON.parse(fs.readFileSync(path.join(srcDir, "scene.gltf"), "utf8"));
const bin = fs.readFileSync(path.join(srcDir, j.buffers[0].uri));

type Mat = number[];
const I: Mat = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function mul(a: Mat, b: Mat): Mat {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++)
      for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}
function local(n: { matrix?: Mat; translation?: number[]; rotation?: number[]; scale?: number[] }): Mat {
  if (n.matrix) return n.matrix;
  if (n.translation || n.rotation || n.scale) throw new Error("TRS nodes not handled; export with matrices");
  return I;
}

// Collect every mesh with its world matrix.
const pieces: { mesh: number; M: Mat }[] = [];
function walk(idx: number, parent: Mat) {
  const n = j.nodes[idx];
  const M = mul(parent, local(n));
  if (n.mesh !== undefined) pieces.push({ mesh: n.mesh, M });
  for (const c of n.children ?? []) walk(c, M);
}
for (const r of j.scenes[j.scene ?? 0].nodes) walk(r, I);

function readVec3(acc: number): Float32Array {
  const a = j.accessors[acc];
  const v = j.bufferViews[a.bufferView];
  const out = new Float32Array(a.count * 3);
  const stride = v.byteStride || 12;
  const base = (v.byteOffset || 0) + (a.byteOffset || 0);
  for (let i = 0; i < a.count; i++)
    for (let k = 0; k < 3; k++) out[i * 3 + k] = bin.readFloatLE(base + i * stride + k * 4);
  return out;
}
function readIndices(acc: number): Uint32Array {
  const a = j.accessors[acc];
  const v = j.bufferViews[a.bufferView];
  const base = (v.byteOffset || 0) + (a.byteOffset || 0);
  const out = new Uint32Array(a.count);
  for (let i = 0; i < a.count; i++)
    out[i] =
      a.componentType === 5125 ? bin.readUInt32LE(base + i * 4)
      : a.componentType === 5123 ? bin.readUInt16LE(base + i * 2)
      : bin.readUInt8(base + i);
  return out;
}

// Merge all pieces in world space, welding vertices that share a position.
const pos: number[] = [];
const idx: number[] = [];
const weld = new Map<string, number>();
let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
for (const { mesh, M } of pieces) {
  for (const prim of j.meshes[mesh].primitives) {
    const p = readVec3(prim.attributes.POSITION);
    const tri = readIndices(prim.indices);
    const remap = new Uint32Array(p.length / 3);
    for (let i = 0; i < p.length / 3; i++) {
      const x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2];
      const wx = M[0] * x + M[4] * y + M[8] * z + M[12];
      const wy = M[1] * x + M[5] * y + M[9] * z + M[13];
      const wz = M[2] * x + M[6] * y + M[10] * z + M[14];
      const key = `${wx.toFixed(2)},${wy.toFixed(2)},${wz.toFixed(2)}`;
      let k = weld.get(key);
      if (k === undefined) {
        k = pos.length / 3;
        pos.push(wx, wy, wz);
        weld.set(key, k);
        minX = Math.min(minX, wx); maxX = Math.max(maxX, wx);
        minY = Math.min(minY, wy); maxY = Math.max(maxY, wy);
        minZ = Math.min(minZ, wz); maxZ = Math.max(maxZ, wz);
      }
      remap[i] = k;
    }
    for (let t = 0; t < tri.length; t += 3) {
      const a = remap[tri[t]], b = remap[tri[t + 1]], c = remap[tri[t + 2]];
      if (a !== b && b !== c && a !== c) idx.push(a, b, c);
    }
  }
}

// Normalise: soles on 0, target height, centred in X and Z.
const s = TARGET_HEIGHT / (maxY - minY);
const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
const out = new Float32Array(pos.length);
for (let i = 0; i < pos.length; i += 3) {
  out[i] = (pos[i] - cx) * s;
  out[i + 1] = (pos[i + 1] - minY) * s;
  out[i + 2] = (pos[i + 2] - cz) * s;
}

// Face +Z: the chest sticks out further at the front than the shoulder blades at the back.
let front = 0, back = 0;
for (let i = 0; i < out.length; i += 3) {
  const y = out[i + 1];
  if (y > 3.0 && y < 3.6 && Math.abs(out[i]) < 0.4) { front = Math.max(front, out[i + 2]); back = Math.min(back, out[i + 2]); }
}
if (-back > front) for (let i = 0; i < out.length; i += 3) { out[i] = -out[i]; out[i + 2] = -out[i + 2]; }

// Optional: split the triangles above a height into smaller ones (shape
// unchanged), so a coarse head has enough points for the face parts.
// Edges shared with triangles below get a matching split, so no cracks.
//   --refine-above <y> [--passes <n>]
const refineAt = process.argv.indexOf("--refine-above");
const verts = Array.from(out);
let tris = idx;
if (refineAt > 0) {
  const yCut = Number(process.argv[refineAt + 1]);
  const passesAt = process.argv.indexOf("--passes");
  const passes = passesAt > 0 ? Number(process.argv[passesAt + 1]) : 1;
  for (let p = 0; p < passes; p++) {
    const mids = new Map<string, number>();
    const edgeKey = (a: number, b: number) => (a < b ? `${a}_${b}` : `${b}_${a}`);
    const mid = (a: number, b: number) => {
      const k = edgeKey(a, b);
      let m = mids.get(k);
      if (m === undefined) {
        m = verts.length / 3;
        verts.push((verts[a * 3] + verts[b * 3]) / 2, (verts[a * 3 + 1] + verts[b * 3 + 1]) / 2, (verts[a * 3 + 2] + verts[b * 3 + 2]) / 2);
        mids.set(k, m);
      }
      return m;
    };
    // 1. Every edge of a triangle fully above the cut gets a midpoint.
    for (let t = 0; t < tris.length; t += 3) {
      const [a, b, c] = [tris[t], tris[t + 1], tris[t + 2]];
      if (verts[a * 3 + 1] > yCut && verts[b * 3 + 1] > yCut && verts[c * 3 + 1] > yCut) { mid(a, b); mid(b, c); mid(c, a); }
    }
    // 2. Split each triangle by how many of its edges have a midpoint.
    const next: number[] = [];
    for (let t = 0; t < tris.length; t += 3) {
      const v = [tris[t], tris[t + 1], tris[t + 2]];
      const m = [0, 1, 2].map((i) => mids.get(edgeKey(v[i], v[(i + 1) % 3])));
      const n = m.filter((x) => x !== undefined).length;
      if (n === 0) next.push(v[0], v[1], v[2]);
      else if (n === 3) {
        const [ab, bc, ca] = m as number[];
        next.push(v[0], ab, ca, ab, v[1], bc, ca, bc, v[2], ab, bc, ca);
      } else if (n === 1) {
        const i = m.findIndex((x) => x !== undefined);
        const a = v[i], b = v[(i + 1) % 3], c = v[(i + 2) % 3], ab = m[i]!;
        next.push(a, ab, c, ab, b, c);
      } else {
        // Two split edges: the unsplit one is opposite vertex `k`.
        const j = m.findIndex((x) => x === undefined); // edge v[j]→v[j+1] not split
        const a = v[j], b = v[(j + 1) % 3], c = v[(j + 2) % 3];
        const bc = m[(j + 1) % 3]!, ca = m[(j + 2) % 3]!;
        next.push(c, ca, bc, ca, a, b, ca, b, bc);
      }
    }
    tris = next;
  }
}

// Write a minimal GLB.
const fin = new Float32Array(verts);
const count = fin.length / 3;
const bmin = [Infinity, Infinity, Infinity], bmax = [-Infinity, -Infinity, -Infinity];
for (let i = 0; i < count; i++)
  for (let k = 0; k < 3; k++) { bmin[k] = Math.min(bmin[k], fin[i * 3 + k]); bmax[k] = Math.max(bmax[k], fin[i * 3 + k]); }
const posBuf = Buffer.from(fin.buffer);
const idxBuf = Buffer.from(new Uint32Array(tris).buffer);
const binBuf = Buffer.concat([posBuf, idxBuf]);
const gltf = {
  asset: { version: "2.0", generator: "medseek convert-body", extras: j.asset?.extras },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ name: "Object_4", mesh: 0 }],
  meshes: [{ name: "body", primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
  materials: [{ name: "body" }],
  accessors: [
    { bufferView: 0, componentType: 5126, count, type: "VEC3", min: bmin, max: bmax },
    { bufferView: 1, componentType: 5125, count: tris.length, type: "SCALAR" },
  ],
  bufferViews: [
    { buffer: 0, byteOffset: 0, byteLength: posBuf.length, target: 34962 },
    { buffer: 0, byteOffset: posBuf.length, byteLength: idxBuf.length, target: 34963 },
  ],
  buffers: [{ byteLength: binBuf.length }],
};
let json = Buffer.from(JSON.stringify(gltf));
json = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);
const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + json.length + 8 + binBuf.length, 8);
const ch = (len: number, type: number) => { const b = Buffer.alloc(8); b.writeUInt32LE(len, 0); b.writeUInt32LE(type, 4); return b; };
fs.writeFileSync(outFile, Buffer.concat([header, ch(json.length, 0x4e4f534a), json, ch(binBuf.length, 0x004e4942), binBuf]));
console.log(`${pieces.length} pieces → ${count} vertices, ${tris.length / 3} triangles, flipped=${-back > front}`);
console.log(`bounds x ${bmin[0].toFixed(3)}..${bmax[0].toFixed(3)}  y ${bmin[1].toFixed(3)}..${bmax[1].toFixed(3)}  z ${bmin[2].toFixed(3)}..${bmax[2].toFixed(3)}`);
