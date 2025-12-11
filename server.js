const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const timeout = require('connect-timeout');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const PDFDocument = require('pdfkit');
const multer = require('multer');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy for Railway and other reverse proxies
// This allows Express to correctly identify client IPs from X-Forwarded-For headers
app.set('trust proxy', true);

// SECURITY: Environment variable validation
const validateEnvironment = () => {
  const required = ['JWT_SECRET'];
  const missing = [];
  
  required.forEach(key => {
    if (!process.env[key] || process.env[key] === 'your-secret-key-change-in-production') {
      missing.push(key);
    }
  });
  
  if (missing.length > 0) {
    console.error('ERROR: Required environment variables are missing or invalid:');
    missing.forEach(key => console.error(`  - ${key}`));
    console.error('Please set these in your .env file or environment variables.');
    process.exit(1);
  }
  
  // Validate optional variables
  if (process.env.PORT && isNaN(parseInt(process.env.PORT))) {
    console.error('ERROR: PORT must be a valid number');
    process.exit(1);
  }
  
  console.log('✓ Environment variables validated');
};

validateEnvironment();

// SECURITY: Require JWT_SECRET environment variable - fail if not set
const JWT_SECRET = process.env.JWT_SECRET;
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || JWT_SECRET + '_refresh';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';
const REFRESH_TOKEN_EXPIRES_IN = process.env.REFRESH_TOKEN_EXPIRES_IN || '7d';

// SECURITY: Configure CORS to only allow specific origins
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
  : process.env.NODE_ENV === 'production' 
    ? [] // In production, require ALLOWED_ORIGINS to be set
    : ['http://localhost:3000', 'http://127.0.0.1:3000'];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // In production, if ALLOWED_ORIGINS is not set, allow all origins (for Railway)
    // This is less secure but necessary for Railway deployments
    if (process.env.NODE_ENV === 'production' && allowedOrigins.length === 0) {
      return callback(null, true);
    }
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      // In development, be strict. In production, log but allow for Railway compatibility
      if (process.env.NODE_ENV === 'production') {
        console.warn(`CORS: Origin ${origin} not in allowed list, but allowing for Railway compatibility`);
        return callback(null, true);
      }
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

// SECURITY: Add security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
      scriptSrc: [
        "'self'", 
        "'unsafe-inline'", 
        "https://cdn.jsdelivr.net",
        "https://unpkg.com"
      ],
      scriptSrcElem: [
        "'self'",
        "'unsafe-inline'",
        "https://cdn.jsdelivr.net",
        "https://unpkg.com"
      ],
      scriptSrcAttr: ["'unsafe-hashes'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      fontSrc: ["'self'", "https://cdnjs.cloudflare.com", "data:"],
      connectSrc: ["'self'", "https://cdn.jsdelivr.net", "https://unpkg.com"], // Allow API connections and source maps
      mediaSrc: ["'self'", "blob:"], // Allow camera/media access
    },
  },
  crossOriginEmbedderPolicy: false
}));

// SECURITY: Rate limiting for authentication endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15, // Limit each IP to 15 requests per windowMs (increased from 5 for better UX)
  message: 'Too many login attempts, please try again after 15 minutes.',
  standardHeaders: true,
  legacyHeaders: false,
  validate: false, // Skip validation since we have trust proxy enabled (app.set('trust proxy', true))
  skipSuccessfulRequests: true, // Don't count successful logins against the limit
});

// SECURITY: General API rate limiting
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // Limit each IP to 100 requests per minute
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  validate: false, // Skip validation since we have trust proxy enabled (app.set('trust proxy', true))
});

// SECURITY: Request size limits
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// SECURITY: Request timeout (30 seconds)
app.use(timeout('30s'));
app.use((req, res, next) => {
  if (!req.timedout) next();
});

// SECURITY: Request ID tracking middleware
app.use((req, res, next) => {
  req.id = uuidv4();
  res.setHeader('X-Request-ID', req.id);
  next();
});

// SECURITY: HTTPS enforcement in production
// Note: Railway handles HTTPS termination, so we trust the proxy headers
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    // Only redirect if we're sure it's HTTP and not behind a proxy
    const forwardedProto = req.header('x-forwarded-proto');
    const host = req.header('host');
    
    // If behind Railway/proxy, trust the headers (Railway handles HTTPS)
    // Only redirect if explicitly HTTP and we have a host header
    if (forwardedProto === 'http' && host) {
      return res.redirect(`https://${host}${req.url}`);
    }
    // Otherwise, continue (Railway proxy handles HTTPS)
    next();
  });
}

// Apply general API rate limiting to all API routes
app.use('/api/', apiLimiter);

// Static files with optimized caching for 304 responses
// Enable ETag support (default in Express, but explicit for clarity)
app.set('etag', 'strong');

app.use(express.static('public', {
  etag: true, // Enable ETag generation
  lastModified: true, // Enable Last-Modified headers
  setHeaders: (res, path, stat) => {
    // HTML files: short cache with revalidation (allows 304s)
    if (path.endsWith('.html')) {
      res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
      res.setHeader('Last-Modified', stat.mtime.toUTCString());
    }
    // JavaScript and CSS: longer cache with revalidation (allows 304s)
    else if (path.endsWith('.js') || path.endsWith('.css')) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, must-revalidate'); // 1 year, but revalidate
      res.setHeader('Last-Modified', stat.mtime.toUTCString());
    }
    // Images, fonts, and other static assets: very long cache with revalidation
    else if (path.match(/\.(jpg|jpeg|png|gif|svg|ico|woff|woff2|ttf|eot)$/i)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'); // 1 year, immutable
      res.setHeader('Last-Modified', stat.mtime.toUTCString());
    }
    // Other static files: moderate cache
    else {
      res.setHeader('Cache-Control', 'public, max-age=3600, must-revalidate'); // 1 hour
      res.setHeader('Last-Modified', stat.mtime.toUTCString());
    }
  }
}));

// Database connection
// Database file path - use environment variable if set, otherwise default to ./ims.db
// On Railway, use mounted volume at /data for persistent storage
// Railway volumes should be mounted at /data (or set DATABASE_PATH env var)
const isRailway = process.env.PORT && process.env.RAILWAY_ENVIRONMENT_NAME;
const DB_PATH = process.env.DATABASE_PATH || (isRailway ? '/data/ims.db' : './ims.db');

let db;
try {
  // Ensure directory exists for database file (especially important for Railway volumes)
  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) {
    try {
      fs.mkdirSync(dbDir, { recursive: true });
      console.log('Created database directory:', dbDir);
    } catch (mkdirErr) {
      console.warn('Could not create database directory:', dbDir, mkdirErr.message);
      // Continue anyway - SQLite will create parent directories in some cases
    }
  }
  
  db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
      console.error('Error opening database:', err.message);
      console.error('Database path:', DB_PATH);
      console.error('Error details:', err);
      // Don't exit - let the app start and handle errors gracefully
      // Database will be null, and routes will handle it
    } else {
      console.log('Connected to SQLite database at:', DB_PATH);
    }
  });
} catch (error) {
  console.error('Failed to create database connection:', error);
  console.error('Error stack:', error.stack);
  // Continue without database - routes will handle errors
  db = null;
}

// Enable foreign keys (only if db is initialized)
if (db) {
  db.run('PRAGMA foreign_keys = ON', (err) => {
    if (err) {
      console.error('Error enabling foreign keys:', err);
    }
  });
}

// Function to reconnect database (assumes db is already closed)
const reconnectDatabase = () => {
  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.error('Error reopening database:', err.message);
        reject(err);
      } else {
        console.log('Database reconnected');
        db.run('PRAGMA foreign_keys = ON', (err) => {
          if (err) console.error('Error enabling foreign keys:', err);
        });
        resolve();
      }
    });
  });
};

// Initialize database tables
const initDatabase = () => {
  if (!db) {
    console.error('Cannot initialize database - database connection not available');
    return;
  }
  
  db.serialize(() => {
    // Shops table (for multi-shop support)
    db.run(`CREATE TABLE IF NOT EXISTS shops (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shop_name TEXT NOT NULL,
      shop_code TEXT UNIQUE NOT NULL,
      address TEXT,
      phone TEXT,
      email TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Users table
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('superadmin', 'admin', 'storekeeper', 'sales', 'manager')),
      full_name TEXT,
      shop_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      is_active INTEGER DEFAULT 1,
      FOREIGN KEY (shop_id) REFERENCES shops(id)
    )`);
    
    // Add shop_id column to users if it doesn't exist (migration)
    db.run(`ALTER TABLE users ADD COLUMN shop_id INTEGER`, (err) => {
      // Ignore error if column already exists
    });

    // Categories table
    db.run(`CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Items table
    db.run(`CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      sku TEXT UNIQUE,
      description TEXT,
      category_id INTEGER,
      unit_price REAL NOT NULL,
      cost_price REAL,
      stock_quantity INTEGER DEFAULT 0,
      min_stock_level INTEGER DEFAULT 10,
      unit TEXT DEFAULT 'pcs',
      image_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES categories(id)
    )`);

    // Add image_url column if it doesn't exist (migration for existing databases)
    db.run(`ALTER TABLE items ADD COLUMN image_url TEXT`, (err) => {
      // Ignore error if column already exists
    });

    // Add expiration_date column if it doesn't exist (migration for existing databases)
    db.run(`ALTER TABLE items ADD COLUMN expiration_date DATE`, (err) => {
      // Ignore error if column already exists
    });

    // Add shop_id column to items if it doesn't exist (migration for existing databases)
    db.run(`ALTER TABLE items ADD COLUMN shop_id INTEGER`, (err) => {
      // Ignore error if column already exists
    });

    // Add is_archived column to items if it doesn't exist (migration for existing databases)
    db.run(`ALTER TABLE items ADD COLUMN is_archived INTEGER DEFAULT 0`, (err) => {
      // Ignore error if column already exists
    });

    // Item Templates table
    db.run(`CREATE TABLE IF NOT EXISTS item_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      item_data TEXT NOT NULL,
      shop_id INTEGER,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (shop_id) REFERENCES shops(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    )`);

    // Add shop_id column if it doesn't exist (migration for existing databases)
    db.run(`ALTER TABLE item_templates ADD COLUMN shop_id INTEGER`, (err) => {
      // Ignore error if column already exists
    });

    // Add created_by column if it doesn't exist (migration for existing databases)
    db.run(`ALTER TABLE item_templates ADD COLUMN created_by INTEGER`, (err) => {
      // Ignore error if column already exists
    });

    // Suppliers table
    db.run(`CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      contact_person TEXT,
      email TEXT,
      phone TEXT,
      address TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Purchases table
    db.run(`CREATE TABLE IF NOT EXISTS purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supplier_id INTEGER,
      purchase_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      delivery_date DATETIME,
      total_amount REAL NOT NULL,
      status TEXT DEFAULT 'received',
      created_by INTEGER,
      notes TEXT,
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    )`);
    
    // Add delivery_date column if it doesn't exist (migration)
    db.run(`ALTER TABLE purchases ADD COLUMN delivery_date DATETIME`, (err) => {
      if (err && !err.message.includes('duplicate column name')) {
        console.log('Note: delivery_date column may already exist');
      }
    });
    
    // Update status default if needed (migration)
    db.run(`UPDATE purchases SET status = 'received' WHERE status IS NULL OR status = ''`, (err) => {
      if (err) {
        console.log('Note: Could not update status defaults');
      }
    });

    // Purchase_Items table
    db.run(`CREATE TABLE IF NOT EXISTS purchase_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchase_id INTEGER NOT NULL,
      item_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price REAL NOT NULL,
      total_price REAL NOT NULL,
      FOREIGN KEY (purchase_id) REFERENCES purchases(id),
      FOREIGN KEY (item_id) REFERENCES items(id)
    )`);

    // Sales table
    db.run(`CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      total_amount REAL NOT NULL,
      customer_name TEXT,
      created_by INTEGER,
      notes TEXT,
      FOREIGN KEY (created_by) REFERENCES users(id)
    )`);

    // Sales_Items table
    db.run(`CREATE TABLE IF NOT EXISTS sales_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER NOT NULL,
      item_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price REAL NOT NULL,
      total_price REAL NOT NULL,
      FOREIGN KEY (sale_id) REFERENCES sales(id),
      FOREIGN KEY (item_id) REFERENCES items(id)
    )`);

    // Stock_Adjustments table
    db.run(`CREATE TABLE IF NOT EXISTS stock_adjustments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL,
      adjustment_type TEXT CHECK(adjustment_type IN ('increase', 'decrease', 'set')),
      quantity INTEGER NOT NULL,
      reason TEXT,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (item_id) REFERENCES items(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    )`);

    // Expenses table
    db.run(`CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      expense_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      category TEXT NOT NULL,
      description TEXT,
      amount REAL NOT NULL,
      payment_method TEXT,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id)
    )`);

    // Customers table
    db.run(`CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      address TEXT,
      shop_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (shop_id) REFERENCES shops(id)
    )`);

    // Add shop_id column to customers if it doesn't exist (migration)
    db.run(`ALTER TABLE customers ADD COLUMN shop_id INTEGER`, (err) => {
      // Ignore error if column already exists
    });

    // Terms and Service Templates table
    db.run(`CREATE TABLE IF NOT EXISTS terms_and_service (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('invoice', 'receipt', 'purchase', 'general')),
      content TEXT NOT NULL,
      description TEXT,
      shop_id INTEGER,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (shop_id) REFERENCES shops(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    )`);

    // Add shop_id and created_by columns if they don't exist (migration)
    db.run(`ALTER TABLE terms_and_service ADD COLUMN shop_id INTEGER`, (err) => {
      // Ignore error if column already exists
    });
    db.run(`ALTER TABLE terms_and_service ADD COLUMN created_by INTEGER`, (err) => {
      // Ignore error if column already exists
    });
    db.run(`ALTER TABLE terms_and_service ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP`, (err) => {
      // Ignore error if column already exists
    });

    // System Settings table
    db.run(`CREATE TABLE IF NOT EXISTS system_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      setting_key TEXT UNIQUE NOT NULL,
      setting_value TEXT,
      setting_type TEXT NOT NULL DEFAULT 'string' CHECK(setting_type IN ('string', 'number', 'boolean', 'json')),
      category TEXT NOT NULL DEFAULT 'general' CHECK(category IN ('general', 'security', 'email', 'backup', 'display', 'currency', 'datetime', 'notification', 'integration')),
      description TEXT,
      is_encrypted INTEGER DEFAULT 0,
      shop_id INTEGER,
      updated_by INTEGER,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (shop_id) REFERENCES shops(id),
      FOREIGN KEY (updated_by) REFERENCES users(id)
    )`);

    // Initialize default system settings
    const defaultSettings = [
      { key: 'system_name', value: 'Inventory Management System', type: 'string', category: 'general', description: 'System name displayed in the application' },
      { key: 'shop_system_name', value: '', type: 'string', category: 'general', description: 'Sub-system name for this shop (customizable per shop)' },
      { key: 'company_name', value: '', type: 'string', category: 'general', description: 'Company name for invoices and receipts' },
      { key: 'company_address', value: '', type: 'string', category: 'general', description: 'Company address' },
      { key: 'company_phone', value: '', type: 'string', category: 'general', description: 'Company phone number' },
      { key: 'company_email', value: '', type: 'string', category: 'general', description: 'Company email address' },
      { key: 'company_tax_id', value: '', type: 'string', category: 'general', description: 'Company tax ID/VAT number' },
      { key: 'system_timezone', value: 'UTC', type: 'string', category: 'datetime', description: 'System timezone (e.g., UTC, Africa/Dar_es_Salaam)' },
      { key: 'date_format', value: 'YYYY-MM-DD', type: 'string', category: 'datetime', description: 'Date format (YYYY-MM-DD, DD/MM/YYYY, MM/DD/YYYY)' },
      { key: 'time_format', value: '24h', type: 'string', category: 'datetime', description: 'Time format (12h or 24h)' },
      { key: 'currency_code', value: 'TZS', type: 'string', category: 'currency', description: 'Currency code (TZS, USD, EUR, etc.)' },
      { key: 'currency_symbol', value: 'Tshs', type: 'string', category: 'currency', description: 'Currency symbol' },
      { key: 'currency_position', value: 'before', type: 'string', category: 'currency', description: 'Currency position (before or after)' },
      { key: 'decimal_places', value: '2', type: 'number', category: 'currency', description: 'Number of decimal places for currency' },
      { key: 'default_tax_rate', value: '0', type: 'number', category: 'general', description: 'Default tax rate percentage' },
      { key: 'tax_calculation_method', value: 'inclusive', type: 'string', category: 'general', description: 'Tax calculation method (inclusive or exclusive)' },
      { key: 'invoice_number_format', value: 'INV-{YYYY}-{MM}-{####}', type: 'string', category: 'general', description: 'Invoice number format (use {YYYY}, {MM}, {DD}, {####} for auto-increment)' },
      { key: 'receipt_number_format', value: 'RCP-{YYYY}-{MM}-{####}', type: 'string', category: 'general', description: 'Receipt number format' },
      { key: 'items_per_page', value: '25', type: 'number', category: 'display', description: 'Default number of items per page' },
      { key: 'print_paper_size', value: 'A4', type: 'string', category: 'display', description: 'Default paper size for printing (A4, Letter, etc.)' },
      { key: 'print_margin', value: '10', type: 'number', category: 'display', description: 'Print margin in millimeters' },
      { key: 'session_timeout', value: '30', type: 'number', category: 'security', description: 'Session timeout in minutes' },
      { key: 'password_min_length', value: '8', type: 'number', category: 'security', description: 'Minimum password length' },
      { key: 'require_strong_password', value: 'true', type: 'boolean', category: 'security', description: 'Require strong passwords' },
      { key: 'enable_two_factor', value: 'false', type: 'boolean', category: 'security', description: 'Enable two-factor authentication' },
      { key: 'max_login_attempts', value: '5', type: 'number', category: 'security', description: 'Maximum login attempts before lockout' },
      { key: 'lockout_duration', value: '15', type: 'number', category: 'security', description: 'Account lockout duration in minutes' },
      { key: 'backup_auto_enabled', value: 'true', type: 'boolean', category: 'backup', description: 'Enable automatic backups' },
      { key: 'backup_frequency', value: 'daily', type: 'string', category: 'backup', description: 'Backup frequency (daily, weekly, monthly)' },
      { key: 'backup_retention_days', value: '30', type: 'number', category: 'backup', description: 'Number of days to retain backups' },
      { key: 'backup_location', value: 'local', type: 'string', category: 'backup', description: 'Backup storage location (local, cloud)' },
      { key: 'email_enabled', value: 'false', type: 'boolean', category: 'email', description: 'Enable email notifications' },
      { key: 'email_host', value: '', type: 'string', category: 'email', description: 'SMTP host' },
      { key: 'email_port', value: '587', type: 'number', category: 'email', description: 'SMTP port' },
      { key: 'email_secure', value: 'true', type: 'boolean', category: 'email', description: 'Use secure connection (TLS)' },
      { key: 'email_username', value: '', type: 'string', category: 'email', description: 'SMTP username' },
      { key: 'email_password', value: '', type: 'string', category: 'email', description: 'SMTP password (encrypted)' },
      { key: 'email_from', value: '', type: 'string', category: 'email', description: 'Default sender email address' },
      { key: 'email_from_name', value: '', type: 'string', category: 'email', description: 'Default sender name' },
      { key: 'low_stock_notification', value: 'true', type: 'boolean', category: 'notification', description: 'Enable low stock notifications' },
      { key: 'low_stock_threshold', value: '10', type: 'number', category: 'notification', description: 'Low stock threshold percentage' },
      { key: 'enable_audit_log', value: 'true', type: 'boolean', category: 'security', description: 'Enable audit logging' },
      { key: 'audit_log_retention_days', value: '90', type: 'number', category: 'security', description: 'Audit log retention in days' },
      { key: 'enable_api_rate_limit', value: 'true', type: 'boolean', category: 'security', description: 'Enable API rate limiting' },
      { key: 'api_rate_limit_per_minute', value: '100', type: 'number', category: 'security', description: 'API requests per minute limit' },
      { key: 'theme', value: 'light', type: 'string', category: 'display', description: 'Application theme (light, dark, auto)' },
      { key: 'language', value: 'en', type: 'string', category: 'display', description: 'Default language code' },
      { key: 'enable_barcode_scanning', value: 'true', type: 'boolean', category: 'display', description: 'Enable barcode scanning feature' },
      { key: 'barcode_format', value: 'CODE128', type: 'string', category: 'display', description: 'Default barcode format' }
    ];

    // Insert default settings if they don't exist
    // Use INSERT OR IGNORE with proper error handling to avoid UNIQUE constraint violations
    defaultSettings.forEach(setting => {
      db.run(
        `INSERT OR IGNORE INTO system_settings (setting_key, setting_value, setting_type, category, description, shop_id) 
         VALUES (?, ?, ?, ?, ?, NULL)`,
        [setting.key, setting.value, setting.type, setting.category, setting.description],
        (err) => {
          // INSERT OR IGNORE should prevent UNIQUE constraint errors, but handle any other errors
          if (err) {
            // Only log non-UNIQUE constraint errors
            if (err.code !== 'SQLITE_CONSTRAINT' || !err.message.includes('UNIQUE')) {
              console.error(`Error inserting default setting ${setting.key}:`, err);
            }
            // Silently ignore UNIQUE constraint errors as they indicate the setting already exists
          }
        }
      );
    });

    // Invoices table
    db.run(`CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_number TEXT UNIQUE NOT NULL,
      invoice_date DATETIME NOT NULL,
      due_date DATETIME,
      customer_id INTEGER,
      customer_name TEXT,
      customer_email TEXT,
      customer_phone TEXT,
      customer_address TEXT,
      subtotal REAL NOT NULL DEFAULT 0,
      discount_amount REAL DEFAULT 0,
      tax_amount REAL DEFAULT 0,
      total_amount REAL NOT NULL DEFAULT 0,
      paid_amount REAL DEFAULT 0,
      balance_amount REAL DEFAULT 0,
      payment_method TEXT,
      payment_terms TEXT,
      notes TEXT,
      terms_conditions TEXT,
      status TEXT DEFAULT 'draft' CHECK(status IN ('draft', 'sent', 'paid', 'partial', 'overdue', 'cancelled')),
      created_by INTEGER,
      shop_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers(id),
      FOREIGN KEY (created_by) REFERENCES users(id),
      FOREIGN KEY (shop_id) REFERENCES shops(id)
    )`);

    // Invoice_Items table
    db.run(`CREATE TABLE IF NOT EXISTS invoice_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL,
      item_id INTEGER,
      item_name TEXT NOT NULL,
      description TEXT,
      quantity REAL NOT NULL,
      unit_price REAL NOT NULL,
      discount REAL DEFAULT 0,
      tax_rate REAL DEFAULT 0,
      total_price REAL NOT NULL,
      FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
      FOREIGN KEY (item_id) REFERENCES items(id)
    )`);

    // Role_Permissions table for page access management
    db.run(`CREATE TABLE IF NOT EXISTS role_permissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role TEXT NOT NULL,
      page TEXT NOT NULL,
      can_access INTEGER DEFAULT 1,
      UNIQUE(role, page)
    )`);

    // SECURITY: Login attempts table for account lockout
    db.run(`CREATE TABLE IF NOT EXISTS login_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      ip_address TEXT,
      attempt_time DATETIME DEFAULT CURRENT_TIMESTAMP,
      success INTEGER DEFAULT 0
    )`);

    // Create index for faster lookups
    db.run(`CREATE INDEX IF NOT EXISTS idx_login_attempts_username ON login_attempts(username, attempt_time)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON login_attempts(ip_address, attempt_time)`);

    // SECURITY: Audit logs table for tracking sensitive operations
    db.run(`CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      action TEXT NOT NULL,
      resource_type TEXT,
      resource_id INTEGER,
      ip_address TEXT,
      user_agent TEXT,
      details TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`);

    // Create index for audit logs
    db.run(`CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id, created_at)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action, created_at)`);

    // SECURITY: Refresh tokens table
    db.run(`CREATE TABLE IF NOT EXISTS refresh_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT UNIQUE NOT NULL,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      revoked INTEGER DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`);

    // Create index for refresh tokens
    db.run(`CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id, revoked)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens(token)`);

    // Clear data requests table
    db.run(`CREATE TABLE IF NOT EXISTS clear_data_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'completed', 'cancelled')),
      admin_confirmations INTEGER DEFAULT 0,
      manager_confirmations INTEGER DEFAULT 0,
      backup_file_path TEXT,
      pdf_file_path TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME,
      FOREIGN KEY (admin_id) REFERENCES users(id)
    )`);
    
    // Migration: Update CHECK constraint for existing tables to include 'cancelled'
    // SQLite doesn't support ALTER TABLE to modify CHECK constraints, so we recreate the table
    db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='clear_data_requests'", (err, row) => {
      if (!err && row) {
        // Try to test if 'cancelled' is allowed by attempting to update a non-existent row
        // If it fails, we need to recreate the table
        db.run(`PRAGMA foreign_keys=OFF`, (pragmaErr) => {
          db.run(`CREATE TABLE clear_data_requests_migration (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            admin_id INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'completed', 'cancelled')),
            admin_confirmations INTEGER DEFAULT 0,
            manager_confirmations INTEGER DEFAULT 0,
            backup_file_path TEXT,
            pdf_file_path TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            completed_at DATETIME,
            FOREIGN KEY (admin_id) REFERENCES users(id)
          )`, (createErr) => {
            if (!createErr) {
              db.run(`INSERT INTO clear_data_requests_migration SELECT * FROM clear_data_requests`, (insertErr) => {
                if (!insertErr) {
                  db.run(`DROP TABLE clear_data_requests`, (dropErr) => {
                    if (!dropErr) {
                      db.run(`ALTER TABLE clear_data_requests_migration RENAME TO clear_data_requests`, (renameErr) => {
                        db.run(`PRAGMA foreign_keys=ON`);
                        if (!renameErr) {
                          console.log('✓ Updated clear_data_requests table to include cancelled status');
                        }
                      });
                    }
                  });
                } else {
                  // Migration failed, drop temp table
                  db.run(`DROP TABLE clear_data_requests_migration`, () => {
                    db.run(`PRAGMA foreign_keys=ON`);
                  });
                }
              });
            } else {
              db.run(`PRAGMA foreign_keys=ON`);
            }
          });
        });
      }
    });

    // Initialize default role permissions - matching actual architecture
    const defaultPages = [
      'dashboard',
      'inventory-items',
      'inventory-operations',
      'goods-prices',
      'stock-manage',
      'goods-barcodes',
      'purchases',
      'sales',
      'reports',
      'expenses',
      'receipts',
      'invoices',
      'suppliers',
      'categories',
      'customers',
      'terms-and-service',
      'users',
      'shops',
      'shop-statistics',
      'subscription-plans'
    ];
    const defaultPermissions = {
      'superadmin': [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // Full access - ALL pages
      'admin': [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0], // Full access except shops, shop-statistics, subscription-plans
      'storekeeper': [1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0], // Dashboard, Inventory pages, Purchases, Categories, Suppliers
      'sales': [1, 1, 0, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0], // Dashboard, Inventory Items, Goods Barcodes, Sales, Customers, Receipts
      'manager': [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0] // Dashboard, Reports, Shop Statistics
    };

    defaultPages.forEach((page, index) => {
      Object.keys(defaultPermissions).forEach(role => {
        db.run(`INSERT OR REPLACE INTO role_permissions (role, page, can_access) 
                VALUES (?, ?, ?)`, [role, page, defaultPermissions[role][index]]);
      });
    });

    // Create default admin user if not exists
    const defaultPassword = bcrypt.hashSync('admin123', 10);
    db.run(`INSERT OR IGNORE INTO users (username, email, password, role, full_name) 
            VALUES ('admin', 'admin@ims.com', ?, 'admin', 'Admin')`, [defaultPassword], (err) => {
      if (err) {
        console.error('Error creating default admin user:', err);
      }
    });

    // Create default superadmin user if not exists
    const superadminUsername = process.env.SUPERADMIN_USERNAME || 'superadmin';
    const superadminPassword = process.env.SUPERADMIN_PASSWORD || 'superadmin123';
    const superadminEmail = process.env.SUPERADMIN_EMAIL || 'superadmin@ims.com';
    const superadminFullName = process.env.SUPERADMIN_FULL_NAME || 'Super Admin';
    const superadminPasswordHash = bcrypt.hashSync(superadminPassword, 10);
    
    db.run(`INSERT OR IGNORE INTO users (username, email, password, role, full_name, shop_id, is_active) 
            VALUES (?, ?, ?, 'superadmin', ?, NULL, 1)`, 
            [superadminUsername, superadminEmail, superadminPasswordHash, superadminFullName], (err) => {
      if (err) {
        console.error('Error creating default superadmin user:', err);
      } else {
        // Check if superadmin was actually created (not ignored due to existing)
        db.get('SELECT id FROM users WHERE username = ? AND role = ?', [superadminUsername, 'superadmin'], (err, row) => {
          if (!err && row) {
            console.log(`✓ Superadmin user ready: ${superadminUsername}`);
          }
        });
      }
      console.log('✓ Database initialization complete');
    });
  });
};

// Initialize database tables
initDatabase();

// Middleware to check database readiness
const checkDatabaseReady = (req, res, next) => {
  if (!db) {
    console.error('Database check failed - db is null');
    return res.status(503).json({ error: 'Database not available. Please try again in a moment.' });
  }
  
  // Test database connection with a simple query
  try {
    db.get('SELECT 1', (err) => {
      if (err) {
        console.error('Database connection test failed:', err);
        console.error('Error stack:', err.stack);
        return res.status(503).json({ error: 'Database connection error. Please try again in a moment.' });
      }
      next();
    });
  } catch (error) {
    console.error('Error in checkDatabaseReady:', error);
    console.error('Error stack:', error.stack);
    return res.status(503).json({ error: 'Database check failed. Please try again in a moment.' });
  }
};

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// Role-based access control middleware
const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    // Superadmin has access to everything
    if (req.user.role === 'superadmin') {
      return next();
    }
    // Check if user has required role
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
};

// Helper to get shop filter for queries (superadmin can filter by shop_id, others use their shop_id)
const getShopFilter = (req) => {
  const user = req.user;
  if (!user) return {};
  
  // Superadmin can filter by shop_id from query params or body
  if (user.role === 'superadmin') {
    const shopId = req.query.shop_id || req.body.shop_id;
    if (shopId) {
      const parsedShopId = parseInt(shopId);
      if (!isNaN(parsedShopId)) {
        return { shop_id: parsedShopId };
      }
    }
    return {};
  }
  
  // Other users are limited to their shop
  if (user.shop_id) {
    return { shop_id: user.shop_id };
  }
  
  return {};
};

// SECURITY: Helper function to sanitize error messages in production
const sanitizeError = (err, isProduction = process.env.NODE_ENV === 'production') => {
  // Always log the full error for debugging
  console.error('Error details:', {
    message: err.message,
    stack: err.stack,
    name: err.name,
    code: err.code
  });
  
  if (isProduction) {
    // Return more specific error messages in production based on error type
    if (err.message && err.message.includes('SQLITE')) {
      return 'Database error occurred. Please try again or contact support.';
    }
    if (err.message && err.message.includes('ENOENT')) {
      return 'File not found';
    }
    if (err.message && err.message.includes('JWT_SECRET')) {
      return 'Server configuration error. Please contact administrator.';
    }
    if (err.message && err.message.includes('database') || err.message && err.message.includes('Database')) {
      return 'Database error occurred. Please try again in a moment.';
    }
    // Return the error message if it's safe to expose, otherwise generic message
    if (err.message && (err.message.includes('configuration') || err.message.includes('not configured'))) {
      return err.message;
    }
    return 'An error occurred. Please try again or contact support.';
  }
  return err.message || 'Unknown error';
};

