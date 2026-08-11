import { describe, expect, it } from 'vitest';
import { sessionContentFrom } from '../../src/domain/session/SessionContent.js';
import { parseSessionFile, serializeSessionFile } from '../../src/domain/session/SessionFile.js';
import { sessionSummaryFrom } from '../../src/domain/session/SessionSummary.js';

describe('SessionFile', () => {
  it('round-trips a custom summary that does not match the first content line', () => {
    var summary = sessionSummaryFrom('Custom summary unrelated to content');
    var content = sessionContentFrom('# Session\nSomething entirely different was written here.');

    var raw = serializeSessionFile(summary, content);
    var parsed = parseSessionFile(raw);

    expect(parsed.summary).toBe(summary);
    expect(parsed.content).toBe(content);
  });

  it('falls back to guessing from the first non-heading line for legacy files without the marker', () => {
    var legacyRaw = '# Session Test\nWorking on feature X.\nMore details.';

    var parsed = parseSessionFile(legacyRaw);

    expect(parsed.summary).toBe('Working on feature X.');
    expect(parsed.content).toBe(legacyRaw);
  });
});
