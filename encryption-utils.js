/**
 * Encryption Utilities for Sensitive Data
 * Uses Node.js built-in crypto module (AES-256-GCM)
 * Costless solution - no external dependencies
 */

const crypto = require('crypto');

// Encryption algorithm
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 16 bytes for AES
const SALT_LENGTH = 64; // 64 bytes for key derivation
const TAG_LENGTH = 16; // 16 bytes for authentication tag
const KEY_LENGTH = 32; // 32 bytes for AES-256

/**
 * Get encryption key from environment variable or generate/store one
 * In production, this should be stored securely (e.g., Railway secrets, AWS Secrets Manager)
 */
function getEncryptionKey() {
  // Check for encryption key in environment variable
  let key = process.env.ENCRYPTION_KEY;
  
  if (!key) {
    // If no key is set, generate one and log a warning
    // In production, this should be set via environment variable
    console.warn('[SECURITY] ENCRYPTION_KEY not set. Generating temporary key. Set ENCRYPTION_KEY in production!');
    key = crypto.randomBytes(32).toString('hex');
  }
  
  // Convert hex string to buffer if needed
  if (typeof key === 'string' && key.length === 64) {
    return Buffer.from(key, 'hex');
  }
  
  // If key is shorter, derive a proper key using PBKDF2
  return crypto.pbkdf2Sync(key, 'ims-salt', 100000, KEY_LENGTH, 'sha256');
}

/**
 * Encrypt sensitive data
 * @param {string} text - Plain text to encrypt
 * @returns {string} - Encrypted string (format: iv:tag:encrypted)
 */
function encrypt(text) {
  if (!text || text === null || text === undefined) {
    return null;
  }
  
  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    let encrypted = cipher.update(String(text), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const tag = cipher.getAuthTag();
    
    // Return format: iv:tag:encrypted
    return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Failed to encrypt data');
  }
}

/**
 * Decrypt sensitive data
 * @param {string} encryptedText - Encrypted string (format: iv:tag:encrypted)
 * @returns {string} - Decrypted plain text
 */
function decrypt(encryptedText) {
  if (!encryptedText || encryptedText === null || encryptedText === undefined) {
    return null;
  }
  
  // Check if already decrypted (backward compatibility)
  if (!encryptedText.includes(':')) {
    return encryptedText;
  }
  
  try {
    const parts = encryptedText.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted data format');
    }
    
    const [ivHex, tagHex, encrypted] = parts;
    const key = getEncryptionKey();
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    // Return original value if decryption fails (for backward compatibility)
    return encryptedText;
  }
}

/**
 * Encrypt an object's sensitive fields
 * @param {Object} obj - Object to encrypt
 * @param {string[]} fields - Array of field names to encrypt
 * @returns {Object} - Object with encrypted fields
 */
function encryptFields(obj, fields) {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }
  
  const encrypted = { ...obj };
  
  fields.forEach(field => {
    if (encrypted[field] !== null && encrypted[field] !== undefined) {
      encrypted[field] = encrypt(encrypted[field]);
    }
  });
  
  return encrypted;
}

/**
 * Decrypt an object's sensitive fields
 * @param {Object} obj - Object to decrypt
 * @param {string[]} fields - Array of field names to decrypt
 * @returns {Object} - Object with decrypted fields
 */
function decryptFields(obj, fields) {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }
  
  const decrypted = { ...obj };
  
  fields.forEach(field => {
    if (decrypted[field] !== null && decrypted[field] !== undefined) {
      decrypted[field] = decrypt(decrypted[field]);
    }
  });
  
  return decrypted;
}

/**
 * Hash sensitive data (one-way, for comparison purposes)
 * @param {string} text - Text to hash
 * @returns {string} - Hashed string
 */
function hash(text) {
  if (!text) return null;
  return crypto.createHash('sha256').update(String(text)).digest('hex');
}

/**
 * Check if a string is encrypted (has the format iv:tag:encrypted)
 * @param {string} text - String to check
 * @returns {boolean} - True if encrypted
 */
function isEncrypted(text) {
  if (!text || typeof text !== 'string') {
    return false;
  }
  const parts = text.split(':');
  return parts.length === 3 && parts[0].length === 32 && parts[1].length === 32;
}

module.exports = {
  encrypt,
  decrypt,
  encryptFields,
  decryptFields,
  hash,
  isEncrypted,
  getEncryptionKey
};

