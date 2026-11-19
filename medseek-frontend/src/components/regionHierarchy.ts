/**
 * The body areas the picker offers, and the parts inside each one.
 *
 * This file is only names and grouping. Where each part sits on the 3D body is
 * decided by `body/segmentBody.ts`, which labels every point of the mesh with
 * one part id. Every part id here must exist there, and the other way round
 * (`npm run body:check` verifies it).
 *
 * The same ids are used by the symptom data: `symptoms.body_areas` in the
 * backend holds area ids and part ids from this file
 * (medseek-backend/data/kb/body_regions.json mirrors it).
 */

export type SubRegion = {
  id: string;
  label: string;
};

export type MajorRegion = {
  id: string;
  label: string;
  /** Which side of the body the area is listed under. "both" = listed on either side. */
  view: "front" | "back" | "both";
  /** Parts inside the area. Omitted => the area is a single part with the same id. */
  subRegions?: SubRegion[];
  /** Camera distance when the area is framed: [desktop, phone]. */
  zoom: [number, number];
};

export interface RegionSelectionPayload {
  majorId: string;
  subRegionId?: string;
}

export const REGION_HIERARCHY: MajorRegion[] = [
  /* ── Front ── */
  {
    id: "head",
    label: "Head & face",
    view: "front",
    zoom: [2.1, 2.5],
    subRegions: [
      { id: "scalp", label: "Scalp" },
      { id: "forehead", label: "Forehead" },
      { id: "eyes", label: "Eyes" },
      { id: "nose", label: "Nose" },
      { id: "face", label: "Cheeks" },
      { id: "mouth", label: "Mouth" },
      { id: "jaw", label: "Jaw" },
      { id: "ears", label: "Ears" },
    ],
  },
  { id: "neck", label: "Neck & throat", view: "both", zoom: [2.0, 2.4] },
  {
    id: "chest",
    label: "Chest",
    view: "front",
    zoom: [2.4, 2.8],
    subRegions: [
      { id: "upper_chest", label: "Upper chest" },
      { id: "breast", label: "Breast" },
      { id: "chest_core", label: "Centre of chest" },
    ],
  },
  {
    id: "abdomen",
    label: "Belly",
    view: "front",
    zoom: [2.5, 2.9],
    subRegions: [
      { id: "epigastric", label: "Pit of stomach" },
      { id: "upper_abdomen", label: "Upper belly" },
      { id: "lower_abdomen", label: "Lower belly" },
    ],
  },
  {
    id: "arms",
    label: "Arms & hands",
    view: "both",
    zoom: [3.8, 4.2],
    subRegions: [
      { id: "shoulder", label: "Shoulder" },
      { id: "armpit", label: "Armpit" },
      { id: "upper_arm", label: "Upper arm" },
      { id: "elbow", label: "Elbow" },
      { id: "forearm", label: "Forearm" },
      { id: "wrist", label: "Wrist" },
      { id: "hand", label: "Hand" },
      { id: "fingers", label: "Fingers" },
    ],
  },
  {
    id: "pelvic",
    label: "Pelvis & groin",
    view: "front",
    zoom: [2.2, 2.6],
    subRegions: [
      { id: "above_pubic_bone", label: "Bladder area" },
      { id: "pelvic_core", label: "Pelvis" },
      { id: "genital", label: "Genitals" },
      { id: "groin", label: "Groin" },
    ],
  },
  {
    id: "legs",
    label: "Legs & feet",
    view: "front",
    zoom: [3.4, 3.8],
    subRegions: [
      { id: "thigh", label: "Thigh" },
      { id: "knee", label: "Knee" },
      { id: "shin", label: "Shin" },
      { id: "ankle", label: "Ankle" },
      { id: "foot", label: "Foot" },
      { id: "toes", label: "Toes" },
    ],
  },

  /* ── Back ── */
  { id: "head_back", label: "Back of the head", view: "back", zoom: [2.1, 2.5] },
  {
    id: "back",
    label: "Back",
    view: "back",
    zoom: [2.8, 3.2],
    subRegions: [
      { id: "upper_back", label: "Upper back" },
      { id: "middle_back", label: "Middle back" },
      { id: "lower_back", label: "Lower back" },
      { id: "flank", label: "Side (flank)" },
    ],
  },
  {
    id: "buttocks",
    label: "Hips & buttocks",
    view: "back",
    zoom: [2.4, 2.8],
    subRegions: [
      { id: "buttocks_core", label: "Buttocks" },
      { id: "hips", label: "Hips" },
      { id: "rectum", label: "Back passage" },
      { id: "tailbone", label: "Tailbone" },
    ],
  },
  {
    id: "legs_back",
    label: "Back of the legs",
    view: "back",
    zoom: [3.4, 3.8],
    subRegions: [
      { id: "hamstring", label: "Back of the thigh" },
      { id: "popliteal", label: "Behind the knee" },
      { id: "calf", label: "Calf" },
    ],
  },
];

/** The part ids an area is made of (its sub-regions, or itself when it has none). */
export function partsOfMajor(major: MajorRegion): string[] {
  return major.subRegions?.length ? major.subRegions.map((s) => s.id) : [major.id];
}

/** part id → the area it belongs to. */
export const PART_TO_MAJOR: Record<string, string> = Object.fromEntries(
  REGION_HIERARCHY.flatMap((m) => partsOfMajor(m).map((p) => [p, m.id]))
);

const MAJOR_BY_ID: Record<string, MajorRegion> = Object.fromEntries(
  REGION_HIERARCHY.map((m) => [m.id, m])
);

export function getMajor(id: string | null | undefined): MajorRegion | undefined {
  return id ? MAJOR_BY_ID[id] : undefined;
}

/**
 * Turns an area id or a part id into part ids. Unknown ids (for example the
 * non-body groups "general", "skin", "mind") give an empty list.
 */
export function expandToParts(id: string): string[] {
  const major = MAJOR_BY_ID[id];
  if (major) return partsOfMajor(major);
  return PART_TO_MAJOR[id] ? [id] : [];
}

/** Plain-language name of an area or part. */
export function regionLabel(id: string): string | undefined {
  const major = MAJOR_BY_ID[id];
  if (major) return major.label;
  for (const m of REGION_HIERARCHY) {
    const sub = m.subRegions?.find((s) => s.id === id);
    if (sub) return sub.label;
  }
  return undefined;
}
