import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateToolArgs } from '../src/tools/validate-args.js';
import { executeTool, registerTool } from '../src/tools/registry.js';

const entitySchema = {
  type: 'object',
  properties: {
    entity_id: {
      anyOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
    },
  },
  required: ['entity_id'],
};

describe('validateToolArgs', () => {
  it('accepts a required string', () => {
    assert.equal(validateToolArgs(entitySchema, { entity_id: 'light.x' }), null);
  });

  it('accepts an array of strings', () => {
    assert.equal(validateToolArgs(entitySchema, { entity_id: ['light.x', 'light.y'] }), null);
  });

  it('rejects a missing required field', () => {
    assert.ok(validateToolArgs(entitySchema, {}));
  });

  it('rejects the wrong type', () => {
    assert.ok(validateToolArgs(entitySchema, { entity_id: 12 }));
  });
});

describe('executeTool schema gate', () => {
  it('does not run the handler when arguments are wrong', async () => {
    let ran = false;
    registerTool(
      'test_gated',
      'gate',
      { n: { type: 'number', description: 'n' } },
      async () => {
        ran = true;
        return 'ok';
      },
      { required: ['n'] },
    );
    await assert.rejects(() => executeTool('test_gated', {}), /Invalid arguments/);
    assert.equal(ran, false);
  });
});
