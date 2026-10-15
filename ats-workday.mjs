/**
 * ats-workday.mjs — Workday-specific field handling.
 *
 * Workday (and myworkdayjobs.com) does NOT use native <select>. Its dropdowns are
 * buttons (role="button"/"combobox") that open a listbox popup of role="option"s.
 * Its multiselects, date pickers, and "Add" section buttons also need bespoke
 * handling. Standard input filling misses all of it, which is why so many Workday
 * fields came back empty.
 *
 * This module detects Workday and drives those widgets, choosing the CORRECT
 * option (not just typing text) via the provided answer resolvers.
 */

export function isWorkday(page) {
  const u = page.url();
  return /myworkdayjobs\.com|workday\.com|\/wday\//i.test(u);
}

// Read a Workday field's question label from its surrounding structure.
async function labelFor(handle, page) {
  return handle.evaluate((el) => {
    // Workday wraps each field in a group with a label element.
    const group = el.closest('[data-automation-id]')?.closest('div[role="group"], .css-1, div');
    const labelledby = el.getAttribute('aria-labelledby');
    if (labelledby) {
      const parts = labelledby.split(/\s+/).map((id) => document.getElementById(id)?.textContent || '').join(' ');
      if (parts.trim()) return parts.trim();
    }
    const aria = el.getAttribute('aria-label');
    if (aria) return aria;
    // nearest preceding label text
    let node = el;
    for (let i = 0; i < 4 && node; i++) {
      node = node.parentElement;
      const lbl = node?.querySelector('label, [id$="label"], .css-label');
      if (lbl && lbl.textContent.trim()) return lbl.textContent.trim();
    }
    return '';
  }).catch(() => '');
}

/**
 * Fill Workday dropdown/listbox widgets on the active page.
 * @param page Playwright Page (newest tab)
 * @param resolvers { valueFor, choiceFor, factualAnswer, safety }
 * @returns number of widgets filled
 */
export async function fillWorkdayWidgets(page, resolvers) {
  const { choiceFor, factualAnswer, safety } = resolvers;
  let n = 0;

  // Workday dropdown buttons: data-automation-id contains "selectinput" or the
  // element is a button/combobox with aria-haspopup="listbox".
  const buttons = await page.locator(
    'button[aria-haspopup="listbox"], [role="combobox"][aria-haspopup="listbox"], [data-automation-id*="selectWidget"] button, button[data-automation-id="selectinput"]'
  ).all().catch(() => []);

  for (const btn of buttons) {
    try {
      if (!(await btn.isVisible().catch(() => false))) continue;
      // already answered? Workday shows the chosen value as the button text.
      const current = (await btn.innerText().catch(() => '')).trim();
      if (current && !/^(select one|select|choose|search)/i.test(current)) continue;

      const label = await labelFor(btn, page);
      if (!label) continue;

      // Decide the answer. Prefer deterministic choiceFor; else ask Claude with options.
      let wantPattern = choiceFor(label);

      await safety.actionPause();
      await btn.click().catch(() => {});
      await page.waitForTimeout(500);

      // Options render in a listbox popup.
      const optionEls = await page.locator('[role="option"], [data-automation-id="promptOption"]').all().catch(() => []);
      const optionTexts = [];
      for (const o of optionEls) optionTexts.push(((await o.innerText().catch(() => '')) || '').trim());

      let pickIdx = -1;
      if (wantPattern) {
        pickIdx = optionTexts.findIndex((t) => wantPattern.test(t));
      }
      if (pickIdx < 0 && factualAnswer) {
        const choices = optionTexts.filter((t) => t && !/^(select|choose)/i.test(t));
        const ans = await factualAnswer(label, 'choice', choices).catch(() => null);
        if (ans) pickIdx = optionTexts.findIndex((t) => t.toLowerCase() === ans.toLowerCase());
      }

      if (pickIdx >= 0 && optionEls[pickIdx]) {
        await safety.actionPause();
        await optionEls[pickIdx].click().catch(() => {});
        n++;
        console.log('  ✓ [workday] dropdown:', label.slice(0, 42), '→', optionTexts[pickIdx].slice(0, 30));
      } else {
        // close popup without choosing; leave for the human
        await page.keyboard.press('Escape').catch(() => {});
      }
    } catch {}
  }

  // Workday typeahead comboboxes (Country, State, School): text input with a
  // listbox of matches. Type the value, then click the matching option.
  const typeaheads = await page.locator('[data-automation-id="multiSelectContainer"] input, input[role="combobox"][aria-autocomplete]').all().catch(() => []);
  for (const inp of typeaheads) {
    try {
      if (!(await inp.isVisible().catch(() => false))) continue;
      if ((await inp.inputValue().catch(() => '')).trim()) continue;
      const label = await labelFor(inp, page);
      if (!label) continue;
      const { valueFor } = resolvers;
      let want = valueFor ? valueFor(label) : null;
      if (!want && factualAnswer) {
        want = await factualAnswer(label, 'Workday typeahead', []).catch(() => null);
      }
      if (!want) continue;
      await safety.actionPause();
      await inp.click().catch(() => {});
      await inp.pressSequentially(String(want), { delay: safety.typingDelay() });
      await page.waitForTimeout(700);
      const opt = page.locator('[role="option"]').filter({ hasText: new RegExp(String(want).slice(0, 12).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }).first();
      if (await opt.count()) { await opt.click().catch(() => {}); n++; console.log('  ✓ [workday] typeahead:', label.slice(0, 42), '→', String(want).slice(0, 30)); }
      else { await inp.press('Enter').catch(() => {}); }
    } catch {}
  }

  return n;
}

/**
 * Handle Workday account gate: "Create Account" / "Sign In".
 * Uses stored ATS credentials. Returns 'created' | 'signed-in' | null.
 */
export async function handleWorkdayAccount(page, creds, safety) {
  try {
    const email = page.locator('input[type="email"], input[data-automation-id="email"]').first();
    const pass = page.locator('input[type="password"][data-automation-id="password"], input[data-automation-id="password"]').first();
    if (!(await email.count()) || !(await pass.count())) return null;

    // Create-account flows show a verify-password field.
    const verify = page.locator('input[data-automation-id="verifyPassword"]').first();
    const createBtn = page.locator('[data-automation-id="createAccountSubmitButton"], button:has-text("Create Account")').first();
    const signInBtn = page.locator('[data-automation-id="signInSubmitButton"], button:has-text("Sign In")').first();

    await safety.actionPause();
    await email.fill(creds.email).catch(() => {});
    await pass.fill(creds.password).catch(() => {});

    if (await verify.count()) {
      await verify.fill(creds.password).catch(() => {});
      const agree = page.locator('input[type="checkbox"][data-automation-id*="Agreement"], input[type="checkbox"]').first();
      if (await agree.count() && !(await agree.isChecked().catch(() => false))) await agree.check({ force: true }).catch(() => {});
      if (await createBtn.count()) { await safety.actionPause(); await createBtn.click().catch(() => {}); return 'created'; }
    }
    if (await signInBtn.count()) { await safety.actionPause(); await signInBtn.click().catch(() => {}); return 'signed-in'; }
  } catch {}
  return null;
}
