export type TruncationResult = {
  readonly text: string;
  readonly truncated: boolean;
};

const TRUNCATION_MARKER = '\n\n[...conteúdo truncado para caber no contexto...]\n\n';

export function truncateForContext(content: string, maxLength: number): TruncationResult {
  if (content.length <= maxLength) {
    return { text: content, truncated: false };
  }

  var headLength = Math.floor(maxLength * 0.6);
  var tailLength = Math.floor(maxLength * 0.3);
  var head = content.slice(0, headLength);
  var tail = content.slice(-tailLength);

  return {
    text: `${head}${TRUNCATION_MARKER}${tail}`,
    truncated: true,
  };
}
