const DEFAULT_MAX_LOAD_CHARS = 40_000;
const DEFAULT_MAX_RECAP_CHARS = 60_000;

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim().length === 0) {
    return fallback;
  }

  var parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

export function resolveMaxLoadChars(): number {
  return parsePositiveInt(process.env.CONTINUUM_MAX_LOAD_CHARS, DEFAULT_MAX_LOAD_CHARS);
}

export function resolveMaxRecapChars(): number {
  return parsePositiveInt(process.env.CONTINUUM_MAX_RECAP_CHARS, DEFAULT_MAX_RECAP_CHARS);
}
