// Loads public/human_body.glb the same way HumanBodyModel does: world matrix baked
// into the positions, vertex normals recomputed. No three.js needed.
import fs from "node:fs";

export interface BodyMesh {
  count: number;
  pos: Float32Array; // xyz per vertex, baked
  nrm: Float32Array; // xyz per vertex, unit
  idx: Uint32Array; // triangles
}

type Mat = number[]; // column-major 4x4

function mul(a: Mat, b: Mat): Mat {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++)
      for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}

export function loadBody(path = "public/human_body.glb"): BodyMesh {
  const b = fs.readFileSync(path);
  const jsonLen = b.readUInt32LE(12);
  const j = JSON.parse(b.subarray(20, 20 + jsonLen).toString());
  const bin = 20 + jsonLen + 8;

  let M: Mat = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  // Single chain of nodes 0 → 4 (Sketchfab export).
  for (const n of j.nodes) if (n.matrix) M = mul(M, n.matrix);

  const prim = j.meshes[0].primitives[0];
  const pa = j.accessors[prim.attributes.POSITION];
  const pv = j.bufferViews[pa.bufferView];
  const pOff = bin + (pv.byteOffset || 0) + (pa.byteOffset || 0);
  const pStride = pv.byteStride || 12;
  const count = pa.count;
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const x = b.readFloatLE(pOff + i * pStride);
    const y = b.readFloatLE(pOff + i * pStride + 4);
    const z = b.readFloatLE(pOff + i * pStride + 8);
    pos[i * 3] = M[0] * x + M[4] * y + M[8] * z + M[12];
    pos[i * 3 + 1] = M[1] * x + M[5] * y + M[9] * z + M[13];
    pos[i * 3 + 2] = M[2] * x + M[6] * y + M[10] * z + M[14];
  }

  const ia = j.accessors[prim.indices];
  const iv = j.bufferViews[ia.bufferView];
  const iOff = bin + (iv.byteOffset || 0) + (ia.byteOffset || 0);
  const idx = new Uint32Array(ia.count);
  for (let i = 0; i < ia.count; i++) {
    idx[i] =
      ia.componentType === 5125
        ? b.readUInt32LE(iOff + i * 4)
        : ia.componentType === 5123
          ? b.readUInt16LE(iOff + i * 2)
          : b.readUInt8(iOff + i);
  }

  // Area-weighted vertex normals (what geometry.computeVertexNormals() does).
  const nrm = new Float32Array(count * 3);
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, c = idx[t + 1] * 3, d = idx[t + 2] * 3;
    const ux = pos[c] - pos[a], uy = pos[c + 1] - pos[a + 1], uz = pos[c + 2] - pos[a + 2];
    const vx = pos[d] - pos[a], vy = pos[d + 1] - pos[a + 1], vz = pos[d + 2] - pos[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const k of [a, c, d]) { nrm[k] += nx; nrm[k + 1] += ny; nrm[k + 2] += nz; }
  }
  for (let i = 0; i < count; i++) {
    const l = Math.hypot(nrm[i * 3], nrm[i * 3 + 1], nrm[i * 3 + 2]) || 1;
    nrm[i * 3] /= l; nrm[i * 3 + 1] /= l; nrm[i * 3 + 2] /= l;
  }
  return { count, pos, nrm, idx };
}
