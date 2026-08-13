import { isUnscoped, UNSCOPED_PROJECT_HASH, type Scope } from '../../../domain/scope/Scope.js';

export type ParsedScopeDirName = {
  readonly hash: string;
  readonly slug: string;
};

export type ParsedProjectMeta = {
  readonly hash: string;
  readonly slug: string;
  readonly source: string;
  readonly created: string;
};

const UNKNOWN = '(desconhecido)';

const scopeDirNamePattern = new RegExp(`^(?:(.+)-)?([0-9a-f]{16}|${UNSCOPED_PROJECT_HASH})$`);

export function parseScopeDirName(dirName: string): ParsedScopeDirName {
  var match = scopeDirNamePattern.exec(dirName);
  if (!match) {
    return { hash: dirName, slug: '' };
  }
  return { hash: match[2]!, slug: match[1] ?? '' };
}

export function parseProjectMeta(raw: string): ParsedProjectMeta {
  return {
    hash: metaField(raw, 'Hash'),
    slug: normalizeMetaSlug(metaField(raw, 'Slug')),
    source: normalizeMetaSource(metaField(raw, 'Source')),
    created: metaField(raw, 'Created'),
  };
}

export function serializeProjectMeta(scope: Scope, created: string): string {
  return [
    `# ${scope.type}`,
    '',
    `- Hash: ${scope.hash}`,
    `- Slug: ${scope.slug || UNKNOWN}`,
    `- Source: ${describeSourceHint(scope)}`,
    `- Created: ${created}`,
    '',
  ].join('\n');
}

export function isProjectMetaIncomplete(meta: ParsedProjectMeta, scope: Scope): boolean {
  if (scope.slug && meta.slug !== scope.slug) {
    return true;
  }
  var expectedSource = describeSourceHint(scope);
  if (expectedSource !== UNKNOWN && meta.source !== expectedSource) {
    return true;
  }
  return false;
}

export function describeSourceHint(scope: Scope): string {
  if (isUnscoped(scope)) {
    return '(sem projeto — nenhuma raiz de workspace informada)';
  }
  if (scope.type === 'project') {
    return scope.sourceHint ?? UNKNOWN;
  }
  return `workspace multi-root (${scope.projectHashes.length} projeto(s))`;
}

function metaField(raw: string, name: string): string {
  var match = new RegExp(`^- ${name}:\\s*(.*)$`, 'm').exec(raw);
  return match?.[1]?.trim() ?? '';
}

function normalizeMetaSlug(value: string): string {
  if (!value || value === UNKNOWN) {
    return '';
  }
  return value;
}

function normalizeMetaSource(value: string): string {
  if (!value || value === UNKNOWN) {
    return '';
  }
  return value;
}