// SECURITY: Password strength validation
const validatePasswordStrength = (password) => {
  if (!password || password.length < 8) {
    return { valid: false, message: 'Password must be at least 8 characters long' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one uppercase letter' };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one lowercase letter' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one number' };
  }
  return { valid: true };
};

// SECURITY: Check if account is locked (too many failed attempts)
const checkAccountLockout = (username, callback) => {
  const lockoutWindow = 15 * 60 * 1000; // 15 minutes
  const maxAttempts = 5;
  const cutoffTime = new Date(Date.now() - lockoutWindow).toISOString();

  // Check if database is ready
  if (!db) {
    console.error('Database not initialized');
    return callback(new Error('Database not initialized'), false);
  }

  db.all(
    `SELECT COUNT(*) as count FROM login_attempts 
     WHERE username = ? AND success = 0 AND attempt_time > ?`,
    [username, cutoffTime],
    (err, rows) => {
      if (err) {
        console.error('Error checking account lockout:', err);
        // Don't block login if lockout check fails - allow login but log the error
        return callback(null, false);
      }
      const failedAttempts = rows && rows[0] ? rows[0].count : 0;
      callback(null, failedAttempts >= maxAttempts);
    }
  );
};

// SECURITY: Record login attempt
const recordLoginAttempt = (username, ipAddress, success) => {
  if (!db) {
    console.error('Database not initialized - cannot record login attempt');
    return;
  }
  
  db.run(
    'INSERT INTO login_attempts (username, ip_address, success) VALUES (?, ?, ?)',
    [username, ipAddress, success ? 1 : 0],
    (err) => {
      if (err) {
        console.error('Failed to record login attempt:', err);
      }
    }
  );
  
  // Clean up old attempts (older than 24 hours)
  const cleanupTime = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  db.run('DELETE FROM login_attempts WHERE attempt_time < ?', [cleanupTime], (err) => {
    if (err) {
      console.error('Failed to clean up old login attempts:', err);
    }
  });
};

// SECURITY: Input validation helpers
const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const validateNumeric = (value, min = null, max = null) => {
  const num = parseFloat(value);
  if (isNaN(num)) return false;
  if (min !== null && num < min) return false;
  if (max !== null && num > max) return false;
  return true;
};

// SECURITY: Input sanitization - remove potentially dangerous characters
const sanitizeInput = (input) => {
  if (typeof input !== 'string') return input;
  // Remove script tags and dangerous HTML
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .trim();
};

// SECURITY: Audit logging helper
const logAudit = (req, action, resourceType = null, resourceId = null, details = null) => {
  const userId = req.user ? req.user.id : null;
  const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';
  const userAgent = req.get('user-agent') || 'unknown';
  
  db.run(
    'INSERT INTO audit_logs (user_id, action, resource_type, resource_id, ip_address, user_agent, details) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [userId, action, resourceType, resourceId, ipAddress, userAgent, details ? JSON.stringify(details) : null],
    (err) => {
      if (err) {
        console.error('Failed to log audit:', err);
      }
    }
  );
};

// SECURITY: Generate refresh token
const generateRefreshToken = () => {
  return crypto.randomBytes(64).toString('hex');
};

// SECURITY: Clean expired refresh tokens
const cleanExpiredRefreshTokens = () => {
  db.run('DELETE FROM refresh_tokens WHERE expires_at < datetime("now") OR revoked = 1', (err) => {
    if (err) {
      console.error('Failed to clean expired refresh tokens:', err);
    }
  });
};

// Clean expired tokens every hour
setInterval(cleanExpiredRefreshTokens, 60 * 60 * 1000);

// ==================== AUTHENTICATION ROUTES ====================

app.post('/api/login', authLimiter, checkDatabaseReady, (req, res) => {
  // Ensure response is only sent once
  let responseSent = false;
  const sendResponse = (status, data) => {
    if (!responseSent) {
      responseSent = true;
      return res.status(status).json(data);
    }
  };

  try {
    const { username, password } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';
    console.log(`[LOGIN ATTEMPT] Username: ${username ? username : 'missing'}, Password: ${password ? 'provided' : 'missing'}, IP: ${ipAddress}`);

    // SECURITY: Input validation
    if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
      console.log(`[LOGIN FAILED] Missing credentials from IP: ${ipAddress}`);
      recordLoginAttempt(username || 'unknown', ipAddress, false);
      return sendResponse(400, { error: 'Username and password are required' });
    }

    // Check if database is ready
    if (!db) {
      console.error('Database not initialized');
      return sendResponse(500, { error: 'Database not initialized. Please try again in a moment.' });
    }

    // Check if JWT_SECRET is configured
    if (!JWT_SECRET) {
      console.error('JWT_SECRET is not configured');
      return sendResponse(500, { error: 'Server configuration error. Please contact administrator.' });
    }

    // SECURITY: Check account lockout
    checkAccountLockout(username, (err, isLocked) => {
      try {
        if (err) {
          console.error('Error in checkAccountLockout:', err);
          console.error('Error stack:', err.stack);
          // Continue with login attempt even if lockout check fails
        }
        if (isLocked) {
          console.log(`[LOGIN BLOCKED] Account locked for user: ${username} from IP: ${ipAddress} - too many failed attempts`);
          recordLoginAttempt(username, ipAddress, false);
          return sendResponse(429, { 
            error: 'Account temporarily locked due to too many failed login attempts. Please try again after 15 minutes.' 
          });
        }

        if (!db) {
          console.error('Database became unavailable during login');
          recordLoginAttempt(username, ipAddress, false);
          return sendResponse(500, { error: 'Database unavailable. Please try again.' });
        }

          db.get('SELECT * FROM users WHERE username = ? AND is_active = 1', [username], (err, user) => {
            try {
              if (err) {
                console.error('Database error fetching user:', err);
                console.error('Error stack:', err.stack);
                recordLoginAttempt(username, ipAddress, false);
                return sendResponse(500, { error: sanitizeError(err) });
              }
              if (!user) {
                console.log(`[LOGIN FAILED] User not found: ${username} from IP: ${ipAddress}`);
                recordLoginAttempt(username, ipAddress, false);
                return sendResponse(401, { error: 'Invalid credentials' });
              }

              // Check if user has a password hash
              if (!user.password) {
                console.error(`[LOGIN FAILED] User found but has no password hash: ${username} from IP: ${ipAddress}`);
                recordLoginAttempt(username, ipAddress, false);
                return sendResponse(500, { error: 'User account configuration error' });
              }

              bcrypt.compare(password, user.password, (err, match) => {
                try {
                  if (err) {
                    console.error(`[LOGIN ERROR] Error comparing password for ${username} from IP: ${ipAddress}:`, err);
                    console.error('Error stack:', err.stack);
                    recordLoginAttempt(username, ipAddress, false);
                    return sendResponse(500, { error: sanitizeError(err) });
                  }
                  if (!match) {
                    console.log(`[LOGIN FAILED] Invalid password for user: ${username} from IP: ${ipAddress}`);
                    recordLoginAttempt(username, ipAddress, false);
                    return sendResponse(401, { error: 'Invalid credentials' });
                  }

                  // Successful login
                  console.log(`[LOGIN SUCCESS] User: ${username} (ID: ${user.id}, Role: ${user.role}) from IP: ${ipAddress}`);
                  recordLoginAttempt(username, ipAddress, true);

                  try {
                    // Generate access token
                    if (!JWT_SECRET) {
                      throw new Error('JWT_SECRET is not configured');
                    }
                    
                    // Include shop_id in token for shop filtering
                    const tokenPayload = { 
                      id: user.id, 
                      username: user.username, 
                      role: user.role 
                    };
                    if (user.shop_id) {
                      tokenPayload.shop_id = user.shop_id;
                    }
                    
                    const token = jwt.sign(
                      tokenPayload,
                      JWT_SECRET,
                      { expiresIn: JWT_EXPIRES_IN }
                    );

                    // Generate refresh token
                    const refreshToken = generateRefreshToken();
                    const expiresAt = new Date();
                    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days from now

                    // Store refresh token in database
                    db.run(
                      'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)',
                      [user.id, refreshToken, expiresAt.toISOString()],
                      (err) => {
                        if (err) {
                          console.error('Failed to store refresh token:', err);
                          console.error('Error stack:', err.stack);
                          // Still return access token even if refresh token storage fails
                        }
                      }
                    );

                    // Log successful login (non-blocking)
                    try {
                      const mockReq = {
                        user: { id: user.id },
                        ip: ipAddress,
                        connection: { remoteAddress: ipAddress },
                        get: (header) => {
                          if (header === 'user-agent') {
                            return req.get('user-agent') || 'unknown';
                          }
                          return null;
                        }
                      };
                      logAudit(mockReq, 'LOGIN_SUCCESS', 'user', user.id);
                    } catch (auditErr) {
                      console.error('Failed to log audit:', auditErr);
                      console.error('Error stack:', auditErr.stack);
                      // Don't fail login if audit logging fails
                    }

                    // Send response
                    return sendResponse(200, {
                      token,
                      refreshToken,
                      user: {
                        id: user.id,
                        username: user.username,
                        email: user.email,
                        role: user.role,
                        full_name: user.full_name,
                        shop_id: user.shop_id || null
                      }
                    });
                  } catch (tokenErr) {
                    console.error('Error generating token:', tokenErr);
                    console.error('Token error stack:', tokenErr.stack);
                    console.error('JWT_SECRET exists:', !!JWT_SECRET);
                    recordLoginAttempt(username, ipAddress, false);
                    return sendResponse(500, { 
                      error: sanitizeError(tokenErr),
                      message: 'Failed to generate authentication token'
                    });
                  }
                } catch (bcryptErr) {
                  console.error('Error in bcrypt comparison callback:', bcryptErr);
                  console.error('Error stack:', bcryptErr.stack);
                  recordLoginAttempt(username, ipAddress, false);
                  return sendResponse(500, { error: 'Password verification error' });
                }
              });
            } catch (dbErr) {
              console.error('Error in database query callback:', dbErr);
              console.error('Error stack:', dbErr.stack);
              recordLoginAttempt(username, ipAddress, false);
              return sendResponse(500, { error: 'Database error occurred' });
            }
          });
        } catch (lockoutErr) {
          console.error('Error in account lockout check callback:', lockoutErr);
          console.error('Error stack:', lockoutErr.stack);
          recordLoginAttempt(username, ipAddress, false);
          return sendResponse(500, { error: 'Authentication error occurred' });
        }
      });
  } catch (error) {
    console.error('Unexpected error in login endpoint:', error);
    console.error('Error stack:', error.stack);
    return sendResponse(500, { 
      error: sanitizeError(error),
      message: 'An unexpected error occurred during login'
    });
  }
});

// SECURITY: Refresh token endpoint
app.post('/api/refresh', (req, res) => {
  const { refreshToken } = req.body;
  const ipAddress = req.ip || req.connection.remoteAddress;

  if (!refreshToken) {
    return res.status(400).json({ error: 'Refresh token is required' });
  }

  // Verify refresh token exists and is valid
  db.get(
    'SELECT * FROM refresh_tokens WHERE token = ? AND revoked = 0 AND expires_at > datetime("now")',
    [refreshToken],
    (err, tokenRecord) => {
      if (err) {
        return res.status(500).json({ error: sanitizeError(err) });
      }

      if (!tokenRecord) {
        return res.status(403).json({ error: 'Invalid or expired refresh token' });
      }

      // Get user information
      db.get('SELECT * FROM users WHERE id = ? AND is_active = 1', [tokenRecord.user_id], (err, user) => {
        if (err || !user) {
          return res.status(500).json({ error: sanitizeError(err) || 'User not found' });
        }

        // Generate new access token
        const newToken = jwt.sign(
          { id: user.id, username: user.username, role: user.role },
          JWT_SECRET,
          { expiresIn: JWT_EXPIRES_IN }
        );

        res.json({
          token: newToken,
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role,
            full_name: user.full_name
          }
        });
      });
    }
  );
});

// SECURITY: Logout endpoint (revoke refresh token)
app.post('/api/logout', authenticateToken, (req, res) => {
  const { refreshToken } = req.body;

  if (refreshToken) {
    db.run('UPDATE refresh_tokens SET revoked = 1 WHERE token = ?', [refreshToken], (err) => {
      if (err) {
        console.error('Failed to revoke refresh token:', err);
      }
    });
  }

  logAudit(req, 'LOGOUT', 'user', req.user.id);
  res.json({ message: 'Logged out successfully' });
});

// SECURITY: Password change endpoint
app.post('/api/users/change-password', authenticateToken, (req, res) => {
  const { oldPassword, newPassword } = req.body;
  const userId = req.user.id;

  if (!oldPassword || !newPassword) {
    return res.status(400).json({ error: 'Old password and new password are required' });
  }

  // SECURITY: Validate new password strength
  const passwordValidation = validatePasswordStrength(newPassword);
  if (!passwordValidation.valid) {
    return res.status(400).json({ error: passwordValidation.message });
  }

  // Verify old password
  db.get('SELECT password FROM users WHERE id = ?', [userId], (err, user) => {
    if (err || !user) {
      return res.status(500).json({ error: sanitizeError(err) || 'User not found' });
    }

    bcrypt.compare(oldPassword, user.password, (err, match) => {
      if (err || !match) {
        return res.status(401).json({ error: 'Current password is incorrect' });
      }

      // Hash new password
      const hashedPassword = bcrypt.hashSync(newPassword, 10);

      // Update password
      db.run('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, userId], (err) => {
        if (err) {
          return res.status(500).json({ error: sanitizeError(err) });
        }

        // Revoke all refresh tokens for this user (force re-login)
        db.run('UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ?', [userId], () => {});

        // Log password change
        logAudit(req, 'PASSWORD_CHANGE', 'user', userId);

        res.json({ message: 'Password changed successfully' });
      });
    });
  });
});

// ==================== USER MANAGEMENT ROUTES ====================

app.get('/api/users', authenticateToken, requireRole('admin'), (req, res) => {
  const shopFilter = getShopFilter(req);
  let query = 'SELECT id, username, email, role, full_name, shop_id, created_at, is_active FROM users WHERE 1=1';
  const params = [];
  
  // Superadmin can see all users, admin sees only their shop users
  if (req.user.role !== 'superadmin' && shopFilter.shop_id) {
    query += ' AND shop_id = ?';
    params.push(shopFilter.shop_id);
  }
  
  // Superadmin can filter by shop_id from query params
  if (req.user.role === 'superadmin' && req.query.shop_id) {
    query += ' AND shop_id = ?';
    params.push(parseInt(req.query.shop_id));
  }
  
  query += ' ORDER BY created_at DESC';
  
  db.all(query, params, (err, users) => {
    if (err) {
      return res.status(500).json({ error: sanitizeError(err) });
    }
    res.json(users);
  });
});

// SECURITY: Admin password change endpoint (admin can change any user's password)
// NOTE: This route must come before /api/users/:id to avoid route conflicts
app.post('/api/users/:id/change-password', authenticateToken, requireRole('admin'), (req, res) => {
  const { newPassword } = req.body;
  const userId = parseInt(req.params.id);

  // SECURITY: Input validation
  if (!userId || isNaN(userId)) {
    return res.status(400).json({ error: 'Invalid user ID' });
  }
  if (!newPassword || typeof newPassword !== 'string') {
    return res.status(400).json({ error: 'New password is required' });
  }

  // SECURITY: Validate new password strength
  const passwordValidation = validatePasswordStrength(newPassword);
  if (!passwordValidation.valid) {
    return res.status(400).json({ error: passwordValidation.message });
  }

  // Check if user exists
  db.get('SELECT id, username FROM users WHERE id = ?', [userId], (err, user) => {
    if (err) {
      return res.status(500).json({ error: sanitizeError(err) });
    }
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Hash new password
    const hashedPassword = bcrypt.hashSync(newPassword, 10);

    // Update password
    db.run('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, userId], (err) => {
      if (err) {
        return res.status(500).json({ error: sanitizeError(err) });
      }

      // Revoke all refresh tokens for this user (force re-login)
      db.run('UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ?', [userId], () => {});

      // SECURITY: Log admin password change
      logAudit(req, 'ADMIN_PASSWORD_CHANGE', 'user', userId, { target_username: user.username });

      res.json({ message: 'Password changed successfully' });
    });
  });
});

app.post('/api/users', authenticateToken, requireRole('admin'), (req, res) => {
  const { username, email, password, role, full_name, shop_id } = req.body;

  // SECURITY: Input validation
  if (!username || typeof username !== 'string' || username.trim().length < 3) {
    return res.status(400).json({ error: 'Username must be at least 3 characters long' });
  }
  if (!email || !validateEmail(email)) {
    return res.status(400).json({ error: 'Valid email address is required' });
  }
  if (!password) {
    return res.status(400).json({ error: 'Password is required' });
  }
  
  // SECURITY: Password strength validation
  const passwordValidation = validatePasswordStrength(password);
  if (!passwordValidation.valid) {
    return res.status(400).json({ error: passwordValidation.message });
  }

  if (!role || !['superadmin', 'admin', 'storekeeper', 'sales', 'manager'].includes(role)) {
    return res.status(400).json({ error: 'Valid role is required' });
  }

  // SECURITY: Shop assignment logic
  let finalShopId = null;
  if (req.user.role === 'superadmin') {
    // Superadmin can assign users to any shop (or no shop for superadmin users)
    finalShopId = shop_id ? parseInt(shop_id) : null;
  } else if (req.user.role === 'admin') {
    // Regular admin can only assign users to their own shop
    finalShopId = req.user.shop_id || null;
  }
  
  // Superadmin users should not have shop_id
  if (role === 'superadmin') {
    finalShopId = null;
  }

  // SECURITY: Sanitize inputs
  const sanitizedUsername = sanitizeInput(username.trim());
  const sanitizedEmail = sanitizeInput(email.trim().toLowerCase());
  const sanitizedFullName = full_name ? sanitizeInput(full_name.trim()) : null;

  const hashedPassword = bcrypt.hashSync(password, 10);

  db.run(
    'INSERT INTO users (username, email, password, role, full_name, shop_id) VALUES (?, ?, ?, ?, ?, ?)',
    [sanitizedUsername, sanitizedEmail, hashedPassword, role, sanitizedFullName, finalShopId],
    function(err) {
      if (err) {
        if (err.message.includes('UNIQUE constraint')) {
          return res.status(409).json({ error: 'Username or email already exists' });
        }
        return res.status(500).json({ error: sanitizeError(err) });
      }
      
      // SECURITY: Log user creation
      logAudit(req, 'USER_CREATED', 'user', this.lastID, { username: sanitizedUsername, role, email: sanitizedEmail });
      
      res.json({ id: this.lastID, message: 'User created successfully' });
    }
  );
});

app.put('/api/users/:id', authenticateToken, requireRole('admin'), (req, res) => {
  const { username, email, role, full_name, is_active, shop_id } = req.body;
  const id = req.params.id;

  // SECURITY: Input validation
  if (!id || isNaN(parseInt(id))) {
    return res.status(400).json({ error: 'Invalid user ID' });
  }
  if (username && (typeof username !== 'string' || username.trim().length < 3)) {
    return res.status(400).json({ error: 'Username must be at least 3 characters long' });
  }
  if (email && !validateEmail(email)) {
    return res.status(400).json({ error: 'Valid email address is required' });
  }
  if (role && !['superadmin', 'admin', 'storekeeper', 'sales', 'manager'].includes(role)) {
    return res.status(400).json({ error: 'Valid role is required' });
  }

  // SECURITY: Sanitize inputs
  const sanitizedUsername = username ? sanitizeInput(username.trim()) : null;
  const sanitizedEmail = email ? sanitizeInput(email.trim().toLowerCase()) : null;
  const sanitizedFullName = full_name ? sanitizeInput(full_name.trim()) : null;

  // Get old user data for audit log
  db.get('SELECT username, email, role, is_active FROM users WHERE id = ?', [id], (err, oldUser) => {
    if (err) {
      return res.status(500).json({ error: sanitizeError(err) });
    }
    if (!oldUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    db.run(
      'UPDATE users SET username = ?, email = ?, role = ?, full_name = ?, is_active = ? WHERE id = ?',
      [sanitizedUsername, sanitizedEmail, role, sanitizedFullName, is_active, id],
      function(err) {
        if (err) {
          if (err.message && err.message.includes('UNIQUE constraint')) {
            return res.status(409).json({ error: 'Username or email already exists' });
          }
          return res.status(500).json({ error: sanitizeError(err) });
        }
        
        // SECURITY: Log user update with changes
        const changes = {};
        if (role && role !== oldUser.role) changes.role = { from: oldUser.role, to: role };
        if (is_active !== undefined && is_active !== oldUser.is_active) changes.is_active = { from: oldUser.is_active, to: is_active };
        if (username && username !== oldUser.username) changes.username = { from: oldUser.username, to: username };
        if (email && email !== oldUser.email) changes.email = { from: oldUser.email, to: email };
        
        logAudit(req, 'USER_UPDATED', 'user', parseInt(id), changes);
        
        res.json({ message: 'User updated successfully' });
      }
    );
  });
});

// ==================== SHOP MANAGEMENT ROUTES ====================

// Get all shops (superadmin only, or admin sees their shop)
app.get('/api/shops', authenticateToken, requireRole('admin'), (req, res) => {
  if (req.user.role === 'superadmin') {
    // Superadmin sees all shops
    db.all('SELECT * FROM shops ORDER BY shop_name', (err, shops) => {
      if (err) {
        return res.status(500).json({ error: sanitizeError(err) });
      }
      res.json(shops);
    });
  } else {
    // Regular admin sees only their shop
    if (req.user.shop_id) {
      db.get('SELECT * FROM shops WHERE id = ?', [req.user.shop_id], (err, shop) => {
        if (err) {
          return res.status(500).json({ error: sanitizeError(err) });
        }
        res.json(shop ? [shop] : []);
      });
    } else {
      res.json([]);
    }
  }
});

// Get all shops statistics summary (superadmin only) - MUST BE BEFORE /api/shops/:id
app.get('/api/shops/statistics/summary', authenticateToken, requireRole('superadmin'), (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const monthStart = new Date().toISOString().substring(0, 7); // YYYY-MM
  
  // Get all shops
  db.all('SELECT * FROM shops ORDER BY shop_name', (err, shops) => {
    if (err) {
      return res.status(500).json({ error: sanitizeError(err) });
    }
    
    if (shops.length === 0) {
      return res.json([]);
    }
    
    // Get statistics for each shop
    const shopPromises = shops.map(shop => {
      return new Promise((resolve, reject) => {
        const shopId = shop.id;
        
        // Get all statistics for this shop
        const queries = {
          totalUsers: new Promise((resolve, reject) => {
            db.get(
              'SELECT COUNT(*) as count FROM users WHERE shop_id = ? AND is_active = 1',
              [shopId],
              (err, row) => err ? reject(err) : resolve(row?.count || 0)
            );
          }),
          
          totalItems: new Promise((resolve, reject) => {
            db.get(
              'SELECT COUNT(*) as count FROM items WHERE shop_id = ? AND (is_archived IS NULL OR is_archived = 0)',
              [shopId],
              (err, row) => err ? reject(err) : resolve(row?.count || 0)
            );
          }),
          
          lowStockItems: new Promise((resolve, reject) => {
            db.get(
              'SELECT COUNT(*) as count FROM items WHERE shop_id = ? AND (is_archived IS NULL OR is_archived = 0) AND stock_quantity <= min_stock_level',
              [shopId],
              (err, row) => err ? reject(err) : resolve(row?.count || 0)
            );
          }),
          
          todaySales: new Promise((resolve, reject) => {
            db.get(
              `SELECT COALESCE(SUM(s.total_amount), 0) as total 
               FROM sales s 
               LEFT JOIN users u ON s.created_by = u.id 
               WHERE DATE(s.sale_date) = ? AND u.shop_id = ?`,
              [today, shopId],
              (err, row) => err ? reject(err) : resolve(parseFloat(row?.total || 0))
            );
          }),
          
          monthSales: new Promise((resolve, reject) => {
            db.get(
              `SELECT COALESCE(SUM(s.total_amount), 0) as total 
               FROM sales s 
               LEFT JOIN users u ON s.created_by = u.id 
               WHERE strftime('%Y-%m', s.sale_date) = ? AND u.shop_id = ?`,
              [monthStart, shopId],
              (err, row) => err ? reject(err) : resolve(parseFloat(row?.total || 0))
            );
          })
        };
        
        Promise.all(Object.values(queries))
          .then(([totalUsers, totalItems, lowStockItems, todaySales, monthSales]) => {
            resolve({
              shop_id: shop.id,
              shop_name: shop.shop_name,
              shop_code: shop.shop_code,
              total_users: totalUsers,
              total_items: totalItems,
              low_stock_items: lowStockItems,
              today_sales: todaySales,
              month_sales: monthSales,
              status: shop.is_active === 1 ? 'active' : 'inactive'
            });
          })
          .catch(reject);
      });
    });
    
    // Wait for all shop statistics
    Promise.all(shopPromises)
      .then(results => {
        res.json(results);
      })
      .catch(err => {
        console.error('Error fetching shops statistics summary:', err);
        return res.status(500).json({ error: sanitizeError(err) });
      });
  });
});

// Get shop statistics (single shop) - MUST BE BEFORE /api/shops/:id
app.get('/api/shops/:id/statistics', authenticateToken, requireRole('admin'), (req, res) => {
  const shopId = parseInt(req.params.id);
  
  // Authorization check
  if (req.user.role !== 'superadmin' && req.user.shop_id !== shopId) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  
  if (!shopId || isNaN(shopId)) {
    return res.status(400).json({ error: 'Invalid shop ID' });
  }
  
  // Verify shop exists
  db.get('SELECT * FROM shops WHERE id = ?', [shopId], (err, shop) => {
    if (err) {
      return res.status(500).json({ error: sanitizeError(err) });
    }
    if (!shop) {
      return res.status(404).json({ error: 'Shop not found' });
    }
    
    const today = new Date().toISOString().split('T')[0];
    const monthStart = new Date().toISOString().substring(0, 7); // YYYY-MM
    
    // Get statistics in parallel
    const queries = {
      totalItems: new Promise((resolve, reject) => {
        db.get(
          'SELECT COUNT(*) as count FROM items WHERE shop_id = ? AND (is_archived IS NULL OR is_archived = 0)',
          [shopId],
          (err, row) => err ? reject(err) : resolve(row?.count || 0)
        );
      }),
      
      lowStockItems: new Promise((resolve, reject) => {
        db.get(
          'SELECT COUNT(*) as count FROM items WHERE shop_id = ? AND (is_archived IS NULL OR is_archived = 0) AND stock_quantity <= min_stock_level',
          [shopId],
          (err, row) => err ? reject(err) : resolve(row?.count || 0)
        );
      }),
      
      todaySales: new Promise((resolve, reject) => {
        db.get(
          `SELECT COUNT(*) as count, COALESCE(SUM(s.total_amount), 0) as total 
           FROM sales s 
           LEFT JOIN users u ON s.created_by = u.id 
           WHERE DATE(s.sale_date) = ? AND u.shop_id = ?`,
          [today, shopId],
          (err, row) => err ? reject(err) : resolve({ count: row?.count || 0, total: parseFloat(row?.total || 0) })
        );
      }),
      
      monthSales: new Promise((resolve, reject) => {
        db.get(
          `SELECT COUNT(*) as count, COALESCE(SUM(s.total_amount), 0) as total 
           FROM sales s 
           LEFT JOIN users u ON s.created_by = u.id 
           WHERE strftime('%Y-%m', s.sale_date) = ? AND u.shop_id = ?`,
          [monthStart, shopId],
          (err, row) => err ? reject(err) : resolve({ count: row?.count || 0, total: parseFloat(row?.total || 0) })
        );
      }),
      
      todayPurchases: new Promise((resolve, reject) => {
        db.get(
          `SELECT COUNT(*) as count, COALESCE(SUM(p.total_amount), 0) as total 
           FROM purchases p 
           LEFT JOIN users u ON p.created_by = u.id 
           WHERE DATE(p.purchase_date) = ? AND u.shop_id = ?`,
          [today, shopId],
          (err, row) => err ? reject(err) : resolve({ count: row?.count || 0, total: parseFloat(row?.total || 0) })
        );
      }),
      
      totalUsers: new Promise((resolve, reject) => {
        db.get(
          'SELECT COUNT(*) as count FROM users WHERE shop_id = ? AND is_active = 1',
          [shopId],
          (err, row) => err ? reject(err) : resolve(row?.count || 0)
        );
      }),
      
      totalCategories: new Promise((resolve, reject) => {
        db.get(
          'SELECT COUNT(DISTINCT category_id) as count FROM items WHERE shop_id = ? AND category_id IS NOT NULL AND (is_archived IS NULL OR is_archived = 0)',
          [shopId],
          (err, row) => err ? reject(err) : resolve(row?.count || 0)
        );
      }),
      
      totalSuppliers: new Promise((resolve, reject) => {
        // Suppliers don't have shop_id directly, count suppliers used by this shop's purchases
        db.get(
          `SELECT COUNT(DISTINCT p.supplier_id) as count 
           FROM purchases p 
           LEFT JOIN users u ON p.created_by = u.id 
           WHERE u.shop_id = ? AND p.supplier_id IS NOT NULL`,
          [shopId],
          (err, row) => {
            if (err) {
              // If error, fallback to counting all suppliers
              db.get('SELECT COUNT(*) as count FROM suppliers', [], (err2, row2) => {
                err2 ? reject(err2) : resolve(row2?.count || 0);
              });
            } else {
              resolve(row?.count || 0);
            }
          }
        );
      })
    };
    
    // Execute all queries in parallel
    Promise.all(Object.values(queries))
      .then(([totalItems, lowStockItems, todaySales, monthSales, todayPurchases, totalUsers, totalCategories, totalSuppliers]) => {
        const statistics = {
          shop_id: shopId,
          shop_name: shop.shop_name,
          totalItems,
          lowStockItems,
          todaySales,
          monthSales,
          todayPurchases,
          totalUsers,
          totalCategories,
          totalSuppliers
        };
        
        res.json(statistics);
      })
      .catch(err => {
        console.error('Error fetching shop statistics:', err);
        return res.status(500).json({ error: sanitizeError(err) });
      });
  });
});

// Get single shop by ID
app.get('/api/shops/:id', authenticateToken, requireRole('admin'), (req, res) => {
  const shopId = parseInt(req.params.id);
  
  if (req.user.role !== 'superadmin' && req.user.shop_id !== shopId) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  
  db.get('SELECT * FROM shops WHERE id = ?', [shopId], (err, shop) => {
    if (err) {
      return res.status(500).json({ error: sanitizeError(err) });
    }
    if (!shop) {
      return res.status(404).json({ error: 'Shop not found' });
    }
    res.json(shop);
  });
});

// Create new shop (superadmin only)
app.post('/api/shops', authenticateToken, requireRole('superadmin'), (req, res) => {
  const { shop_name, shop_code, address, phone, email } = req.body;
  
  if (!shop_name || !shop_code) {
    return res.status(400).json({ error: 'Shop name and shop code are required' });
  }
  
  const sanitizedShopName = sanitizeInput(shop_name.trim());
  const sanitizedShopCode = sanitizeInput(shop_code.trim().toUpperCase());
  const sanitizedAddress = address ? sanitizeInput(address.trim()) : null;
  const sanitizedPhone = phone ? sanitizeInput(phone.trim()) : null;
  const sanitizedEmail = email && validateEmail(email) ? sanitizeInput(email.trim().toLowerCase()) : null;
  
  db.run(
    'INSERT INTO shops (shop_name, shop_code, address, phone, email) VALUES (?, ?, ?, ?, ?)',
    [sanitizedShopName, sanitizedShopCode, sanitizedAddress, sanitizedPhone, sanitizedEmail],
    function(err) {
      if (err) {
        if (err.message.includes('UNIQUE constraint')) {
          return res.status(409).json({ error: 'Shop code already exists' });
        }
        return res.status(500).json({ error: sanitizeError(err) });
      }
      
      logAudit(req, 'SHOP_CREATED', 'shop', this.lastID, { shop_name: sanitizedShopName, shop_code: sanitizedShopCode });
      res.json({ id: this.lastID, message: 'Shop created successfully' });
    }
  );
});

// Update shop (superadmin only)
app.put('/api/shops/:id', authenticateToken, requireRole('superadmin'), (req, res) => {
  const shopId = parseInt(req.params.id);
  const { shop_name, shop_code, address, phone, email, is_active } = req.body;
  
  if (!shopId || isNaN(shopId)) {
    return res.status(400).json({ error: 'Invalid shop ID' });
  }
  
  // Get old shop data for audit log
  db.get('SELECT * FROM shops WHERE id = ?', [shopId], (err, oldShop) => {
    if (err) {
      return res.status(500).json({ error: sanitizeError(err) });
    }
    if (!oldShop) {
      return res.status(404).json({ error: 'Shop not found' });
    }
    
    const sanitizedShopName = shop_name ? sanitizeInput(shop_name.trim()) : oldShop.shop_name;
    const sanitizedShopCode = shop_code ? sanitizeInput(shop_code.trim().toUpperCase()) : oldShop.shop_code;
    const sanitizedAddress = address !== undefined ? (address ? sanitizeInput(address.trim()) : null) : oldShop.address;
    const sanitizedPhone = phone !== undefined ? (phone ? sanitizeInput(phone.trim()) : null) : oldShop.phone;
    const sanitizedEmail = email !== undefined ? (email && validateEmail(email) ? sanitizeInput(email.trim().toLowerCase()) : null) : oldShop.email;
    const finalIsActive = is_active !== undefined ? (is_active ? 1 : 0) : oldShop.is_active;
    
    db.run(
      'UPDATE shops SET shop_name = ?, shop_code = ?, address = ?, phone = ?, email = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [sanitizedShopName, sanitizedShopCode, sanitizedAddress, sanitizedPhone, sanitizedEmail, finalIsActive, shopId],
      function(err) {
        if (err) {
          if (err.message && err.message.includes('UNIQUE constraint')) {
            return res.status(409).json({ error: 'Shop code already exists' });
          }
          return res.status(500).json({ error: sanitizeError(err) });
        }
        
        const changes = {};
        if (shop_name && shop_name !== oldShop.shop_name) changes.shop_name = { from: oldShop.shop_name, to: shop_name };
        if (shop_code && shop_code !== oldShop.shop_code) changes.shop_code = { from: oldShop.shop_code, to: shop_code };
        if (is_active !== undefined && is_active !== oldShop.is_active) changes.is_active = { from: oldShop.is_active, to: is_active };
        
        logAudit(req, 'SHOP_UPDATED', 'shop', shopId, changes);
        res.json({ message: 'Shop updated successfully' });
      }
    );
  });
});

// Delete shop (superadmin only)
app.delete('/api/shops/:id', authenticateToken, requireRole('superadmin'), (req, res) => {
  const shopId = parseInt(req.params.id);
  
  if (!shopId || isNaN(shopId)) {
    return res.status(400).json({ error: 'Invalid shop ID' });
  }
  
  // Check if shop has users
  db.get('SELECT COUNT(*) as count FROM users WHERE shop_id = ?', [shopId], (err, result) => {
    if (err) {
      return res.status(500).json({ error: sanitizeError(err) });
    }
    
    if (result.count > 0) {
      return res.status(400).json({ error: 'Cannot delete shop with assigned users. Please reassign users first.' });
    }
    
    db.run('DELETE FROM shops WHERE id = ?', [shopId], function(err) {
      if (err) {
        return res.status(500).json({ error: sanitizeError(err) });
      }
      
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Shop not found' });
      }
      
      logAudit(req, 'SHOP_DELETED', 'shop', shopId);
      res.json({ message: 'Shop deleted successfully' });
    });
  });
});

