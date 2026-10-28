import { describe, it, expect } from 'vitest';
import {
  computeAvailableSlots,
  findAlternativeSlots,
  getTimezoneLabel,
  localToUtc,
  utcToLocal,
} from '../src/shared/availability';

describe('Availability Engine (Pure & Deterministic)', () => {
  const defaultWorkingHours = [
    { day_of_week: 1, open_time: '09:00', close_time: '17:00', is_closed: 0 }, // Monday
    { day_of_week: 2, open_time: '09:00', close_time: '17:00', is_closed: 0 }, // Tuesday
    { day_of_week: 3, open_time: '09:00', close_time: '17:00', is_closed: 0 }, // Wednesday
    { day_of_week: 4, open_time: '09:00', close_time: '17:00', is_closed: 0 }, // Thursday
    { day_of_week: 5, open_time: '09:00', close_time: '17:00', is_closed: 0 }, // Friday
    { day_of_week: 6, open_time: '10:00', close_time: '14:00', is_closed: 0 }, // Saturday
    { day_of_week: 0, open_time: '00:00', close_time: '00:00', is_closed: 1 }, // Sunday closed
  ];

  const defaultBreaks = [
    { day_of_week: 1, start_time: '13:00', end_time: '14:00' }, // Lunch break on Mon
  ];

  it('generates 15-minute aligned slots within operating hours excluding lunch break', () => {
    // Asia/Kolkata is UTC+5:30
    // On 2026-11-02 (Monday): open 09:00 to 17:00 with break 13:00-14:00
    // Service duration 30m + buffer 15m (total 45m required)
    const slots = computeAvailableSlots({
      timezone: 'Asia/Kolkata',
      startDate: '2026-11-02',
      endDate: '2026-11-02',
      serviceDurationMinutes: 30,
      bufferMinutes: 15,
      workingHours: defaultWorkingHours,
      breaks: defaultBreaks,
      nowIso: '2026-11-01T00:00:00.000Z',
    });

    expect(slots.length).toBeGreaterThan(0);
    // Check first slot: 09:00 local time
    const first = slots[0];
    expect(first.local_time).toBe('09:00');
    expect(first.local_date).toBe('2026-11-02');
    // Asia/Kolkata 09:00 is UTC 03:30
    expect(first.start_at_utc).toBe('2026-11-02T03:30:00.000Z');
    expect(first.end_at_utc).toBe('2026-11-02T04:00:00.000Z');
    expect(first.buffer_end_at_utc).toBe('2026-11-02T04:15:00.000Z');

    // Slot at 12:30 would run until 13:00 (service) + 13:15 (buffer) -> overlaps 13:00-14:00 break -> excluded
    const slotAt1230 = slots.find((s) => s.local_time === '12:30');
    expect(slotAt1230).toBeUndefined();

    // Slot during lunch (13:00, 13:15, 13:30, 13:45) -> excluded
    const slotDuringLunch = slots.find((s) => s.local_time.startsWith('13:'));
    expect(slotDuringLunch).toBeUndefined();

    // Slot at 14:00 resumes after lunch
    const slotAt1400 = slots.find((s) => s.local_time === '14:00');
    expect(slotAt1400).toBeDefined();

    // Last slot must fit service + buffer before 17:00
    // 16:15 + 30m = 16:45 + 15m buffer = 17:00 (fits exactly)
    const slotAt1615 = slots.find((s) => s.local_time === '16:15');
    expect(slotAt1615).toBeDefined();

    // 16:30 + 30m = 17:00 + 15m buffer = 17:15 -> exceeds 17:00 closing -> excluded
    const slotAt1630 = slots.find((s) => s.local_time === '16:30');
    expect(slotAt1630).toBeUndefined();
  });

  it('respects calendar holidays by offering zero slots', () => {
    const slots = computeAvailableSlots({
      timezone: 'Asia/Kolkata',
      startDate: '2026-11-02',
      endDate: '2026-11-02',
      serviceDurationMinutes: 30,
      bufferMinutes: 0,
      workingHours: defaultWorkingHours,
      holidays: [{ holiday_date: '2026-11-02' }], // Diwali / Holiday
      nowIso: '2026-11-01T00:00:00.000Z',
    });

    expect(slots).toEqual([]);
  });

  it('respects blocked periods in UTC', () => {
    // Block 10:00 to 11:30 local time (which is 04:30 to 06:00 UTC)
    const slots = computeAvailableSlots({
      timezone: 'Asia/Kolkata',
      startDate: '2026-11-02',
      endDate: '2026-11-02',
      serviceDurationMinutes: 30,
      bufferMinutes: 0,
      workingHours: defaultWorkingHours,
      blockedPeriods: [
        {
          start_at_utc: '2026-11-02T04:30:00.000Z',
          end_at_utc: '2026-11-02T06:00:00.000Z',
        },
      ],
      nowIso: '2026-11-01T00:00:00.000Z',
    });

    // Slots at 10:00, 10:15, 10:30, 10:45, 11:00 should not exist
    const blockedSlot = slots.find((s) => ['10:00', '10:15', '10:30', '10:45', '11:00'].includes(s.local_time));
    expect(blockedSlot).toBeUndefined();

    // Slot at 09:30 (ends 10:00) should be available
    const slotAt0930 = slots.find((s) => s.local_time === '09:30');
    expect(slotAt0930).toBeDefined();

    // Slot at 11:30 (starts after blocked period) should be available
    const slotAt1130 = slots.find((s) => s.local_time === '11:30');
    expect(slotAt1130).toBeDefined();
  });

  it('respects existing slot_cells and removes booked intervals', () => {
    // Suppose 10:00-10:45 local is booked (which is 04:30, 04:45, 05:00 UTC)
    const existingCells = new Set<string>([
      '2026-11-02T04:30:00.000Z',
      '2026-11-02T04:45:00.000Z',
    ]);

    const slots = computeAvailableSlots({
      timezone: 'Asia/Kolkata',
      startDate: '2026-11-02',
      endDate: '2026-11-02',
      serviceDurationMinutes: 30,
      bufferMinutes: 0,
      workingHours: defaultWorkingHours,
      existingSlotCells: existingCells,
      nowIso: '2026-11-01T00:00:00.000Z',
    });

    // 10:00 local (04:30 UTC) requires [04:30, 04:45], both taken -> excluded
    expect(slots.find((s) => s.local_time === '10:00')).toBeUndefined();
    // 09:45 local (04:15 UTC) requires [04:15, 04:30], 04:30 is taken -> excluded
    expect(slots.find((s) => s.local_time === '09:45')).toBeUndefined();
    // 09:30 local (04:00 UTC) requires [04:00, 04:15], neither taken -> available
    expect(slots.find((s) => s.local_time === '09:30')).toBeDefined();
    // 10:30 local (05:00 UTC) requires [05:00, 05:15], neither taken -> available
    expect(slots.find((s) => s.local_time === '10:30')).toBeDefined();
  });

  it('enforces minNoticeHours and maxDaysAhead horizons', () => {
    // Reference now: 2026-11-02 08:00 local (02:30 UTC)
    const nowIso = '2026-11-02T02:30:00.000Z';
    const slots = computeAvailableSlots({
      timezone: 'Asia/Kolkata',
      startDate: '2026-11-02',
      endDate: '2026-11-02',
      serviceDurationMinutes: 30,
      bufferMinutes: 0,
      workingHours: defaultWorkingHours,
      minNoticeHours: 3, // Requires 3 hours notice -> earliest is 11:00 local
      nowIso,
    });

    const earlySlot = slots.find((s) => s.local_time < '11:00');
    expect(earlySlot).toBeUndefined();

    const noticeSlot = slots.find((s) => s.local_time === '11:00');
    expect(noticeSlot).toBeDefined();
  });

  it('correctly calculates DST transitions in Europe/London', () => {
    // UK clock changes back 1 hour on Sunday October 25, 2026 (BST to GMT)
    // On Oct 24 (BST), offset is UTC+1.
    // On Oct 26 (GMT), offset is UTC+0.
    const bstUtc = localToUtc('2026-10-24', '10:00', 'Europe/London');
    const gmtUtc = localToUtc('2026-10-26', '10:00', 'Europe/London');

    expect(bstUtc).toBe('2026-10-24T09:00:00.000Z'); // 10:00 BST = 09:00 UTC
    expect(gmtUtc).toBe('2026-10-26T10:00:00.000Z'); // 10:00 GMT = 10:00 UTC

    // Roundtrip verification
    const bstRoundtrip = utcToLocal(bstUtc, 'Europe/London');
    expect(bstRoundtrip.date).toBe('2026-10-24');
    expect(bstRoundtrip.time).toBe('10:00');

    const gmtRoundtrip = utcToLocal(gmtUtc, 'Europe/London');
    expect(gmtRoundtrip.date).toBe('2026-10-26');
    expect(gmtRoundtrip.time).toBe('10:00');
  });

  it('provides friendly timezone label with offset and name', () => {
    const kolkataLabel = getTimezoneLabel('Asia/Kolkata');
    expect(kolkataLabel).toContain('India Standard Time');
    expect(kolkataLabel).toMatch(/GMT\+0?5:30/);

    const londonLabel = getTimezoneLabel('Europe/London');
    expect(londonLabel).toContain('Greenwich Mean Time');
  });

  it('findAlternativeSlots returns next nearest available options on collision', () => {
    const slots = computeAvailableSlots({
      timezone: 'Asia/Kolkata',
      startDate: '2026-11-02',
      endDate: '2026-11-02',
      serviceDurationMinutes: 30,
      bufferMinutes: 0,
      workingHours: defaultWorkingHours,
      nowIso: '2026-11-01T00:00:00.000Z',
    });

    const conflictSlot = '2026-11-02T04:30:00.000Z'; // 10:00 AM local
    const alternatives = findAlternativeSlots(slots, conflictSlot, 3);

    expect(alternatives.length).toBeLessThanOrEqual(3);
    expect(alternatives.length).toBeGreaterThan(0);
    // Sorts by distance from conflict
    expect(alternatives[0].start_at_utc).not.toBe(conflictSlot);
  });
});
