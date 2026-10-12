import * as THREE from "three";

/* ─── Region Hierarchy Data Models & Shape Types ──────────────── */

/**
 * 3D Collision / Hit-Testing Primitives.
 * Anatomical Guidance for shape selection:
 * - Arms, Legs, Neck → capsule(s). Use ONE capsule per limb only if a single
 *   straight segment reasonably covers it; use TWO capsules (e.g. upper arm +
 *   forearm, thigh + shin) for anything that visibly bends, joined at the same
 *   region id.
 * - Chest, Abdomen, Pelvic, Back, Buttocks, Head → box or sphere, whichever
 *   better hugs that specific area's silhouette (box with tuned halfExtents is
 *   usually better for torso slabs; sphere is fine for the roughly round Head).
 * - Fine sub-regions (Forearm, Wrist, Hand, Fingers, Shoulder, Elbow, Thigh,
 *   Knee, Shin, Ankle, Foot, Toes, etc.) → short capsule or small box per
 *   segment, sized to that specific sub-segment rather than reusing the parent
 *   limb's full-length shape.
 * - When genuinely unsure, default to box with independent halfExtents — it's
 *   more corrective than a sphere in almost every torso/flat case.
 */

export type SphereVolume = {
  type: "sphere";
  pos: [number, number, number];
  radius: number;
};

export type CapsuleVolume = {
  type: "capsule";
  start: [number, number, number]; // one end of the capsule's core segment
  end: [number, number, number];   // other end
  radius: number;                  // uniform radius around the segment
};

export type BoxVolume = {
  type: "box";
  pos: [number, number, number];         // center
  halfExtents: [number, number, number]; // independent x/y/z half-sizes
  rotation?: [number, number, number];   // optional euler rotation in radians [rx, ry, rz]
};

export type RegionVolume = SphereVolume | CapsuleVolume | BoxVolume;

export type SubRegion = {
  id: string;
  label: string;
  volumes: RegionVolume[]; // one or more primitives (compound shape)
  bilateral?: boolean;    // if true, mirrored across X=0; both sides share this id
};

export type MajorRegion = {
  id: string;
  label: string;
  view: "front" | "back";
  volumes: RegionVolume[]; // one or more primitives for hit-testing & bounds
  bilateral?: boolean;     // if true, mirrored across X=0; both sides share this id
  subRegions?: SubRegion[]; // omitted/empty => leaf major, no zoom mode
};

export interface RegionSelectionPayload {
  majorId: string;
  subRegionId?: string;
}

export interface RegionProxy {
  groupId: string; // The canonical ID shared by bilateral pairs (e.g. "arms", "breast")
  label: string;
  pos: [number, number, number]; // Representative center (centroid)
  radius: number;               // Bounding radius
  isBilateral: boolean;
  majorId: string;
  subRegionId?: string;
  isLeaf?: boolean;
  volumes: RegionVolume[];      // Actual volume primitives belonging to this proxy
}

/* ─── Geometry, Transformation, and Volume Utilities ─────────── */

/**
 * Ensures coordinates have positive X for canonical side.
 */
export function canonicalizeVolume(vol: RegionVolume): RegionVolume {
  if (vol.type === "sphere") {
    return {
      type: "sphere",
      pos: [Math.abs(vol.pos[0]), vol.pos[1], vol.pos[2]],
      radius: vol.radius,
    };
  }
  if (vol.type === "capsule") {
    return {
      type: "capsule",
      start: [Math.abs(vol.start[0]), vol.start[1], vol.start[2]],
      end: [Math.abs(vol.end[0]), vol.end[1], vol.end[2]],
      radius: vol.radius,
    };
  }
  if (vol.type === "box") {
    return {
      type: "box",
      pos: [Math.abs(vol.pos[0]), vol.pos[1], vol.pos[2]],
      halfExtents: [...vol.halfExtents],
      rotation: vol.rotation ? [...vol.rotation] : undefined,
    };
  }
  return vol;
}

/**
 * Mirrors a volume across the sagittal plane (X = 0).
 * Inverts X position and appropriate Euler angles for boxes (y and z rotation inverted).
 */
export function mirrorVolume(vol: RegionVolume): RegionVolume {
  if (vol.type === "sphere") {
    return {
      type: "sphere",
      pos: [-Math.abs(vol.pos[0]), vol.pos[1], vol.pos[2]],
      radius: vol.radius,
    };
  }
  if (vol.type === "capsule") {
    return {
      type: "capsule",
      start: [-Math.abs(vol.start[0]), vol.start[1], vol.start[2]],
      end: [-Math.abs(vol.end[0]), vol.end[1], vol.end[2]],
      radius: vol.radius,
    };
  }
  if (vol.type === "box") {
    const rx = vol.rotation ? vol.rotation[0] : 0;
    const ry = vol.rotation ? -vol.rotation[1] : 0;
    const rz = vol.rotation ? -vol.rotation[2] : 0;
    return {
      type: "box",
      pos: [-Math.abs(vol.pos[0]), vol.pos[1], vol.pos[2]],
      halfExtents: [...vol.halfExtents],
      rotation: vol.rotation ? [rx, ry, rz] : undefined,
    };
  }
  return vol;
}