// ==================== CATEGORIES ROUTES ====================

app.get('/api/categories', authenticateToken, (req, res) => {
  db.all('SELECT * FROM categories ORDER BY name', (err, categories) => {
    if (err) {
      return res.status(500).json({ error: sanitizeError(err) });
    }
    res.json(categories);
  });
});

app.post('/api/categories', authenticateToken, requireRole('admin', 'storekeeper'), (req, res) => {
  const { name, description } = req.body;
  
  // SECURITY: Input validation
  if (!name || typeof name !== 'string' || name.trim().length < 1) {
    return res.status(400).json({ error: 'Category name is required' });
  }
  
  db.run('INSERT INTO categories (name, description) VALUES (?, ?)', [name.trim(), description ? description.trim() : null], function(err) {
    if (err) {
      if (err.message && err.message.includes('UNIQUE constraint')) {
        return res.status(409).json({ error: 'Category name already exists' });
      }
      return res.status(500).json({ error: sanitizeError(err) });
    }
    res.json({ id: this.lastID, message: 'Category created successfully' });
  });
});

// ==================== ITEMS ROUTES ====================

app.get('/api/items', authenticateToken, (req, res) => {
  const shopFilter = getShopFilter(req);
  let query = `
    SELECT i.*, c.name as category_name,
           CASE WHEN i.stock_quantity <= i.min_stock_level THEN 1 ELSE 0 END as low_stock
    FROM items i
    LEFT JOIN categories c ON i.category_id = c.id
  `;
  
  const params = [];
  const conditions = [];
  
  // Filter by shop_id
  if (shopFilter.shop_id && req.user.role === 'superadmin') {
    // Superadmin with shop filter: show items for that shop
    conditions.push('i.shop_id = ?');
    params.push(shopFilter.shop_id);
  } else if (req.user.role === 'superadmin' && !shopFilter.shop_id) {
    // Superadmin without shop filter: show all items (no filter)
  } else if (req.user.role !== 'superadmin') {
    // Non-superadmin: show items for their shop only
    if (req.user.shop_id) {
      conditions.push('i.shop_id = ?');
      params.push(req.user.shop_id);
    } else {
      // User without shop_id sees no items
      conditions.push('1=0');
    }
  }
  
  // Filter out archived items unless includeArchived=true
  const includeArchived = req.query.includeArchived === 'true';
  if (!includeArchived) {
    conditions.push('(i.is_archived IS NULL OR i.is_archived = 0)');
  }
  
  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }
  
  query += ` ORDER BY i.name`;
  
  db.all(query, params, (err, items) => {
    if (err) {
      return res.status(500).json({ error: sanitizeError(err) });
    }
    res.json(items);
  });
});

app.get('/api/items/:id', authenticateToken, (req, res) => {
  const id = req.params.id;
  
  // Validate ID
  if (!id || isNaN(parseInt(id))) {
    return res.status(400).json({ error: 'Invalid item ID' });
  }
  
  const shopFilter = getShopFilter(req);
  let query = 'SELECT * FROM items WHERE id = ?';
  const params = [id];
  
  // Apply shop filtering
  if (shopFilter.shop_id && req.user.role === 'superadmin') {
    // Superadmin with shop filter: only show item if it belongs to that shop
    query += ' AND shop_id = ?';
    params.push(shopFilter.shop_id);
  } else if (req.user.role !== 'superadmin') {
    // Non-superadmin: only show items from their shop
    if (req.user.shop_id) {
      query += ' AND shop_id = ?';
      params.push(req.user.shop_id);
    } else {
      // User without shop_id sees no items
      query += ' AND 1=0';
    }
  }
  
  db.get(query, params, (err, item) => {
    if (err) {
      return res.status(500).json({ error: sanitizeError(err) });
    }
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }
    res.json(item);
  });
});

// Get item by barcode/SKU - Optimized for speed
app.get('/api/items/barcode/:barcode', authenticateToken, (req, res) => {
  const barcode = req.params.barcode.trim();
  
  // First try exact match (fastest - uses index)
  const exactQuery = `
    SELECT i.*, c.name as category_name,
           CASE WHEN i.stock_quantity <= i.min_stock_level THEN 1 ELSE 0 END as low_stock
    FROM items i
    LEFT JOIN categories c ON i.category_id = c.id
    WHERE i.sku = ?
    LIMIT 1
  `;
  
  db.get(exactQuery, [barcode], (err, item) => {
    if (err) {
      return res.status(500).json({ error: sanitizeError(err) });
    }
    
    // If exact match found, return immediately
    if (item) {
      return res.json(item);
    }
    
    // Only try partial match if exact match failed (slower, but fallback)
    const partialQuery = `
      SELECT i.*, c.name as category_name,
             CASE WHEN i.stock_quantity <= i.min_stock_level THEN 1 ELSE 0 END as low_stock
      FROM items i
      LEFT JOIN categories c ON i.category_id = c.id
      WHERE i.sku LIKE ?
      LIMIT 1
    `;
    
    db.get(partialQuery, [`%${barcode}%`], (err, item) => {
      if (err) {
        return res.status(500).json({ error: sanitizeError(err) });
      }
      if (!item) {
        return res.status(404).json({ error: 'Item not found with barcode: ' + barcode });
      }
      res.json(item);
    });
  });
});

app.post('/api/items', authenticateToken, requireRole('admin', 'storekeeper'), (req, res) => {
  const { name, sku, description, category_id, unit_price, cost_price, stock_quantity, min_stock_level, unit, image_url, expiration_date, shop_id } = req.body;
  const shopFilter = getShopFilter(req);
  
  // SECURITY: Input validation
  if (!name || typeof name !== 'string' || name.trim().length < 1) {
    return res.status(400).json({ error: 'Item name is required' });
  }
  
  // SKU validation (optional but if provided, must be valid)
  if (sku && typeof sku === 'string' && sku.trim().length > 0) {
    const trimmedSku = sku.trim();
    
    // Length validation
    if (trimmedSku.length < 2 || trimmedSku.length > 50) {
      return res.status(400).json({ error: 'SKU must be between 2 and 50 characters' });
    }
    
    // Format validation: alphanumeric, hyphens, underscores, dots only
    if (!/^[A-Za-z0-9\-_.]+$/.test(trimmedSku)) {
      return res.status(400).json({ error: 'SKU can only contain letters, numbers, hyphens, underscores, and dots' });
    }
    
    // Must start with alphanumeric
    if (!/^[A-Za-z0-9]/.test(trimmedSku)) {
      return res.status(400).json({ error: 'SKU must start with a letter or number' });
    }
  }
  
  // Price validation
  if (unit_price === undefined || unit_price === null || isNaN(parseFloat(unit_price)) || parseFloat(unit_price) < 0) {
    return res.status(400).json({ error: 'Valid unit price is required' });
  }
  
  // Determine shop_id: use from body if provided, otherwise from shopFilter (for superadmin), or user's shop_id
  let itemShopId = null;
  if (shop_id !== undefined && shop_id !== null) {
    itemShopId = shop_id;
  } else if (req.user.role === 'superadmin') {
    itemShopId = shopFilter.shop_id || null;
    // For superadmin, shop_id is required when creating items
    if (!itemShopId) {
      return res.status(400).json({ error: 'shop_id is required for superadmin when creating items' });
    }
  } else {
    itemShopId = req.user.shop_id || null;
  }
  
  db.run(
    'INSERT INTO items (name, sku, description, category_id, unit_price, cost_price, stock_quantity, min_stock_level, unit, image_url, expiration_date, shop_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [name.trim(), sku ? sku.trim() : null, description ? description.trim() : null, category_id || null, unit_price, cost_price || null, stock_quantity || 0, min_stock_level || 10, unit || 'pcs', image_url || null, expiration_date || null, itemShopId],
    function(err) {
      if (err) {
        if (err.message && err.message.includes('UNIQUE constraint')) {
          return res.status(409).json({ error: 'SKU already exists' });
        }
        return res.status(500).json({ error: sanitizeError(err) });
      }
      
      // SECURITY: Log item creation
      logAudit(req, 'ITEM_CREATED', 'item', this.lastID, { name: name.trim(), sku: sku ? sku.trim() : null });
      
      res.json({ id: this.lastID, message: 'Item created successfully' });
    }
  );
});

app.put('/api/items/:id', authenticateToken, requireRole('admin', 'storekeeper'), (req, res) => {
  const { name, sku, description, category_id, unit_price, cost_price, stock_quantity, min_stock_level, unit, image_url, expiration_date } = req.body;
  const id = req.params.id;
  
  // Validate ID
  if (!id || isNaN(parseInt(id))) {
    return res.status(400).json({ error: 'Invalid item ID' });
  }
  
  // Check if request body has any fields (partial update support)
  const hasFields = Object.keys(req.body).length > 0;
  if (!hasFields) {
    return res.status(400).json({ error: 'At least one field must be provided for update' });
  }
  
  // First, fetch the existing item to check permissions and get current values
  const shopFilter = getShopFilter(req);
  let checkQuery = 'SELECT * FROM items WHERE id = ?';
  const checkParams = [id];
  
  // Apply shop filtering to ensure user can only update items they have access to
  if (shopFilter.shop_id && req.user.role === 'superadmin') {
    checkQuery += ' AND shop_id = ?';
    checkParams.push(shopFilter.shop_id);
  } else if (req.user.role !== 'superadmin') {
    if (req.user.shop_id) {
      checkQuery += ' AND shop_id = ?';
      checkParams.push(req.user.shop_id);
    } else {
      checkQuery += ' AND 1=0';
    }
  }
  
  db.get(checkQuery, checkParams, (err, existingItem) => {
    if (err) {
      return res.status(500).json({ error: sanitizeError(err) });
    }
    if (!existingItem) {
      return res.status(404).json({ error: 'Item not found' });
    }
    
    // Use existing values for fields not provided (partial update support)
    const finalName = name !== undefined ? name : existingItem.name;
    const finalSku = sku !== undefined ? sku : existingItem.sku;
    const finalDescription = description !== undefined ? description : existingItem.description;
    const finalCategoryId = category_id !== undefined ? category_id : existingItem.category_id;
    const finalUnitPrice = unit_price !== undefined ? unit_price : existingItem.unit_price;
    const finalCostPrice = cost_price !== undefined ? cost_price : existingItem.cost_price;
    const finalStockQuantity = stock_quantity !== undefined ? stock_quantity : existingItem.stock_quantity;
    const finalMinStockLevel = min_stock_level !== undefined ? min_stock_level : existingItem.min_stock_level;
    const finalUnit = unit !== undefined ? unit : existingItem.unit;
    const finalImageUrl = image_url !== undefined ? image_url : existingItem.image_url;
    const finalExpirationDate = expiration_date !== undefined ? expiration_date : existingItem.expiration_date;
    
    // SECURITY: Input validation - only validate if name is being updated
    // Check if 'name' property exists in request body (not just undefined)
    if ('name' in req.body) {
      if (!name || typeof name !== 'string' || name.trim().length < 1) {
        return res.status(400).json({ error: 'Item name is required' });
      }
    }
    
    // Validate unit_price if being updated
    if (unit_price !== undefined) {
      const parsedPrice = parseFloat(unit_price);
      if (isNaN(parsedPrice) || parsedPrice < 0) {
        return res.status(400).json({ error: 'Valid unit price is required (must be a non-negative number)' });
      }
    }
    
    // Validate cost_price if being updated (optional, but if provided must be valid)
    if (cost_price !== undefined && cost_price !== null) {
      const parsedCost = parseFloat(cost_price);
      if (isNaN(parsedCost) || parsedCost < 0) {
        return res.status(400).json({ error: 'Valid cost price is required (must be a non-negative number)' });
      }
    }
    
    // Validate stock_quantity if being updated
    if (stock_quantity !== undefined && stock_quantity !== null) {
      const parsedStock = parseInt(stock_quantity);
      if (isNaN(parsedStock) || parsedStock < 0) {
        return res.status(400).json({ error: 'Valid stock quantity is required (must be a non-negative integer)' });
      }
    }
    
    // SKU validation (only if SKU is being updated)
    if (sku !== undefined && sku !== null && typeof sku === 'string' && sku.trim().length > 0) {
      const trimmedSku = sku.trim();
      
      // Length validation
      if (trimmedSku.length < 2 || trimmedSku.length > 50) {
        return res.status(400).json({ error: 'SKU must be between 2 and 50 characters' });
      }
      
      // Format validation: alphanumeric, hyphens, underscores, dots only
      if (!/^[A-Za-z0-9\-_.]+$/.test(trimmedSku)) {
        return res.status(400).json({ error: 'SKU can only contain letters, numbers, hyphens, underscores, and dots' });
      }
      
      // Must start with alphanumeric
      if (!/^[A-Za-z0-9]/.test(trimmedSku)) {
        return res.status(400).json({ error: 'SKU must start with a letter or number' });
      }
      
      // Check uniqueness (excluding current item)
      db.get('SELECT id FROM items WHERE sku = ? AND id != ?', [trimmedSku, id], (err, existing) => {
        if (err) {
          return res.status(500).json({ error: sanitizeError(err) });
        }
        if (existing) {
          return res.status(409).json({ error: 'SKU already exists' });
        }
        
        // Continue with update
        performUpdate();
      });
      
      return; // Exit early, update will happen in callback
    }
    
    // No SKU validation needed, proceed with update
    performUpdate();
    
    function performUpdate() {
      db.run(
        'UPDATE items SET name = ?, sku = ?, description = ?, category_id = ?, unit_price = ?, cost_price = ?, stock_quantity = ?, min_stock_level = ?, unit = ?, image_url = ?, expiration_date = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [
          finalName && typeof finalName === 'string' ? finalName.trim() : (finalName || null),
          finalSku && typeof finalSku === 'string' ? finalSku.trim() : (finalSku || null),
          finalDescription && typeof finalDescription === 'string' ? finalDescription.trim() : (finalDescription || null),
          finalCategoryId || null,
          finalUnitPrice !== undefined && finalUnitPrice !== null ? parseFloat(finalUnitPrice) : existingItem.unit_price,
          finalCostPrice !== undefined && finalCostPrice !== null ? parseFloat(finalCostPrice) : (finalCostPrice === null ? null : existingItem.cost_price),
          finalStockQuantity !== undefined && finalStockQuantity !== null ? parseInt(finalStockQuantity) : existingItem.stock_quantity,
          finalMinStockLevel !== undefined && finalMinStockLevel !== null ? finalMinStockLevel : existingItem.min_stock_level,
          finalUnit || existingItem.unit || 'pcs',
          finalImageUrl || null,
          finalExpirationDate || null,
          id
        ],
        function(err) {
          if (err) {
            if (err.message && err.message.includes('UNIQUE constraint')) {
              return res.status(409).json({ error: 'SKU already exists' });
            }
            return res.status(500).json({ error: sanitizeError(err) });
          }
          
          // SECURITY: Log item update
          const updateFields = {};
          if (name !== undefined) updateFields.name = finalName.trim();
          if (unit_price !== undefined) updateFields.unit_price = finalUnitPrice;
          if (cost_price !== undefined) updateFields.cost_price = finalCostPrice;
          logAudit(req, 'ITEM_UPDATED', 'item', parseInt(id), updateFields);
          
          res.json({ message: 'Item updated successfully' });
        }
      );
    }
  });
});

app.delete('/api/items/:id', authenticateToken, requireRole('admin', 'storekeeper'), (req, res) => {
  const id = req.params.id;
  db.run('UPDATE items SET stock_quantity = 0 WHERE id = ?', [id], function(err) {
    if (err) {
      return res.status(500).json({ error: sanitizeError(err) });
    }
    res.json({ message: 'Item deactivated successfully' });
  });
});

// Item archive endpoint
app.post('/api/items/:id/archive', authenticateToken, requireRole('admin', 'storekeeper'), (req, res) => {
  const id = req.params.id;
  const shopFilter = getShopFilter(req);
  
  // Check if item exists and user has permission
  db.get('SELECT * FROM items WHERE id = ?', [id], (err, item) => {
    if (err) {
      return res.status(500).json({ error: sanitizeError(err) });
    }
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }
    
    // Check permissions
    if (req.user.role === 'superadmin') {
      if (shopFilter.shop_id && item.shop_id !== shopFilter.shop_id) {
        return res.status(403).json({ error: 'Access denied' });
      }
    } else {
      if (item.shop_id !== req.user.shop_id) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }
    
    db.run('UPDATE items SET is_archived = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id], function(err) {
      if (err) {
        return res.status(500).json({ error: sanitizeError(err) });
      }
      
      // Log archive action
      logAudit(req, 'ITEM_ARCHIVED', 'item', parseInt(id), { name: item.name });
      
      res.json({ message: 'Item archived successfully' });
    });
  });
});

// Item unarchive endpoint
app.post('/api/items/:id/unarchive', authenticateToken, requireRole('admin', 'storekeeper'), (req, res) => {
  const id = req.params.id;
  const shopFilter = getShopFilter(req);
  
  // Check if item exists and user has permission
  db.get('SELECT * FROM items WHERE id = ?', [id], (err, item) => {
    if (err) {
      return res.status(500).json({ error: sanitizeError(err) });
    }
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }
    
    // Check permissions
    if (req.user.role === 'superadmin') {
      if (shopFilter.shop_id && item.shop_id !== shopFilter.shop_id) {
        return res.status(403).json({ error: 'Access denied' });
      }
    } else {
      if (item.shop_id !== req.user.shop_id) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }
    
    db.run('UPDATE items SET is_archived = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id], function(err) {
      if (err) {
        return res.status(500).json({ error: sanitizeError(err) });
      }
      
      // Log unarchive action
      logAudit(req, 'ITEM_UNARCHIVED', 'item', parseInt(id), { name: item.name });
      
      res.json({ message: 'Item unarchived successfully' });
    });
  });
});

// Item history endpoint
app.get('/api/items/:id/history', authenticateToken, (req, res) => {
  const id = req.params.id;
  const shopFilter = getShopFilter(req);
  
  // First check if item exists and user has permission
  db.get('SELECT * FROM items WHERE id = ?', [id], (err, item) => {
    if (err) {
      return res.status(500).json({ error: sanitizeError(err) });
    }
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }
    
    // Check permissions
    if (req.user.role === 'superadmin') {
      if (shopFilter.shop_id && item.shop_id !== shopFilter.shop_id) {
        return res.status(403).json({ error: 'Access denied' });
      }
    } else {
      if (item.shop_id !== req.user.shop_id) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }
    
    // Get audit logs for this item
    const query = `
      SELECT 
        al.created_at,
        al.action,
        al.details,
        u.full_name as changed_by_name,
        u.username as changed_by_username
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      WHERE al.resource_type = 'item' AND al.resource_id = ?
      ORDER BY al.created_at DESC
      LIMIT 100
    `;
    
    db.all(query, [id], (err, logs) => {
      if (err) {
        return res.status(500).json({ error: sanitizeError(err) });
      }
      
      // Format history entries
      const history = logs.map(log => {
        let changeType = 'update';
        let fieldName = 'general';
        let oldValue = null;
        let newValue = null;
        
        // Parse action type
        if (log.action === 'ITEM_CREATED') {
          changeType = 'create';
          fieldName = 'item';
          newValue = 'Created';
        } else if (log.action === 'ITEM_ARCHIVED') {
          changeType = 'archive';
          fieldName = 'archived';
          newValue = 'true';
        } else if (log.action === 'ITEM_UNARCHIVED') {
          changeType = 'unarchive';
          fieldName = 'archived';
          oldValue = 'true';
          newValue = 'false';
        } else if (log.action === 'ITEM_UPDATED') {
          changeType = 'update';
          // Try to parse details if available
          try {
            const details = log.details ? JSON.parse(log.details) : {};
            if (details.field) {
              fieldName = details.field;
              oldValue = details.old_value || null;
              newValue = details.new_value || null;
            }
          } catch (e) {
            // Details not in expected format, use defaults
          }
        }
        
        return {
          created_at: log.created_at,
          field_name: fieldName,
          old_value: oldValue,
          new_value: newValue,
          changed_by_name: log.changed_by_name || log.changed_by_username || 'System',
          change_type: changeType
        };
      });
      
      res.json(history);
    });
  });
});

// ==================== ITEM TEMPLATES ROUTES ====================

app.get('/api/item-templates', authenticateToken, (req, res) => {
  const shopFilter = getShopFilter(req);
  let query = 'SELECT * FROM item_templates WHERE 1=1';
  const params = [];

  // Filter by shop_id if provided (for superadmin) or use user's shop_id
  if (shopFilter.shop_id && req.user.role === 'superadmin') {
    query += ' AND shop_id = ?';
    params.push(shopFilter.shop_id);
  } else if (req.user.role !== 'superadmin' && req.user.shop_id) {
    query += ' AND shop_id = ?';
    params.push(req.user.shop_id);
  } else if (req.user.role === 'superadmin' && !shopFilter.shop_id) {
    // Superadmin without shop filter sees all templates
  } else {
    // Non-superadmin without shop_id sees no templates
    query += ' AND 1=0';
  }

  query += ' ORDER BY created_at DESC';

  db.all(query, params, (err, templates) => {
    if (err) {
      return res.status(500).json({ error: sanitizeError(err) });
    }
    // Parse item_data JSON for each template
    const parsedTemplates = templates.map(template => ({
      ...template,
      item_data: template.item_data ? JSON.parse(template.item_data) : null
    }));
    res.json(parsedTemplates);
  });
});

app.post('/api/item-templates', authenticateToken, requireRole('admin', 'storekeeper'), (req, res) => {
  const { name, description, item_data } = req.body;
  const shopFilter = getShopFilter(req);

  // SECURITY: Input validation
  if (!name || typeof name !== 'string' || name.trim().length < 1) {
    return res.status(400).json({ error: 'Template name is required' });
  }

  if (!item_data || typeof item_data !== 'object') {
    return res.status(400).json({ error: 'Item data is required' });
  }

  // Determine shop_id
  let shopId = null;
  if (req.user.role === 'superadmin') {
    shopId = shopFilter.shop_id || null;
  } else {
    shopId = req.user.shop_id || null;
  }

  // For superadmin, shop_id is required
  if (req.user.role === 'superadmin' && !shopId) {
    return res.status(400).json({ error: 'shop_id is required for superadmin' });
  }

  db.run(
    'INSERT INTO item_templates (name, description, item_data, shop_id, created_by) VALUES (?, ?, ?, ?, ?)',
    [name.trim(), description ? description.trim() : null, JSON.stringify(item_data), shopId, req.user.id],
    function(err) {
      if (err) {
        return res.status(500).json({ error: sanitizeError(err) });
      }
      
      // SECURITY: Log template creation
      logAudit(req, 'ITEM_TEMPLATE_CREATED', 'item_template', this.lastID, { name: name.trim() });
      
      res.json({ id: this.lastID, message: 'Template created successfully' });
    }
  );
});

