/**
 * Which body part is this point of the body surface?
 *
 * Each body model (public/human_body.glb, public/human_body_female.glb) is one
 * unrigged mesh standing in an A-pose. `regionAt` labels any point on it with
 * exactly one body part, from the point's position and the direction its
 * surface faces. Taps and highlights both use these labels, so they always
 * agree with each other and with the shape of the body: no gaps, no overlaps.
 *
 * Coordinates are the baked mesh coordinates, the same for both bodies: Y up
 * from 0 (soles) to 4.47 (top of the head), Z > 0 is the front, X = 0 is the
 * midline (the female body is brought into this frame by
 * scripts/convert-body.mts). The landmark numbers below were measured from
 * cross-sections of each specific mesh and tuned by eye with
 * `npm run body:render`; they are not general anatomy constants.
 * `npm run body:check` verifies the labelling of both bodies.
 *
 * Pure functions with no imports, so Node scripts can use them too.
 */

/** Every body part a point can be labelled with. Order is the label index. */
export const PART_IDS = [
  // head
  "scalp", "forehead", "eyes", "nose", "face", "mouth", "jaw", "ears",
  "head_back",
  "neck",
  // chest
  "upper_chest", "breast", "chest_core",
  // abdomen
  "epigastric", "upper_abdomen", "lower_abdomen",
  // arms
  "shoulder", "armpit", "upper_arm", "elbow", "forearm", "wrist", "hand", "fingers",
  // pelvis
  "above_pubic_bone", "pelvic_core", "genital", "groin",
  // legs, front
  "thigh", "knee", "shin", "ankle", "foot", "toes",
  // back
  "upper_back", "middle_back", "lower_back", "flank",
  // buttocks
  "buttocks_core", "hips", "rectum", "tailbone",
  // legs, back
  "hamstring", "popliteal", "calf",
] as const;

export type PartId = (typeof PART_IDS)[number];

export const PART_INDEX: Record<string, number> = Object.fromEntries(
  PART_IDS.map((id, i) => [id, i])
);

export type BodyId = "male" | "female";

/** The mesh file of each body, under public/. */
export const BODY_MODEL_URL: Record<BodyId, string> = {
  male: "/human_body.glb",
  female: "/human_body_female.glb",
};

/* ─── Measured landmarks, one set per body ───────────────────── */

export interface Landmarks {
  /** Arm: straight line from the shoulder joint to the fingertips (right side; left mirrors). */
  arm: { x0: number; y0: number; dx: number; dy: number };
  /** How far along that line (0..1) each arm part ends. */
  armT: { shoulder: number; upperArm: number; elbow: number; forearm: number; wrist: number; hand: number };
  /** Below this the arm hangs clear of the torso. */
  armpitY: number;
  /** Lowest arm point still counted as arm, and the |x| beyond which a low point is arm. */
  armBottomY: number;
  armMinX: number;
  /** Shoulder cap edge: |x| at armpit level + widening per unit up to `shoulderTopY`. */
  shoulderEdge: { x: number; y: number; slope: number; topY: number };
  /** Armpit hollow centre on the arm side and on the torso side. */
  armpitArm: { x: number; y: number; r: number };
  armpitTorso: { x: number; y: number; r: number };

  chinY: number;
  neck: { halfWidth: number; baseFrontY: number; baseBackY: number };
  crotchY: number;
  glutealFoldY: number;
  pelvisTopY: number;
  /** Top of the buttocks / bottom of the lower back. */
  waistBackY: number;
  /** Front groin crease: y = a + b·|x|. */
  crease: { a: number; b: number };

  legs: { toesY: number; toesZ: number; footY: number; ankleY: number; shinTopY: number; kneeTopY: number };

