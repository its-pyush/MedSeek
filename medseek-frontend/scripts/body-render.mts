// Draws the body coloured by body part, so the boundaries can be checked by eye.
// Run from medseek-frontend: npm run body:render [-- <output dir>]
import fs from "node:fs";
import { loadBody } from "./lib/loadBody.mts";
import { renderView, writePng, type View } from "./lib/render.mts";
import { PART_IDS, BODY_MODEL_URL, labelVertices, type BodyId } from "../src/components/body/segmentBody.ts";

// npm run body:render [-- <output dir> [male|female]]
const out = process.argv[2] || "body-render";
const bodyId = (process.argv[3] || "male") as BodyId;
fs.mkdirSync(out, { recursive: true });
const mesh = loadBody("public" + BODY_MODEL_URL[bodyId]);
const labels = labelVertices(mesh.pos, mesh.nrm, bodyId);

function hsl(h: number, s: number, l: number): [number, number, number] {
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return [f(0), f(8), f(4)];
}
// Neighbouring parts sit next to each other in PART_IDS, so step the hue far each time.
const palette = PART_IDS.map((_, i) => hsl((i * 137.5) % 360, 0.75, i % 2 ? 0.45 : 0.62));
const colour = (v: number) => palette[labels[v]];

const PI = Math.PI;
const views: View[] = [
  { name: "front", yaw: 0, cx: 0, cy: 2.235, halfH: 2.35, w: 1000, h: 1200 },
  { name: "back", yaw: PI, cx: 0, cy: 2.235, halfH: 2.35, w: 1000, h: 1200 },
  { name: "side", yaw: PI / 2, cx: 0, cy: 2.235, halfH: 2.35, w: 520, h: 1200 },
  { name: "three-quarter", yaw: -PI / 5, cx: 0, cy: 2.235, halfH: 2.35, w: 1000, h: 1200 },
  { name: "head-front", yaw: 0, cx: 0, cy: 4.1, halfH: 0.45, w: 800, h: 900 },
  { name: "head-side", yaw: PI / 2, cx: 0, cy: 4.1, halfH: 0.45, w: 800, h: 900 },
  { name: "head-back", yaw: PI, cx: 0, cy: 4.1, halfH: 0.45, w: 800, h: 900 },
  { name: "torso-front", yaw: 0, cx: 0, cy: 2.95, halfH: 1.0, w: 1100, h: 1000 },
  { name: "torso-back", yaw: PI, cx: 0, cy: 2.95, halfH: 1.0, w: 1100, h: 1000 },
  { name: "arm-front", yaw: 0, cx: 1.15, cy: 3.05, halfH: 0.75, w: 1100, h: 1000 },
  { name: "arm-back", yaw: PI, cx: -1.15, cy: 3.05, halfH: 0.75, w: 1100, h: 1000 },
  { name: "pelvis-front", yaw: 0, cx: 0, cy: 2.3, halfH: 0.5, w: 1000, h: 800 },
  { name: "pelvis-back", yaw: PI, cx: 0, cy: 2.3, halfH: 0.5, w: 1000, h: 800 },
  { name: "feet-side", yaw: PI / 2, cx: 0.1, cy: 0.3, halfH: 0.4, w: 1000, h: 700 },
];
for (const v of views) {
  const r = renderView(mesh, v, colour);
  writePng(`${out}/${v.name}.png`, r.w, r.h, r.rgb);
}
console.log(`Wrote ${views.length} images to ${out}/`);
console.log(PART_IDS.map((id, i) => `${id}=rgb(${palette[i].join(",")})`).join("  "));