/**
 * Computes the center position of a single volume primitive.
 */
export function getVolumeCenter(vol: RegionVolume): [number, number, number] {
  if (vol.type === "sphere" || vol.type === "box") {
    return [vol.pos[0], vol.pos[1], vol.pos[2]];
  }
  if (vol.type === "capsule") {
    return [
      (vol.start[0] + vol.end[0]) * 0.5,
      (vol.start[1] + vol.end[1]) * 0.5,
      (vol.start[2] + vol.end[2]) * 0.5,
    ];
  }
  return [0, 0, 0];
}

/**
 * Computes the effective radial extent of a volume primitive from its center.
 */
export function getVolumeRadialExtent(vol: RegionVolume): number {
  if (vol.type === "sphere") {
    return vol.radius;
  }
  if (vol.type === "capsule") {
    const dx = vol.end[0] - vol.start[0];
    const dy = vol.end[1] - vol.start[1];
    const dz = vol.end[2] - vol.start[2];
    const halfLen = Math.hypot(dx, dy, dz) * 0.5;
    return halfLen + vol.radius;
  }
  if (vol.type === "box") {
    return Math.hypot(vol.halfExtents[0], vol.halfExtents[1], vol.halfExtents[2]);
  }
  return 0.2;
}

/**
 * Computes the aggregate centroid for a collection of volumes.
 */
export function getRegionCentroid(volumes: RegionVolume[]): [number, number, number] {
  if (!volumes || volumes.length === 0) return [0, 0, 0];
  let sumX = 0;
  let sumY = 0;
  let sumZ = 0;

  for (const vol of volumes) {
    const [cx, cy, cz] = getVolumeCenter(vol);
    sumX += cx;
    sumY += cy;
    sumZ += cz;
  }

  const count = volumes.length;
  return [sumX / count, sumY / count, sumZ / count];
}

/**
 * Computes the aggregate bounding radius enclosing all volumes from their centroid.
 */
export function getRegionBoundingRadius(volumes: RegionVolume[]): number {
  if (!volumes || volumes.length === 0) return 0.2;
  const [cx, cy, cz] = getRegionCentroid(volumes);
  let maxDist = 0;

  for (const vol of volumes) {
    const [vx, vy, vz] = getVolumeCenter(vol);
    const centerDist = Math.hypot(vx - cx, vy - cy, vz - cz);
    const extent = getVolumeRadialExtent(vol);
    const totalDist = centerDist + extent;
    if (totalDist > maxDist) {
      maxDist = totalDist;
    }
  }

  return Math.max(maxDist, 0.1);
}

/**
 * Constructs a real Three.js geometry for a given RegionVolume.
 */
export function createVolumeGeometry(vol: RegionVolume): THREE.BufferGeometry {
  if (vol.type === "sphere") {
    return new THREE.SphereGeometry(vol.radius, 16, 16);
  }
  if (vol.type === "capsule") {
    const start = new THREE.Vector3(...vol.start);
    const end = new THREE.Vector3(...vol.end);
    const dir = end.clone().sub(start);
    const len = dir.length();
    if (len < 1e-4) {
      return new THREE.SphereGeometry(vol.radius, 16, 16);
    }
    // Three.js CapsuleGeometry: radius, length, capSegments, radialSegments
    return new THREE.CapsuleGeometry(vol.radius, len, 8, 16);
  }
  if (vol.type === "box") {
    const [hx, hy, hz] = vol.halfExtents;
    return new THREE.BoxGeometry(hx * 2, hy * 2, hz * 2);
  }
  return new THREE.BufferGeometry();
}

/**
 * Creates an oriented, positioned Three.js Mesh for a given volume primitive.
 */
export function createVolumeMesh(vol: RegionVolume, material: THREE.Material): THREE.Mesh {
  const geom = createVolumeGeometry(vol);
  const mesh = new THREE.Mesh(geom, material);

  if (vol.type === "sphere") {
    mesh.position.set(...vol.pos);
  } else if (vol.type === "capsule") {
    const start = new THREE.Vector3(...vol.start);
    const end = new THREE.Vector3(...vol.end);
    const dir = end.clone().sub(start);
    const len = dir.length();
    const center = start.clone().add(end).multiplyScalar(0.5);
    mesh.position.copy(center);
    if (len >= 1e-4) {
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    }
  } else if (vol.type === "box") {
    mesh.position.set(...vol.pos);
    if (vol.rotation) {
      mesh.rotation.set(...vol.rotation);
    }
  }

  return mesh;
}

/**
 * Groups all volume meshes for a region (including mirrored meshes if bilateral)
 * into a single Three.js Object3D tagged with the region ID in userData.
 */
