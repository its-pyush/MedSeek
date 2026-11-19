/**
 * Body areas for every symptom in the knowledge base.
 *
 *   npm run kb:areas:build   rules below → data/kb/symptom_areas.json
 *   npm run kb:areas:check   every symptom has ≥1 valid area (also run by build)
 *   npm run kb:areas         writes symptoms.body_areas in DATABASE_URL (UPDATE only)
 *
 * The areas are editorial: word rules written by hand and by a model, reviewed
 * by reading the output. They say where on the body a symptom is felt or
 * seen, not what causes it. Area ids come from data/kb/body_regions.json (the
 * 3D body picker's areas and parts) plus three groups with no place on the
 * body: "general", "skin", "mind".
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KB_DIR = path.join(__dirname, "..", "..", "data", "kb");
export const AREAS_PATH = path.join(KB_DIR, "symptom_areas.json");
const REGIONS_PATH = path.join(KB_DIR, "body_regions.json");
const KB_PATH = path.join(KB_DIR, "medseek_kb.json");

const MAX_AREAS = 3;

interface BodyRegions {
  areas: { id: string; label: string; parts: { id: string; label: string }[] }[];
  groups: { id: string; label: string }[];
}

export interface SymptomAreasFile {
  _about: string;
  areas: Record<string, string[]>;
}

export function loadValidAreaIds(): { valid: Set<string>; parentOf: Map<string, string> } {
  const regions: BodyRegions = JSON.parse(fs.readFileSync(REGIONS_PATH, "utf-8"));
  const valid = new Set<string>();
  const parentOf = new Map<string, string>();
  for (const area of regions.areas) {
    valid.add(area.id);
    for (const part of area.parts) {
      valid.add(part.id);
      if (part.id !== area.id) parentOf.set(part.id, area.id);
    }
  }
  for (const g of regions.groups) valid.add(g.id);
  return { valid, parentOf };
}

/* ─── Rules ──────────────────────────────────────────────────────
 * Each rule: a pattern on the symptom name → the areas it adds.
 * A symptom gets the areas of every rule that matches, most specific first,
 * capped at MAX_AREAS. `only: true` stops at that rule (used for exceptions
 * that would otherwise be caught by a broader word, e.g. "facial hair").
 */
type Rule = { re: RegExp; areas: string[]; only?: boolean };
const r = (re: RegExp, areas: string[], only = false): Rule => ({ re, areas, only });