  front: {
    genitalHalfWidth: number; genitalTopY: number; pubicHalfWidth: number;
    lowerAbdomenTopY: number; upperAbdomenTopY: number;
    epigastric: { halfWidth: number; bottomY: number };
    chestTopY: number; chestCoreHalfWidth: number;
  };
  back: {
    tailboneHalfWidth: number; tailboneBottomY: number; hipsX: number;
    lowerBackTopY: number; flankX: number; middleBackTopY: number;
  };
  side: { flankTopY: number; hipsBottomY: number };

  /** Head parts. y values are absolute; x is |x|, z front/back. */
  head: {
    scalpY: number; backScalpY: number; backZ: number;
    ears: { x: number; y0: number; y1: number; z0: number; z1: number };
    foreheadY: number; eyesY: number; eyesX: number; eyesZ: number;
    nose: { x: number; y: number; z: number };
    jawY: number; mouth: { x: number; y: number; z: number };
    jawSide: { y: number; x: number; z: number };
    /** The skull meets the neck higher at the back: chin + (zRef - z)·slope. */
    baseZRef: number; baseSlope: number;
  };
}

const MALE: Landmarks = {
  arm: { x0: 0.45, y0: 3.62, dx: 1.37, dy: -1.12 },
  armT: { shoulder: 0.2, upperArm: 0.345, elbow: 0.44, forearm: 0.69, wrist: 0.755, hand: 0.85 },
  armpitY: 3.25,
  armBottomY: 2.3,
  armMinX: 0.52,
  shoulderEdge: { x: 0.47, y: 3.45, slope: 0.5, topY: 3.9 },
  armpitArm: { x: 0.6, y: 3.2, r: 0.15 },
  armpitTorso: { x: 0.5, y: 3.22, r: 0.14 },
  chinY: 3.9,
  neck: { halfWidth: 0.24, baseFrontY: 3.76, baseBackY: 3.84 },
  crotchY: 2.06,
  glutealFoldY: 2.12,
  pelvisTopY: 2.5,
  waistBackY: 2.62,
  crease: { a: 2.08, b: 0.85 },
  legs: { toesY: 0.2, toesZ: 0.3, footY: 0.17, ankleY: 0.33, shinTopY: 1.12, kneeTopY: 1.4 },
  front: {
    genitalHalfWidth: 0.11, genitalTopY: 2.3, pubicHalfWidth: 0.2,
    lowerAbdomenTopY: 2.78, upperAbdomenTopY: 3.2,
    epigastric: { halfWidth: 0.14, bottomY: 2.97 },
    chestTopY: 3.52, chestCoreHalfWidth: 0.1,
  },
  back: {
    tailboneHalfWidth: 0.07, tailboneBottomY: 2.45, hipsX: 0.37,
    lowerBackTopY: 2.98, flankX: 0.24, middleBackTopY: 3.38,
  },
  side: { flankTopY: 3.1, hipsBottomY: 2.2 },
  head: {
    scalpY: 4.385, backScalpY: 4.33, backZ: -0.04,
    ears: { x: 0.145, y0: 4.03, y1: 4.25, z0: -0.13, z1: 0.07 },
    foreheadY: 4.26, eyesY: 4.165, eyesX: 0.145, eyesZ: 0.1,
    nose: { x: 0.045, y: 4.07, z: 0.14 },
    jawY: 3.985, mouth: { x: 0.085, y: 4.075, z: 0.1 },
    jawSide: { y: 4.08, x: 0.1, z: 0.1 },
    baseZRef: 0.05, baseSlope: 0.5,
  },
};

