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
  RegionProxy,
  RegionSelectionPayload,
  getRegionProxyPoints,
  getRegionCentroid,
  createRegionGroup,
} from "./regionHierarchy";
import RegionDebugOverlay from "./RegionDebugOverlay";
import BodyPickerPanel from "./BodyPickerPanel";
import { WireLevel, nextWireLevel, thinToTriangleBudget } from "./meshDensity";
import { createPortal } from "react-dom";

export type { SubRegion, MajorRegion, RegionSelectionPayload, RegionProxy };

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

export interface BodyPoint {
  pos: [number, number, number];
  radius: number;
}

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

const KEYWORD_RULES = [
  { match: ["head", "migraine", "sensorium", "dizziness", "spinning", "concentration", "unsteadiness", "vertigo", "coma", "fever", "fatigue", "lethargy", "malaise", "anxiety", "depression", "irritability", "mood", "shivering", "chills", "sweating", "restlessness", "family_history", "toxic_look", "balance"], regions: ["head", "forehead"] },
  { match: ["scalp", "hair", "alopecia", "dandruff"], regions: ["scalp"] },
  { match: ["eye", "vision", "seeing", "blind", "pupil", "teary", "watering_from_eyes", "visual"], regions: ["eyes"] },
  { match: ["nose", "sneez", "sinus", "smell", "rhinorrhea"], regions: ["nose", "forehead"] },
  { match: ["tongue", "lip", "speech", "mouth", "face", "cheek"], regions: ["face", "mouth"] },
  { match: ["jaw", "tmj", "chewing", "mandible"], regions: ["jaw"] },
  { match: ["ear", "hearing", "tinnitus", "ringing", "vertigo"], regions: ["ears"] },
  { match: ["throat", "cough", "sputum", "phlegm", "thyroid", "swallow"], regions: ["neck", "upper_chest"] },
  { match: ["neck", "cervical", "lymph", "goiter"], regions: ["neck"] },
  { match: ["chest", "heart", "breath", "lung", "palpitation", "congestion"], regions: ["chest", "chest_core", "upper_chest"] },
  { match: ["breast", "mastalgia", "mammary", "nipple"], regions: ["breast"] },
  { match: ["stomach", "abdom", "belly", "nausea", "vomit", "digest", "acidity", "appetite", "hunger", "liver", "gas", "weight", "sugar", "obesity", "alcohol", "dehydration", "fluid"], regions: ["abdomen", "epigastric", "upper_abdomen", "lower_abdomen"] },
  { match: ["epigastric", "heartburn", "acid_reflux"], regions: ["epigastric"] },
  { match: ["pelvis", "urin", "pee", "micturition", "bladder", "bowel", "stool", "anus", "anal", "diarrh", "constipat", "menstruat", "polyuria", "extra_marital"], regions: ["pelvic", "above_pubic_bone", "pelvic_core", "genital"] },
  { match: ["groin", "inguinal"], regions: ["groin"] },
  { match: ["back", "spine", "lumbago", "sciatica"], regions: ["back", "lower_back", "upper_back", "middle_back"] },
  { match: ["flank", "kidney", "renal"], regions: ["flank"] },
  { match: ["buttock", "gluteal", "piriformis"], regions: ["buttocks", "buttocks_core"] },
  { match: ["hip", "trochanter", "pelvic_girdle"], regions: ["hips"] },
  { match: ["rectum", "anal", "hemorrhoid"], regions: ["rectum"] },
  { match: ["tailbone", "coccyx"], regions: ["tailbone"] },
  { match: ["shoulder", "rotator", "deltoid"], regions: ["shoulder"] },
  { match: ["armpit", "axilla"], regions: ["armpit"] },
  { match: ["bicep", "tricep", "upper_arm"], regions: ["upper_arm"] },
  { match: ["elbow", "olecranon"], regions: ["elbow"] },
  { match: ["forearm"], regions: ["forearm"] },
  { match: ["wrist", "carpal"], regions: ["wrist"] },
  { match: ["hand", "finger", "wrist", "nail"], regions: ["hand", "fingers"] },
  { match: ["arm", "injection", "transfusion"], regions: ["arms"] },
  { match: ["thigh", "quadriceps", "hamstring"], regions: ["thigh", "hamstring"] },
  { match: ["knee", "patella", "popliteal"], regions: ["knee", "popliteal"] },
  { match: ["shin", "tibia"], regions: ["shin"] },
  { match: ["calf", "calves", "vein", "cramp"], regions: ["calf", "legs_back"] },
  { match: ["ankle", "malleolus"], regions: ["ankle"] },
  { match: ["foot", "feet", "heel", "toe", "walk", "podagra"], regions: ["foot", "toes"] },
  { match: ["joint", "stiffness"], regions: ["knee", "fingers", "wrist", "shoulder"] },
  { match: ["muscle"], regions: ["arms", "thigh", "calf"] },
  { match: ["limb", "one_body_side", "bruising"], regions: ["arms", "legs"] },
  { match: ["leg"], regions: ["legs", "thigh", "calf"] },
  { match: ["extremeties"], regions: ["hand", "foot"] },
  { match: ["vessel"], regions: ["calf", "arms"] },
  { match: ["rash", "itch", "blister", "pimple", "spot", "peel", "scur", "patch", "crust", "skin", "silver"], regions: ["chest", "arms"] },
];

