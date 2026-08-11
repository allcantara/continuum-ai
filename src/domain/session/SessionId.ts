export type SessionId = string & { readonly __brand: 'SessionId' };

const SESSION_ID_PATTERN = /^(\d{4}-\d{2}-\d{2}-\d{4})(?:-(\d+))?$/;

export function sessionIdFrom(timestamp: string, suffix?: number): SessionId {
  if (!SESSION_ID_PATTERN.test(suffix !== undefined ? `${timestamp}-${suffix}` : timestamp)) {
    throw new Error(`Invalid session timestamp format: ${timestamp}`);
  }
  var id = suffix !== undefined ? `${timestamp}-${suffix}` : timestamp;
  return id as SessionId;
}

export function sessionTimestampFromId(id: SessionId): string {
  var match = SESSION_ID_PATTERN.exec(id);
  if (!match) {
    throw new Error(`Invalid session id: ${id}`);
  }
  return match[1]!;
}

export function sessionFilename(id: SessionId): string {
  return `${id}.md`;
}

/**
 * Chronological comparator for two session ids, oldest first. Needed because file
 * modification time is not a reliable ordering signal once sessions arrive via `git
 * pull`/clone — checkout sets every file's mtime to the checkout moment, not the original
 * save time — so callers that need "most recent session" must sort by id, not by mtime.
 */
export function compareSessionIdsAscending(a: SessionId, b: SessionId): number {
  var matchA = SESSION_ID_PATTERN.exec(a)!;
  var matchB = SESSION_ID_PATTERN.exec(b)!;

  var timestampCompare = matchA[1]!.localeCompare(matchB[1]!);
  if (timestampCompare !== 0) {
    return timestampCompare;
  }

  var suffixA = matchA[2] ? Number(matchA[2]) : 0;
  var suffixB = matchB[2] ? Number(matchB[2]) : 0;
  return suffixA - suffixB;
}

export function formatSessionTimestamp(date: Date): string {
  var year = date.getFullYear();
  var month = String(date.getMonth() + 1).padStart(2, '0');
  var day = String(date.getDate()).padStart(2, '0');
  var hours = String(date.getHours()).padStart(2, '0');
  var minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}-${hours}${minutes}`;
}
