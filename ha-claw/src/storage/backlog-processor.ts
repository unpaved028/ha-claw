/**
 * backlog-processor.ts – Automated backlog task processing.
 *
 * Watches for status transitions and triggers LLM-driven processing:
 * - approved → generate solution → solution_proposed
 * - solution_approved → execute solution → done
 *
 * Event-driven: triggers on task status changes via notifyTaskChanged().
 * No polling – zero token cost when idle.
 */

import { createLogger } from '../core/logger.js';
import { getTask, updateTask, listTasks, onProcessableStatusChange } from './backlog.js';
import { runAgenticLoop } from '../core/agentic-loop.js';
import type { AgentConfig } from '../core/types.js';

const log = createLogger('backlog-proc');

let agentBuilder: (() => AgentConfig) | null = null;
let processing = false; // prevent overlapping runs
let pendingNotify = false; // coalesce rapid-fire notifications

/**
 * Initialize the backlog processor.
 * On startup, runs one initial scan to catch tasks that were approved/solution_approved
 * before the add-on started. After that, processing is purely event-driven.
 */
export function initBacklogProcessor(buildAgent: () => AgentConfig): void {
  agentBuilder = buildAgent;

  // Register event listener: trigger processing when tasks reach processable status
  onProcessableStatusChange(notifyTaskChanged);

  // One-time startup scan (delayed 10s to let everything initialize)
  setTimeout(() => {
    processQueue().catch(err =>
      log.error('Backlog processor startup scan failed', { error: String(err) }),
    );
  }, 10_000);

  log.info('Backlog processor initialized (event-driven)');
}

/**
 * Notify the processor that a task status changed.
 * Call this whenever a backlog task is updated to 'approved' or 'solution_approved'.
 * Coalesces rapid-fire notifications into a single processing run.
 */
export function notifyTaskChanged(): void {
  if (processing) {
    // Already running – remember to re-scan when done
    pendingNotify = true;
    return;
  }

  // Debounce: wait 2s before processing to coalesce rapid-fire status changes
  // (e.g., user approves multiple tasks quickly in the UI)
  setTimeout(() => {
    processQueue().catch(err => log.error('Backlog processor tick failed', { error: String(err) }));
  }, 2_000);
}

async function processQueue(): Promise<void> {
  if (!agentBuilder) return;
  if (processing) {
    pendingNotify = true;
    return;
  }
  processing = true;

  try {
    // Find tasks that need solution generation
    const allTasks = await listTasks();
    const approved = allTasks.filter(t => t.status === 'approved');
    for (const task of approved) {
      await generateSolution(task.id);
    }

    // Find tasks that need execution
    const solutionApproved = allTasks.filter(t => t.status === 'solution_approved');
    for (const task of solutionApproved) {
      await executeSolution(task.id);
    }
  } finally {
    processing = false;

    // If someone notified while we were processing, run again
    if (pendingNotify) {
      pendingNotify = false;
      log.debug('Re-scanning backlog after pending notification');
      processQueue().catch(err =>
        log.error('Backlog processor re-scan failed', { error: String(err) }),
      );
    }
  }
}

async function generateSolution(taskId: string): Promise<void> {
  const task = await getTask(taskId);
  if (!task || task.status !== 'approved') return;

  log.info('Generating solution for task', { id: taskId, title: task.title });

  const prompt = `Analysiere folgende Verbesserungsaufgabe und schlage eine konkrete Loesung vor.

Titel: ${task.title}
Ist-Zustand: ${task.asIs}
Soll-Zustand: ${task.toBe}
Erwarteter Impact: ${task.impact}
Kategorie: ${task.category}

Erstelle eine konkrete, ausfuehrbare Loesung. Falls es um eine HA-Automation geht, liefere den YAML-Code. Falls es um Labels, Skripte oder Konfiguration geht, beschreibe die exakten Schritte.
Nutze ha_best_practices um die Loesung an Best Practices auszurichten.
Antworte NUR mit der Loesung, keine Einleitung oder Erklaerung drumherum.`;

  try {
    const agent = agentBuilder!();
    const result = await runAgenticLoop(prompt, agent);
    await updateTask(taskId, {
      status: 'solution_proposed',
      solution: result.response,
    });
    log.info('Solution proposed for task', { id: taskId });
  } catch (err) {
    log.error('Solution generation failed', { id: taskId, error: String(err) });
  }
}

async function executeSolution(taskId: string): Promise<void> {
  const task = await getTask(taskId);
  if (!task || task.status !== 'solution_approved' || !task.solution) return;

  log.info('Executing solution for task', { id: taskId });
  await updateTask(taskId, { status: 'executing' });

  const prompt = `Fuehre folgende Loesung aus:

${task.solution}

Nutze die verfuegbaren Tools um die Loesung umzusetzen. Bestaetige was du getan hast.`;

  try {
    const agent = agentBuilder!();
    const result = await runAgenticLoop(prompt, agent);
    await updateTask(taskId, {
      status: 'done',
      executionResult: result.response,
    });
    log.info('Task completed', { id: taskId });
  } catch (err) {
    log.error('Task execution failed', { id: taskId, error: String(err) });
    await updateTask(taskId, {
      status: 'solution_approved', // revert to allow retry
      executionResult: `FEHLER: ${String(err).slice(0, 500)}`,
    });
  }
}

export { processQueue };
