"use client";

import React, {
  useRef,
  Suspense,
  useMemo,
  useState,
  useEffect,
  useCallback,
} from "react";
import { Canvas, useFrame, useThree, ThreeEvent } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import {
  IconCrosshair,
} from "./icons";
import {
  REGION_HIERARCHY,
  MajorRegion,
  SubRegion,
  RegionSelectionPayload,
  PART_TO_MAJOR,
  expandToParts,
  getMajor,
} from "./regionHierarchy";
import { PART_IDS, PART_INDEX, BODY_MODEL_URL, labelVertices, type BodyId } from "./body/segmentBody";
import BodyPickerPanel from "./BodyPickerPanel";
import BodyChips from "./BodyChips";
import { useTheme } from "./ThemeToggle";
import { useSymptomCatalog } from "@/lib/symptoms";
import { createPortal } from "react-dom";

export type { SubRegion, MajorRegion, RegionSelectionPayload };

/* ─── Frame pacing ───────────────────────────────────────────── */

/**
 * Drives the canvas at a fixed frame rate instead of every display refresh.
 * The idle auto-rotation is slow, so 30 fps is indistinguishable from 60 and
 * halves GPU load; interaction (select mode) runs at 60. Nothing renders while
 * the model is off screen or the tab is hidden.
 */
function FrameDriver({ active, fps, redrawKey }: { active: boolean; fps: number; redrawKey: unknown }) {
  const invalidate = useThree((state) => state.invalidate);

  // Even while idle, draw one fresh frame when what is shown changes
  // (for example a symptom typed in the search bar lights up a body area).
  useEffect(() => {
    invalidate();
  }, [redrawKey, invalidate]);

  useEffect(() => {
    if (!active) return;
    const interval = 1000 / fps;
    let last = -Infinity;
    let raf = 0;

    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      if (document.hidden) return;
      if (t - last < interval - 1) return;
      last = t;
      invalidate();
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, fps, invalidate]);

  return null;
}

/* ─── Anatomical Data & Symptom Mapping ──────────────────────── */

export interface RankedSymptom {
  id: string; // Symptom key; resolved to a canonical symptom by the backend (seeded as a synonym)
  name: string; // User-facing display title
  rank: number; // 1 = highest clinical prevalence
  severity: number; // 1 to 7 severity score
  description?: string;
  synonyms?: string[];
}

export interface SubRegionData {
  id: string; // Canonical region ID matching REGION_HIERARCHY
  name: string;
  majorId: string;
  topSymptoms: RankedSymptom[];
  secondarySymptoms?: RankedSymptom[];
}

