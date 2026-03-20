const IPV4 = '(?:(?:25[0-5]|2[0-4]\\d|[01]?\\d\\d?)\\.){3}(?:25[0-5]|2[0-4]\\d|[01]?\\d\\d?)';
const IPV6 = '(?:[0-9A-Fa-f]{1,4}:){7}[0-9A-Fa-f]{1,4}|::1|::';

export const BUILTIN_PATTERNS: Record<string, string> = {
  INT:               '[+-]?(?:0|[1-9]\\d*)',
  POSINT:            '[1-9]\\d*|0',
  NUMBER:            '[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?',
  WORD:              '\\w+',
  NOTSPACE:          '\\S+',
  SPACE:             '\\s+',
  DATA:              '[\\s\\S]*?',
  GREEDYDATA:        '[\\s\\S]*',
  IPV4,
  IPV6,
  IP:                `(?:${IPV6}|${IPV4})`,
  HOSTNAME:          '[a-zA-Z0-9][a-zA-Z0-9\\-\\.]*',
  URIPATH:           '/[^\\s?#]*',
  URIPARAM:          '\\?[^\\s#]*',
  URI:               '[a-zA-Z][a-zA-Z0-9+\\-.]*://\\S+',
  QUOTEDSTRING:      '"(?:[^"\\\\]|\\\\.)*"',
  QS:                '"(?:[^"\\\\]|\\\\.)*"',
  STATUS_CODE:       '[1-5]\\d{2}',
  HTTPDATE:          '\\d{2}/\\w+/\\d{4}:\\d{2}:\\d{2}:\\d{2} [+-]\\d{4}',
  TIMESTAMP_ISO8601: '\\d{4}-\\d{2}-\\d{2}[T ]\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?(?:Z|[+-]\\d{2}:?\\d{2})?',
  USER:              '[a-zA-Z0-9._-]+',
  METHOD:            '(?:GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS|CONNECT|TRACE)',
};

interface FieldMeta {
  name: string;
  type: 'string' | 'int' | 'float';
}

/**
 * Compile a grok-like pattern string into a RegExp.
 * Syntax: %{PATTERN_NAME:field_name} or %{PATTERN_NAME:field_name:type}
 */
export function compileGrok(
  pattern: string,
  customPatterns: Record<string, string> = {}
): { regex: RegExp; fields: FieldMeta[] } {
  const all = { ...BUILTIN_PATTERNS, ...customPatterns };
  const fields: FieldMeta[] = [];

  const re = pattern.replace(
    /%\{(\w+)(?::(\w+))?(?::(int|float|string))?\}/g,
    (_, patternName, fieldName, typeName) => {
      const pat = all[patternName];
      if (!pat) throw new Error(`Unknown grok pattern: ${patternName}`);

      if (fieldName) {
        fields.push({ name: fieldName, type: (typeName as FieldMeta['type']) || 'string' });
        return `(?<${fieldName}>${pat})`;
      }
      return `(?:${pat})`;
    }
  );

  return { regex: new RegExp(re), fields };
}

/**
 * Match a grok pattern against input. Returns extracted fields or null.
 */
export function matchGrok(
  pattern: string,
  input: string,
  customPatterns: Record<string, string> = {}
): Record<string, unknown> | null {
  const { regex, fields } = compileGrok(pattern, customPatterns);
  const m = regex.exec(input);
  if (!m || !m.groups) return null;

  const result: Record<string, unknown> = {};
  for (const field of fields) {
    const raw = m.groups[field.name];
    if (raw === undefined) continue;

    if (field.type === 'int') {
      result[field.name] = parseInt(raw, 10);
    } else if (field.type === 'float') {
      result[field.name] = parseFloat(raw);
    } else {
      result[field.name] = raw;
    }
  }

  return result;
}
