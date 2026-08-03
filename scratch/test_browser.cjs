const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

// 1. Create a simple static file server for dist/
const server = http.createServer((req, res) => {
  let filePath = path.join(__dirname, '../dist', req.url === '/' ? 'index.html' : req.url);
  
  // Basic content-type resolution
  const ext = path.extname(filePath);
  let contentType = 'text/html';
  if (ext === '.css') contentType = 'text/css';
  else if (ext === '.js') contentType = 'application/javascript';
  else if (ext === '.png') contentType = 'image/png';
  else if (ext === '.svg') contentType = 'image/svg+xml';
  
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404);
      res.end('Not Found');
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
});

server.listen(3000, '127.0.0.1', () => {
  console.log('Static server listening on http://127.0.0.1:3000');
  launchBrowser();
});

// 2. Launch headless Edge with debugging port
function launchBrowser() {
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const userDataDir = path.join(__dirname, 'edge-profile-' + Date.now());
  
  const browserProc = spawn(edgePath, [
    '--headless=new',
    '--remote-debugging-port=9223', // use 9223 to avoid conflicts
    `--user-data-dir=${userDataDir}`,
    'http://127.0.0.1:3000'
  ]);
  
  browserProc.on('error', (err) => {
    console.error('Failed to start browser:', err);
    cleanup();
  });

  setTimeout(() => {
    connectCDP();
  }, 3000);
}

// 3. Connect to Chrome DevTools Protocol and capture logs
async function connectCDP() {
  try {
    const listRes = await fetch('http://127.0.0.1:9223/json/list');
    const list = await listRes.json();
    console.log('Targets:', list.map(t => ({ title: t.title, url: t.url })));
    
    const pageTarget = list.find(t => t.type === 'page' && t.url.includes('127.0.0.1'));
    if (!pageTarget) {
      console.error('No page target found');
      cleanup();
      return;
    }
    
    console.log('Connecting to WebSocket:', pageTarget.webSocketDebuggerUrl);
    const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
    
    let messageId = 1;
    function send(method, params = {}) {
      ws.send(JSON.stringify({ id: messageId++, method, params }));
    }
    
    ws.onopen = () => {
      console.log('CDP Connected! Enabling logs and runtime...');
      send('Runtime.enable');
      send('Log.enable');
      send('Console.enable'); // fallback for older CDP
      
      // Let's trigger click on the "Enter Sanctuary" button after 2 seconds
      setTimeout(() => {
        console.log('Attempting to click "Enter Sanctuary" button...');
        send('Runtime.evaluate', {
          expression: `(() => {
            const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Enter Sanctuary'));
            if (btn) {
              btn.click();
              return 'Button clicked!';
            }
            return 'Button not found';
          })()`
        });
      }, 2000);

      // Dump DOM status after click
      setTimeout(() => {
        console.log('Checking DOM status...');
        send('Runtime.evaluate', {
          expression: `(() => {
            const root = document.getElementById('app-sanctuary-root');
            const overlay = document.getElementById('landing-page-overlay');
            const body = document.body.innerHTML.substring(0, 1000);
            return JSON.stringify({
              rootHidden: root ? root.classList.contains('hidden') : null,
              overlayHidden: overlay ? overlay.classList.contains('hidden') : null,
              rootHeight: root ? root.offsetHeight : null,
              rootDisplay: root ? window.getComputedStyle(root).display : null,
              rootCompHeight: root ? window.getComputedStyle(root).height : null,
              parentTag: root ? root.parentNode.tagName : null,
              parentHeight: root ? root.parentNode.offsetHeight : null,
              parentDisplay: root ? window.getComputedStyle(root.parentNode).display : null,
              parentCompHeight: root ? window.getComputedStyle(root.parentNode).height : null,
              bodyHeight: document.body.offsetHeight,
              windowHeight: window.innerHeight
            });
          })()`
        });
      }, 4000);

      // Terminate test after 7 seconds
      setTimeout(() => {
        console.log('Test completed.');
        cleanup();
      }, 7000);
    };
    
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      
      // Print console API calls
      if (msg.method === 'Runtime.consoleAPICalled') {
        const args = msg.params.args.map(a => a.value || JSON.stringify(a)).join(' ');
        console.log(`[BROWSER CONSOLE] [${msg.params.type}] ${args}`);
      }
      
      // Print uncaught exceptions
      if (msg.method === 'Runtime.exceptionThrown') {
        console.error('[BROWSER EXCEPTION]', msg.params.exceptionDetails.exception.description);
      }
      
      // Print standard logs
      if (msg.method === 'Log.entryAdded') {
        console.log(`[BROWSER LOG] ${msg.params.entry.text}`);
      }

      // Print evaluation results
      if (msg.id && msg.result) {
        console.log(`[CDP RESULT #${msg.id}]`, JSON.stringify(msg.result));
      }
    };
    
    ws.onerror = (err) => {
      console.error('WebSocket Error:', err);
    };
    
  } catch (err) {
    console.error('CDP connection failed:', err);
    cleanup();
  }
}

function cleanup() {
  console.log('Cleaning up...');
  server.close();
  // Kill msedge headless instances we spawned
  const { exec } = require('child_process');
  exec('taskkill /F /IM msedge.exe', () => {
    process.exit(0);
  });
}
