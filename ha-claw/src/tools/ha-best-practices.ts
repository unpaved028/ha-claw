/**
 * ha-best-practices.ts – Tool to retrieve HA best practice knowledge.
 *
 * Loads reference markdown/yaml files from agents/skills/ha-best-practices/
 * and allows the bot to query them by topic.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerTool } from './registry.js';
import { createLogger } from '../core/logger.js';

const log = createLogger('ha-best-practices');

interface KnowledgeEntry {
  file: string;
  topic: string;
  content: string;
}

const knowledge: KnowledgeEntry[] = [];

function loadKnowledge(): void {
  const dir = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../agents/skills/ha-best-practices',
  );
  try {
    const files = readdirSync(dir).filter(f => f.endsWith('.md') || f.endsWith('.yaml'));
    for (const file of files) {
      const content = readFileSync(join(dir, file), 'utf-8');
      const topic = file.replace(/\.(md|yaml)$/, '').replace(/-/g, ' ');
      knowledge.push({ file, topic, content });
    }
    log.info('HA best practices loaded', { files: files.length });
  } catch (err) {
    log.warn('Could not load HA best practices', { error: String(err) });
  }
}

export function registerHABestPracticesTools(): void {
  loadKnowledge();

  registerTool(
    'ha_best_practices',
    'Retrieve Home Assistant best practice guidelines. Topics: "automation-patterns", "device-control", "helper-selection", "safe-refactoring", "template-guidelines", "examples". Use this when creating or reviewing HA automations, scripts, helpers, or templates to ensure best practices are followed.',
    {
      topic: {
        type: 'string',
        description:
          'Topic to retrieve. One of: automation-patterns, device-control, helper-selection, safe-refactoring, template-guidelines, examples. Or a keyword to search across all topics.',
      },
    },
    async args => {
      const query = ((args['topic'] as string) ?? '').toLowerCase().replace(/-/g, ' ');

      // Exact match first
      const exact = knowledge.find(k => k.topic === query);
      if (exact) {
        return { topic: exact.topic, file: exact.file, content: exact.content };
      }

      // Keyword search
      const matches = knowledge.filter(
        k => k.topic.includes(query) || k.content.toLowerCase().includes(query),
      );
      if (matches.length === 1) {
        return { topic: matches[0].topic, file: matches[0].file, content: matches[0].content };
      }
      if (matches.length > 1) {
        return {
          message: `Found ${matches.length} matching topics. Be more specific.`,
          topics: matches.map(m => m.topic),
        };
      }

      return {
        message: 'No matching best practice found.',
        availableTopics: knowledge.map(k => k.topic),
      };
    },
    { required: ['topic'] },
  );
}
