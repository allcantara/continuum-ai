import { describe, expect, it } from 'vitest';
import { projectScope } from '../../src/domain/scope/Scope.js';
import { projectHashFromPath } from '../../src/domain/scope/ProjectHash.js';
import {
  isProjectMetaIncomplete,
  parseProjectMeta,
  parseScopeDirName,
  serializeProjectMeta,
} from '../../src/infrastructure/persistence/filesystem/ProjectMeta.js';

describe('ProjectMeta', () => {
  it('parses a legacy hash-only folder name', () => {
    expect(parseScopeDirName('db3e1cefe1b82864')).toEqual({ hash: 'db3e1cefe1b82864', slug: '' });
  });

  it('parses a slug-hash folder name', () => {
    expect(parseScopeDirName('cpc-refinancing-app-bff-db3e1cefe1b82864')).toEqual({
      hash: 'db3e1cefe1b82864',
      slug: 'cpc-refinancing-app-bff',
    });
  });

  it('parses a uuid-based folder name', () => {
    expect(parseScopeDirName('my-app-a3f1c8e2-9b44-4d1a-8f0e-2c7b91d4e5aa')).toEqual({
      hash: 'a3f1c8e2-9b44-4d1a-8f0e-2c7b91d4e5aa',
      slug: 'my-app',
    });
  });

  it('treats missing slug and unknown placeholders as empty', () => {
    var parsed = parseProjectMeta('# project\n\n- Hash: abc\n- Created: 2026-08-12\n');
    expect(parsed.slug).toBe('');
    expect(parsed.source).toBe('');
    expect(parsed.created).toBe('2026-08-12');
  });

  it('flags a legacy meta as incomplete when the scope now has slug and source', () => {
    var hash = projectHashFromPath('/repo');
    var scope = projectScope(hash, 'my-app', 'https://github.com/user/my-app');
    var legacy = parseProjectMeta(`# project\n\n- Hash: ${hash}\n- Created: 2026-08-12\n`);
    expect(isProjectMetaIncomplete(legacy, scope)).toBe(true);
  });

  it('serializes slug and source for a fresh meta file', () => {
    var hash = projectHashFromPath('/repo');
    var scope = projectScope(hash, 'my-app', 'https://github.com/user/my-app');
    var raw = serializeProjectMeta(scope, '2026-08-12');
    expect(raw).toContain('Slug: my-app');
    expect(raw).toContain('Source: https://github.com/user/my-app');
  });
});
