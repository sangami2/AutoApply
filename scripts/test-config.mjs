#!/usr/bin/env node
/**
 * Test 1: Configuration Validation
 * Verifies all required config files exist and are valid
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

console.log('\n=== TEST 1: CONFIGURATION VALIDATION ===\n');

// Check profile
test('Profile exists (private-data/profile.json)', () => {
  return fs.existsSync(path.join(rootDir, 'private-data/profile.json'));
});

test('Profile has required fields', () => {
  const profile = JSON.parse(fs.readFileSync(path.join(rootDir, 'private-data/profile.json'), 'utf-8'));
  return profile.legalName && profile.email && profile.phone && profile.workAuthorization;
});

// Check experience inventory
test('Experience inventory exists', () => {
  return fs.existsSync(path.join(rootDir, 'private-data/experience-inventory.json'));
});

test('Experience inventory has data', () => {
  const exp = JSON.parse(fs.readFileSync(path.join(rootDir, 'private-data/experience-inventory.json'), 'utf-8'));
  return exp.experiences && exp.experiences.length > 0;
});

// Check .env file
test('.env file exists', () => {
  return fs.existsSync(path.join(rootDir, '.env'));
});

test('.env has API keys', () => {
  const env = fs.readFileSync(path.join(rootDir, '.env'), 'utf-8');
  return env.includes('APIFY_TOKEN') && env.includes('ANTHROPIC_API_KEY');
});

// Check config examples
const configFiles = [
  'config/searches.example.json',
  'config/scoring.example.json',
  'config/application-policy.example.json'
];

configFiles.forEach(file => {
  test(`Config exists: ${file}`, () => {
    return fs.existsSync(path.join(rootDir, file));
  });
});

console.log(`\n✓ PASSED: ${passed}`);
console.log(`✗ FAILED: ${failed}`);
console.log(`\nResult: ${failed === 0 ? 'ALL CHECKS PASSED ✓' : 'ISSUES FOUND ✗'}\n`);

process.exit(failed === 0 ? 0 : 1);
