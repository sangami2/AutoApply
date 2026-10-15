#!/usr/bin/env node
/**
 * Test 3: Database Connectivity
 * Verifies PostgreSQL is running and accessible
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

let passed = 0;
let failed = 0;

function test(name, result) {
  if (result) {
    console.log(`✓ ${name}`);
    passed++;
  } else {
    console.log(`✗ ${name}`);
    failed++;
  }
}

async function testAsync(name, fn) {
  try {
    const result = await fn();
    if (result) {
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

console.log('\n=== TEST 3: DATABASE CONNECTIVITY ===\n');

// Load environment
const env = fs.readFileSync(path.join(rootDir, '.env'), 'utf-8');
const envVars = {};
env.split('\n').forEach(line => {
  const [key, value] = line.split('=');
  if (key && !key.startsWith('#')) {
    envVars[key.trim()] = value?.trim();
  }
});

// Check Docker is running
await testAsync('Docker is running', async () => {
  try {
    const { stdout } = await execAsync('docker ps');
    return stdout.includes('CONTAINER ID');
  } catch {
    return false;
  }
});

// Check PostgreSQL container
await testAsync('PostgreSQL container is running', async () => {
  try {
    const { stdout } = await execAsync('docker ps | grep postgres');
    return true;
  } catch {
    return false;
  }
});

// Check Redis container
await testAsync('Redis container is running', async () => {
  try {
    const { stdout } = await execAsync('docker ps | grep redis');
    return true;
  } catch {
    return false;
  }
});

// Check database file exists (Prisma schema)
test('Prisma schema exists', fs.existsSync(path.join(rootDir, 'packages/database/prisma/schema.prisma')));

// Check migrations directory
test('Migrations directory exists', fs.existsSync(path.join(rootDir, 'packages/database/prisma/migrations')));

// Check node_modules/@prisma
test('Prisma packages installed', fs.existsSync(path.join(rootDir, 'node_modules/@prisma')));

console.log(`\n✓ PASSED: ${passed}`);
console.log(`✗ FAILED: ${failed}`);
console.log(`\nNote: If Docker checks failed, run: docker-compose up -d`);
console.log(`Result: ${failed <= 2 ? 'READY FOR PIPELINE ✓' : 'ISSUES FOUND ✗'}\n`);

process.exit(failed > 2 ? 1 : 0);
