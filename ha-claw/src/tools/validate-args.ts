/**
 * validate-args.ts – Minimal JSON Schema check for tool arguments.
 *
 * The schema on each tool is what the model sees. Until this ran, the handler
 * received whatever the model produced. We only implement the subset the
 * registry actually writes: type, required, properties, anyOf, items.
 */

type Schema = Record<string, unknown>;

function typeOf(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function typeMatches(expected: string, value: unknown): boolean {
  const actual = typeOf(value);
  if (expected === 'integer') return actual === 'number' && Number.isInteger(value);
  return actual === expected;
}

function checkSchema(schema: Schema, value: unknown, path: string): string | null {
  if (Array.isArray(schema['anyOf'])) {
    const alts = schema['anyOf'] as Schema[];
    if (alts.some(alt => checkSchema(alt, value, path) === null)) return null;
    return `${path}: value does not match any allowed type`;
  }

  const expected = schema['type'];
  if (typeof expected === 'string' && !typeMatches(expected, value)) {
    return `${path}: expected ${expected}, got ${typeOf(value)}`;
  }

  if (expected === 'array' && Array.isArray(value)) {
    const items = schema['items'];
    if (items && typeof items === 'object') {
      for (let i = 0; i < value.length; i++) {
        const err = checkSchema(items as Schema, value[i], `${path}[${i}]`);
        if (err) return err;
      }
    }
  }

  if (expected === 'object' && value && typeof value === 'object' && !Array.isArray(value)) {
    return checkObject(schema, value as Record<string, unknown>, path);
  }

  return null;
}

function checkObject(schema: Schema, value: Record<string, unknown>, path: string): string | null {
  const required = Array.isArray(schema['required']) ? (schema['required'] as string[]) : [];
  for (const key of required) {
    if (!(key in value) || value[key] === undefined) {
      return `${path}: missing required property "${key}"`;
    }
  }

  const properties = schema['properties'];
  if (properties && typeof properties === 'object') {
    for (const [key, propSchema] of Object.entries(properties as Record<string, Schema>)) {
      if (value[key] === undefined) continue;
      const err = checkSchema(propSchema, value[key], path === 'args' ? key : `${path}.${key}`);
      if (err) return err;
    }
  }

  return null;
}

/** Returns an error string, or null when `args` satisfy the tool's parameter schema. */
export function validateToolArgs(schema: Schema, args: Record<string, unknown>): string | null {
  return checkObject({ ...schema, type: 'object' }, args, 'args');
}
