// SlotSync Slot Cells Generator
// Computes discrete 15-minute intervals between start and end (with buffer).

export const CELL_MINUTES = 15;
export const CELL_MS = CELL_MINUTES * 60 * 1000;

export function computeSlotCells(startIso: string, bufferEndIso: string): string[] {
  const start = new Date(startIso).getTime();
  const end = new Date(bufferEndIso).getTime();
  if (isNaN(start) || isNaN(end) || end <= start) {
    return [];
  }
  const cells: string[] = [];
  for (let t = start; t < end; t += CELL_MS) {
    cells.push(new Date(t).toISOString());
  }
  return cells;
}
