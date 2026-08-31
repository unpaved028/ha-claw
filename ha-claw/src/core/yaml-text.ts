/**
 * yaml-text.ts – JSON → readable YAML-ish text and a unified line diff.
 *
 * No runtime YAML library: the add-on image stays on fastify + grammy.
 * The serializer covers the JSON subset HA automation/script configs use.
 */

function needsQuotes(s: string): boolean {
  if (s === '') return true;
  if (/^[-?:,[\]{}#&*!|>'"%@`]/.test(s)) return true;
  if (/[\n\r:#]/.test(s)) return true;
  if (/^(true|false|null|~)$/i.test(s)) return true;
  if (/^-?\d/.test(s)) return true;
  return false;
}

function quote(s: string): string {
  return JSON.stringify(s);
}

function emit(value: unknown, indent: number, out: string[]): void {
  const pad = '  '.repeat(indent);
  if (value === null || value === undefined) {
    out.push('null');
    return;
  }
  if (typeof value === 'boolean' || typeof value === 'number') {
    out.push(String(value));
    return;
  }
  if (typeof value === 'string') {
    out.push(needsQuotes(value) ? quote(value) : value);
    return;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      out.push('[]');
      return;
    }
    const lines: string[] = [];
    for (const item of value) {
      const inner: string[] = [];
      emit(item, indent + 1, inner);
      if (inner.length === 1 && !inner[0]!.includes('\n')) {
        lines.push(`${pad}- ${inner[0]}`);
      } else {
        lines.push(`${pad}-`);
        for (const line of inner.join('\n').split('\n')) {
          if (line) lines.push(line);
        }
      }
    }
    out.push(lines.join('\n'));
    return;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) {
      out.push('{}');
      return;
    }
    const lines: string[] = [];
    for (const [key, child] of entries) {
      const keyText = needsQuotes(key) ? quote(key) : key;
      const inner: string[] = [];
      emit(child, indent + 1, inner);
      const body = inner.join('\n');
      if (inner.length === 1 && !body.includes('\n') && body !== '' && child !== null) {
        const isObj = child !== null && typeof child === 'object';
        if (!isObj || (Array.isArray(child) && (child as unknown[]).length === 0)) {
          lines.push(`${pad}${keyText}: ${body}`);
          continue;
        }
        if (!Array.isArray(child)) {
          lines.push(`${pad}${keyText}:`);
          for (const line of body.split('\n')) lines.push(line);
          continue;
        }
      }
      if (
        typeof child !== 'object' ||
        child === null ||
        (Array.isArray(child) && child.length === 0)
      ) {
        lines.push(`${pad}${keyText}: ${body}`);
      } else {
        lines.push(`${pad}${keyText}:`);
        for (const line of body.split('\n')) {
          if (line) lines.push(line);
        }
      }
    }
    out.push(lines.join('\n'));
    return;
  }
  out.push(quote(String(value)));
}

/** Stable YAML-ish rendering of a JSON value. */
export function toYaml(value: unknown): string {
  const out: string[] = [];
  emit(value, 0, out);
  return out.join('\n').replace(/\n+$/, '') + '\n';
}

type Edit = { kind: 'eq' | 'del' | 'ins'; line: string };

function editsFromLcs(a: string[], b: string[]): Edit[] {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array<number>(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i]![j] =
        a[i - 1] === b[j - 1] ? dp[i - 1]![j - 1]! + 1 : Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!);
    }
  }
  const edits: Edit[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      edits.push({ kind: 'eq', line: a[i - 1]! });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i]![j - 1]! >= dp[i - 1]![j]!)) {
      edits.push({ kind: 'ins', line: b[j - 1]! });
      j--;
    } else {
      edits.push({ kind: 'del', line: a[i - 1]! });
      i--;
    }
  }
  edits.reverse();
  return edits;
}

/** Unified diff of two texts. Empty-change files get an explicit "(no changes)". */
export function unifiedDiff(
  oldText: string,
  newText: string,
  oldName: string,
  newName: string,
): string {
  const a = oldText.replace(/\n$/, '').split('\n');
  const b = newText.replace(/\n$/, '').split('\n');
  const edits = editsFromLcs(a, b);
  const header = [`--- ${oldName}`, `+++ ${newName}`];
  if (edits.every(e => e.kind === 'eq')) return header.join('\n') + '\n(no changes)\n';

  const lines = [...header];
  let oldLine = 1;
  let newLine = 1;
  let idx = 0;
  while (idx < edits.length) {
    while (idx < edits.length && edits[idx]!.kind === 'eq') {
      oldLine++;
      newLine++;
      idx++;
    }
    if (idx >= edits.length) break;
    const hunkStartOld = oldLine;
    const hunkStartNew = newLine;
    const hunk: Edit[] = [];
    let eqRun = 0;
    while (idx < edits.length) {
      const e = edits[idx]!;
      hunk.push(e);
      if (e.kind === 'eq') {
        oldLine++;
        newLine++;
        eqRun++;
        if (eqRun >= 2) break;
      } else {
        eqRun = 0;
        if (e.kind === 'del') oldLine++;
        else newLine++;
      }
      idx++;
    }
    let oldCount = 0;
    let newCount = 0;
    for (const e of hunk) {
      if (e.kind !== 'ins') oldCount++;
      if (e.kind !== 'del') newCount++;
    }
    lines.push(`@@ -${hunkStartOld},${oldCount} +${hunkStartNew},${newCount} @@`);
    for (const e of hunk) {
      if (e.kind === 'eq') lines.push(` ${e.line}`);
      else if (e.kind === 'del') lines.push(`-${e.line}`);
      else lines.push(`+${e.line}`);
    }
  }
  return lines.join('\n') + '\n';
}
