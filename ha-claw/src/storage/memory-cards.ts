/**
 * memory-cards.ts – Card-based memory system for the agent.
 *
 * Each memory card stores a fact, decision, or context snippet with:
 * - Keywords/tags for retrieval
 * - TTL (time-to-live) for auto-expiry
 * - Version history
 * - Relevance scoring for hybrid retrieval
 *
 * Cards are stored as individual JSON files in /data/store/memory-cards/.
 * The system is designed to keep token usage low by only injecting
 * relevant cards into the agent context per request.
 */

import { readFile, writeFile, rename, mkdir, readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { appConfig } from '../core/config.js';
import { createLogger } from '../core/logger.js';

const log = createLogger('memory');

const CARDS_DIR = join(appConfig.dataPath, 'store', 'memory-cards');

// ── Types ─────────────────────────────────────────────────

export interface MemoryCard {
  id: string;
  /** Short title/summary of the memory */
  title: string;
  /** Full content of the memory */
  content: string;
  /** Category: fact, decision, preference, context, routine */
  category: 'fact' | 'decision' | 'preference' | 'context' | 'routine';
  /** Keywords for search/retrieval */
  tags: string[];
  /** TTL in days. 0 = permanent. */
  ttlDays: number;
  /** Number of times this card was retrieved */
  accessCount: number;
  /** Last time this card was retrieved */
  lastAccessedAt: string;
  /** Version number (incremented on update) */
  version: number;
  /** Previous content (one level of history) */
  previousContent: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CardSearchResult {
  card: MemoryCard;
  score: number;
}

// ── Init ──────────────────────────────────────────────────

export async function initMemoryCards(): Promise<void> {
  await mkdir(CARDS_DIR, { recursive: true });
  log.info('Memory cards initialized', { dir: CARDS_DIR });
}

// ── CRUD ──────────────────────────────────────────────────

function cardPath(id: string): string {
  const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '');
  return join(CARDS_DIR, `${safeId}.json`);
}

export async function createCard(data: {
  title: string;
  content: string;
  category?: MemoryCard['category'];
  tags?: string[];
  ttlDays?: number;
}): Promise<MemoryCard> {
  const id = randomUUID().slice(0, 8);
  const now = new Date().toISOString();

  const card: MemoryCard = {
    id,
    title: data.title,
    content: data.content,
    category: data.category ?? 'fact',
    tags: data.tags ?? extractKeywords(data.title + ' ' + data.content),
    ttlDays: data.ttlDays ?? 0,
    accessCount: 0,
    lastAccessedAt: now,
    version: 1,
    previousContent: null,
    createdAt: now,
    updatedAt: now,
  };

  await atomicWrite(cardPath(id), card);
  log.info('Memory card created', { id, title: card.title, tags: card.tags });
  return card;
}

export async function getCard(id: string): Promise<MemoryCard | null> {
  try {
    const raw = await readFile(cardPath(id), 'utf-8');
    return JSON.parse(raw) as MemoryCard;
  } catch {
    return null;
  }
}

export async function updateCard(
  id: string,
  updates: Partial<Pick<MemoryCard, 'title' | 'content' | 'category' | 'tags' | 'ttlDays'>>,
): Promise<MemoryCard | null> {
  const existing = await getCard(id);
  if (!existing) return null;

  const updated: MemoryCard = {
    ...existing,
    ...updates,
    id, // immutable
    createdAt: existing.createdAt, // immutable
    updatedAt: new Date().toISOString(),
    version: existing.version + 1,
    previousContent: existing.content,
    // Re-extract tags if content changed
    tags:
      updates.tags ??
      (updates.content
        ? extractKeywords((updates.title ?? existing.title) + ' ' + updates.content)
        : existing.tags),
  };

  await atomicWrite(cardPath(id), updated);
  log.info('Memory card updated', { id, version: updated.version });
  return updated;
}

export async function deleteCard(id: string): Promise<boolean> {
  try {
    await unlink(cardPath(id));
    log.info('Memory card deleted', { id });
    return true;
  } catch {
    return false;
  }
}

export async function listCards(): Promise<MemoryCard[]> {
  try {
    const files = await readdir(CARDS_DIR);
    const cards: MemoryCard[] = [];
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const raw = await readFile(join(CARDS_DIR, file), 'utf-8');
      const card = JSON.parse(raw) as MemoryCard;
      // Check TTL expiry
      if (card.ttlDays > 0) {
        const age = (Date.now() - new Date(card.updatedAt).getTime()) / (1000 * 60 * 60 * 24);
        if (age > card.ttlDays) {
          await unlink(join(CARDS_DIR, file)).catch(() => {});
          log.info('Memory card expired', { id: card.id, title: card.title });
          continue;
        }
      }
      cards.push(card);
    }
    return cards.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch {
    return [];
  }
}

// ── Hybrid Retrieval ──────────────────────────────────────

/**
 * Search memory cards using hybrid retrieval:
 * 1. Keyword matching (tags + content)
 * 2. Relevance scoring (TF-IDF-like)
 * 3. Recency boost
 * 4. Access frequency boost
 *
 * Returns top-N cards sorted by relevance score.
 */
export async function searchCards(query: string, maxResults = 5): Promise<CardSearchResult[]> {
  const cards = await listCards();
  if (cards.length === 0) return [];

  const queryTokens = tokenize(query);
  const now = Date.now();

  const scored: CardSearchResult[] = cards.map(card => {
    let score = 0;

    // 1. Tag match (high weight)
    const tagSet = new Set(card.tags.map(t => t.toLowerCase()));
    for (const qt of queryTokens) {
      if (tagSet.has(qt)) score += 3.0;
    }

    // 2. Title match
    const titleTokens = tokenize(card.title);
    for (const qt of queryTokens) {
      if (titleTokens.includes(qt)) score += 2.0;
    }

    // 3. Content keyword match
    const contentLower = card.content.toLowerCase();
    for (const qt of queryTokens) {
      const occurrences = contentLower.split(qt).length - 1;
      score += Math.min(occurrences * 0.5, 2.0); // Cap at 2.0
    }

    // 4. Recency boost (newer = higher, decays over 30 days)
    const ageMs = now - new Date(card.updatedAt).getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    score += Math.max(0, 1.0 - ageDays / 30);

    // 5. Access frequency boost (logarithmic)
    score += Math.log2(1 + card.accessCount) * 0.3;

    // 6. Category boost for preferences/routines (often relevant)
    if (card.category === 'preference') score += 0.5;
    if (card.category === 'routine') score += 0.5;

    return { card, score };
  });

  // Filter cards with score > 0 and sort by score
  const relevant = scored
    .filter(r => r.score > 0.5)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);

  // Update access counts for retrieved cards
  for (const r of relevant) {
    r.card.accessCount++;
    r.card.lastAccessedAt = new Date().toISOString();
    await atomicWrite(cardPath(r.card.id), r.card).catch(() => {});
  }

  return relevant;
}

