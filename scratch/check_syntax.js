import fs from 'fs';
import vm from 'vm';

const html = fs.readFileSync('./src/index.html', 'utf8');
const scriptMatches = [...html.matchAll(/<script[\s\S]*?>([\s\S]*?)<\/script>/gi)];

let idx = 0;
for (const match of scriptMatches) {
  idx++;
  const code = match[1];
  if (code.trim().length === 0) continue;
  
  const startOffset = match.index;
  const lineNum = html.substring(0, startOffset).split('\n').length;
  
  try {
    new vm.Script(code);
    console.log(`Script ${idx} (line ${lineNum}): Syntax OK`);
  } catch (err) {
    console.error(`Script ${idx} (line ${lineNum}) Syntax ERROR:`, err.message);
    console.error(err.stack);
  }
}
