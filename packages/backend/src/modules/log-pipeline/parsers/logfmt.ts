export function parseLogfmt(message: string): Record<string, unknown> | null {
  if (!message) return null;

  const result: Record<string, string> = {};
  // Match key=value or key="quoted value"
  const regex = /(\w+)=(?:"((?:[^"\\]|\\.)*)"|(\S+))/g;
  let match: RegExpExecArray | null;
  let count = 0;

  while ((match = regex.exec(message)) !== null) {
    const [, key, quoted, unquoted] = match;
    result[key] = quoted !== undefined ? quoted : unquoted;
    count++;
  }

  // Require at least 2 pairs to avoid false positives on messages with URLs etc.
  if (count < 2) return null;

  return result;
}
