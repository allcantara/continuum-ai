const SECRET_PATTERNS = [
  /AKIA[0-9A-Z]{16}/,
  /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/,
  /gh[pousr]_[A-Za-z0-9]{36,}/,
  /sk-[A-Za-z0-9]{20,}/,
  /(?:password|senha|secret|token)\s*[:=]\s*['"]?[^\s'"]{8,}/i,
];

export function containsLikelySecret(content: string): boolean {
  return SECRET_PATTERNS.some((pattern) => pattern.test(content));
}

export const SECRET_SAVE_WARNING =
  'Aviso: o conteúdo salvo parece conter um segredo (token, chave ou senha). Revise antes de sincronizar via git.';

export const SYNC_ENABLE_WARNING =
  'Aviso: sessões podem conter dados sensíveis. Confirme que o repositório remoto tem a visibilidade adequada antes de sincronizar.';
