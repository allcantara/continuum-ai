export type TrashStatus = 'active' | 'trashed';

export function isActive(status: TrashStatus): boolean {
  return status === 'active';
}

export function isTrashed(status: TrashStatus): boolean {
  return status === 'trashed';
}
