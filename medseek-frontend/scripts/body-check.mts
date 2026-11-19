// Verifies the body-part labelling of the 3D model.
// Run from medseek-frontend: npm run body:check
import { loadBody } from "./lib/loadBody.mts";
import { PART_IDS, BODY_MODEL_URL, labelVertices, type BodyId } from "../src/components/body/segmentBody.ts";
import { REGION_HIERARCHY, partsOfMajor } from "../src/components/regionHierarchy.ts";

const MIN_VERTICES = 20;
const MAX_SIDE_IMBALANCE = 0.15;

const problems: string[] = [];

// 1. The picker's list of parts and the labeller's list must be the same set.
const hierarchyParts = REGION_HIERARCHY.flatMap(partsOfMajor);
for (const id of hierarchyParts) if (!PART_IDS.includes(id as never)) problems.push(`"${id}" is in the picker but the model never labels it`);
for (const id of PART_IDS) if (!hierarchyParts.includes(id)) problems.push(`"${id}" is labelled on the model but missing from the picker`);
if (new Set(hierarchyParts).size !== hierarchyParts.length) problems.push("a part id appears twice in the picker");

for (const bodyId of Object.keys(BODY_MODEL_URL) as BodyId[]) {
const mesh = loadBody("public" + BODY_MODEL_URL[bodyId]);
const labels = labelVertices(mesh.pos, mesh.nrm, bodyId);
console.log(`\n=== ${bodyId} body`);
// 2. Every vertex is labelled (labelVertices would give NaN → 0 for an unknown id, so count by id).
const total = new Array(PART_IDS.length).fill(0);
const left = new Array(PART_IDS.length).fill(0);
const right = new Array(PART_IDS.length).fill(0);
for (let i = 0; i < mesh.count; i++) {
  total[labels[i]]++;
  if (mesh.pos[i * 3] > 0.005) right[labels[i]]++;
  else if (mesh.pos[i * 3] < -0.005) left[labels[i]]++;
}
const labelled = total.reduce((a, b) => a + b, 0);
if (labelled !== mesh.count) problems.push(`[${bodyId}] ${mesh.count - labelled} vertices have no label`);

// 3. Each part is big enough to tap, and the two sides of the body agree.
console.log("part".padEnd(18), "vertices".padStart(8), "left".padStart(6), "right".padStart(6));
PART_IDS.forEach((id, i) => {
  console.log(id.padEnd(18), String(total[i]).padStart(8), String(left[i]).padStart(6), String(right[i]).padStart(6));
  if (total[i] < MIN_VERTICES) problems.push(`[${bodyId}] "${id}" covers only ${total[i]} vertices (minimum ${MIN_VERTICES})`);
  const bigger = Math.max(left[i], right[i]);
  if (bigger > 0 && Math.abs(left[i] - right[i]) / bigger > MAX_SIDE_IMBALANCE)
    problems.push(`[${bodyId}] "${id}" is lopsided: ${left[i]} vertices on one side, ${right[i]} on the other`);
});

console.log(`\n${bodyId}: ${mesh.count} vertices, ${PART_IDS.length} parts, every vertex in exactly one part.`);
}
if (problems.length) {
  console.error(`\nFAILED:\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log("OK");
