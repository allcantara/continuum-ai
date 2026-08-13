import { describe, expect, it } from 'vitest';
import {
  isProjectMarkerUuid,
  parseProjectMarker,
  serializeProjectMarker,
} from '../../src/domain/project/ProjectMarker.js';

describe('ProjectMarker', () => {
  it('round-trips a valid marker', () => {
    var marker = { id: 'a3f1c8e2-9b44-4d1a-8f0e-2c7b91d4e5aa', folderName: 'my-app' };
    var parsed = parseProjectMarker(serializeProjectMarker(marker));
    expect(parsed).toEqual(marker);
  });

  it('rejects missing or invalid ids', () => {
    expect(parseProjectMarker('{"folderName":"app"}')).toBeNull();
    expect(parseProjectMarker('{"id":"not-a-uuid","folderName":"app"}')).toBeNull();
    expect(parseProjectMarker('not json')).toBeNull();
  });

  it('accepts canonical uuid strings', () => {
    expect(isProjectMarkerUuid('a3f1c8e2-9b44-4d1a-8f0e-2c7b91d4e5aa')).toBe(true);
    expect(isProjectMarkerUuid('unscoped')).toBe(false);
  });
});