export function createRegionGroup(
  region: MajorRegion | SubRegion,
  majorId: string,
  isMajor: boolean,
  material: THREE.Material
): THREE.Group {
  const group = new THREE.Group();
  group.name = `RegionGroup_${region.id}`;
  const isLeaf = isMajor
    ? !("subRegions" in region) || !region.subRegions || region.subRegions.length === 0
    : true;
  const groupId = region.id;
  const subRegionId = isMajor ? undefined : region.id;

  const allVolumes: RegionVolume[] = [];
  if (region.bilateral) {
    for (const v of region.volumes) {
      allVolumes.push(canonicalizeVolume(v));
      allVolumes.push(mirrorVolume(v));
    }
  } else {
    allVolumes.push(...region.volumes);
  }

  for (const vol of allVolumes) {
    const mesh = createVolumeMesh(vol, material);
    mesh.userData = {
      groupId,
      majorId,
      subRegionId,
      label: region.label,
      isLeaf,
      isBilateral: Boolean(region.bilateral),
    };
    group.add(mesh);
  }

  group.userData = {
    groupId,
    majorId,
    subRegionId,
    label: region.label,
    isLeaf,
    isBilateral: Boolean(region.bilateral),
  };

  return group;
}

/* ─── REGION_HIERARCHY ────────────────────────────────────────── */
// Baked mesh coordinates:
// Y ranges from 0.0 (feet) to 4.47 (cranial vertex / head top).
// Z > 0 is anterior (front), Z < 0 is posterior (back).
// X is lateral: positive is right/left side, mirrored across X=0 for bilateral pairs.
//
// NOTE: All dimensions below have been migrated from single-spheres to anatomical
// primitives (capsule, box, sphere) with compound support. Every entry is marked
// as a rough calibrated estimate needing visual confirmation via the 3D Debug Visualizer.

