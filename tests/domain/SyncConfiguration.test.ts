import { describe, expect, it } from 'vitest';
import { syncDisabled, syncEnabled } from '../../src/domain/sync/SyncConfiguration.js';

describe('SyncConfiguration', () => {
  it('creates disabled sync config', () => {
    var config = syncDisabled();
    expect(config.enabled).toBe(false);
    expect(config.remoteUrl).toBeNull();
  });

  it('creates enabled sync config with remote url', () => {
    var config = syncEnabled('git@github.com:user/memoria.git');
    expect(config.enabled).toBe(true);
    expect(config.remoteUrl).toBe('git@github.com:user/memoria.git');
  });

  it('rejects empty remote url', () => {
    expect(() => syncEnabled('  ')).toThrow('cannot be empty');
  });
});