// Measured from public/human_body_female.glb (see scripts/convert-body.mts).
// Differences from the male body: narrower shoulders and a shorter reach,
// a larger head with the chin lower, breasts lower on the chest, and pointed
// feet (heel raised), so the ankle sits higher.
const FEMALE: Landmarks = {
  ...MALE,
  arm: { x0: 0.4, y0: 3.57, dx: 1.25, dy: -1.12 },
  armpitY: 3.3,
  armMinX: 0.44,
  shoulderEdge: { x: 0.42, y: 3.4, slope: 0.5, topY: 3.85 },
  armpitArm: { x: 0.53, y: 3.25, r: 0.13 },
  armpitTorso: { x: 0.37, y: 3.26, r: 0.12 },
  chinY: 3.83,
  neck: { halfWidth: 0.24, baseFrontY: 3.72, baseBackY: 3.78 },
  legs: { toesY: 0.12, toesZ: 0.04, footY: 0.4, ankleY: 0.58, shinTopY: 1.12, kneeTopY: 1.4 },
  front: {
    ...MALE.front,
    upperAbdomenTopY: 3.08,
    epigastric: { halfWidth: 0.14, bottomY: 2.88 },
    chestTopY: 3.5, chestCoreHalfWidth: 0.08,
  },
  // Face parts scaled from the male head: height ×1.12 from the chin, width ×1.22, depth ×1.1.
  head: {
    scalpY: 4.373, backScalpY: 4.312, backZ: -0.019,
    ears: { x: 0.177, y0: 3.976, y1: 4.222, z0: -0.118, z1: 0.102 },
    foreheadY: 4.233, eyesY: 4.127, eyesX: 0.177, eyesZ: 0.135,
    nose: { x: 0.055, y: 4.02, z: 0.179 },
    jawY: 3.925, mouth: { x: 0.104, y: 4.026, z: 0.135 },
    jawSide: { y: 4.032, x: 0.122, z: 0.135 },
    baseZRef: 0.08, baseSlope: 0.5,
  },
};

export const LANDMARKS: Record<BodyId, Landmarks> = { male: MALE, female: FEMALE };

/* ─── Labelling ─────────────────────────────────────────────── */

function legPart(L: Landmarks, y: number, z: number, front: boolean): PartId {
  const g = L.legs;
  if (y < g.toesY && z > g.toesZ) return "toes";
  if (y < g.footY) return "foot";
  if (y < g.ankleY) return "ankle";
  if (y < g.shinTopY) return front ? "shin" : "calf";
  if (y < g.kneeTopY) return front ? "knee" : "popliteal";
  return front ? "thigh" : "hamstring";
}

function headPart(L: Landmarks, ax: number, y: number, z: number): PartId {
  const h = L.head;
  if (y > h.scalpY) return "scalp";
  if (ax > h.ears.x && y > h.ears.y0 && y < h.ears.y1 && z > h.ears.z0 && z < h.ears.z1) return "ears";
  if (z < h.backZ) return y > h.backScalpY ? "scalp" : "head_back";

  // The face, top to bottom.
  if (y > h.foreheadY) return "forehead";
  if (ax < h.nose.x && y > h.nose.y && z > h.nose.z) return "nose";
  if (y > h.eyesY && ax < h.eyesX && z > h.eyesZ) return "eyes";
  if (y > h.eyesY) return "forehead"; // temples
  if (y < h.jawY) return "jaw";
  if (y < h.mouth.y && ax < h.mouth.x && z > h.mouth.z) return "mouth";
  if (y < h.jawSide.y && (ax > h.jawSide.x || z < h.jawSide.z)) return "jaw";
  return "face";
}

/**
 * @param L       the body's landmarks (LANDMARKS.male / LANDMARKS.female)
 * @param x,y,z   point on the body surface (baked mesh coordinates)
 * @param nx,ny,nz unit normal of the surface at that point
 */
