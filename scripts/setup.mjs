#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

const requiredDirs = [
  'config',
  'private-data',
  'logs',
  'output',
  'browser-state',
  'screenshots',
];

const exampleFiles = [
  ['config/searches.example.json', 'config/searches.json'],
  ['config/actor-config.example.json', 'config/actor-config.json'],
  ['config/scoring.example.json', 'config/scoring.json'],
  ['config/application-policy.example.json', 'config/application-policy.json'],
  ['config/answer-policy.example.json', 'config/answer-policy.json'],
  ['private-data/profile.example.json', 'private-data/profile.json'],
  ['private-data/experience-inventory.example.json', 'private-data/experience-inventory.json'],
  ['private-data/master-resume.example.tex', 'private-data/master-resume.tex'],
];

console.log('🚀 Setting up Job Application Copilot...\n');

// Create required directories
console.log('📁 Creating directories...');
for (const dir of requiredDirs) {
  const fullPath = path.join(rootDir, dir);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
    console.log(`  ✓ Created ${dir}/`);
  } else {
    console.log(`  ✓ ${dir}/ already exists`);
  }
}

// Create .gitkeep files
for (const dir of requiredDirs) {
  const keepPath = path.join(rootDir, dir, '.gitkeep');
  if (!fs.existsSync(keepPath)) {
    fs.writeFileSync(keepPath, '');
  }
}

console.log('\n⚙️  Checking configuration files...');
for (const [exampleFile, targetFile] of exampleFiles) {
  const examplePath = path.join(rootDir, exampleFile);
  const targetPath = path.join(rootDir, targetFile);

  if (!fs.existsSync(targetPath)) {
    if (fs.existsSync(examplePath)) {
      fs.copyFileSync(examplePath, targetPath);
      console.log(`  ✓ Created ${targetFile} from example`);
    } else {
      console.log(`  ⚠️  Missing ${exampleFile}`);
    }
  } else {
    console.log(`  ✓ ${targetFile} already exists (skipped)`);
  }
}

console.log('\n📋 Next steps:\n');
console.log('1. Edit .env with your credentials:');
console.log('   - APIFY_TOKEN');
console.log('   - ANTHROPIC_API_KEY or OPENAI_API_KEY');
console.log('   - CREDENTIAL_PROVIDER (1password, keychain, or vault)\n');

console.log('2. Customize configuration files:');
console.log('   - config/searches.json (job titles and locations)');
console.log('   - config/actor-config.json (Apify Actor IDs)');
console.log('   - config/scoring.json (scoring weights)\n');

console.log('3. Add your candidate profile:');
console.log('   - private-data/profile.json');
console.log('   - private-data/experience-inventory.json');
console.log('   - private-data/master-resume.tex\n');

console.log('4. Start the application:');
console.log('   npm run docker:up');
console.log('   npm run db:migrate');
console.log('   npm run dev          # In one terminal');
console.log('   npm run worker       # In another terminal\n');

console.log('✅ Setup complete!\n');