export const REGION_HIERARCHY: MajorRegion[] = [
  /* ══════════════════════════════════════════════════════════════════
     FRONT (ANTERIOR) REGIONS
     ══════════════════════════════════════════════════════════════════ */

  // 1. Head [subs: Scalp, Forehead, Eyes, Nose, Face, Mouth, Jaw, Ears]
  {
    id: "head",
    label: "Head",
    view: "front",
    // [Calibrated rough estimate: round cranial sphere]
    volumes: [
      {
        type: "sphere",
        pos: [0, 4.16, 0.08],
        radius: 0.28,
      },
    ],
    subRegions: [
      {
        id: "scalp",
        label: "Scalp",
        // [Calibrated rough estimate: top cranial curved box]
        volumes: [
          {
            type: "box",
            pos: [0, 4.40, 0.0],
            halfExtents: [0.15, 0.07, 0.16],
          },
        ],
      },
      {
        id: "forehead",
        label: "Forehead",
        // [Calibrated rough estimate: frontal bone slab]
        volumes: [
          {
            type: "box",
            pos: [0, 4.31, 0.13],
            halfExtents: [0.13, 0.06, 0.07],
          },
        ],
      },
      {
        id: "eyes",
        label: "Eyes",
        // [Calibrated rough estimate: orbital horizontal band]
        volumes: [
          {
            type: "box",
            pos: [0, 4.21, 0.19],
            halfExtents: [0.13, 0.04, 0.06],
          },
        ],
      },
      {
        id: "nose",
        label: "Nose",
        // [Calibrated rough estimate: nasal projection block]
        volumes: [
          {
            type: "box",
            pos: [0, 4.15, 0.22],
            halfExtents: [0.05, 0.05, 0.06],
          },
        ],
      },
      {
        id: "face",
        label: "Face",
        // [Calibrated rough estimate: zygomatic / cheek slab]
        volumes: [
          {
            type: "box",
            pos: [0, 4.12, 0.17],
            halfExtents: [0.16, 0.08, 0.08],
          },
        ],
      },
      {
        id: "mouth",
        label: "Mouth",
        // [Calibrated rough estimate: oral aperture block]
        volumes: [
          {
            type: "box",
            pos: [0, 4.06, 0.19],
            halfExtents: [0.08, 0.04, 0.05],
          },
        ],
      },
      {
        id: "jaw",
        label: "Jaw",
        // [Calibrated rough estimate: mandibular arch slab]
        volumes: [
          {
            type: "box",
            pos: [0, 3.96, 0.15],
            halfExtents: [0.12, 0.06, 0.08],
          },
        ],
      },
      {
        id: "ears",
        label: "Ears",
        bilateral: true,
        // [Calibrated rough estimate: lateral pinna block]
        volumes: [
          {
            type: "box",
            pos: [0.175, 4.18, 0.01],
            halfExtents: [0.04, 0.07, 0.05],
          },
        ],
      },
    ],
  },

  // 2. Neck [leaf, no subs]
  {
    id: "neck",
    label: "Neck",
    view: "front",
    // [Calibrated rough estimate: cervical cylinder capsule]
    volumes: [
      {
        type: "capsule",
        start: [0, 3.68, 0.05],
        end: [0, 3.94, 0.07],
        radius: 0.12,
      },
    ],
    // Leaf major: no subRegions
  },

  // 3. Chest [subs: Upper chest, Breast (bilateral), Chest]
  {
    id: "chest",
    label: "Chest",
    view: "front",
    // [Calibrated rough estimate: broad thoracic slab box]
    volumes: [
      {
        type: "box",
        pos: [0, 3.43, 0.16],
        halfExtents: [0.38, 0.24, 0.14],
      },
    ],
    subRegions: [
      {
        id: "upper_chest",
        label: "Upper Chest",
        // [Calibrated rough estimate: infraclavicular & sternal notch slab]
        volumes: [
          {
            type: "box",
            pos: [0, 3.58, 0.16],
            halfExtents: [0.30, 0.09, 0.12],
          },
        ],
      },
      {
        id: "breast",
        label: "Breast",
        bilateral: true,
        // [Calibrated rough estimate: pectoral/mammary prominence box]
        volumes: [
          {
            type: "box",
            pos: [0.22, 3.42, 0.20],
            halfExtents: [0.14, 0.12, 0.10],
          },
        ],
      },
      {
        id: "chest_core",
        label: "Chest",
        // [Calibrated rough estimate: mid/lower sternal slab]
        volumes: [
          {
            type: "box",
            pos: [0, 3.35, 0.20],
            halfExtents: [0.18, 0.14, 0.10],
          },
        ],
      },
    ],
  },

  // 4. Abdomen [subs: Epigastric (upper central abdomen), Upper abdomen, Lower abdomen]
  {
    id: "abdomen",
    label: "Abdomen",
    view: "front",
    // [Calibrated rough estimate: central abdominal core slab]
    volumes: [
      {
        type: "box",
        pos: [0, 2.86, 0.16],
        halfExtents: [0.32, 0.30, 0.14],
      },
    ],
    subRegions: [
      {
        id: "epigastric",
        label: "Epigastric",
        // [Calibrated rough estimate: epigastric / solar plexus slab]
        volumes: [
          {
            type: "box",
            pos: [0, 3.10, 0.18],
            halfExtents: [0.18, 0.09, 0.10],
          },
        ],
      },
      {
        id: "upper_abdomen",
        label: "Upper Abdomen",
        // [Calibrated rough estimate: periumbilical abdominal slab]
        volumes: [
          {
            type: "box",
            pos: [0, 2.86, 0.18],
            halfExtents: [0.26, 0.11, 0.11],
          },
        ],
      },
      {
        id: "lower_abdomen",
        label: "Lower Abdomen",
        // [Calibrated rough estimate: hypogastric lower quadrant slab]
        volumes: [
          {
            type: "box",
            pos: [0, 2.63, 0.18],
            halfExtents: [0.26, 0.11, 0.11],
          },
        ],
      },
    ],
  },

  // 5. Arms (bilateral) [subs: Shoulder, Armpit, Upper arm, Elbow, Forearm, Wrist, Hand, Fingers]
  {
    id: "arms",
    label: "Arms",
    view: "front",
    bilateral: true,
    // [Calibrated rough estimate: compound 2-capsule arm, bending at elbow]
    volumes: [
      // Segment 1: Upper arm capsule (shoulder to elbow)
      {
        type: "capsule",
        start: [0.58, 3.55, -0.15],
        end: [1.18, 3.06, -0.18],
        radius: 0.15,
      },
      // Segment 2: Forearm + hand capsule (elbow to fingertips)
      {
        type: "capsule",
        start: [1.18, 3.06, -0.18],
        end: [1.80, 2.48, -0.12],
        radius: 0.13,
      },
    ],
    subRegions: [
      {
        id: "shoulder",
        label: "Shoulder",
        bilateral: true,
        // [Calibrated rough estimate: deltoid / acromion block]
        volumes: [
          {
            type: "box",
            pos: [0.56, 3.57, -0.15],
            halfExtents: [0.15, 0.14, 0.15],
          },
        ],
      },
      {
        id: "armpit",
        label: "Armpit",
        bilateral: true,
        // [Calibrated rough estimate: axillary vault block]
        volumes: [
          {
            type: "box",
            pos: [0.44, 3.43, -0.02],
            halfExtents: [0.08, 0.09, 0.10],
          },
        ],
      },
      {
        id: "upper_arm",
        label: "Upper Arm",
        bilateral: true,
        // [Calibrated rough estimate: biceps / triceps capsule]
        volumes: [
          {
            type: "capsule",
            start: [0.65, 3.45, -0.16],
            end: [1.10, 3.12, -0.18],
            radius: 0.13,
          },
        ],
      },
      {
        id: "elbow",
        label: "Elbow",
        bilateral: true,
        // [Calibrated rough estimate: cubital / olecranon sphere]
        volumes: [
          {
            type: "sphere",
            pos: [1.18, 3.06, -0.18],
            radius: 0.14,
          },
        ],
      },
      {
        id: "forearm",
        label: "Forearm",
        bilateral: true,
        // [Calibrated rough estimate: antebrachium capsule]
        volumes: [
          {
            type: "capsule",
            start: [1.25, 2.98, -0.17],
            end: [1.60, 2.70, -0.15],
            radius: 0.11,
          },
        ],
      },
      {
        id: "wrist",
        label: "Wrist",
        bilateral: true,
        // [Calibrated rough estimate: carpal joint block]
        volumes: [
          {
            type: "box",
            pos: [1.65, 2.65, -0.14],
            halfExtents: [0.08, 0.06, 0.08],
          },
        ],
      },
      {
        id: "hand",
        label: "Hand",
        bilateral: true,
        // [Calibrated rough estimate: palm / metacarpal slab]
        volumes: [
          {
            type: "box",
            pos: [1.74, 2.56, -0.13],
            halfExtents: [0.09, 0.07, 0.06],
          },
        ],
      },
      {
        id: "fingers",
        label: "Fingers",
        bilateral: true,
        // [Calibrated rough estimate: phalanges terminal slab]
        volumes: [
          {
            type: "box",
            pos: [1.82, 2.46, -0.11],
            halfExtents: [0.08, 0.08, 0.05],
          },
        ],
      },
    ],
  },

  // 6. Pelvic [subs: Above pubic bone, Pelvic, Genital, Groin]
  {
    id: "pelvic",
    label: "Pelvic",
    view: "front",
    // [Calibrated rough estimate: pelvic girdle base slab]
    volumes: [
      {
        type: "box",
        pos: [0, 2.28, 0.14],
        halfExtents: [0.34, 0.20, 0.14],
      },
    ],
    subRegions: [
      {
        id: "above_pubic_bone",
        label: "Above Pubic Bone",
        // [Calibrated rough estimate: suprapubic slab]
        volumes: [
          {
            type: "box",
            pos: [0, 2.42, 0.18],
            halfExtents: [0.22, 0.07, 0.09],
          },
        ],
      },
      {
        id: "pelvic_core",
        label: "Pelvic",
        // [Calibrated rough estimate: central pelvic basin slab]
        volumes: [
          {
            type: "box",
            pos: [0, 2.28, 0.15],
            halfExtents: [0.24, 0.10, 0.10],
          },
        ],
      },
      {
        id: "genital",
        label: "Genital",
        // [Calibrated rough estimate: perineal / genital triangle box]
        volumes: [
          {
            type: "box",
            pos: [0, 2.08, 0.12],
            halfExtents: [0.10, 0.09, 0.09],
          },
        ],
      },
      {
        id: "groin",
        label: "Groin",
        bilateral: true,
        // [Calibrated rough estimate: inguinal crease angled capsule]
        volumes: [
          {
            type: "capsule",
            start: [0.10, 2.30, 0.16],
            end: [0.26, 2.10, 0.16],
            radius: 0.09,
          },
        ],
      },
    ],
  },

  // 7. Legs (bilateral) [subs: Thigh, Knee, Shin, Ankle, Foot, Toes]
  {
    id: "legs",
    label: "Legs",
    view: "front",
    bilateral: true,
    // [Calibrated rough estimate: compound 2-capsule leg, bending at knee]
    volumes: [
      // Segment 1: Thigh capsule (hip to knee)
      {
        type: "capsule",
        start: [0.30, 2.10, 0.12],
        end: [0.31, 1.35, 0.12],
        radius: 0.18,
      },
      // Segment 2: Lower leg capsule (knee to ankle/foot)
      {
        type: "capsule",
        start: [0.31, 1.35, 0.12],
        end: [0.36, 0.25, 0.06],
        radius: 0.15,
      },
    ],
    subRegions: [
      {
        id: "thigh",
        label: "Thigh",
        bilateral: true,
        // [Calibrated rough estimate: quadriceps cylinder capsule]
        volumes: [
          {
            type: "capsule",
            start: [0.30, 2.05, 0.12],
            end: [0.31, 1.45, 0.12],
            radius: 0.16,
          },
        ],
      },
      {
        id: "knee",
        label: "Knee",
        bilateral: true,
        // [Calibrated rough estimate: patellar box]
        volumes: [
          {
            type: "box",
            pos: [0.31, 1.35, 0.12],
            halfExtents: [0.12, 0.09, 0.11],
          },
        ],
      },
      {
        id: "shin",
        label: "Shin",
        bilateral: true,
        // [Calibrated rough estimate: anterior tibial shaft capsule]
        volumes: [
          {
            type: "capsule",
            start: [0.32, 1.25, 0.08],
            end: [0.35, 0.50, -0.01],
            radius: 0.12,
          },
        ],
      },
      {
        id: "ankle",
        label: "Ankle",
        bilateral: true,
        // [Calibrated rough estimate: malleolar ankle box]
        volumes: [
          {
            type: "box",
            pos: [0.37, 0.40, -0.04],
            halfExtents: [0.10, 0.08, 0.10],
          },
        ],
      },
      {
        id: "foot",
        label: "Foot",
        bilateral: true,
        // [Calibrated rough estimate: foot dorsum elongated box]
        volumes: [
          {
            type: "box",
            pos: [0.39, 0.16, 0.14],
            halfExtents: [0.10, 0.09, 0.16],
          },
        ],
      },
      {
        id: "toes",
        label: "Toes",
        bilateral: true,
        // [Calibrated rough estimate: foot digits terminal box]
        volumes: [
          {
            type: "box",
            pos: [0.38, 0.05, 0.32],
            halfExtents: [0.09, 0.05, 0.09],
          },
        ],
      },
    ],
  },

  /* ══════════════════════════════════════════════════════════════════
     BACK (POSTERIOR) REGIONS
     ══════════════════════════════════════════════════════════════════ */

  // 1. Head [leaf, single sub "Head" collapses into the leaf itself]
  {
    id: "head_back",
    label: "Head",
    view: "back",
    // [Calibrated rough estimate: posterior occiput sphere]
    volumes: [
      {
        type: "sphere",
        pos: [0, 4.16, -0.12],
        radius: 0.28,
      },
    ],
    // Leaf major: no subRegions
  },

  // 2. Back [subs: Upper back, Middle back, Lower back, Flank]
  {
    id: "back",
    label: "Back",
    view: "back",
    // [Calibrated rough estimate: posterior spinal trunk slab box]
    volumes: [
      {
        type: "box",
        pos: [0, 3.16, -0.22],
        halfExtents: [0.36, 0.44, 0.14],
      },
    ],
    subRegions: [
      {
        id: "upper_back",
        label: "Upper Back",
        // [Calibrated rough estimate: trapezius / upper thoracic spine box]
        volumes: [
          {
            type: "box",
            pos: [0, 3.52, -0.28],
            halfExtents: [0.34, 0.14, 0.12],
          },
        ],
      },
      {
        id: "middle_back",
        label: "Middle Back",
        // [Calibrated rough estimate: mid-thoracic paraspinal slab]
        volumes: [
          {
            type: "box",
            pos: [0, 3.15, -0.24],
            halfExtents: [0.28, 0.15, 0.11],
          },
        ],
      },
      {
        id: "lower_back",
        label: "Lower Back",
        // [Calibrated rough estimate: lumbar spine slab]
        volumes: [
          {
            type: "box",
            pos: [0, 2.78, -0.20],
            halfExtents: [0.26, 0.13, 0.11],
          },
        ],
      },
      {
        id: "flank",
        label: "Flank",
        bilateral: true,
        // [Calibrated rough estimate: renal angle / lateral flank box]
        volumes: [
          {
            type: "box",
            pos: [0.28, 2.80, -0.16],
            halfExtents: [0.10, 0.14, 0.11],
          },
        ],
      },
    ],
  },

  // 3. Buttocks [subs: Buttocks, Hips (bilateral), Rectum, Tailbone]
  {
    id: "buttocks",
    label: "Buttocks",
    view: "back",
    // [Calibrated rough estimate: gluteal bounding slab box]
    volumes: [
      {
        type: "box",
        pos: [0, 2.24, -0.18],
        halfExtents: [0.36, 0.22, 0.14],
      },
    ],
    subRegions: [
      {
        id: "buttocks_core",
        label: "Buttocks",
        // [Calibrated rough estimate: gluteal prominence slab]
        volumes: [
          {
            type: "box",
            pos: [0, 2.20, -0.20],
            halfExtents: [0.30, 0.16, 0.12],
          },
        ],
      },
      {
        id: "hips",
        label: "Hips",
        bilateral: true,
        // [Calibrated rough estimate: greater trochanter lateral hip box]
        volumes: [
          {
            type: "box",
            pos: [0.38, 2.30, -0.05],
            halfExtents: [0.12, 0.15, 0.14],
          },
        ],
      },
      {
        id: "rectum",
        label: "Rectum",
        // [Calibrated rough estimate: perianal / rectum box]
        volumes: [
          {
            type: "box",
            pos: [0, 2.06, -0.12],
            halfExtents: [0.08, 0.08, 0.08],
          },
        ],
      },
      {
        id: "tailbone",
        label: "Tailbone",
        // [Calibrated rough estimate: sacrococcygeal apex box]
        volumes: [
          {
            type: "box",
            pos: [0, 2.38, -0.24],
            halfExtents: [0.10, 0.09, 0.08],
          },
        ],
      },
    ],
  },

  // 4. Legs (bilateral) [subs: Hamstring, Popliteal, Calf]
  {
    id: "legs_back",
    label: "Legs",
    view: "back",
    bilateral: true,
    // [Calibrated rough estimate: compound 2-capsule posterior leg]
    volumes: [
      // Segment 1: Posterior thigh capsule (hamstring)
      {
        type: "capsule",
        start: [0.30, 2.05, -0.14],
        end: [0.30, 1.35, -0.14],
        radius: 0.18,
      },
      // Segment 2: Posterior calf capsule (gastrocnemius)
      {
        type: "capsule",
        start: [0.30, 1.35, -0.14],
        end: [0.33, 0.40, -0.10],
        radius: 0.16,
      },
    ],
    subRegions: [
      {
        id: "hamstring",
        label: "Hamstring",
        bilateral: true,
        // [Calibrated rough estimate: hamstring cylinder capsule]
        volumes: [
          {
            type: "capsule",
            start: [0.30, 2.00, -0.14],
            end: [0.30, 1.45, -0.14],
            radius: 0.17,
          },
        ],
      },
      {
        id: "popliteal",
        label: "Popliteal",
        bilateral: true,
        // [Calibrated rough estimate: popliteal fossa (behind knee) box]
        volumes: [
          {
            type: "box",
            pos: [0.30, 1.34, -0.14],
            halfExtents: [0.12, 0.08, 0.09],
          },
        ],
      },
      {
        id: "calf",
        label: "Calf",
        bilateral: true,
        // [Calibrated rough estimate: gastrocnemius calf capsule]
        volumes: [
          {
            type: "capsule",
            start: [0.31, 1.25, -0.15],
            end: [0.33, 0.55, -0.10],
            radius: 0.15,
          },
        ],
      },
    ],
  },
];

