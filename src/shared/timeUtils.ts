// SlotSync Time & Slot Cell Calculation Utilities

export const CELL_MINUTES = 15;
export const CELL_MS = CELL_MINUTES * 60 * 1000;

/**
 * Checks if an ISO timestamp is strictly aligned to the 15-minute grid (00, 15, 30, 45 seconds=0, ms=0).
 */
export function isAlignedToGrid(isoUtc: string): boolean {
  const d = new Date(isoUtc);
  if (isNaN(d.getTime())) return false;
  return d.getUTCMinutes() % CELL_MINUTES === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0;
}

/**
 * Calculates all consecutive 15-minute slot cell ISO strings that a booking reserves.
 * Occupies N = ceil((durationMinutes + bufferMinutes) / 15) cells starting at start_at_utc.
 *
 * Example: start=10:00, duration=30, buffer=15 -> total 45m -> 3 cells: [10:00, 10:15, 10:30]
 */
export function calculateSlotCells(startIsoUtc: string, durationMinutes: number, bufferMinutes: number): string[] {
  const startDate = new Date(startIsoUtc);
  if (isNaN(startDate.getTime())) {
    throw new Error(`Invalid start_at_utc: ${startIsoUtc}`);
  }

  const totalMinutes = durationMinutes + bufferMinutes;
  const cellCount = Math.ceil(totalMinutes / CELL_MINUTES);
  const cells: string[] = [];

  for (let i = 0; i < cellCount; i++) {
    const cellTime = new Date(startDate.getTime() + i * CELL_MS);
    cells.push(cellTime.toISOString());
  }

  return cells;
}

/**
 * Calculates end_at_utc given start_at_utc and durationMinutes.
 * Buffer is occupied in slot_cells, but NOT part of visible appointment end.
 */
export function calculateEndAtUtc(startIsoUtc: string, durationMinutes: number): string {
  const startDate = new Date(startIsoUtc);
  if (isNaN(startDate.getTime())) {
    throw new Error(`Invalid start_at_utc: ${startIsoUtc}`);
  }
  const endDate = new Date(startDate.getTime() + durationMinutes * 60 * 1000);
  return endDate.toISOString();
}

/**
 * Normalizes an ISO string to a clean UTC ISO string (e.g. 2026-10-29T10:00:00.000Z).
 */
export function toUtcIso(dateInput: Date | string | number): string {
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) {
    throw new Error(`Invalid date input: ${dateInput}`);
  }
  return d.toISOString();
}