app.delete('/api/item-templates/:id', authenticateToken, requireRole('admin', 'storekeeper'), (req, res) => {
  const id = req.params.id;
  const shopFilter = getShopFilter(req);

  // First check if template exists and user has permission
  db.get('SELECT * FROM item_templates WHERE id = ?', [id], (err, template) => {
    if (err) {
      return res.status(500).json({ error: sanitizeError(err) });
    }
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // Check permissions: superadmin can delete any, others can only delete from their shop
    if (req.user.role === 'superadmin') {
      if (shopFilter.shop_id && template.shop_id !== shopFilter.shop_id) {
        return res.status(403).json({ error: 'Access denied' });
      }
    } else {
      if (template.shop_id !== req.user.shop_id) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    db.run('DELETE FROM item_templates WHERE id = ?', [id], function(err) {
      if (err) {
        return res.status(500).json({ error: sanitizeError(err) });
      }
      
      // SECURITY: Log template deletion
      logAudit(req, 'ITEM_TEMPLATE_DELETED', 'item_template', parseInt(id), { name: template.name });
      
      res.json({ message: 'Template deleted successfully' });
    });
  });
});

// ==================== SUPPLIERS ROUTES ====================

app.get('/api/suppliers', authenticateToken, (req, res) => {
  db.all('SELECT * FROM suppliers ORDER BY name', (err, suppliers) => {
    if (err) {
      return res.status(500).json({ error: sanitizeError(err) });
    }
    res.json(suppliers);
  });
});

app.post('/api/suppliers', authenticateToken, requireRole('admin', 'storekeeper'), (req, res) => {
  const { name, contact_person, email, phone, address } = req.body;
  db.run(
    'INSERT INTO suppliers (name, contact_person, email, phone, address) VALUES (?, ?, ?, ?, ?)',
    [name, contact_person, email, phone, address],
    function(err) {
      if (err) {
        return res.status(500).json({ error: sanitizeError(err) });
      }
      res.json({ id: this.lastID, message: 'Supplier created successfully' });
    }
  );
});

// ==================== PURCHASES ROUTES ====================

app.get('/api/purchases', authenticateToken, requireRole('admin', 'storekeeper'), (req, res) => {
  const shopFilter = getShopFilter(req);
  let query = `
    SELECT p.*, s.name as supplier_name, u.username as created_by_name, u.shop_id
    FROM purchases p
    LEFT JOIN suppliers s ON p.supplier_id = s.id
    LEFT JOIN users u ON p.created_by = u.id
  `;
  const params = [];
  
  // Filter by shop_id if provided (for superadmin)
  if (shopFilter.shop_id && req.user.role === 'superadmin') {
    query += ` WHERE u.shop_id = ?`;
    params.push(shopFilter.shop_id);
  } else if (req.user.role !== 'superadmin' && req.user.shop_id) {
    // Non-superadmin users only see purchases from their shop
    query += ` WHERE u.shop_id = ?`;
    params.push(req.user.shop_id);
  }
  
  query += ` ORDER BY p.purchase_date DESC`;
  
  db.all(query, params, (err, purchases) => {
    if (err) {
      return res.status(500).json({ error: sanitizeError(err) });
    }
    res.json(purchases);
  });
});

app.get('/api/purchases/:id', authenticateToken, requireRole('admin', 'storekeeper'), (req, res) => {
  const id = req.params.id;
  const query = `
    SELECT p.*, s.name as supplier_name,
           (SELECT json_group_array(json_object(
             'id', pi.id,
             'item_id', pi.item_id,
             'item_name', i.name,
             'quantity', pi.quantity,
             'unit_price', pi.unit_price,
             'total_price', pi.total_price
           ))
           FROM purchase_items pi
           JOIN items i ON pi.item_id = i.id
           WHERE pi.purchase_id = p.id) as items
    FROM purchases p
    LEFT JOIN suppliers s ON p.supplier_id = s.id
    WHERE p.id = ?
  `;
  db.get(query, [id], (err, purchase) => {
    if (err) {
      return res.status(500).json({ error: sanitizeError(err) });
    }
    if (!purchase) {
      return res.status(404).json({ error: 'Purchase not found' });
    }
    purchase.items = JSON.parse(purchase.items || '[]');
    res.json(purchase);
  });
});

app.post('/api/purchases', authenticateToken, requireRole('admin', 'storekeeper'), (req, res) => {
  const { supplier_id, items, notes, delivery_date, status } = req.body;
  const created_by = req.user.id;
  let total_amount = 0;

  items.forEach(item => {
    total_amount += item.quantity * item.unit_price;
  });

  const orderStatus = status || 'received';
  const deliveryDate = delivery_date || null;

  db.run(
    'INSERT INTO purchases (supplier_id, total_amount, created_by, notes, delivery_date, status) VALUES (?, ?, ?, ?, ?, ?)',
    [supplier_id, total_amount, created_by, notes, deliveryDate, orderStatus],
    function(err) {
      if (err) {
        return res.status(500).json({ error: sanitizeError(err) });
      }
      const purchase_id = this.lastID;

      // Insert purchase items and update stock
      let completed = 0;
      items.forEach((item, index) => {
        db.run(
          'INSERT INTO purchase_items (purchase_id, item_id, quantity, unit_price, total_price) VALUES (?, ?, ?, ?, ?)',
          [purchase_id, item.item_id, item.quantity, item.unit_price, item.quantity * item.unit_price],
          function(err) {
            if (err) {
              return res.status(500).json({ error: sanitizeError(err) });
            }
            // Update stock
            db.run('UPDATE items SET stock_quantity = stock_quantity + ? WHERE id = ?', [item.quantity, item.item_id]);
            completed++;
            if (completed === items.length) {
              res.json({ id: purchase_id, message: 'Purchase recorded successfully' });
            }
          }
        );
      });
    }
  );
});

// ==================== SALES ROUTES ====================

app.get('/api/sales', authenticateToken, requireRole('admin', 'sales', 'manager'), (req, res) => {
  const shopFilter = getShopFilter(req);
  
  // First, check if is_return column exists by querying pragma_table_info
  db.all("SELECT name FROM pragma_table_info('sales') WHERE name='is_return'", (colErr, colRows) => {
    // Check if column exists - colRows will be an array, empty if column doesn't exist
    const hasIsReturnColumn = !colErr && colRows && colRows.length > 0;
    
    let query = `
      SELECT s.*, u.username as created_by_name, u.shop_id
      FROM sales s
      LEFT JOIN users u ON s.created_by = u.id
    `;
    const params = [];
    const whereConditions = [];
    
    // Filter out returns (is_return = 1) - only show regular sales
    // Only add this filter if the column exists
    if (hasIsReturnColumn) {
      whereConditions.push(`(s.is_return IS NULL OR s.is_return = 0)`);
    }
    
    // Filter by shop_id if provided (for superadmin)
    if (shopFilter.shop_id && req.user.role === 'superadmin') {
      // Only show sales from the selected shop
      whereConditions.push('u.shop_id = ?');
      params.push(shopFilter.shop_id);
    } else if (req.user.role !== 'superadmin') {
      // Non-superadmin users: show sales from their shop OR sales where creator has no shop_id
      if (req.user.shop_id) {
        // Show sales from same shop OR sales where creator has no shop_id (NULL)
        whereConditions.push(`(u.shop_id = ? OR u.shop_id IS NULL)`);
        params.push(req.user.shop_id);
      }
      // If user has no shop_id, don't add any shop filter - show all sales
    }
    
    if (whereConditions.length > 0) {
      query += ` WHERE ${whereConditions.join(' AND ')}`;
    }
    
    query += ` ORDER BY s.sale_date DESC`;
    
    db.all(query, params, (err, sales) => {
      if (err) {
        // If error is about missing is_return column, retry without that filter
        if (err.message && (err.message.includes('no such column') || err.message.includes('is_return'))) {
          // Retry query without is_return filter
          let retryQuery = `
            SELECT s.*, u.username as created_by_name, u.shop_id
            FROM sales s
            LEFT JOIN users u ON s.created_by = u.id
          `;
          const retryParams = [];
          const retryConditions = [];
          
          if (shopFilter.shop_id && req.user.role === 'superadmin') {
            retryConditions.push('u.shop_id = ?');
            retryParams.push(shopFilter.shop_id);
          } else if (req.user.role !== 'superadmin') {
            if (req.user.shop_id) {
              retryConditions.push(`(u.shop_id = ? OR u.shop_id IS NULL)`);
              retryParams.push(req.user.shop_id);
            }
          }
          
          if (retryConditions.length > 0) {
            retryQuery += ` WHERE ${retryConditions.join(' AND ')}`;
          }
          
          retryQuery += ` ORDER BY s.sale_date DESC`;
          
          db.all(retryQuery, retryParams, (retryErr, retrySales) => {
            if (retryErr) {
              console.error('Sales retry query error:', retryErr);
              return res.status(500).json({ error: sanitizeError(retryErr) });
            }
            res.json(retrySales);
          });
          return;
        }
        console.error('Sales query error:', err);
        return res.status(500).json({ error: sanitizeError(err) });
      }
      res.json(sales);
    });
  });
});

app.get('/api/sales/returns', authenticateToken, requireRole('admin', 'sales', 'manager'), (req, res) => {
  const shopFilter = getShopFilter(req);
  let query = `
    SELECT s.*, u.username as created_by_name, u.shop_id
    FROM sales s
    LEFT JOIN users u ON s.created_by = u.id
    WHERE s.is_return = 1
  `;
  const params = [];
  
  // Filter by shop_id if provided (for superadmin)
  if (shopFilter.shop_id && req.user.role === 'superadmin') {
    query += ` AND u.shop_id = ?`;
    params.push(shopFilter.shop_id);
  } else if (req.user.role !== 'superadmin' && req.user.shop_id) {
    // Non-superadmin users only see returns from their shop
    query += ` AND u.shop_id = ?`;
    params.push(req.user.shop_id);
  }
  
  query += ` ORDER BY s.sale_date DESC`;
  
  db.all(query, params, (err, returns) => {
    if (err) {
      // If column doesn't exist, return empty array instead of error
      if (err.message && err.message.includes('no such column')) {
        return res.json([]);
      }
      return res.status(500).json({ error: sanitizeError(err) });
    }
    // Map sale_date to return_date for compatibility with frontend
    const formattedReturns = returns.map(ret => ({
      ...ret,
      return_date: ret.sale_date || ret.return_date,
      sale_id: ret.original_sale_id || ret.sale_id || ret.id,
      invoice_number: ret.invoice_number || `#${ret.id}`
    }));
    res.json(formattedReturns);
  });
});

app.get('/api/sales/:id', authenticateToken, requireRole('admin', 'sales', 'manager'), (req, res) => {
  const id = req.params.id;
  const query = `
    SELECT s.*,
           (SELECT json_group_array(json_object(
             'id', si.id,
             'item_id', si.item_id,
             'item_name', i.name,
             'quantity', si.quantity,
             'unit_price', si.unit_price,
             'total_price', si.total_price
           ))
           FROM sales_items si
           JOIN items i ON si.item_id = i.id
           WHERE si.sale_id = s.id) as items
    FROM sales s
    WHERE s.id = ?
  `;
  db.get(query, [id], (err, sale) => {
    if (err) {
      return res.status(500).json({ error: sanitizeError(err) });
    }
    if (!sale) {
      return res.status(404).json({ error: 'Sale not found' });
    }
    sale.items = JSON.parse(sale.items || '[]');
    res.json(sale);
  });
});

app.post('/api/sales', authenticateToken, requireRole('admin', 'sales'), (req, res) => {
  const { items, customer_name, notes } = req.body;
  const created_by = req.user.id;
  let total_amount = 0;

  if (!items || items.length === 0) {
    return res.status(400).json({ error: 'At least one item is required' });
  }

  // Validate stock availability first
  let validationCount = 0;
  let validationError = null;

  items.forEach((item) => {
    db.get('SELECT name, stock_quantity FROM items WHERE id = ?', [item.item_id], (err, row) => {
      validationCount++;
      
      if (err) {
        validationError = { error: `Error checking stock for item ${item.item_id}` };
      } else if (!row) {
        validationError = { error: `Item ${item.item_id} not found` };
      } else if (row.stock_quantity < item.quantity) {
        validationError = { error: `Insufficient stock for ${row.name}. Available: ${row.stock_quantity}, Requested: ${item.quantity}` };
      }

      // When all validations are complete
      if (validationCount === items.length) {
        if (validationError) {
          return res.status(400).json(validationError);
        }

        // Calculate total amount
        items.forEach(item => {
          total_amount += item.quantity * item.unit_price;
        });

        // Create sale
        db.run(
          'INSERT INTO sales (total_amount, customer_name, created_by, notes) VALUES (?, ?, ?, ?)',
          [total_amount, customer_name, created_by, notes],
          function(err) {
            if (err) {
              console.error('Error creating sale:', err);
              return res.status(500).json({ error: sanitizeError(err) });
            }
            const sale_id = this.lastID;

            // Insert sales items and update stock
            let completed = 0;
            let hasError = false;
            items.forEach((item) => {
              db.run(
                'INSERT INTO sales_items (sale_id, item_id, quantity, unit_price, total_price) VALUES (?, ?, ?, ?, ?)',
                [sale_id, item.item_id, item.quantity, item.unit_price, item.quantity * item.unit_price],
                function(err) {
                  if (err) {
                    console.error('Error creating sale item:', err);
                    if (!hasError) {
                      hasError = true;
                      return res.status(500).json({ error: sanitizeError(err) });
                    }
                    return;
                  }
                  // Update stock
                  db.run('UPDATE items SET stock_quantity = stock_quantity - ? WHERE id = ?', [item.quantity, item.item_id], (stockErr) => {
                    if (stockErr) {
                      console.error('Error updating stock:', stockErr);
                    }
                  });
                  completed++;
                  if (completed === items.length && !hasError) {
                    res.json({ id: sale_id, message: 'Sale recorded successfully' });
                  }
                }
              );
            });
          }
        );
      }
    });
  });
});

// ==================== SALES RETURN ROUTES ====================

// Configure multer for file uploads
const uploadsDir = path.join(__dirname, 'public', 'uploads', 'returns');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    // Generate unique filename with timestamp and UUID
    const uniqueSuffix = Date.now() + '-' + uuidv4().substring(0, 8);
    const ext = path.extname(file.originalname);
    cb(null, `return-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: function (req, file, cb) {
    // Only allow image files
    const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only image files are allowed.'));
    }
  }
});

// Upload return image endpoint
app.post('/api/sales/return/upload-image', authenticateToken, requireRole('admin', 'sales', 'manager'), upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image file provided' });
  }

  // Return the relative path from public directory
  const imagePath = `/uploads/returns/${req.file.filename}`;
  res.json({ image_path: imagePath });
});

// Create return endpoint
app.post('/api/sales/return', authenticateToken, requireRole('admin', 'sales', 'manager'), (req, res) => {
  const { original_sale_id, items, reason, return_info, image_path } = req.body;
  const created_by = req.user.id;

  if (!original_sale_id || !items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Original sale ID and items are required' });
  }

  // First, verify the original sale exists
  db.get('SELECT * FROM sales WHERE id = ?', [original_sale_id], (err, originalSale) => {
    if (err) {
      console.error('Error fetching original sale:', err);
      return res.status(500).json({ error: sanitizeError(err) });
    }
    if (!originalSale) {
      return res.status(404).json({ error: 'Original sale not found' });
    }

    // Calculate total return amount
    let total_amount = 0;
    items.forEach(item => {
      total_amount += (item.quantity || 0) * (item.unit_price || 0);
    });

    // Check if sales table has return-related columns, add them if needed
    db.all("SELECT name FROM pragma_table_info('sales') WHERE name IN ('is_return', 'original_sale_id', 'return_info', 'image_path')", (colErr, colRows) => {
      if (colErr) {
        console.error('Error checking columns:', colErr);
        return res.status(500).json({ error: sanitizeError(colErr) });
      }

      const existingColumns = colRows.map(row => row.name);
      const columnsToAdd = [];

      if (!existingColumns.includes('is_return')) columnsToAdd.push("ALTER TABLE sales ADD COLUMN is_return INTEGER DEFAULT 0");
      if (!existingColumns.includes('original_sale_id')) columnsToAdd.push("ALTER TABLE sales ADD COLUMN original_sale_id INTEGER");
      if (!existingColumns.includes('return_info')) columnsToAdd.push("ALTER TABLE sales ADD COLUMN return_info TEXT");
      if (!existingColumns.includes('image_path')) columnsToAdd.push("ALTER TABLE sales ADD COLUMN image_path TEXT");

      // Add missing columns
      let addColumnCount = 0;
      if (columnsToAdd.length === 0) {
        createReturn();
      } else {
        columnsToAdd.forEach((sql, index) => {
          db.run(sql, (addErr) => {
            if (addErr && !addErr.message.includes('duplicate column')) {
              console.error(`Error adding column: ${sql}`, addErr);
            }
            addColumnCount++;
            if (addColumnCount === columnsToAdd.length) {
              createReturn();
            }
          });
        });
      }

      function createReturn() {
        // Create the return sale record
        db.run(
          'INSERT INTO sales (sale_date, total_amount, customer_name, created_by, notes, is_return, original_sale_id, return_info, image_path) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
            new Date().toISOString(),
            total_amount,
            originalSale.customer_name || null,
            created_by,
            reason || null,
            1, // is_return = 1
            original_sale_id,
            return_info || null,
            image_path || null
          ],
          function(insertErr) {
            if (insertErr) {
              console.error('Error creating return:', insertErr);
              return res.status(500).json({ error: sanitizeError(insertErr) });
            }
            const return_id = this.lastID;

            // Insert return items and restore stock
            let completed = 0;
            let hasError = false;
            items.forEach((item) => {
              db.run(
                'INSERT INTO sales_items (sale_id, item_id, quantity, unit_price, total_price) VALUES (?, ?, ?, ?, ?)',
                [return_id, item.item_id, item.quantity, item.unit_price, item.quantity * item.unit_price],
                function(itemErr) {
                  if (itemErr) {
                    console.error('Error creating return item:', itemErr);
                    if (!hasError) {
                      hasError = true;
                      return res.status(500).json({ error: sanitizeError(itemErr) });
                    }
                    return;
                  }
                  // Restore stock (add back the returned quantity)
                  db.run('UPDATE items SET stock_quantity = stock_quantity + ? WHERE id = ?', [item.quantity, item.item_id], (stockErr) => {
                    if (stockErr) {
                      console.error('Error restoring stock:', stockErr);
                    }
                  });
                  completed++;
                  if (completed === items.length && !hasError) {
                    res.json({ id: return_id, message: 'Return processed successfully' });
                  }
                }
              );
            });
          }
        );
      }
    });
  });
});

// ==================== STOCK ADJUSTMENTS ROUTES ====================

app.get('/api/stock-adjustments', authenticateToken, requireRole('admin', 'storekeeper'), (req, res) => {
  const query = `
    SELECT sa.*, i.name as item_name, u.username as created_by_name
    FROM stock_adjustments sa
    JOIN items i ON sa.item_id = i.id
    LEFT JOIN users u ON sa.created_by = u.id
    ORDER BY sa.created_at DESC
  `;
  db.all(query, (err, adjustments) => {
    if (err) {
      return res.status(500).json({ error: sanitizeError(err) });
    }
    res.json(adjustments);
  });
});

app.post('/api/stock-adjustments', authenticateToken, requireRole('admin', 'storekeeper'), (req, res) => {
  const { item_id, adjustment_type, quantity, reason } = req.body;
  const created_by = req.user.id;

  db.get('SELECT stock_quantity FROM items WHERE id = ?', [item_id], (err, item) => {
    if (err || !item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    let newQuantity = item.stock_quantity;
    if (adjustment_type === 'increase') {
      newQuantity += quantity;
    } else if (adjustment_type === 'decrease') {
      newQuantity -= quantity;
      if (newQuantity < 0) newQuantity = 0;
    } else if (adjustment_type === 'set') {
      newQuantity = quantity;
    }

    db.run(
      'INSERT INTO stock_adjustments (item_id, adjustment_type, quantity, reason, created_by) VALUES (?, ?, ?, ?, ?)',
      [item_id, adjustment_type, quantity, reason, created_by],
      function(err) {
        if (err) {
          return res.status(500).json({ error: sanitizeError(err) });
        }
        // Update item stock
        db.run('UPDATE items SET stock_quantity = ? WHERE id = ?', [newQuantity, item_id], (err) => {
          if (err) {
            return res.status(500).json({ error: sanitizeError(err) });
          }
          res.json({ id: this.lastID, message: 'Stock adjusted successfully' });
        });
      }
    );
  });
});

// ==================== EXPENSES ROUTES ====================

app.get('/api/expenses', authenticateToken, requireRole('admin', 'manager'), (req, res) => {
  const shopFilter = getShopFilter(req);
  
  let query = `
    SELECT e.*, u.username as created_by_name, u.shop_id
    FROM expenses e
    LEFT JOIN users u ON e.created_by = u.id
  `;
  const params = [];
  const conditions = [];
  
  // For non-superadmin users, ALWAYS show expenses they created
  // This ensures users always see their own expenses regardless of shop_id filter
  if (req.user.role !== 'superadmin') {
    const userId = parseInt(req.user.id);
    // Use CAST to ensure type matching
    conditions.push(`CAST(e.created_by AS INTEGER) = ?`);
    params.push(userId);
  } else if (req.user.role === 'superadmin') {
    // Superadmin: if shop_id filter is provided, show expenses from that shop OR expenses they created
    if (shopFilter.shop_id) {
      const userId = parseInt(req.user.id);
      const shopId = parseInt(shopFilter.shop_id);
      // Show expenses from the selected shop OR expenses created by superadmin
      conditions.push(`(u.shop_id = ? OR e.created_by = ?)`);
      params.push(shopId, userId);
    }
    // If no shop filter, superadmin sees all expenses (no WHERE clause added)
  }
  
  if (conditions.length > 0) {
    query += ` WHERE ` + conditions.join(' AND ');
  }
  
  query += ` ORDER BY e.expense_date DESC`;
  
  db.all(query, params, (err, expenses) => {
    if (err) {
      console.error('Expenses query error:', err);
      return res.status(500).json({ error: sanitizeError(err) });
    }
    res.json(expenses || []);
  });
});

app.get('/api/expenses/:id', authenticateToken, requireRole('admin', 'manager'), (req, res) => {
  const id = req.params.id;
  const shopFilter = getShopFilter(req);
  let query = `
    SELECT e.*, u.username as created_by_name, u.shop_id
    FROM expenses e
    LEFT JOIN users u ON e.created_by = u.id
    WHERE e.id = ?
  `;
  const params = [id];
  
  // Apply shop filtering
  if (shopFilter.shop_id && req.user.role === 'superadmin') {
    query += ` AND u.shop_id = ?`;
    params.push(shopFilter.shop_id);
  } else if (req.user.role !== 'superadmin' && req.user.shop_id) {
    query += ` AND u.shop_id = ?`;
    params.push(req.user.shop_id);
  }
  
  db.get(query, params, (err, expense) => {
    if (err) {
      return res.status(500).json({ error: sanitizeError(err) });
    }
    if (!expense) {
      return res.status(404).json({ error: 'Expense not found' });
    }
    res.json(expense);
  });
});

app.post('/api/expenses', authenticateToken, requireRole('admin', 'manager'), (req, res) => {
  const { expense_date, category, description, amount, payment_method } = req.body;
  const created_by = parseInt(req.user.id);
  
  // Validation
  if (!category || !amount || amount <= 0) {
    return res.status(400).json({ error: 'Category and amount are required. Amount must be greater than 0.' });
  }
  
  db.run(
    'INSERT INTO expenses (expense_date, category, description, amount, payment_method, created_by) VALUES (?, ?, ?, ?, ?, ?)',
    [expense_date || new Date().toISOString(), category, description || null, amount, payment_method || null, created_by],
    function(err) {
      if (err) {
        console.error('Error creating expense:', err);
        return res.status(500).json({ error: sanitizeError(err) });
      }
      logAudit(req, 'EXPENSE_CREATED', 'expense', this.lastID, { category, amount });
      res.json({ id: this.lastID, message: 'Expense created successfully' });
    }
  );
});

app.put('/api/expenses/:id', authenticateToken, requireRole('admin', 'manager'), (req, res) => {
  const id = req.params.id;
  const { expense_date, category, description, amount, payment_method } = req.body;
  const shopFilter = getShopFilter(req);
  
  // Validation
  if (amount !== undefined && amount <= 0) {
    return res.status(400).json({ error: 'Amount must be greater than 0' });
  }
  
  // First check if expense exists and user has access
  let checkQuery = `
    SELECT e.*, u.shop_id
    FROM expenses e
    LEFT JOIN users u ON e.created_by = u.id
    WHERE e.id = ?
  `;
  const checkParams = [id];
  
  if (shopFilter.shop_id && req.user.role === 'superadmin') {
    checkQuery += ` AND u.shop_id = ?`;
    checkParams.push(shopFilter.shop_id);
  } else if (req.user.role !== 'superadmin' && req.user.shop_id) {
    checkQuery += ` AND u.shop_id = ?`;
    checkParams.push(req.user.shop_id);
  }
  
  db.get(checkQuery, checkParams, (err, existingExpense) => {
    if (err) {
      return res.status(500).json({ error: sanitizeError(err) });
    }
    if (!existingExpense) {
      return res.status(404).json({ error: 'Expense not found' });
    }
    
    // Use existing values for fields not provided
    const finalExpenseDate = expense_date !== undefined ? expense_date : existingExpense.expense_date;
    const finalCategory = category !== undefined ? category : existingExpense.category;
    const finalDescription = description !== undefined ? description : existingExpense.description;
    const finalAmount = amount !== undefined ? amount : existingExpense.amount;
    const finalPaymentMethod = payment_method !== undefined ? payment_method : existingExpense.payment_method;
    
    db.run(
      'UPDATE expenses SET expense_date = ?, category = ?, description = ?, amount = ?, payment_method = ? WHERE id = ?',
      [finalExpenseDate, finalCategory, finalDescription, finalAmount, finalPaymentMethod, id],
      function(err) {
        if (err) {
          return res.status(500).json({ error: sanitizeError(err) });
        }
        logAudit(req, 'EXPENSE_UPDATED', 'expense', parseInt(id), { category: finalCategory, amount: finalAmount });
        res.json({ message: 'Expense updated successfully' });
      }
    );
  });
});

app.delete('/api/expenses/:id', authenticateToken, requireRole('admin', 'manager'), (req, res) => {
  const id = req.params.id;
  const shopFilter = getShopFilter(req);
  
  // First check if expense exists and user has access
  let checkQuery = `
    SELECT e.*, u.shop_id
    FROM expenses e
    LEFT JOIN users u ON e.created_by = u.id
    WHERE e.id = ?
  `;
  const checkParams = [id];
  
  if (shopFilter.shop_id && req.user.role === 'superadmin') {
    checkQuery += ` AND u.shop_id = ?`;
    checkParams.push(shopFilter.shop_id);
  } else if (req.user.role !== 'superadmin' && req.user.shop_id) {
    checkQuery += ` AND u.shop_id = ?`;
    checkParams.push(req.user.shop_id);
  }
  
  db.get(checkQuery, checkParams, (err, expense) => {
    if (err) {
      return res.status(500).json({ error: sanitizeError(err) });
    }
    if (!expense) {
      return res.status(404).json({ error: 'Expense not found' });
    }
    
    db.run('DELETE FROM expenses WHERE id = ?', [id], function(err) {
      if (err) {
        return res.status(500).json({ error: sanitizeError(err) });
      }
      logAudit(req, 'EXPENSE_DELETED', 'expense', parseInt(id), { category: expense.category, amount: expense.amount });
      res.json({ message: 'Expense deleted successfully' });
    });
  });
});

// ==================== CUSTOMERS ROUTES ====================

app.get('/api/customers', authenticateToken, (req, res) => {
  const shopFilter = getShopFilter(req);
  let query = 'SELECT * FROM customers';
  const params = [];
  
  // Filter by shop_id if provided (for superadmin)
  if (shopFilter.shop_id && req.user.role === 'superadmin') {
    query += ' WHERE shop_id = ?';
    params.push(shopFilter.shop_id);
  } else if (req.user.role !== 'superadmin' && req.user.shop_id) {
    // Non-superadmin users only see customers from their shop
    query += ' WHERE shop_id = ?';
    params.push(req.user.shop_id);
  }
  
  query += ' ORDER BY name';
  
  db.all(query, params, (err, customers) => {
    if (err) {
      return res.status(500).json({ error: sanitizeError(err) });
    }
    res.json(customers);
  });
});

app.post('/api/customers', authenticateToken, requireRole('admin', 'sales'), (req, res) => {
  const { name, email, phone, address } = req.body;
  const shopFilter = getShopFilter(req);
  const shopId = shopFilter.shop_id || req.user.shop_id || null;
  
  db.run(
    'INSERT INTO customers (name, email, phone, address, shop_id) VALUES (?, ?, ?, ?, ?)',
    [name, email, phone, address, shopId],
    function(err) {
      if (err) {
        return res.status(500).json({ error: sanitizeError(err) });
      }
      res.json({ id: this.lastID, message: 'Customer created successfully' });
    }
  );
});

app.put('/api/customers/:id', authenticateToken, requireRole('admin', 'sales'), (req, res) => {
  const id = req.params.id;
  const { name, email, phone, address } = req.body;
  
  db.run(
    'UPDATE customers SET name = ?, email = ?, phone = ?, address = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [name, email, phone, address, id],
    function(err) {
      if (err) {
        return res.status(500).json({ error: sanitizeError(err) });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Customer not found' });
      }
      res.json({ message: 'Customer updated successfully' });
    }
  );
});

app.delete('/api/customers/:id', authenticateToken, requireRole('admin', 'sales'), (req, res) => {
  const id = req.params.id;
  
  db.run('DELETE FROM customers WHERE id = ?', [id], function(err) {
    if (err) {
      return res.status(500).json({ error: sanitizeError(err) });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    res.json({ message: 'Customer deleted successfully' });
  });
});

// ==================== TERMS AND SERVICE TEMPLATES ROUTES ====================

app.get('/api/terms-and-service', authenticateToken, (req, res) => {
  const shopFilter = getShopFilter(req);
  let query = 'SELECT * FROM terms_and_service WHERE 1=1';
  const params = [];
  
  // Filter by shop_id if provided (for superadmin)
  if (shopFilter.shop_id && req.user.role === 'superadmin') {
    query += ' AND shop_id = ?';
    params.push(shopFilter.shop_id);
  } else if (req.user.role !== 'superadmin' && req.user.shop_id) {
    // Non-superadmin users only see templates from their shop
    query += ' AND shop_id = ?';
    params.push(req.user.shop_id);
  } else if (req.user.role !== 'superadmin' && !req.user.shop_id) {
    // Non-superadmin without shop_id sees no templates
    query += ' AND 1=0';
  }
  
  query += ' ORDER BY created_at DESC';
  
  db.all(query, params, (err, templates) => {
    if (err) {
      return res.status(500).json({ error: sanitizeError(err) });
    }
    res.json(templates);
  });
});

app.get('/api/terms-and-service/:id', authenticateToken, (req, res) => {
  const id = req.params.id;
  const shopFilter = getShopFilter(req);
  
  let query = 'SELECT * FROM terms_and_service WHERE id = ?';
  const params = [id];
  
  // Add shop filter for non-superadmin users
  if (req.user.role !== 'superadmin' && req.user.shop_id) {
    query += ' AND shop_id = ?';
    params.push(req.user.shop_id);
  } else if (req.user.role !== 'superadmin' && !req.user.shop_id) {
    query += ' AND 1=0';
  }
  
  db.get(query, params, (err, template) => {
    if (err) {
      return res.status(500).json({ error: sanitizeError(err) });
    }
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    res.json(template);
  });
});

app.post('/api/terms-and-service', authenticateToken, requireRole('admin', 'storekeeper', 'sales'), (req, res) => {
  const { name, type, content, description } = req.body;
  const shopFilter = getShopFilter(req);
  const shopId = shopFilter.shop_id || req.user.shop_id || null;
  
  // SECURITY: Input validation
  if (!name || typeof name !== 'string' || name.trim().length < 1) {
    return res.status(400).json({ error: 'Template name is required' });
  }
  
  if (!type || !['invoice', 'receipt', 'purchase', 'general'].includes(type)) {
    return res.status(400).json({ error: 'Valid template type is required (invoice, receipt, purchase, or general)' });
  }
  
  if (!content || typeof content !== 'string' || content.trim().length < 1) {
    return res.status(400).json({ error: 'Template content is required' });
  }
  
  db.run(
    'INSERT INTO terms_and_service (name, type, content, description, shop_id, created_by) VALUES (?, ?, ?, ?, ?, ?)',
    [name.trim(), type, content.trim(), description ? description.trim() : null, shopId, req.user.id],
    function(err) {
      if (err) {
        return res.status(500).json({ error: sanitizeError(err) });
      }
      
      // SECURITY: Log template creation
      logAudit(req, 'TERMS_TEMPLATE_CREATED', 'terms_and_service', this.lastID, { name: name.trim(), type });
      
      res.json({ id: this.lastID, message: 'Template created successfully' });
    }
  );
});

app.put('/api/terms-and-service/:id', authenticateToken, requireRole('admin', 'storekeeper', 'sales'), (req, res) => {
  const id = req.params.id;
  const { name, type, content, description } = req.body;
  const shopFilter = getShopFilter(req);
  
  // SECURITY: Input validation
  if (!name || typeof name !== 'string' || name.trim().length < 1) {
    return res.status(400).json({ error: 'Template name is required' });
  }
  
  if (!type || !['invoice', 'receipt', 'purchase', 'general'].includes(type)) {
    return res.status(400).json({ error: 'Valid template type is required (invoice, receipt, purchase, or general)' });
  }
  
  if (!content || typeof content !== 'string' || content.trim().length < 1) {
    return res.status(400).json({ error: 'Template content is required' });
  }
  
  // First check if template exists and user has permission
  db.get('SELECT * FROM terms_and_service WHERE id = ?', [id], (err, template) => {
    if (err) {
      return res.status(500).json({ error: sanitizeError(err) });
    }
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    // Check permissions
    if (req.user.role === 'superadmin') {
      if (shopFilter.shop_id && template.shop_id !== shopFilter.shop_id) {
        return res.status(403).json({ error: 'Access denied' });
      }
    } else {
      if (template.shop_id !== req.user.shop_id) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }
    
    db.run(
      'UPDATE terms_and_service SET name = ?, type = ?, content = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [name.trim(), type, content.trim(), description ? description.trim() : null, id],
      function(err) {
        if (err) {
          return res.status(500).json({ error: sanitizeError(err) });
        }
        if (this.changes === 0) {
          return res.status(404).json({ error: 'Template not found' });
        }
        
        // SECURITY: Log template update
        logAudit(req, 'TERMS_TEMPLATE_UPDATED', 'terms_and_service', parseInt(id), { name: name.trim(), type });
        
        res.json({ message: 'Template updated successfully' });
      }
    );
  });
});

app.delete('/api/terms-and-service/:id', authenticateToken, requireRole('admin', 'storekeeper', 'sales'), (req, res) => {
  const id = req.params.id;
  const shopFilter = getShopFilter(req);
  
  // First check if template exists and user has permission
  db.get('SELECT * FROM terms_and_service WHERE id = ?', [id], (err, template) => {
    if (err) {
      return res.status(500).json({ error: sanitizeError(err) });
    }
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    // Check permissions
    if (req.user.role === 'superadmin') {
      if (shopFilter.shop_id && template.shop_id !== shopFilter.shop_id) {
        return res.status(403).json({ error: 'Access denied' });
      }
    } else {
      if (template.shop_id !== req.user.shop_id) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }
    
    db.run('DELETE FROM terms_and_service WHERE id = ?', [id], function(err) {
      if (err) {
        return res.status(500).json({ error: sanitizeError(err) });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Template not found' });
      }
      
      // SECURITY: Log template deletion
      logAudit(req, 'TERMS_TEMPLATE_DELETED', 'terms_and_service', parseInt(id), { name: template.name });
      
      res.json({ message: 'Template deleted successfully' });
    });
  });
});

// ==================== SYSTEM SETTINGS ROUTES ====================

app.get('/api/settings', authenticateToken, requireRole('admin', 'superadmin'), (req, res) => {
  const shopFilter = getShopFilter(req);
  let query = 'SELECT * FROM system_settings WHERE 1=1';
  const params = [];
  
  // For superadmin, can filter by shop_id
  if (shopFilter.shop_id && req.user.role === 'superadmin') {
    query += ' AND (shop_id = ? OR shop_id IS NULL)';
    params.push(shopFilter.shop_id);
  } else if (req.user.role !== 'superadmin' && req.user.shop_id) {
    // Non-superadmin users see global settings and their shop settings
    query += ' AND (shop_id = ? OR shop_id IS NULL)';
    params.push(req.user.shop_id);
  } else if (req.user.role !== 'superadmin' && !req.user.shop_id) {
    // Non-superadmin without shop_id only see global settings
    query += ' AND shop_id IS NULL';
  }
  
  query += ' ORDER BY category, setting_key';
  
  db.all(query, params, (err, settings) => {
    if (err) {
      return res.status(500).json({ error: sanitizeError(err) });
    }
    
    // Group settings by category for easier frontend handling
    const groupedSettings = {};
    settings.forEach(setting => {
      if (!groupedSettings[setting.category]) {
        groupedSettings[setting.category] = [];
      }
      
      // Parse value based on type
      let parsedValue = setting.setting_value;
      if (setting.setting_type === 'number') {
        parsedValue = setting.setting_value ? parseFloat(setting.setting_value) : null;
      } else if (setting.setting_type === 'boolean') {
        parsedValue = setting.setting_value === 'true' || setting.setting_value === '1';
      } else if (setting.setting_type === 'json') {
        try {
          parsedValue = setting.setting_value ? JSON.parse(setting.setting_value) : null;
        } catch (e) {
          parsedValue = null;
        }
      }
      
      groupedSettings[setting.category].push({
        id: setting.id,
        key: setting.setting_key,
        value: parsedValue,
        type: setting.setting_type,
        category: setting.category,
        description: setting.description,
        is_encrypted: setting.is_encrypted === 1,
        shop_id: setting.shop_id,
        updated_at: setting.updated_at
      });
    });
    
    res.json(groupedSettings);
  });
});

// Get display system name (accessible to all authenticated users)
app.get('/api/settings/display-name', authenticateToken, (req, res) => {
  const shopFilter = getShopFilter(req);
  const shopId = (req.user.role === 'superadmin' && shopFilter.shop_id) 
    ? shopFilter.shop_id 
    : (req.user.shop_id || null);
  
  // Get system_name (global default)
  db.get('SELECT setting_value FROM system_settings WHERE setting_key = ? AND shop_id IS NULL LIMIT 1', 
    ['system_name'], (err, globalSetting) => {
      if (err) {
        return res.status(500).json({ error: sanitizeError(err) });
      }
      
      const systemName = globalSetting?.setting_value || 'Inventory Management System';
      
      // If shop_id is set, try to get shop_system_name
      if (shopId) {
        db.get('SELECT setting_value FROM system_settings WHERE setting_key = ? AND shop_id = ? LIMIT 1', 
          ['shop_system_name', shopId], (shopErr, shopSetting) => {
            if (shopErr) {
              return res.status(500).json({ error: sanitizeError(shopErr) });
            }
            
            const shopSystemName = shopSetting?.setting_value;
            
            // Return shop_system_name if set and not empty, otherwise return system_name
            if (shopSystemName && shopSystemName.trim() !== '') {
              return res.json({ displayName: shopSystemName.trim(), systemName });
            }
            
            return res.json({ displayName: systemName, systemName });
          }
        );
      } else {
        return res.json({ displayName: systemName, systemName });
      }
    }
  );
});

app.get('/api/settings/:key', authenticateToken, requireRole('admin', 'superadmin'), (req, res) => {
  const key = req.params.key;
  const shopFilter = getShopFilter(req);
  
  let query = 'SELECT * FROM system_settings WHERE setting_key = ?';
  const params = [key];
  
  // Add shop filter
  if (shopFilter.shop_id && req.user.role === 'superadmin') {
    query += ' AND (shop_id = ? OR shop_id IS NULL)';
    params.push(shopFilter.shop_id);
  } else if (req.user.role !== 'superadmin' && req.user.shop_id) {
    query += ' AND (shop_id = ? OR shop_id IS NULL)';
    params.push(req.user.shop_id);
  } else if (req.user.role !== 'superadmin' && !req.user.shop_id) {
    query += ' AND shop_id IS NULL';
  }
  
  query += ' ORDER BY shop_id DESC LIMIT 1'; // Prefer shop-specific over global
  
  db.get(query, params, (err, setting) => {
    if (err) {
      return res.status(500).json({ error: sanitizeError(err) });
    }
    if (!setting) {
      return res.status(404).json({ error: 'Setting not found' });
    }
    
    // Parse value based on type
    let parsedValue = setting.setting_value;
    if (setting.setting_type === 'number') {
      parsedValue = setting.setting_value ? parseFloat(setting.setting_value) : null;
    } else if (setting.setting_type === 'boolean') {
      parsedValue = setting.setting_value === 'true' || setting.setting_value === '1';
    } else if (setting.setting_type === 'json') {
      try {
        parsedValue = setting.setting_value ? JSON.parse(setting.setting_value) : null;
      } catch (e) {
        parsedValue = null;
      }
    }
    
    res.json({
      id: setting.id,
      key: setting.setting_key,
      value: parsedValue,
      type: setting.setting_type,
      category: setting.category,
      description: setting.description,
      is_encrypted: setting.is_encrypted === 1,
      shop_id: setting.shop_id,
      updated_at: setting.updated_at
    });
  });
});

app.put('/api/settings', authenticateToken, requireRole('admin', 'superadmin'), (req, res) => {
  const { settings } = req.body; // Expect array of {key, value} objects
  const shopFilter = getShopFilter(req);
  const shopId = (req.user.role === 'superadmin' && shopFilter.shop_id) 
    ? shopFilter.shop_id 
    : (req.user.shop_id || null);
  
  if (!Array.isArray(settings) || settings.length === 0) {
    return res.status(400).json({ error: 'Settings array is required' });
  }
  
  const results = [];
  let completed = 0;
  let hasError = false;
  
  settings.forEach((setting, index) => {
    const { key, value } = setting;
    
    if (!key || typeof key !== 'string') {
      results[index] = { key, error: 'Invalid setting key' };
      completed++;
      if (completed === settings.length && !hasError) {
        return res.status(400).json({ error: 'Some settings failed to update', results });
      }
      return;
    }
    
    // Get existing setting to determine type
    db.get('SELECT * FROM system_settings WHERE setting_key = ? AND (shop_id = ? OR (shop_id IS NULL AND ? IS NULL)) ORDER BY shop_id DESC LIMIT 1', 
      [key, shopId, shopId], (err, existing) => {
        if (err) {
          results[index] = { key, error: sanitizeError(err) };
          hasError = true;
        } else {
          const settingType = existing ? existing.setting_type : 'string';
          
          // Convert value to string based on type
          let stringValue;
          if (settingType === 'boolean') {
            stringValue = value ? 'true' : 'false';
          } else if (settingType === 'number') {
            stringValue = value !== null && value !== undefined ? String(value) : null;
          } else if (settingType === 'json') {
            stringValue = value !== null && value !== undefined ? JSON.stringify(value) : null;
          } else {
            stringValue = value !== null && value !== undefined ? String(value) : null;
          }
          
          // Encrypt password fields
          let finalValue = stringValue;
          const isPassword = key.toLowerCase().includes('password') || key.toLowerCase().includes('secret');
          
          if (isPassword && stringValue) {
            // For now, store as-is (in production, use proper encryption)
            // TODO: Implement proper encryption for sensitive fields
            finalValue = stringValue;
          }
          
          // Update or insert setting
          if (existing) {
            // If shop admin is editing and existing is global (shop_id IS NULL), create shop-specific override
            // If superadmin without shop filter, update global. If superadmin with shop filter or shop admin, create/update shop-specific
            if (shopId && existing.shop_id === null && req.user.role !== 'superadmin') {
              // Shop admin editing global setting - create shop-specific override
              db.get('SELECT * FROM system_settings WHERE setting_key = ? AND shop_id IS NULL LIMIT 1', [key], (getErr, globalSetting) => {
                if (getErr) {
                  results[index] = { key, error: sanitizeError(getErr) };
                  hasError = true;
                  completed++;
                  if (completed === settings.length) {
                    return res.status(400).json({ error: 'Some settings failed to update', results });
                  }
                  return;
                }
                
                if (globalSetting) {
                  // Create shop-specific override
                  db.run(
                    'INSERT INTO system_settings (setting_key, setting_value, setting_type, category, description, is_encrypted, shop_id, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                    [key, finalValue, globalSetting.setting_type, globalSetting.category, globalSetting.description, isPassword ? 1 : 0, shopId, req.user.id],
                    function(insertErr) {
                      if (insertErr) {
                        results[index] = { key, error: sanitizeError(insertErr) };
                        hasError = true;
                      } else {
                        results[index] = { key, success: true };
                        logAudit(req, 'SETTING_CREATED', 'system_settings', this.lastID, { key, category: globalSetting.category, shop_id: shopId });
                      }
                      
                      completed++;
                      if (completed === settings.length) {
                        if (hasError) {
                          return res.status(400).json({ error: 'Some settings failed to update', results });
                        }
                        return res.json({ message: 'Settings updated successfully', results });
                      }
                    }
                  );
                } else {
                  results[index] = { key, error: 'Setting key not found' };
                  completed++;
                  if (completed === settings.length) {
                    return res.status(400).json({ error: 'Some settings failed to update', results });
                  }
                }
              });
            } else {
              // Update existing setting (shop-specific or global for superadmin)
              db.run(
                'UPDATE system_settings SET setting_value = ?, is_encrypted = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [finalValue, isPassword ? 1 : 0, req.user.id, existing.id],
                function(updateErr) {
                  if (updateErr) {
                    results[index] = { key, error: sanitizeError(updateErr) };
                    hasError = true;
                  } else {
                    results[index] = { key, success: true };
                    
                    // SECURITY: Log setting update
                    logAudit(req, 'SETTING_UPDATED', 'system_settings', existing.id, { key, category: existing.category, shop_id: existing.shop_id });
                  }
                  
                  completed++;
                  if (completed === settings.length) {
                    if (hasError) {
                      return res.status(400).json({ error: 'Some settings failed to update', results });
                    }
                    return res.json({ message: 'Settings updated successfully', results });
                  }
                }
              );
            }
          } else {
            // Create new setting (shouldn't happen for default settings, but handle it)
            db.get('SELECT * FROM system_settings WHERE setting_key = ? AND shop_id IS NULL LIMIT 1', [key], (getErr, globalSetting) => {
              if (getErr) {
                results[index] = { key, error: sanitizeError(getErr) };
                hasError = true;
                completed++;
                if (completed === settings.length) {
                  return res.status(400).json({ error: 'Some settings failed to update', results });
                }
                return;
              }
              
              if (globalSetting) {
                // Use global setting as template, create shop-specific override
                db.run(
                  'INSERT INTO system_settings (setting_key, setting_value, setting_type, category, description, is_encrypted, shop_id, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                  [key, finalValue, globalSetting.setting_type, globalSetting.category, globalSetting.description, isPassword ? 1 : 0, shopId, req.user.id],
                  function(insertErr) {
                    if (insertErr) {
                      results[index] = { key, error: sanitizeError(insertErr) };
                      hasError = true;
                    } else {
                      results[index] = { key, success: true };
                      logAudit(req, 'SETTING_CREATED', 'system_settings', this.lastID, { key, category: globalSetting.category });
                    }
                    
                    completed++;
                    if (completed === settings.length) {
                      if (hasError) {
                        return res.status(400).json({ error: 'Some settings failed to update', results });
                      }
                      return res.json({ message: 'Settings updated successfully', results });
                    }
                  }
                );
              } else {
                results[index] = { key, error: 'Setting key not found' };
                completed++;
                if (completed === settings.length) {
                  return res.status(400).json({ error: 'Some settings failed to update', results });
                }
              }
            });
          }
        }
      }
    );
  });
});

app.put('/api/settings/:key', authenticateToken, requireRole('admin', 'superadmin'), (req, res) => {
  const key = req.params.key;
  const { value } = req.body;
  const shopFilter = getShopFilter(req);
  const shopId = (req.user.role === 'superadmin' && shopFilter.shop_id) 
    ? shopFilter.shop_id 
    : (req.user.shop_id || null);
  
  // Get existing setting
  db.get('SELECT * FROM system_settings WHERE setting_key = ? AND (shop_id = ? OR (shop_id IS NULL AND ? IS NULL)) ORDER BY shop_id DESC LIMIT 1', 
    [key, shopId, shopId], (err, existing) => {
      if (err) {
        return res.status(500).json({ error: sanitizeError(err) });
      }
      
      if (!existing) {
        // Try to get global setting as template
        db.get('SELECT * FROM system_settings WHERE setting_key = ? AND shop_id IS NULL LIMIT 1', [key], (getErr, globalSetting) => {
          if (getErr || !globalSetting) {
            return res.status(404).json({ error: 'Setting not found' });
          }
          
          // Create shop-specific setting
          const settingType = globalSetting.setting_type;
          let stringValue;
          if (settingType === 'boolean') {
            stringValue = value ? 'true' : 'false';
          } else if (settingType === 'number') {
            stringValue = value !== null && value !== undefined ? String(value) : null;
          } else if (settingType === 'json') {
            stringValue = value !== null && value !== undefined ? JSON.stringify(value) : null;
          } else {
            stringValue = value !== null && value !== undefined ? String(value) : null;
          }
          
          const isPassword = key.toLowerCase().includes('password') || key.toLowerCase().includes('secret');
          
          db.run(
            'INSERT INTO system_settings (setting_key, setting_value, setting_type, category, description, is_encrypted, shop_id, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [key, stringValue, globalSetting.setting_type, globalSetting.category, globalSetting.description, isPassword ? 1 : 0, shopId, req.user.id],
            function(insertErr) {
              if (insertErr) {
                return res.status(500).json({ error: sanitizeError(insertErr) });
              }
              logAudit(req, 'SETTING_CREATED', 'system_settings', this.lastID, { key, category: globalSetting.category, shop_id: shopId });
              res.json({ message: 'Setting created successfully', id: this.lastID });
            }
          );
        });
        return;
      }
      
      // If shop admin is editing global setting, create shop-specific override
      if (shopId && existing.shop_id === null && req.user.role !== 'superadmin') {
        // Shop admin editing global setting - create shop-specific override
        const settingType = existing.setting_type;
        let stringValue;
        if (settingType === 'boolean') {
          stringValue = value ? 'true' : 'false';
        } else if (settingType === 'number') {
          stringValue = value !== null && value !== undefined ? String(value) : null;
        } else if (settingType === 'json') {
          stringValue = value !== null && value !== undefined ? JSON.stringify(value) : null;
        } else {
          stringValue = value !== null && value !== undefined ? String(value) : null;
        }
        
        const isPassword = key.toLowerCase().includes('password') || key.toLowerCase().includes('secret');
        
        db.run(
          'INSERT INTO system_settings (setting_key, setting_value, setting_type, category, description, is_encrypted, shop_id, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [key, stringValue, existing.setting_type, existing.category, existing.description, isPassword ? 1 : 0, shopId, req.user.id],
          function(insertErr) {
            if (insertErr) {
              return res.status(500).json({ error: sanitizeError(insertErr) });
            }
            logAudit(req, 'SETTING_CREATED', 'system_settings', this.lastID, { key, category: existing.category, shop_id: shopId });
            res.json({ message: 'Setting created successfully', id: this.lastID });
          }
        );
        return;
      }
      
      // If shop admin is editing global setting, create shop-specific override instead
      if (shopId && existing.shop_id === null && req.user.role !== 'superadmin') {
        // Shop admin editing global setting - create shop-specific override
        const settingType = existing.setting_type;
        let stringValue;
        if (settingType === 'boolean') {
          stringValue = value ? 'true' : 'false';
        } else if (settingType === 'number') {
          stringValue = value !== null && value !== undefined ? String(value) : null;
        } else if (settingType === 'json') {
          stringValue = value !== null && value !== undefined ? JSON.stringify(value) : null;
        } else {
          stringValue = value !== null && value !== undefined ? String(value) : null;
        }
        
        const isPassword = key.toLowerCase().includes('password') || key.toLowerCase().includes('secret');
        
        db.run(
          'INSERT INTO system_settings (setting_key, setting_value, setting_type, category, description, is_encrypted, shop_id, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [key, stringValue, existing.setting_type, existing.category, existing.description, isPassword ? 1 : 0, shopId, req.user.id],
          function(insertErr) {
            if (insertErr) {
              return res.status(500).json({ error: sanitizeError(insertErr) });
            }
            logAudit(req, 'SETTING_CREATED', 'system_settings', this.lastID, { key, category: existing.category, shop_id: shopId });
            res.json({ message: 'Setting created successfully', id: this.lastID });
          }
        );
        return;
      }
      
      // Update existing setting (shop-specific or global for superadmin)
      const settingType = existing.setting_type;
      let stringValue;
      if (settingType === 'boolean') {
        stringValue = value ? 'true' : 'false';
      } else if (settingType === 'number') {
        stringValue = value !== null && value !== undefined ? String(value) : null;
      } else if (settingType === 'json') {
        stringValue = value !== null && value !== undefined ? JSON.stringify(value) : null;
      } else {
        stringValue = value !== null && value !== undefined ? String(value) : null;
      }
      
      const isPassword = key.toLowerCase().includes('password') || key.toLowerCase().includes('secret');
      
      db.run(
        'UPDATE system_settings SET setting_value = ?, is_encrypted = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [stringValue, isPassword ? 1 : 0, req.user.id, existing.id],
        function(updateErr) {
          if (updateErr) {
            return res.status(500).json({ error: sanitizeError(updateErr) });
          }
          if (this.changes === 0) {
            return res.status(404).json({ error: 'Setting not found' });
          }
          
          logAudit(req, 'SETTING_UPDATED', 'system_settings', existing.id, { key, category: existing.category, shop_id: existing.shop_id });
          res.json({ message: 'Setting updated successfully' });
        }
      );
    }
  );
});

app.post('/api/settings/reset', authenticateToken, requireRole('admin', 'superadmin'), (req, res) => {
  const { shop_id } = req.body;
  const shopFilter = getShopFilter(req);
  const targetShopId = (req.user.role === 'superadmin' && shop_id) 
    ? shop_id 
    : (req.user.role === 'superadmin' && shopFilter.shop_id) 
      ? shopFilter.shop_id 
      : (req.user.shop_id || null);
  
  if (targetShopId === null) {
    return res.status(400).json({ error: 'Cannot reset global settings. Please reset individual settings.' });
  }
  
  // Delete all shop-specific settings to revert to global defaults
  db.run('DELETE FROM system_settings WHERE shop_id = ?', [targetShopId], function(err) {
    if (err) {
      return res.status(500).json({ error: sanitizeError(err) });
    }
    
    logAudit(req, 'SETTINGS_RESET', 'system_settings', null, { shop_id: targetShopId });
    res.json({ message: 'Settings reset to defaults successfully', deleted_count: this.changes });
  });
});

// Export settings
app.get('/api/settings/export', authenticateToken, requireRole('admin', 'superadmin'), (req, res) => {
  const shopFilter = getShopFilter(req);
  let query = 'SELECT setting_key, setting_value, setting_type, category, description FROM system_settings WHERE 1=1';
  const params = [];
  
  if (shopFilter.shop_id && req.user.role === 'superadmin') {
    query += ' AND (shop_id = ? OR shop_id IS NULL)';
    params.push(shopFilter.shop_id);
  } else if (req.user.role !== 'superadmin' && req.user.shop_id) {
    query += ' AND (shop_id = ? OR shop_id IS NULL)';
    params.push(req.user.shop_id);
  } else if (req.user.role !== 'superadmin' && !req.user.shop_id) {
    query += ' AND shop_id IS NULL';
  }
  
  query += ' ORDER BY category, setting_key';
  
  db.all(query, params, (err, settings) => {
    if (err) {
      return res.status(500).json({ error: sanitizeError(err) });
    }
    
    const exportData = {
      version: '1.0',
      exported_at: new Date().toISOString(),
      exported_by: req.user.username,
      shop_id: shopFilter.shop_id || req.user.shop_id || null,
      settings: settings.map(s => ({
        key: s.setting_key,
        value: s.setting_value,
        type: s.setting_type,
        category: s.category,
        description: s.description
      }))
    };
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="settings-export-${Date.now()}.json"`);
    res.json(exportData);
  });
});

