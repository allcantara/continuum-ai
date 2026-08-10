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

export function formatSessionTimestamp(date: Date): string {
  var year = date.getFullYear();
  var month = String(date.getMonth() + 1).padStart(2, '0');
  var day = String(date.getDate()).padStart(2, '0');
  var hours = String(date.getHours()).padStart(2, '0');
  var minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}-${hours}${minutes}`;
}
