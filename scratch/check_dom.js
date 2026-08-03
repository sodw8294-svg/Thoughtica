const fs = require('fs');
const jsdom = require('jsdom');
const { JSDOM } = jsdom;
const html = fs.readFileSync('src/index.html', 'utf8');
const dom = new JSDOM(html);

function printTree(el, depth = 0) {
  if (depth > 6) return '';
  if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') return '';
  
  let out = '  '.repeat(depth) + el.tagName + (el.id ? '#' + el.id : '') + ' class="' + el.className + '"\n';
  Array.from(el.children).forEach(c => out += printTree(c, depth + 1));
  return out;
}

console.log(printTree(dom.window.document.body));