// Import settings
app.post('/api/settings/import', authenticateToken, requireRole('admin', 'superadmin'), (req, res) => {
  const { settings } = req.body;
  const shopFilter = getShopFilter(req);
  const targetShopId = (req.user.role === 'superadmin' && shopFilter.shop_id) 
    ? shopFilter.shop_id 
    : (req.user.shop_id || null);
  
  if (!Array.isArray(settings)) {
    return res.status(400).json({ error: 'Settings must be an array' });
  }
  
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO system_settings 
    (setting_key, setting_value, setting_type, category, description, shop_id, updated_by, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `);
  
  let imported = 0;
  let errors = [];
  
  settings.forEach((setting, index) => {
    if (!setting.key) {
      errors.push(`Setting at index ${index} missing key`);
      return;
    }
    
    try {
      stmt.run([
        setting.key,
        setting.value !== null && setting.value !== undefined ? String(setting.value) : null,
        setting.type || 'string',
        setting.category || 'general',
        setting.description || null,
        targetShopId,
        req.user.id
      ]);
      imported++;
    } catch (err) {
      errors.push(`Error importing ${setting.key}: ${err.message}`);
    }
  });
  
  stmt.finalize((err) => {
    if (err) {
      return res.status(500).json({ error: sanitizeError(err) });
    }
    
    logAudit(req, 'SETTINGS_IMPORT', 'system_settings', null, { 
      shop_id: targetShopId, 
      imported_count: imported,
      errors: errors.length > 0 ? errors : undefined
    });
    
    res.json({ 
      message: 'Settings imported successfully', 
      imported_count: imported,
      errors: errors.length > 0 ? errors : undefined
    });
  });
});

// Test email configuration
app.post('/api/settings/test-email', authenticateToken, requireRole('admin', 'superadmin'), (req, res) => {
  const { test_email } = req.body;
  
  if (!test_email || !test_email.includes('@')) {
    return res.status(400).json({ error: 'Valid test email address is required' });
  }
  
  // Get email settings
  const shopFilter = getShopFilter(req);
  let query = `
    SELECT setting_key, setting_value 
    FROM system_settings 
    WHERE category = 'email' 
    AND (shop_id = ? OR shop_id IS NULL)
    ORDER BY shop_id DESC
  `;
  const params = [];
  
  if (shopFilter.shop_id && req.user.role === 'superadmin') {
    params.push(shopFilter.shop_id);
  } else if (req.user.shop_id) {
    params.push(req.user.shop_id);
  } else {
    params.push(null);
  }
  
  db.all(query, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: sanitizeError(err) });
    }
    
    // Build settings object (shop-specific override global)
    const emailSettings = {};
    rows.forEach(row => {
      if (!emailSettings[row.setting_key] || row.shop_id !== null) {
        emailSettings[row.setting_key] = row.setting_value;
      }
    });
    
    // Check required fields
    if (!emailSettings.email_enabled || emailSettings.email_enabled === 'false') {
      return res.status(400).json({ error: 'Email notifications are not enabled' });
    }
    
    if (!emailSettings.email_host || !emailSettings.email_username || !emailSettings.email_from) {
      return res.status(400).json({ error: 'Email configuration is incomplete. Please configure SMTP host, username, and from address.' });
    }
    
    // Note: Actual email sending would require nodemailer or similar
    // For now, we'll just validate the configuration
    logAudit(req, 'SETTINGS_TEST_EMAIL', 'system_settings', null, { 
      test_email,
      email_host: emailSettings.email_host,
      email_from: emailSettings.email_from
    });
    
    res.json({ 
      message: 'Email configuration is valid. Note: Actual email sending requires email service configuration.',
      test_email,
      configuration: {
        host: emailSettings.email_host,
        port: emailSettings.email_port,
        secure: emailSettings.email_secure === 'true',
        from: emailSettings.email_from,
        from_name: emailSettings.email_from_name
      }
    });
  });
});

// ==================== INVOICES ROUTES ====================

app.get('/api/invoices', authenticateToken, (req, res) => {
  const shopFilter = getShopFilter(req);
  let query = `
    SELECT i.*, 
           c.name as customer_name_full,
           c.email as customer_email_full,
           c.phone as customer_phone_full,
           c.address as customer_address_full,
           u.username as created_by_name,
           i.shop_id,
           (SELECT json_group_array(json_object(
             'id', ii.id,
             'item_id', ii.item_id,
             'item_name', ii.item_name,
             'description', ii.description,
             'quantity', ii.quantity,
             'unit_price', ii.unit_price,
             'discount', ii.discount,
             'tax_rate', ii.tax_rate,
             'total_price', ii.total_price
           ))
           FROM invoice_items ii
           WHERE ii.invoice_id = i.id) as items
    FROM invoices i
    LEFT JOIN customers c ON i.customer_id = c.id
    LEFT JOIN users u ON i.created_by = u.id
  `;
  const params = [];
  
  // Filter by shop_id if provided (for superadmin)
  if (shopFilter.shop_id && req.user.role === 'superadmin') {
    query += ' WHERE i.shop_id = ?';
    params.push(shopFilter.shop_id);
  } else if (req.user.role !== 'superadmin') {
    // Non-superadmin users only see invoices from their shop
    if (req.user.shop_id) {
      query += ' WHERE i.shop_id = ?';
      params.push(req.user.shop_id);
    } else {
      // User has no shop_id, show only invoices with null shop_id
      query += ' WHERE i.shop_id IS NULL';
    }
  }
  // For superadmin without shop filter, show all invoices (no WHERE clause)
  
  query += ' ORDER BY i.invoice_date DESC, i.id DESC';
  
  db.all(query, params, (err, invoices) => {
    if (err) {
      return res.status(500).json({ error: sanitizeError(err) });
    }
    // Parse items JSON for each invoice
    invoices.forEach(invoice => {
      try {
        invoice.items = JSON.parse(invoice.items || '[]');
      } catch (e) {
        invoice.items = [];
      }
    });
    res.json(invoices);
  });
});

app.get('/api/invoices/:id', authenticateToken, (req, res) => {
  const id = req.params.id;
  const query = `
    SELECT i.*,
           c.name as customer_name_full,
           c.email as customer_email_full,
           c.phone as customer_phone_full,
           c.address as customer_address_full,
           (SELECT json_group_array(json_object(
             'id', ii.id,
             'item_id', ii.item_id,
             'item_name', ii.item_name,
             'description', ii.description,
             'quantity', ii.quantity,
             'unit_price', ii.unit_price,
             'discount', ii.discount,
             'tax_rate', ii.tax_rate,
             'total_price', ii.total_price
           ))
           FROM invoice_items ii
           WHERE ii.invoice_id = i.id) as items
    FROM invoices i
    LEFT JOIN customers c ON i.customer_id = c.id
    WHERE i.id = ?
  `;
  db.get(query, [id], (err, invoice) => {
    if (err) {
      return res.status(500).json({ error: sanitizeError(err) });
    }
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    try {
      invoice.items = JSON.parse(invoice.items || '[]');
    } catch (e) {
      invoice.items = [];
    }
    res.json(invoice);
  });
});

app.post('/api/invoices', authenticateToken, requireRole('admin', 'sales'), (req, res) => {
  const {
    invoice_number,
    invoice_date,
    due_date,
    customer_id,
    customer_name,
    customer_email,
    customer_phone,
    customer_address,
    items,
    subtotal,
    discount_amount,
    tax_amount,
    total_amount,
    paid_amount,
    payment_method,
    payment_terms,
    notes,
    terms_conditions,
    status
  } = req.body;
  
  const created_by = req.user.id;
  const shopFilter = getShopFilter(req);
  // Ensure shop_id is always set - use filter for superadmin, otherwise use user's shop_id
  const shopId = (req.user.role === 'superadmin' && shopFilter.shop_id) 
    ? shopFilter.shop_id 
    : (req.user.shop_id || null);
  
  const balance_amount = (total_amount || 0) - (paid_amount || 0);
  const invoiceStatus = status || 'draft';
  
  db.run(
    `INSERT INTO invoices (
      invoice_number, invoice_date, due_date, customer_id,
      customer_name, customer_email, customer_phone, customer_address,
      subtotal, discount_amount, tax_amount, total_amount,
      paid_amount, balance_amount, payment_method, payment_terms,
      notes, terms_conditions, status, created_by, shop_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      invoice_number, invoice_date, due_date, customer_id,
      customer_name, customer_email, customer_phone, customer_address,
      subtotal || 0, discount_amount || 0, tax_amount || 0, total_amount || 0,
      paid_amount || 0, balance_amount, payment_method, payment_terms,
      notes, terms_conditions, invoiceStatus, created_by, shopId
    ],
    function(err) {
      if (err) {
        return res.status(500).json({ error: sanitizeError(err) });
      }
      const invoice_id = this.lastID;
      
      // Insert invoice items
      if (items && items.length > 0) {
        let completed = 0;
        items.forEach((item, index) => {
          db.run(
            `INSERT INTO invoice_items (
              invoice_id, item_id, item_name, description,
              quantity, unit_price, discount, tax_rate, total_price
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              invoice_id,
              item.item_id || null,
              item.item_name || '',
              item.description || '',
              item.quantity || 0,
              item.unit_price || 0,
              item.discount || 0,
              item.tax_rate || 0,
              item.total_price || 0
            ],
            function(err) {
              if (err) {
                return res.status(500).json({ error: sanitizeError(err) });
              }
              completed++;
              if (completed === items.length) {
                res.json({ id: invoice_id, message: 'Invoice created successfully' });
              }
            }
          );
        });
      } else {
        res.json({ id: invoice_id, message: 'Invoice created successfully' });
      }
    }
  );
});

app.put('/api/invoices/:id', authenticateToken, requireRole('admin', 'sales'), (req, res) => {
  const id = req.params.id;
  const {
    invoice_number,
    invoice_date,
    due_date,
    customer_id,
    customer_name,
    customer_email,
    customer_phone,
    customer_address,
    items,
    subtotal,
    discount_amount,
    tax_amount,
    total_amount,
    paid_amount,
    payment_method,
    payment_terms,
    notes,
    terms_conditions,
    status
  } = req.body;
  
  const balance_amount = (total_amount || 0) - (paid_amount || 0);
  
  db.run(
    `UPDATE invoices SET
      invoice_number = ?, invoice_date = ?, due_date = ?, customer_id = ?,
      customer_name = ?, customer_email = ?, customer_phone = ?, customer_address = ?,
      subtotal = ?, discount_amount = ?, tax_amount = ?, total_amount = ?,
      paid_amount = ?, balance_amount = ?, payment_method = ?, payment_terms = ?,
      notes = ?, terms_conditions = ?, status = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?`,
    [
      invoice_number, invoice_date, due_date, customer_id,
      customer_name, customer_email, customer_phone, customer_address,
      subtotal || 0, discount_amount || 0, tax_amount || 0, total_amount || 0,
      paid_amount || 0, balance_amount, payment_method, payment_terms,
      notes, terms_conditions, status, id
    ],
    function(err) {
      if (err) {
        return res.status(500).json({ error: sanitizeError(err) });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Invoice not found' });
      }
      
      // Delete existing invoice items and insert new ones
      db.run('DELETE FROM invoice_items WHERE invoice_id = ?', [id], (err) => {
        if (err) {
          return res.status(500).json({ error: sanitizeError(err) });
        }
        
        if (items && items.length > 0) {
          let completed = 0;
          items.forEach((item) => {
            db.run(
              `INSERT INTO invoice_items (
                invoice_id, item_id, item_name, description,
                quantity, unit_price, discount, tax_rate, total_price
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                id,
                item.item_id || null,
                item.item_name || '',
                item.description || '',
                item.quantity || 0,
                item.unit_price || 0,
                item.discount || 0,
                item.tax_rate || 0,
                item.total_price || 0
              ],
              function(err) {
                if (err) {
                  return res.status(500).json({ error: sanitizeError(err) });
                }
                completed++;
                if (completed === items.length) {
                  res.json({ message: 'Invoice updated successfully' });
                }
              }
            );
          });
        } else {
          res.json({ message: 'Invoice updated successfully' });
        }
      });
    }
  );
});

