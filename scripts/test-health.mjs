#!/usr/bin/env node
/**
 * Test 5: Full System Health Check
 * Comprehensive validation of all system components
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

let sections = {};

function testSection(sectionName) {
  sections[sectionName] = { passed: 0, failed: 0 };
  console.log(`\n${sectionName}`);
  console.log('─'.repeat(60));
}

function test(name, fn) {
  const sectionName = Object.keys(sections)[Object.keys(sections).length - 1];
  try {
    if (fn()) {
      console.log(`✓ ${name}`);
      sections[sectionName].passed++;
    } else {
      console.log(`✗ ${name}`);
      sections[sectionName].failed++;
    }
  } catch (e) {
    console.log(`✗ ${name}: ${e.message}`);
    sections[sectionName].failed++;
  }
}

console.log('\n╔════════════════════════════════════════════════════════════╗');
console.log('║   COMPREHENSIVE SYSTEM HEALTH CHECK                       ║');
console.log('╚════════════════════════════════════════════════════════════╝');

// Section 1: Project Structure
testSection('1. PROJECT STRUCTURE');
test('Root package.json exists', () => fs.existsSync(path.join(rootDir, 'package.json')));
test('node_modules exists', () => fs.existsSync(path.join(rootDir, 'node_modules')));
test('Docker Compose config exists', () => fs.existsSync(path.join(rootDir, 'docker-compose.yml')));
test('README.md exists', () => fs.existsSync(path.join(rootDir, 'README.md')));
test('SECURITY.md exists', () => fs.existsSync(path.join(rootDir, 'SECURITY.md')));
test('DEPLOYMENT.md exists', () => fs.existsSync(path.join(rootDir, 'DEPLOYMENT.md')));

// Section 2: Packages
testSection('2. NPM PACKAGES');
const packages = ['shared', 'database', 'discovery', 'evaluation', 'documents', 'browser', 'ats-adapters', 'credentials', 'interventions', 'workbook'];
packages.forEach(pkg => {
  test(`@job-copilot/${pkg} exists`, () => {
    return fs.existsSync(path.join(rootDir, `packages/${pkg}`));
  });
});

// Section 3: Applications
testSection('3. APPLICATIONS');
test('Dashboard app exists', () => fs.existsSync(path.join(rootDir, 'apps/dashboard')));
test('Worker app exists', () => fs.existsSync(path.join(rootDir, 'apps/worker')));

// Section 4: Database
testSection('4. DATABASE SCHEMA');
const models = ['DiscoveryRun', 'Job', 'JobEnrichment', 'JobEligibility', 'JobScoring', 'Application', 'ApplicationAnswer', 'ApplicationValidation', 'Intervention', 'Document', 'Account', 'WorkflowEvent'];
const schema = fs.readFileSync(path.join(rootDir, 'packages/database/prisma/schema.prisma'), 'utf-8');
models.forEach(model => {
  test(`Model ${model} defined`, () => schema.includes(`model ${model}`));
});

// Section 5: Dependencies
testSection('5. CRITICAL DEPENDENCIES');
const deps = ['prisma', 'zod', 'pino', 'axios', 'playwright', 'execa', 'date-fns'];
deps.forEach(dep => {
  test(`${dep} installed`, () => {
    return fs.existsSync(path.join(rootDir, 'node_modules', dep));
  });
});

// Section 6: Configuration
testSection('6. CONFIGURATION');
test('Candidate profile exists', () => fs.existsSync(path.join(rootDir, 'private-data/profile.json')));
test('Experience inventory exists', () => fs.existsSync(path.join(rootDir, 'private-data/experience-inventory.json')));
test('.env file exists', () => fs.existsSync(path.join(rootDir, '.env')));

const profile = JSON.parse(fs.readFileSync(path.join(rootDir, 'private-data/profile.json'), 'utf-8'));
test('Profile has email', () => !!profile.email);
test('Profile has name', () => !!profile.legalName);

// Section 7: ATS Adapters
testSection('7. ATS ADAPTERS');
const adapters = ['base', 'greenhouse', 'lever', 'ashby', 'workday'];
adapters.forEach(adapter => {
  test(`${adapter} adapter exists`, () => {
    return fs.existsSync(path.join(rootDir, 'packages/ats-adapters/src', `${adapter}.ts`));
  });
});

// Section 8: Core Features
testSection('8. CORE FEATURES');
test('Discovery module exists', () => fs.existsSync(path.join(rootDir, 'packages/discovery/src')));
test('Evaluation module exists', () => fs.existsSync(path.join(rootDir, 'packages/evaluation/src')));
test('Documents module exists', () => fs.existsSync(path.join(rootDir, 'packages/documents/src')));
test('Browser module exists', () => fs.existsSync(path.join(rootDir, 'packages/browser/src')));
test('Credentials module exists', () => fs.existsSync(path.join(rootDir, 'packages/credentials/src')));
test('Interventions module exists', () => fs.existsSync(path.join(rootDir, 'packages/interventions/src')));

// Section 9: Security
testSection('9. SECURITY');
const gitignore = fs.readFileSync(path.join(rootDir, '.gitignore'), 'utf-8');
test('.env in gitignore', () => gitignore.includes('.env'));
test('node_modules in gitignore', () => gitignore.includes('node_modules'));
test('dist in gitignore', () => gitignore.includes('dist'));

const security = fs.readFileSync(path.join(rootDir, 'SECURITY.md'), 'utf-8');
test('SECURITY.md mentions encryption', () => security.includes('encrypt') || security.includes('Encrypt'));
test('SECURITY.md mentions credentials', () => security.includes('credential') || security.includes('Credential'));

// Section 10: Scripts
testSection('10. SCRIPTS & COMMANDS');
const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf-8'));
const scripts = Object.keys(packageJson.scripts || {});
test('discovery command exists', () => scripts.includes('discovery'));
test('score command exists', () => scripts.includes('score'));
test('generate-documents command exists', () => scripts.includes('generate-documents'));
test('applications:start command exists', () => scripts.includes('applications:start'));
test('pipeline command exists', () => scripts.includes('pipeline'));
test('test:all command exists', () => scripts.includes('test:all'));

// Print Summary
console.log('\n╔════════════════════════════════════════════════════════════╗');
console.log('║   HEALTH CHECK SUMMARY                                    ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

let totalPassed = 0;
let totalFailed = 0;

Object.entries(sections).forEach(([name, result]) => {
  const total = result.passed + result.failed;
  const percent = total > 0 ? ((result.passed / total) * 100).toFixed(0) : 0;
  const status = result.failed === 0 ? '✓' : '✗';
  console.log(`${status} ${name.padEnd(40)} ${result.passed}/${total} (${percent}%)`);
  totalPassed += result.passed;
  totalFailed += result.failed;
});

console.log(`\n${'─'.repeat(60)}`);
console.log(`TOTAL: ${totalPassed} passed, ${totalFailed} failed`);
console.log(`Success Rate: ${((totalPassed / (totalPassed + totalFailed)) * 100).toFixed(1)}%`);

if (totalFailed === 0) {
  console.log(`\n✓ SYSTEM READY FOR PRODUCTION ✓`);
  console.log(`\nNext step: npm run pipeline`);
} else {
  console.log(`\n✗ ISSUES FOUND - See above`);
}

console.log('\n');

process.exit(totalFailed === 0 ? 0 : 1);