// Hand-curated ranked symptoms per region and sub-region
export const REGION_SYMPTOMS: Record<string, SubRegionData> = {
  /* ─── HEAD SUB-REGIONS ─── */
  head: {
    id: "head",
    name: "Head",
    majorId: "head",
    topSymptoms: [
      { id: "headache", name: "Headache", rank: 1, severity: 3, description: "Throbbing, sharp or tight pain in the head" },
      { id: "dizziness", name: "Dizziness", rank: 2, severity: 4, description: "Feeling faint, lightheaded or unsteady" },
      { id: "confusion", name: "Confusion", rank: 3, severity: 2, description: "Trouble thinking clearly or staying alert" },
      { id: "vertigo", name: "Spinning feeling (vertigo)", rank: 4, severity: 6, description: "The room seems to spin" },
    ],
    secondarySymptoms: [
      { id: "difficulty concentrating", name: "Trouble concentrating", rank: 5, severity: 3 },
      { id: "balance problems", name: "Loss of balance", rank: 6, severity: 4 },
      { id: "depression", name: "Low mood", rank: 7, severity: 3 },
      { id: "irritability", name: "Irritability", rank: 8, severity: 2 },
    ],
  },
  head_back: {
    id: "head_back",
    name: "Back of the head",
    majorId: "head_back",
    topSymptoms: [
      { id: "headache", name: "Headache at the back of the head", rank: 1, severity: 3 },
      { id: "stiff neck", name: "Stiffness at the top of the neck", rank: 2, severity: 4 },
      { id: "dizziness", name: "Dizziness when turning the head", rank: 3, severity: 4 },
    ],
  },
  scalp: {
    id: "scalp",
    name: "Scalp",
    majorId: "head",
    topSymptoms: [
      { id: "scalp tenderness", name: "Sore or tender scalp", rank: 1, severity: 3 },
      { id: "scalp itching", name: "Itchy scalp", rank: 2, severity: 2 },
      { id: "skin rash", name: "Bumps or crusting on the scalp", rank: 3, severity: 3 },
    ],
  },
  forehead: {
    id: "forehead",
    name: "Forehead",
    majorId: "head",
    topSymptoms: [
      { id: "headache", name: "Headache in the forehead", rank: 1, severity: 3 },
      { id: "sinus pressure", name: "Pressure above the eyes", rank: 2, severity: 4 },
      { id: "sweating", name: "Sudden sweating", rank: 3, severity: 2, description: "Clammy or cold sweat" },
    ],
  },
  eyes: {
    id: "eyes",
    name: "Eyes",
    majorId: "head",
    topSymptoms: [
      { id: "blurred vision", name: "Blurred vision", rank: 1, severity: 5 },
      { id: "eye pain", name: "Pain behind the eyes", rank: 2, severity: 4 },
      { id: "red eyes", name: "Red eyes", rank: 3, severity: 5 },
      { id: "watery eyes", name: "Watery eyes", rank: 4, severity: 4 },
    ],
    secondarySymptoms: [
      { id: "jaundice", name: "Yellow eyes or skin", rank: 5, severity: 4 },
      { id: "sunken eyes", name: "Sunken eyes", rank: 6, severity: 3 },
    ],
  },
  nose: {
    id: "nose",
    name: "Nose",
    majorId: "head",
    topSymptoms: [
      { id: "sinus pressure", name: "Sinus pressure or pain", rank: 1, severity: 4, description: "Fullness around the nose, forehead and cheeks" },
      { id: "runny nose", name: "Runny nose", rank: 2, severity: 5 },
      { id: "sneezing", name: "Sneezing", rank: 3, severity: 4 },
      { id: "loss of smell", name: "Loss of smell", rank: 4, severity: 3 },
    ],
    secondarySymptoms: [
      { id: "skin sores", name: "Red sores around the nose", rank: 5, severity: 2 },
    ],
  },
  face: {
    id: "face",
    name: "Face",
    majorId: "head",
    topSymptoms: [
      { id: "facial swelling", name: "Puffy face or eyelids", rank: 1, severity: 5 },
      { id: "slurred speech", name: "Slurred speech or face weakness", rank: 2, severity: 4 },
      { id: "facial numbness", name: "Numb or tingling face", rank: 3, severity: 4 },
      { id: "pimples", name: "Pimples on the face", rank: 4, severity: 2 },
    ],
    secondarySymptoms: [
      { id: "blackheads", name: "Blackheads", rank: 5, severity: 2 },
    ],
  },
  mouth: {
    id: "mouth",
    name: "Mouth",
    majorId: "head",
    topSymptoms: [
      { id: "mouth sores", name: "Mouth or tongue sores", rank: 1, severity: 4 },
      { id: "cracked lips", name: "Dry, cracked or tingling lips", rank: 2, severity: 4 },
      { id: "slurred speech", name: "Slurred speech", rank: 3, severity: 4 },
    ],
  },
  jaw: {
    id: "jaw",
    name: "Jaw",
    majorId: "head",
    topSymptoms: [
      { id: "jaw pain", name: "Jaw pain", rank: 1, severity: 3, description: "Clicking or soreness when chewing" },
      { id: "jaw stiffness", name: "Stiff jaw", rank: 2, severity: 4, description: "Hard to open the mouth fully" },
    ],
  },
  ears: {
    id: "ears",
    name: "Ears",
    majorId: "head",
    topSymptoms: [
      { id: "vertigo", name: "Spinning feeling (vertigo)", rank: 1, severity: 6, description: "The room seems to spin" },
      { id: "balance problems", name: "Loss of balance", rank: 2, severity: 4 },
      { id: "ear pain", name: "Ear pain", rank: 3, severity: 3, description: "Sharp or aching pain in or around the ear" },
    ],
  },

  /* ─── NECK LEAF REGION ─── */
  neck: {
    id: "neck",
    name: "Neck",
    majorId: "neck",
    topSymptoms: [
      { id: "neck pain", name: "Neck pain", rank: 1, severity: 5 },
      { id: "stiff neck", name: "Stiff neck", rank: 2, severity: 4, description: "Hard to turn the head or bring chin to chest" },
      { id: "swelling lymph nodes", name: "Swollen glands in the neck", rank: 3, severity: 6 },
      { id: "neck swelling", name: "Swelling at the front of the neck", rank: 4, severity: 6 },
    ],
  },

  /* ─── CHEST SUB-REGIONS ─── */
  chest: {
    id: "chest",
    name: "Chest",
    majorId: "chest",
    topSymptoms: [
      { id: "chest pain", name: "Chest pain or tightness", rank: 1, severity: 7, description: "Pressure, squeezing or stabbing pain" },
      { id: "shortness of breath", name: "Shortness of breath", rank: 2, severity: 4 },
      { id: "palpitations", name: "Pounding or racing heartbeat", rank: 3, severity: 4 },
      { id: "fast heartbeat", name: "Fast heartbeat at rest", rank: 4, severity: 5 },
    ],
    secondarySymptoms: [
      { id: "cough", name: "Cough that won't go away", rank: 5, severity: 4 },
      { id: "cough with phlegm", name: "Chesty cough with phlegm", rank: 6, severity: 5 },
    ],
  },
  upper_chest: {
    id: "upper_chest",
    name: "Upper chest",
    majorId: "chest",
    topSymptoms: [
      { id: "chest pressure", name: "Pressure in the upper chest", rank: 1, severity: 6 },
      { id: "wheezing", name: "Wheezing or tight airway", rank: 2, severity: 4 },
      { id: "dry cough", name: "Dry cough", rank: 3, severity: 4 },
    ],
  },
  breast: {
    id: "breast",
    name: "Breast",
    majorId: "chest",
    topSymptoms: [
      { id: "breast pain", name: "Breast pain or tenderness", rank: 1, severity: 4 },
      { id: "breast swelling", name: "Breast swelling", rank: 2, severity: 3 },
      { id: "swelling lymph nodes", name: "Tender lumps near the breast or armpit", rank: 3, severity: 5 },
    ],
  },
  chest_core: {
    id: "chest_core",
    name: "Centre of the chest",
    majorId: "chest",
    topSymptoms: [
      { id: "chest pain", name: "Heavy pain behind the breastbone", rank: 1, severity: 7 },
      { id: "palpitations", name: "Fluttering or skipped heartbeats", rank: 2, severity: 4 },
      { id: "shortness of breath", name: "Breathless on effort", rank: 3, severity: 5, description: "Out of breath climbing stairs" },
    ],
  },

  /* ─── ABDOMEN SUB-REGIONS ─── */
  abdomen: {
    id: "abdomen",
    name: "Belly",
    majorId: "abdomen",
    topSymptoms: [
      { id: "stomach pain", name: "Stomach pain or cramps", rank: 1, severity: 5 },
      { id: "nausea", name: "Nausea", rank: 2, severity: 5, description: "Feeling sick, urge to vomit" },
      { id: "vomiting", name: "Vomiting", rank: 3, severity: 5 },
      { id: "heartburn", name: "Heartburn", rank: 4, severity: 3, description: "Burning rising from the stomach" },
    ],
    secondarySymptoms: [
      { id: "abdominal pain", name: "Belly pain", rank: 5, severity: 4 },
      { id: "indigestion", name: "Indigestion", rank: 6, severity: 5 },
      { id: "bloating", name: "Swollen belly", rank: 7, severity: 7 },
      { id: "loss of appetite", name: "Loss of appetite", rank: 8, severity: 4 },
    ],
  },
  epigastric: {
    id: "epigastric",
    name: "Upper middle belly",
    majorId: "abdomen",
    topSymptoms: [
      { id: "stomach pain", name: "Burning pain in the upper stomach", rank: 1, severity: 5 },
      { id: "heartburn", name: "Sour acid coming up", rank: 2, severity: 4 },
      { id: "feeling full quickly", name: "Feeling full quickly", rank: 3, severity: 3 },
      { id: "nausea", name: "Nausea", rank: 4, severity: 4 },
    ],
  },
  upper_abdomen: {
    id: "upper_abdomen",
    name: "Upper belly",
    majorId: "abdomen",
    topSymptoms: [
      { id: "upper abdominal pain", name: "Ache under the right ribs", rank: 1, severity: 5 },
      { id: "vomiting", name: "Vomiting yellow-green fluid", rank: 2, severity: 5 },
      { id: "loss of appetite", name: "Loss of appetite", rank: 3, severity: 4 },
      { id: "bloating", name: "Fullness in the upper belly", rank: 4, severity: 6 },
    ],
  },
  lower_abdomen: {
    id: "lower_abdomen",
    name: "Lower belly",
    majorId: "abdomen",
    topSymptoms: [
      { id: "abdominal cramps", name: "Lower belly cramps", rank: 1, severity: 5 },
      { id: "diarrhea", name: "Diarrhea", rank: 2, severity: 6 },
      { id: "constipation", name: "Constipation or straining", rank: 3, severity: 4 },
      { id: "bloating", name: "Bloating or gas", rank: 4, severity: 5 },
    ],
  },

  /* ─── ARMS SUB-REGIONS (BILATERAL) ─── */
  arms: {
    id: "arms",
    name: "Arms",
    majorId: "arms",
    topSymptoms: [
      { id: "arm weakness", name: "Weak arms", rank: 1, severity: 2 },
      { id: "muscle weakness", name: "Weak or heavy limbs", rank: 2, severity: 7 },
      { id: "arm pain", name: "Aching arm", rank: 3, severity: 2 },
      { id: "easy bruising", name: "Bruises on the arm", rank: 4, severity: 4 },
    ],
  },
  shoulder: {
    id: "shoulder",
    name: "Shoulder",
    majorId: "arms",
    topSymptoms: [
      { id: "shoulder pain", name: "Shoulder pain", rank: 1, severity: 4, description: "Pain when raising the arm" },
      { id: "shoulder stiffness", name: "Stiff shoulder", rank: 2, severity: 5 },
    ],
  },
  armpit: {
    id: "armpit",
    name: "Armpit",
    majorId: "arms",
    topSymptoms: [
      { id: "swelling lymph nodes", name: "Lumps in the armpit", rank: 1, severity: 6 },
      { id: "arm pain", name: "Sore armpit", rank: 2, severity: 3 },
      { id: "excessive sweating", name: "Heavy underarm sweating", rank: 3, severity: 2 },
    ],
  },
  upper_arm: {
    id: "upper_arm",
    name: "Upper arm",
    majorId: "arms",
    topSymptoms: [
      { id: "arm pain", name: "Aching upper arm", rank: 1, severity: 3 },
      { id: "arm weakness", name: "Hard to lift with the arm", rank: 2, severity: 3 },
      { id: "bruising", name: "Bruise on the upper arm", rank: 3, severity: 3 },
    ],
  },
  elbow: {
    id: "elbow",
    name: "Elbow",
    majorId: "arms",
    topSymptoms: [
      { id: "elbow pain", name: "Elbow pain", rank: 1, severity: 3 },
      { id: "joint swelling", name: "Swollen elbow", rank: 2, severity: 4 },
      { id: "elbow stiffness", name: "Stiff elbow", rank: 3, severity: 4 },
    ],
  },
  forearm: {
    id: "forearm",
    name: "Forearm",
    majorId: "arms",
    topSymptoms: [
      { id: "forearm pain", name: "Forearm pain", rank: 1, severity: 3 },
      { id: "weak grip", name: "Weak grip", rank: 2, severity: 4 },
    ],
  },
  wrist: {
    id: "wrist",
    name: "Wrist",
    majorId: "arms",
    topSymptoms: [
      { id: "wrist pain", name: "Wrist pain", rank: 1, severity: 4 },
      { id: "joint swelling", name: "Swollen wrist", rank: 2, severity: 5 },
      { id: "tingling in hands", name: "Pins and needles in the hand", rank: 3, severity: 4 },
    ],
  },
  hand: {
    id: "hand",
    name: "Hand",
    majorId: "arms",
    topSymptoms: [
      { id: "cold hands", name: "Cold hands", rank: 1, severity: 5 },
      { id: "hand pain", name: "Hand pain", rank: 2, severity: 3 },
      { id: "hand swelling", name: "Swollen hands or fingers", rank: 3, severity: 4 },
    ],
  },
  fingers: {
    id: "fingers",
    name: "Fingers and nails",
    majorId: "arms",
    topSymptoms: [
      { id: "finger pain", name: "Finger joint pain", rank: 1, severity: 3 },
      { id: "brittle nails", name: "Brittle or splitting nails", rank: 2, severity: 5 },
      { id: "nail changes", name: "Dents or ridges in the nails", rank: 3, severity: 2 },
    ],
  },

  /* ─── PELVIC SUB-REGIONS ─── */
  pelvic: {
    id: "pelvic",
    name: "Pelvis",
    majorId: "pelvic",
    topSymptoms: [
      { id: "painful urination", name: "Burning when passing urine", rank: 1, severity: 6 },
      { id: "pelvic pressure", name: "Bladder pressure", rank: 2, severity: 4 },
      { id: "diarrhea", name: "Diarrhea", rank: 3, severity: 6 },
      { id: "constipation", name: "Constipation", rank: 4, severity: 4 },
    ],
    secondarySymptoms: [
      { id: "frequent urination", name: "Passing urine often", rank: 5, severity: 6 },
      { id: "foul smelling urine", name: "Bad-smelling urine", rank: 6, severity: 5 },
      { id: "dark urine", name: "Dark urine", rank: 7, severity: 4 },
      { id: "irregular periods", name: "Irregular periods", rank: 8, severity: 6 },
    ],
  },
  above_pubic_bone: {
    id: "above_pubic_bone",
    name: "Low belly, above the pubic bone",
    majorId: "pelvic",
    topSymptoms: [
      { id: "pelvic pain", name: "Ache low in the belly", rank: 1, severity: 5 },
      { id: "urinary urgency", name: "Constant urge to pass urine", rank: 2, severity: 6 },
      { id: "painful urination", name: "Cramping pain when passing urine", rank: 3, severity: 6 },
    ],
  },
  pelvic_core: {
    id: "pelvic_core",
    name: "Pelvis",
    majorId: "pelvic",
    topSymptoms: [
      { id: "pelvic pressure", name: "Heaviness in the pelvis", rank: 1, severity: 4 },
      { id: "painful urination", name: "Pain when passing urine", rank: 2, severity: 6 },
      { id: "painful periods", name: "Painful periods", rank: 3, severity: 6 },
    ],
  },
  genital: {
    id: "genital",
    name: "Genital area",
    majorId: "pelvic",
    topSymptoms: [
      { id: "painful urination", name: "Burning or itching when passing urine", rank: 1, severity: 6 },
      { id: "genital itching", name: "Itching in the groin or genital area", rank: 2, severity: 3 },
      { id: "cloudy urine", name: "Cloudy or smelly urine", rank: 3, severity: 5 },
    ],
  },
  groin: {
    id: "groin",
    name: "Groin",
    majorId: "pelvic",
    topSymptoms: [
      { id: "swelling lymph nodes", name: "Swollen glands in the groin", rank: 1, severity: 6 },
      { id: "groin pain", name: "Groin or inner thigh pain", rank: 2, severity: 3 },
      { id: "groin bulge", name: "Bulge or pressure in the groin", rank: 3, severity: 5 },
    ],
  },

  /* ─── LEGS SUB-REGIONS (BILATERAL) ─── */
  legs: {
    id: "legs",
    name: "Legs",
    majorId: "legs",
    topSymptoms: [
      { id: "leg weakness", name: "Weak legs", rank: 1, severity: 7 },
      { id: "leg swelling", name: "Swollen legs, ankles or feet", rank: 2, severity: 5 },
      { id: "leg pain when walking", name: "Leg pain that comes on with walking", rank: 3, severity: 4 },
      { id: "muscle spasms", name: "Leg muscle spasms", rank: 4, severity: 4 },
    ],
  },
  legs_back: {
    id: "legs_back",
    name: "Back of the legs",
    majorId: "legs_back",
    topSymptoms: [
      { id: "muscle cramps", name: "Night-time calf cramps", rank: 1, severity: 4 },
      { id: "visible veins", name: "Bulging veins on the legs", rank: 2, severity: 6 },
      { id: "muscle tightness", name: "Tight back of the thigh", rank: 3, severity: 3 },
    ],
  },
  thigh: {
    id: "thigh",
    name: "Thigh",
    majorId: "legs",
    topSymptoms: [
      { id: "thigh pain", name: "Aching front of the thigh", rank: 1, severity: 3 },
      { id: "muscle spasms", name: "Thigh muscle spasm", rank: 2, severity: 4 },
      { id: "muscle wasting", name: "Thigh muscle getting thinner", rank: 3, severity: 3 },
      { id: "leg swelling", name: "Swollen thigh", rank: 4, severity: 5 },
    ],
  },
  knee: {
    id: "knee",
    name: "Knee",
    majorId: "legs",
    topSymptoms: [
      { id: "knee pain", name: "Knee pain", rank: 1, severity: 3 },
      { id: "knee swelling", name: "Swollen knee", rank: 2, severity: 5 },
      { id: "knee stiffness", name: "Stiff knee", rank: 3, severity: 5 },
      { id: "leg pain when walking", name: "Pain when walking", rank: 4, severity: 2 },
    ],
  },
  shin: {
    id: "shin",
    name: "Shin",
    majorId: "legs",
    topSymptoms: [
      { id: "leg swelling", name: "Swollen shins", rank: 1, severity: 5 },
      { id: "shin pain", name: "Shin pain", rank: 2, severity: 3 },
      { id: "leg tenderness", name: "Tender vein on the lower leg", rank: 3, severity: 5 },
    ],
  },
  ankle: {
    id: "ankle",
    name: "Ankle",
    majorId: "legs",
    topSymptoms: [
      { id: "ankle swelling", name: "Swollen ankles", rank: 1, severity: 5 },
      { id: "ankle pain", name: "Ankle pain", rank: 2, severity: 3 },
      { id: "limping", name: "Limping", rank: 3, severity: 4 },
    ],
  },
  foot: {
    id: "foot",
    name: "Foot",
    majorId: "legs",
    topSymptoms: [
      { id: "heel pain", name: "Heel pain", rank: 1, severity: 4, description: "Worst on the first steps in the morning" },
      { id: "cold feet", name: "Cold feet", rank: 2, severity: 5 },
      { id: "foot swelling", name: "Swollen feet", rank: 3, severity: 5 },
    ],
  },
  toes: {
    id: "toes",
    name: "Toes",
    majorId: "legs",
    topSymptoms: [
      { id: "toe pain", name: "Painful, red big toe", rank: 1, severity: 5 },
      { id: "toe numbness", name: "Cold or numb toes", rank: 2, severity: 5 },
      { id: "thickened nails", name: "Thick or brittle toenails", rank: 3, severity: 4 },
    ],
  },

  /* ─── BACK SUB-REGIONS ─── */
  back: {
    id: "back",
    name: "Back",
    majorId: "back",
    topSymptoms: [
      { id: "back pain", name: "Back pain", rank: 1, severity: 3 },
      { id: "stiffness", name: "Stiffness when moving", rank: 2, severity: 5 },
      { id: "stiff neck", name: "Tight neck and upper back", rank: 3, severity: 4 },
    ],
  },
  upper_back: {
    id: "upper_back",
    name: "Upper back",
    majorId: "back",
    topSymptoms: [
      { id: "upper back pain", name: "Pain between the shoulder blades", rank: 1, severity: 4 },
      { id: "neck pain", name: "Tight, knotted shoulder muscles", rank: 2, severity: 4 },
      { id: "back stiffness", name: "Stiff mid back", rank: 3, severity: 3 },
    ],
  },
  middle_back: {
    id: "middle_back",
    name: "Middle back",
    majorId: "back",
    topSymptoms: [
      { id: "back pain", name: "Ache in the middle of the back", rank: 1, severity: 3 },
      { id: "pain with breathing", name: "Rib pain when breathing in", rank: 2, severity: 5 },
    ],
  },
  lower_back: {
    id: "lower_back",
    name: "Lower back",
    majorId: "back",
    topSymptoms: [
      { id: "low back pain", name: "Sharp lower back pain", rank: 1, severity: 5 },
      { id: "leg pain", name: "Shooting pain down the leg", rank: 2, severity: 6 },
      { id: "back stiffness", name: "Stiff lower back in the morning", rank: 3, severity: 5 },
    ],
  },
  flank: {
    id: "flank",
    name: "Side (flank)",
    majorId: "back",
    topSymptoms: [
      { id: "flank pain", name: "Pain in the side", rank: 1, severity: 6 },
      { id: "blood in urine", name: "Blood in the urine", rank: 3, severity: 5 },
    ],
  },

  /* ─── BUTTOCKS SUB-REGIONS ─── */
  buttocks: {
    id: "buttocks",
    name: "Buttocks",
    majorId: "buttocks",
    topSymptoms: [
      { id: "buttock pain", name: "Buttock pain when sitting", rank: 1, severity: 3 },
      { id: "hip pain", name: "Pain at the back of the hip", rank: 3, severity: 4 },
    ],
  },
  buttocks_core: {
    id: "buttocks_core",
    name: "Buttocks",
    majorId: "buttocks",
    topSymptoms: [
      { id: "buttock pain", name: "Tender buttock muscles", rank: 1, severity: 3 },
      { id: "hip stiffness", name: "Hard to stand up from a chair", rank: 2, severity: 4 },
    ],
  },
  hips: {
    id: "hips",
    name: "Hips",
    majorId: "buttocks",
    topSymptoms: [
      { id: "hip pain", name: "Hip pain", rank: 1, severity: 4 },
      { id: "limping", name: "Limp from hip pain", rank: 2, severity: 4 },
      { id: "hip stiffness", name: "Stiff hip", rank: 3, severity: 4 },
    ],
  },
  rectum: {
    id: "rectum",
    name: "Back passage",
    majorId: "buttocks",
    topSymptoms: [
      { id: "painful bowel movements", name: "Pain when passing stool", rank: 1, severity: 5 },
      { id: "bowel urgency", name: "Sudden urgent need to pass stool", rank: 2, severity: 5 },
      { id: "anal itching", name: "Itching around the anus", rank: 3, severity: 3 },
    ],
  },
  tailbone: {
    id: "tailbone",
    name: "Tailbone",
    majorId: "buttocks",
    topSymptoms: [
      { id: "back pain", name: "Tailbone pain", rank: 1, severity: 5 },
    ],
  },

  /* ─── POSTERIOR LEGS SUB-REGIONS ─── */
  hamstring: {
    id: "hamstring",
    name: "Back of the thigh",
    majorId: "legs_back",
    topSymptoms: [
      { id: "thigh pain", name: "Sudden pain at the back of the thigh", rank: 1, severity: 4 },
      { id: "muscle spasms", name: "Spasm at the back of the thigh", rank: 2, severity: 4 },
      { id: "leg pain when walking", name: "Pain at the back of the thigh when walking", rank: 3, severity: 3 },
    ],
  },
  popliteal: {
    id: "popliteal",
    name: "Behind the knee",
    majorId: "legs_back",
    topSymptoms: [
      { id: "knee swelling", name: "Lump or fullness behind the knee", rank: 1, severity: 4 },
      { id: "knee stiffness", name: "Tightness behind the knee", rank: 2, severity: 4 },
    ],
  },
  calf: {
    id: "calf",
    name: "Calf",
    majorId: "legs_back",
    topSymptoms: [
      { id: "muscle cramps", name: "Calf cramps", rank: 1, severity: 4 },
      { id: "visible veins", name: "Bulging veins on the calf", rank: 2, severity: 6 },
      { id: "leg swelling", name: "One swollen, warm or tender calf", rank: 3, severity: 6 },
    ],
  },
};

