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
  IconRefresh,
  IconCheck,
  IconClose,
  IconChevronDown,
  IconChevronUp,
  IconArrowLeft,
  IconSearch,
} from "./icons";
import {
  REGION_HIERARCHY,
  MajorRegion,
  SubRegion,
  RegionProxy,
  RegionSelectionPayload,
  getActiveProxiesForMode,
  findNearestProxy,
  getRegionProxyPoints,
  getRegionCentroid,
  createRegionGroup,
} from "./regionHierarchy";
import RegionDebugOverlay from "./RegionDebugOverlay";

export type { SubRegion, MajorRegion, RegionSelectionPayload, RegionProxy };

/* ─── Anatomical Data & Symptom Mapping ──────────────────────── */

export interface BodyPoint {
  pos: [number, number, number];
  radius: number;
}

export interface RankedSymptom {
  id: string; // Canonical symptom key in Kaggle dataset / backend
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
    name: "Head & Cranium",
    majorId: "head",
    topSymptoms: [
      { id: "headache", name: "Headache / Migraine", rank: 1, severity: 3, description: "Throbbing, sharp, or band-like head pain" },
      { id: "dizziness", name: "Dizziness / Lightheadedness", rank: 2, severity: 4, description: "Feeling faint, lightheaded, or unsteady" },
      { id: "altered_sensorium", name: "Altered Sensorium / Confusion", rank: 3, severity: 2, description: "Changes in alertness or mental clarity" },
      { id: "spinning_movements", name: "Vertigo / Spinning", rank: 4, severity: 6, description: "False sensation of rotating or spinning room" },
    ],
    secondarySymptoms: [
      { id: "lack_of_concentration", name: "Lack of Concentration", rank: 5, severity: 3 },
      { id: "unsteadiness", name: "Loss of Balance / Unsteadiness", rank: 6, severity: 4 },
      { id: "depression", name: "Depressive Mood", rank: 7, severity: 3 },
      { id: "irritability", name: "Irritability / Agitation", rank: 8, severity: 2 },
    ],
  },
  head_back: {
    id: "head_back",
    name: "Head (Posterior / Occiput)",
    majorId: "head_back",
    topSymptoms: [
      { id: "headache", name: "Occipital Tension Headache", rank: 1, severity: 3, description: "Ache radiating from base of skull up the back of head" },
      { id: "stiff_neck", name: "Suboccipital Neck Stiffness", rank: 2, severity: 4, description: "Tightness where skull meets cervical spine" },
      { id: "dizziness", name: "Cervicogenic Dizziness", rank: 3, severity: 4, description: "Imbalance associated with head turning" },
    ],
  },
  scalp: {
    id: "scalp",
    name: "Scalp & Vertex",
    majorId: "head",
    topSymptoms: [
      { id: "headache", name: "Vertex Scalp Tenderness", rank: 1, severity: 3, description: "Surface hypersensitivity or pressure at cranial crown" },
      { id: "itching", name: "Scalp Pruritus / Itching", rank: 2, severity: 2, description: "Irritation or itchy flaking across the scalp" },
      { id: "skin_rash", name: "Scalp Eruptions / Folliculitis", rank: 3, severity: 3, description: "Small bumps or localized crusting on scalp" },
    ],
  },
  forehead: {
    id: "forehead",
    name: "Forehead & Frontal Sinus",
    majorId: "head",
    topSymptoms: [
      { id: "headache", name: "Frontal Headache", rank: 1, severity: 3, description: "Aching across brow and frontal bone" },
      { id: "sinus_pressure", name: "Frontal Sinus Fullness", rank: 2, severity: 4, description: "Heavy pressure above eye sockets" },
      { id: "sweating", name: "Diaphoresis / Forehead Sweats", rank: 3, severity: 2, description: "Sudden clamminess or cold sweat" },
    ],
  },
  eyes: {
    id: "eyes",
    name: "Eyes & Vision",
    majorId: "head",
    topSymptoms: [
      { id: "blurred_and_distorted_vision", name: "Blurred / Distorted Vision", rank: 1, severity: 5, description: "Difficulty focusing or warped field of view" },
      { id: "pain_behind_the_eyes", name: "Pain Behind the Eyes", rank: 2, severity: 4, description: "Retro-orbital pressure or aching" },
      { id: "redness_of_eyes", name: "Redness / Bloodshot Eyes", rank: 3, severity: 5, description: "Conjunctival redness or irritation" },
      { id: "watering_from_eyes", name: "Watering Eyes (Epiphora)", rank: 4, severity: 4, description: "Excessive lacrimation without crying" },
    ],
    secondarySymptoms: [
      { id: "yellowing_of_eyes", name: "Yellowing of Eyes (Jaundice)", rank: 5, severity: 4 },
      { id: "sunken_eyes", name: "Sunken Eyes (Dehydration)", rank: 6, severity: 3 },
    ],
  },
  nose: {
    id: "nose",
    name: "Nose & Sinuses",
    majorId: "head",
    topSymptoms: [
      { id: "sinus_pressure", name: "Sinus Pressure / Pain", rank: 1, severity: 4, description: "Facial fullness around nose, forehead, and cheeks" },
      { id: "runny_nose", name: "Runny Nose (Rhinorrhea)", rank: 2, severity: 5, description: "Excess nasal drainage or clear discharge" },
      { id: "continuous_sneezing", name: "Continuous Sneezing", rank: 3, severity: 4, description: "Rapid bouts of sneezing" },
      { id: "loss_of_smell", name: "Loss of Smell (Anosmia)", rank: 4, severity: 3, description: "Decreased or absent olfactory perception" },
    ],
    secondarySymptoms: [
      { id: "red_sore_around_nose", name: "Red Sores Around Nose", rank: 5, severity: 2 },
    ],
  },
  face: {
    id: "face",
    name: "Face & Cheeks",
    majorId: "head",
    topSymptoms: [
      { id: "puffy_face_and_eyes", name: "Facial / Periorbital Puffiness", rank: 1, severity: 5, description: "Swelling in cheeks, lips, or eyelids" },
      { id: "slurred_speech", name: "Facial Weakness / Slurred Speech", rank: 2, severity: 4, description: "Impaired articulation or sluggish speech" },
      { id: "drying_and_tingling_lips", name: "Facial Paresthesia / Tingling", rank: 3, severity: 4, description: "Numbness or pins-and-needles across cheeks" },
      { id: "pus_filled_pimples", name: "Facial Pustular Eruptions", rank: 4, severity: 2, description: "Acneiform papules or inflammatory spots" },
    ],
    secondarySymptoms: [
      { id: "blackheads", name: "Comedones / Blackheads", rank: 5, severity: 2 },
    ],
  },
  mouth: {
    id: "mouth",
    name: "Mouth & Tongue",
    majorId: "head",
    topSymptoms: [
      { id: "ulcers_on_tongue", name: "Tongue / Oral Ulcers", rank: 1, severity: 4, description: "Painful aphthous sores inside mouth or on tongue" },
      { id: "drying_and_tingling_lips", name: "Drying & Tingling Lips", rank: 2, severity: 4, description: "Cracking, desquamation, or burning lips" },
      { id: "slurred_speech", name: "Slurred Speech (Dysarthria)", rank: 3, severity: 4, description: "Sluggish tongue movement or unclear words" },
    ],
  },
  jaw: {
    id: "jaw",
    name: "Jaw & Mandible",
    majorId: "head",
    topSymptoms: [
      { id: "joint_pain", name: "TMJ / Jaw Joint Pain", rank: 1, severity: 3, description: "Clicking or soreness on chewing and opening mouth" },
      { id: "movement_stiffness", name: "Jaw Stiffness / Trismus", rank: 2, severity: 4, description: "Restricted jaw opening or tight masseter muscle" },
      { id: "headache", name: "Temporal Ache radiating from Jaw", rank: 3, severity: 3, description: "Referred ache into temples" },
    ],
  },
  ears: {
    id: "ears",
    name: "Ears & Hearing",
    majorId: "head",
    topSymptoms: [
      { id: "spinning_movements", name: "Vestibular Vertigo / Spinning", rank: 1, severity: 6, description: "Inner ear imbalance or rotating sensations" },
      { id: "unsteadiness", name: "Labyrinthine Imbalance", rank: 2, severity: 4, description: "Loss of equilibrium caused by ear pressure" },
      { id: "headache", name: "Periauricular / Ear Pain", rank: 3, severity: 3, description: "Sharp or aching pain around the ear canal" },
    ],
  },

  /* ─── NECK LEAF REGION ─── */
  neck: {
    id: "neck",
    name: "Neck & Cervical Spine",
    majorId: "neck",
    topSymptoms: [
      { id: "neck_pain", name: "Neck Pain & Discomfort", rank: 1, severity: 5, description: "Aching or sharp cervical pain with movement" },
      { id: "stiff_neck", name: "Stiff Neck (Nuchal Rigidity)", rank: 2, severity: 4, description: "Difficulty rotating head or touching chin to chest" },
      { id: "swelled_lymph_nodes", name: "Swollen Cervical Lymph Nodes", rank: 3, severity: 6, description: "Palpable, tender lumps in neck or submandibular area" },
      { id: "enlarged_thyroid", name: "Enlarged Thyroid (Goiter)", rank: 4, severity: 6, description: "Swelling at the anterior base of neck" },
    ],
  },

  /* ─── CHEST SUB-REGIONS ─── */
  chest: {
    id: "chest",
    name: "Chest, Heart & Lungs",
    majorId: "chest",
    topSymptoms: [
      { id: "chest_pain", name: "Chest Pain / Tightness", rank: 1, severity: 7, description: "Pressure, squeezing, or stabbing thoracic discomfort" },
      { id: "breathlessness", name: "Shortness of Breath (Dyspnea)", rank: 2, severity: 4, description: "Difficulty catching breath or shallow breathing" },
      { id: "palpitations", name: "Heart Palpitations", rank: 3, severity: 4, description: "Sensation of rapid, irregular, or pounding heartbeats" },
      { id: "fast_heart_rate", name: "Rapid Pulse (Tachycardia)", rank: 4, severity: 5, description: "Unusually rapid resting heartbeat" },
    ],
    secondarySymptoms: [
      { id: "cough", name: "Persistent Cough", rank: 5, severity: 4 },
      { id: "phlegm", name: "Chest Congestion / Phlegm", rank: 6, severity: 5 },
    ],
  },
  upper_chest: {
    id: "upper_chest",
    name: "Upper Chest & Clavicular",
    majorId: "chest",
    topSymptoms: [
      { id: "chest_pain", name: "Upper Sternal Pressure", rank: 1, severity: 6, description: "Aching beneath collarbone or upper breastbone" },
      { id: "breathlessness", name: "Tracheobronchial Dyspnea", rank: 2, severity: 4, description: "Inspiratory wheeze or tight airway feeling" },
      { id: "cough", name: "Hacking Upper Chest Cough", rank: 3, severity: 4, description: "Irritant dry cough originating high in the chest" },
    ],
  },
  breast: {
    id: "breast",
    name: "Breast & Mammary Area",
    majorId: "chest",
    topSymptoms: [
      { id: "chest_pain", name: "Mastalgia / Breast Tenderness", rank: 1, severity: 4, description: "Aching, soreness, or fullness in breast tissue" },
      { id: "swelling_joints", name: "Breast Tissue Engorgement", rank: 2, severity: 3, description: "Swelling or cyclic tenderness in pectoral/mammary area" },
      { id: "swelled_lymph_nodes", name: "Axillary / Mammary Node Tenderness", rank: 3, severity: 5, description: "Tender nodules along outer breast quadrant" },
    ],
  },
  chest_core: {
    id: "chest_core",
    name: "Mid-Chest & Retrosternal",
    majorId: "chest",
    topSymptoms: [
      { id: "chest_pain", name: "Retrosternal Angina / Tightness", rank: 1, severity: 7, description: "Heavy crushing pain behind center of breastbone" },
      { id: "palpitations", name: "Palpitations / Fluttering", rank: 2, severity: 4, description: "Irregular or skipped beats" },
      { id: "breathlessness", name: "Exertional Breathlessness", rank: 3, severity: 5, description: "Air hunger provoked by climbing stairs" },
    ],
  },

  /* ─── ABDOMEN SUB-REGIONS ─── */
  abdomen: {
    id: "abdomen",
    name: "Abdomen & Digestive",
    majorId: "abdomen",
    topSymptoms: [
      { id: "stomach_pain", name: "Stomach Pain / Cramping", rank: 1, severity: 5, description: "Epigastric aching or sharp abdominal spasms" },
      { id: "nausea", name: "Nausea", rank: 2, severity: 5, description: "Uneasiness in stomach with urge to vomit" },
      { id: "vomiting", name: "Vomiting", rank: 3, severity: 5, description: "Involuntary expulsion of gastric contents" },
      { id: "acidity", name: "Acid Reflux / Heartburn", rank: 4, severity: 3, description: "Substernal burning radiating up esophagus" },
    ],
    secondarySymptoms: [
      { id: "abdominal_pain", name: "Generalized Abdominal Pain", rank: 5, severity: 4 },
      { id: "indigestion", name: "Dyspepsia / Indigestion", rank: 6, severity: 5 },
      { id: "swelling_of_stomach", name: "Abdominal Distension", rank: 7, severity: 7 },
      { id: "loss_of_appetite", name: "Loss of Appetite (Anorexia)", rank: 8, severity: 4 },
    ],
  },
  epigastric: {
    id: "epigastric",
    name: "Epigastric (Upper Central Abdomen)",
    majorId: "abdomen",
    topSymptoms: [
      { id: "stomach_pain", name: "Epigastric Burning Pain", rank: 1, severity: 5, description: "Sharp burning localized beneath sternal margin" },
      { id: "acidity", name: "Hyperacidity / Heartburn", rank: 2, severity: 4, description: "Sour acid regurgitation aggravated by eating" },
      { id: "indigestion", name: "Early Satiety / Dyspepsia", rank: 3, severity: 3, description: "Premature fullness and gastric heaviness" },
      { id: "nausea", name: "Epigastric Nausea", rank: 4, severity: 4, description: "Queasy feeling centered in upper stomach" },
    ],
  },
  upper_abdomen: {
    id: "upper_abdomen",
    name: "Upper Abdomen (Hepato-Biliary)",
    majorId: "abdomen",
    topSymptoms: [
      { id: "abdominal_pain", name: "Right Upper Quadrant Ache", rank: 1, severity: 5, description: "Dull ache under right ribs or gallbladder area" },
      { id: "vomiting", name: "Bilious Vomiting", rank: 2, severity: 5, description: "Throwing up yellow-green bile" },
      { id: "loss_of_appetite", name: "Anorexia / Food Aversion", rank: 3, severity: 4, description: "Loss of desire to eat" },
      { id: "swelling_of_stomach", name: "Upper Abdominal Fullness", rank: 4, severity: 6, description: "Bloated distension above belly button" },
    ],
  },
  lower_abdomen: {
    id: "lower_abdomen",
    name: "Lower Abdomen & Bowel",
    majorId: "abdomen",
    topSymptoms: [
      { id: "abdominal_pain", name: "Lower Abdominal Cramping", rank: 1, severity: 5, description: "Colicky intestinal cramps relieved or triggered by defecation" },
      { id: "diarrhoea", name: "Loose Stools / Diarrhea", rank: 2, severity: 6, description: "Frequent liquid bowel movements" },
      { id: "constipation", name: "Constipation / Straining", rank: 3, severity: 4, description: "Infrequent hard stools" },
      { id: "swelling_of_stomach", name: "Tympanites / Bloating", rank: 4, severity: 5, description: "Gaseous swelling across lower belly" },
    ],
  },

  /* ─── ARMS SUB-REGIONS (BILATERAL) ─── */
  arms: {
    id: "arms",
    name: "Arms & Upper Extremities",
    majorId: "arms",
    topSymptoms: [
      { id: "muscle_weakness", name: "Arm Muscle Weakness", rank: 1, severity: 2, description: "Reduced strength lifting objects or raising arms" },
      { id: "weakness_in_limbs", name: "Weakness in Limbs", rank: 2, severity: 7, description: "General heaviness or paresis in arm extremities" },
      { id: "muscle_pain", name: "Bicep / Shoulder Aches", rank: 3, severity: 2, description: "Myalgia in deltoids, biceps, or forearms" },
      { id: "bruising", name: "Arm Bruising / Hematomas", rank: 4, severity: 4, description: "Ecchymosis or purple skin spots from minor trauma" },
    ],
  },
  shoulder: {
    id: "shoulder",
    name: "Shoulder & Rotator Cuff",
    majorId: "arms",
    topSymptoms: [
      { id: "joint_pain", name: "Shoulder Joint Arthralgia", rank: 1, severity: 4, description: "Aching pain when raising arm overhead" },
      { id: "movement_stiffness", name: "Frozen Shoulder / Stiffness", rank: 2, severity: 5, description: "Restricted range of motion in glenohumeral joint" },
      { id: "muscle_pain", name: "Deltoid Soreness", rank: 3, severity: 2, description: "Muscle spasm over outer cap of shoulder" },
    ],
  },
  armpit: {
    id: "armpit",
    name: "Armpit & Axilla",
    majorId: "arms",
    topSymptoms: [
      { id: "swelled_lymph_nodes", name: "Swollen Axillary Lymph Nodes", rank: 1, severity: 6, description: "Tender lumps in armpit hollow" },
      { id: "muscle_pain", name: "Axillary Tenderness", rank: 2, severity: 3, description: "Soreness in armpit fold on motion" },
      { id: "sweating", name: "Excessive Axillary Sweating", rank: 3, severity: 2, description: "Profuse hyperhidrosis in underarm" },
    ],
  },
  upper_arm: {
    id: "upper_arm",
    name: "Upper Arm (Biceps / Triceps)",
    majorId: "arms",
    topSymptoms: [
      { id: "muscle_pain", name: "Biceps / Brachial Myalgia", rank: 1, severity: 3, description: "Aching in upper arm musculature" },
      { id: "muscle_weakness", name: "Loss of Arm Lifting Power", rank: 2, severity: 3, description: "Weakness flexing or extending elbow" },
      { id: "bruising", name: "Upper Arm Hematoma", rank: 3, severity: 3, description: "Discoloration or subcutaneous bruising" },
    ],
  },
  elbow: {
    id: "elbow",
    name: "Elbow & Olecranon",
    majorId: "arms",
    topSymptoms: [
      { id: "joint_pain", name: "Elbow Epicondylitis / Pain", rank: 1, severity: 3, description: "Pain over lateral or medial elbow bump" },
      { id: "swelling_joints", name: "Elbow Joint Effusion", rank: 2, severity: 4, description: "Fluid swelling over olecranon tip" },
      { id: "movement_stiffness", name: "Elbow Flexion Stiffness", rank: 3, severity: 4, description: "Difficulty straightening or bending arm" },
    ],
  },
  forearm: {
    id: "forearm",
    name: "Forearm & Tendons",
    majorId: "arms",
    topSymptoms: [
      { id: "muscle_pain", name: "Forearm Tendonitis", rank: 1, severity: 3, description: "Aching along radial or ulnar muscle bellies" },
      { id: "weakness_in_limbs", name: "Decreased Grip Strength", rank: 2, severity: 4, description: "Difficulty opening jars or carrying bags" },
    ],
  },
  wrist: {
    id: "wrist",
    name: "Wrist & Carpal Joint",
    majorId: "arms",
    topSymptoms: [
      { id: "joint_pain", name: "Carpal / Wrist Arthralgia", rank: 1, severity: 4, description: "Aching or clicking wrist on typing or lifting" },
      { id: "swelling_joints", name: "Wrist Joint Swelling", rank: 2, severity: 5, description: "Puffy wrist joint with morning stiffness" },
      { id: "drying_and_tingling_lips", name: "Wrist / Median Nerve Paresthesia", rank: 3, severity: 4, description: "Pins and needles radiating into fingers" },
    ],
  },
  hand: {
    id: "hand",
    name: "Hands & Palms",
    majorId: "arms",
    topSymptoms: [
      { id: "cold_hands_and_feets", name: "Cold Hands & Palms", rank: 1, severity: 5, description: "Poor peripheral circulation or pale fingers" },
      { id: "joint_pain", name: "Palmar / Metacarpal Joint Pain", rank: 2, severity: 3, description: "Ache across palm and knuckle joints" },
      { id: "swelling_joints", name: "Puffy Hand Edema", rank: 3, severity: 4, description: "Swollen fingers, tight rings" },
    ],
  },
  fingers: {
    id: "fingers",
    name: "Fingers & Nails",
    majorId: "arms",
    topSymptoms: [
      { id: "joint_pain", name: "Knuckle / Interphalangeal Pain", rank: 1, severity: 3, description: "Stiffness or aching in finger joints" },
      { id: "brittle_nails", name: "Brittle / Splitting Nails", rank: 2, severity: 5, description: "Fragile, easily peeling or cracked fingernails" },
      { id: "small_dents_in_nails", name: "Pitted / Dented Nails", rank: 3, severity: 2, description: "Depressions or ridges on nail plate" },
      { id: "inflammatory_nails", name: "Paronychia / Inflamed Nail Beds", rank: 4, severity: 2, description: "Redness or throbbing along nail cuticles" },
    ],
  },

  /* ─── PELVIC SUB-REGIONS ─── */
  pelvic: {
    id: "pelvic",
    name: "Pelvis, Bladder & Bowel",
    majorId: "pelvic",
    topSymptoms: [
      { id: "burning_micturition", name: "Burning Sensation During Urination", rank: 1, severity: 6, description: "Painful or stinging urination (dysuria)" },
      { id: "bladder_discomfort", name: "Bladder Pressure / Discomfort", rank: 2, severity: 4, description: "Suprapubic ache or feeling of incomplete emptying" },
      { id: "diarrhoea", name: "Diarrhea / Loose Stools", rank: 3, severity: 6, description: "Frequent watery or unformed bowel movements" },
      { id: "constipation", name: "Constipation", rank: 4, severity: 4, description: "Infrequent or strained bowel movements" },
    ],
    secondarySymptoms: [
      { id: "continuous_feel_of_urine", name: "Urinary Urgency / Frequency", rank: 5, severity: 6 },
      { id: "foul_smell_ofurine", name: "Foul-Smelling Urine", rank: 6, severity: 5 },
      { id: "dark_urine", name: "Dark Urine (Bilirubinuria)", rank: 7, severity: 4 },
      { id: "abnormal_menstruation", name: "Menstrual Irregularities", rank: 8, severity: 6 },
    ],
  },
  above_pubic_bone: {
    id: "above_pubic_bone",
    name: "Above Pubic Bone (Suprapubic)",
    majorId: "pelvic",
    topSymptoms: [
      { id: "bladder_discomfort", name: "Suprapubic Aching & Pressure", rank: 1, severity: 5, description: "Dull ache right above pubic hairline" },
      { id: "continuous_feel_of_urine", name: "Tenesmus Vesicae / Full Bladder", rank: 2, severity: 6, description: "Constant urge to void even when empty" },
      { id: "burning_micturition", name: "Dysuria Spasms", rank: 3, severity: 6, description: "Spasmodic pain radiating down pubic bone" },
    ],
  },
  pelvic_core: {
    id: "pelvic_core",
    name: "Pelvic Basin & Floor",
    majorId: "pelvic",
    topSymptoms: [
      { id: "bladder_discomfort", name: "Pelvic Floor Heaviness", rank: 1, severity: 4, description: "Pressure bearing down in the pelvic cavity" },
      { id: "burning_micturition", name: "Painful Micturition", rank: 2, severity: 6, description: "Stinging during urine passage" },
      { id: "abnormal_menstruation", name: "Pelvic Congestion / Dysmenorrhea", rank: 3, severity: 6, description: "Heavy pelvic cramping" },
    ],
  },
  genital: {
    id: "genital",
    name: "Genital & Perineal",
    majorId: "pelvic",
    topSymptoms: [
      { id: "burning_micturition", name: "Urethral Burning / Itching", rank: 1, severity: 6, description: "Stinging or pruritus in genital tract" },
      { id: "itching", name: "Perineal Pruritus / Itch", rank: 2, severity: 3, description: "Skin irritation around groin or genital area" },
      { id: "foul_smell_ofurine", name: "Malodorous Discharge / Urine", rank: 3, severity: 5, description: "Unusual odor or cloudiness" },
    ],
  },
  groin: {
    id: "groin",
    name: "Groin & Inguinal Canal",
    majorId: "pelvic",
    topSymptoms: [
      { id: "swelled_lymph_nodes", name: "Swollen Inguinal Lymph Nodes", rank: 1, severity: 6, description: "Tender palpable glands in groin crease" },
      { id: "muscle_pain", name: "Adductor / Groin Strain", rank: 2, severity: 3, description: "Sharp pain radiating into inner upper thigh" },
      { id: "abdominal_pain", name: "Inguinal Bulge / Fullness", rank: 3, severity: 5, description: "Tender pressure in lower inguinal ring" },
    ],
  },

  /* ─── LEGS SUB-REGIONS (BILATERAL) ─── */
  legs: {
    id: "legs",
    name: "Legs & Lower Limbs",
    majorId: "legs",
    topSymptoms: [
      { id: "weakness_in_limbs", name: "Weakness in Legs", rank: 1, severity: 7, description: "Difficulty bearing weight or climbing stairs" },
      { id: "swollen_legs", name: "Lower Leg Swelling (Edema)", rank: 2, severity: 5, description: "Pitting edema in calves, ankles, or feet" },
      { id: "painful_walking", name: "Pain When Walking (Claudication)", rank: 3, severity: 4, description: "Aching gait disturbance with exertion" },
      { id: "cramps", name: "Lower Extremity Muscle Spasms", rank: 4, severity: 4, description: "Sudden sharp contractions in thigh or calf" },
    ],
  },
  legs_back: {
    id: "legs_back",
    name: "Posterior Legs & Calves",
    majorId: "legs_back",
    topSymptoms: [
      { id: "cramps", name: "Nocturnal Calf Cramps", rank: 1, severity: 4, description: "Severe sudden knotting in gastrocnemius" },
      { id: "prominent_veins_on_calf", name: "Varicose / Prominent Veins", rank: 2, severity: 6, description: "Dilated bulging veins on back of legs" },
      { id: "muscle_pain", name: "Hamstring Tightness", rank: 3, severity: 3, description: "Posterior thigh pull radiating to knee" },
    ],
  },
  thigh: {
    id: "thigh",
    name: "Thigh & Quadriceps",
    majorId: "legs",
    topSymptoms: [
      { id: "muscle_pain", name: "Quadriceps Myalgia / Ache", rank: 1, severity: 3, description: "Deep soreness in front of thigh" },
      { id: "cramps", name: "Thigh Muscle Spasm", rank: 2, severity: 4, description: "Sudden involuntary contraction of leg muscles" },
      { id: "muscle_wasting", name: "Thigh Muscle Atrophy", rank: 3, severity: 3, description: "Noticeable loss of quadriceps mass" },
      { id: "swollen_legs", name: "Thigh Soft-Tissue Swelling", rank: 4, severity: 5, description: "Edema extending up the leg" },
    ],
  },
  knee: {
    id: "knee",
    name: "Knee & Patella",
    majorId: "legs",
    topSymptoms: [
      { id: "knee_pain", name: "Knee Pain & Discomfort", rank: 1, severity: 3, description: "Pain bearing weight, kneeling, or climbing stairs" },
      { id: "swelling_joints", name: "Swollen Knee Joints (Effusion)", rank: 2, severity: 5, description: "Fluid buildup around patella" },
      { id: "movement_stiffness", name: "Stiffness on Bending", rank: 3, severity: 5, description: "Restricted flexion or extension of knee" },
      { id: "painful_walking", name: "Pain When Walking", rank: 4, severity: 2, description: "Tenderness with each stride" },
    ],
  },
  shin: {
    id: "shin",
    name: "Shin & Tibia",
    majorId: "legs",
    topSymptoms: [
      { id: "swollen_legs", name: "Pre-Tibial Pitting Edema", rank: 1, severity: 5, description: "Pressure indentations over the shin bone" },
      { id: "muscle_pain", name: "Shin Splints / Tibial Soreness", rank: 2, severity: 3, description: "Aching pain along anterior lower leg" },
      { id: "swollen_blood_vessels", name: "Superficial Shin Vein Phlebitis", rank: 3, severity: 5, description: "Tender vascular cord on lower leg" },
    ],
  },
  ankle: {
    id: "ankle",
    name: "Ankle & Malleolus",
    majorId: "legs",
    topSymptoms: [
      { id: "swollen_extremeties", name: "Swollen Ankles (Perimalleolar)", rank: 1, severity: 5, description: "Puffiness around outer and inner ankle bones" },
      { id: "joint_pain", name: "Ankle Joint Arthralgia", rank: 2, severity: 3, description: "Ache on rotating foot or standing" },
      { id: "painful_walking", name: "Limping / Weight-Bearing Pain", rank: 3, severity: 4, description: "Sharp pain on heel strike" },
    ],
  },
  foot: {
    id: "foot",
    name: "Foot & Arch",
    majorId: "legs",
    topSymptoms: [
      { id: "painful_walking", name: "Sole / Plantar Heel Pain", rank: 1, severity: 4, description: "Sharp stabbing heel pain on first steps in morning" },
      { id: "cold_hands_and_feets", name: "Cold Feet & Decreased Pulse", rank: 2, severity: 5, description: "Reduced warmth in distal extremities" },
      { id: "swollen_extremeties", name: "Pedal Edema / Swollen Feet", rank: 3, severity: 5, description: "Shoes or socks fitting tightly" },
    ],
  },
  toes: {
    id: "toes",
    name: "Toes & Digital Rays",
    majorId: "legs",
    topSymptoms: [
      { id: "joint_pain", name: "Great Toe Arthralgia (Podagra)", rank: 1, severity: 5, description: "Acute red, hot, excruciating big toe joint" },
      { id: "cold_hands_and_feets", name: "Cold, Numb Toes", rank: 2, severity: 5, description: "Tingling or blueish chill in toes" },
      { id: "brittle_nails", name: "Toenail Brittleness / Thickening", rank: 3, severity: 4, description: "Cracking or discoloration of toenails" },
    ],
  },

  /* ─── BACK SUB-REGIONS ─── */
  back: {
    id: "back",
    name: "Back & Spine",
    majorId: "back",
    topSymptoms: [
      { id: "back_pain", name: "Back Pain (Thoracic / Lumbar)", rank: 1, severity: 3, description: "Localized lumbar or thoracic ache, worsened by bending" },
      { id: "movement_stiffness", name: "Movement Stiffness", rank: 2, severity: 5, description: "Difficulty bending, twisting, or getting up from bed" },
      { id: "stiff_neck", name: "Upper Back & Cervical Tightness", rank: 3, severity: 4, description: "Trapezius muscle tightness and spinal restriction" },
      { id: "muscle_pain", name: "Paraspinal Muscle Aches", rank: 4, severity: 2, description: "Deep muscular soreness along the spine" },
    ],
  },
  upper_back: {
    id: "upper_back",
    name: "Upper Back & Scapula",
    majorId: "back",
    topSymptoms: [
      { id: "back_pain", name: "Interscapular Ache", rank: 1, severity: 4, description: "Burning pain between the shoulder blades" },
      { id: "stiff_neck", name: "Trapezius Spasms", rank: 2, severity: 4, description: "Tight knots across upper dorsal shoulders" },
      { id: "movement_stiffness", name: "Thoracic Spinal Restriction", rank: 3, severity: 3, description: "Stiffness on twisting torso" },
    ],
  },
  middle_back: {
    id: "middle_back",
    name: "Middle Back & Rib Cage",
    majorId: "back",
    topSymptoms: [
      { id: "back_pain", name: "Mid-Thoracic Backache", rank: 1, severity: 3, description: "Dull ache around mid-spine" },
      { id: "chest_pain", name: "Costovertebral Pain on Inhalation", rank: 2, severity: 5, description: "Ache radiating along rib with deep breath" },
      { id: "movement_stiffness", name: "Postural Fatigue", rank: 3, severity: 3, description: "Aching after prolonged sitting" },
    ],
  },
  lower_back: {
    id: "lower_back",
    name: "Lower Back (Lumbar Spine)",
    majorId: "back",
    topSymptoms: [
      { id: "back_pain", name: "Lumbar Disc Pain (Lumbago)", rank: 1, severity: 5, description: "Severe sharp pain in lower spine worsened by lifting" },
      { id: "weakness_in_limbs", name: "Sciatica / Leg Radiculopathy", rank: 2, severity: 6, description: "Shooting electric pain radiating down buttock" },
      { id: "movement_stiffness", name: "Morning Lumbar Rigidity", rank: 3, severity: 5, description: "Inability to bend forward without pain" },
    ],
  },
  flank: {
    id: "flank",
    name: "Flank & Renal Angle",
    majorId: "back",
    topSymptoms: [
      { id: "back_pain", name: "Costovertebral Flank Pain", rank: 1, severity: 6, description: "Acute colicky ache in flank radiating forward" },
      { id: "burning_micturition", name: "Flank Pain with Urination", rank: 2, severity: 6, description: "Renal discomfort associated with urinary frequency" },
      { id: "dark_urine", name: "Hematuria / Dark Urine", rank: 3, severity: 5, description: "Flank discomfort accompanied by brown/red urine" },
    ],
  },

  /* ─── BUTTOCKS SUB-REGIONS ─── */
  buttocks: {
    id: "buttocks",
    name: "Buttocks & Gluteal Region",
    majorId: "buttocks",
    topSymptoms: [
      { id: "back_pain", name: "Gluteal Muscle Pain", rank: 1, severity: 3, description: "Deep muscular soreness in buttocks on sitting" },
      { id: "weakness_in_limbs", name: "Piriformis Sciatica", rank: 2, severity: 6, description: "Nerve pinch sensation in center of buttock" },
      { id: "hip_joint_pain", name: "Sacroiliac / Hip Joint Aches", rank: 3, severity: 4, description: "Tenderness over posterior pelvis" },
    ],
  },
  buttocks_core: {
    id: "buttocks_core",
    name: "Gluteus Maximus",
    majorId: "buttocks",
    topSymptoms: [
      { id: "back_pain", name: "Gluteal Spasm & Tenderness", rank: 1, severity: 3, description: "Muscle tenderness over gluteus maximus" },
      { id: "movement_stiffness", name: "Difficulty Rising from Chair", rank: 2, severity: 4, description: "Pain engaging hip extensors" },
    ],
  },
  hips: {
    id: "hips",
    name: "Hips & Greater Trochanter",
    majorId: "buttocks",
    topSymptoms: [
      { id: "hip_joint_pain", name: "Hip Joint Pain / Bursitis", rank: 1, severity: 4, description: "Aching over lateral hip bone on lying on that side" },
      { id: "painful_walking", name: "Trendelenburg Gait / Limp", rank: 2, severity: 4, description: "Discomfort bearing weight on affected hip" },
      { id: "movement_stiffness", name: "Restricted Hip Abduction", rank: 3, severity: 4, description: "Stiffness rotating hip inward or outward" },
    ],
  },
  rectum: {
    id: "rectum",
    name: "Rectum & Anal Canal",
    majorId: "buttocks",
    topSymptoms: [
      { id: "constipation", name: "Painful Defecation / Straining", rank: 1, severity: 5, description: "Sharp pain or tenesmus during bowel movement" },
      { id: "diarrhoea", name: "Rectal Urgency", rank: 2, severity: 5, description: "Sudden precipitous need to evacuate bowel" },
      { id: "itching", name: "Pruritus Ani / Anal Itch", rank: 3, severity: 3, description: "Irritation in perianal skin" },
    ],
  },
  tailbone: {
    id: "tailbone",
    name: "Tailbone & Coccyx",
    majorId: "buttocks",
    topSymptoms: [
      { id: "back_pain", name: "Coccydynia (Tailbone Pain)", rank: 1, severity: 5, description: "Sharp throbbing pain at base of spine when seated" },
      { id: "movement_stiffness", name: "Pain Transitioning Sitting to Standing", rank: 2, severity: 4, description: "Acute twinge over coccyx on standing up" },
    ],
  },

  /* ─── POSTERIOR LEGS SUB-REGIONS ─── */
  hamstring: {
    id: "hamstring",
    name: "Hamstrings (Posterior Thigh)",
    majorId: "legs_back",
    topSymptoms: [
      { id: "muscle_pain", name: "Hamstring Pull / Strain", rank: 1, severity: 4, description: "Sudden acute tightness in back of thigh" },
      { id: "cramps", name: "Posterior Thigh Spasm", rank: 2, severity: 4, description: "Involuntary contraction of hamstring tendon" },
      { id: "painful_walking", name: "Pain Extending Leg Forward", rank: 3, severity: 3, description: "Tight stretch behind thigh during strides" },
    ],
  },
  popliteal: {
    id: "popliteal",
    name: "Popliteal Fossa (Behind Knee)",
    majorId: "legs_back",
    topSymptoms: [
      { id: "knee_pain", name: "Back of Knee Fullness (Baker's Cyst)", rank: 1, severity: 4, description: "Tense fluid pocket behind knee joint" },
      { id: "movement_stiffness", name: "Posterior Knee Tightness on Squatting", rank: 2, severity: 4, description: "Pressure when bending knee completely" },
      { id: "swelling_joints", name: "Popliteal Effusion", rank: 3, severity: 4, description: "Soft swelling in posterior knee crease" },
    ],
  },
  calf: {
    id: "calf",
    name: "Calf & Gastrocnemius",
    majorId: "legs_back",
    topSymptoms: [
      { id: "cramps", name: "Calf Cramps (Charley Horse)", rank: 1, severity: 4, description: "Acute agonizing spasm in gastrocnemius muscle" },
      { id: "prominent_veins_on_calf", name: "Prominent / Varicose Veins", rank: 2, severity: 6, description: "Enlarged, tortuous, or visible veins on calf" },
      { id: "swollen_blood_vessels", name: "Swollen Calf Vessels (DVT Alert)", rank: 3, severity: 6, description: "Unilateral calf swelling, heat, or tenderness" },
      { id: "swollen_legs", name: "Lower Leg Edema", rank: 4, severity: 5, description: "Fluid retention around calves" },
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

  // Track responsive screen size
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

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
      (window as any).__cameraDebug = {
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

  const handleMeshPointerMove = (e: ThreeEvent<PointerEvent>) => {
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
        geometry={bakedGeometry}
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
}

export default function HumanBodyModel({
  activeSymptoms = [],
  onSymptomsChange,
  onSelectRegion,
}: HumanBodyModelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(true);

  // Two-Tier Mode & Selection State
  // mode: "full" = full body major category proxies active; "zoom" = framed sub-region proxies active
  const [selectMode, setSelectMode] = useState(false);
  const [mode, setMode] = useState<"full" | "zoom">("full");
  const [activeMajorId, setActiveMajorId] = useState<string | null>(null);
  const [activeSubRegionId, setActiveSubRegionId] = useState<string | null>(null);
  const [hoveredGroupId, setHoveredGroupId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);

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

  // Reset & Exit: clears symptoms, collapses zoom, returns to browse mode
  const handleReset = () => {
    if (onSymptomsChange) {
      onSymptomsChange([]);
    }
    setMode("full");
    setActiveMajorId(null);
    setActiveSubRegionId(null);
    setHoveredGroupId(null);
    setSearchQuery("");
    setIsExpanded(false);
    snapToFront();
  };

  // Return from ZOOM MODE to FULL MODE (smoothly zooms out to full body overview)
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
  const filteredTopSymptoms = useMemo(() => {
    if (!subRegionData) return [];
    if (!searchQuery.trim()) return subRegionData.topSymptoms;
    const q = searchQuery.toLowerCase().replace(/_/g, " ");
    return subRegionData.topSymptoms.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q) ||
        (s.description && s.description.toLowerCase().includes(q))
    );
  }, [subRegionData, searchQuery]);

  const filteredSecondarySymptoms = useMemo(() => {
    if (!subRegionData || !subRegionData.secondarySymptoms) return [];
    if (!searchQuery.trim()) return subRegionData.secondarySymptoms;
    const q = searchQuery.toLowerCase().replace(/_/g, " ");
    return subRegionData.secondarySymptoms.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q) ||
        (s.description && s.description.toLowerCase().includes(q))
    );
  }, [subRegionData, searchQuery]);

  // Count active symptoms in current region
  const activeSymptomsInRegionCount = useMemo(() => {
    if (!subRegionData) return 0;
    const allIds = [
      ...subRegionData.topSymptoms.map((s) => s.id),
      ...(subRegionData.secondarySymptoms || []).map((s) => s.id),
    ];
    return activeSymptoms.filter((id) => allIds.includes(id)).length;
  }, [subRegionData, activeSymptoms]);

  // Major categories for bottom dock matching current view
  const visibleMajors = useMemo(() => {
    const view = isBackView ? "back" : "front";
    return REGION_HIERARCHY.filter((m) => m.view === view);
  }, [isBackView]);

  return (
    <div
      ref={containerRef}
      className={`human-body-canvas-wrapper absolute inset-0 ${
        selectMode
          ? `z-30 pointer-events-auto ${hoveredGroupId ? "cursor-pointer" : "cursor-grab active:cursor-grabbing"}`
          : "z-0 pointer-events-none"
      }`}
      style={{ opacity: 0.85 }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {/* ─── Three.js WebGL Canvas ─────────────────────────────── */}
      <Canvas
        camera={{ position: [-1.25, 2.235, 6.38], fov: 45 }}
        dpr={[1, 2]}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: "low-power",
        }}
        style={{ background: "transparent" }}
        frameloop={inView ? "always" : "never"}
      >
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
                    ? "bg-[#3a5ebb] text-white font-bold"
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
                    ? "bg-[#3a5ebb] text-white font-bold"
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

      {/* ─── BROWSE MODE: Subtle Toggle Button ──────────────────── */}
      {!selectMode && (
        <div className="absolute bottom-4 right-4 sm:bottom-6 sm:right-8 pointer-events-auto z-20">
          <button
            type="button"
            onClick={handleEnterSelectMode}
            className="btn-3d flex items-center gap-2 px-3.5 py-2 sm:px-4 sm:py-2.5 rounded-full text-xs font-semibold text-[#203a80] shadow-md hover:shadow-lg border border-[#3a5ebb]/30 bg-white/90 backdrop-blur-md transition-all hover:scale-102"
            id="enter-select-mode-button"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#3a5ebb] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#3a5ebb]"></span>
            </span>
            <IconCrosshair size={15} className="text-[#3a5ebb]" />
            <span>Pinpoint on Body</span>
          </button>
        </div>
      )}

      {/* ─── SELECT MODE: Unified Floating Action Dock (Top Right) ─ */}
      {selectMode && (
        <div className="absolute top-4 right-4 sm:top-5 sm:right-6 pointer-events-auto flex items-center gap-2 z-30 animate-fade-in">
          <div className="flex items-center gap-1.5 p-1 sm:p-1.5 bg-white/92 backdrop-blur-xl border border-[#cbd5e1] rounded-2xl shadow-lg">
            {/* Anterior / Posterior Snap Switch */}
            <div className="flex items-center bg-slate-100/90 p-0.5 rounded-xl">
              <button
                type="button"
                onClick={snapToFront}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  !isBackView
                    ? "bg-white text-[#2a4693] shadow-xs border border-slate-200/80 font-bold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
                title="Front (Anterior) View"
                id="snap-front-button"
              >
                Front
              </button>
              <button
                type="button"
                onClick={snapToBack}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  isBackView
                    ? "bg-white text-[#2a4693] shadow-xs border border-slate-200/80 font-bold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
                title="Back (Posterior) View"
                id="snap-back-button"
              >
                Back
              </button>
            </div>

            {/* Divider */}
            <div className="w-[1px] h-5 bg-slate-200 mx-0.5" />

            {/* Reset / Clear */}
            <button
              type="button"
              onClick={handleReset}
              className="btn-3d px-3 py-1.5 text-xs font-semibold rounded-xl text-rose-700 hover:text-rose-900 border-rose-200 hover:border-rose-300 bg-rose-50/40 hover:bg-rose-50 flex items-center gap-1.5"
              title="Reset selections and return to full body view"
              id="reset-selection-button"
            >
              <IconRefresh size={13} />
              <span className="hidden sm:inline">Reset</span>
            </button>

            {/* Done / Exit Select Mode */}
            <button
              type="button"
              onClick={() => {
                setSelectMode(false);
                setMode("full");
                setActiveMajorId(null);
                setActiveSubRegionId(null);
              }}
              className="btn-3d-primary px-3.5 py-1.5 text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow-sm"
              title="Done with 3D selection"
              id="exit-select-mode-button"
            >
              <IconClose size={13} />
              <span>Done</span>
            </button>
          </div>
        </div>
      )}

      {/* ─── ZOOM MODE: Visible Floating "Back" Control ──────────── */}
      {selectMode && mode === "zoom" && (
        <div
          className={`absolute ${
            process.env.NODE_ENV !== "production" ? "top-14" : "top-4"
          } left-4 sm:left-6 pointer-events-auto z-30 animate-fade-in`}
        >
          <button
            type="button"
            onClick={handleBackToFullMode}
            className="btn-3d flex items-center gap-2 px-3.5 py-2 sm:px-4 sm:py-2.5 rounded-2xl text-xs font-bold text-[#2a4693] bg-white/92 backdrop-blur-xl border border-[#cbd5e1] shadow-lg hover:shadow-xl hover:bg-white transition-all hover:scale-102"
            id="zoom-back-button"
          >
            <IconArrowLeft size={14} className="text-[#3a5ebb]" />
            <span>Back to Full Body</span>
            {activeMajor && (
              <span className="hidden sm:inline-block px-2 py-0.5 rounded-md bg-[#3a5ebb]/10 text-[#3a5ebb] text-[11px] font-semibold">
                {activeMajor.label}
              </span>
            )}
          </button>
        </div>
      )}

      {/* ─── ZOOM MODE: Hover Feedback Badge ─────────────────────── */}
      {selectMode && mode === "zoom" && (
        <div className="absolute bottom-5 left-4 sm:left-6 pointer-events-auto z-20 flex items-center gap-2 animate-fade-in">
          <div className="px-3.5 py-1.5 rounded-full bg-slate-900/85 backdrop-blur-md text-white text-[11px] font-medium shadow-md flex items-center gap-2 transition-all">
            {hoveredGroupId ? (
              <span className="flex items-center gap-1.5 text-cyan-300 font-semibold">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                {activeMajor?.subRegions?.find((s) => s.id === hoveredGroupId)?.label ||
                  REGION_SYMPTOMS[hoveredGroupId]?.name ||
                  hoveredGroupId}
                {" • Click to inspect symptoms"}
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-slate-200">
                <IconCrosshair size={12} className="text-cyan-400" />
                Hover anatomical areas • Click to switch sub-region
              </span>
            )}
          </div>
        </div>
      )}

      {/* ─── FULL MODE: Bottom Major Category Dock ─────────────── */}
      {selectMode && mode === "full" && (
        <div className="absolute bottom-5 inset-x-0 mx-auto max-w-xl px-4 pointer-events-auto z-20 flex flex-col items-center gap-2 animate-fade-in">
          {/* Hover Feedback Badge */}
          <div className="px-3.5 py-1.5 rounded-full bg-slate-900/85 backdrop-blur-md text-white text-[11px] font-medium shadow-md flex items-center gap-2 transition-all">
            {hoveredGroupId ? (
              <span className="flex items-center gap-1.5 text-cyan-300 font-semibold">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                {REGION_SYMPTOMS[hoveredGroupId]?.name || hoveredGroupId}
                {visibleMajors.find((m) => m.id === hoveredGroupId && (!m.subRegions || m.subRegions.length === 0))
                  ? " • Click to select"
                  : " • Click to zoom & inspect"}
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-slate-200">
                <IconCrosshair size={12} className="text-cyan-400" />
                Hover to illuminate • Click any major section to zoom in
              </span>
            )}
          </div>

          {/* Major Section Selector Dock */}
          <div className="flex items-center justify-center gap-1 sm:gap-1.5 p-1 sm:p-1.5 bg-white/92 backdrop-blur-xl rounded-2xl border border-[#cbd5e1] shadow-xl overflow-x-auto max-w-full">
            {visibleMajors.map((major) => (
              <button
                key={major.id}
                type="button"
                onClick={() => handleSelectMajor(major)}
                onPointerEnter={() => setHoveredGroupId(major.id)}
                onPointerLeave={() => setHoveredGroupId(null)}
                className="px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:text-slate-900 hover:bg-slate-100/90 transition-all whitespace-nowrap flex items-center gap-1"
              >
                <span>{major.label}</span>
                {major.bilateral && (
                  <span className="text-[10px] text-slate-400 font-mono">2x</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ─── ZOOM MODE (or Leaf Selected): Clinical Inspector Drawer ── */}
      {selectMode && (mode === "zoom" || activeSubRegionId) && (
        <div
          className="absolute right-3 sm:right-6 top-18 bottom-4 sm:bottom-6 w-full max-w-sm sm:max-w-md bg-white/95 backdrop-blur-2xl border border-[#cbd5e1] rounded-3xl shadow-2xl p-4 sm:p-5 flex flex-col z-20 pointer-events-auto animate-slide-in-right overflow-hidden"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {/* Drawer Header with Back-To-Full-Body Button */}
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-3">
            <button
              type="button"
              onClick={handleBackToFullMode}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#3a5ebb] hover:text-[#1c337a] bg-[#3a5ebb]/10 hover:bg-[#3a5ebb]/18 px-3 py-1.5 rounded-xl transition-all"
              id="drawer-full-body-button"
            >
              <IconArrowLeft size={13} />
              <span>Full Body</span>
            </button>

            <div className="flex items-center gap-2">
              <span className="text-xs font-extrabold text-slate-900">
                {activeMajor ? activeMajor.label : subRegionData?.name}
              </span>
              {activeSymptomsInRegionCount > 0 && (
                <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-red-100 text-red-700 border border-red-200">
                  {activeSymptomsInRegionCount} active
                </span>
              )}
            </div>
          </div>

          {/* Sub-Region Selector Tabs (Zoom Mode) */}
          {activeMajor && activeMajor.subRegions && activeMajor.subRegions.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap mb-3 max-h-24 overflow-y-auto pr-1">
              {activeMajor.subRegions.map((sub) => {
                const isSubActive = activeSubRegionId === sub.id;
                const isSubHovered = hoveredGroupId === sub.id;
                return (
                  <button
                    key={sub.id}
                    type="button"
                    onClick={() => {
                      onSelectRegion?.({
                        majorId: activeMajor.id,
                        subRegionId: sub.id,
                      });
                      setActiveSubRegionId(sub.id);
                      setSearchQuery("");
                      setIsExpanded(false);
                    }}
                    onPointerEnter={() => setHoveredGroupId(sub.id)}
                    onPointerLeave={() => setHoveredGroupId(null)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
                      isSubActive
                        ? "bg-[#3a5ebb] text-white shadow-sm ring-2 ring-[#3a5ebb]/30"
                        : isSubHovered
                        ? "bg-cyan-50 text-cyan-800 ring-2 ring-cyan-400 font-bold shadow-xs scale-102"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    <span>{sub.label}</span>
                    {sub.bilateral && (
                      <span className="text-[10px] opacity-75 font-mono">2x</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Symptom Search Filter inside Region */}
          <div className="relative mb-3">
            <IconSearch
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`Search ${subRegionData?.name || "region"} symptoms...`}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-[#3a5ebb] transition-colors"
            />
          </div>

          {/* Scrollable Symptom Checklist */}
          <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
            {filteredTopSymptoms.map((sym) => {
              const isSelected = activeSymptoms.includes(sym.id);
              return (
                <button
                  key={sym.id}
                  type="button"
                  onClick={() => toggleSymptom(sym.id)}
                  className={`w-full text-left p-2.5 rounded-xl text-xs transition-all flex items-center justify-between border ${
                    isSelected
                      ? "bg-[#3a5ebb]/10 border-[#3a5ebb] text-[#1c337a] shadow-xs"
                      : "bg-white border-slate-200 hover:bg-slate-50 text-slate-800"
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0 pr-2">
                    <div
                      className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                        isSelected
                          ? "bg-[#3a5ebb] border-[#3a5ebb] text-white"
                          : "border-slate-300 bg-white"
                      }`}
                    >
                      {isSelected && <IconCheck size={11} />}
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{sym.name}</div>
                      {sym.description && (
                        <div className="text-[11px] text-slate-500 truncate font-normal">
                          {sym.description}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                      Rank #{sym.rank}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        sym.severity >= 6
                          ? "bg-red-100 text-red-700"
                          : sym.severity >= 4
                          ? "bg-amber-100 text-amber-700"
                          : "bg-emerald-100 text-emerald-700"
                      }`}
                    >
                      Sev {sym.severity}
                    </span>
                  </div>
                </button>
              );
            })}

            {/* Expand Secondary Symptoms */}
            {subRegionData?.secondarySymptoms &&
              subRegionData.secondarySymptoms.length > 0 &&
              !searchQuery && (
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="w-full py-2 text-center text-xs font-semibold text-[#3a5ebb] hover:text-[#25428a] flex items-center justify-center gap-1 rounded-xl hover:bg-[#3a5ebb]/05 transition-colors"
                  >
                    <span>
                      {isExpanded
                        ? "Show fewer symptoms"
                        : `Show ${subRegionData.secondarySymptoms.length} more symptoms`}
                    </span>
                    {isExpanded ? (
                      <IconChevronUp size={13} />
                    ) : (
                      <IconChevronDown size={13} />
                    )}
                  </button>

                  {isExpanded && (
                    <div className="space-y-1.5 pt-1 animate-slide-up">
                      {filteredSecondarySymptoms.map((sym) => {
                        const isSelected = activeSymptoms.includes(sym.id);
                        return (
                          <button
                            key={sym.id}
                            type="button"
                            onClick={() => toggleSymptom(sym.id)}
                            className={`w-full text-left p-2.5 rounded-xl text-xs transition-all flex items-center justify-between border ${
                              isSelected
                                ? "bg-[#3a5ebb]/10 border-[#3a5ebb] text-[#1c337a] shadow-xs"
                                : "bg-white border-slate-200 hover:bg-slate-50 text-slate-800"
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0 pr-2">
                              <div
                                className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                                  isSelected
                                    ? "bg-[#3a5ebb] border-[#3a5ebb] text-white"
                                    : "border-slate-300 bg-white"
                                }`}
                              >
                                {isSelected && <IconCheck size={11} />}
                              </div>
                              <div className="min-w-0">
                                <div className="font-semibold truncate">{sym.name}</div>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                                Rank #{sym.rank}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

            {filteredTopSymptoms.length === 0 && (
              <div className="text-center py-6 text-xs text-slate-500">
                No matching symptoms found in this region.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

useGLTF.preload("/human_body.glb");