/* ─── Proxy Generation & Hit Testing Helpers ──────────────────── */

/**
 * Derives one or two mirrored proxies for a MajorRegion.
 * If bilateral: true, generates two proxies (canonical + mirrored across X=0).
 * Both share the same groupId (= major.id).
 */
export function getMajorProxies(major: MajorRegion): RegionProxy[] {
  const isLeaf = !major.subRegions || major.subRegions.length === 0;
  const canonicalVolumes = major.volumes.map(canonicalizeVolume);
  const pos = getRegionCentroid(canonicalVolumes);
  const radius = getRegionBoundingRadius(canonicalVolumes);

  if (!major.bilateral) {
    return [
      {
        groupId: major.id,
        label: major.label,
        pos,
        radius,
        isBilateral: false,
        majorId: major.id,
        isLeaf,
        volumes: canonicalVolumes,
      },
    ];
  }

  const mirroredVolumes = major.volumes.map(mirrorVolume);
  const mirroredPos = getRegionCentroid(mirroredVolumes);
  const mirroredRadius = getRegionBoundingRadius(mirroredVolumes);

  return [
    {
      groupId: major.id,
      label: major.label,
      pos,
      radius,
      isBilateral: true,
      majorId: major.id,
      isLeaf,
      volumes: canonicalVolumes,
    },
    {
      groupId: major.id,
      label: major.label,
      pos: mirroredPos,
      radius: mirroredRadius,
      isBilateral: true,
      majorId: major.id,
      isLeaf,
      volumes: mirroredVolumes,
    },
  ];
}