// Aliases for historical keys
REGION_SYMPTOMS["thighs"] = REGION_SYMPTOMS["thigh"];
REGION_SYMPTOMS["knees"] = REGION_SYMPTOMS["knee"];
REGION_SYMPTOMS["calves"] = REGION_SYMPTOMS["calf"];
REGION_SYMPTOMS["feet"] = REGION_SYMPTOMS["foot"];
REGION_SYMPTOMS["hands"] = REGION_SYMPTOMS["hand"];

/**
 * Which body parts a set of symptoms points at.
 *
 * `areasByTerm` comes from the knowledge base (symptom name or synonym → area
 * ids), so the body lights up from the same data the search uses. Until it has
 * loaded, a symptom lights the parts whose picker list contains it.
 */
const PICKER_SYMPTOM_PARTS: Record<string, string[]> = (() => {
  const map: Record<string, Set<string>> = {};
  for (const [regionId, data] of Object.entries(REGION_SYMPTOMS)) {
    const parts = expandToParts(regionId);
    for (const s of [...data.topSymptoms, ...(data.secondarySymptoms ?? [])]) {
      (map[s.id] ??= new Set());
      parts.forEach((p) => map[s.id].add(p));
    }
  }
  return Object.fromEntries(Object.entries(map).map(([k, v]) => [k, [...v]]));
})();

