import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CIE_TOOLS,
  cieBudgetActive,
  endCieProposalBudget,
  startCieProposalBudget,
  takeCieProposalSlot,
} from '../src/core/cie.js';

describe('CIE proposal budget', () => {
  it('allows two proposals and then refuses', () => {
    startCieProposalBudget(2);
    assert.equal(cieBudgetActive(), true);
    assert.equal(takeCieProposalSlot(), true);
    assert.equal(takeCieProposalSlot(), true);
    assert.equal(takeCieProposalSlot(), false);
    endCieProposalBudget();
    assert.equal(cieBudgetActive(), false);
    assert.equal(takeCieProposalSlot(), true);
  });

  it('does not hand the weekly pass a tool that changes the home', () => {
    const names = new Set<string>(CIE_TOOLS);
    assert.equal(names.has('backlog_propose'), true);
    assert.equal(names.has('ha_call_service'), false);
    assert.equal(names.has('ha_save_automation_config'), false);
    assert.equal(names.has('schedule_create'), false);
    assert.equal(names.has('learn_rule'), false);
    assert.equal(names.has('analyze_home'), false);
  });
});