/**
 * Derives one or two mirrored proxies for a SubRegion.
 * If bilateral: true, generates two proxies mirrored across X=0.
 * Both share the same groupId (= sub.id).
 */
export function getSubRegionProxies(sub: SubRegion, majorId: string): RegionProxy[] {
  const canonicalVolumes = sub.volumes.map(canonicalizeVolume);
  const pos = getRegionCentroid(canonicalVolumes);
  const radius = getRegionBoundingRadius(canonicalVolumes);

  if (!sub.bilateral) {
    return [
      {
        groupId: sub.id,
        label: sub.label,
        pos,
        radius,
        isBilateral: false,
        majorId,
        subRegionId: sub.id,
        isLeaf: true,
        volumes: canonicalVolumes,
      },
    ];
  }

  const mirroredVolumes = sub.volumes.map(mirrorVolume);
  const mirroredPos = getRegionCentroid(mirroredVolumes);
  const mirroredRadius = getRegionBoundingRadius(mirroredVolumes);

  return [
    {
      groupId: sub.id,
      label: sub.label,
      pos,
      radius,
      isBilateral: true,
      majorId,
      subRegionId: sub.id,
      isLeaf: true,
      volumes: canonicalVolumes,
    },
    {
      groupId: sub.id,
      label: sub.label,
      pos: mirroredPos,
      radius: mirroredRadius,
      isBilateral: true,
      majorId,
      subRegionId: sub.id,
      isLeaf: true,
      volumes: mirroredVolumes,
    },
  ];
}

