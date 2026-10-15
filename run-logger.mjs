import fs from 'fs';
import path from 'path';
import util from 'util';

/** Mirror console output to a durable run log without hiding terminal output. */
export function startRunLogger(rootDir, label) {
  const logsDir = path.join(rootDir, 'logs');
  fs.mkdirSync(logsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const logPath = process.env.E2E_LOG_PATH || path.join(logsDir, `${label}-${stamp}.log`);
  const stream = fs.createWriteStream(logPath, { flags: process.env.E2E_LOG_PATH ? 'a' : 'w' });
  const render = (args) => args.map((value) => typeof value === 'string' ? value : util.inspect(value, { depth: 5, breakLength: 160 })).join(' ');
  for (const method of ['log', 'warn', 'error']) {
    const original = console[method].bind(console);
    console[method] = (...args) => {
      original(...args);
      stream.write(`[${new Date().toISOString()}] [${method.toUpperCase()}] ${render(args)}\n`);
    };
  }
  process.on('exit', () => stream.end());
  console.log(`Run log: ${logPath}`);
  return logPath;
}