const RULES: Rule[] = [
  /* ── Exceptions first ── */
  r(/facial hair|body hair|excess hair growth|coarse hair growth|changes in hair growth|fine body hair|hair tuft/, ["skin"], true),
  r(/eating pulled hair|hair pulling/, ["mind", "scalp"], true),
  r(/falling back asleep|falling asleep|decreased need for sleep/, ["mind"], true),
  r(/reaching behind back|reaching overhead|raising arms|combing hair/, ["shoulder"], true),
  r(/back prominence|curved spine|back dimple/, ["back"], true),
  r(/heart ?burn|acid reflux|regurgitation/, ["epigastric", "chest_core"], true),
  r(/swelling lymph nodes|swollen lymph|lymph node/, ["neck", "armpit", "groin"], true),
  r(/jaundice|yellow(ing)? (skin|eyes)|yellow eye/, ["skin", "eyes"], true),
  r(/cold hands and feet/, ["hand", "foot"], true),
  r(/blood pressure|blood sugar|diabetes|anemia|blood clots|adrenal crisis/, ["general"], true),
  r(/chest infections|lung infections|respiratory infections/, ["chest"], true),
  r(/ear infection/, ["ears"], true),
  r(/yeast infection/, ["genital"], true),
  r(/hearing voices|eye contact|avoiding reading|difficulty reading emotions|fear of |worry about/, ["mind"], true),
  r(/flakes on shoulders/, ["scalp"], true),
  r(/fat hump between shoulders/, ["upper_back"], true),
  r(/shoulder blade/, ["upper_back"], true),
  r(/hand washing|hand flapping|hand wringing/, ["mind"], true),
  r(/sound sensitivity|sensitivity to (sound|noise)/, ["ears"], true),
  r(/light sensitivity|sensitivity to light/, ["eyes"], true),
  r(/night sweats|sweat/, ["general", "skin"], true),
  r(/nail|clubbing/, ["fingers", "toes"], true),
  r(/toe ?nail/, ["toes"], true),
  r(/walking on toes|toe walking/, ["legs", "toes"], true),
  r(/weak push off|foot drop|foot drag|foot slapping/, ["foot", "ankle"], true),
  r(/drawing up of legs/, ["abdomen"], true),
  r(/bleeding after dental work|bleeding gums/, ["mouth"], true),
  r(/bleeding after (surgery|childbirth)|easy bleeding|excessive bleeding|^bleeding$|heavy bleeding/, ["general"], true),
  r(/gastrointestinal bleeding/, ["abdomen"], true),
  r(/brain bleeding/, ["head"], true),
  r(/postnasal|post nasal/, ["nose", "neck"], true),
  r(/morning sickness/, ["abdomen"], true),
  r(/mouth breathing/, ["nose", "mouth"], true),
  r(/breath odor|bad breath|fruity breath/, ["mouth"], true),
  r(/breath holding/, ["chest", "mind"], true),
  r(/stomach growling|hunger/, ["abdomen"], true),
  r(/weight|^(slow|rapid|poor) growth$|failure to thrive|failure to grow|short stature|tall stature|puberty/, ["general"], true),
  r(/thirst/, ["general", "mouth"], true),

  /* ── Head ── */
  r(/scalp|\bhair|bald|dandruff/, ["scalp"]),
  r(/forehead|sinus/, ["forehead"]),
  r(/temple/, ["forehead"]),
  r(/\beyes?\b|eyelid|eyelash|eyebrow|vision|visual|blind|pupil|floaters|halos|glare|tearing|watery eyes|squint|cataract|glaucoma|seeing|colors\b|color vision|confusing (blue|red)|judging distance|iris|cornea|looking upward|staring|wide eyed|glassy eyed|black dots|flashes|spots in/, ["eyes"]),
  r(/\bnose\b|nasal|nostril|sneez|smell|snor|congestion|runny|stuffy/, ["nose"]),
  r(/\bface\b|facial|cheek|grimac|fixed grin/, ["face"]),
  r(/mouth|\blips?\b|tongue|teeth|tooth|\bgums?\b|taste|saliva|drool|dental|denture|palate|chew|bitter|cold sore|canker|thrush|suck/, ["mouth"]),
  r(/\bjaw\b|\bchin\b/, ["jaw"]),
  r(/\bears?\b|earache|earlobe|hearing|tinnitus|ringing|deaf|locating sound|whooshing/, ["ears"]),
  r(/headache|migraine|\bhead\b|dizz|vertigo|faint|lighthead|seizure|convulsion|passing out|loss of consciousness|unconscious|blackout|coma\b|spinning|skull|soft spot|concussion|stroke/, ["head"]),

  /* ── Neck ── */
  r(/\bneck\b|throat|swallow|hoarse|voice|goiter|thyroid|tonsil|choking|gagging|adam|gulp|food stuck|pitch/, ["neck"]),

  /* ── Chest ── */
  r(/breast|nipple|gynecomastia|lactation|milk/, ["breast"]),
  r(/collarbone/, ["upper_chest"]),
  r(/chest|breath|cough|wheez|\blungs?\b|heart|palpitation|sputum|phlegm|\bmucus (production|discharge)|clearing mucus|blood in mucus|respiratory|gasping|pulse|\bribs?\b|cardiac|whooping|hiccup|grunting|stridor|airway/, ["chest"]),

  /* ── Belly ── */
  r(/diarrhea|constipation|bowel|\bgas\b|flatulence/, ["lower_abdomen"]),
  r(/stool|fecal|defecat/, ["rectum", "lower_abdomen"]),
  r(/indigestion|belch|burp|feeling full|fullness after|upper abdominal/, ["epigastric"]),
  r(/abdom|belly|stomach|nausea|vomit|bloating|digest|appetite|liver|spleen|\bgut\b|navel|umbilical|\beating|overeating|food|feeding|intestin|hernia/, ["abdomen"]),

  /* ── Pelvis ── */
  r(/\burin|bladder|bedwetting|\bpee\b|dialysis/, ["above_pubic_bone"]),
  r(/genital|vagin|vulva|penis|penile|testic|scrot|erect|ejacul|orgasm|labia|clitoris|foreskin|semen|urethra\b|sexual|\bsex\b|urethral|libido|intercourse/, ["genital"]),
  r(/period|menstru|uter|pelvi|pregnan|fetal|contractions|labor|menopause|ovar|cervi|puberty|infertil|miscarriage|hot flash/, ["pelvic_core"]),
  r(/groin|inguinal/, ["groin"]),
  r(/^(discharge|bloody discharge|cheesy discharge|frothy discharge|fluid discharge|fishy odor)$/, ["genital"]),

  /* ── Back and buttocks ── */
  r(/lower back|low back|lumbar/, ["lower_back"]),
  r(/upper back/, ["upper_back"]),
  r(/flank|kidney/, ["flank"]),
  r(/\bback\b|spine|spinal|posture|stoop|hunch/, ["back"]),
  r(/tailbone|coccyx/, ["tailbone"]),
  r(/\banal\b|anus|\brect|hemorrhoid|toilet paper/, ["rectum"]),
  r(/buttock/, ["buttocks_core"]),
  r(/\bhips?\b/, ["hips"]),

  /* ── Arms ── */
  r(/shoulder/, ["shoulder"]),
  r(/armpit|underarm/, ["armpit"]),
  r(/upper arm|bicep|tricep/, ["upper_arm"]),
  r(/elbow/, ["elbow"]),
  r(/forearm/, ["forearm"]),
  r(/wrist/, ["wrist"]),
  r(/\bhands?\b|\bpalms?\b|grip|fists?\b|handwriting|dropping (objects|things)|clumsy hands|fine motor|using objects|lifting objects/, ["hand"]),
  r(/finger|thumb|knuckle/, ["fingers"]),
  r(/\barms?\b/, ["arms"]),

  /* ── Legs ── */
  r(/hamstring/, ["hamstring"]),
  r(/thigh/, ["thigh"]),
  r(/\bknees?\b|kneecap/, ["knee"]),
  r(/\bshins?\b/, ["shin"]),
  r(/\bcalf\b|calves/, ["calf"]),
  r(/ankle|achilles/, ["ankle"]),
  r(/\bfoot\b|\bfeet\b|\bheels?\b|\barch\b|\bsole|forefoot|flat footed|wearing shoes|instep/, ["foot"]),
  r(/\btoes?\b|bunion/, ["toes"]),
  r(/\blegs?\b|walking$|trouble walking|delayed walking|gait|limp|climbing stairs|bearing weight|standing up|rising from chair|stumbl|tripping|shuffl/, ["legs"]),

  /* ── Skin ── */
  r(/\bskin|\brash|\bitch|blister|hives|acne|pimple|\bmoles?\b|wart|bruis|\bsores?\b|\bscars?\b|freckle|flush|\bpale|pallor|\bbumps?\b|\bboil|ulcer|lesion|wrinkle|blackhead|whitehead|birthmark|callus|corns\b|burns?\b|\bcuts\b|wound|scab|scal(es|ing|y)|crust|welt|spots?\b|patch|nodule|cyst|abscess|xanthoma|stretch marks|peeling|flak|burrow|bite marks|gangrene|fine lines|dimpl|pus\b|drain|ooz|growths?\b|\blumps?\b|\bmass\b|veins?\b|redness|discolor|color change|tan\b|sunburn/, ["skin"]),

  /* ── Mind and mood ── */
  r(/anxi|depress|mood|fear|worr|behavio|memory|forget|confus|hallucin|delusion|thought|thinking|emotion|irritab|anger|angry|concentrat|attention|learning|panic|stress|nervous|restless|agitat|aggress|apathy|euphoria|guilt|shame|sad|crying|grief|lonel|obsess|compuls|impuls|paranoi|suspic|disorient|personality|judgment|decision|planning|social|withdraw|isolat|interest|motivation|self|suicid|nightmare|dream|sleep|insomnia|awake|waking|drows|nap|alert|trance|daydream|dementia|cognitive|iq\b|intellectual|developmental|milestone|school|reading|math|rhym|speech|speak|words?\b|stutter|language|talk|understanding|hyperactiv|fidget|tantrum|outburst|defian|argu|lying|stealing|gambl|crav|addict|alcohol|drug|binge|purg|fasting|body image|gender|identity|detach|unreal|emotional numbness|feeling empty|emptiness|hopeless|worthless|envy|arrogan|bragg|admiration|empathy|manipul|trust|abandon|relationship|hoard|clutter|items|belongings|checking|counting|ritual|tics?\b|flashback|startl|vigilan|avoid|distress|frustrat|embarrass|boredom|deja vu|time\b|lost\b|wander|clingi|fussi|tearful|laugh|humor|doctor visits|hospital visits|prescription|financial|work problems|legal|arrest|losses/, ["mind"]),

  /* ── Whole body ── */
  r(/fever|chills|fatigue|tired|exhaust|weak|malaise|unwell|dehydrat|aches?\b|aching|\bpain$|^pain|infection|bleeding|swelling|stiffness|temperature|cold intolerance|heat intolerance|feeling cold|shiver|tremor|shak|twitch|spasm|cramps?\b|numb|tingl|paralysis|muscle|bone|joint|fracture|broken|balance|coordination|clums|falls?\b|movement|reflex|energy|letharg|sluggish|appetite|fluid|edema|dehydration|odor|immune|allerg|deform|asymmetr|heaviness|stamina|exercise|exertion|sensation|sensitiv|shock|collapse|delayed|early\b|puberty|aging|frail|injur/, ["general"]),
];