/**
 * Returns active raycast proxies depending on current mode & view.
 * - FULL MODE: tests against MajorRegion proxies matching current view.
 * - ZOOM MODE: tests against sub-regions of active major.
 */
export function getActiveProxiesForMode(
  mode: "full" | "zoom",
  activeMajorId: string | null,
  currentView: "front" | "back"
): RegionProxy[] {
  if (mode === "full" || !activeMajorId) {
    const majors = REGION_HIERARCHY.filter((m) => m.view === currentView);
    return majors.flatMap(getMajorProxies);
  }

  const activeMajor = REGION_HIERARCHY.find((m) => m.id === activeMajorId);
  if (!activeMajor || !activeMajor.subRegions || activeMajor.subRegions.length === 0) {
    return [];
  }

  return activeMajor.subRegions.flatMap((sub) => getSubRegionProxies(sub, activeMajor.id));
}

/**
 * Legacy distance-to-radius fallback helper.
 */
export function findNearestProxy(
  localPoint: THREE.Vector3,
  proxies: RegionProxy[],
  maxRatio = 1.45
): RegionProxy | null {
  let bestProxy: RegionProxy | null = null;
  let minRatio = Infinity;

  for (const proxy of proxies) {
    const proxyVec = new THREE.Vector3(...proxy.pos);
    const dist = localPoint.distanceTo(proxyVec);
    const ratio = dist / proxy.radius;
    if (ratio < minRatio) {
      minRatio = ratio;
      bestProxy = proxy;
    }
  }

  if (bestProxy && minRatio <= maxRatio) {
    return bestProxy;
  }

  return null;
}