/**
 * Build a compact context string from relevant memory cards.
 * Designed to minimize token usage.
 */
export function buildMemoryContext(results: CardSearchResult[]): string {
  if (results.length === 0) return '';

  const lines = results.map(r => {
    const age = Math.floor(
      (Date.now() - new Date(r.card.updatedAt).getTime()) / (1000 * 60 * 60 * 24),
    );
    const ageStr = age === 0 ? 'heute' : age === 1 ? 'gestern' : `vor ${age}d`;
    return `- [${r.card.category}] **${r.card.title}**: ${r.card.content} _(${ageStr}, v${r.card.version})_`;
  });

  return `## Relevante Erinnerungen\n${lines.join('\n')}`;
}

// ── Helpers ───────────────────────────────────────────────

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-zäöüß0-9\s-]/g, '')
    .split(/\s+/)
    .filter(t => t.length > 2);
}

function extractKeywords(text: string): string[] {
  // Stop words (German)
  const stop = new Set([
    'der',
    'die',
    'das',
    'den',
    'dem',
    'des',
    'ein',
    'eine',
    'einer',
    'eines',
    'und',
    'oder',
    'aber',
    'wenn',
    'weil',
    'dass',
    'ist',
    'sind',
    'war',
    'hat',
    'haben',
    'wird',
    'werden',
    'kann',
    'mit',
    'von',
    'für',
    'auf',
    'aus',
    'bei',
    'nach',
    'über',
    'unter',
    'nicht',
    'auch',
    'noch',
    'nur',
    'schon',
    'sehr',
    'wie',
    'was',
    'wer',
    'wir',
    'ich',
    'sie',
    'man',
    'sich',
    'zum',
    'zur',
    'the',
    'and',
    'for',
    'with',
    'from',
    'this',
    'that',
    'are',
    'was',
    'has',
  ]);

  return [...new Set(tokenize(text).filter(t => !stop.has(t) && t.length > 2))].slice(0, 15);
}

async function atomicWrite(path: string, data: unknown): Promise<void> {
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2), 'utf-8');
  await rename(tmp, path);
}
