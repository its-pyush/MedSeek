> **Status 2026-11-17: carried out** (see Phase 20 in `CLAUDE.md`). Two changes from this plan: the full symptom list is a dialog opened by a button (`SymptomBrowser.tsx`), not a `/symptoms` page; and highlights use per-vertex weights blended across triangles rather than a flat region id, because the mesh triangles are large. Still open: running migration 009 and `npm run kb:areas` against the database.

# Brief: fix the 3D body regions, tie them to the dataset, add an all-symptoms list

Read `CLAUDE.md` first. This brief is the plan; the measurements in it were taken from the mesh on 2026-11-17.

## 1. What is wrong today (measured, not guessed)

**How it works now.** `medseek-frontend/public/human_body.glb` is a single, unrigged Sketchfab mesh (`Object_4`, 18,057 vertices, CC-BY-4.0). `HumanBodyModel.tsx` bakes its world matrix into the geometry. Tap regions are **not** the body: `regionHierarchy.ts` defines ~55 hand-placed invisible boxes, spheres and capsules, and `handleMeshPointerUp` raycasts against those shapes. The highlight is a **sphere** drawn around each region's centroid in the fragment shader (`uActivePoints` / `uActiveRadii`).

**Why it looks out of place.** Run `node --experimental-strip-types --no-warnings scripts/body-regions-report.mts` from `medseek-frontend`:

- **9,504 of 18,057 vertices (53%) fall in no sub-region.** Tapping these spots in zoom mode does nothing, or hits whichever box sits in front of them.
- **1,854 vertices fall in two or more sub-regions.** For these, the result depends on which box the ray reaches first, not on the anatomy.
- Several regions barely touch the skin: epigastric covers 11 vertices, genital 22, rectum 24, upper_back 40.
- The highlight spheres ignore anatomy. A chest highlight spreads onto the arms, and a knee highlight onto the thigh.
- The body is in an **A-pose** (arms hang at about 45°). The arm capsules were placed by eye, so the forearm box claims 1,987 vertices (it reaches into the hand) while elbow and upper arm come up short.
- Symptom → body highlight uses `KEYWORD_RULES`, substring matching on names (e.g. `"gas"`, `"spot"`, `"walk"`). It has no link to the 1,962-symptom KB, so typed symptoms light up the wrong places or nothing at all.

**Conclusion:** retuning the boxes will not fix this. Replace the hit-test and highlight with **per-vertex region labels on the real mesh**. Each vertex belongs to exactly one sub-region, a tap reads the label of the triangle it hits, and the highlight is that set of vertices. No gaps, no overlaps, edges follow the skin.

## 2. Mesh landmarks (baked coordinates)

Y is up, from 0 (soles) to 4.47 (top of head). Z > 0 is front, X = 0 is the midline, and both sides mirror across X. These numbers come from cross-sections. **Treat them as starting values and confirm each one visually in paint mode (step 3.2).**

| Landmark | Value |
|---|---|
| Head top / chin underside | y 4.47 / ≈3.89 (front midline z falls from 0.18 to 0.03) |
| Nose tip | y ≈4.13, z 0.24, \|x\| < 0.04 |
| Eye line | y ≈4.18–4.24; forehead ≈4.25–4.38; mouth ≈3.96–4.06 |
| Head half-width | \|x\| ≤ 0.18 (ears are the lateral band \|x\| > 0.15, y 4.05–4.25) |
| Neck | y ≈3.75–3.89 (sternal notch ≈3.77) |
| Shoulder top / armpit split | y ≈3.82 (torso jumps to \|x\| 0.45) / y ≈3.25 (arm separates from torso at \|x\| ≈ 0.59) |
| Chest front peak (nipple line) | y ≈3.15–3.25, front z 0.30 |
| Waist (narrowest, \|x\| 0.33) | y ≈2.85–2.95 |
| Lower-belly bulge | y ≈2.50–2.60; pubic edge where front z drops: y ≈2.30 |
| Crotch (legs separate) | y ≈2.05 |
| Scapula peak (back) | y ≈3.55, back z −0.43 |
| Lumbar curve (back z least negative) | y ≈2.90–3.00 |
| Buttock peak / gluteal fold | y ≈2.50, back z −0.34 / y ≈2.15 |
| Arm axis (right side; left mirrors) | shoulder ≈(0.45, 3.62) → fingertip ≈(1.82, 2.50), length ≈1.79. Along that axis as fraction t: upper arm 0.12–0.42, elbow 0.42–0.50, forearm 0.50–0.67, wrist 0.67–0.74 (thinnest point, t ≈ 0.70), hand 0.74–0.90, fingers > 0.90. Shoulder cap is t < 0.12 plus the torso top for \|x\| > 0.35, y > 3.55 |
| Leg | thigh y 1.45–2.05 · knee 1.25–1.45 · shin/calf 0.32–1.25 (calf bulge at back ≈ y 1.0) · ankle 0.18–0.32 · foot < 0.18 · toes: foot with z > 0.30 |