/**
 * Looks up all 3D positions associated with a region (groupId) to drive shader uniforms.
 * If bilateral: true, returns both canonical and mirrored centroid positions.
 */
export function getRegionProxyPoints(groupId: string): {
  points: [number, number, number][];
  radius: number;
} | null {
  // Check majors
  for (const major of REGION_HIERARCHY) {
    if (major.id === groupId) {
      const canonicalVolumes = major.volumes.map(canonicalizeVolume);
      const cPos = getRegionCentroid(canonicalVolumes);
      const radius = getRegionBoundingRadius(canonicalVolumes);

      if (major.bilateral) {
        return {
          points: [
            cPos,
            [-Math.abs(cPos[0]), cPos[1], cPos[2]],
          ],
          radius,
        };
      }
      return {
        points: [cPos],
        radius,
      };
    }

    // Check sub-regions
    if (major.subRegions) {
      for (const sub of major.subRegions) {
        if (sub.id === groupId) {
          const canonicalVolumes = sub.volumes.map(canonicalizeVolume);
          const cPos = getRegionCentroid(canonicalVolumes);
          const radius = getRegionBoundingRadius(canonicalVolumes);

          if (sub.bilateral) {
            return {
              points: [
                cPos,
                [-Math.abs(cPos[0]), cPos[1], cPos[2]],
              ],
              radius,
            };
          }
          return {
            points: [cPos],
            radius,
          };
        }
      }
    }
  }

  return null;
}

/* ─── Camera Framing Targets ──────────────────────────────────── */

export interface CameraFraming {
  target: [number, number, number]; // Look-at point in local/world coordinates
  pos: [number, number, number];    // Camera position
  groupPos: [number, number, number]; // Group translation
  groupScale: number;               // Group scale factor
}

// Hand-tuned framing parameters per major for desktop and mobile
export function getFramingForMajor(
  majorId: string | null,
  isMobile: boolean
): { pos: [number, number, number]; scale: number } {
  if (!majorId) {
    return isMobile
      ? { pos: [0, -2.1, 0], scale: 0.75 }
      : { pos: [1.3, -2.4, 0], scale: 0.9 };
  }

  const desktopFramings: Record<string, { pos: [number, number, number]; scale: number }> = {
    head: { pos: [0.65, -6.15, 0], scale: 1.55 },
    head_back: { pos: [0.65, -6.15, 0], scale: 1.55 },
    neck: { pos: [0.65, -5.65, 0], scale: 1.5 },
    chest: { pos: [0.65, -4.95, 0], scale: 1.5 },
    abdomen: { pos: [0.65, -3.65, 0], scale: 1.45 },
    arms: { pos: [0.55, -3.55, 0], scale: 1.25 },
    pelvic: { pos: [0.65, -2.85, 0], scale: 1.45 },
    legs: { pos: [0.65, -1.35, 0], scale: 1.35 },
    legs_back: { pos: [0.65, -1.35, 0], scale: 1.35 },
    back: { pos: [0.65, -4.35, 0], scale: 1.45 },
    buttocks: { pos: [0.65, -2.85, 0], scale: 1.45 },
  };

  const mobileFramings: Record<string, { pos: [number, number, number]; scale: number }> = {
    head: { pos: [0, -4.9, 0], scale: 1.25 },
    head_back: { pos: [0, -4.9, 0], scale: 1.25 },
    neck: { pos: [0, -4.5, 0], scale: 1.25 },
    chest: { pos: [0, -4.0, 0], scale: 1.25 },
    abdomen: { pos: [0, -3.0, 0], scale: 1.2 },
    arms: { pos: [0, -2.85, 0], scale: 1.05 },
    pelvic: { pos: [0, -2.2, 0], scale: 1.2 },
    legs: { pos: [0, -1.1, 0], scale: 1.15 },
    legs_back: { pos: [0, -1.1, 0], scale: 1.15 },
    back: { pos: [0, -3.5, 0], scale: 1.2 },
    buttocks: { pos: [0, -2.3, 0], scale: 1.2 },
  };

  const targets = isMobile ? mobileFramings : desktopFramings;
  return targets[majorId] || (isMobile ? { pos: [0, -2.1, 0], scale: 0.75 } : { pos: [1.3, -2.4, 0], scale: 0.9 });
}