/**
 * Maps active symptoms to 3D body points using the new REGION_HIERARCHY.
 * Bilateral pairs feed BOTH sides into active points so both illuminate simultaneously.
 */
function getActivePoints(symptoms: string[]): BodyPoint[] {
  if (!symptoms || symptoms.length === 0) return [];
  const points: BodyPoint[] = [];
  const matchedRegionIds = new Set<string>();

  symptoms.forEach((s) => {
    const lowerS = s.toLowerCase().replace(/_/g, " ");
    for (const rule of KEYWORD_RULES) {
      for (const kw of rule.match) {
        if (lowerS.includes(kw) || s.toLowerCase().includes(kw)) {
          rule.regions.forEach((r) => matchedRegionIds.add(r));
        }
      }
    }
  });

  matchedRegionIds.forEach((regionId) => {
    const proxyData = getRegionProxyPoints(regionId);
    if (proxyData) {
      proxyData.points.forEach((pos) => {
        points.push({ pos, radius: proxyData.radius });
      });
    }
  });

  return points.slice(0, 10);
}

/* ─── Rotating 3D Body Mesh Component ────────────────────────── */

interface RotatingBodyProps {
  activePoints: BodyPoint[];
  selectMode: boolean;
  mode: "full" | "zoom";
  activeMajorId: string | null;
  selectedSubRegionId: string | null;
  hoveredGroupId: string | null;
  isBackView: boolean;
  targetRotationYRef: React.MutableRefObject<number>;
  isDraggingRef: React.MutableRefObject<boolean>;
  onRegionClick: (proxy: RegionProxy) => void;
  onRegionHover: (groupId: string | null) => void;
  debugMode?: boolean;
  debugFilter?: "current" | "all";
}

