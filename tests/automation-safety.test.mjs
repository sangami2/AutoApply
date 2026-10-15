import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { AutomationSafety } from '../automation-safety.mjs';

test('enforces daily LinkedIn search and application attempt limits', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'autoapply-safety-'));
  fs.mkdirSync(path.join(root, 'config'), { recursive: true });
  fs.writeFileSync(path.join(root, 'config', 'automation-safety.json'), JSON.stringify({
    maxLinkedInSearchesPerDay: 1,
    searchPauseMinMs: 0,
    searchPauseMaxMs: 0,
    maxApplicationAttemptsPerDay: 1,
    applicationPauseMinMs: 0,
    applicationPauseMaxMs: 0,
  }));
  const safety = new AutomationSafety(root);

  await safety.beforeLinkedInSearch();
  await assert.rejects(() => safety.beforeLinkedInSearch(), /safety limit reached/);
  await safety.beforeApplicationAttempt();
  await assert.rejects(() => safety.beforeApplicationAttempt(), /safety limit reached/);
});
