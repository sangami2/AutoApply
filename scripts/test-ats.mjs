#!/usr/bin/env node
/**
 * Test 4: ATS Adapters
 * Verifies all ATS adapter implementations are present
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    if (fn()) {
      console.log(`✓ ${name}`);
      passed++;
    } else {
      console.log(`✗ ${name}`);
      failed++;
    }
  } catch (e) {
    console.log(`✗ ${name}: ${e.message}`);
    failed++;
  }
}

console.log('\n=== TEST 4: ATS ADAPTERS ===\n');

const adaptersDir = path.join(rootDir, 'packages/ats-adapters/src');

// Test base adapter
test('Base adapter exists', () => {
  return fs.existsSync(path.join(adaptersDir, 'base.ts'));
});

test('Base adapter has interface', () => {
  const code = fs.readFileSync(path.join(adaptersDir, 'base.ts'), 'utf-8');
  return code.includes('interface BaseATSAdapter') || code.includes('class BaseATSAdapter');
});

// Test Greenhouse adapter
test('Greenhouse adapter exists', () => {
  return fs.existsSync(path.join(adaptersDir, 'greenhouse.ts'));
});

test('Greenhouse adapter implements BaseATSAdapter', () => {
  const code = fs.readFileSync(path.join(adaptersDir, 'greenhouse.ts'), 'utf-8');
  return code.includes('GreenhouseAdapter') && code.includes('BaseATSAdapter');
});

// Test Lever adapter
test('Lever adapter exists', () => {
  return fs.existsSync(path.join(adaptersDir, 'lever.ts'));
});

test('Lever adapter implements BaseATSAdapter', () => {
  const code = fs.readFileSync(path.join(adaptersDir, 'lever.ts'), 'utf-8');
  return code.includes('LeverAdapter') && code.includes('BaseATSAdapter');
});

// Test Ashby adapter
test('Ashby adapter exists', () => {
  return fs.existsSync(path.join(adaptersDir, 'ashby.ts'));
});

test('Ashby adapter implements BaseATSAdapter', () => {
  const code = fs.readFileSync(path.join(adaptersDir, 'ashby.ts'), 'utf-8');
  return code.includes('AshbyAdapter') && code.includes('BaseATSAdapter');
});

// Test Workday adapter
test('Workday adapter exists', () => {
  return fs.existsSync(path.join(adaptersDir, 'workday.ts'));
});

test('Workday adapter implements BaseATSAdapter', () => {
  const code = fs.readFileSync(path.join(adaptersDir, 'workday.ts'), 'utf-8');
  return code.includes('WorkdayAdapter') && code.includes('BaseATSAdapter');
});

// Test detection module
test('ATS detection module exists', () => {
  return fs.existsSync(path.join(rootDir, 'packages/browser/src/detection.ts'));
});

test('Detection module has detect function', () => {
  const code = fs.readFileSync(path.join(rootDir, 'packages/browser/src/detection.ts'), 'utf-8');
  return code.includes('detect(') || code.includes('function detect');
});

// Test all have required methods
const adapters = ['greenhouse', 'lever', 'ashby', 'workday'];
const requiredMethods = ['fillProfile', 'fillEmployment', 'fillEducation', 'uploadDocuments', 'answerQuestions', 'submit'];

adapters.forEach(adapter => {
  const code = fs.readFileSync(path.join(adaptersDir, `${adapter}.ts`), 'utf-8');
  requiredMethods.forEach(method => {
    test(`${adapter} has ${method} method`, () => {
      return code.includes(method + '(') || code.includes(method + ' (');
    });
  });
});

console.log(`\n✓ PASSED: ${passed}`);
console.log(`✗ FAILED: ${failed}`);
console.log(`\nResult: ${failed === 0 ? 'ALL ADAPTERS READY ✓' : 'ISSUES FOUND ✗'}\n`);

process.exit(failed === 0 ? 0 : 1);