/** Hand-set areas for names the word rules get wrong or miss. */
const OVERRIDES: Record<string, string[]> = {
  "dizziness": ["head"],
  "difficulty multitasking": ["mind"],
  "trouble multitasking": ["mind"],
  "reduced muscle mass": ["general"],
  "joint redness": ["general"],
  "pubic hair": ["skin"],
  "underarm hair": ["skin"],
  "foul smelling urine": ["above_pubic_bone"],
  "strong smelling urine": ["above_pubic_bone"],
  "leaking when sneezing": ["above_pubic_bone"],
  "clubbing of fingers": ["fingers"],
  "nail biting": ["mind", "fingers"],
  "difficulty rising from chair": ["legs", "hips"],
  "incomplete emptying": ["above_pubic_bone"],
  "repeating sounds": ["mouth", "mind"],
  "thrashing": ["general"],
  "trouble repeating phrases": ["mind"],
  "unsuccessful attempts to cut back": ["mind"],
  "sensitivity to criticism": ["mind"],
  "pain with tampon use": ["genital"],
  "perineal pain": ["genital"],
  "postmenopausal bleeding": ["pelvic_core"],
  "tenderness over shinbone": ["shin"],
  "side pain": ["flank"],
  "abdominal obesity": ["abdomen"],
  "pain when biting": ["mouth", "jaw"],
  "pain when kneeling": ["knee"],
  "pain when squatting": ["knee"],
  "pain when jumping": ["knee"],
  "stair pain": ["knee"],
  "pain climbing stairs": ["knee"],
  "pain on first steps": ["foot"],
  "sensation of a pebble in shoe": ["foot"],
  "pain when sitting": ["buttocks_core", "tailbone"],
  "pain after sitting": ["buttocks_core", "tailbone"],
  "pain with sitting": ["buttocks_core", "tailbone"],
  "sun sensitivity": ["skin"],
  "leaking when coughing": ["above_pubic_bone"],
  "mucus in stool": ["rectum", "lower_abdomen"],
  "difficulty breathing through nose": ["nose"],
  "blocked walkways": ["mind"],
  "sleepwalking": ["mind"],
  "walking while asleep": ["mind"],
  "fatigue during sex": ["general"],
  "compulsive sexual thoughts": ["mind"],
  "unwanted sexual thoughts": ["mind"],
  "preoccupation with sex": ["mind"],
  "regret after sexual behavior": ["mind"],
  "sexualized behavior": ["mind"],
  "avoiding sex": ["mind"],
  "leg pain when walking": ["calf", "legs"],
  "walking on toes": ["legs", "toes"],
  "wart like growth": ["skin"],
  "cauliflower like growths": ["skin"],
  "clustered growths": ["skin"],
  "empty socket": ["mouth"],
  "emptiness": ["mind"],
  "itching rash": ["skin"],
  "cramping": ["general"],
  "difficulty following directions": ["mind"],
  "unusual discharge": ["genital"],
  "balance problems": ["head"],
  "loss of balance": ["head"],
  "muscle cramps": ["general"],
  "mouth sores": ["mouth"],
  "confusion": ["mind", "head"],
  "numbness": ["general"],
  "tingling": ["general"],
  "weakness": ["general"],
  "swelling": ["general"],
  "nausea": ["abdomen"],
  "vomiting": ["abdomen"],
  "loss of appetite": ["abdomen", "general"],
  "trouble swallowing": ["neck"],
  "sore throat": ["neck"],
  "shortness of breath": ["chest"],
  "wheezing": ["chest"],
  "cough": ["chest", "neck"],
  "trouble walking": ["legs"],
  "trouble speaking": ["mouth", "mind"],
  "slurred speech": ["mouth", "head"],
  "memory loss": ["mind"],
  "seizures": ["head"],
  "fainting": ["head"],
  "bruising": ["skin"],
  "itching": ["skin"],
  "skin rash": ["skin"],
  "joint pain": ["general"],
  "muscle pain": ["general"],
  "bone pain": ["general"],
  "pain": ["general"],
  "trouble sleeping": ["mind"],
  "sleepiness": ["mind"],
  "fussiness": ["mind"],
  "snoring": ["nose", "neck"],
  "hot flashes": ["general"],
  "abnormal discharge": ["genital"],
  "blood in stool": ["rectum", "lower_abdomen"],
  "blood in urine": ["above_pubic_bone", "flank"],
  "coughing up blood": ["chest"],
  "vomiting blood": ["abdomen"],
  "nosebleeds": ["nose"],
  "nosebleed": ["nose"],
  "drooling": ["mouth"],
  "hiccups": ["chest", "abdomen"],
  "frequent infections": ["general"],
  "sciatica": ["lower_back", "hamstring"],
};