function getActiveParts(
  symptoms: string[],
  areasByTerm: Record<string, string[]> | null
): string[] {
  const parts = new Set<string>();
  for (const s of symptoms) {
    const key = s.trim().toLowerCase();
    const areas = areasByTerm?.[key];
    if (areas) areas.forEach((a) => expandToParts(a).forEach((p) => parts.add(p)));
    else PICKER_SYMPTOM_PARTS[key]?.forEach((p) => parts.add(p));
  }
  return [...parts].sort();
}

/**
 * Closest the camera gets to the body while zoomed in on an area, [desktop, phone].
 * Close enough to read the area, far enough that the areas around it stay on
 * screen and can be tapped directly.
 */
const ZOOM_MIN_DIST: [number, number] = [2.9, 3.2];

/**
 * Phone "chips" layout: camera distance while an area is open, and how far the
 * body moves left (as a share of half the visible width) so the symptom chips
 * have the right-hand ~44% of the screen to themselves.
 */
const CHIPS_ZOOM_DIST = 4.0;
const CHIPS_SHIFT = 0.44;

/* ─── Rotating 3D Body Mesh Component ────────────────────────── */

/** A tap on the body: the part under the finger and the area it belongs to. */
export interface BodyHit {
  majorId: string;
  partId: string;
}

interface RotatingBodyProps {
  /** Parts lit because of the symptoms in the search bar. */
  activeParts: string[];
  selectMode: boolean;
  mode: "full" | "zoom";
  activeMajorId: string | null;
  selectedSubRegionId: string | null;
  /** Area id or part id currently hovered (from the model or the list). */
  hoveredGroupId: string | null;
  targetRotationYRef: React.MutableRefObject<number>;
  isDraggingRef: React.MutableRefObject<boolean>;
  onRegionClick: (hit: BodyHit) => void;
  onRegionHover: (groupId: string | null) => void;
  /** Dev only: colour every part differently to check the boundaries. */
  paintParts?: boolean;
  /** Dark theme: deeper body tone, softer rim. */
  dark?: boolean;
  /** Which body mesh to show. Fixed for the component's life (the parent remounts it on change). */
  bodyId?: BodyId;
  /** Phone chips layout: frame the open area in the left part of the screen. */
  chips?: boolean;
}

/** Distinct colour per part for the dev paint mode (same palette as `npm run body:render`). */
function partColour(index: number): [number, number, number] {
  const h = (index * 137.5) % 360, s = 0.75, l = index % 2 ? 0.45 : 0.62;
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)];
}

