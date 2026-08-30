#!/usr/bin/env node
/**
 * Validates every relative link and image in the repository's Markdown files.
 *
 * The improvement plan for v0.9.3 had "no document names a file that does not exist" as an
 * acceptance criterion. That only holds if something enforces it, so this runs in CI.
 *
 *   node scripts/check-docs.mjs
 *
 * Exit code 1 on the first broken target. External URLs are not fetched — this checks the
 * repository's internal consistency only.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, posix, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.agents',
  '.gemini',
  'dist',
  'data',
  'coverage',
]);

/**
 * GitHub's heading-to-anchor rules, close enough for the headings we write.
 * Note that each space becomes its own hyphen — "A — B" drops the dash and yields "a--b",
 * so runs of whitespace must not be collapsed.
 */
function slugify(heading) {
  return heading
    .trim()
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[`*_~]/g, '')
    .replace(/[^\p{L}\p{N} -]/gu, '')
    .replace(/ /g, '-');
}

function collectMarkdownFiles(dir, found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && entry.name !== '.github') continue;
    if (SKIP_DIRS.has(entry.name)) continue;

    const full = join(dir, entry.name);
    if (entry.isDirectory()) collectMarkdownFiles(full, found);
    else if (entry.name.endsWith('.md')) found.push(full);
  }
  return found;
}

/**
 * Markdown links, plus `src`/`href` in raw HTML — both READMEs use an <img> tag for the
 * logo because Markdown image syntax cannot be centred.
 */
function extractTargets(text) {
  const targets = [];

  // Strip fenced code blocks so example paths in ```bash blocks are not treated as links.
  const withoutCode = text.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');

  for (const m of withoutCode.matchAll(/!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    targets.push(m[1]);
  }
  for (const m of withoutCode.matchAll(/<(?:img|a)\b[^>]*?(?:src|href)="([^"]+)"/g)) {
    targets.push(m[1]);
  }
  return targets;
}

function headingAnchors(text) {
  const anchors = new Set();
  const seen = new Map();

  for (const m of text.matchAll(/^#{1,6}\s+(.+?)\s*$/gm)) {
    const base = slugify(m[1]);
    if (!base) continue;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    anchors.add(count === 0 ? base : `${base}-${count}`);
  }
  // Explicit anchors: <a id="..."> / <a name="...">
  for (const m of text.matchAll(/<a\b[^>]*?(?:id|name)="([^"]+)"/g)) {
    anchors.add(m[1].toLowerCase());
  }
  return anchors;
}

const files = collectMarkdownFiles(repoRoot);
const anchorCache = new Map();

function anchorsFor(file) {
  if (!anchorCache.has(file)) {
    anchorCache.set(file, headingAnchors(readFileSync(file, 'utf8')));
  }
  return anchorCache.get(file);
}

const problems = [];

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const here = relative(repoRoot, file).split(sep).join(posix.sep);

  for (const raw of extractTargets(text)) {
    if (/^(?:https?:|mailto:|tel:|data:|#|\/\/)/i.test(raw)) {
      if (raw.startsWith('#')) {
        const anchor = decodeURIComponent(raw.slice(1)).toLowerCase();
        if (anchor && !anchorsFor(file).has(anchor)) {
          problems.push(`${here} → ${raw} (no such heading in this file)`);
        }
      }
      continue;
    }
    if (raw.startsWith('/')) {
      problems.push(`${here} → ${raw} (absolute path; use a path relative to the file)`);
      continue;
    }

    const [pathPart, fragment] = raw.split('#');
    const target = resolve(dirname(file), decodeURIComponent(pathPart));

    let stats;
    try {
      stats = statSync(target);
    } catch {
      problems.push(`${here} → ${raw} (target does not exist)`);
      continue;
    }

    if (fragment && stats.isFile() && target.endsWith('.md')) {
      const anchor = decodeURIComponent(fragment).toLowerCase();
      if (!anchorsFor(target).has(anchor)) {
        problems.push(`${here} → ${raw} (file exists, heading "#${fragment}" does not)`);
      }
    }
  }
}

if (problems.length > 0) {
  console.error(`Broken documentation links (${problems.length}):\n`);
  for (const problem of problems) console.error(`  ${problem}`);
  console.error(
    '\nEvery relative link must resolve. See the documentation map in AGENTS.md.'
  );
  process.exit(1);
}

console.log(`Checked ${files.length} Markdown files — all relative links resolve.`);
