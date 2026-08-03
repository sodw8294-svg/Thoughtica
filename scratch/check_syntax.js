import fs from 'fs';
import vm from 'vm';

const html = fs.readFileSync('./src/index.html', 'utf8');
const scriptMatches = [...html.matchAll(/<script[\s\S]*?>([\s\S]*?)<\/script>/gi)];

console.log(`Found ${scriptMatches.length} script tags.`);
let idx = 0;
for (const match of scriptMatches) {
  idx++;
  const code = match[1];
  if (code.trim().length === 0) continue;
  
  // calculate line offset of script tag in HTML
  const startOffset = match.index;
  const lineNum = html.substring(0, startOffset).split('\n').length;
  
  try {
    new vm.Script(code);
    console.log(`Script ${idx} (line ${lineNum}): Syntax OK`);
  } catch (err) {
    console.error(`Script ${idx} (line ${lineNum}) Syntax ERROR:`, err.message);
    // Find approximate line inside script
    const scriptLines = code.split('\n');
    console.error(`Script code snippet around error:`);
    for (let i = 0; i < scriptLines.length; i++) {
      try {
        new vm.Script(scriptLines.slice(0, i + 1).join('\n'));
      } catch (e) {
        if (!e.message.includes('Unexpected end of input') && !e.message.includes('Unterminated')) {
          console.error(`Line ${lineNum + i}: ${scriptLines[i]}`);
          console.error(`Error: ${e.message}`);
          break;
        }
      }
    }
  }
}