function RotatingBody({
  activeParts,
  selectMode,
  mode,
  activeMajorId,
  selectedSubRegionId,
  hoveredGroupId,
  targetRotationYRef,
  isDraggingRef,
  onRegionClick,
  onRegionHover,
  paintParts = false,
  dark = false,
  bodyId = "male",
  chips = false,
}: RotatingBodyProps) {
  const groupRef = useRef<THREE.Group>(null!);
  const invalidate = useThree((s) => s.invalidate);
  const { scene } = useGLTF(BODY_MODEL_URL[bodyId]);
  const hoverIntensityRef = useRef<number>(0);
  const cameraTargetRef = useRef(new THREE.Vector3(-1.25, 2.235, 0));
  const isCameraInitializedRef = useRef<boolean>(false);

  // 1. Runtime bounding box calibration of Object_4 via new THREE.Box3().setFromObject(mesh)
  const meshBounds = useMemo(() => {
    const mesh = scene.getObjectByName("Object_4") as THREE.Mesh | undefined;
    if (!mesh) return null;
    scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(mesh);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    // Compute bounding radius in X-Z plane around model center (accounts for 360° rotation)
    const maxRadiusXZ = Math.max(
      Math.hypot(box.min.x - center.x, box.min.z - center.z),
      Math.hypot(box.max.x - center.x, box.min.z - center.z),
      Math.hypot(box.min.x - center.x, box.max.z - center.z),
      Math.hypot(box.max.x - center.x, box.max.z - center.z)
    );

    if (process.env.NODE_ENV !== "production") {
      console.info(
        `%c[3D Mesh Calibration] Object_4 Runtime Bounding Box:`,
        "color: #0284c7; font-weight: bold",
        {
          min: { x: +box.min.x.toFixed(3), y: +box.min.y.toFixed(3), z: +box.min.z.toFixed(3) },
          max: { x: +box.max.x.toFixed(3), y: +box.max.y.toFixed(3), z: +box.max.z.toFixed(3) },
          size: { x: +size.x.toFixed(3), y: +size.y.toFixed(3), z: +size.z.toFixed(3) },
          center: { x: +center.x.toFixed(3), y: +center.y.toFixed(3), z: +center.z.toFixed(3) },
          maxRadiusXZ: +maxRadiusXZ.toFixed(3),
        }
      );
    }

    return { box, size, center, maxRadiusXZ };
  }, [scene]);

  // The body, with the world transform baked in and every vertex labelled
  // with the body part it belongs to (see body/segmentBody.ts).
  const body = useMemo(() => {
    const mesh = scene.getObjectByName("Object_4") as THREE.Mesh | undefined;
    if (!mesh) return null;
    scene.updateMatrixWorld(true);
    const geometry = mesh.geometry.clone();
    geometry.applyMatrix4(mesh.matrixWorld);
    geometry.computeVertexNormals();

    const posAttr = geometry.attributes.position;
    const nrmAttr = geometry.attributes.normal;
    const count = posAttr.count;
    const positions = new Float32Array(count * 3);
    const normals = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = posAttr.getX(i);
      positions[i * 3 + 1] = posAttr.getY(i);
      positions[i * 3 + 2] = posAttr.getZ(i);
      normals[i * 3] = nrmAttr.getX(i);
      normals[i * 3 + 1] = nrmAttr.getY(i);
      normals[i * 3 + 2] = nrmAttr.getZ(i);
    }
    const labels = labelVertices(positions, normals, bodyId);

    // Per-vertex highlight weights (0 or 1). The GPU blends them across each
    // triangle, so highlight edges are smooth even where triangles are large.
    geometry.setAttribute("aHover", new THREE.BufferAttribute(new Float32Array(count), 1));
    geometry.setAttribute("aActive", new THREE.BufferAttribute(new Float32Array(count), 1));

    if (process.env.NODE_ENV !== "production") {
      const paint = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) paint.set(partColour(labels[i]), i * 3);
      geometry.setAttribute("aPaint", new THREE.BufferAttribute(paint, 3));
    }

    // Height of the middle of each area (midpoint of its extent), for framing the camera on it.
    const minY: Record<string, number> = {};
    const maxY: Record<string, number> = {};
    for (let i = 0; i < count; i++) {
      const major = PART_TO_MAJOR[PART_IDS[labels[i]]];
      const y = positions[i * 3 + 1];
      minY[major] = Math.min(minY[major] ?? Infinity, y);
      maxY[major] = Math.max(maxY[major] ?? -Infinity, y);
    }
    const centerY: Record<string, number> = {};
    for (const id of Object.keys(minY)) centerY[id] = (minY[id] + maxY[id]) / 2;

    return { geometry, labels, centerY };
  }, [scene, bodyId]);

  useEffect(() => {
    return () => {
      body?.geometry.dispose();
    };
  }, [body]);

  /** Sets a per-vertex weight attribute to 1 for vertices in the given parts. */
  const paintWeights = useCallback(
    (attribute: "aHover" | "aActive", partIds: string[]) => {
      if (!body) return;
      const wanted = new Uint8Array(PART_IDS.length);
      for (const id of partIds) {
        const index = PART_INDEX[id];
        if (index !== undefined) wanted[index] = 1;
      }
      const attr = body.geometry.attributes[attribute] as THREE.BufferAttribute;
      const array = attr.array as Float32Array;
      for (let i = 0; i < array.length; i++) array[i] = wanted[body.labels[i]];
      attr.needsUpdate = true;
      invalidate();
    },
    [body, invalidate]
  );

  // Solid body material; the highlight is mixed into the surface colour.
  const baseMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({
      color: 0x8ab6dc, // Tint of the brand blue (#5798cf)
      roughness: 0.45,
      metalness: 0.04, // Low metalness keeps it clinical
      depthWrite: true,
      depthTest: true,
    });

    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uHoverIntensity = { value: 0.0 };
      shader.uniforms.uPaint = { value: 0.0 };
      shader.uniforms.uRim = { value: mat.userData.rim ?? 0.8 };
      mat.userData.shader = shader;

      shader.vertexShader = `
        attribute float aHover;
        attribute float aActive;
        attribute vec3 aPaint;
        varying float vHover;
        varying float vActive;
        varying vec3 vPaint;
        ${shader.vertexShader}
      `.replace(
        `#include <project_vertex>`,
        `
        vHover = aHover;
        vActive = aActive;
        vPaint = aPaint;
        #include <project_vertex>
        `
      );

      shader.fragmentShader = `
        uniform float uHoverIntensity;
        uniform float uPaint;
        uniform float uRim;
        varying float vHover;
        varying float vActive;
        varying vec3 vPaint;
        ${shader.fragmentShader}
      `.replace(
        `#include <opaque_fragment>`,
        `
        // Soft edge glow so the outline reads on light and dark backgrounds.
        float rim = 1.0 - abs(dot(normalize(normal), normalize(vViewPosition)));
        outgoingLight += vec3(0.62, 0.82, 0.98) * pow(rim, 2.0) * uRim;
        #include <opaque_fragment>
        `
      ).replace(
        `vec4 diffuseColor = vec4( diffuse, opacity );`,
        `
        vec4 diffuseColor = vec4( diffuse, opacity );

        // Parts lit by the chosen symptoms, and the part under the pointer /
        // currently selected. Weights are 0..1 across a boundary triangle.
        float glow = smoothstep(0.3, 0.7, vActive);
        float hoverGlow = smoothstep(0.3, 0.7, vHover) * uHoverIntensity;

        vec3 surfaceHover = vec3(0.05, 0.72, 0.52);     // Brand emerald: reads clearly on the blue body
        vec3 surfaceHighlight = vec3(1.0, 0.22, 0.35); // Crimson

        diffuseColor.rgb = mix(diffuseColor.rgb, surfaceHighlight, glow * 0.7);
        diffuseColor.rgb = mix(diffuseColor.rgb, surfaceHover, hoverGlow * 0.72);
        diffuseColor.rgb = mix(diffuseColor.rgb, vPaint, uPaint);
        `
      );
    };

    return mat;
  }, []);

  useEffect(() => {
    return () => {
      baseMaterial.dispose();
    };
  }, [baseMaterial]);

  // Dark mode: a deeper body tone and a softer rim, so the model doesn't glare
  // against the dark page.
  useEffect(() => {
    baseMaterial.color.set(dark ? 0x3f6f99 : 0x8ab6dc);
    baseMaterial.userData.rim = dark ? 0.35 : 0.8;
    if (baseMaterial.userData.shader) baseMaterial.userData.shader.uniforms.uRim.value = baseMaterial.userData.rim;
    invalidate();
  }, [dark, baseMaterial, invalidate]);

  // Symptoms → lit parts.
  useEffect(() => {
    paintWeights("aActive", activeParts);
  }, [activeParts, paintWeights]);

  // Hovered area/part, or the selected part while zoomed in.
  const highlightId = selectMode
    ? hoveredGroupId || (mode === "zoom" ? selectedSubRegionId : null)
    : null;
  useEffect(() => {
    // When the highlight clears, keep the last shape and let it fade out.
    if (highlightId) paintWeights("aHover", expandToParts(highlightId));
  }, [highlightId, paintWeights]);

  useEffect(() => {
    if (baseMaterial.userData.shader) {
      baseMaterial.userData.shader.uniforms.uPaint.value = paintParts ? 1 : 0;
    }
    invalidate();
  }, [paintParts, baseMaterial, invalidate]);

  // Per-frame update: rotation, camera framing, highlight fade

  useFrame(({ camera, size }, delta) => {
    if (!groupRef.current) return;

    // 1. Rotation handling
    if (!selectMode) {
      const speed = activeParts.length > 0 ? 0.04 : 0.12;
      groupRef.current.rotation.y += delta * speed;
      targetRotationYRef.current = groupRef.current.rotation.y;
    } else {
      groupRef.current.rotation.y = THREE.MathUtils.lerp(
        groupRef.current.rotation.y,
        targetRotationYRef.current,
        0.14
      );
    }

    // 2. Camera Dolly & Framing Transition (~400-600ms smooth lerp)
    // Dynamically derived from the actual runtime bounding box of Object_4 and current canvas aspect ratio.
    const cam = camera as THREE.PerspectiveCamera;
    const aspect = cam.aspect || (size.width / (size.height || 1)) || 1.0;
    const fovDeg = cam.fov || 45;
    const fovRad = THREE.MathUtils.degToRad(fovDeg);
    const tanHalfFov = Math.tan(fovRad / 2);

    // Dynamic metrics computed from Object_4 bounding box
    const centerY = meshBounds ? meshBounds.center.y : 2.235;
    const modelHeight = meshBounds ? meshBounds.size.y : 4.469;
    const modelRadiusXZ = meshBounds ? meshBounds.maxRadiusXZ : 1.88;

    // Responsive layout mode:
    // Narrow screens / mobile / portrait tablets: model is horizontally centered.
    // Wide desktop: model is positioned on the right side of the hero section so left-aligned text is unobstructed.
    const isMobileView = size.width < 768 || aspect < 1.15;

    // Vertical framing: 8% margin on desktop (5-10% range); 12% on mobile to comfortably clear header & dock
    const verticalPadding = isMobileView ? 0.12 : 0.08;
    const targetPaddedHeight = modelHeight / (1.0 - 2.0 * verticalPadding);
    const fitDistY = targetPaddedHeight / (2.0 * tanHalfFov);

    let defaultCamX = 0;
    let defaultLookX = 0;
    let defaultCamZ = fitDistY;

    if (!isMobileView) {
      // Base desktop offset is -1.25. If viewport is somewhat narrower (e.g. tablet landscape / small laptops),
      // scale offset dynamically so the model's rotating extents never get pushed beyond the right canvas edge.
      const safeHorizontalMargin = 0.06; // 6% margin from right screen edge
      const maxHalfWidthAtFitY = fitDistY * tanHalfFov * aspect;
      const maxAllowedOffset = Math.max(0, maxHalfWidthAtFitY * (1.0 - safeHorizontalMargin) - modelRadiusXZ);
      const effectiveDesktopOffsetX = -Math.min(1.25, maxAllowedOffset);

      defaultCamX = effectiveDesktopOffsetX;
      defaultLookX = effectiveDesktopOffsetX;

      // Ensure camera distance also accommodates horizontal footprint if aspect ratio is tighter
      const requiredHalfWidth = (Math.abs(effectiveDesktopOffsetX) + modelRadiusXZ) / (1.0 - safeHorizontalMargin);
      const fitDistXDesktop = requiredHalfWidth / (tanHalfFov * aspect);
      defaultCamZ = Math.max(fitDistY, fitDistXDesktop);
    } else {
      // Centered: ensure horizontal width fits with margin on narrow/mobile viewports
      const safeHorizontalMargin = 0.08; // 8% margin on each side
      const requiredHalfWidth = modelRadiusXZ / (1.0 - safeHorizontalMargin);
      const fitDistXMobile = requiredHalfWidth / (tanHalfFov * aspect);
      defaultCamZ = Math.max(fitDistY, fitDistXMobile);
    }

    const defaultCamY = centerY;
    const defaultLookY = centerY;

    // Immediately snap camera to computed default framing on initial frame (avoids jarring intro tween)
    if (!isCameraInitializedRef.current && meshBounds) {
      camera.position.set(defaultCamX, defaultCamY, defaultCamZ);
      cameraTargetRef.current.set(defaultLookX, defaultLookY, 0);
      camera.lookAt(cameraTargetRef.current);
      isCameraInitializedRef.current = true;
    }

    // Determine target framing for current mode
    let targetCamX = defaultCamX;
    let targetCamY = defaultCamY;
    let targetCamZ = defaultCamZ;
    let targetLookX = defaultLookX;
    let targetLookY = defaultLookY;

    if (mode === "zoom" && activeMajorId) {
      const major = getMajor(activeMajorId);
      if (major) {
        const focusY = body?.centerY[major.id] ?? centerY;
        targetLookY = focusY;
        targetCamY = focusY;
        if (chips) {
          // Phone chips layout: the chips take the right of the screen, so the
          // camera moves right and the body sits in the left part.
          targetCamZ = Math.max(major.zoom[1], CHIPS_ZOOM_DIST);
          targetCamX = targetLookX = targetCamZ * tanHalfFov * aspect * CHIPS_SHIFT;
        } else {
          // The list sits on the right on desktop; shift the camera so the
          // framed area is centred in the space that is left.
          targetCamX = isMobileView ? 0 : 0.60;
          targetLookX = isMobileView ? 0 : 0.60;
          // Never closer than ZOOM_MIN_DIST: the neighbouring areas must stay in
          // view so the user can tap straight across to them.
          targetCamZ = Math.max(
            major.zoom[isMobileView ? 1 : 0],
            ZOOM_MIN_DIST[isMobileView ? 1 : 0]
          );
        }
      }
    }

    if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
      (window as unknown as Record<string, unknown>).__cameraDebug = {
        mode,
        activeMajorId,
        isMobileView,
        size: { width: size.width, height: size.height },
        aspect: +aspect.toFixed(3),
        defaultCam: { x: +defaultCamX.toFixed(3), y: +defaultCamY.toFixed(3), z: +defaultCamZ.toFixed(3) },
        targetCam: { x: +targetCamX.toFixed(3), y: +targetCamY.toFixed(3), z: +targetCamZ.toFixed(3) },
        currentCam: { x: +camera.position.x.toFixed(3), y: +camera.position.y.toFixed(3), z: +camera.position.z.toFixed(3) },
        targetLook: { x: +targetLookX.toFixed(3), y: +targetLookY.toFixed(3) },
      };
    }

    const t = 1.0 - Math.exp(-6.0 * delta); // Smooth frame-rate independent exponential lerp (~500ms)

    camera.position.x = THREE.MathUtils.lerp(camera.position.x, targetCamX, t);
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, targetCamY, t);
    camera.position.z = THREE.MathUtils.lerp(camera.position.z, targetCamZ, t);

    cameraTargetRef.current.x = THREE.MathUtils.lerp(cameraTargetRef.current.x, targetLookX, t);
    cameraTargetRef.current.y = THREE.MathUtils.lerp(cameraTargetRef.current.y, targetLookY, t);
    cameraTargetRef.current.z = THREE.MathUtils.lerp(cameraTargetRef.current.z, 0, t);

    camera.lookAt(cameraTargetRef.current);

    // Highlight fade in/out
    const targetIntensity = highlightId ? 1.0 : 0.0;
    hoverIntensityRef.current = THREE.MathUtils.lerp(hoverIntensityRef.current, targetIntensity, 0.18);
    if (baseMaterial.userData.shader) {
      const u = baseMaterial.userData.shader.uniforms;
      u.uHoverIntensity.value = hoverIntensityRef.current;
      u.uPaint.value = paintParts ? 1 : 0;
    }
  });

  /** The body part of the triangle a pointer event landed on. */
  const hitFromEvent = (e: ThreeEvent<PointerEvent>): BodyHit | null => {
    if (!body || !e.face) return null;
    const { a, b, c } = e.face;
    const la = body.labels[a], lb = body.labels[b], lc = body.labels[c];
    const partId = PART_IDS[lb === lc ? lb : la];
    return { partId, majorId: PART_TO_MAJOR[partId] };
  };

  // Tap (pointer up without a drag): report the part under the finger.
  const handleMeshPointerUp = (e: ThreeEvent<PointerEvent>) => {
    if (!selectMode || isDraggingRef.current) return;
    e.stopPropagation();
    const hit = hitFromEvent(e);
    if (hit) onRegionClick(hit);
  };

  const handleMeshPointerMove = (e: ThreeEvent<PointerEvent>) => {
    if (!selectMode || isDraggingRef.current) return;
    if (
      typeof window !== "undefined" &&
      window.matchMedia &&
      !window.matchMedia("(hover: hover)").matches
    ) {
      return; // No hover on touch-only devices
    }
    const hit = hitFromEvent(e);
    if (!hit) return;
    // Whole area while choosing an area; single part once zoomed in.
    onRegionHover(mode === "zoom" ? hit.partId : hit.majorId);
  };

  const handleMeshPointerOut = () => {
    if (selectMode) onRegionHover(null);
  };

  if (!body) return null;

  return (
    <group ref={groupRef} position={[0, 0, 0]} scale={[1, 1, 1]}>
      <mesh
        geometry={body.geometry}
        material={baseMaterial}
        onPointerUp={handleMeshPointerUp}
        onPointerMove={handleMeshPointerMove}
        onPointerOut={handleMeshPointerOut}
      />
    </group>
  );
}


