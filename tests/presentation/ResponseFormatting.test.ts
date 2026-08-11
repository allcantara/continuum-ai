import { describe, expect, it } from 'vitest';
import {
  appendWarnings,
  formatWarning,
  isErrorResponse,
} from '../../src/presentation/mcp/tools/ResponseFormatting.js';

describe('ResponseFormatting', () => {
  it('prefixes warnings consistently', () => {
    expect(formatWarning('sync falhou')).toBe('Aviso: sync falhou');
    expect(formatWarning('Aviso: já prefixado')).toBe('Aviso: já prefixado');
  });

  it('detects error responses for MCP isError', () => {
    expect(isErrorResponse('Error: session not found')).toBe(true);
    expect(isErrorResponse('Session saved: 2026-08-10-1430')).toBe(false);
  });

  it('appends multiple warnings without duplicating the prefix logic in callers', () => {
    var message = appendWarnings('Session saved', [formatWarning('sync falhou')]);
    expect(message).toContain('Session saved');
    expect(message).toContain('Aviso: sync falhou');
  });
});
