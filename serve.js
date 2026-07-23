const http = require('http');
const fs = require('fs');
const path = require('path');

const DIST = path.join('C:', 'Users', 'Kevcs', '.gemini', 'antigravity', 'scratch', 'thoughtica-mobile', 'dist');
const PORT = 5173;

const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff',
};

const server = http.createServer((req, res) => {
  let filePath = path.join(DIST, req.url === '/' ? 'index.html' : req.url);
  if (!fs.existsSync(filePath)) filePath = path.join(DIST, 'index.html');
  const ext = path.extname(filePath);
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('  ==========================================');
  console.log('  THOUGHTICA SERVER RUNNING');
  console.log('  http://localhost:' + PORT);
  console.log('  ==========================================');
  console.log('');
  console.log('  Keep this window open! Close it to stop.');
  console.log('');
});
