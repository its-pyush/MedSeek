import * as THREE from "three";

/**
 * Wireframe density levels.
 *
 * The body mesh has ~33k triangles. Drawn as a wireframe on a small screen the
 * lines are closer together than the pixels and smear into a pattern, so the
 * wireframe is drawn from a thinner copy of the mesh when the figure is small.
 * The solid body underneath always uses the full mesh, so the outline stays smooth.
 */

export type WireLevel = "full" | "mid" | "low";

/**
 * Thin a mesh by vertex clustering: snap vertices to a grid of `cellSize`,
 * merge everything that lands in one cell (at the cell's average position) and
 * drop triangles that collapse. Linear time — fine to run once in the browser.
 */
export function thinByClustering(source: THREE.BufferGeometry, cellSize: number): THREE.BufferGeometry {
  const pos = source.getAttribute("position");
  const index = source.getIndex();
  const vertexCount = pos.count;

  const cellOf = new Map<string, number>();
  const remap = new Uint32Array(vertexCount);
  const sums: number[] = [];
  const counts: number[] = [];

  for (let i = 0; i < vertexCount; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const key = `${Math.floor(x / cellSize)},${Math.floor(y / cellSize)},${Math.floor(z / cellSize)}`;
    let cluster = cellOf.get(key);
    if (cluster === undefined) {
      cluster = counts.length;
      cellOf.set(key, cluster);
      sums.push(0, 0, 0);
      counts.push(0);
    }
    sums[cluster * 3] += x;
    sums[cluster * 3 + 1] += y;
    sums[cluster * 3 + 2] += z;
    counts[cluster]++;
    remap[i] = cluster;
  }

  const positions = new Float32Array(counts.length * 3);
  for (let c = 0; c < counts.length; c++) {
    positions[c * 3] = sums[c * 3] / counts[c];
    positions[c * 3 + 1] = sums[c * 3 + 1] / counts[c];
    positions[c * 3 + 2] = sums[c * 3 + 2] / counts[c];
  }

  const triangleCount = (index ? index.count : vertexCount) / 3;
  const at = (i: number) => remap[index ? index.getX(i) : i];
  const seen = new Set<string>();
  const indices: number[] = [];
  for (let t = 0; t < triangleCount; t++) {
    const a = at(t * 3), b = at(t * 3 + 1), c = at(t * 3 + 2);
    if (a === b || b === c || a === c) continue;
    const key = [a, b, c].sort((p, q) => p - q).join(",");
    if (seen.has(key)) continue;
    seen.add(key);
    indices.push(a, b, c);
  }

  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  out.setIndex(indices);
  out.computeVertexNormals();
  return out;
}

/** Thin until the mesh has at most `maxTriangles` triangles. */
export function thinToTriangleBudget(source: THREE.BufferGeometry, maxTriangles: number): THREE.BufferGeometry {
  source.computeBoundingBox();
  const size = new THREE.Vector3();
  source.boundingBox!.getSize(size);
  let cell = Math.max(size.x, size.y, size.z) / 120;
  let result = thinByClustering(source, cell);
  for (let i = 0; i < 12 && result.getIndex()!.count / 3 > maxTriangles; i++) {
    result.dispose();
    cell *= 1.25;
    result = thinByClustering(source, cell);
  }
  return result;
}

const UP: Record<WireLevel, number> = { low: 360, mid: 690, full: Infinity };
const DOWN: Record<WireLevel, number> = { low: 0, mid: 320, full: 650 };

/**
 * Pick a density level from the figure's height on screen (CSS pixels), with a
 * dead band so the level does not flicker when the size sits on a boundary.
 */
export function nextWireLevel(current: WireLevel, heightPx: number): WireLevel {
  if (heightPx > UP[current]) return current === "low" ? "mid" : "full";
  if (heightPx < DOWN[current]) return current === "full" ? "mid" : "low";
  return current;
}