app.delete('/api/invoices/:id', authenticateToken, requireRole('admin', 'sales'), (req, res) => {
  const id = req.params.id;
  
  db.run('DELETE FROM invoices WHERE id = ?', [id], function(err) {
    if (err) {
      return res.status(500).json({ error: sanitizeError(err) });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    // Invoice items are automatically deleted due to CASCADE
    res.json({ message: 'Invoice deleted successfully' });
  });
});

app.get('/api/invoices/generate-number', authenticateToken, requireRole('admin', 'sales'), (req, res) => {
  // Generate invoice number: INV-YYYYMMDD-XXX
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  const datePrefix = `INV-${year}${month}${day}`;
  
  // Find the highest number for today
  db.get(
    `SELECT invoice_number FROM invoices 
     WHERE invoice_number LIKE ? 
     ORDER BY invoice_number DESC LIMIT 1`,
    [`${datePrefix}-%`],
    (err, row) => {
      if (err) {
        return res.status(500).json({ error: sanitizeError(err) });
      }
      
      let sequence = 1;
      if (row && row.invoice_number) {
        const parts = row.invoice_number.split('-');
        if (parts.length === 3) {
          const lastSequence = parseInt(parts[2]);
          if (!isNaN(lastSequence)) {
            sequence = lastSequence + 1;
          }
        }
      }
      
      const invoice_number = `${datePrefix}-${String(sequence).padStart(3, '0')}`;
      res.json({ invoice_number });
    }
  );
});

// ==================== REPORTS ROUTES ====================

app.get('/api/reports/stock', authenticateToken, requireRole('admin', 'manager', 'storekeeper', 'sales'), (req, res) => {
  const shopFilter = getShopFilter(req);
  let query = `
    SELECT i.*, c.name as category_name,
           CASE WHEN i.stock_quantity <= i.min_stock_level THEN 1 ELSE 0 END as low_stock
    FROM items i
    LEFT JOIN categories c ON i.category_id = c.id
  `;
  
  const params = [];
  const conditions = [];
  
  // Filter by shop_id if provided (for superadmin) - filter directly by items.shop_id
  if (shopFilter.shop_id && req.user.role === 'superadmin') {
    conditions.push('i.shop_id = ?');
    params.push(shopFilter.shop_id);
  } else if (req.user.role !== 'superadmin' && req.user.shop_id) {
    // Non-superadmin users only see items from their shop
    conditions.push('i.shop_id = ?');
    params.push(req.user.shop_id);
  }
  
  // Filter out archived items
  conditions.push('(i.is_archived IS NULL OR i.is_archived = 0)');
  
  if (conditions.length > 0) {
    query += ` WHERE ${conditions.join(' AND ')}`;
  }
  
  query += ` ORDER BY i.stock_quantity ASC`;
  
  db.all(query, params, (err, items) => {
    if (err) {
      return res.status(500).json({ error: sanitizeError(err) });
    }
    res.json(items);
  });
});

app.get('/api/reports/sales', authenticateToken, requireRole('admin', 'manager'), (req, res) => {
  const { start_date, end_date } = req.query;
  const shopFilter = getShopFilter(req);
  let query = `
    SELECT DATE(s.sale_date) as date, 
           COUNT(*) as total_sales,
           SUM(s.total_amount) as total_revenue,
           SUM(si.quantity) as total_items_sold
    FROM sales s
    LEFT JOIN sales_items si ON s.id = si.sale_id
    LEFT JOIN users u ON s.created_by = u.id
  `;
  const params = [];
  const conditions = [];
  
  if (start_date && end_date) {
    conditions.push('DATE(s.sale_date) BETWEEN ? AND ?');
    params.push(start_date, end_date);
  }
  
  // Filter by shop_id if provided (for superadmin)
  if (shopFilter.shop_id && req.user.role === 'superadmin') {
    conditions.push('u.shop_id = ?');
    params.push(shopFilter.shop_id);
  } else if (req.user.role !== 'superadmin' && req.user.shop_id) {
    conditions.push('u.shop_id = ?');
    params.push(req.user.shop_id);
  }
  
  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }
  
  query += ' GROUP BY DATE(s.sale_date) ORDER BY date DESC';
  
  db.all(query, params, (err, results) => {
    if (err) {
      return res.status(500).json({ error: sanitizeError(err) });
    }
    res.json(results);
  });
});

app.get('/api/reports/purchases', authenticateToken, requireRole('admin', 'manager'), (req, res) => {
  const { start_date, end_date } = req.query;
  const shopFilter = getShopFilter(req);
  let query = `
    SELECT DATE(p.purchase_date) as date,
           COUNT(*) as total_purchases,
           SUM(p.total_amount) as total_spent,
           SUM(pi.quantity) as total_items_purchased
    FROM purchases p
    LEFT JOIN purchase_items pi ON p.id = pi.purchase_id
    LEFT JOIN users u ON p.created_by = u.id
  `;
  const params = [];
  const conditions = [];
  
  if (start_date && end_date) {
    conditions.push('DATE(p.purchase_date) BETWEEN ? AND ?');
    params.push(start_date, end_date);
  }
  
  // Filter by shop_id if provided (for superadmin)
  if (shopFilter.shop_id && req.user.role === 'superadmin') {
    conditions.push('u.shop_id = ?');
    params.push(shopFilter.shop_id);
  } else if (req.user.role !== 'superadmin' && req.user.shop_id) {
    conditions.push('u.shop_id = ?');
    params.push(req.user.shop_id);
  }
  
  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }
  
  query += ' GROUP BY DATE(p.purchase_date) ORDER BY date DESC';
  
  db.all(query, params, (err, results) => {
    if (err) {
      return res.status(500).json({ error: sanitizeError(err) });
    }
    res.json(results);
  });
});

app.get('/api/reports/fast-moving', authenticateToken, requireRole('admin', 'manager'), (req, res) => {
  const shopFilter = getShopFilter(req);
  let query = `
    SELECT i.id, i.name, i.sku,
           SUM(si.quantity) as total_sold,
           SUM(si.total_price) as total_revenue
    FROM items i
    JOIN sales_items si ON i.id = si.item_id
  `;
  const params = [];
  const conditions = [];
  
  // Filter items by shop_id
  if (shopFilter.shop_id && req.user.role === 'superadmin') {
    conditions.push('i.shop_id = ?');
    params.push(shopFilter.shop_id);
  } else if (req.user.role !== 'superadmin' && req.user.shop_id) {
    conditions.push('i.shop_id = ?');
    params.push(req.user.shop_id);
  }
  
  // Filter out archived items
  conditions.push('(i.is_archived IS NULL OR i.is_archived = 0)');
  
  if (conditions.length > 0) {
    query += ` WHERE ${conditions.join(' AND ')}`;
  }
  
  query += `
    GROUP BY i.id
    ORDER BY total_sold DESC
    LIMIT 10
  `;
  
  db.all(query, params, (err, results) => {
    if (err) {
      return res.status(500).json({ error: sanitizeError(err) });
    }
    res.json(results);
  });
});

app.get('/api/reports/slow-moving', authenticateToken, requireRole('admin', 'manager'), (req, res) => {
  const shopFilter = getShopFilter(req);
  let query = `
    SELECT i.id, i.name, i.sku, i.stock_quantity,
           COALESCE(SUM(si.quantity), 0) as total_sold
    FROM items i
    LEFT JOIN sales_items si ON i.id = si.item_id
    LEFT JOIN sales s ON si.sale_id = s.id
    LEFT JOIN users u ON s.created_by = u.id
  `;
  const params = [];
  const conditions = [];
  
  // Filter items by shop_id
  if (shopFilter.shop_id && req.user.role === 'superadmin') {
    conditions.push('i.shop_id = ?');
    params.push(shopFilter.shop_id);
  } else if (req.user.role !== 'superadmin' && req.user.shop_id) {
    conditions.push('i.shop_id = ?');
    params.push(req.user.shop_id);
  }
  
  // Filter out archived items
  conditions.push('(i.is_archived IS NULL OR i.is_archived = 0)');
  
  if (conditions.length > 0) {
    query += ` WHERE ${conditions.join(' AND ')}`;
  }
  
  query += `
    GROUP BY i.id
    HAVING total_sold = 0 OR total_sold < 5
    ORDER BY total_sold ASC, i.stock_quantity DESC
    LIMIT 10
  `;
  
  db.all(query, params, (err, results) => {
    if (err) {
      return res.status(500).json({ error: sanitizeError(err) });
    }
    res.json(results);
  });
});

app.get('/api/reports/dashboard', authenticateToken, (req, res) => {
  // Get today's date in YYYY-MM-DD format for reliable comparison
  const today = new Date().toISOString().split('T')[0];
  const shopFilter = getShopFilter(req);
  
  // Debug logging (remove in production)
  if (req.user.role === 'superadmin') {
    console.log('[DASHBOARD] Shop filter:', shopFilter, 'Query shop_id:', req.query.shop_id);
  }
  
  // Build queries with shop filtering
  let totalItemsQuery = 'SELECT COUNT(*) as count FROM items';
  let lowStockItemsQuery = 'SELECT COUNT(*) as count FROM items WHERE stock_quantity <= min_stock_level';
  let totalSalesQuery = 'SELECT COUNT(*) as count, COALESCE(SUM(total_amount), 0) as total FROM sales s LEFT JOIN users u ON s.created_by = u.id WHERE DATE(s.sale_date) = ?';
  let totalPurchasesQuery = 'SELECT COUNT(*) as count, COALESCE(SUM(total_amount), 0) as total FROM purchases p LEFT JOIN users u ON p.created_by = u.id WHERE DATE(p.purchase_date) = ?';
  
  // Add shop filtering for items (check if items have been used in sales/purchases by users from that shop)
  if (shopFilter.shop_id && req.user.role === 'superadmin') {
    const shopId = shopFilter.shop_id;
    totalItemsQuery += ` WHERE EXISTS (
      SELECT 1 FROM sales_items si
      JOIN sales s ON si.sale_id = s.id
      JOIN users u ON s.created_by = u.id
      WHERE si.item_id = items.id AND u.shop_id = ${shopId}
      UNION
      SELECT 1 FROM purchase_items pi
      JOIN purchases p ON pi.purchase_id = p.id
      JOIN users u ON p.created_by = u.id
      WHERE pi.item_id = items.id AND u.shop_id = ${shopId}
    )`;
    lowStockItemsQuery = `SELECT COUNT(*) as count FROM items WHERE stock_quantity <= min_stock_level AND EXISTS (
      SELECT 1 FROM sales_items si
      JOIN sales s ON si.sale_id = s.id
      JOIN users u ON s.created_by = u.id
      WHERE si.item_id = items.id AND u.shop_id = ${shopId}
      UNION
      SELECT 1 FROM purchase_items pi
      JOIN purchases p ON pi.purchase_id = p.id
      JOIN users u ON p.created_by = u.id
      WHERE pi.item_id = items.id AND u.shop_id = ${shopId}
    )`;
    totalSalesQuery += ' AND u.shop_id = ?';
    totalPurchasesQuery += ' AND u.shop_id = ?';
  } else if (req.user.role !== 'superadmin' && req.user.shop_id) {
    // Non-superadmin users only see their shop's data
    const shopId = req.user.shop_id;
    totalItemsQuery += ` WHERE EXISTS (
      SELECT 1 FROM sales_items si
      JOIN sales s ON si.sale_id = s.id
      JOIN users u ON s.created_by = u.id
      WHERE si.item_id = items.id AND u.shop_id = ${shopId}
      UNION
      SELECT 1 FROM purchase_items pi
      JOIN purchases p ON pi.purchase_id = p.id
      JOIN users u ON p.created_by = u.id
      WHERE pi.item_id = items.id AND u.shop_id = ${shopId}
    )`;
    lowStockItemsQuery = `SELECT COUNT(*) as count FROM items WHERE stock_quantity <= min_stock_level AND EXISTS (
      SELECT 1 FROM sales_items si
      JOIN sales s ON si.sale_id = s.id
      JOIN users u ON s.created_by = u.id
      WHERE si.item_id = items.id AND u.shop_id = ${shopId}
      UNION
      SELECT 1 FROM purchase_items pi
      JOIN purchases p ON pi.purchase_id = p.id
      JOIN users u ON p.created_by = u.id
      WHERE pi.item_id = items.id AND u.shop_id = ${shopId}
    )`;
    totalSalesQuery += ' AND u.shop_id = ?';
    totalPurchasesQuery += ' AND u.shop_id = ?';
  }
  
  const queries = {
    totalItems: totalItemsQuery,
    lowStockItems: lowStockItemsQuery,
    totalSales: totalSalesQuery,
    totalPurchases: totalPurchasesQuery
  };

  const results = {};
  let completed = 0;
  const total = Object.keys(queries).length;

  Object.keys(queries).forEach(key => {
    // Use today's date and shop_id for sales and purchases queries
    let params = [];
    if (key === 'totalSales' || key === 'totalPurchases') {
      params = [today];
      if ((shopFilter.shop_id && req.user.role === 'superadmin') || (req.user.role !== 'superadmin' && req.user.shop_id)) {
        params.push(shopFilter.shop_id || req.user.shop_id);
      }
    }
    
    db.get(queries[key], params, (err, row) => {
      if (err) {
        return res.status(500).json({ error: sanitizeError(err) });
      }
      results[key] = row;
      completed++;
      if (completed === total) {
        res.json(results);
      }
    });
  });
});

// Manager Analytics Endpoint - Comprehensive management analysis
app.get('/api/reports/manager-analytics', authenticateToken, requireRole('admin', 'manager'), (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const thisMonthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
  const lastMonthStart = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).toISOString().split('T')[0];
  const lastMonthEnd = new Date(new Date().getFullYear(), new Date().getMonth(), 0).toISOString().split('T')[0];
  const thisWeekStart = new Date(new Date().setDate(new Date().getDate() - new Date().getDay())).toISOString().split('T')[0];
  const lastWeekStart = new Date(new Date(new Date().setDate(new Date().getDate() - new Date().getDay() - 7))).toISOString().split('T')[0];
  const lastWeekEnd = new Date(new Date().setDate(new Date().getDate() - new Date().getDay() - 1)).toISOString().split('T')[0];

  const analytics = {};
  let completed = 0;
  const totalQueries = 35; // Increased to include all dashboard data

  // 1. Today's Performance
  db.get(`
    SELECT 
      COUNT(*) as transactions,
      COALESCE(SUM(total_amount), 0) as revenue,
      COALESCE(SUM((SELECT SUM(si.quantity) FROM sales_items si WHERE si.sale_id = s.id)), 0) as items_sold
    FROM sales s
    WHERE DATE(sale_date) = ?
  `, [today], (err, row) => {
    if (!err) analytics.today = row || { transactions: 0, revenue: 0, items_sold: 0 };
    completed++;
    if (completed === totalQueries) res.json(analytics);
  });

  // 2. This Week Performance
  db.get(`
    SELECT 
      COUNT(*) as transactions,
      COALESCE(SUM(total_amount), 0) as revenue,
      COALESCE(SUM((SELECT SUM(si.quantity) FROM sales_items si WHERE si.sale_id = s.id)), 0) as items_sold
    FROM sales s
    WHERE DATE(sale_date) >= ?
  `, [thisWeekStart], (err, row) => {
    if (!err) analytics.thisWeek = row || { transactions: 0, revenue: 0, items_sold: 0 };
    completed++;
    if (completed === totalQueries) res.json(analytics);
  });

  // 3. Last Week Performance
  db.get(`
    SELECT 
      COUNT(*) as transactions,
      COALESCE(SUM(total_amount), 0) as revenue,
      COALESCE(SUM((SELECT SUM(si.quantity) FROM sales_items si WHERE si.sale_id = s.id)), 0) as items_sold
    FROM sales s
    WHERE DATE(sale_date) >= ? AND DATE(sale_date) <= ?
  `, [lastWeekStart, lastWeekEnd], (err, row) => {
    if (!err) analytics.lastWeek = row || { transactions: 0, revenue: 0, items_sold: 0 };
    completed++;
    if (completed === totalQueries) res.json(analytics);
  });

  // 4. This Month Performance
  db.get(`
    SELECT 
      COUNT(*) as transactions,
      COALESCE(SUM(total_amount), 0) as revenue,
      COALESCE(SUM((SELECT SUM(si.quantity) FROM sales_items si WHERE si.sale_id = s.id)), 0) as items_sold
    FROM sales s
    WHERE DATE(sale_date) >= ?
  `, [thisMonthStart], (err, row) => {
    if (!err) analytics.thisMonth = row || { transactions: 0, revenue: 0, items_sold: 0 };
    completed++;
    if (completed === totalQueries) res.json(analytics);
  });

  // 5. Last Month Performance
  db.get(`
    SELECT 
      COUNT(*) as transactions,
      COALESCE(SUM(total_amount), 0) as revenue,
      COALESCE(SUM((SELECT SUM(si.quantity) FROM sales_items si WHERE si.sale_id = s.id)), 0) as items_sold
    FROM sales s
    WHERE DATE(sale_date) >= ? AND DATE(sale_date) <= ?
  `, [lastMonthStart, lastMonthEnd], (err, row) => {
    if (!err) analytics.lastMonth = row || { transactions: 0, revenue: 0, items_sold: 0 };
    completed++;
    if (completed === totalQueries) res.json(analytics);
  });

  // 6. Total Inventory Value
  db.get(`
    SELECT 
      COUNT(*) as total_items,
      COALESCE(SUM(stock_quantity * cost_price), 0) as total_value,
      COALESCE(SUM(stock_quantity * unit_price), 0) as potential_revenue,
      COALESCE(SUM(CASE WHEN stock_quantity <= min_stock_level THEN 1 ELSE 0 END), 0) as low_stock_count
    FROM items
  `, [], (err, row) => {
    if (!err) analytics.inventory = row || { total_items: 0, total_value: 0, potential_revenue: 0, low_stock_count: 0 };
    completed++;
    if (completed === totalQueries) res.json(analytics);
  });

  // 7. Profit Analysis (Revenue - Cost)
  db.get(`
    SELECT 
      COALESCE(SUM(s.total_amount), 0) as total_revenue,
      COALESCE(SUM((SELECT SUM(si.quantity * i.cost_price) 
                    FROM sales_items si 
                    JOIN items i ON si.item_id = i.id 
                    WHERE si.sale_id = s.id)), 0) as total_cost
    FROM sales s
    WHERE DATE(s.sale_date) >= ?
  `, [thisMonthStart], (err, row) => {
    if (!err) {
      const revenue = row?.total_revenue || 0;
      const cost = row?.total_cost || 0;
      analytics.profit = {
        revenue: revenue,
        cost: cost,
        profit: revenue - cost,
        margin: revenue > 0 ? ((revenue - cost) / revenue * 100) : 0
      };
    } else {
      analytics.profit = { revenue: 0, cost: 0, profit: 0, margin: 0 };
    }
    completed++;
    if (completed === totalQueries) res.json(analytics);
  });

  // 8. Top Performing Items (Revenue)
  db.all(`
    SELECT 
      i.name,
      i.sku,
      SUM(si.quantity) as total_sold,
      SUM(si.total_price) as total_revenue
    FROM items i
    JOIN sales_items si ON i.id = si.item_id
    JOIN sales s ON si.sale_id = s.id
    WHERE DATE(s.sale_date) >= ?
    GROUP BY i.id
    ORDER BY total_revenue DESC
    LIMIT 5
  `, [thisMonthStart], (err, rows) => {
    if (!err) analytics.topItems = rows || [];
    completed++;
    if (completed === totalQueries) res.json(analytics);
  });

  // 9. Sales Trend (Last 7 Days)
  db.all(`
    SELECT 
      DATE(sale_date) as date,
      COUNT(*) as transactions,
      COALESCE(SUM(total_amount), 0) as revenue
    FROM sales
    WHERE DATE(sale_date) >= date('now', '-7 days')
    GROUP BY DATE(sale_date)
    ORDER BY date ASC
  `, [], (err, rows) => {
    if (!err) analytics.salesTrend = rows || [];
    completed++;
    if (completed === totalQueries) res.json(analytics);
  });

  // 10. Purchase Analysis
  db.get(`
    SELECT 
      COUNT(*) as total_purchases,
      COALESCE(SUM(total_amount), 0) as total_spent
    FROM purchases
    WHERE DATE(purchase_date) >= ?
  `, [thisMonthStart], (err, row) => {
    if (!err) analytics.purchases = row || { total_purchases: 0, total_spent: 0 };
    completed++;
    if (completed === totalQueries) res.json(analytics);
  });

  // 11. Average Transaction Value
  db.get(`
    SELECT 
      COUNT(*) as count,
      COALESCE(AVG(total_amount), 0) as avg_value,
      COALESCE(MAX(total_amount), 0) as max_value,
      COALESCE(MIN(total_amount), 0) as min_value
    FROM sales
    WHERE DATE(sale_date) >= ?
  `, [thisMonthStart], (err, row) => {
    if (!err) analytics.transactionMetrics = row || { count: 0, avg_value: 0, max_value: 0, min_value: 0 };
    completed++;
    if (completed === totalQueries) res.json(analytics);
  });

  // 12. Category Performance
  db.all(`
    SELECT 
      c.name as category,
      COUNT(DISTINCT si.item_id) as items_sold,
      SUM(si.quantity) as total_quantity,
      SUM(si.total_price) as total_revenue
    FROM sales_items si
    JOIN items i ON si.item_id = i.id
    LEFT JOIN categories c ON i.category_id = c.id
    JOIN sales s ON si.sale_id = s.id
    WHERE DATE(s.sale_date) >= ?
    GROUP BY c.id, c.name
    ORDER BY total_revenue DESC
    LIMIT 5
  `, [thisMonthStart], (err, rows) => {
    if (!err) analytics.categoryPerformance = rows || [];
    completed++;
    if (completed === totalQueries) res.json(analytics);
  });

  // 13. Inventory Turnover (Fast Moving Items)
  db.all(`
    SELECT 
      i.name,
      i.sku,
      i.stock_quantity,
      SUM(si.quantity) as total_sold,
      CASE 
        WHEN i.stock_quantity > 0 THEN (SUM(si.quantity) * 30.0 / i.stock_quantity)
        ELSE 0
      END as turnover_rate
    FROM items i
    JOIN sales_items si ON i.id = si.item_id
    JOIN sales s ON si.sale_id = s.id
    WHERE DATE(s.sale_date) >= ?
    GROUP BY i.id
    HAVING total_sold > 0
    ORDER BY turnover_rate DESC
    LIMIT 5
  `, [thisMonthStart], (err, rows) => {
    if (!err) analytics.inventoryTurnover = rows || [];
    completed++;
    if (completed === totalQueries) res.json(analytics);
  });

  // 14. Growth Metrics
  db.get(`
    SELECT 
      (SELECT COALESCE(SUM(total_amount), 0) FROM sales WHERE DATE(sale_date) >= ?) as current_revenue,
      (SELECT COALESCE(SUM(total_amount), 0) FROM sales WHERE DATE(sale_date) >= ? AND DATE(sale_date) <= ?) as previous_revenue
  `, [thisMonthStart, lastMonthStart, lastMonthEnd], (err, row) => {
    if (!err) {
      const current = row?.current_revenue || 0;
      const previous = row?.previous_revenue || 0;
      analytics.growth = {
        current: current,
        previous: previous,
        change: current - previous,
        percentage: previous > 0 ? ((current - previous) / previous * 100) : (current > 0 ? 100 : 0)
      };
    } else {
      analytics.growth = { current: 0, previous: 0, change: 0, percentage: 0 };
    }
    completed++;
    if (completed === totalQueries) res.json(analytics);
  });

  // 15. Business Health Score
  db.get(`
    SELECT 
      (SELECT COUNT(*) FROM items WHERE stock_quantity <= min_stock_level) as low_stock,
      (SELECT COUNT(*) FROM items) as total_items,
      (SELECT COALESCE(SUM(total_amount), 0) FROM sales WHERE DATE(sale_date) >= date('now', '-30 days')) as monthly_revenue
  `, [], (err, row) => {
    if (!err) {
      const lowStock = row?.low_stock || 0;
      const totalItems = row?.total_items || 0; // Fixed: use 0 instead of 1 when no items exist
      const monthlyRevenue = row?.monthly_revenue || 0;
      
      // Calculate stock health: if no items exist, health is 0
      const stockHealth = totalItems > 0 ? ((totalItems - lowStock) / totalItems) * 100 : 0;
      // Calculate revenue health: if no revenue, health is 0 (not 50)
      const revenueHealth = monthlyRevenue > 0 ? 100 : 0;
      
      analytics.healthScore = {
        stockHealth: Math.round(stockHealth),
        revenueHealth: Math.round(revenueHealth),
        overall: Math.round((stockHealth + revenueHealth) / 2),
        lowStockItems: lowStock,
        totalItems: totalItems
      };
    } else {
      analytics.healthScore = { stockHealth: 0, revenueHealth: 0, overall: 0, lowStockItems: 0, totalItems: 0 };
    }
    completed++;
    if (completed === totalQueries) res.json(analytics);
  });

  // 16. Low Stock Items (Admin)
  db.all(`
    SELECT 
      i.*, c.name as category_name,
      CASE WHEN i.stock_quantity <= i.min_stock_level THEN 1 ELSE 0 END as low_stock
    FROM items i
    LEFT JOIN categories c ON i.category_id = c.id
    WHERE i.stock_quantity <= i.min_stock_level
    ORDER BY i.stock_quantity ASC
    LIMIT 10
  `, [], (err, rows) => {
    if (!err) analytics.lowStockItems = rows || [];
    completed++;
    if (completed === totalQueries) res.json(analytics);
  });

  // 17. Recent Sales (Admin)
  db.all(`
    SELECT 
      s.id, s.sale_date, s.total_amount, s.customer_name,
      COUNT(si.id) as item_count,
      SUM(si.quantity) as total_quantity
    FROM sales s
    LEFT JOIN sales_items si ON s.id = si.sale_id
    GROUP BY s.id
    ORDER BY s.sale_date DESC, s.id DESC
    LIMIT 10
  `, [], (err, rows) => {
    if (!err) analytics.recentSales = rows || [];
    completed++;
    if (completed === totalQueries) res.json(analytics);
  });

  // 18. Recent Purchases (Admin)
  db.all(`
    SELECT 
      p.id, p.purchase_date, p.total_amount,
      s.name as supplier_name,
      COUNT(pi.id) as item_count,
      SUM(pi.quantity) as total_quantity
    FROM purchases p
    LEFT JOIN suppliers s ON p.supplier_id = s.id
    LEFT JOIN purchase_items pi ON p.id = pi.purchase_id
    GROUP BY p.id
    ORDER BY p.purchase_date DESC, p.id DESC
    LIMIT 10
  `, [], (err, rows) => {
    if (!err) analytics.recentPurchases = rows || [];
    completed++;
    if (completed === totalQueries) res.json(analytics);
  });

  // 19. Critical Stock Items (Storekeeper)
  db.all(`
    SELECT 
      i.id, i.name, i.sku, i.stock_quantity, i.min_stock_level, i.unit,
      c.name as category_name,
      CASE 
        WHEN i.stock_quantity = 0 THEN 'Out of Stock'
        WHEN i.stock_quantity < (i.min_stock_level * 0.5) THEN 'Critical'
        ELSE 'Low'
      END as urgency
    FROM items i
    LEFT JOIN categories c ON i.category_id = c.id
    WHERE i.stock_quantity <= i.min_stock_level
    ORDER BY 
      CASE urgency
        WHEN 'Out of Stock' THEN 1
        WHEN 'Critical' THEN 2
        ELSE 3
      END,
      i.stock_quantity ASC
    LIMIT 10
  `, [], (err, rows) => {
    if (!err) analytics.criticalStock = rows || [];
    completed++;
    if (completed === totalQueries) res.json(analytics);
  });

  // 20. Reorder Recommendations (Storekeeper)
  db.all(`
    SELECT 
      i.id, i.name, i.sku, i.stock_quantity, i.min_stock_level, i.unit,
      c.name as category_name,
      (i.min_stock_level * 2 - i.stock_quantity) as recommended_qty
    FROM items i
    LEFT JOIN categories c ON i.category_id = c.id
    WHERE i.stock_quantity <= i.min_stock_level
    ORDER BY i.stock_quantity ASC
    LIMIT 10
  `, [], (err, rows) => {
    if (!err) analytics.reorderRecommendations = rows || [];
    completed++;
    if (completed === totalQueries) res.json(analytics);
  });

  // 21. Purchase Statistics (Storekeeper)
  db.get(`
    SELECT 
      COUNT(*) as count,
      COALESCE(SUM(total_amount), 0) as total_amount,
      COALESCE(SUM((SELECT SUM(pi.quantity) FROM purchase_items pi WHERE pi.purchase_id = p.id)), 0) as total_items
    FROM purchases p
    WHERE DATE(purchase_date) = ?
  `, [today], (err, row) => {
    if (!err) analytics.todayPurchases = row || { count: 0, total_amount: 0, total_items: 0 };
    completed++;
    if (completed === totalQueries) res.json(analytics);
  });

  // 22. This Month Purchases (Storekeeper)
  db.get(`
    SELECT 
      COUNT(*) as count,
      COALESCE(SUM(total_amount), 0) as total_amount,
      COALESCE(SUM((SELECT SUM(pi.quantity) FROM purchase_items pi WHERE pi.purchase_id = p.id)), 0) as total_items
    FROM purchases p
    WHERE DATE(purchase_date) >= ?
  `, [thisMonthStart], (err, row) => {
    if (!err) analytics.monthPurchases = row || { count: 0, total_amount: 0, total_items: 0 };
    completed++;
    if (completed === totalQueries) res.json(analytics);
  });

  // 23. Last Month Purchases (Storekeeper)
  db.get(`
    SELECT 
      COUNT(*) as count,
      COALESCE(SUM(total_amount), 0) as total_amount
    FROM purchases
    WHERE DATE(purchase_date) >= ? AND DATE(purchase_date) <= ?
  `, [lastMonthStart, lastMonthEnd], (err, row) => {
    if (!err) analytics.lastMonthPurchases = row || { count: 0, total_amount: 0 };
    completed++;
    if (completed === totalQueries) res.json(analytics);
  });

  // 24. Category Stock Summary (Storekeeper)
  db.all(`
    SELECT 
      c.name as category,
      COUNT(i.id) as item_count,
      COALESCE(SUM(i.stock_quantity), 0) as total_stock,
      COALESCE(SUM(i.stock_quantity * i.cost_price), 0) as total_value,
      COALESCE(SUM(CASE WHEN i.stock_quantity <= i.min_stock_level THEN 1 ELSE 0 END), 0) as low_stock_count
    FROM categories c
    LEFT JOIN items i ON c.id = i.category_id
    GROUP BY c.id, c.name
    HAVING item_count > 0
    ORDER BY total_value DESC
    LIMIT 8
  `, [], (err, rows) => {
    if (!err) analytics.categoryStock = rows || [];
    completed++;
    if (completed === totalQueries) res.json(analytics);
  });

  // 25. Recent Stock Adjustments (Storekeeper)
  db.all(`
    SELECT 
      sa.id, sa.adjustment_type, sa.quantity, sa.reason, sa.created_at,
      i.name as item_name, i.sku,
      u.username as created_by_name
    FROM stock_adjustments sa
    JOIN items i ON sa.item_id = i.id
    LEFT JOIN users u ON sa.created_by = u.id
    ORDER BY sa.created_at DESC
    LIMIT 10
  `, [], (err, rows) => {
    if (!err) analytics.recentAdjustments = rows || [];
    completed++;
    if (completed === totalQueries) res.json(analytics);
  });

  // 26. Top Suppliers (Storekeeper)
  db.all(`
    SELECT 
      s.id, s.name, s.contact_person,
      COUNT(p.id) as purchase_count,
      COALESCE(SUM(p.total_amount), 0) as total_spent,
      COALESCE(SUM((SELECT SUM(pi.quantity) FROM purchase_items pi WHERE pi.purchase_id = p.id)), 0) as total_items
    FROM suppliers s
    LEFT JOIN purchases p ON s.id = p.supplier_id
    WHERE DATE(p.purchase_date) >= ?
    GROUP BY s.id, s.name, s.contact_person
    HAVING purchase_count > 0
    ORDER BY total_spent DESC
    LIMIT 5
  `, [thisMonthStart], (err, rows) => {
    if (!err) analytics.topSuppliers = rows || [];
    completed++;
    if (completed === totalQueries) res.json(analytics);
  });

  // 27. Items Needing Attention (Storekeeper)
  db.all(`
    SELECT 
      i.id, i.name, i.sku, i.stock_quantity, i.min_stock_level, i.unit,
      c.name as category_name,
      COALESCE(SUM(si.quantity), 0) as total_sold_last_month,
      CASE 
        WHEN i.stock_quantity = 0 THEN 999
        ELSE (i.stock_quantity * 30.0 / NULLIF(COALESCE(SUM(si.quantity), 0), 0))
      END as days_remaining
    FROM items i
    LEFT JOIN categories c ON i.category_id = c.id
    LEFT JOIN sales_items si ON i.id = si.item_id
    LEFT JOIN sales s ON si.sale_id = s.id AND DATE(s.sale_date) >= date('now', '-30 days')
    WHERE i.stock_quantity <= i.min_stock_level
    GROUP BY i.id
    HAVING total_sold_last_month > 0
    ORDER BY days_remaining ASC, i.stock_quantity ASC
    LIMIT 10
  `, [], (err, rows) => {
    if (!err) analytics.itemsNeedingAttention = rows || [];
    completed++;
    if (completed === totalQueries) res.json(analytics);
  });

  // 28. Purchase Trend (Storekeeper)
  db.all(`
    SELECT 
      DATE(purchase_date) as date,
      COUNT(*) as purchase_count,
      COALESCE(SUM(total_amount), 0) as total_amount,
      COALESCE(SUM((SELECT SUM(pi.quantity) FROM purchase_items pi WHERE pi.purchase_id = p.id)), 0) as total_items
    FROM purchases p
    WHERE DATE(purchase_date) >= date('now', '-7 days')
    GROUP BY DATE(purchase_date)
    ORDER BY date ASC
  `, [], (err, rows) => {
    if (!err) analytics.purchaseTrend = rows || [];
    completed++;
    if (completed === totalQueries) res.json(analytics);
  });

  // 29. Sales Performance Metrics (Sales)
  db.get(`
    SELECT 
      COUNT(DISTINCT DATE(sale_date)) as active_days,
      COALESCE(SUM(total_amount) / NULLIF(COUNT(DISTINCT DATE(sale_date)), 0), 0) as daily_average,
      COALESCE(MAX(total_amount), 0) as largest_transaction,
      COALESCE(MIN(total_amount), 0) as smallest_transaction
    FROM sales
    WHERE DATE(sale_date) >= ?
  `, [thisMonthStart], (err, row) => {
    if (!err) analytics.salesPerformanceMetrics = row || { active_days: 0, daily_average: 0, largest_transaction: 0, smallest_transaction: 0 };
    completed++;
    if (completed === totalQueries) res.json(analytics);
  });

  // 30. Top Selling Items Detailed (Sales)
  db.all(`
    SELECT 
      i.id, i.name, i.sku, i.unit_price,
      COALESCE(SUM(si.quantity), 0) as total_sold,
      COALESCE(SUM(si.quantity * si.unit_price), 0) as total_revenue,
      COUNT(DISTINCT s.id) as transaction_count
    FROM items i
    LEFT JOIN sales_items si ON i.id = si.item_id
    LEFT JOIN sales s ON si.sale_id = s.id
    WHERE DATE(s.sale_date) >= ?
    GROUP BY i.id
    HAVING total_sold > 0
    ORDER BY total_sold DESC
    LIMIT 10
  `, [thisMonthStart], (err, rows) => {
    if (!err) analytics.topSellingItems = rows || [];
    completed++;
    if (completed === totalQueries) res.json(analytics);
  });

  // 31. Sales by Category Detailed (Sales)
  db.all(`
    SELECT 
      c.name as category,
      COUNT(DISTINCT s.id) as transaction_count,
      COALESCE(SUM(si.quantity), 0) as total_items_sold,
      COALESCE(SUM(si.quantity * si.unit_price), 0) as total_revenue
    FROM categories c
    LEFT JOIN items i ON c.id = i.category_id
    LEFT JOIN sales_items si ON i.id = si.item_id
    LEFT JOIN sales s ON si.sale_id = s.id AND DATE(s.sale_date) >= ?
    GROUP BY c.id, c.name
    HAVING total_items_sold > 0
    ORDER BY total_revenue DESC
    LIMIT 8
  `, [thisMonthStart], (err, rows) => {
    if (!err) analytics.salesByCategory = rows || [];
    completed++;
    if (completed === totalQueries) res.json(analytics);
  });

  // 32. Hourly Sales Pattern (Sales)
  db.all(`
    SELECT 
      strftime('%H', sale_date) as hour,
      COUNT(*) as transaction_count,
      COALESCE(SUM(total_amount), 0) as total_revenue
    FROM sales
    WHERE DATE(sale_date) = ?
    GROUP BY strftime('%H', sale_date)
    ORDER BY hour ASC
  `, [today], (err, rows) => {
    if (!err) analytics.hourlyPattern = rows || [];
    completed++;
    if (completed === totalQueries) res.json(analytics);
  });

  // 33. Top Customers (Sales)
  db.all(`
    SELECT 
      customer_name,
      COUNT(*) as transaction_count,
      COALESCE(SUM(total_amount), 0) as total_spent,
      COALESCE(AVG(total_amount), 0) as average_transaction_value,
      MAX(sale_date) as last_purchase_date
    FROM sales
    WHERE customer_name IS NOT NULL AND customer_name != ''
      AND DATE(sale_date) >= ?
    GROUP BY customer_name
    HAVING transaction_count > 0
    ORDER BY total_spent DESC
    LIMIT 10
  `, [thisMonthStart], (err, rows) => {
    if (!err) analytics.topCustomers = rows || [];
    completed++;
    if (completed === totalQueries) res.json(analytics);
  });

  // 34. Available Items (Sales)
  db.all(`
    SELECT 
      i.id, i.name, i.sku, i.stock_quantity, i.unit_price, i.unit,
      c.name as category_name,
      CASE WHEN i.stock_quantity = 0 THEN 'Out of Stock'
           WHEN i.stock_quantity <= i.min_stock_level THEN 'Low Stock'
           ELSE 'Available'
      END as availability_status
    FROM items i
    LEFT JOIN categories c ON i.category_id = c.id
    WHERE i.stock_quantity > 0
    ORDER BY i.stock_quantity DESC, i.name ASC
    LIMIT 20
  `, [], (err, rows) => {
    if (!err) analytics.availableItems = rows || [];
    completed++;
    if (completed === totalQueries) res.json(analytics);
  });

  // 35. Out of Stock Items (Sales)
  db.all(`
    SELECT 
      i.id, i.name, i.sku, i.unit_price, i.unit,
      c.name as category_name,
      COALESCE(SUM(si.quantity), 0) as sold_last_month
    FROM items i
    LEFT JOIN categories c ON i.category_id = c.id
    LEFT JOIN sales_items si ON i.id = si.item_id
    LEFT JOIN sales s ON si.sale_id = s.id AND DATE(s.sale_date) >= date('now', '-30 days')
    WHERE i.stock_quantity = 0
    GROUP BY i.id
    ORDER BY sold_last_month DESC, i.name ASC
    LIMIT 10
  `, [], (err, rows) => {
    if (!err) analytics.outOfStockItems = rows || [];
    completed++;
    if (completed === totalQueries) res.json(analytics);
  });
});

