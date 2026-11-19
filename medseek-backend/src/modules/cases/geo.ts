/**
 * Areas are grid cells of 0.5 degrees (about 55 km north-south).
 *
 * The browser rounds its own coordinates down to the cell and sends only the
 * cell's south-west corner, e.g. "19.0,72.5". Anything more precise than half
 * a degree is rejected here, so the server never accepts a real position.
 */

export const CELL_DEGREES = 0.5;

/** A cell, as half-degree indices of its south-west corner (19.0 N → 38). */
export interface Cell {
  lat: number;
  lon: number;
}

export function parseCell(value: string): Cell | null {
  const parts = value.split(",");
  if (parts.length !== 2) return null;
  const [lat, lon] = parts.map((p) => Number(p.trim()));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat >= 90 || lon < -180 || lon >= 180) return null;
  const latIndex = lat / CELL_DEGREES;
  const lonIndex = lon / CELL_DEGREES;
  // Must already be a cell corner: no finer than half a degree.
  if (!Number.isInteger(latIndex) || !Number.isInteger(lonIndex)) return null;
  return { lat: latIndex, lon: lonIndex };
}
