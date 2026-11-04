// Starts the backend and frontend together. If either stops, both stop.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const watch = process.argv.includes('--watch') ? ['--watch'] : [];

const start = (folder, args) =>
  spawn(process.execPath, args, { cwd: path.join(root, folder), stdio: 'inherit' });

const children = [start('backend', [...watch, '--import', 'tsx', 'src/server.ts']), start('frontend', [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js')])];

children.forEach((child) =>
  child.on('exit', (code) => {
    children.forEach((other) => other.kill());
    process.exitCode = code ?? 0;
  }),
);

// Ctrl+C reaches the children directly; this process only waits for them.
for (const signal of ['SIGINT', 'SIGBREAK']) process.on(signal, () => {});
