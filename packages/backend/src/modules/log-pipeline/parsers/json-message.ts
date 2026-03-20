export function parseJsonMessage(message: string): Record<string, unknown> | null {
  if (!message || !message.trimStart().startsWith('{')) return null;

  try {
    const parsed = JSON.parse(message);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}
