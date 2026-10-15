#!/usr/bin/env node
/**
 * Test 2: Credentials Validation
 * Verifies API credentials are valid and accessible
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

console.log('\n=== TEST 2: CREDENTIALS VALIDATION ===\n');

// Load environment
const env = fs.readFileSync(path.join(rootDir, '.env'), 'utf-8');
const envVars = {};
env.split('\n').forEach(line => {
  const [key, value] = line.split('=');
  if (key && !key.startsWith('#')) {
    envVars[key.trim()] = value?.trim();
  }
});

// Test Apify token
test('APIFY_TOKEN exists', () => {
  return !!envVars.APIFY_TOKEN;
});

test('APIFY_TOKEN format valid', () => {
  return envVars.APIFY_TOKEN?.startsWith('apify_api_');
});

test('APIFY_TOKEN length reasonable', () => {
  return envVars.APIFY_TOKEN?.length > 40;
});

// Test Anthropic API key
test('ANTHROPIC_API_KEY exists', () => {
  return !!envVars.ANTHROPIC_API_KEY;
});

test('ANTHROPIC_API_KEY format valid', () => {
  return envVars.ANTHROPIC_API_KEY?.startsWith('sk-ant-');
});

test('ANTHROPIC_API_KEY length reasonable', () => {
  return envVars.ANTHROPIC_API_KEY?.length > 100;
});

// Test database URL
test('DATABASE_URL configured', () => {
  return !!envVars.DATABASE_URL;
});

test('DATABASE_URL format valid (PostgreSQL)', () => {
  return envVars.DATABASE_URL?.includes('postgresql://');
});

// Test Redis URL
test('REDIS_URL configured', () => {
  return !!envVars.REDIS_URL;
});

test('REDIS_URL format valid', () => {
  return envVars.REDIS_URL?.includes('redis://');
});

// Test credential provider
test('CREDENTIAL_PROVIDER configured', () => {
  return !!envVars.CREDENTIAL_PROVIDER;
});

const validProviders = ['1password', 'keychain', 'vault'];
test('CREDENTIAL_PROVIDER is valid', () => {
  return validProviders.includes(envVars.CREDENTIAL_PROVIDER?.toLowerCase());
});

// Test application settings
test('SUBMISSION_MODE configured', () => {
  return !!envVars.SUBMISSION_MODE;
});

test('MINIMUM_SCORE configured', () => {
  return !!envVars.MINIMUM_SCORE;
});

const score = parseFloat(envVars.MINIMUM_SCORE);
test('MINIMUM_SCORE is numeric and reasonable', () => {
  return !isNaN(score) && score >= 0 && score <= 10;
});

console.log(`\n✓ PASSED: ${passed}`);
console.log(`✗ FAILED: ${failed}`);
console.log(`\nResult: ${failed === 0 ? 'ALL CHECKS PASSED ✓' : 'ISSUES FOUND ✗'}\n`);

process.exit(failed === 0 ? 0 : 1);
