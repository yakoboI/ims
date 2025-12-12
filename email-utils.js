const nodemailer = require('nodemailer');

/**
 * Get email configuration from database settings
 * @param {Array} emailSettings - Array of email settings from database
 * @returns {Object|null} Email configuration object or null if invalid
 */
function getEmailConfig(emailSettings) {
  if (!emailSettings || !Array.isArray(emailSettings)) {
    return null;
  }

  // Convert array to object for easier access
  const settings = {};
  emailSettings.forEach(s => {
    settings[s.key] = s.value;
  });

  // Check if email is enabled
  if (settings.email_enabled !== 'true' && settings.email_enabled !== true) {
    return null;
  }

  // Validate required settings
  const required = ['email_host', 'email_port', 'email_username', 'email_from'];
  const missing = required.filter(key => !settings[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required email settings: ${missing.join(', ')}`);
  }

  // Build configuration
  const config = {
    host: settings.email_host,
    port: parseInt(settings.email_port, 10),
    secure: settings.email_secure === 'true' || settings.email_secure === true, // true for 465, false for other ports
    auth: {
      user: settings.email_username,
      pass: settings.email_password || '' // Password may be empty if not set
    },
    from: settings.email_from,
    fromName: settings.email_from_name || settings.email_from
  };

  return config;
}

/**
 * Create a nodemailer transporter from email configuration
 * @param {Object} config - Email configuration object
 * @returns {Object} Nodemailer transporter
 */
function createTransporter(config) {
  const transporterConfig = {
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.auth.user,
      pass: config.auth.pass
    },
    // Add TLS options for better compatibility
    tls: {
      rejectUnauthorized: false // Allow self-signed certificates (can be made configurable)
    }
  };

  return nodemailer.createTransport(transporterConfig);
}

/**
 * Send an email using the provided configuration
 * @param {Object} config - Email configuration object
 * @param {Object} mailOptions - Email options (to, subject, text, html)
 * @returns {Promise} Promise that resolves with email info
 */
async function sendEmail(config, mailOptions) {
  const transporter = createTransporter(config);
  
  const emailOptions = {
    from: config.fromName ? `"${config.fromName}" <${config.from}>` : config.from,
    to: mailOptions.to,
    subject: mailOptions.subject || 'No Subject',
    text: mailOptions.text || '',
    html: mailOptions.html || mailOptions.text || ''
  };

  try {
    const info = await transporter.sendMail(emailOptions);
    return info;
  } catch (error) {
    console.error('Error sending email:', error);
    throw error;
  } finally {
    transporter.close();
  }
}

/**
 * Send a test email
 * @param {Array} emailSettings - Array of email settings from database
 * @param {String} testEmail - Email address to send test email to
 * @returns {Promise} Promise that resolves with email info
 */
async function sendTestEmail(emailSettings, testEmail) {
  const config = getEmailConfig(emailSettings);
  
  if (!config) {
    throw new Error('Email is not enabled or configuration is invalid');
  }

  const mailOptions = {
    to: testEmail,
    subject: 'Test Email from IMS',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">Test Email from Inventory Management System</h2>
        <p>This is a test email to verify your email configuration.</p>
        <p>If you received this email, your SMTP settings are configured correctly!</p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;">
        <p style="color: #64748b; font-size: 12px;">
          This is an automated test email from your IMS system.<br>
          Sent at: ${new Date().toLocaleString()}
        </p>
      </div>
    `,
    text: `Test Email from Inventory Management System\n\nThis is a test email to verify your email configuration.\n\nIf you received this email, your SMTP settings are configured correctly!\n\nSent at: ${new Date().toLocaleString()}`
  };

  return await sendEmail(config, mailOptions);
}

module.exports = {
  getEmailConfig,
  createTransporter,
  sendEmail,
  sendTestEmail
};