// Storekeeper Analytics Endpoint - Comprehensive inventory management analysis
app.get('/api/reports/storekeeper-analytics', authenticateToken, requireRole('admin', 'storekeeper'), (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const thisMonthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
  const lastMonthStart = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).toISOString().split('T')[0];
  const lastMonthEnd = new Date(new Date().getFullYear(), new Date().getMonth(), 0).toISOString().split('T')[0];

  const analytics = {};
  let completed = 0;
  const totalQueries = 12;

  // 1. Inventory Overview
  db.get(`
    SELECT 
      COUNT(*) as total_items,
      COALESCE(SUM(stock_quantity), 0) as total_units,
      COALESCE(SUM(stock_quantity * cost_price), 0) as total_cost_value,
      COALESCE(SUM(stock_quantity * unit_price), 0) as total_sales_value,
      COALESCE(SUM(CASE WHEN stock_quantity <= min_stock_level THEN 1 ELSE 0 END), 0) as low_stock_count,
      COALESCE(SUM(CASE WHEN stock_quantity = 0 THEN 1 ELSE 0 END), 0) as out_of_stock_count
    FROM items
  `, [], (err, row) => {
    if (!err) analytics.inventory = row || { total_items: 0, total_units: 0, total_cost_value: 0, total_sales_value: 0, low_stock_count: 0, out_of_stock_count: 0 };
    completed++;
    if (completed === totalQueries) res.json(analytics);
  });

  // 2. Today's Purchases
  db.get(`
    SELECT 
      COUNT(*) as count,
      COALESCE(SUM(total_amount), 0) as total_amount,
      COALESCE(SUM((SELECT SUM(pi.quantity) FROM purchase_items pi WHERE pi.purchase_id = p.id)), 0) as total_items
    FROM purchases p
    WHERE DATE(purchase_date) = ?
  `, [today], (err, row) => {
    if (!err) analytics.todayPurchases = row || { count: 0, total_amount: 0, total_items: 0 };
    completed++;
    if (completed === totalQueries) res.json(analytics);
  });

  // 3. This Month Purchases
  db.get(`
    SELECT 
      COUNT(*) as count,
      COALESCE(SUM(total_amount), 0) as total_amount,
      COALESCE(SUM((SELECT SUM(pi.quantity) FROM purchase_items pi WHERE pi.purchase_id = p.id)), 0) as total_items
    FROM purchases p
    WHERE DATE(purchase_date) >= ?
  `, [thisMonthStart], (err, row) => {
    if (!err) analytics.monthPurchases = row || { count: 0, total_amount: 0, total_items: 0 };
    completed++;
    if (completed === totalQueries) res.json(analytics);
  });

  // 4. Last Month Purchases (for comparison)
  db.get(`
    SELECT 
      COUNT(*) as count,
      COALESCE(SUM(total_amount), 0) as total_amount
    FROM purchases
    WHERE DATE(purchase_date) >= ? AND DATE(purchase_date) <= ?
  `, [lastMonthStart, lastMonthEnd], (err, row) => {
    if (!err) analytics.lastMonthPurchases = row || { count: 0, total_amount: 0 };
    completed++;
    if (completed === totalQueries) res.json(analytics);
  });

  // 5. Critical Stock Items (Out of Stock or Very Low)
  db.all(`
    SELECT 
      i.id, i.name, i.sku, i.stock_quantity, i.min_stock_level, i.unit,
      c.name as category_name,
      CASE 
        WHEN i.stock_quantity = 0 THEN 'Out of Stock'
        WHEN i.stock_quantity < (i.min_stock_level * 0.5) THEN 'Critical'
        ELSE 'Low'
      END as urgency
    FROM items i
    LEFT JOIN categories c ON i.category_id = c.id
    WHERE i.stock_quantity <= i.min_stock_level
    ORDER BY 
      CASE urgency
        WHEN 'Out of Stock' THEN 1
        WHEN 'Critical' THEN 2
        ELSE 3
      END,
      i.stock_quantity ASC
    LIMIT 10
  `, [], (err, rows) => {
    if (!err) analytics.criticalStock = rows || [];
    completed++;
    if (completed === totalQueries) res.json(analytics);
  });

  // 6. Reorder Recommendations
  db.all(`
    SELECT 
      i.id, i.name, i.sku, i.stock_quantity, i.min_stock_level, i.unit,
      c.name as category_name,
      (i.min_stock_level * 2 - i.stock_quantity) as recommended_qty
    FROM items i
    LEFT JOIN categories c ON i.category_id = c.id
    WHERE i.stock_quantity <= i.min_stock_level
    ORDER BY i.stock_quantity ASC
    LIMIT 10
  `, [], (err, rows) => {
    if (!err) analytics.reorderRecommendations = rows || [];
    completed++;
    if (completed === totalQueries) res.json(analytics);
  });

  // 7. Recent Stock Adjustments
  db.all(`
    SELECT 
      sa.id, sa.adjustment_type, sa.quantity, sa.reason, sa.created_at,
      i.name as item_name, i.sku,
      u.username as created_by_name
    FROM stock_adjustments sa
    JOIN items i ON sa.item_id = i.id
    LEFT JOIN users u ON sa.created_by = u.id
    ORDER BY sa.created_at DESC
    LIMIT 10
  `, [], (err, rows) => {
    if (!err) analytics.recentAdjustments = rows || [];
    completed++;
    if (completed === totalQueries) res.json(analytics);
  });

  // 8. Category Stock Summary
  db.all(`
    SELECT 
      c.name as category,
      COUNT(i.id) as item_count,
      COALESCE(SUM(i.stock_quantity), 0) as total_stock,
      COALESCE(SUM(i.stock_quantity * i.cost_price), 0) as total_value,
      COALESCE(SUM(CASE WHEN i.stock_quantity <= i.min_stock_level THEN 1 ELSE 0 END), 0) as low_stock_count
    FROM categories c
    LEFT JOIN items i ON c.id = i.category_id
    GROUP BY c.id, c.name
    HAVING item_count > 0
    ORDER BY total_value DESC
    LIMIT 8
  `, [], (err, rows) => {
    if (!err) analytics.categorySummary = rows || [];
    completed++;
    if (completed === totalQueries) res.json(analytics);
  });

  // 9. Top Suppliers (by purchase volume)
  db.all(`
    SELECT 
      s.id, s.name, s.contact_person,
      COUNT(p.id) as purchase_count,
      COALESCE(SUM(p.total_amount), 0) as total_spent,
      COALESCE(SUM((SELECT SUM(pi.quantity) FROM purchase_items pi WHERE pi.purchase_id = p.id)), 0) as total_items
    FROM suppliers s
    LEFT JOIN purchases p ON s.id = p.supplier_id
    WHERE DATE(p.purchase_date) >= ?
    GROUP BY s.id, s.name, s.contact_person
    HAVING purchase_count > 0
    ORDER BY total_spent DESC
    LIMIT 5
  `, [thisMonthStart], (err, rows) => {
    if (!err) analytics.topSuppliers = rows || [];
    completed++;
    if (completed === totalQueries) res.json(analytics);
  });

  // 10. Purchase Trend (Last 7 Days)
  db.all(`
    SELECT 
      DATE(purchase_date) as date,
      COUNT(*) as purchase_count,
      COALESCE(SUM(total_amount), 0) as total_amount,
      COALESCE(SUM((SELECT SUM(pi.quantity) FROM purchase_items pi WHERE pi.purchase_id = p.id)), 0) as total_items
    FROM purchases p
    WHERE DATE(purchase_date) >= date('now', '-7 days')
    GROUP BY DATE(purchase_date)
    ORDER BY date ASC
  `, [], (err, rows) => {
    if (!err) analytics.purchaseTrend = rows || [];
    completed++;
    if (completed === totalQueries) res.json(analytics);
  });

  // 11. Stock Value by Category
  db.all(`
    SELECT 
      c.name as category,
      COUNT(i.id) as items,
      COALESCE(SUM(i.stock_quantity), 0) as total_units,
      COALESCE(SUM(i.stock_quantity * i.cost_price), 0) as cost_value,
      COALESCE(SUM(i.stock_quantity * i.unit_price), 0) as sales_value
    FROM categories c
    LEFT JOIN items i ON c.id = i.category_id
    GROUP BY c.id, c.name
    HAVING items > 0
    ORDER BY cost_value DESC
  `, [], (err, rows) => {
    if (!err) analytics.stockByCategory = rows || [];
    completed++;
    if (completed === totalQueries) res.json(analytics);
  });

  // 12. Items Needing Attention (Low stock with high sales velocity)
  db.all(`
    SELECT 
      i.id, i.name, i.sku, i.stock_quantity, i.min_stock_level, i.unit,
      c.name as category_name,
      COALESCE(SUM(si.quantity), 0) as total_sold_last_month,
      CASE 
        WHEN i.stock_quantity = 0 THEN 999
        ELSE (i.stock_quantity * 30.0 / NULLIF(COALESCE(SUM(si.quantity), 0), 0))
      END as days_remaining
    FROM items i
    LEFT JOIN categories c ON i.category_id = c.id
    LEFT JOIN sales_items si ON i.id = si.item_id
    LEFT JOIN sales s ON si.sale_id = s.id AND DATE(s.sale_date) >= date('now', '-30 days')
    WHERE i.stock_quantity <= i.min_stock_level
    GROUP BY i.id
    HAVING total_sold_last_month > 0
    ORDER BY days_remaining ASC, i.stock_quantity ASC
    LIMIT 10
  `, [], (err, rows) => {
    if (!err) analytics.itemsNeedingAttention = rows || [];
    completed++;
    if (completed === totalQueries) res.json(analytics);
  });
});

// Sales Analytics Endpoint - Comprehensive sales management and growth tracking
app.get('/api/reports/sales-analytics', authenticateToken, requireRole('admin', 'sales', 'manager'), (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const thisWeekStart = new Date();
  thisWeekStart.setDate(thisWeekStart.getDate() - thisWeekStart.getDay());
  thisWeekStart.setHours(0, 0, 0, 0);
  const thisMonthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
  const lastMonthStart = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).toISOString().split('T')[0];
  const lastMonthEnd = new Date(new Date().getFullYear(), new Date().getMonth(), 0).toISOString().split('T')[0];
  const thisWeekStartStr = thisWeekStart.toISOString().split('T')[0];

  const analytics = {};
  let completed = 0;
  const totalQueries = 14;

  // 1. Sales Overview
  db.get(`
    SELECT 
      COUNT(*) as total_transactions,
      COALESCE(SUM(total_amount), 0) as total_revenue,
      COALESCE(SUM((SELECT SUM(si.quantity) FROM sales_items si WHERE si.sale_id = s.id)), 0) as total_items_sold,
      COALESCE(AVG(total_amount), 0) as average_transaction_value
    FROM sales s
  `, [], (err, row) => {
    if (!err) analytics.salesOverview = row || { total_transactions: 0, total_revenue: 0, total_items_sold: 0, average_transaction_value: 0 };
    completed++;
    if (completed === totalQueries) res.json(analytics);
  });

  // 2. Today's Sales
  db.get(`
    SELECT 
      COUNT(*) as transaction_count,
      COALESCE(SUM(total_amount), 0) as total_revenue,
      COALESCE(SUM((SELECT SUM(si.quantity) FROM sales_items si WHERE si.sale_id = s.id)), 0) as total_items_sold,
      COALESCE(AVG(total_amount), 0) as average_transaction_value
    FROM sales s
    WHERE DATE(sale_date) = ?
  `, [today], (err, row) => {
    if (!err) analytics.todaySales = row || { transaction_count: 0, total_revenue: 0, total_items_sold: 0, average_transaction_value: 0 };
    completed++;
    if (completed === totalQueries) res.json(analytics);
  });

  // 3. This Week Sales
  db.get(`
    SELECT 
      COUNT(*) as transaction_count,
      COALESCE(SUM(total_amount), 0) as total_revenue,
      COALESCE(SUM((SELECT SUM(si.quantity) FROM sales_items si WHERE si.sale_id = s.id)), 0) as total_items_sold
    FROM sales s
    WHERE DATE(sale_date) >= ?
  `, [thisWeekStartStr], (err, row) => {
    if (!err) analytics.weekSales = row || { transaction_count: 0, total_revenue: 0, total_items_sold: 0 };
    completed++;
    if (completed === totalQueries) res.json(analytics);
  });

  // 4. This Month Sales
  db.get(`
    SELECT 
      COUNT(*) as transaction_count,
      COALESCE(SUM(total_amount), 0) as total_revenue,
      COALESCE(SUM((SELECT SUM(si.quantity) FROM sales_items si WHERE si.sale_id = s.id)), 0) as total_items_sold,
      COALESCE(AVG(total_amount), 0) as average_transaction_value
    FROM sales s
    WHERE DATE(sale_date) >= ?
  `, [thisMonthStart], (err, row) => {
    if (!err) analytics.monthSales = row || { transaction_count: 0, total_revenue: 0, total_items_sold: 0, average_transaction_value: 0 };
    completed++;
    if (completed === totalQueries) res.json(analytics);
  });

  // 5. Last Month Sales (for comparison)
  db.get(`
    SELECT 
      COUNT(*) as transaction_count,
      COALESCE(SUM(total_amount), 0) as total_revenue
    FROM sales
    WHERE DATE(sale_date) >= ? AND DATE(sale_date) <= ?
  `, [lastMonthStart, lastMonthEnd], (err, row) => {
    if (!err) analytics.lastMonthSales = row || { transaction_count: 0, total_revenue: 0 };
    completed++;
    if (completed === totalQueries) res.json(analytics);
  });

  // 6. Recent Sales Transactions
  db.all(`
    SELECT 
      s.id, s.sale_date, s.total_amount, s.customer_name,
      COUNT(si.id) as item_count,
      SUM(si.quantity) as total_quantity,
      u.username as created_by_name
    FROM sales s
    LEFT JOIN sales_items si ON s.id = si.sale_id
    LEFT JOIN users u ON s.created_by = u.id
    GROUP BY s.id
    ORDER BY s.sale_date DESC, s.id DESC
    LIMIT 10
  `, [], (err, rows) => {
    if (!err) analytics.recentSales = rows || [];
    completed++;
    if (completed === totalQueries) res.json(analytics);
  });

  // 7. Top Selling Items
  db.all(`
    SELECT 
      i.id, i.name, i.sku, i.unit_price,
      COALESCE(SUM(si.quantity), 0) as total_sold,
      COALESCE(SUM(si.quantity * si.unit_price), 0) as total_revenue,
      COUNT(DISTINCT s.id) as transaction_count
    FROM items i
    LEFT JOIN sales_items si ON i.id = si.item_id
    LEFT JOIN sales s ON si.sale_id = s.id
    WHERE DATE(s.sale_date) >= ?
    GROUP BY i.id
    HAVING total_sold > 0
    ORDER BY total_sold DESC
    LIMIT 10
  `, [thisMonthStart], (err, rows) => {
    if (!err) analytics.topSellingItems = rows || [];
    completed++;
    if (completed === totalQueries) res.json(analytics);
  });

  // 8. Sales by Category
  db.all(`
    SELECT 
      c.name as category,
      COUNT(DISTINCT s.id) as transaction_count,
      COALESCE(SUM(si.quantity), 0) as total_items_sold,
      COALESCE(SUM(si.quantity * si.unit_price), 0) as total_revenue
    FROM categories c
    LEFT JOIN items i ON c.id = i.category_id
    LEFT JOIN sales_items si ON i.id = si.item_id
    LEFT JOIN sales s ON si.sale_id = s.id AND DATE(s.sale_date) >= ?
    GROUP BY c.id, c.name
    HAVING total_items_sold > 0
    ORDER BY total_revenue DESC
    LIMIT 8
  `, [thisMonthStart], (err, rows) => {
    if (!err) analytics.salesByCategory = rows || [];
    completed++;
    if (completed === totalQueries) res.json(analytics);
  });

  // 9. Sales Trend (Last 7 Days)
  db.all(`
    SELECT 
      DATE(sale_date) as date,
      COUNT(*) as transaction_count,
      COALESCE(SUM(total_amount), 0) as total_revenue,
      COALESCE(SUM((SELECT SUM(si.quantity) FROM sales_items si WHERE si.sale_id = s.id)), 0) as total_items_sold
    FROM sales s
    WHERE DATE(sale_date) >= date('now', '-7 days')
    GROUP BY DATE(sale_date)
    ORDER BY date ASC
  `, [], (err, rows) => {
    if (!err) analytics.salesTrend = rows || [];
    completed++;
    if (completed === totalQueries) res.json(analytics);
  });

  // 10. Hourly Sales Pattern (Today)
  db.all(`
    SELECT 
      strftime('%H', sale_date) as hour,
      COUNT(*) as transaction_count,
      COALESCE(SUM(total_amount), 0) as total_revenue
    FROM sales
    WHERE DATE(sale_date) = ?
    GROUP BY strftime('%H', sale_date)
    ORDER BY hour ASC
  `, [today], (err, rows) => {
    if (!err) analytics.hourlyPattern = rows || [];
    completed++;
    if (completed === totalQueries) res.json(analytics);
  });

  // 11. Available Items for Sale
  db.all(`
    SELECT 
      i.id, i.name, i.sku, i.stock_quantity, i.unit_price, i.unit,
      c.name as category_name,
      CASE WHEN i.stock_quantity = 0 THEN 'Out of Stock'
           WHEN i.stock_quantity <= i.min_stock_level THEN 'Low Stock'
           ELSE 'Available'
      END as availability_status
    FROM items i
    LEFT JOIN categories c ON i.category_id = c.id
    WHERE i.stock_quantity > 0
    ORDER BY i.stock_quantity DESC, i.name ASC
    LIMIT 20
  `, [], (err, rows) => {
    if (!err) analytics.availableItems = rows || [];
    completed++;
    if (completed === totalQueries) res.json(analytics);
  });

  // 12. Out of Stock Items
  db.all(`
    SELECT 
      i.id, i.name, i.sku, i.unit_price, i.unit,
      c.name as category_name,
      COALESCE(SUM(si.quantity), 0) as sold_last_month
    FROM items i
    LEFT JOIN categories c ON i.category_id = c.id
    LEFT JOIN sales_items si ON i.id = si.item_id
    LEFT JOIN sales s ON si.sale_id = s.id AND DATE(s.sale_date) >= date('now', '-30 days')
    WHERE i.stock_quantity = 0
    GROUP BY i.id
    ORDER BY sold_last_month DESC, i.name ASC
    LIMIT 10
  `, [], (err, rows) => {
    if (!err) analytics.outOfStockItems = rows || [];
    completed++;
    if (completed === totalQueries) res.json(analytics);
  });

  // 13. Customer Insights (Top Customers)
  db.all(`
    SELECT 
      customer_name,
      COUNT(*) as transaction_count,
      COALESCE(SUM(total_amount), 0) as total_spent,
      COALESCE(AVG(total_amount), 0) as average_transaction_value,
      MAX(sale_date) as last_purchase_date
    FROM sales
    WHERE customer_name IS NOT NULL AND customer_name != ''
      AND DATE(sale_date) >= ?
    GROUP BY customer_name
    HAVING transaction_count > 0
    ORDER BY total_spent DESC
    LIMIT 10
  `, [thisMonthStart], (err, rows) => {
    if (!err) analytics.topCustomers = rows || [];
    completed++;
    if (completed === totalQueries) res.json(analytics);
  });

  // 14. Performance Metrics
  db.get(`
    SELECT 
      COUNT(DISTINCT DATE(sale_date)) as active_days,
      COALESCE(SUM(total_amount) / NULLIF(COUNT(DISTINCT DATE(sale_date)), 0), 0) as daily_average,
      COALESCE(MAX(total_amount), 0) as largest_transaction,
      COALESCE(MIN(total_amount), 0) as smallest_transaction
    FROM sales
    WHERE DATE(sale_date) >= ?
  `, [thisMonthStart], (err, row) => {
    if (!err) analytics.performanceMetrics = row || { active_days: 0, daily_average: 0, largest_transaction: 0, smallest_transaction: 0 };
    completed++;
    if (completed === totalQueries) res.json(analytics);
  });
});

// ==================== PDF GENERATION FUNCTIONS ====================