/* ─── Main Component ──────────────────────────────────────────── */

interface HumanBodyModelProps {
  activeSymptoms?: string[];
  onSymptomsChange?: (symptoms: string[]) => void;
  onSelectRegion?: (payload: RegionSelectionPayload) => void;
  /** Fires when body-selection mode opens or closes, so the page can give the model more room. */
  onSelectModeChange?: (active: boolean) => void;
  /** Where to render the picker list. Falls back to a panel over the model. */
  panelContainer?: HTMLElement | null;
  /** Called when the user presses Search inside the picker. */
  onSearchRequested?: () => void;
  /** Opens the full symptom list, filtered to the given area or part (null = everything). */
  onBrowseAll?: (areaId: string | null) => void;
  /**
   * "panel" (default, desktop): tap the model to start, symptoms in BodyPickerPanel.
   * "chips" (phones): the model is live from the start and the symptoms of the
   * tapped part appear as chips in a column beside the body.
   */
  variant?: "panel" | "chips";
  /** Chips variant: shown in the top-right corner while the whole body is in view. */
  cornerControl?: React.ReactNode;
  /** Which body to show (male or female mesh). */
  body?: BodyId;
}

export default function HumanBodyModel({
  activeSymptoms = [],
  onSymptomsChange,
  onSelectRegion,
  onSelectModeChange,
  panelContainer,
  onSearchRequested,
  onBrowseAll,
  variant = "panel",
  cornerControl,
  body = "male",
}: HumanBodyModelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(true);
  const dark = useTheme() === "dark";

  // The idle rotation is decoration. It runs for a few seconds after the page
  // loads or the pointer touches the model, then the canvas stops drawing
  // entirely until there is something new to show.
  const IDLE_SPIN_MS = 8000;
  const [awake, setAwake] = useState(true);
  const sleepTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wake = useCallback(() => {
    setAwake(true);
    if (sleepTimerRef.current) clearTimeout(sleepTimerRef.current);
    sleepTimerRef.current = setTimeout(() => setAwake(false), IDLE_SPIN_MS);
  }, []);
  useEffect(() => {
    sleepTimerRef.current = setTimeout(() => setAwake(false), IDLE_SPIN_MS);
    return () => {
      if (sleepTimerRef.current) clearTimeout(sleepTimerRef.current);
    };
  }, []);

  // Two-Tier Mode & Selection State
  // mode: "full" = full body major category proxies active; "zoom" = framed sub-region proxies active
  const chips = variant === "chips";
  // Phones: the body is the whole page, so it can be tapped straight away.
  const [selectMode, setSelectMode] = useState(chips);
  useEffect(() => {
    onSelectModeChange?.(selectMode);
  }, [selectMode, onSelectModeChange]);
  const [mode, setMode] = useState<"full" | "zoom">("full");
  const [activeMajorId, setActiveMajorId] = useState<string | null>(null);
  const [activeSubRegionId, setActiveSubRegionId] = useState<string | null>(null);
  const [hoveredGroupId, setHoveredGroupId] = useState<string | null>(null);
  const [, setSearchQuery] = useState("");
  const [, setIsExpanded] = useState(false);

  // Dev only: colour every body part differently to check the boundaries.
  const [paintParts, setPaintParts] = useState(false);

  // Drag rotation & snap refs
  const targetRotationYRef = useRef<number>(0);
  const isDraggingRef = useRef<boolean>(false);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const lastPointerXRef = useRef<number>(0);

  // Snapshot of rotation angle on entering zoom mode to constrain drag-rotate
  const zoomBaseRotationRef = useRef<number>(0);

  // Viewport observer
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setInView(entry.isIntersecting);
      },
      { threshold: 0.05 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Symptom → body area, from the knowledge base (loaded once, shared with the symptom browser).
  const catalog = useSymptomCatalog();
  const activeParts = useMemo(
    () => getActiveParts(activeSymptoms, catalog?.areasByTerm ?? null),
    [activeSymptoms, catalog]
  );

  // Determine current orientation state (front vs back)
  const [isBackView, setIsBackView] = useState(false);

  // Snap to anterior (front) view: nearest multiple of 2π
  const snapToFront = useCallback(() => {
    const current = targetRotationYRef.current;
    targetRotationYRef.current = Math.round(current / (2 * Math.PI)) * (2 * Math.PI);
    zoomBaseRotationRef.current = targetRotationYRef.current;
    setIsBackView(false);
  }, []);

  // Snap to posterior (back) view: nearest odd multiple of π
  const snapToBack = useCallback(() => {
    const current = targetRotationYRef.current;
    targetRotationYRef.current =
      Math.round((current - Math.PI) / (2 * Math.PI)) * (2 * Math.PI) + Math.PI;
    zoomBaseRotationRef.current = targetRotationYRef.current;
    setIsBackView(true);
  }, []);

  // Enter Select Mode: pauses auto-rotation, snaps to anterior, initializes full mode
  const handleEnterSelectMode = () => {
    setSelectMode(true);
    setMode("full");
    setActiveMajorId(null);
    setActiveSubRegionId(null);
    setHoveredGroupId(null);
    snapToFront();
  };


  const handleBackToFullMode = useCallback(() => {
    setMode("full");
    setActiveMajorId(null);
    setActiveSubRegionId(null);
    setHoveredGroupId(null);
    setSearchQuery("");
    setIsExpanded(false);
  }, []);

  // Select Major Section from UI dock or 3D click
  const handleSelectMajor = useCallback((major: MajorRegion, partId?: string) => {
    // Every area zooms in, including the ones that are a single part (neck,
    // back of the head), so a tap on them from another area never zooms out.
    // A tap on the body lands on a specific part; open that one.
    const part = major.subRegions?.length
      ? (major.subRegions.find((s) => s.id === partId) ?? major.subRegions[0]).id
      : major.id;
    setMode("zoom");
    setActiveMajorId(major.id);
    setActiveSubRegionId(part);
    onSelectRegion?.({ majorId: major.id, subRegionId: part });
    setSearchQuery("");
    setIsExpanded(false);
    zoomBaseRotationRef.current = targetRotationYRef.current;

    // Areas listed on both sides (arms, neck) keep whichever side is showing.
    if (major.view === "back") snapToBack();
    else if (major.view === "front") snapToFront();
  }, [onSelectRegion, snapToBack, snapToFront]);

  // A tap on the 3D body
  const handleRegionClick = useCallback(
    (hit: BodyHit) => {
      const major = getMajor(hit.majorId);
      if (!major) return;
      // The pointer has not moved, so the area-wide hover would otherwise stay lit.
      setHoveredGroupId(null);
      if (mode === "full" || hit.majorId !== activeMajorId) {
        // First tap, or a tap on a different area while zoomed in.
        handleSelectMajor(major, hit.partId);
        return;
      }
      onSelectRegion?.({ majorId: hit.majorId, subRegionId: hit.partId });
      setActiveSubRegionId(hit.partId);
      setSearchQuery("");
      setIsExpanded(false);
    },
    [mode, activeMajorId, handleSelectMajor, onSelectRegion]
  );

  // Toggle symptom in shared activeSymptoms array
  const toggleSymptom = (symptomId: string) => {
    if (!onSymptomsChange) return;
    if (activeSymptoms.includes(symptomId)) {
      onSymptomsChange(activeSymptoms.filter((s) => s !== symptomId));
    } else {
      onSymptomsChange([...activeSymptoms, symptomId]);
    }
  };

  /**
   * Canvas Drag-to-Rotate handlers:
   * - In FULL MODE: standard drag rotation across 360 degrees.
   * - In ZOOM MODE: drag rotation remains enabled but is damped & constrained (soft-clamped to ±35°)
   *   so the user can inspect anatomical 3D depth without losing the framed region from view.
   */
  const handlePointerDown = (e: React.PointerEvent) => {
    if (!selectMode) return;
    pointerStartRef.current = { x: e.clientX, y: e.clientY };
    lastPointerXRef.current = e.clientX;
    isDraggingRef.current = false;
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!selectMode || !pointerStartRef.current) return;
    const dx = e.clientX - lastPointerXRef.current;
    const dist = Math.hypot(
      e.clientX - pointerStartRef.current.x,
      e.clientY - pointerStartRef.current.y
    );

    if (dist > 5) {
      isDraggingRef.current = true;
      if (mode === "zoom") {
        // Damped sensitivity in zoom mode
        const zoomDelta = dx * 0.0035;
        const newRot = targetRotationYRef.current + zoomDelta;
        // Constrain to ±0.65 radians (~37°) around the framed orientation
        const baseRot = zoomBaseRotationRef.current;
        targetRotationYRef.current = THREE.MathUtils.clamp(
          newRot,
          baseRot - 0.65,
          baseRot + 0.65
        );
      } else {
        targetRotationYRef.current += dx * 0.008;
        const normAngle =
          ((targetRotationYRef.current % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        const back = normAngle >= Math.PI / 2 && normAngle <= (3 * Math.PI) / 2;
        setIsBackView((prev) => (prev !== back ? back : prev));
      }
      lastPointerXRef.current = e.clientX;
    }
  };

  const handlePointerUp = () => {
    if (!selectMode) return;
    setTimeout(() => {
      isDraggingRef.current = false;
      pointerStartRef.current = null;
    }, 60);
  };

  // Active sub-region data
  const subRegionData = activeSubRegionId ? REGION_SYMPTOMS[activeSubRegionId] : null;
  const activeMajor = activeMajorId ? REGION_HIERARCHY.find((m) => m.id === activeMajorId) : null;

  // Filter symptoms based on local search query
  const visibleMajors = useMemo(() => {
    const view = isBackView ? "back" : "front";
    return REGION_HIERARCHY.filter((m) => m.view === view || m.view === "both");
  }, [isBackView]);

  const exitSelectMode = () => {
    setSelectMode(false);
    setMode("full");
    setActiveMajorId(null);
    setActiveSubRegionId(null);
    setHoveredGroupId(null);
  };

  // More symptoms for the open part, straight from the knowledge base: the
  // most widely shared ones that the hand-written list above does not show.
  const moreSymptoms = useMemo(() => {
    if (!catalog || !subRegionData || !activeSubRegionId) return [];
    const listed = new Set(
      [...subRegionData.topSymptoms, ...(subRegionData.secondarySymptoms ?? [])].map((s) => s.id)
    );
    const parts = new Set(expandToParts(activeSubRegionId));
    return catalog.symptoms
      .filter(
        (s) =>
          !listed.has(s.name) &&
          s.bodyAreas.some((a) => a === activeSubRegionId || parts.has(a))
      )
      .slice(0, 8)
      .map((s) => ({ id: s.name, name: s.name.charAt(0).toUpperCase() + s.name.slice(1) }));
  }, [catalog, subRegionData, activeSubRegionId]);

  // How many of the picked symptoms belong to each area, for the area chips.
  const countsByArea = useMemo(() => {
    const counts: Record<string, number> = {};
    const areasByTerm = catalog?.areasByTerm ?? null;
    for (const s of activeSymptoms) {
      const majors = new Set(getActiveParts([s], areasByTerm).map((p) => PART_TO_MAJOR[p]));
      majors.forEach((m) => (counts[m] = (counts[m] ?? 0) + 1));
    }
    return counts;
  }, [activeSymptoms, catalog]);

  const pickerPanel = (
    <BodyPickerPanel
      countsByArea={countsByArea}
      moreSymptoms={moreSymptoms}
      onBrowseAll={
        onBrowseAll ? () => onBrowseAll(activeSubRegionId ?? activeMajorId ?? null) : undefined
      }
      isBackView={isBackView}
      onShowFront={snapToFront}
      onShowBack={snapToBack}
      areas={visibleMajors}
      activeArea={activeMajor ?? null}
      activePartId={activeSubRegionId}
      region={subRegionData}
      onSelectArea={handleSelectMajor}
      onSelectPart={(partId) => {
        if (activeMajor) onSelectRegion?.({ majorId: activeMajor.id, subRegionId: partId });
        setActiveSubRegionId(partId);
      }}
      onBackToAreas={handleBackToFullMode}
      onHoverRegion={setHoveredGroupId}
      selectedSymptoms={activeSymptoms}
      onToggleSymptom={toggleSymptom}
      onClear={() => onSymptomsChange?.([])}
      onClose={exitSelectMode}
      onSearch={() => {
        exitSelectMode();
        onSearchRequested?.();
      }}
    />
  );

  return (
    <div
      ref={containerRef}
      className={`human-body-canvas-wrapper absolute inset-0 ${
        selectMode
          ? `z-0 pointer-events-auto ${hoveredGroupId ? "cursor-pointer" : "cursor-grab active:cursor-grabbing"}`
          : "z-0 pointer-events-auto"
      }`}
      style={{ opacity: 0.85 }}
      onPointerEnter={wake}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {/* ─── Three.js WebGL Canvas ─────────────────────────────── */}
      <Canvas
        camera={{ position: [-1.25, 2.235, 6.38], fov: 45 }}
        dpr={[1, 1.5]}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: "low-power",
        }}
        style={{ background: "transparent" }}
        frameloop="demand"
        onPointerMissed={() => {
          // Phones: a tap beside the body closes the chips and shows the whole body again.
          if (chips && !isDraggingRef.current && mode === "zoom") handleBackToFullMode();
        }}
      >
        <FrameDriver
          active={inView && (selectMode || awake)}
          fps={selectMode ? 60 : 30}
          redrawKey={activeParts}
        />
        {/* Dimmer light in dark mode so the body doesn't glare. */}
        <ambientLight intensity={dark ? 0.85 : 1.8} />
        <directionalLight position={[4, 8, 5]} intensity={dark ? 0.95 : 1.3} color="#ffffff" />
        <directionalLight position={[-4, 2, 3]} intensity={dark ? 0.45 : 0.7} color="#e0eeff" />
        <directionalLight position={[0, -4, 2]} intensity={dark ? 0.2 : 0.4} color="#fff8eb" />
        <directionalLight position={[0, 4, -5]} intensity={dark ? 0.4 : 0.6} color="#dbe8ff" />
        <Suspense fallback={null}>
          <RotatingBody
            key={body}
            bodyId={body}
            activeParts={activeParts}
            selectMode={selectMode}
            mode={mode}
            activeMajorId={activeMajorId}
            selectedSubRegionId={activeSubRegionId}
            hoveredGroupId={hoveredGroupId}
            targetRotationYRef={targetRotationYRef}
            isDraggingRef={isDraggingRef}
            onRegionClick={handleRegionClick}
            onRegionHover={setHoveredGroupId}
            paintParts={paintParts}
            dark={dark}
            chips={chips}
          />
        </Suspense>
      </Canvas>

      {/* ─── Dev only: colour each body part to check the boundaries ─── */}
      {process.env.NODE_ENV !== "production" && !chips && (
        <button
          type="button"
          onClick={() => setPaintParts((v) => !v)}
          className={`absolute top-4 left-4 z-40 pointer-events-auto px-3 py-1.5 rounded-xl text-[11px] font-mono font-bold shadow-md border ${
            paintParts
              ? "bg-amber-500 text-white border-amber-600"
              : "bg-slate-900/85 text-slate-200 border-slate-700"
          }`}
          title="Dev only: colour every body part differently"
          id="dev-paint-parts-toggle"
        >
          Paint parts: {paintParts ? "ON" : "OFF"}
        </button>
      )}

      {/* ─── Idle: the whole model is one big button ─────────────── */}
      {!selectMode && (
        <>
          <button
            type="button"
            onClick={handleEnterSelectMode}
            className="absolute inset-0 z-10 cursor-pointer"
            aria-label="Choose symptoms by tapping the body"
            id="enter-select-mode-button"
          />
          <div className="absolute bottom-4 inset-x-0 flex justify-center pointer-events-none z-20">
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/95 border border-brand/30 shadow-md text-sm font-semibold text-brand-ink">
              <IconCrosshair size={16} className="text-brand" />
              Tap the body to choose where it hurts
            </span>
          </div>
        </>
      )}

      {/* ─── Phones: back to the whole body, front/back, and the chips ─── */}
      {chips && (
        <BodyChips
          zoomed={mode === "zoom"}
          isBackView={isBackView}
          onShowFront={snapToFront}
          onShowBack={snapToBack}
          onFullBody={handleBackToFullMode}
          region={subRegionData}
          selectedSymptoms={activeSymptoms}
          onToggleSymptom={toggleSymptom}
          onMore={onBrowseAll && activeSubRegionId ? () => onBrowseAll(activeSubRegionId) : undefined}
          cornerControl={cornerControl}
        />
      )}

      {/* ─── Picking: one panel, rendered where the page wants it ─── */}
      {selectMode && !chips &&
        (panelContainer ? (
          createPortal(pickerPanel, panelContainer)
        ) : (
          <div className="absolute right-3 top-3 bottom-3 w-[min(24rem,calc(100%-1.5rem))] z-20 pointer-events-auto">
            {pickerPanel}
          </div>
        ))}
    </div>
  );
}

useGLTF.preload(BODY_MODEL_URL.male);
useGLTF.preload(BODY_MODEL_URL.female);
