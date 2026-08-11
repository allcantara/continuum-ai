import { describe, expect, it } from 'vitest';
import { truncateForContext } from '../../src/domain/session/ContentTruncation.js';

describe('truncateForContext', () => {
  it('returns the original content when it fits the limit', () => {
    var result = truncateForContext('short content', 100);
    expect(result.text).toBe('short content');
    expect(result.truncated).toBe(false);
  });

  it('preserves the beginning and end when truncating large content', () => {
    var content = 'A'.repeat(100) + 'MIDDLE' + 'B'.repeat(100);
    var result = truncateForContext(content, 80);

    expect(result.truncated).toBe(true);
    expect(result.text.startsWith('A'.repeat(48))).toBe(true);
    expect(result.text.endsWith('B'.repeat(24))).toBe(true);
    expect(result.text).toContain('truncado');
  });
});
