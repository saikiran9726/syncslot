// SlotSync iCalendar (.ics) Generator
// Generates standard RFC 5545 calendar invite files with UTC stamps and CRLF line endings.

export interface CalendarEventParams {
  reference: string;
  businessName: string;
  serviceName: string;
  startAtUtc: string; // ISO 8601 UTC string
  endAtUtc: string; // ISO 8601 UTC string
  location?: string;
  description?: string;
}

function formatUtcForIcs(isoString: string): string {
  // Converts "2026-10-29T04:30:00.000Z" to "20261029T043000Z"
  return isoString.replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

export function generateIcsContent(params: CalendarEventParams): string {
  const dtStart = formatUtcForIcs(params.startAtUtc);
  const dtEnd = formatUtcForIcs(params.endAtUtc);
  const dtStamp = formatUtcForIcs(new Date().toISOString());
  const uid = `${params.reference}@slotsync.dev`;

  const summary = escapeIcsText(`${params.serviceName} at ${params.businessName}`);
  const description = escapeIcsText(
    params.description ||
      `Appointment booking reference: ${params.reference}. Manage your appointment online.`
  );
  const location = params.location ? escapeIcsText(params.location) : '';

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SlotSync//Booking SaaS//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
    location ? `LOCATION:${location}` : '',
    'STATUS:CONFIRMED',
    // 60-minute reminder alarm
    'BEGIN:VALARM',
    'TRIGGER:-PT60M',
    'ACTION:DISPLAY',
    `DESCRIPTION:Reminder: ${summary} in 1 hour`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean);

  // Enforce RFC 5545 CRLF line endings
  return lines.join('\r\n') + '\r\n';
}

export function downloadIcsFile(params: CalendarEventParams): void {
  const content = generateIcsContent(params);
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `appointment-${params.reference}.ics`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
