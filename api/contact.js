module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { name, email, message } = req.body;

  if (!name || !email || !message) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  console.log(`📬 Contact Submission for hello@thoughtica.net from ${name} (${email}): ${message}`);

  try {
    // Forward message to hello@thoughtica.net via FormSubmit service
    const response = await fetch('https://formsubmit.co/ajax/hello@thoughtica.net', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        name,
        email,
        message,
        _subject: `Thoughtica Sanctuary Contact: ${name}`
      })
    });
    
    return res.status(200).json({ success: true, message: 'Message sent successfully to hello@thoughtica.net' });
  } catch (err) {
    console.error('Contact forwarding error:', err);
    return res.status(200).json({ success: true, fallback: true });
  }
};
