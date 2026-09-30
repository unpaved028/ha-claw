/**
 * cie.ts – Weekly suggestions.
 *
 * Sunday 11:00, after the digest. Loads cie.md / cie.en.md and may create
 * at most two backlog tasks in status `proposed`. Needs an OpenRouter key.
 * Without one the job stays on the schedule and the run is skipped.
 */

import { appConfig } from './config.js';
import { createLogger } from './logger.js';
import { loadCiePrompt } from './prompts.js';
import { t } from './strings.js';
import { runAgenticLoop } from './agentic-loop.js';
import { getToolNames } from '../tools/registry.js';
import { createJob, listJobs, updateJob } from '../storage/scheduler.js';

const log = createLogger('cie');

/** Stable job name so a later language change still finds the same row. */
export const CIE_JOB_NAME = 'Suggestions';
export const CIE_SCHEDULE = 'weekly sun 11:00';
export const CIE_PROPOSAL_LIMIT = 2;

/** Read tools plus backlog_propose. No device control, no config writes. */
export const CIE_TOOLS = [
  'ha_get_state',
  'ha_search_entities',
  'ha_get_entities_by_label',
  'ha_get_config',
  'ha_list_areas',
  'ha_get_automation_config',
  'ha_get_script_config',
  'ha_best_practices',
  'home_review',
  'detect_patterns',
  'backlog_list',
  'backlog_detail',
  'backlog_propose',
] as const;

let proposalBudget: number | null = null;

export function startCieProposalBudget(n: number): void {
  proposalBudget = n;
}

export function endCieProposalBudget(): void {
  proposalBudget = null;
}

export function cieBudgetActive(): boolean {
  return proposalBudget !== null;
}

/** False once this weekly run has used its proposals. Outside a run, always true. */
export function takeCieProposalSlot(): boolean {
  if (proposalBudget === null) return true;
  if (proposalBudget <= 0) return false;
  proposalBudget -= 1;
  return true;
}

export async function ensureWeeklyCieJob(): Promise<void> {
  const existing = (await listJobs()).find(j => j.kind === 'cie' || j.name === CIE_JOB_NAME);
  if (existing) {
    if (existing.kind !== 'cie') await updateJob(existing.id, { kind: 'cie' });
    return;
  }
  await createJob({
    name: CIE_JOB_NAME,
    schedule: CIE_SCHEDULE,
    message: CIE_JOB_NAME,
    kind: 'cie',
  });
}

/**
 * Run one suggestions pass.
 * Returns the text to notify, or null when there is no API key.
 */
export async function runWeeklyCie(): Promise<string | null> {
  if (!appConfig.openRouterApiKey) {
    log.info('Skipping weekly suggestions: no OpenRouter key');
    return null;
  }

  const allowed = CIE_TOOLS.filter(name => getToolNames().includes(name));
  startCieProposalBudget(CIE_PROPOSAL_LIMIT);
  try {
    const result = await runAgenticLoop(
      t('cie.instruction'),
      { name: 'CIE', systemPrompt: loadCiePrompt(), temperature: 0.2 },
      async () => false,
      [],
      allowed,
    );
    const body = result.response.trim();
    const text = body || t('cie.empty');
    return `${text}\n\n${t('cie.footer')}`;
  } finally {
    endCieProposalBudget();
  }
}
