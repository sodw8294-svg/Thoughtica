// Simple email validation regex
const isValidEmail = (email) => {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email) && email.length <= 254;
};

const sanitizeString = (str) => {
  if (typeof str !== 'string') return '';
  return str
    .trim()
    .slice(0, 1000)
    .replace(/[<>"']/g, '') // Remove HTML-like characters
    .replace(/\0/g, ''); // Remove null bytes
};

module.exports = async (req, res) => {
  // Add CORS headers
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || 'https://thoughtica.io');
  res.setHeader('Access-Control-Allow-Methods', 'POST');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { name, email, message } = req.body || {};

  // Validate required fields exist and are strings
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'Name is required and must be a string' });
  }
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Email is required and must be a string' });
  }
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Message is required and must be a string' });
  }

  // Validate email format
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }

  // Sanitize inputs
  const sanitizedName = sanitizeString(name);
  const sanitizedEmail = email.toLowerCase().trim();
  const sanitizedMessage = sanitizeString(message);

  // Validate sanitized values are not empty
  if (sanitizedName.length === 0) {
    return res.status(400).json({ error: 'Name cannot be empty' });
  }
  if (sanitizedMessage.length === 0) {
    return res.status(400).json({ error: 'Message cannot be empty' });
  }

  console.log(`📬 Contact Submission from ${sanitizedName} (${sanitizedEmail})`);

  try {
    // Forward message to hello@thoughtica.net via FormSubmit service
    const response = await fetch('https://formsubmit.co/ajax/hello@thoughtica.net', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        name: sanitizedName,
        email: sanitizedEmail,
        message: sanitizedMessage,
        _subject: `Thoughtica Sanctuary Contact: ${sanitizedName}`
      })
    });

    if (!response.ok) {
      console.error('FormSubmit HTTP Error:', response.status);
      return res.status(502).json({ error: 'Failed to send message' });
    }

    return res.status(200).json({ success: true, message: 'Message sent successfully' });
  } catch (err) {
    console.error('Contact forwarding error:', err.message);
    return res.status(502).json({ error: 'Failed to send message' });
  }
};