/** Names no word rule catches, assigned by hand, grouped by area to keep the list readable. */
const HAND_ASSIGNED: [string[], string][] = [
  [["mind"], "blaming others|body dissatisfaction|body feels distorted|careless mistakes|coldness toward others|deliberately annoying others|difficulty accepting the death|difficulty bonding with baby|difficulty controlling urges|difficulty driving|difficulty recognizing music patterns|difficulty singing in tune|difficulty waiting turn|difficulty with complex tasks|difficulty with daily routines|difficulty with daily tasks|discomfort with body changes|disorganization|disorganized piles|falling out of bed|false memories|feeling high|feeling like a robot|feeling of losing control|flat affect|groaning|hidden insecurity|illness preoccupation|impatience|inability to enjoy life|increased errors|indifference to praise|interrupting others|intrusive memories|irresponsibility|kicking|lack of pretend play|lack of remorse|laxative use|long sleeves|longing for the deceased|loss of control|loss of meaning in life|mental fog|mental health problems|mind going blank|missed appointments|missed deadlines|missed work|money problems|morning cigarette use|need for order|need for reassurance|neglecting responsibilities|not responding to name|odd beliefs|odd dress|physical fights|pica|poor hygiene|poor organization|preference for being alone|preoccupation with death|property damage|punching|pushing|reassurance seeking|recurring urges|refusing rules|reluctance to be comforted|repeated questions|resentfulness|resistance to change|saying goodbye|screaming|sense of entitlement|sense of impending doom|sensing a presence|shouting|skipping meals|smiling|spelling difficulty|spelling problems|substance use|swearing|taking advantage of others|theft|trouble coping|trouble finishing tasks|trouble following conversation|trouble forming new memories|trouble getting dressed|trouble recognizing faces|trouble recognizing objects|trouble remembering sequences|trouble settling|trouble starting conversations|trouble staying seated|trouble using everyday tools|trouble with daily tasks|trouble with familiar tasks|trouble with learned tasks|trouble writing|unable to cut down drinking|urge to steal|vindictiveness"],
  [["mouth", "mind"], "limited vocabulary|omitted sounds|pauses between syllables|reduced babbling|sound substitution|voicing errors"],
  [["head"], "lapse in awareness|stop in activity|unresponsiveness"],
  [["face"], "trouble smiling"],
  [["eyes"], "blinking|dark circles|holding objects farther away|nearsightedness|night driving difficulty|nystagmus|poor depth perception|surroundings look flat|trouble focusing up close"],
  [["scalp"], "nits|visible lice|premature graying"],
  [["neck"], "tight collar feeling"],
  [["chest"], "orthopnea|pneumonia|sitting up in bed|tet spells"],
  [["abdomen"], "feeling of fullness|uncomfortable fullness|gurgling sound|retching|refusal to feed"],
  [["rectum"], "passing worms|straining|soiled underwear"],
  [["above_pubic_bone"], "leaking when bending over|leaking when exercising|leaking when lifting|urge incontinence|urgency|vesicoureteral reflux"],
  [["genital"], "difficulty becoming aroused|hypospadias|tampon falling out|protruding tissue"],
  [["pelvic_core"], "passing tissue|primary amenorrhea|spotting"],
  [["back"], "scoliosis|uneven waist"],
  [["fingers", "toes"], "raynaud phenomenon"],
  [["skin"], "petechiae|raised border|rawness|scarring|scratches|spider angiomas|tissue blackening|visible blood vessels"],
  [["general"], "clicking|giving way|inconsistent symptoms|instability|irritation|limited mobility|limited range of motion|locking|long limbs|loss of body fat|loss of height|loss of motor skills|malnutrition|motion|poor response to treatment|popping sound|small size|soreness|spasticity|stiffening of body|stinging|stretching sounds|tender knot|tenderness|tension|thickened tendon|throbbing|tightness|vague symptoms|warmth|worsening condition"],
];
for (const [areas, names] of HAND_ASSIGNED) for (const name of names.split("|")) OVERRIDES[name] ??= areas;

