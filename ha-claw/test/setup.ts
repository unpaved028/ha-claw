import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env['OPENROUTER_API_KEY'] ??= 'test-not-a-real-key';
process.env['HA_CLAW_DATA_PATH'] ??= mkdtempSync(join(tmpdir(), 'ha-claw-test-'));
process.env['LOG_LEVEL'] ??= 'error';