## 3. Work plan (in this order; stop and verify after each step)

### 3.1 Pure segmentation function, no three.js dependency
Create `medseek-frontend/src/components/body/segmentBody.ts`:

```ts
export function regionAt(x: number, y: number, z: number, nx: number, ny: number, nz: number): string // a SUB-region id
export const SUB_TO_MAJOR: Record<string, string>
```

- Return only sub-region ids that already exist in `REGION_HIERARCHY` / `REGION_SYMPTOMS`. Those ids are the contract with the symptom data, so keep them all.
- Decide limb membership first: arm = beyond the torso silhouette and above y ≈ 2.3; leg = below the crotch. Then use the arm axis fraction t, or height bands for the leg.
- Torso and head, front vs back: use the vertex normal. Front if `nz > 0.3`, back if `nz < -0.3`. Lateral faces between the lower ribs and the hip (y ≈ 2.7–3.15) are `flank`; other lateral faces take the nearer side.
- Majors are determined by the sub-region, which removes the front/back ambiguity:
  - Back of the neck and back of the skull → `head_back`.
  - Back of the thigh, knee and calf → `legs_back` (hamstring / popliteal / calf).
  - Front of the leg → `legs` (thigh / knee / shin), and ankle / foot / toes → `legs` on both sides.
  - Arms belong to `arms` from either side. Change `view` on `MajorRegion` to `"front" | "back" | "both"` and set arms to `"both"`, so the Back area list also offers Arms.
- Use simple margins rather than precise anatomy. Every vertex must get a label; there is no "none" case.

### 3.2 Bake labels and add a paint debug mode
- Once `bakedGeometry` exists, compute the normals, run `regionAt` for every vertex, and store the result as an integer attribute `aRegion` holding an index into a fixed id list. Do this once in `useMemo`, not per frame.
- Replace `RegionDebugOverlay.tsx` with a **paint mode** that keeps the existing debug toggle: each sub-region gets a distinct flat colour. This is how you check the boundaries. Screenshot front, back, ¾ and close-ups of head, hand and pelvis in the emulated browser, then fix the cut-offs until the boundaries look anatomically right. Pay most attention to the shoulder/armpit, wrist/hand, groin and the neck/jaw line.
- Rewrite `scripts/body-regions-report.mts` to load the mesh, run `regionAt` over every vertex, and print per-region counts. **Pass criteria:** 0 unlabelled vertices; every sub-region has ≥ 20 vertices; left/right counts of bilateral regions within 15% of each other.

### 3.3 Hit-test the real mesh
- Raycast the visible body `<mesh>`. Read `hit.face.a/b/c`, take the majority `aRegion` of the three vertices, and map it to `{ majorId, subRegionId }`.
- Full mode selects the major; zoom mode selects the sub-region. Keep the current two-step UX and the `onRegionClick` payload shape.
- Delete the invisible collision groups, `createRegionGroup` / `createVolume*`, and `findNearestProxy`. Remove `volumes` from the types and data in `regionHierarchy.ts`, keeping ids, labels, view and subRegions. This also deletes a lot of hand-tuned numbers.
- Camera framing per major (`getFramingForMajor`) can stay. If time allows, derive it from the bounding box of the labelled vertices instead of the hand table.

### 3.4 Highlight by label, not by sphere
- Pass `aRegion` to the fragment shader as a `flat` varying (WebGL2; three r185 supports it).
- Uniforms: `uHoverRegion` (int or −1) and a fixed-size array `uActiveRegions[16]` with a count. The pixel is highlighted when its region is in the set. Keep the existing hover (cyan) and selected/active (crimson) colours and the rim glow.
- In full mode, hover and select tint every sub-region of the major. Hand the shader a list of sub indices.
- Remove `uActivePoints` / `uActiveRadii` and `getRegionProxyPoints`.

### 3.5 Connect symptoms to the body through the data (coherence)
The KB has 1,962 symptoms with name, synonyms and `df` (number of conditions), but no body location. Add one:

