// SlotSync Shared Availability Engine
// Pure, deterministic slot calculation on 15-minute intervals.
// Respects: business timezone, working hours, breaks, holidays, blocked periods,
// duration + buffer, minimum notice, maximum horizon, and existing reserved slot cells.

import { computeSlotCells } from './slotCells';

export interface WorkingHourRule {
  day_of_week: number;
  open_time: string; // HH:MM
  close_time: string; // HH:MM
  is_closed: number;
}

export interface BreakRule {
  day_of_week: number;
  start_time: string; // HH:MM
  end_time: string; // HH:MM
}

export interface HolidayRule {
  holiday_date: string; // YYYY-MM-DD
}

export interface BlockedPeriodRule {
  start_at_utc: string;
  end_at_utc: string;
}

export interface AvailabilityParams {
  timezone: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  serviceDurationMinutes: number;
  bufferMinutes: number;
  minNoticeHours?: number;
  maxDaysAhead?: number;
  workingHours: WorkingHourRule[];
  breaks?: BreakRule[];
  holidays?: HolidayRule[];
  blockedPeriods?: BlockedPeriodRule[];
  existingSlotCells?: Set<string>; // Set of reserved cell_start_utc ISO strings
  nowIso?: string; // Reference instant for notice calculations
}

export interface AvailableSlot {
  start_at_utc: string;
  end_at_utc: string;
  buffer_end_at_utc: string;
  local_date: string;
  local_time: string;
  display_time: string;
  period: 'morning' | 'afternoon' | 'evening';
}

/**
 * Converts a local date string (YYYY-MM-DD) and local time string (HH:MM)
 * in a specific IANA timezone to a UTC ISO string, accounting for DST.
 */
export function localToUtc(dateStr: string, timeStr: string, timeZone: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, min] = timeStr.split(':').map(Number);

  // Initial estimate in UTC
  let d = new Date(Date.UTC(year, month - 1, day, hour, min, 0));

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  function getParts(date: Date) {
    const parts = formatter.formatToParts(date);
    const map: Record<string, string> = {};
    for (const p of parts) map[p.type] = p.value;
    return map;
  }

  const parts = getParts(d);
  const localHour = parts.hour === '24' ? 0 : Number(parts.hour);
  const localDay = Number(parts.day);

  const targetMinutes = (day * 24 + hour) * 60 + min;
  const actualMinutes = (localDay * 24 + localHour) * 60 + Number(parts.minute);
  const diffMinutes = targetMinutes - actualMinutes;

  d = new Date(d.getTime() + diffMinutes * 60 * 1000);
  return d.toISOString();
}

/**
 * Converts a UTC ISO timestamp to local { date: 'YYYY-MM-DD', time: 'HH:MM' } in a timezone.
 */
export function utcToLocal(utcIso: string, timeZone: string): { date: string; time: string } {
  const d = new Date(utcIso);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(d);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  const hour = map.hour === '24' ? '00' : map.hour;
  return {
    date: `${map.year}-${map.month}-${map.day}`,
    time: `${hour}:${map.minute}`,
  };
}

/**
 * Returns formatted timezone name and UTC offset label.
 * e.g. "India Standard Time, GMT+5:30"
 */
export function getTimezoneLabel(timeZone: string): string {
  try {
    const now = new Date();
    const nameFormatter = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'long' });
    const parts = nameFormatter.formatToParts(now);
    const tzName = parts.find((p) => p.type === 'timeZoneName')?.value || timeZone;

    const offsetFormatter = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'shortOffset' });
    const offsetParts = offsetFormatter.formatToParts(now);
    const offset = offsetParts.find((p) => p.type === 'timeZoneName')?.value || 'UTC';

    return `${tzName}, ${offset}`;
  } catch {
    return timeZone;
  }
}

/**
 * Computes display time (e.g. 09:00 -> "9:00 AM", 14:30 -> "2:30 PM")
 */
export function formatDisplayTime(timeStr: string): string {
  const [hourStr, minStr] = timeStr.split(':');
  const h = Number(hourStr);
  const period = h >= 12 ? 'PM' : 'AM';
  const displayH = h % 12 === 0 ? 12 : h % 12;
  return `${displayH}:${minStr} ${period}`;
}

/**
 * Computes available slots for a date range in the business timezone.
 */
