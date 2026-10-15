import fs from 'fs';
import path from 'path';

const DEFAULTS = {
  maxLinkedInSearchesPerDay: 999,
  searchPauseMinMs: 8_000,
  searchPauseMaxMs: 15_000,
  maxApplicationAttemptsPerDay: 3,
  applicationPauseMinMs: 120_000,
  applicationPauseMaxMs: 240_000,
  actionPauseMinMs: 700,
  actionPauseMaxMs: 1_800,
  typingDelayMinMs: 55,
  typingDelayMaxMs: 120,
};

const randomInt = (min, max) => Math.floor(min + Math.random() * (Math.max(min, max) - min + 1));
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class AutomationSafety {
  constructor(rootDir) {
    const configPath = path.join(rootDir, 'config', 'automation-safety.json');
    const configured = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf-8')) : {};
    this.config = { ...DEFAULTS, ...configured };
    this.statePath = path.join(rootDir, '.browser-profile', 'automation-safety-state.json');
    fs.mkdirSync(path.dirname(this.statePath), { recursive: true });
  }

  readState() {
    const today = new Date().toISOString().slice(0, 10);
    let state = {};
    try { state = JSON.parse(fs.readFileSync(this.statePath, 'utf-8')); } catch {}
    if (state.date !== today) state = { date: today, linkedInSearches: 0, applicationAttempts: 0, lastSearchAt: 0, lastApplicationAt: 0 };
    return state;
  }

  writeState(state) {
    fs.writeFileSync(this.statePath, JSON.stringify(state, null, 2));
  }

  async waitForWindow(lastAt, minMs, maxMs, label) {
    const targetGap = randomInt(minMs, maxMs);
    const remaining = Math.max(0, Number(lastAt || 0) + targetGap - Date.now());
    if (remaining > 0) {
      console.log(`  ⏱ safety pause before ${label}: ${Math.ceil(remaining / 1000)}s`);
      await sleep(remaining);
    }
  }

  async beforeLinkedInSearch() {
    const state = this.readState();
    if (state.linkedInSearches >= this.config.maxLinkedInSearchesPerDay) {
      throw new Error(`Daily LinkedIn search safety limit reached (${this.config.maxLinkedInSearchesPerDay}).`);
    }
    await this.waitForWindow(state.lastSearchAt, this.config.searchPauseMinMs, this.config.searchPauseMaxMs, 'LinkedIn search');
    state.linkedInSearches++;
    state.lastSearchAt = Date.now();
    this.writeState(state);
  }

  async beforeApplicationAttempt() {
    const state = this.readState();
    if (state.applicationAttempts >= this.config.maxApplicationAttemptsPerDay) {
      throw new Error(`Daily application-attempt safety limit reached (${this.config.maxApplicationAttemptsPerDay}).`);
    }
    await this.waitForWindow(state.lastApplicationAt, this.config.applicationPauseMinMs, this.config.applicationPauseMaxMs, 'application attempt');
    state.applicationAttempts++;
    state.lastApplicationAt = Date.now();
    this.writeState(state);
  }

  async actionPause(multiplier = 1) {
    await sleep(randomInt(this.config.actionPauseMinMs, this.config.actionPauseMaxMs) * multiplier);
  }

  typingDelay() {
    return randomInt(this.config.typingDelayMinMs, this.config.typingDelayMaxMs);
  }
}

export async function humanClick(locator, safety) {
  await safety.actionPause();
  await locator.click();
  await safety.actionPause();
}

export async function humanFill(locator, value, safety) {
  await safety.actionPause(0.5);
  await locator.click().catch(() => {});
  await locator.fill('');
  await locator.pressSequentially(String(value), { delay: safety.typingDelay() });
  await safety.actionPause(0.5);
}
