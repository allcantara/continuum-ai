export type SessionSummary = string & { readonly __brand: 'SessionSummary' };

const MAX_SUMMARY_LENGTH = 500;

export function sessionSummaryFrom(value: string): SessionSummary {
  var trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error('Session summary cannot be empty');
  }
  if (trimmed.length > MAX_SUMMARY_LENGTH) {
    trimmed = trimmed.slice(0, MAX_SUMMARY_LENGTH);
  }
  return trimmed as SessionSummary;
}

export function extractSummaryFromContent(content: string): SessionSummary {
  var lines = content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));

  var firstLine = lines[0] ?? content.trim().slice(0, 200);
  return sessionSummaryFrom(firstLine);
}