export function computeAvailableSlots(params: AvailabilityParams): AvailableSlot[] {
  const {
    timezone,
    startDate,
    endDate,
    serviceDurationMinutes,
    bufferMinutes,
    minNoticeHours = 2,
    maxDaysAhead = 60,
    workingHours,
    breaks = [],
    holidays = [],
    blockedPeriods = [],
    existingSlotCells = new Set(),
    nowIso = new Date().toISOString(),
  } = params;

  const nowMs = new Date(nowIso).getTime();
  const minNoticeMs = nowMs + minNoticeHours * 60 * 60 * 1000;
  const maxAheadMs = nowMs + maxDaysAhead * 24 * 60 * 60 * 1000;

  const holidaySet = new Set(holidays.map((h) => h.holiday_date));
  const results: AvailableSlot[] = [];

  // Parse start and end date
  const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
  const [endYear, endMonth, endDay] = endDate.split('-').map(Number);

  const curDate = new Date(Date.UTC(startYear, startMonth - 1, startDay));
  const finalDate = new Date(Date.UTC(endYear, endMonth - 1, endDay));

  const totalMinutes = serviceDurationMinutes + bufferMinutes;

  while (curDate <= finalDate) {
    const y = curDate.getUTCFullYear();
    const m = String(curDate.getUTCMonth() + 1).padStart(2, '0');
    const d = String(curDate.getUTCDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${d}`;

    // Skip full-day holidays
    if (!holidaySet.has(dateStr)) {
      // Determine day of week in target timezone
      // Using UTC year/month/day at noon to find day of week safely
      const sampleUtc = localToUtc(dateStr, '12:00', timezone);
      const sampleDate = new Date(sampleUtc);
      const formatter = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'narrow' });
      // Day of week index 0 = Sunday, 1 = Monday, ..., 6 = Saturday
      const dayOfWeek = new Date(dateStr + 'T12:00:00Z').getUTCDay();

      // Find open working hours intervals for this day of week
      const dayHours = workingHours.filter((h) => h.day_of_week === dayOfWeek && h.is_closed === 0);
      const dayBreaks = breaks.filter((b) => b.day_of_week === dayOfWeek);

      for (const interval of dayHours) {
        const [openH, openM] = interval.open_time.split(':').map(Number);
        const [closeH, closeM] = interval.close_time.split(':').map(Number);

        const openMinutes = openH * 60 + openM;
        const closeMinutes = closeH * 60 + closeM;

        // Candidate start times on 15-minute grid
        for (let startMin = openMinutes; startMin + totalMinutes <= closeMinutes; startMin += 15) {
          const slotHour = Math.floor(startMin / 60);
          const slotMinute = startMin % 60;
          const timeStr = `${String(slotHour).padStart(2, '0')}:${String(slotMinute).padStart(2, '0')}`;

          const slotEndMin = startMin + serviceDurationMinutes;
          const endHour = Math.floor(slotEndMin / 60);
          const endMinute = slotEndMin % 60;
          const endTimeStr = `${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}`;

          // Convert to UTC instants
          const startUtc = localToUtc(dateStr, timeStr, timezone);
          const endUtc = localToUtc(dateStr, endTimeStr, timezone);

          const bufferEndMin = startMin + totalMinutes;
          const bufHour = Math.floor(bufferEndMin / 60);
          const bufMinute = bufferEndMin % 60;
          const bufTimeStr = `${String(bufHour).padStart(2, '0')}:${String(bufMinute).padStart(2, '0')}`;
          const bufferEndUtc = localToUtc(dateStr, bufTimeStr, timezone);

          const startMs = new Date(startUtc).getTime();

          // 1. Minimum Notice check
          if (startMs < minNoticeMs) {
            continue;
          }

          // 2. Maximum Horizon check
          if (startMs > maxAheadMs) {
            continue;
          }

          // 3. Break overlap check (buffer must also not overlap with break)
          const slotEndMinutes = startMin + totalMinutes;
          let breakConflict = false;
          for (const b of dayBreaks) {
            const [bStartH, bStartM] = b.start_time.split(':').map(Number);
            const [bEndH, bEndM] = b.end_time.split(':').map(Number);
            const bStart = bStartH * 60 + bStartM;
            const bEnd = bEndH * 60 + bEndM;

            if (Math.max(startMin, bStart) < Math.min(slotEndMinutes, bEnd)) {
              breakConflict = true;
              break;
            }
          }
          if (breakConflict) continue;

          // 4. Blocked Periods check
          const bufferEndMs = new Date(bufferEndUtc).getTime();
          let blockConflict = false;
          for (const block of blockedPeriods) {
            const bStart = new Date(block.start_at_utc).getTime();
            const bEnd = new Date(block.end_at_utc).getTime();
            if (Math.max(startMs, bStart) < Math.min(bufferEndMs, bEnd)) {
              blockConflict = true;
              break;
            }
          }
          if (blockConflict) continue;

          // 5. Existing Slot Cells collision check
          const requiredCells = computeSlotCells(startUtc, bufferEndUtc);
          let cellConflict = false;
          for (const cell of requiredCells) {
            if (existingSlotCells.has(cell)) {
              cellConflict = true;
              break;
            }
          }
          if (cellConflict) continue;

          // Determine day period
          const period: 'morning' | 'afternoon' | 'evening' =
            slotHour < 12 ? 'morning' : slotHour < 17 ? 'afternoon' : 'evening';

          results.push({
            start_at_utc: startUtc,
            end_at_utc: endUtc,
            buffer_end_at_utc: bufferEndUtc,
            local_date: dateStr,
            local_time: timeStr,
            display_time: formatDisplayTime(timeStr),
            period,
          });
        }
      }
    }

    curDate.setUTCDate(curDate.getUTCDate() + 1);
  }

  return results;
}

/**
 * Finds up to 3 nearest alternative slots around a conflicted start time.
 */
export function findAlternativeSlots(
  allAvailableSlots: AvailableSlot[],
  conflictStartUtc: string,
  maxCount: number = 3
): AvailableSlot[] {
  if (allAvailableSlots.length === 0) return [];

  const targetMs = new Date(conflictStartUtc).getTime();

  // Filter out the conflicting slot itself
  const candidates = allAvailableSlots.filter((s) => s.start_at_utc !== conflictStartUtc);

  // Sort by absolute distance in time from conflict
  const sorted = candidates.sort((a, b) => {
    const distA = Math.abs(new Date(a.start_at_utc).getTime() - targetMs);
    const distB = Math.abs(new Date(b.start_at_utc).getTime() - targetMs);
    return distA - distB;
  });

  return sorted.slice(0, maxCount);
}
