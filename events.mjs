/**
 * events.mjs — tiny structured-event emitter shared by daily-run.mjs and
 * apply-window.mjs so the dashboard can render a human-friendly summary
 * instead of parsing raw terminal text.
 *
 * Each event is printed as a single stdout line prefixed with a marker that
 * will never collide with normal log text, so it's easy to split the child
 * process's combined output into { events[], rawLogLines[] } on the server.
 * Terminal users see nothing extra unless they look closely — normal
 * console.log calls elsewhere still produce the human-readable terminal log.
 */
const MARKER = '%%EVT%%';

export function emit(type, data = {}) {
  try {
    process.stdout.write(MARKER + JSON.stringify({ type, ts: Date.now(), ...data }) + '\n');
  } catch { /* never let telemetry break the pipeline */ }
}

export function parseEventLine(line) {
  if (!line.startsWith(MARKER)) return null;
  try { return JSON.parse(line.slice(MARKER.length)); } catch { return null; }
}

export const EVENT_MARKER = MARKER;
