import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setChatCompleteForTests } from '../src/core/openrouter.js';
import { runScheduledJob } from '../src/core/scheduled-job.js';
import { buildAgent } from '../src/web/server.js';
import { executeSolution, useSolutionAgent } from '../src/storage/backlog-processor.js';
import { createTask, getTask, initBacklog, updateTask } from '../src/storage/backlog.js';
import {
  createJob,
  initSchedulerForTests,
  listJobs,
  runDueJobs,
} from '../src/storage/scheduler.js';
import { registerBuiltinTools } from '../src/tools/builtins.js';
import { isDangerous, registerTool } from '../src/tools/registry.js';
import { initLearning, listPromptPatches } from '../src/storage/learning.js';
import type { OpenRouterResponse, ToolDefinition } from '../src/core/types.js';

const GUARDED = 'test_guarded_write';
let guardedRuns = 0;

function toolCall(name: string, args: Record<string, unknown>, id: string) {
  return {
    id,
    type: 'function' as const,
    function: { name, arguments: JSON.stringify(args) },
  };
}

function completion(calls: ReturnType<typeof toolCall>[]): OpenRouterResponse {
  if (calls.length === 0) {
    return {
      id: 'gen-stop',
      choices: [{ message: { role: 'assistant', content: 'done' }, finish_reason: 'stop' }],
    };
  }
  return {
    id: 'gen-tools',
    choices: [
      {
        message: { role: 'assistant', content: null, tool_calls: calls },
        finish_reason: 'tool_calls',
      },
    ],
  };
}

describe('unattended schedule and solution execution', () => {
  let offered: string[] = [];

  before(async () => {
    registerBuiltinTools();
    registerTool(
      GUARDED,
      'Test-only dangerous write.',
      { entity_id: { type: 'string' } },
      async () => {
        guardedRuns += 1;
        return { ok: true };
      },
      { dangerous: true, required: ['entity_id'] },
    );
    await initLearning();
    await initBacklog();
    useSolutionAgent(buildAgent);
    await initSchedulerForTests(job => runScheduledJob(job));
  });

  after(() => {
    setChatCompleteForTests(null);
  });

  it('does not offer or run a dangerous tool when a scheduled job is due', async () => {
    guardedRuns = 0;
    offered = [];
    let calls = 0;
    setChatCompleteForTests(async (_messages, options) => {
      calls += 1;
      if (calls === 1) {
        offered = (options?.tools ?? []).map((tool: ToolDefinition) => tool.function.name);
        return completion([toolCall(GUARDED, { entity_id: 'light.kitchen' }, 'call-sched')]);
      }
      return completion([]);
    });

    const job = await createJob({
      name: 'unguarded-check',
      schedule: 'every 5m',
      message: 'Turn the kitchen light on',
    });
    await runDueJobs(new Date(Date.now() + 10 * 60_000));

    const stored = (await listJobs()).find(item => item.id === job.id);
    assert.equal(stored?.runCount, 1);
    assert.equal(offered.includes(GUARDED), false);
    assert.equal(
      offered.some(name => isDangerous(name)),
      false,
    );
    assert.equal(guardedRuns, 0);
  });

  it('runs a dangerous tool after two approvals and still refuses schedule and learn tools', async () => {
    guardedRuns = 0;
    offered = [];
    const jobsBefore = (await listJobs()).length;
    const patchesBefore = (await listPromptPatches()).length;
    let calls = 0;
    setChatCompleteForTests(async (_messages, options) => {
      calls += 1;
      if (calls === 1) {
        offered = (options?.tools ?? []).map((tool: ToolDefinition) => tool.function.name);
        return completion([
          toolCall(GUARDED, { entity_id: 'light.kitchen' }, 'call-exec'),
          toolCall(
            'schedule_create',
            { name: 'sneak', schedule: 'every 5m', message: 'again' },
            'call-create',
          ),
          toolCall('schedule_once', { name: 'later', delay: '5m', message: 'later' }, 'call-once'),
          toolCall('learn_rule', { rule: 'always on', reason: 'test' }, 'call-rule'),
        ]);
      }
      return completion([]);
    });

    const created = await createTask({
      title: 'Kitchen light',
      asIs: 'The light stays off.',
      toBe: 'The light is on.',
      impact: 'The room is lit.',
      priority: 'low',
    });
    await updateTask(created.id, { status: 'approved' }, { actor: 'human', notify: false });
    await updateTask(
      created.id,
      { status: 'solution_proposed', solution: 'Turn the kitchen light on.' },
      { actor: 'processor', notify: false },
    );
    await updateTask(
      created.id,
      { status: 'solution_approved' },
      { actor: 'human', notify: false },
    );

    await executeSolution(created.id);

    const task = await getTask(created.id);
    assert.equal(task?.status, 'done');
    assert.equal(offered.includes(GUARDED), true);
    assert.equal(guardedRuns, 1);
    assert.equal((await listJobs()).length, jobsBefore);
    assert.equal((await listPromptPatches()).length, patchesBefore);
  });
});
