export type SessionContent = string & { readonly __brand: 'SessionContent' };

export function sessionContentFrom(value: string): SessionContent {
  var trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error('Session content cannot be empty');
  }
  return trimmed as SessionContent;
}
