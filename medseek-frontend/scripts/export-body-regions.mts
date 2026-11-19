// Writes the picker's areas and parts to the backend, which validates symptom
// body areas against it. Run after changing regionHierarchy.ts: npm run body:export
import fs from "node:fs";
import { REGION_HIERARCHY, partsOfMajor } from "../src/components/regionHierarchy.ts";

const out = "../medseek-backend/data/kb/body_regions.json";
const data = {
  _about:
    "Body areas and parts used by the 3D body picker. Generated from medseek-frontend/src/components/regionHierarchy.ts by `npm run body:export` (frontend); do not edit by hand. `groups` are symptom groups with no place on the body.",
  areas: REGION_HIERARCHY.map((m) => ({
    id: m.id,
    label: m.label,
    parts: partsOfMajor(m).map((id) => ({
      id,
      label: m.subRegions?.find((s) => s.id === id)?.label ?? m.label,
    })),
  })),
  groups: [
    { id: "general", label: "Whole body" },
    { id: "skin", label: "Skin" },
    { id: "mind", label: "Mind & mood" },
  ],
};
fs.writeFileSync(out, JSON.stringify(data, null, 2) + "\n");
console.log(`Wrote ${out}: ${data.areas.length} areas, ${data.areas.reduce((n, a) => n + a.parts.length, 0)} parts, ${data.groups.length} groups`);