function RotatingBody({
  activePoints,
  selectMode,
  mode,
  activeMajorId,
  selectedSubRegionId,
  hoveredGroupId,
  isBackView,
  targetRotationYRef,
  isDraggingRef,
  onRegionClick,
  onRegionHover,
  debugMode = false,
  debugFilter = "current",
}: RotatingBodyProps) {
  const groupRef = useRef<THREE.Group>(null!);
  const { camera, raycaster, pointer } = useThree();
  const { scene } = useGLTF("/human_body.glb");
  const activePointsRef = useRef<BodyPoint[]>(activePoints);
  const hoverIntensityRef = useRef<number>(0);
  const cameraTargetRef = useRef(new THREE.Vector3(-1.25, 2.235, 0));
  const isCameraInitializedRef = useRef<boolean>(false);

  useEffect(() => {
    activePointsRef.current = activePoints;
  }, [activePoints]);

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

  // Bake world transformation matrix into geometry once
  const bakedGeometry = useMemo(() => {
    const mesh = scene.getObjectByName("Object_4") as THREE.Mesh | undefined;
    if (!mesh) return null;
    scene.updateMatrixWorld(true);
    const geo = mesh.geometry.clone();
    geo.applyMatrix4(mesh.matrixWorld);
    geo.computeVertexNormals();
    return geo;
  }, [scene]);

  // Thinner copies of the mesh for the wireframe when the figure is small on screen.
  const wireGeometries = useMemo(() => {
    if (!bakedGeometry) return null;
    return {
      full: bakedGeometry,
      mid: thinToTriangleBudget(bakedGeometry, 9000),
      low: thinToTriangleBudget(bakedGeometry, 3000),
    } satisfies Record<WireLevel, THREE.BufferGeometry>;
  }, [bakedGeometry]);
  const [wireLevel, setWireLevel] = useState<WireLevel>("mid");
  const wireLevelRef = useRef<WireLevel>("mid");

  useEffect(() => {
    return () => {
      bakedGeometry?.dispose();
    };
  }, [bakedGeometry]);

  // Helper to sync uniforms without per-frame traversals
  const syncUniforms = useCallback((shader: { uniforms: Record<string, THREE.IUniform> }, points: BodyPoint[]) => {
    if (!shader || !shader.uniforms) return;
    const count = Math.min(points.length, 10);
    shader.uniforms.uNumActivePoints.value = count;
    for (let i = 0; i < 10; i++) {
      if (i < count) {
        shader.uniforms.uActivePoints.value[i].set(...points[i].pos);
        shader.uniforms.uActiveRadii.value[i] = points[i].radius;
      } else {
        shader.uniforms.uActivePoints.value[i].set(0, -999, 0);
        shader.uniforms.uActiveRadii.value[i] = 0;
      }
    }
  }, []);

  // Solid opaque alabaster base material with illuminated surface highlights (100% opaque)
  const baseMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({
      color: 0xf7f5ee, // Bright luminous warm alabaster / ivory base
      roughness: 0.32, // Satin porcelain sheen
      metalness: 0.04, // Low metalness keeps it clinical
      depthWrite: true,
      depthTest: true,
      polygonOffset: true,
      polygonOffsetFactor: 1, // Pushes base slightly back so wireframe lines never z-fight
      polygonOffsetUnits: 1,
    });

    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uActivePoints = {
        value: Array.from({ length: 10 }, () => new THREE.Vector3(0, -999, 0)),
      };
      shader.uniforms.uActiveRadii = {
        value: new Float32Array(10),
      };
      shader.uniforms.uNumActivePoints = { value: 0 };

      // Bilateral-ready hover highlight uniforms (up to 2 points for left/right pairs)
      shader.uniforms.uHoverPoints = {
        value: [new THREE.Vector3(0, -999, 0), new THREE.Vector3(0, -999, 0)],
      };
      shader.uniforms.uNumHoverPoints = { value: 0 };
      shader.uniforms.uHoverRadius = { value: 0.0 };
      shader.uniforms.uHoverIntensity = { value: 0.0 };

      mat.userData.shader = shader;
      syncUniforms(shader, activePointsRef.current);

      shader.vertexShader = `
        varying vec3 vBakedPosition;
        ${shader.vertexShader}
      `.replace(
        `#include <project_vertex>`,
        `
        vBakedPosition = position;
        #include <project_vertex>
        `
      );

      shader.fragmentShader = `
        uniform vec3 uActivePoints[10];
        uniform float uActiveRadii[10];
        uniform int uNumActivePoints;

        uniform vec3 uHoverPoints[2];
        uniform int uNumHoverPoints;
        uniform float uHoverRadius;
        uniform float uHoverIntensity;

        varying vec3 vBakedPosition;
        ${shader.fragmentShader}
      `.replace(
        `vec4 diffuseColor = vec4( diffuse, opacity );`,
        `
        vec4 diffuseColor = vec4( diffuse, opacity );

        // 1. Selected symptom glow
        float glow = 0.0;
        for (int i = 0; i < 10; i++) {
          if (i >= uNumActivePoints) break;
          float dist = distance(vBakedPosition, uActivePoints[i]);
          float radius = uActiveRadii[i];
          float intensity = smoothstep(radius, radius * 0.25, dist);
          glow = max(glow, intensity);
        }
        glow = clamp(glow, 0.0, 1.0);

        // 2. Real-time hover glow (Electric Cyan, simultaneously illuminates both sides if bilateral)
        float hoverGlow = 0.0;
        if (uHoverRadius > 0.0 && uHoverIntensity > 0.001) {
          for (int i = 0; i < 2; i++) {
            if (i >= uNumHoverPoints) break;
            float hoverDist = distance(vBakedPosition, uHoverPoints[i]);
            float intensity = smoothstep(uHoverRadius, uHoverRadius * 0.2, hoverDist) * uHoverIntensity;
            hoverGlow = max(hoverGlow, intensity);
          }
          hoverGlow = clamp(hoverGlow, 0.0, 1.0);
        }

        vec3 surfaceHover = vec3(0.18, 0.78, 0.98);     // Radiant electric cyan wash
        vec3 surfaceHighlight = vec3(1.0, 0.22, 0.35); // Radiant crimson wash

        diffuseColor.rgb = mix(diffuseColor.rgb, surfaceHover, hoverGlow * 0.45);
        diffuseColor.rgb = mix(diffuseColor.rgb, surfaceHighlight, glow * 0.55);
        `
      );
    };

    return mat;
  }, [syncUniforms]);

  useEffect(() => {
    return () => {
      baseMaterial.dispose();
    };
  }, [baseMaterial]);

  // Glowing wireframe material with custom shader supporting bilateral hover highlights
  const wireMaterial = useMemo(() => {
    const mat = new THREE.MeshBasicMaterial({
      color: 0x5a7ecb, // Refined slate cobalt wireframe lines
      wireframe: true,
      transparent: true,
      opacity: 0.65,
      depthTest: true,
    });

    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uActivePoints = {
        value: Array.from({ length: 10 }, () => new THREE.Vector3(0, -999, 0)),
      };
      shader.uniforms.uActiveRadii = {
        value: new Float32Array(10),
      };
      shader.uniforms.uNumActivePoints = { value: 0 };

      // Dedicated bilateral-ready hover uniforms
      shader.uniforms.uHoverPoints = {
        value: [new THREE.Vector3(0, -999, 0), new THREE.Vector3(0, -999, 0)],
      };
      shader.uniforms.uNumHoverPoints = { value: 0 };
      shader.uniforms.uHoverRadius = { value: 0.0 };
      shader.uniforms.uHoverIntensity = { value: 0.0 };

      mat.userData.shader = shader;
      syncUniforms(shader, activePointsRef.current);

      shader.vertexShader = `
        varying vec3 vBakedPosition;
        ${shader.vertexShader}
      `.replace(
        `#include <project_vertex>`,
        `
        vBakedPosition = position;
        #include <project_vertex>
        `
      );

      shader.fragmentShader = `
        uniform vec3 uActivePoints[10];
        uniform float uActiveRadii[10];
        uniform int uNumActivePoints;

        uniform vec3 uHoverPoints[2];
        uniform int uNumHoverPoints;
        uniform float uHoverRadius;
        uniform float uHoverIntensity;

        varying vec3 vBakedPosition;
        ${shader.fragmentShader}
      `.replace(
        `vec4 diffuseColor = vec4( diffuse, opacity );`,
        `
        vec3 baseColor = diffuse;

        // 1. Selected symptom glow (Neon Crimson Red)
        float glow = 0.0;
        for (int i = 0; i < 10; i++) {
          if (i >= uNumActivePoints) break;
          float dist = distance(vBakedPosition, uActivePoints[i]);
          float radius = uActiveRadii[i];
          float intensity = smoothstep(radius, radius * 0.25, dist);
          glow = max(glow, intensity);
        }
        glow = clamp(glow, 0.0, 1.0);

        // 2. Real-time hover glow (Ultra-bright Electric Cyan, illuminates both sides if bilateral)
        float hoverGlow = 0.0;
        if (uHoverRadius > 0.0 && uHoverIntensity > 0.001) {
          for (int i = 0; i < 2; i++) {
            if (i >= uNumHoverPoints) break;
            float hoverDist = distance(vBakedPosition, uHoverPoints[i]);
            float intensity = smoothstep(uHoverRadius, uHoverRadius * 0.2, hoverDist) * uHoverIntensity;
            hoverGlow = max(hoverGlow, intensity);
          }
          hoverGlow = clamp(hoverGlow, 0.0, 1.0);
        }

        vec3 highlightColor = vec3(1.0, 0.12, 0.25); // Intense Neon Crimson Red
        vec3 hoverColor = vec3(0.0, 0.90, 1.0);       // Ultra-bright Electric Cyan

        vec3 colorWithHover = mix(baseColor, hoverColor, hoverGlow * 0.95);
        vec3 finalColor = mix(colorWithHover, highlightColor, glow);
        float finalOpacity = mix(opacity, 1.0, max(hoverGlow * 0.9, glow));

        vec4 diffuseColor = vec4( finalColor, finalOpacity );
        `
      );
    };

    return mat;
  }, [syncUniforms]);

  useEffect(() => {
    return () => {
      wireMaterial.dispose();
    };
  }, [wireMaterial]);

  // Update uniforms strictly when activePoints changes
  useEffect(() => {
    if (wireMaterial.userData.shader) {
      syncUniforms(wireMaterial.userData.shader, activePoints);
    }
    if (baseMaterial.userData.shader) {
      syncUniforms(baseMaterial.userData.shader, activePoints);
    }
  }, [activePoints, wireMaterial, baseMaterial, syncUniforms]);

  // Per-frame update: rotation, camera dolly framing transition, and bilateral highlight shader sync
  useFrame(({ camera, size }, delta) => {
    if (!groupRef.current) return;

    // 1. Rotation handling
    if (!selectMode) {
      const speed = activePoints.length > 0 ? 0.04 : 0.12;
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
      const major = REGION_HIERARCHY.find((m) => m.id === activeMajorId);
      if (major) {
        // In ZOOM MODE: Inspector drawer opens on the right side of the screen.
        // Shift camera X to +0.60 so the framed body region sits at relative X = -0.60
        // (centered cleanly in the unobstructed left ~65% of the viewport).
        targetCamX = isMobileView ? 0 : 0.60;
        targetLookX = isMobileView ? 0 : 0.60;
        const majorCentroid = getRegionCentroid(major.volumes);
        targetLookY = majorCentroid[1];
        targetCamY = majorCentroid[1];

        // Hand-tuned framing distance per major category
        switch (major.id) {
          case "head":
          case "head_back":
            targetCamZ = isMobileView ? 2.5 : 2.1;
            break;
          case "neck":
            targetCamZ = isMobileView ? 2.4 : 2.0;
            break;
          case "chest":
            targetCamZ = isMobileView ? 2.8 : 2.4;
            break;
          case "abdomen":
            targetCamZ = isMobileView ? 2.9 : 2.5;
            break;
          case "arms": // Bilateral major: frame both arms comfortably in view
            targetCamZ = isMobileView ? 4.2 : 3.8;
            break;
          case "pelvic":
            targetCamZ = isMobileView ? 2.6 : 2.2;
            break;
          case "legs": // Bilateral major: frame both legs comfortably in view
          case "legs_back":
            targetCamZ = isMobileView ? 3.8 : 3.4;
            targetLookY = 1.05;
            targetCamY = 1.05;
            break;
          case "back":
            targetCamZ = isMobileView ? 3.2 : 2.8;
            break;
          case "buttocks":
            targetCamZ = isMobileView ? 2.8 : 2.4;
            break;
          default:
            targetCamZ = isMobileView ? 3.2 : 2.8;
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

    // Wireframe density follows how tall the figure is on screen.
    const distance = Math.max(0.1, camera.position.z);
    const figureHeightPx = (modelHeight / (2 * tanHalfFov * distance)) * size.height;
    const level = nextWireLevel(wireLevelRef.current, figureHeightPx);
    if (level !== wireLevelRef.current) {
      wireLevelRef.current = level;
      setWireLevel(level);
    }

    const t = 1.0 - Math.exp(-6.0 * delta); // Smooth frame-rate independent exponential lerp (~500ms)

    camera.position.x = THREE.MathUtils.lerp(camera.position.x, targetCamX, t);
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, targetCamY, t);
    camera.position.z = THREE.MathUtils.lerp(camera.position.z, targetCamZ, t);

    cameraTargetRef.current.x = THREE.MathUtils.lerp(cameraTargetRef.current.x, targetLookX, t);
    cameraTargetRef.current.y = THREE.MathUtils.lerp(cameraTargetRef.current.y, targetLookY, t);
    cameraTargetRef.current.z = THREE.MathUtils.lerp(cameraTargetRef.current.z, 0, t);

    camera.lookAt(cameraTargetRef.current);

    // 3. Bilateral Highlight Shader Driver (Hover & Selection Glow)
    // Priority: real-time hovered region > selected sub-region
    const activeHighlightId = hoveredGroupId || (mode === "zoom" ? selectedSubRegionId : null);
    const highlightData = activeHighlightId ? getRegionProxyPoints(activeHighlightId) : null;
    const hasHighlight = Boolean(selectMode && highlightData);

    const targetIntensity = hasHighlight ? 1.0 : 0.0;
    hoverIntensityRef.current = THREE.MathUtils.lerp(
      hoverIntensityRef.current,
      targetIntensity,
      0.18
    );

    // Sync to wireframe shader
    if (wireMaterial.userData.shader) {
      const s = wireMaterial.userData.shader;
      s.uniforms.uHoverIntensity.value = hoverIntensityRef.current;
      if (hasHighlight && highlightData) {
        s.uniforms.uNumHoverPoints.value = highlightData.points.length;
        for (let i = 0; i < 2; i++) {
          if (i < highlightData.points.length) {
            s.uniforms.uHoverPoints.value[i].set(...highlightData.points[i]);
          } else {
            s.uniforms.uHoverPoints.value[i].set(0, -999, 0);
          }
        }
        s.uniforms.uHoverRadius.value = highlightData.radius * 1.15;
      }
    }

    // Sync to base alabaster material shader
    if (baseMaterial.userData.shader) {
      const s = baseMaterial.userData.shader;
      s.uniforms.uHoverIntensity.value = hoverIntensityRef.current;
      if (hasHighlight && highlightData) {
        s.uniforms.uNumHoverPoints.value = highlightData.points.length;
        for (let i = 0; i < 2; i++) {
          if (i < highlightData.points.length) {
            s.uniforms.uHoverPoints.value[i].set(...highlightData.points[i]);
          } else {
            s.uniforms.uHoverPoints.value[i].set(0, -999, 0);
          }
        }
        s.uniforms.uHoverRadius.value = highlightData.radius * 1.15;
      }
    }
  });

  // 1. Invisible hit-testing material for Three.js geometry raycasting
  const invisibleHitMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    []
  );

  // 2. Pre-build Region Object3D groups for all Major and Sub regions
  const collisionGroups = useMemo(() => {
    const majorGroups: THREE.Group[] = [];
    const subGroups: THREE.Group[] = [];

    for (const major of REGION_HIERARCHY) {
      const mGroup = createRegionGroup(major, major.id, true, invisibleHitMaterial);
      mGroup.userData.view = major.view;
      majorGroups.push(mGroup);

      if (major.subRegions) {
        for (const sub of major.subRegions) {
          const sGroup = createRegionGroup(sub, major.id, false, invisibleHitMaterial);
          sGroup.userData.view = major.view;
          subGroups.push(sGroup);
        }
      }
    }

    return { majorGroups, subGroups };
  }, [invisibleHitMaterial]);

  // Hit testing on pointer up (only if user was not dragging)
  const handleMeshPointerUp = (e: ThreeEvent<PointerEvent>) => {
    if (!selectMode || isDraggingRef.current) return;
    e.stopPropagation();

    const currentView = isBackView ? "back" : "front";
    let activeGroups: THREE.Group[] = [];

    if (mode === "full" || !activeMajorId) {
      activeGroups = collisionGroups.majorGroups.filter(
        (g) => g.userData.view === currentView
      );
    } else {
      // Zoom mode: sub-regions of active major
      activeGroups = collisionGroups.subGroups.filter(
        (g) => g.userData.majorId === activeMajorId
      );
    }

    raycaster.setFromCamera(pointer, camera);
    const intersects = raycaster.intersectObjects(activeGroups, true);
    if (intersects.length > 0) {
      const hit = intersects[0];
      const hitData = hit.object.userData;
      const proxy: RegionProxy = {
        groupId: hitData.groupId,
        label: hitData.label,
        pos: [hit.point.x, hit.point.y, hit.point.z],
        radius: 0.2,
        isBilateral: Boolean(hitData.isBilateral),
        majorId: hitData.majorId,
        subRegionId: hitData.subRegionId,
        isLeaf: Boolean(hitData.isLeaf),
        volumes: [],
      };
      onRegionClick(proxy);
    }
  };

  const handleMeshPointerMove = () => {
    if (!selectMode || isDraggingRef.current) return;
    if (
      typeof window !== "undefined" &&
      window.matchMedia &&
      !window.matchMedia("(hover: hover)").matches
    ) {
      return; // Skip hover calculation on touch-only devices
    }

    const currentView = isBackView ? "back" : "front";
    let activeGroups: THREE.Group[] = [];

    if (mode === "full" || !activeMajorId) {
      activeGroups = collisionGroups.majorGroups.filter(
        (g) => g.userData.view === currentView
      );
    } else {
      // Zoom mode: sub-regions of active major
      activeGroups = collisionGroups.subGroups.filter(
        (g) => g.userData.majorId === activeMajorId
      );
    }

    raycaster.setFromCamera(pointer, camera);
    const intersects = raycaster.intersectObjects(activeGroups, true);
    if (intersects.length > 0) {
      const hit = intersects[0];
      const hitData = hit.object.userData;
      onRegionHover(hitData.groupId);
    } else {
      onRegionHover(null);
    }
  };

  const handleMeshPointerOut = () => {
    if (selectMode) {
      onRegionHover(null);
    }
  };

  if (!bakedGeometry) return null;

  return (
    <group
      ref={groupRef}
      position={[0, 0, 0]}
      scale={[1, 1, 1]}
      onPointerUp={handleMeshPointerUp}
      onPointerMove={handleMeshPointerMove}
      onPointerOut={handleMeshPointerOut}
    >
      {/* Invisible Collision Groups attached to rotating body */}
      {collisionGroups.majorGroups.map((g) => (
        <primitive key={g.name} object={g} />
      ))}
      {collisionGroups.subGroups.map((g) => (
        <primitive key={g.name} object={g} />
      ))}

      {/* Visual Body Mesh */}
      <mesh
        geometry={bakedGeometry}
        material={baseMaterial}
      />
      <mesh
        geometry={wireGeometries ? wireGeometries[wireLevel] : bakedGeometry}
        material={wireMaterial}
      />
      {/* Dev-Only Proxy Wireframe Visualizer */}
      <RegionDebugOverlay
        enabled={Boolean(debugMode)}
        filter={debugFilter || "current"}
        isBackView={isBackView}
        mode={mode}
        activeMajorId={activeMajorId}
        selectedSubRegionId={selectedSubRegionId}
        hoveredGroupId={hoveredGroupId}
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
  /**
   * Phone behaviour: while choosing an area the picker is only a slim bar and
   * the model keeps the screen; the list appears after an area is tapped.
   */
  tapFirst?: boolean;
  /** Tells the page how much room the picker needs right now. */
  onPickerLayoutChange?: (layout: "bar" | "panel") => void;
}

export default function HumanBodyModel({
  activeSymptoms = [],
  onSymptomsChange,
  onSelectRegion,
  onSelectModeChange,
  panelContainer,
  onSearchRequested,
  tapFirst = false,
  onPickerLayoutChange,
}: HumanBodyModelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(true);

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
  const [selectMode, setSelectMode] = useState(false);
  useEffect(() => {
    onSelectModeChange?.(selectMode);
  }, [selectMode, onSelectModeChange]);
  const [mode, setMode] = useState<"full" | "zoom">("full");
  const [activeMajorId, setActiveMajorId] = useState<string | null>(null);
  const [activeSubRegionId, setActiveSubRegionId] = useState<string | null>(null);
  const [hoveredGroupId, setHoveredGroupId] = useState<string | null>(null);
  const [, setSearchQuery] = useState("");
  const [, setIsExpanded] = useState(false);

  // Dev-Only Debug Visualizer State (active in dev or via NEXT_PUBLIC_DEBUG_PROXIES)
  const [debugMode, setDebugMode] = useState(
    typeof process !== "undefined" && process.env.NEXT_PUBLIC_DEBUG_PROXIES === "true"
  );
  const [debugFilter, setDebugFilter] = useState<"current" | "all">("current");

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

  const activePoints = useMemo(() => getActivePoints(activeSymptoms), [activeSymptoms]);

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
  const handleSelectMajor = useCallback((major: MajorRegion) => {
    const isLeaf = !major.subRegions || major.subRegions.length === 0;

    if (isLeaf || !major.subRegions || major.subRegions.length === 0) {
      // Leaf major skips zoom mode entirely — reports directly to callback
      onSelectRegion?.({
        majorId: major.id,
        subRegionId: major.id,
      });
      setMode("full");
      setActiveMajorId(null);
      setActiveSubRegionId(major.id);
      setSearchQuery("");
      setIsExpanded(false);
    } else {
      // Major has subcategories: enter ZOOM MODE
      setMode("zoom");
      setActiveMajorId(major.id);
      setActiveSubRegionId(major.subRegions[0].id);
      setSearchQuery("");
      setIsExpanded(false);
      zoomBaseRotationRef.current = targetRotationYRef.current;
    }

    if (major.view === "back") {
      snapToBack();
    } else {
      snapToFront();
    }
  }, [onSelectRegion, snapToBack, snapToFront]);

  // Click handler from 3D raycast hit-testing
  const handleRegionClick = useCallback(
    (proxy: RegionProxy) => {
      if (mode === "full") {
        const major = REGION_HIERARCHY.find((m) => m.id === proxy.majorId);
        if (!major) return;
        handleSelectMajor(major);
      } else {
        // In ZOOM MODE: selecting an active sub-region proxy
        onSelectRegion?.({
          majorId: proxy.majorId,
          subRegionId: proxy.groupId,
        });
        setActiveSubRegionId(proxy.groupId);
        if (proxy.majorId && proxy.majorId !== activeMajorId) {
          setActiveMajorId(proxy.majorId);
        }
        setSearchQuery("");
        setIsExpanded(false);
      }
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
    return REGION_HIERARCHY.filter((m) => m.view === view);
  }, [isBackView]);

  // Phone: the area list is opt-in; by default areas are chosen by tapping the model.
  const [areaListOpen, setAreaListOpen] = useState(false);
  const onSymptomStep = Boolean(subRegionData && activeSubRegionId);
  const pickerLayout: "bar" | "panel" = tapFirst && !onSymptomStep && !areaListOpen ? "bar" : "panel";
  useEffect(() => {
    onPickerLayoutChange?.(pickerLayout);
  }, [pickerLayout, onPickerLayoutChange]);

  const exitSelectMode = () => {
    setAreaListOpen(false);
    setSelectMode(false);
    setMode("full");
    setActiveMajorId(null);
    setActiveSubRegionId(null);
    setHoveredGroupId(null);
  };

  const pickerPanel = (
    <BodyPickerPanel
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
      layout={pickerLayout}
      onShowList={() => setAreaListOpen(true)}
      onHideList={tapFirst ? () => setAreaListOpen(false) : undefined}
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
      >
        <FrameDriver
          active={inView && (selectMode || awake)}
          fps={selectMode ? 60 : 30}
          redrawKey={activePoints}
        />
        <ambientLight intensity={1.8} />
        <directionalLight position={[4, 8, 5]} intensity={1.3} color="#ffffff" />
        <directionalLight position={[-4, 2, 3]} intensity={0.7} color="#e0eeff" />
        <directionalLight position={[0, -4, 2]} intensity={0.4} color="#fff8eb" />
        <directionalLight position={[0, 4, -5]} intensity={0.6} color="#dbe8ff" />
        <Suspense fallback={null}>
          <RotatingBody
            activePoints={activePoints}
            selectMode={selectMode}
            mode={mode}
            activeMajorId={activeMajorId}
            selectedSubRegionId={activeSubRegionId}
            hoveredGroupId={hoveredGroupId}
            isBackView={isBackView}
            targetRotationYRef={targetRotationYRef}
            isDraggingRef={isDraggingRef}
            onRegionClick={handleRegionClick}
            onRegionHover={setHoveredGroupId}
            debugMode={debugMode}
            debugFilter={debugFilter}
          />
        </Suspense>
      </Canvas>

      {/* ─── DEV-ONLY: 3D Region Proxy Debug Visualizer Toggle ───── */}
      {process.env.NODE_ENV !== "production" && (
        <div className="absolute top-4 left-4 z-40 pointer-events-auto flex items-center gap-1.5 animate-fade-in">
          <button
            type="button"
            onClick={() => setDebugMode(!debugMode)}
            className={`px-3 py-1.5 rounded-xl text-[11px] font-mono font-bold transition-all shadow-md flex items-center gap-1.5 border ${
              debugMode
                ? "bg-amber-500 text-white border-amber-600 ring-2 ring-amber-300"
                : "bg-slate-900/85 hover:bg-slate-900 text-slate-200 border-slate-700 backdrop-blur-md"
            }`}
            title="Dev-Only: Toggle Anatomical 3D Proxy Wireframe Visualizer"
            id="dev-debug-proxies-toggle"
          >
            <span>🛠️ 3D Proxies</span>
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] ${
                debugMode ? "bg-black/30 text-white" : "bg-white/20 text-slate-300"
              }`}
            >
              {debugMode ? "ON" : "OFF"}
            </span>
          </button>

          {debugMode && (
            <div className="flex items-center gap-1 bg-white/95 backdrop-blur-md p-1 rounded-xl border border-slate-200 shadow-md text-[11px] font-mono">
              <button
                type="button"
                onClick={() => setDebugFilter("current")}
                className={`px-2 py-0.5 rounded-lg transition-colors ${
                  debugFilter === "current"
                    ? "bg-brand text-white font-bold"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
                title="Show only proxies for active mode/view"
              >
                View
              </button>
              <button
                type="button"
                onClick={() => setDebugFilter("all")}
                className={`px-2 py-0.5 rounded-lg transition-colors ${
                  debugFilter === "all"
                    ? "bg-brand text-white font-bold"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
                title="Show all 3D proxies simultaneously"
              >
                All
              </button>
            </div>
          )}
        </div>
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

      {/* ─── Picking: one panel, rendered where the page wants it ─── */}
      {selectMode &&
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

useGLTF.preload("/human_body.glb");
