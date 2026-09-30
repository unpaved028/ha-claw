/**
 * scheduled-job.ts – What a due scheduler job actually runs.
 *
 * Digest and suggestions do not go through the tool loop. An ordinary job does,
 * with confirmation refused and dangerous tools left out of the request.
 */

import { createLogger } from './logger.js';
import { runAgenticLoop } from './agentic-loop.js';
import { runWeeklyCie } from './cie.js';
import { buildWeeklyDigest } from './home-review.js';
import { dispatchNotify } from './notify-dispatch.js';
import { buildAgent } from '../web/server.js';
import { getToolNames } from '../tools/registry.js';
import { selectToolNames } from '../tools/tool-selection.js';

const log = createLogger('scheduled-job');

export async function runScheduledJob(job: {
  id: string;
  message: string;
  kind?: 'agent' | 'digest' | 'cie';
}): Promise<string> {
  log.info('Scheduler executing job', { id: job.id, message: job.message, kind: job.kind });
  if (job.kind === 'cie') {
    const text = await runWeeklyCie();
    if (text) await dispatchNotify('cie', text, { notificationId: 'ha_claw_cie' });
    return text ?? '';
  }

  const response =
    job.kind === 'digest'
      ? (await buildWeeklyDigest()).text
      : (
          await runAgenticLoop(
            job.message,
            buildAgent(),
            async () => false,
            [],
            selectToolNames('schedule', job.message, getToolNames()),
          )
        ).response;

  if (job.kind === 'digest') {
    await dispatchNotify('digest', response, { notificationId: 'ha_claw_digest' });
  } else {
    await dispatchNotify('other_jobs', response, { notificationId: `ha_claw_job_${job.id}` });
  }

  return response;
}
