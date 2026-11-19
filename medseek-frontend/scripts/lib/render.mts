// Tiny software rasteriser: orthographic views of the body, coloured per vertex.
import zlib from "node:zlib";
import fs from "node:fs";
import type { BodyMesh } from "./loadBody.mts";

export type View = { name: string; yaw: number; cx: number; cy: number; halfH: number; w?: number; h?: number };

function crc32(buf: Buffer): number {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
export function writePng(path: string, w: number, h: number, rgb: Uint8Array) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    Buffer.from(rgb.buffer, y * w * 3, w * 3).copy(raw, y * (w * 3 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  fs.writeFileSync(path, Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0)),
  ]));
}

/** colour(i) → [r,g,b] 0..255 for vertex i. Flat per triangle (first vertex), lit by the normal. */
export function renderView(mesh: BodyMesh, view: View, colour: (v: number) => [number, number, number]) {
  const h = view.h ?? 900, w = view.w ?? 600;
  const scale = h / (2 * view.halfH);
  const cos = Math.cos(view.yaw), sin = Math.sin(view.yaw);
  const rgb = new Uint8Array(w * h * 3).fill(245);
  const zb = new Float32Array(w * h).fill(-1e9);
  const sx = new Float32Array(mesh.count), sy = new Float32Array(mesh.count), sz = new Float32Array(mesh.count), lit = new Float32Array(mesh.count);
  for (let i = 0; i < mesh.count; i++) {
    const x = mesh.pos[i * 3], y = mesh.pos[i * 3 + 1], z = mesh.pos[i * 3 + 2];
    const rx = x * cos + z * sin, rz = -x * sin + z * cos; // rotate body about Y by yaw
    sx[i] = (rx - view.cx) * scale + w / 2;
    sy[i] = h / 2 - (y - view.cy) * scale;
    sz[i] = rz;
    const nx = mesh.nrm[i * 3], ny = mesh.nrm[i * 3 + 1], nz = mesh.nrm[i * 3 + 2];
    const vz = -nx * sin + nz * cos, vx = nx * cos + nz * sin;
    lit[i] = 0.55 + 0.45 * Math.max(0, vz * 0.85 + ny * 0.3 + vx * 0.2);
  }
  for (let t = 0; t < mesh.idx.length; t += 3) {
    const a = mesh.idx[t], b = mesh.idx[t + 1], c = mesh.idx[t + 2];
    const minX = Math.max(0, Math.floor(Math.min(sx[a], sx[b], sx[c]))), maxX = Math.min(w - 1, Math.ceil(Math.max(sx[a], sx[b], sx[c])));
    const minY = Math.max(0, Math.floor(Math.min(sy[a], sy[b], sy[c]))), maxY = Math.min(h - 1, Math.ceil(Math.max(sy[a], sy[b], sy[c])));
    if (minX > maxX || minY > maxY) continue;
    const den = (sy[b] - sy[c]) * (sx[a] - sx[c]) + (sx[c] - sx[b]) * (sy[a] - sy[c]);
    if (Math.abs(den) < 1e-9) continue;
    // Majority colour of the triangle = what the app's tap would resolve to.
    const ca = colour(a), cb = colour(b), cc = colour(c);
    const col = cb[0] === cc[0] && cb[1] === cc[1] && cb[2] === cc[2] ? cb : ca;
    for (let py = minY; py <= maxY; py++)
      for (let px = minX; px <= maxX; px++) {
        const l1 = ((sy[b] - sy[c]) * (px - sx[c]) + (sx[c] - sx[b]) * (py - sy[c])) / den;
        const l2 = ((sy[c] - sy[a]) * (px - sx[c]) + (sx[a] - sx[c]) * (py - sy[c])) / den;
        const l3 = 1 - l1 - l2;
        if (l1 < -0.001 || l2 < -0.001 || l3 < -0.001) continue;
        const z = l1 * sz[a] + l2 * sz[b] + l3 * sz[c];
        const o = py * w + px;
        if (z <= zb[o]) continue;
        zb[o] = z;
        const s = l1 * lit[a] + l2 * lit[b] + l3 * lit[c];
        rgb[o * 3] = col[0] * s; rgb[o * 3 + 1] = col[1] * s; rgb[o * 3 + 2] = col[2] * s;
      }
  }
  return { w, h, rgb };
}
