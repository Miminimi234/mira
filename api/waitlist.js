// API endpoint for /api/waitlist
// SECURITY: Rate limiting should be configured at deployment level or via middleware
import nodemailer from 'nodemailer';

// SECURITY: CORS - restrict to specific origins instead of wildcard
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:5173', 'http://localhost:3000', 'https://miramaps.io'];

export default async function handler(req, res) {
  // SECURITY: CORS configuration
  const origin = req.headers.origin;
  if (origin && (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development')) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email } = req.body;

    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'Email is required' });
    }

    // SECURITY: Strict email validation and length limit
    const MAX_EMAIL_LENGTH = 254; // RFC 5321
    if (email.length > MAX_EMAIL_LENGTH) {
      return res.status(400).json({ error: 'Email too long' });
    }
    
    // Trim and sanitize email
    const sanitizedEmail = email.trim().toLowerCase().substring(0, MAX_EMAIL_LENGTH);
    
    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(sanitizedEmail)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
    
    // SECURITY: Additional validation - check for common injection patterns
    if (/[<>\"'%;()&+]/.test(sanitizedEmail)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    const notificationEmail = process.env.NOTIFICATION_EMAIL || 'dev@mira.tech';
    
    // SECURITY: Sanitize email for HTML output to prevent injection
    const escapeHtml = (text) => {
      const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
      };
      return text.replace(/[&<>"']/g, (m) => map[m]);
    };
    
    const safeEmail = escapeHtml(sanitizedEmail);
    const timestamp = new Date().toISOString();
    
    const subject = `New Waitlist Signup: ${safeEmail}`;
    const htmlMessage = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">New Agent Builder Waitlist Signup</h2>
        <p><strong>Email:</strong> ${safeEmail}</p>
        <p><strong>Timestamp:</strong> ${timestamp}</p>
        <hr style="border: 1px solid #eee; margin: 20px 0;">
        <p style="color: #666; font-size: 12px;">This is an automated notification from the MIRA waitlist system.</p>
      </div>
    `;
    const textMessage = `
New user joined the Agent Builder waitlist:

Email: ${sanitizedEmail}
Timestamp: ${timestamp}
    `.trim();

    console.log(`\n=== WAITLIST SIGNUP ===`);
    console.log(`Email: ${sanitizedEmail}`);
    console.log(`Time: ${timestamp}`);
    console.log(`========================\n`);

    try {
      const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
      const smtpSecure = process.env.SMTP_SECURE
        ? process.env.SMTP_SECURE.toLowerCase() === 'true'
        : smtpPort === 465;

      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: smtpPort,
        secure: smtpSecure,
        auth: {
          user: process.env.SMTP_USER || process.env.EMAIL_USER,
          pass: process.env.SMTP_PASS || process.env.EMAIL_PASS,
        },
      });

      if (process.env.SMTP_USER || process.env.EMAIL_USER) {
        const mailOptions = {
          from: process.env.SMTP_USER || process.env.EMAIL_USER,
          to: notificationEmail,
          subject: subject,
          text: textMessage,
          html: htmlMessage,
        };

        await transporter.sendMail(mailOptions);
        console.log(`✅ Email notification sent to ${notificationEmail}`);
      } else {
        console.log(`⚠️  Email credentials not configured. Email would be sent to: ${notificationEmail}`);
        console.log(`   Configure SMTP_USER and SMTP_PASS environment variables to enable email sending.`);
      }
    } catch (emailError) {
      console.error('Error sending notification email:', emailError);
      console.error('Email error details:', emailError.message);
    }

    return res.json({ 
      success: true, 
      message: 'Successfully joined waitlist',
      email: sanitizedEmail 
    });
  } catch (error) {
    console.error('Waitlist endpoint error:', error);
    return res.status(500).json({ 
      error: 'Failed to process waitlist signup',
      message: error.message 
    });
  }
}
