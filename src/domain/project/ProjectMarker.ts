export const PROJECT_MARKER_FILENAME = '.continuum.local.json';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ProjectMarker = {
  readonly id: string;
  readonly folderName: string;
};

export function isProjectMarkerUuid(value: string): boolean {
  return UUID_PATTERN.test(value.trim());
}

export function serializeProjectMarker(marker: ProjectMarker): string {
  return `${JSON.stringify({ id: marker.id, folderName: marker.folderName }, null, 2)}\n`;
}

export function parseProjectMarker(raw: string): ProjectMarker | null {
  try {
    var parsed = JSON.parse(raw) as { id?: unknown; folderName?: unknown };
    if (typeof parsed.id !== 'string' || !isProjectMarkerUuid(parsed.id)) {
      return null;
    }
    if (typeof parsed.folderName !== 'string' || parsed.folderName.trim() === '') {
      return null;
    }
    return { id: parsed.id.toLowerCase(), folderName: parsed.folderName.trim() };
  } catch {
    return null;
  }
}
