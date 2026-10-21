export const TIME_ZONE = 'Europe/Sarajevo';

const partsFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

export function localParts(epochMs) {
  const parts = Object.fromEntries(partsFormatter.formatToParts(new Date(epochMs)).map(part => [part.type, part.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

function offsetAt(epochMs) {
  const parts = localParts(epochMs);
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute) - epochMs;
}

export function localEpoch(year, month, day, hour, minute) {
  const naiveUtc = Date.UTC(year, month - 1, day, hour, minute);
  const firstGuess = naiveUtc - offsetAt(naiveUtc);
  return naiveUtc - offsetAt(firstGuess);
}

const pad = value => String(value).padStart(2, '0');

export function formatTime(epochMs) {
  const parts = localParts(epochMs);
  return `${pad(parts.hour)}:${pad(parts.minute)}`;
}

export function formatDay(epochMs) {
  const parts = localParts(epochMs);
  return `${pad(parts.day)}.${pad(parts.month)}.`;
}

export function dayKey(epochMs) {
  const parts = localParts(epochMs);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}
