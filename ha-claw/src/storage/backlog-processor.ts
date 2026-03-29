/**
 * backlog-processor.ts – Automated backlog task processing.
 *
 * Watches for status transitions and triggers LLM-driven processing:
 * - approved → generate solution → solution_proposed
 * - solution_approved → execute solution → done
 *
 * Polls every 30 seconds.
 */

import { createLogger } from '../core/logger.js';
import { getTask, updateTask, listTasks } from './backlog.js';
import { runAgenticLoop } from '../core/agentic-loop.js';
import type { AgentConfig } from '../core/types.js';

const log = createLogger('backlog-proc');

let agentBuilder: (() => AgentConfig) | null = null;
let processing = false; // prevent overlapping runs

export function initBacklogProcessor(buildAgent: () => AgentConfig): void {
  agentBuilder = buildAgent;
  setInterval(() => {
    if (processing) return;
    processQueue().catch(err =>
      log.error('Backlog processor tick failed', { error: String(err) })
    );
  }, 30_000);
  log.info('Backlog processor initialized (polling every 30s)');
}

async function processQueue(): Promise<void> {
  if (!agentBuilder) return;
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
