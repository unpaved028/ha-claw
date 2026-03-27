
import { initActionLog, logAction } from './src/storage/action-log.js';
import { initStorage } from './src/storage/json-store.js';

async function test() {
  console.log('Initializing...');
  await initStorage();
  await initActionLog();
  console.log('Logging test action...');
  await logAction('system', 'Scratch test action', 'test_script', {
    domain: 'light',
    service: 'turn_off',
    entity_id: 'light.test'
  });
  console.log('Done.');
}

test().catch(console.error);
