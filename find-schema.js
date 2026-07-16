const fs = require('fs');
const path = '/Users/longshe/.openclaw/workspace/projects/robot-maze-race/packages/server/src/config/database.ts';
let content = fs.readFileSync(path, 'utf8');
const lines = content.split('\n');

// Find the initSchema function and add seed data after migrations section
let initSchemaStart = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('export async function initSchema')) {
    initSchemaStart = i;
    break;
  }
}
console.log('initSchema starts at line:', initSchemaStart + 1);

// Find the closing } of initSchema
let braceCount = 0;
let initSchemaEnd = -1;
for (let i = initSchemaStart; i < lines.length; i++) {
  const open = (lines[i].match(/\{/g) || []).length;
  const close = (lines[i].match(/\}/g) || []).length;
  braceCount += open - close;
  if (braceCount === 0 && i > initSchemaStart) {
    initSchemaEnd = i;
    break;
  }
}
console.log('initSchema ends at line:', initSchemaEnd + 1);
console.log('Last few lines of initSchema:');
for (let i = initSchemaEnd - 5; i <= initSchemaEnd; i++) {
  console.log((i+1) + ': ' + lines[i]);
}