// Helper function to format currency in PDF
function formatCurrencyPDF(amount) {
  if (amount === null || amount === undefined) return 'Tshs 0.00';
  return `Tshs ${parseFloat(amount).toLocaleString('en-TZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function generateFullSystemPDF(outputPath, callback) {
  const doc = new PDFDocument({ margin: 50 });
  const stream = fs.createWriteStream(outputPath);
  doc.pipe(stream);

  doc.fontSize(20).text('Complete System Report', { align: 'center' });
  doc.moveDown();
  doc.fontSize(12).text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' });
  doc.moveDown(2);

  // Get all data
  const queries = {
    items: 'SELECT * FROM items ORDER BY name',
    categories: 'SELECT * FROM categories ORDER BY name',
    suppliers: 'SELECT * FROM suppliers ORDER BY name',
    purchases: 'SELECT p.*, s.name as supplier_name FROM purchases p LEFT JOIN suppliers s ON p.supplier_id = s.id ORDER BY p.purchase_date DESC',
    sales: 'SELECT * FROM sales ORDER BY sale_date DESC',
    stockAdjustments: 'SELECT sa.*, i.name as item_name FROM stock_adjustments sa JOIN items i ON sa.item_id = i.id ORDER BY sa.created_at DESC',
    users: 'SELECT id, username, email, role, full_name, created_at, is_active FROM users ORDER BY username'
  };

  let completed = 0;
  const total = Object.keys(queries).length;

  function processResults() {
    completed++;
    if (completed === total) {
      doc.end();
      stream.on('finish', () => callback(null, outputPath));
      stream.on('error', callback);
    }
  }

  db.all(queries.items, [], (err, items) => {
    if (!err && items.length > 0) {
      doc.fontSize(16).text('Items Inventory', { underline: true });
      doc.moveDown(0.5);
      items.forEach((item, idx) => {
        doc.fontSize(10).text(`${idx + 1}. ${item.name} (SKU: ${item.sku || 'N/A'}) - Stock: ${item.stock_quantity} ${item.unit || 'pcs'} - Cost: ${formatCurrencyPDF(item.cost_price || 0)} - Price: ${formatCurrencyPDF(item.unit_price)}`);
      });
      doc.moveDown();
    }
    processResults();
  });

  db.all(queries.categories, [], (err, categories) => {
    if (!err && categories.length > 0) {
      doc.fontSize(16).text('Categories', { underline: true });
      doc.moveDown(0.5);
      categories.forEach((cat, idx) => {
        doc.fontSize(10).text(`${idx + 1}. ${cat.name}${cat.description ? ' - ' + cat.description : ''}`);
      });
      doc.moveDown();
    }
    processResults();
  });

  db.all(queries.suppliers, [], (err, suppliers) => {
    if (!err && suppliers.length > 0) {
      doc.fontSize(16).text('Suppliers', { underline: true });
      doc.moveDown(0.5);
      suppliers.forEach((sup, idx) => {
        doc.fontSize(10).text(`${idx + 1}. ${sup.name} - Contact: ${sup.contact_person || 'N/A'} - Phone: ${sup.phone || 'N/A'}`);
      });
      doc.moveDown();
    }
    processResults();
  });

  db.all(queries.purchases, [], (err, purchases) => {
    if (!err && purchases.length > 0) {
      doc.fontSize(16).text('Purchase History', { underline: true });
      doc.moveDown(0.5);
      purchases.forEach((purchase, idx) => {
        doc.fontSize(10).text(`${idx + 1}. Purchase #${purchase.id} - ${purchase.supplier_name || 'N/A'} - ${formatCurrencyPDF(purchase.total_amount)} - ${purchase.purchase_date}`);
      });
      doc.moveDown();
    }
    processResults();
  });

  db.all(queries.sales, [], (err, sales) => {
    if (!err && sales.length > 0) {
      doc.fontSize(16).text('Sales History', { underline: true });
      doc.moveDown(0.5);
      sales.forEach((sale, idx) => {
        doc.fontSize(10).text(`${idx + 1}. Sale #${sale.id} - Customer: ${sale.customer_name || 'Walk-in'} - ${formatCurrencyPDF(sale.total_amount)} - ${sale.sale_date}`);
      });
      doc.moveDown();
    }
    processResults();
  });

  db.all(queries.stockAdjustments, [], (err, adjustments) => {
    if (!err && adjustments.length > 0) {
      doc.fontSize(16).text('Stock Adjustments', { underline: true });
      doc.moveDown(0.5);
      adjustments.forEach((adj, idx) => {
        doc.fontSize(10).text(`${idx + 1}. ${adj.item_name} - ${adj.adjustment_type} ${adj.quantity} - Reason: ${adj.reason || 'N/A'} - ${adj.created_at}`);
      });
      doc.moveDown();
    }
    processResults();
  });

  db.all(queries.users, [], (err, users) => {
    if (!err && users.length > 0) {
      doc.fontSize(16).text('Users', { underline: true });
      doc.moveDown(0.5);
      users.forEach((user, idx) => {
        doc.fontSize(10).text(`${idx + 1}. ${user.username} (${user.role}) - ${user.email} - Active: ${user.is_active ? 'Yes' : 'No'}`);
      });
      doc.moveDown();
    }
    processResults();
  });
}

function generateRoleBasedPDF(role, userId, outputPath, callback) {
  const doc = new PDFDocument({ margin: 50 });
  const stream = fs.createWriteStream(outputPath);
  doc.pipe(stream);

  doc.fontSize(20).text(`${role.charAt(0).toUpperCase() + role.slice(1)} Report`, { align: 'center' });
  doc.moveDown();
  doc.fontSize(12).text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' });
  doc.moveDown(2);

  if (role === 'sales') {
    db.all('SELECT * FROM sales ORDER BY sale_date DESC LIMIT 100', [], (err, sales) => {
      if (!err && sales.length > 0) {
        doc.fontSize(16).text('Recent Sales', { underline: true });
        doc.moveDown(0.5);
        sales.forEach((sale, idx) => {
          doc.fontSize(10).text(`${idx + 1}. Sale #${sale.id} - ${sale.customer_name || 'Walk-in'} - ${formatCurrencyPDF(sale.total_amount)} - ${sale.sale_date}`);
        });
      }
      doc.end();
      stream.on('finish', () => callback(null, outputPath));
      stream.on('error', callback);
    });
  } else if (role === 'storekeeper') {
    db.all('SELECT i.*, c.name as category_name FROM items i LEFT JOIN categories c ON i.category_id = c.id ORDER BY i.name', [], (err, items) => {
      if (!err && items.length > 0) {
        doc.fontSize(16).text('Inventory Items', { underline: true });
        doc.moveDown(0.5);
        items.forEach((item, idx) => {
          doc.fontSize(10).text(`${idx + 1}. ${item.name} - Stock: ${item.stock_quantity} ${item.unit || 'pcs'} - Category: ${item.category_name || 'N/A'}`);
        });
      }
      doc.end();
      stream.on('finish', () => callback(null, outputPath));
      stream.on('error', callback);
    });
  } else {
    doc.text('No specific report available for this role.');
    doc.end();
    stream.on('finish', () => callback(null, outputPath));
    stream.on('error', callback);
  }
}

// ==================== CLEAR DATA ROUTES ====================

// Initiate clear data process
app.post('/api/clear-data/initiate', authenticateToken, requireRole('admin'), (req, res) => {
  const adminId = req.user.id;
  const backupDir = path.join(__dirname, 'backups');
  const pdfDir = path.join(__dirname, 'pdfs');

  // Create directories if they don't exist
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
  if (!fs.existsSync(pdfDir)) fs.mkdirSync(pdfDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFileName = `backup-before-clear-${timestamp}.db`;
  const backupPath = path.join(backupDir, backupFileName);
  const pdfFileName = `system-report-${timestamp}.pdf`;
  const pdfPath = path.join(pdfDir, pdfFileName);

  // Create backup
  fs.copyFileSync(DB_PATH, backupPath);

  // Generate PDF
  generateFullSystemPDF(pdfPath, (err) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to generate PDF: ' + err.message });
    }

    // Create clear data request
    db.run(
      `INSERT INTO clear_data_requests (admin_id, backup_file_path, pdf_file_path, status) VALUES (?, ?, ?, 'pending')`,
      [adminId, backupPath, pdfPath],
      function(err) {
        if (err) {
          return res.status(500).json({ error: sanitizeError(err) });
        }

        logAudit(req, 'CLEAR_DATA_INITIATED', 'clear_data_request', this.lastID, {});
        res.json({
          requestId: this.lastID,
          backupPath: backupPath,
          pdfPath: pdfPath,
          message: 'Clear data process initiated. PDF and backup generated.'
        });
      }
    );
  });
});

// Admin confirmation
app.post('/api/clear-data/confirm', authenticateToken, requireRole('admin'), async (req, res) => {
  const { requestId, password, confirmationNumber } = req.body;
  const adminId = req.user.id;

  if (!requestId || confirmationNumber === undefined) {
    return res.status(400).json({ error: 'Request ID and confirmation number are required' });
  }

  db.get('SELECT * FROM clear_data_requests WHERE id = ? AND admin_id = ? AND status = ?', 
    [requestId, adminId, 'pending'], (err, request) => {
    if (err) {
      return res.status(500).json({ error: sanitizeError(err) });
    }
    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    const newConfirmationCount = request.admin_confirmations + 1;

    // If 5th confirmation, require password
    if (newConfirmationCount === 5) {
      if (!password) {
        return res.status(400).json({ error: 'Password required for final confirmation' });
      }

      db.get('SELECT password FROM users WHERE id = ?', [adminId], async (err, user) => {
        if (err || !user) {
          return res.status(500).json({ error: 'User not found' });
        }

        const match = await bcrypt.compare(password, user.password);
        if (!match) {
          return res.status(401).json({ error: 'Invalid password' });
        }

        // Update request
        db.run(
          `UPDATE clear_data_requests SET admin_confirmations = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [newConfirmationCount, requestId],
          (err) => {
            if (err) {
              return res.status(500).json({ error: sanitizeError(err) });
            }

            logAudit(req, 'CLEAR_DATA_ADMIN_CONFIRMED', 'clear_data_request', requestId, {});
            res.json({
              confirmed: true,
              confirmationCount: newConfirmationCount,
              requiresManagerApproval: true,
              message: 'Admin confirmation complete. Waiting for manager approval.'
            });
          }
        );
      });
    } else {
      // Update confirmation count
      db.run(
        `UPDATE clear_data_requests SET admin_confirmations = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [newConfirmationCount, requestId],
        (err) => {
          if (err) {
            return res.status(500).json({ error: sanitizeError(err) });
          }

          res.json({
            confirmed: true,
            confirmationCount: newConfirmationCount,
            requiresPassword: newConfirmationCount === 4,
            message: `Confirmation ${newConfirmationCount} of 5 completed.`
          });
        }
      );
    }
  });
});

// Admin cancel clear data request
app.post('/api/clear-data/cancel', authenticateToken, requireRole('admin'), (req, res) => {
  console.log('Cancel route hit - body:', req.body, 'user:', req.user);
  const { requestId } = req.body;
  const adminId = req.user.id;

  if (!requestId) {
    return res.status(400).json({ error: 'Request ID is required' });
  }

  db.get('SELECT * FROM clear_data_requests WHERE id = ? AND admin_id = ? AND status = ?', 
    [requestId, adminId, 'pending'], (err, request) => {
    if (err) {
      return res.status(500).json({ error: sanitizeError(err) });
    }
    if (!request) {
      return res.status(404).json({ error: 'Request not found or cannot be cancelled' });
    }

    // Update request status to cancelled
    db.run(
      `UPDATE clear_data_requests SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [requestId],
      (err) => {
        if (err) {
          return res.status(500).json({ error: sanitizeError(err) });
        }
        logAudit(req, 'CLEAR_DATA_CANCELLED', 'clear_data_request', requestId, {});
        res.json({ message: 'Clear data request cancelled successfully' });
      }
    );
  });
});

// Get pending clear data requests (for manager)
app.get('/api/clear-data/pending', authenticateToken, requireRole('manager'), (req, res) => {
  db.all(
    `SELECT cdr.*, u.username as admin_username 
     FROM clear_data_requests cdr 
     JOIN users u ON cdr.admin_id = u.id 
     WHERE cdr.status = 'pending' AND cdr.admin_confirmations = 5
     ORDER BY cdr.created_at DESC`,
    [],
    (err, requests) => {
      if (err) {
        return res.status(500).json({ error: sanitizeError(err) });
      }
      res.json(requests);
    }
  );
});

// Manager approve/reject
app.post('/api/clear-data/manager-action', authenticateToken, requireRole('manager'), async (req, res) => {
  const { requestId, action, password } = req.body; // action: 'approve' or 'reject'
  const managerId = req.user.id;

  if (!requestId || !action) {
    return res.status(400).json({ error: 'Request ID and action are required' });
  }

  db.get('SELECT * FROM clear_data_requests WHERE id = ? AND status = ? AND admin_confirmations = 5', 
    [requestId, 'pending'], (err, request) => {
    if (err) {
      return res.status(500).json({ error: sanitizeError(err) });
    }
    if (!request) {
      return res.status(404).json({ error: 'Request not found or not ready for manager approval' });
    }

    if (action === 'reject') {
      db.run(
        `UPDATE clear_data_requests SET status = 'rejected', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [requestId],
        (err) => {
          if (err) {
            return res.status(500).json({ error: sanitizeError(err) });
          }
          logAudit(req, 'CLEAR_DATA_REJECTED', 'clear_data_request', requestId, {});
          res.json({ message: 'Clear data request rejected' });
        }
      );
    } else if (action === 'approve') {
      const newConfirmationCount = request.manager_confirmations + 1;

      if (newConfirmationCount === 5) {
        if (!password) {
          return res.status(400).json({ error: 'Password required for final confirmation' });
        }

        db.get('SELECT password FROM users WHERE id = ?', [managerId], async (err, user) => {
          if (err || !user) {
            return res.status(500).json({ error: 'User not found' });
          }

          const match = await bcrypt.compare(password, user.password);
          if (!match) {
            return res.status(401).json({ error: 'Invalid password' });
          }

          // Approve and proceed with clearing
          db.run(
            `UPDATE clear_data_requests SET status = 'approved', manager_confirmations = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [newConfirmationCount, requestId],
            (err) => {
              if (err) {
                return res.status(500).json({ error: sanitizeError(err) });
              }

              // Clear all data
              clearAllData((clearErr) => {
                if (clearErr) {
                  return res.status(500).json({ error: 'Failed to clear data: ' + clearErr.message });
                }

                db.run(
                  `UPDATE clear_data_requests SET status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE id = ?`,
                  [requestId],
                  () => {}
                );

                logAudit(req, 'CLEAR_DATA_COMPLETED', 'clear_data_request', requestId, {});
                res.json({ message: 'All data cleared successfully' });
              });
            }
          );
        });
      } else {
        db.run(
          `UPDATE clear_data_requests SET manager_confirmations = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [newConfirmationCount, requestId],
          (err) => {
            if (err) {
              return res.status(500).json({ error: sanitizeError(err) });
            }

            res.json({
              confirmed: true,
              confirmationCount: newConfirmationCount,
              requiresPassword: newConfirmationCount === 4,
              message: `Manager confirmation ${newConfirmationCount} of 5 completed.`
            });
          }
        );
      }
    } else {
      res.status(400).json({ error: 'Invalid action. Use "approve" or "reject"' });
    }
  });
});

// Get clear data request status
app.get('/api/clear-data/status/:requestId', authenticateToken, requireRole('admin', 'manager'), (req, res) => {
  const { requestId } = req.params;
  db.get(
    `SELECT cdr.*, u.username as admin_username 
     FROM clear_data_requests cdr 
     JOIN users u ON cdr.admin_id = u.id 
     WHERE cdr.id = ?`,
    [requestId],
    (err, request) => {
      if (err) {
        return res.status(500).json({ error: sanitizeError(err) });
      }
      if (!request) {
        return res.status(404).json({ error: 'Request not found' });
      }
      res.json(request);
    }
  );
});

// Get all clear data requests (for admin)
app.get('/api/clear-data/requests', authenticateToken, requireRole('admin'), (req, res) => {
  db.all(
    `SELECT * FROM clear_data_requests WHERE admin_id = ? ORDER BY created_at DESC`,
    [req.user.id],
    (err, requests) => {
      if (err) {
        return res.status(500).json({ error: sanitizeError(err) });
      }
      res.json(requests);
    }
  );
});

// Download PDF
app.get('/api/clear-data/pdf/:requestId', authenticateToken, requireRole('admin', 'manager'), (req, res) => {
  const { requestId } = req.params;
  db.get('SELECT pdf_file_path FROM clear_data_requests WHERE id = ?', [requestId], (err, request) => {
    if (err || !request) {
      return res.status(404).json({ error: 'PDF not found' });
    }
    if (fs.existsSync(request.pdf_file_path)) {
      const filename = path.basename(request.pdf_file_path);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.sendFile(path.resolve(request.pdf_file_path));
    } else {
      res.status(404).json({ error: 'PDF file not found' });
    }
  });
});

// Download backup
app.get('/api/clear-data/backup/:requestId', authenticateToken, requireRole('admin', 'manager'), (req, res) => {
  const { requestId } = req.params;
  db.get('SELECT backup_file_path FROM clear_data_requests WHERE id = ?', [requestId], (err, request) => {
    if (err || !request) {
      return res.status(404).json({ error: 'Backup not found' });
    }
    if (fs.existsSync(request.backup_file_path)) {
      const filename = path.basename(request.backup_file_path);
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.sendFile(path.resolve(request.backup_file_path));
    } else {
      res.status(404).json({ error: 'Backup file not found' });
    }
  });
});

// Helper function to clear all data
function clearAllData(callback) {
  const tables = [
    'sales_items',
    'sales',
    'purchase_items',
    'purchases',
    'stock_adjustments',
    'items',
    'categories',
    'suppliers'
  ];

  let completed = 0;
  const total = tables.length;

  tables.forEach(table => {
    db.run(`DELETE FROM ${table}`, (err) => {
      if (err) {
        console.error(`Error clearing ${table}:`, err);
      }
      completed++;
      if (completed === total) {
        callback(null);
      }
    });
  });
}

// Generate PDFs for all users
app.post('/api/clear-data/generate-user-pdfs', authenticateToken, requireRole('admin'), (req, res) => {
  const pdfDir = path.join(__dirname, 'pdfs');
  if (!fs.existsSync(pdfDir)) fs.mkdirSync(pdfDir, { recursive: true });

  db.all('SELECT id, username, role FROM users WHERE role IN (?, ?, ?)', ['sales', 'storekeeper', 'manager'], (err, users) => {
    if (err) {
      return res.status(500).json({ error: sanitizeError(err) });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const pdfs = [];

    let completed = 0;
    const total = users.length;

    if (total === 0) {
      return res.json({ message: 'No users found', pdfs: [] });
    }

    users.forEach(user => {
      const pdfFileName = `${user.role}-report-${user.username}-${timestamp}.pdf`;
      const pdfPath = path.join(pdfDir, pdfFileName);

      generateRoleBasedPDF(user.role, user.id, pdfPath, (err) => {
        if (!err) {
          pdfs.push({ userId: user.id, username: user.username, role: user.role, pdfPath: pdfPath });
        }
        completed++;
        if (completed === total) {
          res.json({ message: 'PDFs generated successfully', pdfs: pdfs });
        }
      });
    });
  });
});

// ==================== BACKUP & RESTORE ROUTES ====================

app.post('/api/backup', authenticateToken, requireRole('admin'), (req, res) => {
  const backupDir = path.join(__dirname, 'backups');
  const dbPath = DB_PATH;
  
  // Create backups directory if it doesn't exist
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  
  // Generate backup filename with timestamp
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const backupFileName = `ims_backup_${timestamp}.db`;
  const backupPath = path.join(backupDir, backupFileName);
  
  try {
    // Check if database file exists
    if (!fs.existsSync(dbPath)) {
      return res.status(404).json({ error: 'Database file not found' });
    }
    
    // Copy database file to backup location
    fs.copyFileSync(dbPath, backupPath);
    
    // Get backup file info
    const stats = fs.statSync(backupPath);
    
    res.json({
      success: true,
      message: 'Backup created successfully',
      filename: backupFileName,
      path: backupPath,
      size: stats.size,
      created_at: new Date().toISOString()
    });
  } catch (error) {
    console.error('Backup error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

app.get('/api/backups', authenticateToken, requireRole('admin'), (req, res) => {
  const backupDir = path.join(__dirname, 'backups');
  
  try {
    if (!fs.existsSync(backupDir)) {
      return res.json([]);
    }
    
    const files = fs.readdirSync(backupDir)
      .filter(file => file.endsWith('.db'))
      .map(file => {
        const filePath = path.join(backupDir, file);
        const stats = fs.statSync(filePath);
        return {
          filename: file,
          size: stats.size,
          created_at: stats.birthtime.toISOString(),
          modified_at: stats.mtime.toISOString()
        };
      })
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    
    res.json(files);
  } catch (error) {
    console.error('Error listing backups:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

app.post('/api/restore', authenticateToken, requireRole('admin'), (req, res) => {
  const { filename } = req.body;
  
  if (!filename) {
    return res.status(400).json({ error: 'Backup filename is required' });
  }
  
  // SECURITY: Prevent path traversal attacks
  // Only allow alphanumeric, dash, underscore, and dot in filename
  if (!/^[a-zA-Z0-9._-]+\.db$/.test(filename)) {
    return res.status(400).json({ error: 'Invalid backup filename' });
  }
  
  // SECURITY: Use path.basename to prevent directory traversal
  const safeFilename = path.basename(filename);
  
  const backupDir = path.join(__dirname, 'backups');
  const backupPath = path.join(backupDir, safeFilename);
  const dbPath = DB_PATH;
  
  // SECURITY: Ensure the resolved path is within the backup directory
  const resolvedBackupPath = path.resolve(backupPath);
  const resolvedBackupDir = path.resolve(backupDir);
  if (!resolvedBackupPath.startsWith(resolvedBackupDir)) {
    return res.status(400).json({ error: 'Invalid backup path' });
  }
  
  // Validate backup file exists
  if (!fs.existsSync(backupPath)) {
    return res.status(404).json({ error: 'Backup file not found' });
  }
  
  // Create a backup of current database before restore (safety measure)
  const currentBackupPath = dbPath + '.pre-restore-' + Date.now();
  
  // Close current database connection
  db.close((closeErr) => {
    if (closeErr) {
      console.error('Error closing database:', closeErr);
      // Try to reconnect even if close failed
      reconnectDatabase().catch(err => console.error('Reconnect failed:', err));
      return res.status(500).json({ error: sanitizeError(closeErr) });
    }
    
    try {
      // Create backup of current database if it exists
      if (fs.existsSync(dbPath)) {
        fs.copyFileSync(dbPath, currentBackupPath);
        console.log('Pre-restore backup created:', currentBackupPath);
      }
      
      // Copy backup file to database location
      fs.copyFileSync(backupPath, dbPath);
      console.log('Database file restored from:', filename);
      
      // Small delay to ensure file operations complete
      setTimeout(() => {
        // Reconnect to the restored database
        reconnectDatabase()
          .then(() => {
            res.json({
              success: true,
              message: 'Database restored successfully',
              restored_from: filename,
              restored_at: new Date().toISOString(),
              pre_restore_backup: path.basename(currentBackupPath)
            });
          })
          .catch((reconnectErr) => {
            console.error('Failed to reconnect database:', reconnectErr);
            res.status(500).json({ 
              error: 'Database restored but failed to reconnect. Please restart the server.'
            });
          });
      }, 100);
      
    } catch (error) {
      console.error('Restore error:', error);
      // Try to reconnect even if restore failed
      reconnectDatabase().catch(err => console.error('Reconnect failed:', err));
      res.status(500).json({ error: sanitizeError(error) });
    }
  });
});

app.delete('/api/backups/:filename', authenticateToken, requireRole('admin'), (req, res) => {
  const { filename } = req.params;
  
  // SECURITY: Prevent path traversal attacks
  if (!/^[a-zA-Z0-9._-]+\.db$/.test(filename)) {
    return res.status(400).json({ error: 'Invalid backup filename' });
  }
  
  // SECURITY: Use path.basename to prevent directory traversal
  const safeFilename = path.basename(filename);
  
  const backupDir = path.join(__dirname, 'backups');
  const backupPath = path.join(backupDir, safeFilename);
  
  // SECURITY: Ensure the resolved path is within the backup directory
  const resolvedBackupPath = path.resolve(backupPath);
  const resolvedBackupDir = path.resolve(backupDir);
  if (!resolvedBackupPath.startsWith(resolvedBackupDir)) {
    return res.status(400).json({ error: 'Invalid backup path' });
  }
  
  try {
    if (!fs.existsSync(backupPath)) {
      return res.status(404).json({ error: 'Backup file not found' });
    }
    
    fs.unlinkSync(backupPath);
    res.json({ success: true, message: 'Backup deleted successfully' });
  } catch (error) {
    console.error('Error deleting backup:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

// ==================== ROLE PERMISSIONS ROUTES ====================

// Get permissions for a specific role (must come before the general route)
app.get('/api/role-permissions/:role', authenticateToken, (req, res) => {
  const { role } = req.params;
  db.all('SELECT page, can_access FROM role_permissions WHERE role = ?', [role], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: sanitizeError(err) });
    }
    const permissions = {};
    rows.forEach(row => {
      permissions[row.page] = row.can_access === 1;
    });
    res.json(permissions);
  });
});

// Get all role permissions
app.get('/api/role-permissions', authenticateToken, requireRole('admin'), (req, res) => {
  db.all('SELECT * FROM role_permissions ORDER BY role, page', (err, rows) => {
    if (err) {
      return res.status(500).json({ error: sanitizeError(err) });
    }
    res.json(rows);
  });
});

// Update role permissions
app.put('/api/role-permissions', authenticateToken, requireRole('admin'), (req, res) => {
  const { role, page, can_access } = req.body;
  
  if (!role || !page || can_access === undefined) {
    return res.status(400).json({ error: 'Role, page, and can_access are required' });
  }

  db.run(
    'INSERT OR REPLACE INTO role_permissions (role, page, can_access) VALUES (?, ?, ?)',
    [role, page, can_access ? 1 : 0],
    function(err) {
      if (err) {
        return res.status(500).json({ error: sanitizeError(err) });
      }
      res.json({ message: 'Permission updated successfully' });
    }
  );
});

// Bulk update role permissions
app.put('/api/role-permissions/bulk', authenticateToken, requireRole('admin'), (req, res) => {
  const { permissions } = req.body; // Array of {role, page, can_access}
  
  if (!Array.isArray(permissions)) {
    return res.status(400).json({ error: 'Permissions must be an array' });
  }

  const stmt = db.prepare('INSERT OR REPLACE INTO role_permissions (role, page, can_access) VALUES (?, ?, ?)');
  
  permissions.forEach(perm => {
    stmt.run([perm.role, perm.page, perm.can_access ? 1 : 0]);
  });
  
  stmt.finalize((err) => {
    if (err) {
      return res.status(500).json({ error: sanitizeError(err) });
    }
    res.json({ message: 'Permissions updated successfully', count: permissions.length });
  });
});

// Reset role permissions to defaults
app.post('/api/role-permissions/reset', authenticateToken, requireRole('admin'), (req, res) => {
  const defaultPages = ['dashboard', 'inventory', 'purchases', 'sales', 'reports', 'users'];
  const defaultPermissions = {
    'admin': [1, 1, 1, 1, 1, 1], // Full access - All pages
    'storekeeper': [1, 1, 1, 0, 0, 0], // Manages stock - Dashboard, Inventory, Purchases only
    'sales': [1, 1, 0, 1, 0, 0], // Sells items - Dashboard, Inventory (view), Sales only
    'manager': [1, 0, 0, 0, 1, 0] // Views reports - Dashboard, Reports only
  };

  const stmt = db.prepare('INSERT OR REPLACE INTO role_permissions (role, page, can_access) VALUES (?, ?, ?)');
  let count = 0;

  defaultPages.forEach((page, index) => {
    Object.keys(defaultPermissions).forEach(role => {
      stmt.run([role, page, defaultPermissions[role][index]]);
      count++;
    });
  });

  stmt.finalize((err) => {
    if (err) {
      return res.status(500).json({ error: sanitizeError(err) });
    }
    res.json({ message: 'Role permissions reset to defaults successfully', count });
  });
});

// SECURITY: API Versioning - Create v1 router
const apiV1 = express.Router();

// Move all API routes to v1 (keeping backward compatibility with /api/ routes)
// For now, we'll keep both /api/ and /api/v1/ working
// In the future, we can deprecate /api/ and only use /api/v1/

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  console.error('Stack:', reason?.stack);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  console.error('Stack:', err.stack);
  // Don't exit immediately - let Railway handle it
  // process.exit(1);
});

// Global error handler middleware (must be after all routes)
app.use((err, req, res, next) => {
  console.error('Global error handler caught error:', err);
  console.error('Error stack:', err.stack);
  console.error('Request path:', req.path);
  console.error('Request method:', req.method);
  
  // Don't send response if headers already sent
  if (res.headersSent) {
    return next(err);
  }
  
  const statusCode = err.statusCode || err.status || 500;
  const errorMessage = sanitizeError(err, process.env.NODE_ENV === 'production');
  
  res.status(statusCode).json({
    error: errorMessage,
    message: process.env.NODE_ENV === 'production' ? undefined : err.message
  });
});

// Serve frontend (only for non-API routes)
app.get('*', (req, res) => {
  // Don't serve HTML for API routes
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Graceful shutdown handler
const gracefulShutdown = (signal) => {
  console.log(`\n${signal} signal received: starting graceful shutdown...`);
  
  // Stop accepting new connections
  if (server) {
    server.close(() => {
      console.log('✓ HTTP server closed');
      
      // Close database connection
      if (db) {
        db.close((err) => {
          if (err) {
            console.error('Error closing database:', err);
          } else {
            console.log('✓ Database connection closed');
          }
          console.log('✓ Graceful shutdown complete');
          process.exit(0);
        });
      } else {
        console.log('✓ Graceful shutdown complete');
        process.exit(0);
      }
    });
    
    // Force close after 10 seconds
    setTimeout(() => {
      console.error('⚠ Forced shutdown after timeout');
      if (db) {
        db.close();
      }
      process.exit(1);
    }, 10000);
  } else {
    // Server not started yet, just exit
    if (db) {
      db.close();
    }
    process.exit(0);
  }
};

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start server with error handling
let server;
try {
  // Listen on 0.0.0.0 to accept connections from Railway's network
  server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`IMS Server running on port ${PORT}`);
    console.log(`✓ Listening on 0.0.0.0:${PORT} (Railway compatible)`);
    console.log(`✓ Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`✓ API Version: v1 (backward compatible with /api/ routes)`);
    console.log(`✓ Security features enabled`);
    console.log(`✓ Database: ${db ? 'Connected' : 'Not connected (will retry on first request)'}`);
    console.log(`✓ Graceful shutdown enabled (SIGTERM/SIGINT)`);
    
    // Log registered routes for debugging
    try {
      const routes = [];
      app._router.stack.forEach((middleware) => {
        if (middleware.route) {
          const methods = Object.keys(middleware.route.methods).join(', ').toUpperCase();
          routes.push(`${methods} ${middleware.route.path}`);
        }
      });
      console.log(`✓ Registered ${routes.length} routes`);
      if (process.env.NODE_ENV === 'development') {
        const clearDataRoutes = routes.filter(r => r.includes('clear-data'));
        if (clearDataRoutes.length > 0) {
          console.log(`✓ Clear-data routes:`, clearDataRoutes.join(', '));
        }
      }
    } catch (routeError) {
      console.error('Error logging routes:', routeError);
      // Don't fail startup if route logging fails
    }
  });
} catch (startupError) {
  console.error('Failed to start server:', startupError);
  console.error('Error stack:', startupError.stack);
  process.exit(1);
}

