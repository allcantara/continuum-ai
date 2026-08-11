import { sessionContentFrom } from './SessionContent.js';
import type { SessionContent } from './SessionContent.js';
import { extractSummaryFromContent, sessionSummaryFrom } from './SessionSummary.js';
import type { SessionSummary } from './SessionSummary.js';

/**
 * A custom `summary` (passed explicitly to `save`) only lives in the SQLite index unless
 * it's also embedded on disk — the session file is the source of truth that the index gets
 * rebuilt from (on boot, after sync, after `git pull`), so without this marker a custom
 * summary would be silently replaced by a guess from the first content line on every reconcile.
 */
const SUMMARY_MARKER_PATTERN = /^<!-- continuum:summary: ([\s\S]*?) -->\n?/;

export function serializeSessionFile(summary: SessionSummary, content: SessionContent): string {
  return `<!-- continuum:summary: ${summary} -->\n${content}`;
}

export function parseSessionFile(raw: string): { readonly summary: SessionSummary; readonly content: SessionContent } {
  var match = SUMMARY_MARKER_PATTERN.exec(raw);
  if (match) {
    return {
      summary: sessionSummaryFrom(match[1]!),
      content: sessionContentFrom(raw.slice(match[0].length)),
    };
  }

  // Session file saved before summaries were embedded on disk: fall back to the
  // previous behavior of guessing from the first non-heading content line.
  return {
    summary: extractSummaryFromContent(raw),
    content: sessionContentFrom(raw),
  };
}