function specificFirst(ids: string[], parentOf: Map<string, string>): string[] {
  // A part makes its own area redundant ("knee" + "legs" → "knee").
  const set = new Set(ids);
  for (const id of ids) {
    const parent = parentOf.get(id);
    if (parent) set.delete(parent);
  }
  return [...set];
}

export function areasFor(name: string, parentOf: Map<string, string>): string[] {
  const override = OVERRIDES[name];
  if (override) return override;
  const found: string[] = [];
  for (const rule of RULES) {
    if (!rule.re.test(name)) continue;
    if (rule.only) return rule.areas;
    for (const a of rule.areas) if (!found.includes(a)) found.push(a);
  }
  const specific = specificFirst(found, parentOf);
  // A place on the body beats the catch-all groups when both matched.
  const body = specific.filter((a) => !["general", "skin", "mind"].includes(a));
  const ranked = body.length ? body : specific;
  const withoutGeneral = ranked.filter((a) => a !== "general");
  return (withoutGeneral.length ? withoutGeneral : ranked).slice(0, MAX_AREAS);
}

function readKbSymptomNames(): string[] {
  const kb = JSON.parse(fs.readFileSync(KB_PATH, "utf-8")) as { symptoms: { name: string }[] };
  return kb.symptoms.map((s) => s.name);
}

