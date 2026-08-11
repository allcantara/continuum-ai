import { describe, expect, it } from 'vitest';
import { containsLikelySecret } from '../../src/domain/session/SecretScanner.js';

describe('containsLikelySecret', () => {
  it('detects likely AWS access keys', () => {
    expect(containsLikelySecret('Use AKIAIOSFODNN7EXAMPLE for testing')).toBe(true);
  });

  it('detects password assignments', () => {
    expect(containsLikelySecret('password: super-secret-value')).toBe(true);
  });

  it('returns false for regular session content', () => {
    expect(containsLikelySecret('Implemented JWT validation and added tests.')).toBe(false);
  });
});
