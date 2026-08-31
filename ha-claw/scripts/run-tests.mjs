import { globSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url)).replace(/[/\\]scripts$/, '');
const files = globSync('test/**/*.test.ts', { cwd: root });
if (files.length === 0) {
  console.error('No test files found under test/');
  process.exit(1);
}

const setup = pathToFileURL(join(root, 'test/setup.ts')).href;
const child = spawn(process.execPath, ['--import', 'tsx', '--import', setup, '--test', ...files], {
  stdio: 'inherit',
  cwd: root,
});
child.on('exit', code => process.exit(code ?? 1));
