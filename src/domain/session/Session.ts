import type { Scope } from '../scope/Scope.js';
import type { TrashStatus } from '../trash/TrashStatus.js';
import type { SessionContent } from './SessionContent.js';
import type { SessionId } from './SessionId.js';
import type { SessionSummary } from './SessionSummary.js';

export type Session = {
  readonly id: SessionId;
  readonly scope: Scope;
  readonly content: SessionContent;
  readonly summary: SessionSummary;
  readonly createdAt: Date;
  readonly status: TrashStatus;
};

export function createSession(params: {
  id: SessionId;
  scope: Scope;
  content: SessionContent;
  summary: SessionSummary;
  createdAt: Date;
  status?: TrashStatus;
}): Session {
  return {
    id: params.id,
    scope: params.scope,
    content: params.content,
    summary: params.summary,
    createdAt: params.createdAt,
    status: params.status ?? 'active',
  };
}