export function regionAt(
  L: Landmarks,
  x: number,
  y: number,
  z: number,
  nx: number,
  ny: number,
  nz: number
): PartId {
  const ax = Math.abs(x);

  /* ── Arms (and the shoulder cap) ── */
  const se = L.shoulderEdge;
  const shoulderEdge = se.x + Math.max(0, se.y - y) * se.slope; // widens down to the armpit
  const isArm =
    (y < L.armpitY && y > L.armBottomY && ax > L.armMinX) ||
    (y >= L.armpitY && y < se.topY && ax > shoulderEdge);
  if (isArm) {
    const a = L.arm;
    const t = ((ax - a.x0) * a.dx + (y - a.y0) * a.dy) / (a.dx * a.dx + a.dy * a.dy);
    const T = L.armT;
    const p = L.armpitArm;
    if (t < T.elbow && ny < 0.15 && Math.hypot(ax - p.x, y - p.y) < p.r) return "armpit";
    if (t < T.shoulder) return "shoulder";
    if (t < T.upperArm) return "upper_arm";
    if (t < T.elbow) return "elbow";
    if (t < T.forearm) return "forearm";
    if (t < T.wrist) return "wrist";
    if (t < T.hand) return "hand";
    return "fingers";
  }

  /* ── Head and neck ── */
  const headBase = L.chinY + Math.max(0, L.head.baseZRef - z) * L.head.baseSlope;
  if (y >= headBase) return headPart(L, ax, y, z);

  const front = nz > 0.25 ? true : nz < -0.25 ? false : z > -0.05;
  const sideFacing = Math.abs(nx) > 0.75;

  if (ax < L.neck.halfWidth && y >= (front ? L.neck.baseFrontY : L.neck.baseBackY)) return "neck";

  /* ── Legs ── */
  if (y < L.crotchY) {
    // Underside between the legs.
    if (ax < 0.08 && y > L.crotchY - 0.08 && ny < -0.4) return z > -0.05 ? "genital" : "rectum";
    return legPart(L, y, z, nz >= 0);
  }

  /* ── Torso side between ribs and hip ── */
  const pt = L.armpitTorso;
  if (sideFacing && Math.hypot(ax - pt.x, y - pt.y) < pt.r) return "armpit";
  if (sideFacing && y >= L.waistBackY && y < L.side.flankTopY) return "flank";
  if (sideFacing && y >= L.side.hipsBottomY && y < L.waistBackY) return "hips";

  if (front) {
    /* ── Front of the torso, bottom to top ── */
    const f = L.front;
    if (y < L.pelvisTopY) {
      const crease = L.crease.a + L.crease.b * ax;
      if (ax < f.genitalHalfWidth && y < f.genitalTopY) return "genital";
      if (y < crease - 0.04) return "thigh";
      if (ax >= f.genitalHalfWidth && y < crease + 0.09) return "groin";
      if (ax < f.pubicHalfWidth) return "above_pubic_bone";
      return "pelvic_core";
    }
    if (y < f.lowerAbdomenTopY) return "lower_abdomen";
    if (y < f.upperAbdomenTopY)
      return ax < f.epigastric.halfWidth && y > f.epigastric.bottomY ? "epigastric" : "upper_abdomen";
    if (y < f.chestTopY) return ax < f.chestCoreHalfWidth ? "chest_core" : "breast";
    return "upper_chest";
  }

  /* ── Back of the torso, bottom to top ── */
  const b = L.back;
  if (y < L.glutealFoldY) return "hamstring";
  if (y < L.waistBackY) {
    if (ax < b.tailboneHalfWidth) return y > b.tailboneBottomY ? "tailbone" : "rectum";
    if (ax > b.hipsX) return "hips";
    return "buttocks_core";
  }
  if (y < b.lowerBackTopY) return ax > b.flankX ? "flank" : "lower_back";
  if (y < b.middleBackTopY) return "middle_back";
  return "upper_back";
}

/** Labels every vertex of a mesh. Returns one PART_IDS index per vertex. */
export function labelVertices(
  positions: ArrayLike<number>,
  normals: ArrayLike<number>,
  body: BodyId = "male"
): Uint8Array {
  const L = LANDMARKS[body];
  const count = positions.length / 3;
  const labels = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    const o = i * 3;
    labels[i] =
      PART_INDEX[
        regionAt(
          L,
          positions[o], positions[o + 1], positions[o + 2],
          normals[o], normals[o + 1], normals[o + 2]
        )
      ];
  }
  return labels;
}
