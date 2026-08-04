const fs = require('fs');
const path = require('path');

const rootDir = '/Users/abdulhadimehthash/Downloads/Works/nearbi-staff';
const searchDirs = ['app', 'components', 'lib', 'mobile'];

function getFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      if (file !== 'node_modules' && file !== '.next' && file !== '.git') {
        getFiles(filePath, fileList);
      }
    } else if (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.js') || file.endsWith('.jsx')) {
      fileList.push(filePath);
    }
  }
  return fileList;
}

const allFiles = searchDirs.flatMap(d => getFiles(path.join(rootDir, d)));

const queryMap = [];

for (const filePath of allFiles) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  
  lines.forEach((line, idx) => {
    if (line.includes('.from(')) {
      const relPath = path.relative(rootDir, filePath);
      // Grab snippet of surrounding 10 lines
      const snippetLines = lines.slice(Math.max(0, idx - 1), Math.min(lines.length, idx + 12)).join('\n');
      const hasRange = snippetLines.includes('.range(');
      const hasSingle = snippetLines.includes('.single()') || snippetLines.includes('.maybeSingle()');
      const hasCount = snippetLines.includes('count:') || snippetLines.includes('.count(');
      const isMutating = snippetLines.includes('.insert(') || snippetLines.includes('.update(') || snippetLines.includes('.delete(') || snippetLines.includes('.upsert(');
      const hasLimit1 = snippetLines.includes('.limit(1)');
      
      if (!hasSingle && !isMutating && !hasLimit1) {
        queryMap.push({
          file: relPath,
          lineNum: idx + 1,
          lineText: line.trim(),
          hasRange,
          snippet: snippetLines
        });
      }
    }
  });
}

console.log(`=== FOUND ${queryMap.length} POTENTIAL SELECT QUERIES ACROSS THE CODEBASE ===\n`);

const unpaginated = queryMap.filter(q => !q.hasRange);

console.log(`=== UNPAGINATED SELECT QUERIES (${unpaginated.length} total) ===`);

const fileGroup = {};
unpaginated.forEach(q => {
  if (!fileGroup[q.file]) fileGroup[q.file] = [];
  fileGroup[q.file].push(q);
});

for (const [file, queries] of Object.entries(fileGroup)) {
  console.log(`\n📄 ${file} (${queries.length} unpaginated select queries):`);
  queries.forEach(q => {
    console.log(`   Line ${q.lineNum}: ${q.lineText}`);
  });
}
