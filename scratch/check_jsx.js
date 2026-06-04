const fs = require('fs');
const code = fs.readFileSync('/Users/abdulhadimehthash/Downloads/Works/nearbi-staff/app/attendance/page.tsx', 'utf8');

function checkBrackets(str) {
  let stack = [];
  let lines = str.split('\n');
  let pageStartLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('export default function AttendancePage')) {
      pageStartLine = i + 1;
    }
  }
  console.log(`export default function AttendancePage is at line ${pageStartLine}`);

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    for (let j = 0; j < line.length; j++) {
      let char = line[j];
      if (char === '{') {
        stack.push({ char, line: i + 1, col: j + 1 });
      } else if (char === '}') {
        if (stack.length === 0) {
          console.log(`Extra } at line ${i + 1}, col ${j + 1}`);
          return;
        }
        let top = stack.pop();
        if (top.line === pageStartLine) {
          console.log(`The { at page start (line ${top.line}) was closed prematurely by } at line ${i + 1}, col ${j + 1}`);
          // Print surrounding lines of the closing brace
          console.log("Surrounding lines:");
          for (let k = Math.max(0, i - 5); k <= Math.min(lines.length - 1, i + 5); k++) {
            console.log(`${k + 1}: ${lines[k]}`);
          }
          return;
        }
      }
    }
  }
  if (stack.length > 0) {
    let target = stack.find(s => s.line === pageStartLine);
    if (target) {
      console.log(`The page start brace was never closed! Stack size: ${stack.length}`);
    }
  }
}

checkBrackets(code);