export function readAreas(): Record<string, string[]> {
  if (!fs.existsSync(AREAS_PATH)) return {};
  return (JSON.parse(fs.readFileSync(AREAS_PATH, "utf-8")) as SymptomAreasFile).areas;
}

function build() {
  const { parentOf } = loadValidAreaIds();
  const names = readKbSymptomNames().sort();
  const areas: Record<string, string[]> = {};
  const unmatched: string[] = [];
  for (const name of names) {
    const found = areasFor(name, parentOf);
    if (found.length === 0) unmatched.push(name);
    else areas[name] = found;
  }
  if (unmatched.length) {
    console.error(`${unmatched.length} symptoms matched no rule — add a rule or an override:\n${unmatched.join(", ")}`);
    process.exit(1);
  }
  const file: SymptomAreasFile = {
    _about:
      "Where on the body each knowledge-base symptom is felt or seen. Editorial, made from the word rules in scripts/kb/areas.ts (`npm run kb:areas:build`), not measured data. Ids are areas/parts from body_regions.json, or the groups general / skin / mind.",
    areas,
  };
  fs.writeFileSync(AREAS_PATH, JSON.stringify(file, null, 1) + "\n");
  console.log(`Wrote ${AREAS_PATH}: ${names.length} symptoms`);
}

export function check(): string[] {
  const { valid } = loadValidAreaIds();
  const areas = readAreas();
  const problems: string[] = [];
  for (const name of readKbSymptomNames()) {
    const ids = areas[name];
    if (!ids || ids.length === 0) problems.push(`no area: ${name}`);
    else for (const id of ids) if (!valid.has(id)) problems.push(`unknown area "${id}" on: ${name}`);
  }
  return problems;
}

