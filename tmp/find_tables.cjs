const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '..', 'src');

function findTablesInFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const regex = /supabase\.from\(['"`](\w+)['"`]\)/g;
  const tables = new Set();
  let match;
  while ((match = regex.exec(content)) !== null) {
    tables.add(match[1]);
  }
  return tables;
}

function walkDir(dir) {
  const allTables = new Set();
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules') {
      for (const t of walkDir(fullPath)) allTables.add(t);
    } else if (/\.(js|jsx|ts|tsx|cjs|mjs)$/.test(entry.name)) {
      for (const t of findTablesInFile(fullPath)) allTables.add(t);
    }
  }
  return allTables;
}

// Also check root-level scripts
const rootDir = path.join(__dirname, '..');
const rootFiles = fs.readdirSync(rootDir).filter(f => /\.(js|jsx|ts|tsx|cjs|mjs)$/.test(f));
const allTables = new Set();
for (const f of rootFiles) {
  for (const t of findTablesInFile(path.join(rootDir, f))) allTables.add(t);
}
for (const t of walkDir(srcDir)) allTables.add(t);

const sorted = Array.from(allTables).sort();
console.log('Tables found in codebase:');
sorted.forEach(t => console.log('  -', t));
console.log('\nTotal:', sorted.length, 'tables');
