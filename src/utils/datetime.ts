import { config } from '../config';

export function getCurrentTimestamp(): string {
  const now = new Date();
  const timeZone = config.app.timezone;
  
  const formatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  const dateParts: Record<string, string> = {};
  
  for (const part of parts) {
    if (part.type !== 'literal') {
      dateParts[part.type] = part.value;
    }
  }

  return `${dateParts.year}-${dateParts.month}-${dateParts.day} ${dateParts.hour}:${dateParts.minute}:${dateParts.second}`;
}

export function getTodayBounds(timeZone: string = config.app.timezone): { start: Date; end: Date } {
  const now = new Date();
  
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  
  const todayStr = formatter.format(now);
  
  const startStr = `${todayStr}T00:00:00`;
  const endStr = `${todayStr}T23:59:59`;
  
  const start = new Date(startStr);
  const end = new Date(endStr);
  
  const offsetMs = getTimezoneOffset(timeZone);
  start.setTime(start.getTime() - offsetMs);
  end.setTime(end.getTime() - offsetMs);
  
  return { start, end };
}

function getTimezoneOffset(timeZone: string): number {
  const now = new Date();
  const utcDate = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
  const tzDate = new Date(now.toLocaleString('en-US', { timeZone }));
  return utcDate.getTime() - tzDate.getTime();
}

