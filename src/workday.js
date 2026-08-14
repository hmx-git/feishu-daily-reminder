import fs from 'node:fs/promises';

const DEFAULT_HOLIDAYS = {
  '2026': [
    '2026-01-01', '2026-01-02', '2026-01-03',
    '2026-02-15', '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19', '2026-02-20', '2026-02-21', '2026-02-22', '2026-02-23',
    '2026-04-04', '2026-04-05', '2026-04-06',
    '2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04', '2026-05-05',
    '2026-06-19', '2026-06-20', '2026-06-21',
    '2026-09-25', '2026-09-26', '2026-09-27',
    '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07'
  ]
};

export async function loadHolidayDates(filePath) {
  try {
    const raw = JSON.parse(await fs.readFile(filePath, 'utf8'));
    const dates = Object.values(raw).flat().filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value));
    return new Set(dates);
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('Failed to load holiday calendar:', error.message);
    return new Set(Object.values(DEFAULT_HOLIDAYS).flat());
  }
}

export function isWorkingDay(dateString, holidayDates) {
  const date = new Date(`${dateString}T12:00:00Z`);
  const weekday = date.getUTCDay();
  return weekday !== 0 && weekday !== 6 && !holidayDates.has(dateString);
}

export function addCalendarDays(dateString, amount) {
  const date = new Date(`${dateString}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}
