import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { statusTransitionError } from '../src/storage/backlog.js';
import { selectToolNames } from '../src/tools/tool-selection.js';
import { shouldKeepAction } from '../src/storage/action-log.js';

describe('status transitions', () => {
  it('lets a human approve a proposal and a proposed solution', () => {
    assert.equal(statusTransitionError('proposed', 'approved', 'human'), null);
    assert.equal(statusTransitionError('solution_proposed', 'solution_approved', 'human'), null);
  });

  it('refuses a tool that tries to approve its own task', () => {
    assert.ok(statusTransitionError('proposed', 'approved', 'tool'));
    assert.ok(statusTransitionError('solution_proposed', 'solution_approved', 'tool'));
    assert.equal(statusTransitionError('proposed', 'rejected', 'tool'), null);
  });

  it('lets the processor propose a solution, not skip the second approval', () => {
    assert.equal(statusTransitionError('approved', 'solution_proposed', 'processor'), null);
    assert.ok(statusTransitionError('approved', 'solution_approved', 'processor'));
    assert.ok(statusTransitionError('fast_track_approved', 'solution_approved', 'processor'));
  });
});

describe('tool selection', () => {
  const all = ['ha_get_state', 'notes_add', 'ha_save_automation_config', 'schedule_create'];

  it('drops notes from an ordinary chat message', () => {
    const names = selectToolNames('chat', 'why is the battery card red?', all);
    assert.equal(names.includes('notes_add'), false);
    assert.equal(names.includes('ha_get_state'), true);
  });

  it('includes notes when the message asks for them', () => {
    const names = selectToolNames('chat', 'add a note about the filter', all);
    assert.equal(names.includes('notes_add'), true);
  });
});

describe('action retention', () => {
  const now = Date.parse('2026-09-29T00:00:00Z');

  it('keeps a config snapshot past seven days and drops an ordinary action', () => {
    const old = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
    assert.equal(
      shouldKeepAction(
        {
          id: 'a',
          timestamp: old,
          category: 'config',
          description: 'write',
          rollback: {
            domain: 'config',
            service: 'restore',
            entity_id: 'automation.x',
            data: { kind: 'automation', config: {} },
          },
        },
        now,
      ),
      true,
    );
    assert.equal(
      shouldKeepAction({ id: 'b', timestamp: old, category: 'switch', description: 'on' }, now),
      false,
    );
  });
});
