import { describe, expect, it } from 'vitest';
import { sessionContentFrom } from '../../src/domain/session/SessionContent.js';
import {
  extractSummaryFromContent,
  sessionSummaryFrom,
} from '../../src/domain/session/SessionSummary.js';
import {
  formatSessionTimestamp,
  sessionIdFrom,
  sessionTimestampFromId,
} from '../../src/domain/session/SessionId.js';

describe('SessionSummary', () => {
  it('rejects empty summary', () => {
    expect(() => sessionSummaryFrom('  ')).toThrow('cannot be empty');
  });

  it('extracts first non-heading line from content', () => {
    var content = '# Title\n\nWorking on authentication flow.';
    expect(extractSummaryFromContent(content)).toBe('Working on authentication flow.');
  });
});

describe('SessionContent', () => {
  it('rejects empty content', () => {
    expect(() => sessionContentFrom('')).toThrow('cannot be empty');
  });
});

describe('SessionId', () => {
  it('creates valid session id from timestamp', () => {
    var id = sessionIdFrom('2026-08-10-1430');
    expect(id).toBe('2026-08-10-1430');
    expect(sessionTimestampFromId(id)).toBe('2026-08-10-1430');
  });

  it('creates session id with collision suffix', () => {
    var id = sessionIdFrom('2026-08-10-1430', 1);
    expect(id).toBe('2026-08-10-1430-1');
  });

  it('formats timestamp from date', () => {
    var date = new Date(2026, 7, 10, 14, 30);
    expect(formatSessionTimestamp(date)).toBe('2026-08-10-1430');
  });
});
