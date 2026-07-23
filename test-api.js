const fetch = require('node-fetch');

async function testPollinations() {
  try {
    const res = await fetch('https://text.pollinations.ai/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: 'You are a helpful AI.' },
          { role: 'user', content: 'What is 2+2?' }
        ],
        model: 'openai'
      })
    });
    console.log('Pollinations POST status:', res.status);
    const text = await res.text();
    console.log('Pollinations POST text:', text);
  } catch(e) {
    console.error(e);
  }
}

async function testPollinationsGET() {
  try {
    const res = await fetch('https://text.pollinations.ai/' + encodeURIComponent('You are an AI. What is 2+2?'));
    console.log('Pollinations GET status:', res.status);
    const text = await res.text();
    console.log('Pollinations GET text:', text);
  } catch(e) {
    console.error(e);
  }
}

testPollinations();
testPollinationsGET();
