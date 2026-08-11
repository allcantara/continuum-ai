export const WARNING_PREFIX = 'Aviso:';

export function formatWarning(message: string): string {
  return message.startsWith(WARNING_PREFIX) ? message : `${WARNING_PREFIX} ${message}`;
}

export function appendWarnings(baseMessage: string, warnings: readonly string[]): string {
  if (warnings.length === 0) {
    return baseMessage;
  }

  return `${baseMessage}\n${warnings.map(formatWarning).join('\n')}`;
}

export function isErrorResponse(text: string): boolean {
  return text.startsWith('Error:');
}