1. **`medseek-backend/data/kb/body_regions.json`**: the list of sub-region ids with label and major. This is the one source the backend validates against, and it must match `REGION_HIERARCHY` exactly. Add three non-body groups: `general` (fever, fatigue, weight loss…), `skin` (rashes or itching that are not tied to one place) and `mind` (anxiety, confusion, memory…).
2. **`medseek-backend/data/kb/symptom_areas.json`**: `{ "<symptom name>": ["<id>", ...] }` for **all 1,962** symptoms. Classify them yourself in batches of about 200, giving 1–3 ids each and the most specific id that fits ("knee swelling" → `knee`, not `legs`). This is editorial, model-made data; say so in an `_about` field, the same way `curation.json` does.
3. **Validation script** (`npm run kb:areas:check`): every KB symptom has ≥ 1 area, and every id is in `body_regions.json`. Also check that every `id` in the frontend's `REGION_SYMPTOMS` resolves to a vocabulary term (directly, by synonym, or via `body_model_aliases`) and that its area list includes the region it is listed under. Report any mismatches and fix them.
4. **Migration `009_symptom-body-areas.sql`**: `ALTER TABLE symptoms ADD COLUMN body_areas text[] NOT NULL DEFAULT '{}'`, plus a GIN index.
5. **Script `npm run kb:areas`** that only runs `UPDATE symptoms SET body_areas = …` by name. **Do not run `npm run seed`.** `DATABASE_URL` is the production database and seed replaces the search tables. Also make `seed.ts` write `body_areas` from the JSON, so a future reseed keeps the column. **Ask the user before running the migration or `kb:areas` against the database.**
6. Frontend: delete `KEYWORD_RULES`. Symptoms typed or ticked in search light up the body using `bodyAreas` from the API (step 4), mapped to sub-region indices. `general` / `skin` / `mind` light nothing.

## 4. All symptoms in one place, with search

**Backend**: `GET /api/search/symptoms` (public; add it to the route table in `CLAUDE.md`). It returns every symptom as `{ name, synonyms, diseaseCount, bodyAreas }`, sorted by `diseaseCount` desc. Set `Cache-Control: public, max-age=3600`. 1,962 small rows are fine to send at once, and the filtering happens client-side so it is instant. Add a vitest test for the shape. Keep the business logic in the backend; the frontend only filters what it receives.

**Frontend**: new public page **`/symptoms`** (server component fetches with `revalidate: 3600`, so it is indexable):
- A search box that matches name **and synonyms**, case-insensitively, and highlights the matched part. Show "Showing X of 1,962".
- Area filter chips grouped by major (Head, Neck, Chest, …, General, Skin, Mind). `?area=<id>` preselects one, and `?q=` prefills the search.
- Sort: Most common (default) / A–Z.
- Each row shows the name, "in N conditions", area tags and an add/remove toggle. A sticky footer reads "Search with N symptoms" → `/?symptoms=a,b,c`.
- Make the home page read `?symptoms=` to prefill the tags and run the search. It does not today.
- Render the first 200 rows plus "Show more", or use `content-visibility: auto`. Keep mobile at 16px inputs. Use the existing glass/card tokens and dark-mode tokens; no new palette.
- Entry points: an "All symptoms" link in the navbar. In `BodyPickerPanel` step 2, below the curated list, add a "More in this area" section listing the top 10 symptoms with that `bodyAreas` id, plus a "See all for <area> →" link to `/symptoms?area=<id>`.

## 5. Definition of done

- The report script passes (0 unlabelled; all regions ≥ 20 vertices; bilateral balance within 15%).
- Paint-mode screenshots (front, back, ¾, head, hand, pelvis) look anatomically right in light and dark mode. Tapping in the emulated phone viewport selects the region under the finger.
- Ticking "knee swelling" lights the knee only; "chest pain" lights the chest only; "fever" lights nothing.
- `/symptoms` search for "tired" finds "fatigue" through its synonym.
- Frontend: `npm run lint` and `npm run build` are clean. Backend: `npm run typecheck`, `npm run lint` and `npm test` are clean.
- Update `CLAUDE.md`: a new phase entry, the routes and pages tables, the current status, and what was **not** verified (real phone; production DB write if the user has not approved it). Do not commit unless the user asks.

## 6. If time runs short

Do 3.1–3.4 first; that alone fixes the misplaced regions. Then do §4 with a temporary `bodyAreas: []`, so the list and search ship. Do 3.5 last.