function report() {
  const areas = readAreas();
  const counts: Record<string, number> = {};
  for (const ids of Object.values(areas)) for (const id of ids) counts[id] = (counts[id] ?? 0) + 1;
  console.log(
    Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([id, n]) => `${id} ${n}`)
      .join(" · ")
  );
}

async function writeToDatabase() {
  const problems = check();
  if (problems.length) throw new Error(`symptom_areas.json is not valid:\n${problems.slice(0, 20).join("\n")}`);
  const { default: pg } = await import("pg");
  const { env } = await import("../../src/config/env.js");
  const pool = new pg.Pool({
    connectionString: env.DATABASE_URL,
    ssl: env.NODE_ENV === "production" ? { rejectUnauthorized: true } : { rejectUnauthorized: false },
  });
  try {
    const areas = readAreas();
    const names = Object.keys(areas);
    // One statement: only body_areas changes; no rows are added or removed.
    const result = await pool.query(
      `UPDATE symptoms s
          SET body_areas = v.areas
         FROM (SELECT * FROM unnest($1::text[], $2::text[]) AS t(name, areas_json)) raw
         CROSS JOIN LATERAL (SELECT ARRAY(SELECT jsonb_array_elements_text(raw.areas_json::jsonb)) AS areas) v
        WHERE s.name = raw.name`,
      [names, names.map((n) => JSON.stringify(areas[n]))]
    );
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE cardinality(body_areas) = 0)::int AS untagged FROM symptoms`
    );
    console.log(`Updated ${result.rowCount} symptoms. In the database: ${rows[0].total} symptoms, ${rows[0].untagged} without an area.`);
  } finally {
    await pool.end();
  }
}

// CLI — only when this file is the script being run (seed.ts imports it too).
const isCli = process.argv[1] ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false;
const command = isCli ? process.argv[2] : undefined;
if (command === "build") {
  build();
  const problems = check();
  if (problems.length) {
    console.error(problems.join("\n"));
    process.exit(1);
  }
  report();
} else if (command === "check") {
  const problems = check();
  if (problems.length) {
    console.error(`${problems.length} problems:\n${problems.join("\n")}`);
    process.exit(1);
  }
  report();
  console.log("OK");
} else if (command === "write") {
  writeToDatabase().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
