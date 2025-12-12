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
const compression = require('compression');
const { sendTestEmail } = require('./email-utils');
const { createBackup, cleanupOldBackups, getBackupInterval, getNextBackupTime } = require('./backup-utils');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy for Railway and other reverse proxies
// This allows Express to correctly identify client IPs from X-Forwarded-For headers
app.set('trust proxy', true);

// PERFORMANCE: Enable response compression (gzip) for faster responses
app.use(compression({
  filter: (req, res) => {
    // Don't compress if client doesn't support it
    if (req.headers['x-no-compression']) {
      return false;
    }
    // Use compression for all other requests
    return compression.filter(req, res);
  },
  level: 6, // Compression level (1-9, 6 is a good balance)
  threshold: 1024 // Only compress responses larger than 1KB
}));

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
// Automatically detect Railway domain from environment variables
const railwayDomain = process.env.RAILWAY_PUBLIC_DOMAIN || process.env.RAILWAY_STATIC_URL;
const railwayOrigins = railwayDomain 
  ? [`https://${railwayDomain}`, `http://${railwayDomain}`]
  : [];

const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
  : process.env.NODE_ENV === 'production' 
    ? railwayOrigins // Use Railway domain if available
    : ['http://localhost:3000', 'http://127.0.0.1:3000'];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Check if origin is in allowed list
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
      return;
    }
    
    // Automatically allow Railway domains (for dynamic Railway URLs)
    if (process.env.NODE_ENV === 'production' && origin.includes('.railway.app')) {
      callback(null, true);
      return;
    }
    
    // In production, if ALLOWED_ORIGINS is not set and no Railway domain detected,
    // allow all origins (for Railway compatibility - fallback)
    if (process.env.NODE_ENV === 'production' && allowedOrigins.length === 0) {
      callback(null, true);
      return;
    }
    
    // In development, be strict
    if (process.env.NODE_ENV !== 'production') {
      callback(new Error('Not allowed by CORS'));
      return;
    }
    
    // Production fallback - allow but log warning
    console.warn(`CORS: Origin ${origin} not in allowed list, but allowing for Railway compatibility`);
    callback(null, true);
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

// SECURITY: General API rate limiting (will be updated dynamically based on settings)
let apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // Default: Limit each IP to 100 requests per minute
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  validate: false, // Skip validation since we have trust proxy enabled (app.set('trust proxy', true))
});

// Update API rate limiter based on settings
async function updateApiRateLimiter() {
  try {
    let query = 'SELECT * FROM settings WHERE key IN (?, ?) AND shop_id IS NULL ORDER BY shop_id DESC';
    const params = ['enable_api_rate_limit', 'api_rate_limit_per_minute'];
    
    db.all(query, params, (err, settings) => {
      if (err) {
        console.error('Error getting API rate limit settings:', err);
        return;
      }
      
      const settingsMap = {};
      settings.forEach(s => {
        settingsMap[s.key] = s.value;
      });
      
      const enabled = settingsMap['enable_api_rate_limit'] === 'true' || settingsMap['enable_api_rate_limit'] === true;
      const maxRequests = parseInt(settingsMap['api_rate_limit_per_minute'] || '100', 10);
      
      // Create new rate limiter with updated settings
      apiLimiter = rateLimit({
        windowMs: 1 * 60 * 1000, // 1 minute
        max: enabled ? maxRequests : 10000, // If disabled, set very high limit
        message: 'Too many requests from this IP, please try again later.',
        standardHeaders: true,
        legacyHeaders: false,
        validate: false,
        skip: () => !enabled // Skip rate limiting if disabled
      });
      
      console.log(`API rate limiting ${enabled ? 'enabled' : 'disabled'}: ${maxRequests} requests per minute`);
    });
  } catch (error) {
    console.error('Error updating API rate limiter:', error);
  }
}

// Update rate limiter on startup and periodically
setTimeout(updateApiRateLimiter, 5000); // Wait 5 seconds for DB to be ready
setInterval(updateApiRateLimiter, 60 * 60 * 1000); // Check every hour

// SECURITY: Request size limits (reduced for uploads to improve performance)
app.use(bodyParser.json({ limit: '5mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '5mb' }));

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

// Version endpoint for cache busting
app.get('/version.json', (req, res) => {
  try {
    const versionPath = path.join(__dirname, 'public', 'version.json');
    if (fs.existsSync(versionPath)) {
      const versionData = JSON.parse(fs.readFileSync(versionPath, 'utf8'));
      res.json(versionData);
    } else {
      // Fallback: generate version from timestamp
      res.json({
        version: '1.0.0',
        build: Date.now().toString(),
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    // Fallback: generate version from timestamp
    res.json({
      version: '1.0.0',
      build: Date.now().toString(),
      timestamp: new Date().toISOString()
    });
  }
});

// Static files with optimized caching for 304 responses
// Enable ETag support (default in Express, but explicit for clarity)
app.set('etag', 'strong');

app.use(express.static('public', {
  etag: true, // Enable ETag generation
  lastModified: true, // Enable Last-Modified headers
  setHeaders: (res, path, stat) => {
    // HTML files: no cache (always fetch latest)
    if (path.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('Last-Modified', stat.mtime.toUTCString());
    }
    // All other files (CSS, JS, images, fonts, etc.): 2 minutes cache
    else {
      // 2 minutes cache (120 seconds) for faster updates
      res.setHeader('Cache-Control', 'public, max-age=120, must-revalidate');
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
// Helper function to check if an error is a duplicate column error
const isDuplicateColumnError = (err) => {
  if (!err) return false;
  const msg = err.message ? err.message.toLowerCase() : '';
  return msg.includes('duplicate column') || msg.includes('duplicate column name');
};

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
      subscription_plan TEXT DEFAULT 'basic',
      subscription_expires_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    
    // Add subscription columns if they don't exist (migration)
    db.run(`ALTER TABLE shops ADD COLUMN subscription_plan TEXT DEFAULT 'basic'`, (err) => {
      // Ignore error if column already exists
    });
    db.run(`ALTER TABLE shops ADD COLUMN subscription_expires_at DATETIME`, (err) => {
      // Ignore error if column already exists
    });
    
    // Subscription Plans table - defines available plans and their features
    // SQLite doesn't support ALTER TABLE for CHECK constraints, so we need to recreate the table
    // First, check if table exists and migrate if needed
    db.get("SELECT sql FROM sqlite_master WHERE type='table' AND name='subscription_plans'", [], (err, tableInfo) => {
      if (!err && tableInfo && tableInfo.sql) {
        // Table exists - check if it has the old constraint (only 'basic', 'premium')
        if (tableInfo.sql.includes("CHECK(plan_tier IN ('basic', 'premium'))") && !tableInfo.sql.includes("'standard'")) {
          console.log('Migrating subscription_plans table to support standard tier...');
          
          // Backup existing data
          db.all('SELECT * FROM subscription_plans', [], (err, plans) => {
            if (err) {
              console.error('Error backing up subscription_plans:', err);
              plans = []; // Continue with empty array
            }
            
            // Drop old table
            db.run('DROP TABLE subscription_plans', (err) => {
              if (err) {
                console.error('Error dropping old subscription_plans table:', err);
                return;
              }
              
              // Create new table with updated constraint
              db.run(`CREATE TABLE subscription_plans (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                plan_name TEXT UNIQUE NOT NULL,
                plan_tier TEXT NOT NULL CHECK(plan_tier IN ('basic', 'standard', 'premium')),
                price REAL DEFAULT 0,
                duration_days INTEGER DEFAULT 30,
                features TEXT NOT NULL,
                description TEXT,
                is_active INTEGER DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
              )`, (err) => {
                if (err) {
                  console.error('Error creating new subscription_plans table:', err);
                  return;
                }
                
                console.log('✓ subscription_plans table migrated successfully');
                
                // Restore data if we had any
                if (plans && plans.length > 0) {
                  const stmt = db.prepare(`INSERT INTO subscription_plans 
                    (plan_name, plan_tier, price, duration_days, features, description, is_active, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
                  
                  plans.forEach(plan => {
                    stmt.run([
                      plan.plan_name,
                      plan.plan_tier,
                      plan.price,
                      plan.duration_days,
                      plan.features,
                      plan.description,
                      plan.is_active,
                      plan.created_at,
                      plan.updated_at
                    ]);
                  });
                  
                  stmt.finalize();
                }
                
                // Initialize default plans after migration
                initializeSubscriptionPlans();
              });
            });
          });
        } else {
          // Table exists with correct constraint or no constraint - just ensure it exists
          db.run(`CREATE TABLE IF NOT EXISTS subscription_plans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            plan_name TEXT UNIQUE NOT NULL,
            plan_tier TEXT NOT NULL CHECK(plan_tier IN ('basic', 'standard', 'premium')),
            price REAL DEFAULT 0,
            duration_days INTEGER DEFAULT 30,
            features TEXT NOT NULL,
            description TEXT,
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )`, () => {
            initializeSubscriptionPlans();
          });
        }
      } else {
        // Table doesn't exist - create it
        db.run(`CREATE TABLE subscription_plans (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          plan_name TEXT UNIQUE NOT NULL,
          plan_tier TEXT NOT NULL CHECK(plan_tier IN ('basic', 'standard', 'premium')),
          price REAL DEFAULT 0,
          duration_days INTEGER DEFAULT 30,
          features TEXT NOT NULL,
          description TEXT,
          is_active INTEGER DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, () => {
          initializeSubscriptionPlans();
        });
      }
    });
    
    // Function to initialize default subscription plans
    function initializeSubscriptionPlans() {
      // Initialize default subscription plans if they don't exist
      db.get('SELECT COUNT(*) as count FROM subscription_plans', [], (err, result) => {
      if (!err && result.count === 0) {
        // Basic Plan - Essential features for small shops
        db.run(`INSERT INTO subscription_plans (plan_name, plan_tier, price, duration_days, features, description) 
                VALUES ('Basic Plan', 'basic', 0, 30, 
                '["inventory_management","sales","purchases","basic_reports","expenses"]', 
                'Essential features for small shops - Inventory, Sales, Purchases, Basic Reports, and Expense Tracking')`);
        
        // Standard Plan - Enhanced features for growing businesses
        db.run(`INSERT INTO subscription_plans (plan_name, plan_tier, price, duration_days, features, description) 
                VALUES ('Standard Plan', 'standard', 49.99, 30, 
                '["inventory_management","sales","purchases","basic_reports","advanced_reports","expenses","invoices","receipts","multi_user"]', 
                'Enhanced features for growing businesses - All Basic features plus Advanced Reports, Invoices, Receipts, and Multi-User Support')`);
        
        // Premium Plan - Full feature set for established businesses
        db.run(`INSERT INTO subscription_plans (plan_name, plan_tier, price, duration_days, features, description) 
                VALUES ('Premium Plan', 'premium', 99.99, 30, 
                '["inventory_management","sales","purchases","basic_reports","advanced_reports","analytics","multi_user","api_access","expenses","invoices","receipts","installment_payments","priority_support"]', 
                'Full feature set for established businesses - All Standard features plus Analytics, API Access, Installment Payments, and Priority Support')`);
      } else {
        // Update existing plans if they exist but Standard is missing
        db.get('SELECT COUNT(*) as count FROM subscription_plans WHERE plan_tier = ?', ['standard'], (err, standardCount) => {
          if (!err && standardCount.count === 0) {
            // Add Standard Plan if it doesn't exist
            db.run(`INSERT INTO subscription_plans (plan_name, plan_tier, price, duration_days, features, description) 
                    VALUES ('Standard Plan', 'standard', 49.99, 30, 
                    '["inventory_management","sales","purchases","basic_reports","advanced_reports","expenses","invoices","receipts","multi_user"]', 
                    'Enhanced features for growing businesses - All Basic features plus Advanced Reports, Invoices, Receipts, and Multi-User Support')`);
          }
        });
        
        // Update Basic Plan features if needed
        db.run(`UPDATE subscription_plans 
                SET features = '["inventory_management","sales","purchases","basic_reports","expenses"]',
                    description = 'Essential features for small shops - Inventory, Sales, Purchases, Basic Reports, and Expense Tracking'
                WHERE plan_tier = 'basic' AND (features IS NULL OR features = '')`);
        
        // Update Premium Plan features to include all features
        db.run(`UPDATE subscription_plans 
                SET features = '["inventory_management","sales","purchases","basic_reports","advanced_reports","analytics","multi_user","api_access","expenses","invoices","receipts","installment_payments","priority_support"]',
                    description = 'Full feature set for established businesses - All Standard features plus Analytics, API Access, Installment Payments, and Priority Support'
                WHERE plan_tier = 'premium'`);
      }
      });
    }

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

    // Add shop_id column to categories if it doesn't exist (migration)
    db.run(`ALTER TABLE categories ADD COLUMN shop_id INTEGER`, (err) => {
      if (err && !isDuplicateColumnError(err)) {
        console.error('Error adding shop_id to categories:', err.message);
      }
    });

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

    // Add shop_id column to suppliers if it doesn't exist (migration)
    db.run(`ALTER TABLE suppliers ADD COLUMN shop_id INTEGER`, (err) => {
      if (err && !isDuplicateColumnError(err)) {
        console.error('Error adding shop_id to suppliers:', err.message);
      }
    });

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
    
    // Add missing columns to purchases table if they don't exist (migration)
    db.run(`ALTER TABLE purchases ADD COLUMN shop_id INTEGER`, (err) => {
      if (err && !isDuplicateColumnError(err)) {
        console.error('Error adding shop_id to purchases:', err.message);
      }
    });
    // SQLite doesn't allow DEFAULT CURRENT_TIMESTAMP in ALTER TABLE, so add without default
    db.run(`ALTER TABLE purchases ADD COLUMN created_at DATETIME`, (err) => {
      if (err && !isDuplicateColumnError(err)) {
        console.error('Error adding created_at to purchases:', err.message);
      } else if (!err) {
        // Update existing rows to set created_at from purchase_date
        db.run(`UPDATE purchases SET created_at = purchase_date WHERE created_at IS NULL`, (updateErr) => {
          if (updateErr) {
            console.error('Error updating created_at in purchases:', updateErr.message);
          }
        });
      }
    });
    
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

    // Add missing columns to sales table if they don't exist (migration)
    db.run(`ALTER TABLE sales ADD COLUMN shop_id INTEGER`, (err) => {
      if (err && !isDuplicateColumnError(err)) {
        console.error('Error adding shop_id to sales:', err.message);
      }
    });
    // SQLite doesn't allow DEFAULT CURRENT_TIMESTAMP in ALTER TABLE, so add without default
    db.run(`ALTER TABLE sales ADD COLUMN created_at DATETIME`, (err) => {
      if (err && !isDuplicateColumnError(err)) {
        console.error('Error adding created_at to sales:', err.message);
      } else if (!err) {
        // Update existing rows to set created_at from sale_date
        db.run(`UPDATE sales SET created_at = sale_date WHERE created_at IS NULL`, (updateErr) => {
          if (updateErr) {
            console.error('Error updating created_at in sales:', updateErr.message);
          }
        });
      }
    });
    db.run(`ALTER TABLE sales ADD COLUMN customer_id INTEGER`, (err) => {
      if (err && !isDuplicateColumnError(err)) {
        console.error('Error adding customer_id to sales:', err.message);
      }
    });

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

    // Add shop_id column to expenses if it doesn't exist (migration)
    db.run(`ALTER TABLE expenses ADD COLUMN shop_id INTEGER`, (err) => {
      if (err && !isDuplicateColumnError(err)) {
        console.error('Error adding shop_id to expenses:', err.message);
      }
    });

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

    // Installment Payments table
    db.run(`CREATE TABLE IF NOT EXISTS installment_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      item_id INTEGER NOT NULL,
      total_price REAL NOT NULL,
      down_payment REAL NOT NULL DEFAULT 0,
      paid_amount REAL NOT NULL DEFAULT 0,
      installment_amount REAL NOT NULL,
      number_of_installments INTEGER NOT NULL,
      status TEXT DEFAULT 'active' CHECK(status IN ('active', 'completed', 'cancelled')),
      notes TEXT,
      shop_id INTEGER,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers(id),
      FOREIGN KEY (item_id) REFERENCES items(id),
      FOREIGN KEY (shop_id) REFERENCES shops(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    )`);

    // Installment Payments Payments table (payment history)
    db.run(`CREATE TABLE IF NOT EXISTS installment_payments_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      installment_plan_id INTEGER NOT NULL,
      payment_amount REAL NOT NULL,
      payment_method TEXT NOT NULL,
      payment_date DATE NOT NULL,
      notes TEXT,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (installment_plan_id) REFERENCES installment_payments(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id)
    )`);

    // Add columns for pay-per-visit payment tracking (migration)
    db.run(`ALTER TABLE installment_payments_payments ADD COLUMN payment_type TEXT DEFAULT 'full_contract' CHECK(payment_type IN ('full_contract', 'per_visit'))`, (err) => {
      if (err && !isDuplicateColumnError(err)) {
        console.error('Error adding payment_type to installment_payments_payments:', err.message);
      }
    });
    
    db.run(`ALTER TABLE installment_payments_payments ADD COLUMN service_date DATE`, (err) => {
      if (err && !isDuplicateColumnError(err)) {
        console.error('Error adding service_date to installment_payments_payments:', err.message);
      }
    });
    
    db.run(`ALTER TABLE installment_payments_payments ADD COLUMN receipt_number TEXT`, (err) => {
      if (err && !isDuplicateColumnError(err)) {
        console.error('Error adding receipt_number to installment_payments_payments:', err.message);
      }
    });
    
    db.run(`ALTER TABLE installment_payments_payments ADD COLUMN transaction_reference TEXT`, (err) => {
      if (err && !isDuplicateColumnError(err)) {
        console.error('Error adding transaction_reference to installment_payments_payments:', err.message);
      }
    });
    
    db.run(`ALTER TABLE installment_payments_payments ADD COLUMN is_partial_payment INTEGER DEFAULT 0`, (err) => {
      if (err && !isDuplicateColumnError(err)) {
        console.error('Error adding is_partial_payment to installment_payments_payments:', err.message);
      }
    });
    
    db.run(`ALTER TABLE installment_payments_payments ADD COLUMN expected_amount REAL`, (err) => {
      if (err && !isDuplicateColumnError(err)) {
        console.error('Error adding expected_amount to installment_payments_payments:', err.message);
      }
    });
    
    db.run(`ALTER TABLE installment_payments_payments ADD COLUMN installation_cost REAL DEFAULT 0`, (err) => {
      if (err && !isDuplicateColumnError(err)) {
        console.error('Error adding installation_cost to installment_payments_payments:', err.message);
      }
    });
    
    db.run(`ALTER TABLE installment_payments_payments ADD COLUMN service_fee REAL DEFAULT 0`, (err) => {
      if (err && !isDuplicateColumnError(err)) {
        console.error('Error adding service_fee to installment_payments_payments:', err.message);
      }
    });

    // Create indexes for pay-per-visit queries
    db.run(`CREATE INDEX IF NOT EXISTS idx_installment_payments_payments_type ON installment_payments_payments(payment_type)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_installment_payments_payments_service_date ON installment_payments_payments(service_date)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_installment_payments_payments_receipt ON installment_payments_payments(receipt_number)`);
    db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_installment_payments_payments_receipt_unique ON installment_payments_payments(receipt_number) WHERE receipt_number IS NOT NULL AND receipt_number != ''`);

    // Create indexes for installment payments
    db.run(`CREATE INDEX IF NOT EXISTS idx_installment_payments_customer ON installment_payments(customer_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_installment_payments_item ON installment_payments(item_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_installment_payments_status ON installment_payments(status)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_installment_payments_shop ON installment_payments(shop_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_installment_payments_payments_plan ON installment_payments_payments(installment_plan_id)`);

    // Settings table
    db.run(`CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL,
      value TEXT,
      category TEXT NOT NULL,
      description TEXT,
      shop_id INTEGER,
      is_encrypted INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(key, shop_id),
      FOREIGN KEY (shop_id) REFERENCES shops(id)
    )`);

    // Create indexes for settings
    db.run(`CREATE INDEX IF NOT EXISTS idx_settings_key ON settings(key)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_settings_category ON settings(category)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_settings_shop ON settings(shop_id)`);

    // PERFORMANCE: Create indexes for frequently queried columns
    // Items table indexes
    db.run(`CREATE INDEX IF NOT EXISTS idx_items_shop_id ON items(shop_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_items_category_id ON items(category_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_items_sku ON items(sku)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_items_is_archived ON items(is_archived)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_items_stock_quantity ON items(stock_quantity)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_items_name ON items(name)`);
    
    // Sales table indexes
    db.run(`CREATE INDEX IF NOT EXISTS idx_sales_shop_id ON sales(shop_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales(created_at)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_sales_customer_id ON sales(customer_id)`);
    
    // Sales items indexes
    db.run(`CREATE INDEX IF NOT EXISTS idx_sales_items_sale_id ON sales_items(sale_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_sales_items_item_id ON sales_items(item_id)`);
    
    // Purchases table indexes
    db.run(`CREATE INDEX IF NOT EXISTS idx_purchases_shop_id ON purchases(shop_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_purchases_supplier_id ON purchases(supplier_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_purchases_created_at ON purchases(created_at)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_purchases_status ON purchases(status)`);
    
    // Purchase items indexes
    db.run(`CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase_id ON purchase_items(purchase_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_purchase_items_item_id ON purchase_items(item_id)`);
    
    // Invoices table indexes
    db.run(`CREATE INDEX IF NOT EXISTS idx_invoices_shop_id ON invoices(shop_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_invoices_customer_id ON invoices(customer_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_invoices_created_at ON invoices(created_at)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status)`);
    
    // Invoice items indexes
    db.run(`CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON invoice_items(invoice_id)`);
    
    // Expenses table indexes
    db.run(`CREATE INDEX IF NOT EXISTS idx_expenses_shop_id ON expenses(shop_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_expenses_created_at ON expenses(created_at)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category)`);
    
    // Customers table indexes
    db.run(`CREATE INDEX IF NOT EXISTS idx_customers_shop_id ON customers(shop_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name)`);
    
    // Suppliers table indexes
    db.run(`CREATE INDEX IF NOT EXISTS idx_suppliers_shop_id ON suppliers(shop_id)`);
    
    // Stock adjustments indexes
    db.run(`CREATE INDEX IF NOT EXISTS idx_stock_adjustments_item_id ON stock_adjustments(item_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_stock_adjustments_created_at ON stock_adjustments(created_at)`);
    
    // Item templates indexes
    db.run(`CREATE INDEX IF NOT EXISTS idx_item_templates_shop_id ON item_templates(shop_id)`);
    
    // Users table indexes
    db.run(`CREATE INDEX IF NOT EXISTS idx_users_shop_id ON users(shop_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active)`);
    
    // Categories table indexes
    db.run(`CREATE INDEX IF NOT EXISTS idx_categories_shop_id ON categories(shop_id)`);
    
    // PERFORMANCE: SQLite optimizations
    db.run(`PRAGMA journal_mode = WAL`); // Write-Ahead Logging for better concurrency
    db.run(`PRAGMA synchronous = NORMAL`); // Balance between safety and speed
    db.run(`PRAGMA cache_size = -64000`); // 64MB cache (negative means KB)
    db.run(`PRAGMA temp_store = MEMORY`); // Store temp tables in memory
    db.run(`PRAGMA mmap_size = 268435456`); // 256MB memory-mapped I/O

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

// SECURITY: Get security settings helper
const getSecuritySetting = (key, defaultValue, callback) => {
  if (!db) {
    return callback(null, defaultValue);
  }
  
  db.get(
    'SELECT value FROM settings WHERE key = ? AND (shop_id IS NULL OR shop_id = ?) ORDER BY shop_id DESC LIMIT 1',
    [key, null],
    (err, row) => {
      if (err || !row || !row.value) {
        return callback(null, defaultValue);
      }
      callback(null, row.value);
    }
  );
};

// SECURITY: Password strength validation (uses settings)
// Note: This is a synchronous version that uses default values if settings aren't loaded
// For full settings support, use validatePasswordStrengthAsync
const validatePasswordStrength = (password, shopId = null) => {
  if (!password) {
    return { valid: false, message: 'Password is required' };
  }
  
  // Default values (will be overridden by settings if available)
  const minLength = 8;
  const requireStrong = true; // Default to requiring strong passwords
  
  // Basic length check
  if (password.length < minLength) {
    return { valid: false, message: `Password must be at least ${minLength} characters long` };
  }
  
  // Strong password requirements (if enabled)
  if (requireStrong) {
  if (!/[A-Z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one uppercase letter' };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one lowercase letter' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one number' };
  }
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      return { valid: false, message: 'Password must contain at least one special character' };
    }
  }
  
  return { valid: true };
};

// SECURITY: Async password validation with settings lookup
const validatePasswordStrengthAsync = (password, shopId, callback) => {
  if (!password) {
    return callback({ valid: false, message: 'Password is required' });
  }
  
  if (!db) {
    // Fallback to sync version if DB not available
    return callback(validatePasswordStrength(password));
  }
  
  // Get password settings
  db.get(
    'SELECT value FROM settings WHERE key = ? AND (shop_id IS NULL OR shop_id = ?) ORDER BY shop_id DESC LIMIT 1',
    ['password_min_length', shopId],
    (err, minLengthRow) => {
      if (err) {
        console.error('Error getting password_min_length setting:', err);
      }
      
      db.get(
        'SELECT value FROM settings WHERE key = ? AND (shop_id IS NULL OR shop_id = ?) ORDER BY shop_id DESC LIMIT 1',
        ['require_strong_password', shopId],
        (err2, requireStrongRow) => {
          if (err2) {
            console.error('Error getting require_strong_password setting:', err2);
          }
          
          const minLength = minLengthRow && minLengthRow.value ? parseInt(minLengthRow.value) : 8;
          const requireStrong = requireStrongRow && requireStrongRow.value 
            ? (requireStrongRow.value === 'true' || requireStrongRow.value === true || requireStrongRow.value === 1)
            : true;
          
          if (password.length < minLength) {
            return callback({ valid: false, message: `Password must be at least ${minLength} characters long` });
          }
          
          if (requireStrong) {
            if (!/[A-Z]/.test(password)) {
              return callback({ valid: false, message: 'Password must contain at least one uppercase letter' });
            }
            if (!/[a-z]/.test(password)) {
              return callback({ valid: false, message: 'Password must contain at least one lowercase letter' });
            }
            if (!/[0-9]/.test(password)) {
              return callback({ valid: false, message: 'Password must contain at least one number' });
            }
            if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
              return callback({ valid: false, message: 'Password must contain at least one special character' });
            }
          }
          
          callback({ valid: true });
        }
      );
    }
  );
};

// SECURITY: Check if account is locked (too many failed attempts) - uses settings
const checkAccountLockout = (username, shopId = null, callback) => {
  if (!db) {
    console.error('Database not initialized');
    return callback(new Error('Database not initialized'), false);
  }
  
  // Get lockout settings
  db.get(
    'SELECT value FROM settings WHERE key = ? AND (shop_id IS NULL OR shop_id = ?) ORDER BY shop_id DESC LIMIT 1',
    ['max_login_attempts', shopId],
    (err, maxAttemptsRow) => {
      if (err) {
        console.error('Error getting max_login_attempts setting:', err);
      }
      
      db.get(
        'SELECT value FROM settings WHERE key = ? AND (shop_id IS NULL OR shop_id = ?) ORDER BY shop_id DESC LIMIT 1',
        ['lockout_duration', shopId],
        (err2, lockoutDurationRow) => {
          if (err2) {
            console.error('Error getting lockout_duration setting:', err2);
          }
          
          const maxAttempts = maxAttemptsRow && maxAttemptsRow.value ? parseInt(maxAttemptsRow.value) : 5;
          const lockoutDuration = lockoutDurationRow && lockoutDurationRow.value ? parseInt(lockoutDurationRow.value) : 15;
          const lockoutWindow = lockoutDuration * 60 * 1000; // Convert minutes to milliseconds
          const cutoffTime = new Date(Date.now() - lockoutWindow).toISOString();

  db.all(
    `SELECT COUNT(*) as count FROM login_attempts 
     WHERE username = ? AND success = 0 AND attempt_time > ?`,
    [username, cutoffTime],
            (err3, rows) => {
              if (err3) {
                console.error('Error checking account lockout:', err3);
        return callback(null, false);
      }
      const failedAttempts = rows && rows[0] ? rows[0].count : 0;
              callback(null, failedAttempts >= maxAttempts, { failedAttempts, maxAttempts, lockoutDuration });
            }
          );
        }
      );
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
// Get notification settings (cached to avoid repeated DB queries)
let cachedNotificationSettings = null;
let notificationSettingsCacheTime = 0;
const NOTIFICATION_SETTINGS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getNotificationSettings(shopId = null) {
  return new Promise((resolve, reject) => {
    // Return cached settings if still valid
    const now = Date.now();
    if (cachedNotificationSettings && (now - notificationSettingsCacheTime) < NOTIFICATION_SETTINGS_CACHE_TTL) {
      return resolve(cachedNotificationSettings);
    }

    let query = 'SELECT * FROM settings WHERE key IN (?, ?, ?, ?)';
    const params = ['enable_audit_log', 'audit_log_retention_days', 'low_stock_notification', 'low_stock_threshold'];
    
    if (shopId !== null) {
      query += ' AND (shop_id = ? OR shop_id IS NULL) ORDER BY shop_id DESC';
      params.push(shopId);
    } else {
      query += ' AND shop_id IS NULL';
    }
    
    db.all(query, params, (err, settings) => {
      if (err) {
        return reject(err);
      }
      
      // Convert array to object, prioritizing shop-specific settings
      const settingsMap = new Map();
      settings.forEach(s => {
        const key = s.key;
        if (!settingsMap.has(key) || (s.shop_id !== null && settingsMap.get(key).shop_id === null)) {
          settingsMap.set(key, s.value);
        }
      });
      
      const result = {
        auditLogEnabled: settingsMap.get('enable_audit_log') === 'true' || settingsMap.get('enable_audit_log') === true,
        auditLogRetentionDays: parseInt(settingsMap.get('audit_log_retention_days') || '90', 10),
        lowStockNotificationEnabled: settingsMap.get('low_stock_notification') === 'true' || settingsMap.get('low_stock_notification') === true,
        lowStockThreshold: parseFloat(settingsMap.get('low_stock_threshold') || '20', 10) // Default 20%
      };
      
      cachedNotificationSettings = result;
      notificationSettingsCacheTime = now;
      resolve(result);
    });
  });
}

// Clear notification settings cache (call when settings are updated)
function clearNotificationSettingsCache() {
  cachedNotificationSettings = null;
  notificationSettingsCacheTime = 0;
}

// Check for low stock and send notification if needed
async function checkAndNotifyLowStock(itemId, shopId = null) {
  try {
    const settings = await getNotificationSettings(shopId);
    if (!settings.lowStockNotificationEnabled) {
      return; // Low stock notifications disabled
    }

    // Get item details
    db.get(
      'SELECT id, name, stock_quantity, min_stock_level FROM items WHERE id = ?',
      [itemId],
      async (err, item) => {
        if (err || !item) {
          return;
        }

        // Calculate stock percentage
        const stockPercentage = item.min_stock_level > 0 
          ? (item.stock_quantity / item.min_stock_level) * 100 
          : 100;

        // Check if stock is below threshold
        if (stockPercentage <= settings.lowStockThreshold) {
          // Get email settings to send notification
          let emailQuery = 'SELECT * FROM settings WHERE key LIKE ? AND (shop_id = ? OR shop_id IS NULL) ORDER BY shop_id DESC';
          const emailParams = ['email_%', shopId || null];
          
          db.all(emailQuery, emailParams, async (emailErr, emailSettings) => {
            if (emailErr || !emailSettings || emailSettings.length === 0) {
              return; // Email not configured
            }

            // Group email settings
            const emailSettingsMap = new Map();
            emailSettings.forEach(s => {
              const key = s.key;
              if (!emailSettingsMap.has(key) || (s.shop_id !== null && emailSettingsMap.get(key).shop_id === null)) {
                emailSettingsMap.set(key, s.value);
              }
            });

            // Check if email is enabled
            if (emailSettingsMap.get('email_enabled') !== 'true' && emailSettingsMap.get('email_enabled') !== true) {
              return; // Email notifications disabled
            }

            // Get admin emails to notify
            db.all(
              'SELECT email FROM users WHERE role IN (?, ?) AND email IS NOT NULL AND email != ""',
              ['admin', 'superadmin'],
              async (userErr, admins) => {
                if (userErr || !admins || admins.length === 0) {
                  return; // No admins to notify
                }

                try {
                  const { sendEmail, getEmailConfig } = require('./email-utils');
                  const emailSettingsArray = Array.from(emailSettingsMap.entries()).map(([key, value]) => ({ key, value }));
                  const emailConfig = getEmailConfig(emailSettingsArray);

                  if (!emailConfig) {
                    return;
                  }

                  // Send email to each admin
                  const emailPromises = admins.map(admin => {
                    if (!admin.email) return Promise.resolve();

                    return sendEmail(emailConfig, {
                      to: admin.email,
                      subject: `Low Stock Alert: ${item.name}`,
                      html: `
                        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                          <h2 style="color: #f59e0b;">Low Stock Alert</h2>
                          <p><strong>Item:</strong> ${item.name}</p>
                          <p><strong>Current Stock:</strong> ${item.stock_quantity} units</p>
                          <p><strong>Minimum Stock Level:</strong> ${item.min_stock_level} units</p>
                          <p><strong>Stock Level:</strong> ${stockPercentage.toFixed(1)}% of minimum</p>
                          <p style="color: #ef4444; font-weight: bold;">⚠️ Stock is below the ${settings.lowStockThreshold}% threshold!</p>
                          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;">
                          <p style="color: #64748b; font-size: 12px;">
                            This is an automated notification from your IMS system.<br>
                            Sent at: ${new Date().toLocaleString()}
                          </p>
                        </div>
                      `,
                      text: `Low Stock Alert\n\nItem: ${item.name}\nCurrent Stock: ${item.stock_quantity} units\nMinimum Stock Level: ${item.min_stock_level} units\nStock Level: ${stockPercentage.toFixed(1)}% of minimum\n\n⚠️ Stock is below the ${settings.lowStockThreshold}% threshold!\n\nSent at: ${new Date().toLocaleString()}`
                    }).catch(err => {
                      console.error(`Error sending low stock notification to ${admin.email}:`, err);
                    });
                  });

                  await Promise.all(emailPromises);
                  console.log(`Low stock notification sent for item: ${item.name} (${item.stock_quantity} units)`);
                } catch (emailError) {
                  console.error('Error sending low stock notification:', emailError);
                }
              }
            );
          });
        }
      }
    );
  } catch (error) {
    console.error('Error checking low stock:', error);
  }
}

const logAudit = async (req, action, resourceType = null, resourceId = null, details = null) => {
  try {
    // Check if audit logging is enabled
    const settings = await getNotificationSettings(req.user?.shop_id || null);
    if (!settings.auditLogEnabled) {
      return; // Audit logging disabled, skip
    }
  } catch (error) {
    // If error getting settings, log anyway (fail open)
    console.error('Error checking audit log settings:', error);
  }
  
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

// Clean up old audit logs based on retention setting
async function cleanupAuditLogs() {
  try {
    const settings = await getNotificationSettings(null);
    if (!settings.auditLogEnabled || settings.auditLogRetentionDays <= 0) {
      return;
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - settings.auditLogRetentionDays);

    db.run(
      'DELETE FROM audit_logs WHERE created_at < ?',
      [cutoffDate.toISOString()],
      function(err) {
        if (err) {
          console.error('Error cleaning up audit logs:', err);
        } else if (this.changes > 0) {
          console.log(`Cleaned up ${this.changes} old audit log entries (older than ${settings.auditLogRetentionDays} days)`);
        }
      }
    );
  } catch (error) {
    console.error('Error during audit log cleanup:', error);
  }
}

// Schedule audit log cleanup daily
setInterval(cleanupAuditLogs, 24 * 60 * 60 * 1000); // Run daily

// ==================== AUTOMATIC BACKUP SCHEDULER ====================

let backupIntervalId = null;
let backupCheckIntervalId = null;
let backupCleanupIntervalId = null;

/**
 * Get backup settings from database
 * @param {Number} shopId - Optional shop ID for shop-specific settings
 * @returns {Promise<Object>} Backup settings
 */
function getBackupSettings(shopId = null) {
  return new Promise((resolve, reject) => {
    let query = 'SELECT * FROM settings WHERE key LIKE ?';
    const params = ['backup_%'];
    
    if (shopId !== null) {
      query += ' AND (shop_id = ? OR shop_id IS NULL) ORDER BY shop_id DESC';
      params.push(shopId);
    } else {
      query += ' AND shop_id IS NULL';
    }
    
    db.all(query, params, (err, settings) => {
      if (err) {
        return reject(err);
      }
      
      // Convert array to object, prioritizing shop-specific settings
      const settingsMap = new Map();
      settings.forEach(s => {
        const key = s.key;
        if (!settingsMap.has(key) || (s.shop_id !== null && settingsMap.get(key).shop_id === null)) {
          settingsMap.set(key, s.value);
        }
      });
      
      resolve({
        enabled: settingsMap.get('backup_auto_enabled') === 'true' || settingsMap.get('backup_auto_enabled') === true,
        frequency: settingsMap.get('backup_frequency') || 'daily',
        retentionDays: parseInt(settingsMap.get('backup_retention_days') || '30', 10),
        location: settingsMap.get('backup_location') || 'local'
      });
    });
  });
}

/**
 * Perform automatic backup
 */
async function performAutomaticBackup() {
  try {
    if (!db) {
      console.error('Cannot perform backup - database not available');
      return;
    }

    // Get backup settings (for now, use global settings)
    const settings = await getBackupSettings(null);
    
    if (!settings.enabled) {
      console.log('Automatic backups are disabled');
      return;
    }

    const backupDir = path.join(__dirname, 'backups');
    const dbPath = DB_PATH;

    // Create backup
    const backupInfo = await createBackup(dbPath, backupDir);
    console.log(`Automatic backup created: ${backupInfo.filename}`);

    // Clean up old backups
    if (settings.retentionDays > 0) {
      await cleanupOldBackups(backupDir, settings.retentionDays);
    }

    // Note: backup_location 'cloud' is not yet implemented
    // For now, all backups are stored locally
    if (settings.location === 'cloud') {
      console.log('Cloud backup location is configured but not yet implemented');
    }
  } catch (error) {
    console.error('Error performing automatic backup:', error);
  }
}

/**
 * Schedule automatic backups based on settings
 */
async function scheduleAutomaticBackups() {
  try {
    // Clear existing intervals
    if (backupIntervalId) {
      clearInterval(backupIntervalId);
      backupIntervalId = null;
    }
    if (backupCheckIntervalId) {
      clearInterval(backupCheckIntervalId);
      backupCheckIntervalId = null;
    }
    if (backupCleanupIntervalId) {
      clearInterval(backupCleanupIntervalId);
      backupCleanupIntervalId = null;
    }

    // Get backup settings
    const settings = await getBackupSettings(null);
    
    if (!settings.enabled) {
      console.log('Automatic backups are disabled in settings');
      return;
    }

    // Perform initial backup check (backup if needed based on last backup time)
    const backupDir = path.join(__dirname, 'backups');
    if (fs.existsSync(backupDir)) {
      const files = fs.readdirSync(backupDir)
        .filter(file => file.endsWith('.db') && file.startsWith('ims_backup_'))
        .map(file => {
          const filePath = path.join(backupDir, file);
          const stats = fs.statSync(filePath);
          return {
            filename: file,
            created_at: stats.birthtime
          };
        })
        .sort((a, b) => b.created_at - a.created_at);

      if (files.length > 0) {
        const lastBackup = files[0];
        const lastBackupTime = lastBackup.created_at.getTime();
        const now = Date.now();
        const interval = getBackupInterval(settings.frequency);
        
        // Only backup if enough time has passed since last backup
        if (now - lastBackupTime < interval) {
          const nextBackup = new Date(lastBackupTime + interval);
          console.log(`Last backup was recent. Next automatic backup scheduled for: ${nextBackup.toLocaleString()}`);
        } else {
          // Perform backup now
          await performAutomaticBackup();
        }
      } else {
        // No backups exist, create one now
        await performAutomaticBackup();
      }
    } else {
      // No backup directory, create first backup
      await performAutomaticBackup();
    }

    // Schedule periodic backups based on frequency
    const interval = getBackupInterval(settings.frequency);
    backupIntervalId = setInterval(async () => {
      await performAutomaticBackup();
    }, interval);

    console.log(`Automatic backups scheduled: ${settings.frequency} (every ${interval / 1000 / 60 / 60} hours)`);

    // Schedule periodic cleanup (daily)
    const cleanupInterval = 24 * 60 * 60 * 1000; // 24 hours
    backupCleanupIntervalId = setInterval(async () => {
      try {
        const currentSettings = await getBackupSettings(null);
        if (currentSettings.enabled && currentSettings.retentionDays > 0) {
          const backupDir = path.join(__dirname, 'backups');
          await cleanupOldBackups(backupDir, currentSettings.retentionDays);
        }
      } catch (error) {
        console.error('Error during scheduled backup cleanup:', error);
      }
    }, cleanupInterval);

    // Check for settings changes every hour and reschedule if needed
    backupCheckIntervalId = setInterval(async () => {
      try {
        const currentSettings = await getBackupSettings(null);
        if (!currentSettings.enabled && backupIntervalId) {
          console.log('Automatic backups disabled - stopping scheduler');
          clearInterval(backupIntervalId);
          backupIntervalId = null;
        } else if (currentSettings.enabled && !backupIntervalId) {
          console.log('Automatic backups enabled - starting scheduler');
          await scheduleAutomaticBackups();
        }
      } catch (error) {
        console.error('Error checking backup settings:', error);
      }
    }, 60 * 60 * 1000); // Check every hour

  } catch (error) {
    console.error('Error scheduling automatic backups:', error);
  }
}

// Start automatic backup scheduler after database is initialized
// Wait a bit for database to be ready
setTimeout(() => {
  if (db) {
    scheduleAutomaticBackups().catch(err => {
      console.error('Failed to start automatic backup scheduler:', err);
    });
  }
}, 5000); // Wait 5 seconds after server start

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

    // SECURITY: Check account lockout (get shop_id from user if available)
    db.get('SELECT shop_id FROM users WHERE username = ?', [username], (err, userRow) => {
      try {
        const shopId = userRow ? userRow.shop_id : null;
        checkAccountLockout(username, shopId, (err, isLocked, lockoutInfo) => {
      try {
        if (err) {
          console.error('Error in checkAccountLockout:', err);
          console.error('Error stack:', err.stack);
          // Continue with login attempt even if lockout check fails
        }
        if (isLocked) {
              const lockoutMsg = lockoutInfo 
                ? `Account temporarily locked due to too many failed login attempts (${lockoutInfo.failedAttempts}/${lockoutInfo.maxAttempts}). Please try again after ${lockoutInfo.lockoutDuration} minutes.`
                : 'Account temporarily locked due to too many failed login attempts. Please try again later.';
          console.log(`[LOGIN BLOCKED] Account locked for user: ${username} from IP: ${ipAddress} - too many failed attempts`);
          recordLoginAttempt(username, ipAddress, false);
              return sendResponse(429, { error: lockoutMsg });
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
          console.error('Error in lockout check callback:', lockoutErr);
          console.error('Error stack:', lockoutErr.stack);
          // Continue with login attempt even if lockout check fails
        }
      });
      } catch (userRowErr) {
        console.error('Error fetching user shop_id:', userRowErr);
        // Fallback: check lockout without shop_id
        checkAccountLockout(username, null, (err, isLocked, lockoutInfo) => {
          if (isLocked) {
            const lockoutMsg = lockoutInfo 
              ? `Account temporarily locked due to too many failed login attempts (${lockoutInfo.failedAttempts}/${lockoutInfo.maxAttempts}). Please try again after ${lockoutInfo.lockoutDuration} minutes.`
              : 'Account temporarily locked due to too many failed login attempts. Please try again later.';
          recordLoginAttempt(username, ipAddress, false);
            return sendResponse(429, { error: lockoutMsg });
          }
          // If not locked, continue with normal login flow
          db.get('SELECT * FROM users WHERE username = ? AND is_active = 1', [username], (err, user) => {
            if (err || !user) {
              recordLoginAttempt(username, ipAddress, false);
              return sendResponse(401, { error: 'Invalid credentials' });
            }
            // Continue with password check...
            bcrypt.compare(password, user.password, (err, match) => {
              if (err || !match) {
                recordLoginAttempt(username, ipAddress, false);
                return sendResponse(401, { error: 'Invalid credentials' });
              }
              // Successful login - generate tokens
              recordLoginAttempt(username, ipAddress, true);
              try {
                const tokenPayload = { id: user.id, username: user.username, role: user.role };
                if (user.shop_id) tokenPayload.shop_id = user.shop_id;
                const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
                const refreshToken = generateRefreshToken();
                const expiresAt = new Date();
                expiresAt.setDate(expiresAt.getDate() + 7);
                db.run('INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)',
                  [user.id, refreshToken, expiresAt.toISOString()], () => {});
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
                recordLoginAttempt(username, ipAddress, false);
                return sendResponse(500, { error: 'Failed to generate authentication token' });
              }
            });
          });
        });
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

// Get shops with their subscription information (superadmin only) - MUST come before /api/shops/:id
app.get('/api/shops/subscriptions', authenticateToken, requireRole('superadmin'), (req, res) => {
  console.log('GET /api/shops/subscriptions - Route hit');
  // Check if subscription_plans table exists, if not return shops without plan details
  db.all(`SELECT s.*, 
          COALESCE(sp.plan_name, 'Basic Plan') as plan_name, 
          COALESCE(sp.plan_tier, 'basic') as plan_tier, 
          COALESCE(sp.features, '[]') as plan_features, 
          COALESCE(sp.description, 'Basic plan') as plan_description
          FROM shops s
          LEFT JOIN subscription_plans sp ON s.subscription_plan = sp.plan_tier
          ORDER BY s.shop_name`, [], (err, shops) => {
    if (err) {
      // If JOIN fails (table doesn't exist), try without JOIN
      console.warn('Error joining subscription_plans, trying without JOIN:', err.message);
      db.all('SELECT * FROM shops ORDER BY shop_name', [], (err2, shops2) => {
        if (err2) {
          return res.status(500).json({ error: sanitizeError(err2) });
        }
        
        const formattedShops = shops2.map(shop => ({
          ...shop,
          subscription_plan: shop.subscription_plan || 'basic',
          plan_name: 'Basic Plan',
          plan_tier: shop.subscription_plan || 'basic',
          plan_features: [],
          plan_description: 'Basic plan'
        }));
        
        res.json(formattedShops);
      });
      return;
    }
    
    const formattedShops = shops.map(shop => {
      let planFeatures = [];
      try {
        planFeatures = shop.plan_features ? JSON.parse(shop.plan_features) : [];
      } catch (e) {
        planFeatures = [];
      }
      
      return {
        ...shop,
        subscription_plan: shop.subscription_plan || 'basic',
        plan_features: planFeatures
      };
    });
    
    res.json(formattedShops);
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

// Get shop statistics for a specific shop
app.get('/api/shops/:id/statistics', authenticateToken, requireRole('admin'), (req, res) => {
  const shopId = parseInt(req.params.id);
  
  if (req.user.role !== 'superadmin' && req.user.shop_id !== shopId) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  
  const today = new Date().toISOString().split('T')[0];
  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
  
  // Get total items
  db.get('SELECT COUNT(*) as count FROM items WHERE shop_id = ?', [shopId], (err, itemsResult) => {
    if (err) {
      return res.status(500).json({ error: sanitizeError(err) });
    }
    
    const totalItems = itemsResult.count || 0;
    
    // Get low stock items (stock_quantity <= min_stock_level)
    db.get(`SELECT COUNT(*) as count FROM items 
            WHERE shop_id = ? AND stock_quantity <= min_stock_level AND stock_quantity > 0`, [shopId], (err, lowStockResult) => {
      if (err) {
        return res.status(500).json({ error: sanitizeError(err) });
      }
      
      const lowStockItems = lowStockResult.count || 0;
      
      // Get today's sales
      db.get(`SELECT COUNT(*) as count, COALESCE(SUM(total_amount), 0) as total 
              FROM sales WHERE shop_id = ? AND DATE(created_at) = ?`, [shopId, today], (err, todaySalesResult) => {
        if (err) {
          return res.status(500).json({ error: sanitizeError(err) });
        }
        
        const todaySales = {
          count: todaySalesResult.count || 0,
          total: parseFloat(todaySalesResult.total || 0)
        };
        
        // Get this month's sales
        db.get(`SELECT COUNT(*) as count, COALESCE(SUM(total_amount), 0) as total 
                FROM sales WHERE shop_id = ? AND DATE(created_at) >= ?`, [shopId, startOfMonth], (err, monthSalesResult) => {
          if (err) {
            return res.status(500).json({ error: sanitizeError(err) });
          }
          
          const monthSales = {
            count: monthSalesResult.count || 0,
            total: parseFloat(monthSalesResult.total || 0)
          };
          
          // Get today's purchases
          db.get(`SELECT COUNT(*) as count, COALESCE(SUM(total_amount), 0) as total 
                  FROM purchases WHERE shop_id = ? AND DATE(created_at) = ?`, [shopId, today], (err, todayPurchasesResult) => {
            if (err) {
              return res.status(500).json({ error: sanitizeError(err) });
            }
            
            const todayPurchases = {
              count: todayPurchasesResult.count || 0,
              total: parseFloat(todayPurchasesResult.total || 0)
            };
            
            // Get total users
            db.get('SELECT COUNT(*) as count FROM users WHERE shop_id = ? AND is_active = 1', [shopId], (err, usersResult) => {
              if (err) {
                return res.status(500).json({ error: sanitizeError(err) });
              }
              
              const totalUsers = usersResult.count || 0;
              
              // Get total categories
              db.get('SELECT COUNT(*) as count FROM categories', [], (err, categoriesResult) => {
                if (err) {
                  return res.status(500).json({ error: sanitizeError(err) });
                }
                
                const totalCategories = categoriesResult.count || 0;
                
                res.json({
                  totalItems,
                  lowStockItems,
                  todaySales,
                  monthSales,
                  todayPurchases,
                  totalUsers,
                  totalCategories
                });
              });
            });
          });
        });
      });
    });
  });
});

// Get statistics summary for all shops (superadmin only)
app.get('/api/shops/statistics/summary', authenticateToken, requireRole('superadmin'), (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
  
  // Get all shops
  db.all('SELECT id, shop_name, shop_code FROM shops WHERE is_active = 1 ORDER BY shop_name', [], (err, shops) => {
    if (err) {
      return res.status(500).json({ error: sanitizeError(err) });
    }
    
    if (shops.length === 0) {
      return res.json([]);
    }
    
    const shopStatsPromises = shops.map(shop => {
      return new Promise((resolve, reject) => {
        const shopId = shop.id;
        
        // Get total items
        db.get('SELECT COUNT(*) as count FROM items WHERE shop_id = ?', [shopId], (err, itemsResult) => {
          if (err) return reject(err);
          
          const total_items = itemsResult.count || 0;
          
          // Get low stock items (stock_quantity <= min_stock_level)
          db.get(`SELECT COUNT(*) as count FROM items 
                  WHERE shop_id = ? AND stock_quantity <= min_stock_level AND stock_quantity > 0`, [shopId], (err, lowStockResult) => {
            if (err) return reject(err);
            
            const low_stock_items = lowStockResult.count || 0;
            
            // Get today's sales
            db.get(`SELECT COALESCE(SUM(total_amount), 0) as total 
                    FROM sales WHERE shop_id = ? AND DATE(created_at) = ?`, [shopId, today], (err, todaySalesResult) => {
              if (err) return reject(err);
              
              const today_sales = parseFloat(todaySalesResult.total || 0);
              
              // Get this month's sales
              db.get(`SELECT COALESCE(SUM(total_amount), 0) as total 
                      FROM sales WHERE shop_id = ? AND DATE(created_at) >= ?`, [shopId, startOfMonth], (err, monthSalesResult) => {
                if (err) return reject(err);
                
                const month_sales = parseFloat(monthSalesResult.total || 0);
                
                // Get total users
                db.get('SELECT COUNT(*) as count FROM users WHERE shop_id = ? AND is_active = 1', [shopId], (err, usersResult) => {
                  if (err) return reject(err);
                  
                  const total_users = usersResult.count || 0;
                  
                  resolve({
                    id: shopId,
                    shop_name: shop.shop_name,
                    shop_code: shop.shop_code,
                    total_items,
                    low_stock_items,
                    today_sales,
                    month_sales,
                    total_users
                  });
                });
              });
            });
          });
        });
      });
    });
    
    Promise.all(shopStatsPromises)
      .then(results => {
        res.json(results);
      })
      .catch(error => {
        res.status(500).json({ error: sanitizeError(error) });
      });
      });
});

// ==================== SUBSCRIPTION PLANS ROUTES ====================

// Get all subscription plans (superadmin only)
app.get('/api/subscription-plans', authenticateToken, requireRole('superadmin'), (req, res) => {
  db.all('SELECT * FROM subscription_plans WHERE is_active = 1 ORDER BY plan_tier', [], (err, plans) => {
    if (err) {
      return res.status(500).json({ error: sanitizeError(err) });
    }
    
    // Parse features JSON for each plan
    const formattedPlans = plans.map(plan => ({
      ...plan,
      features: JSON.parse(plan.features || '[]'),
      price: parseFloat(plan.price || 0)
    }));
    
    res.json(formattedPlans);
  });
});

// Get single subscription plan (superadmin only)
app.get('/api/subscription-plans/:id', authenticateToken, requireRole('superadmin'), (req, res) => {
  const planId = parseInt(req.params.id);
  
  db.get('SELECT * FROM subscription_plans WHERE id = ?', [planId], (err, plan) => {
    if (err) {
      return res.status(500).json({ error: sanitizeError(err) });
    }
    if (!plan) {
      return res.status(404).json({ error: 'Subscription plan not found' });
    }
    
    plan.features = JSON.parse(plan.features || '[]');
    plan.price = parseFloat(plan.price || 0);
    res.json(plan);
  });
});

// Assign subscription plan to shop (superadmin only)
app.put('/api/shops/:id/subscription', authenticateToken, requireRole('superadmin'), (req, res) => {
  const shopId = parseInt(req.params.id);
  const { plan_tier, expires_at, enabled_features } = req.body;
  
  if (!shopId || isNaN(shopId)) {
    return res.status(400).json({ error: 'Invalid shop ID' });
  }
  
  if (!plan_tier || !['basic', 'standard', 'premium'].includes(plan_tier)) {
    return res.status(400).json({ error: 'Invalid plan tier. Must be "basic", "standard", or "premium"' });
  }
  
  // Check if shop exists
  db.get('SELECT * FROM shops WHERE id = ?', [shopId], (err, shop) => {
    if (err) {
      return res.status(500).json({ error: sanitizeError(err) });
    }
    if (!shop) {
      return res.status(404).json({ error: 'Shop not found' });
    }
    
    // Parse expires_at date
    let expiresAt = null;
    if (expires_at) {
      expiresAt = new Date(expires_at).toISOString();
    } else {
      // Default: 30 days from now
      const defaultExpiry = new Date();
      defaultExpiry.setDate(defaultExpiry.getDate() + 30);
      expiresAt = defaultExpiry.toISOString();
    }
    
    // Update shop subscription
    db.run(
      'UPDATE shops SET subscription_plan = ?, subscription_expires_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [plan_tier, expiresAt, shopId],
      function(err) {
        if (err) {
          return res.status(500).json({ error: sanitizeError(err) });
        }
        
        // Store enabled features in settings if provided
        if (enabled_features && Array.isArray(enabled_features)) {
          // Delete existing feature settings for this shop
          db.run('DELETE FROM settings WHERE key LIKE ? AND shop_id = ?', ['feature_%', shopId], (err) => {
            if (err) {
              console.error('Error clearing feature settings:', err);
            }
            
            // Insert enabled features
            const featureSettings = enabled_features.map(feature => ({
              key: `feature_${feature}`,
              value: 'true',
              category: 'subscription',
              shop_id: shopId
            }));
            
            // Insert features one by one
            let completed = 0;
            if (featureSettings.length === 0) {
              logAudit(req, 'SHOP_SUBSCRIPTION_UPDATED', 'shop', shopId, { plan_tier, expires_at: expiresAt });
              return res.json({ message: 'Subscription plan updated successfully' });
            }
            
            featureSettings.forEach((setting, index) => {
              db.run(
                'INSERT INTO settings (key, value, category, shop_id) VALUES (?, ?, ?, ?)',
                [setting.key, setting.value, setting.category, setting.shop_id],
                (err) => {
                  if (err) {
                    console.error(`Error saving feature ${setting.key}:`, err);
                  }
                  completed++;
                  if (completed === featureSettings.length) {
                    logAudit(req, 'SHOP_SUBSCRIPTION_UPDATED', 'shop', shopId, { plan_tier, expires_at: expiresAt, enabled_features });
                    res.json({ message: 'Subscription plan updated successfully' });
                  }
                }
              );
            });
          });
        } else {
          logAudit(req, 'SHOP_SUBSCRIPTION_UPDATED', 'shop', shopId, { plan_tier, expires_at: expiresAt });
          res.json({ message: 'Subscription plan updated successfully' });
        }
      }
    );
  });
});

// Get shop subscription details with enabled features (superadmin only)
app.get('/api/shops/:id/subscription', authenticateToken, requireRole('superadmin'), (req, res) => {
  const shopId = parseInt(req.params.id);
  
  db.get(`SELECT s.*, sp.plan_name, sp.plan_tier, sp.features as plan_features, sp.description as plan_description
          FROM shops s
          LEFT JOIN subscription_plans sp ON s.subscription_plan = sp.plan_tier
          WHERE s.id = ?`, [shopId], (err, shop) => {
    if (err) {
      return res.status(500).json({ error: sanitizeError(err) });
    }
    if (!shop) {
      return res.status(404).json({ error: 'Shop not found' });
    }
    
    // Get enabled features from settings
    db.all('SELECT key, value FROM settings WHERE shop_id = ? AND key LIKE ?', [shopId, 'feature_%'], (err, featureSettings) => {
      if (err) {
        return res.status(500).json({ error: sanitizeError(err) });
      }
      
      const enabledFeatures = featureSettings
        .filter(s => s.value === 'true' || s.value === true)
        .map(s => s.key.replace('feature_', ''));
      
      const planFeatures = shop.plan_features ? JSON.parse(shop.plan_features) : [];
      
      res.json({
        shop_id: shop.id,
        shop_name: shop.shop_name,
        shop_code: shop.shop_code,
        subscription_plan: shop.subscription_plan || 'basic',
        subscription_expires_at: shop.subscription_expires_at,
        plan_name: shop.plan_name,
        plan_tier: shop.plan_tier,
        plan_features: planFeatures,
        enabled_features: enabledFeatures,
        available_features: planFeatures
      });
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
    query += ` WHERE (u.shop_id = ? OR u.shop_id IS NULL)`;
    params.push(shopFilter.shop_id);
  } else if (req.user.role !== 'superadmin' && req.user.shop_id) {
    // Non-superadmin users only see purchases from their shop or purchases from users with no shop
    query += ` WHERE (u.shop_id = ? OR u.shop_id IS NULL)`;
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
    'INSERT INTO purchases (supplier_id, total_amount, created_by, notes, delivery_date, status, purchase_date, created_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
    [supplier_id, total_amount, created_by, notes, deliveryDate, orderStatus],
    function(err) {
      if (err) {
        console.error('Error creating purchase:', err);
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
            db.run('UPDATE items SET stock_quantity = stock_quantity + ? WHERE id = ?', [item.quantity, item.item_id], async (stockErr) => {
              if (!stockErr) {
                // Check for low stock after update (though purchase increases stock, we still check in case it was very low)
                checkAndNotifyLowStock(item.item_id, req.user?.shop_id || null).catch(err => {
                  console.error('Error checking low stock:', err);
                });
              }
            });
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
      // Include sales from the selected shop OR sales where creator has no shop_id
      whereConditions.push(`(u.shop_id = ? OR u.shop_id IS NULL)`);
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
            retryConditions.push(`(u.shop_id = ? OR u.shop_id IS NULL)`);
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
          'INSERT INTO sales (total_amount, customer_name, created_by, notes, created_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)',
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
                  db.run('UPDATE items SET stock_quantity = stock_quantity - ? WHERE id = ?', [item.quantity, item.item_id], async (stockErr) => {
                    if (stockErr) {
                      console.error('Error updating stock:', stockErr);
                    } else {
                      // Check for low stock after update
                      checkAndNotifyLowStock(item.item_id, req.user?.shop_id || null).catch(err => {
                        console.error('Error checking low stock:', err);
                      });
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

// PERFORMANCE: Configure multer for optimized file uploads
const uploadsDir = path.join(__dirname, 'public', 'uploads', 'returns');

// Ensure uploads directory exists (only runs once at startup, so sync is OK)
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Use memory storage for faster processing (then write to disk)
const storage = multer.memoryStorage();

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit (reduced for faster uploads)
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

// Upload return image endpoint - Optimized for performance
app.post('/api/sales/return/upload-image', authenticateToken, requireRole('admin', 'sales', 'manager'), upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image file provided' });
  }

  try {
    // Generate unique filename
    const uniqueSuffix = Date.now() + '-' + uuidv4().substring(0, 8);
    const ext = path.extname(req.file.originalname) || '.jpg';
    const filename = `return-${uniqueSuffix}${ext}`;
    const filePath = path.join(uploadsDir, filename);

    // PERFORMANCE: Write file asynchronously (non-blocking)
    fs.writeFile(filePath, req.file.buffer, (err) => {
      if (err) {
        console.error('Error saving image:', err);
        return res.status(500).json({ error: 'Failed to save image' });
      }

      // Return the relative path from public directory immediately
      const imagePath = `/uploads/returns/${filename}`;
      res.json({ image_path: imagePath });
    });
  } catch (error) {
    console.error('Error processing image upload:', error);
    res.status(500).json({ error: 'Failed to process image upload' });
  }
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
          'INSERT INTO sales (sale_date, total_amount, customer_name, created_by, notes, is_return, original_sale_id, return_info, image_path, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)',
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

// ==================== INSTALLMENT PAYMENTS ROUTES ====================

// Get all installment plans
app.get('/api/installment-payments', authenticateToken, (req, res) => {
  const shopFilter = getShopFilter(req);
  let query = `
    SELECT ip.*,
           c.name as customer_name,
           i.name as item_name,
           i.sku as item_sku,
           COALESCE(SUM(ipm.payment_amount), ip.paid_amount) as paid_amount
    FROM installment_payments ip
    LEFT JOIN customers c ON ip.customer_id = c.id
    LEFT JOIN items i ON ip.item_id = i.id
    LEFT JOIN installment_payments_payments ipm ON ip.id = ipm.installment_plan_id
  `;
  const params = [];
  const conditions = [];
  
  // Filter by shop_id if provided (for superadmin)
  if (shopFilter.shop_id && req.user.role === 'superadmin') {
    conditions.push('ip.shop_id = ?');
    params.push(shopFilter.shop_id);
  } else if (req.user.role !== 'superadmin' && req.user.shop_id) {
    // Non-superadmin users only see plans from their shop
    conditions.push('ip.shop_id = ?');
    params.push(req.user.shop_id);
  }
  
  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }
  
  query += ' GROUP BY ip.id ORDER BY ip.created_at DESC';
  
  db.all(query, params, (err, plans) => {
    if (err) {
      return res.status(500).json({ error: sanitizeError(err) });
    }
    // Ensure paid_amount is a number
    const formattedPlans = plans.map(plan => ({
      ...plan,
      paid_amount: parseFloat(plan.paid_amount || 0)
    }));
    res.json(formattedPlans);
  });
});

// Get single installment plan
app.get('/api/installment-payments/:id', authenticateToken, (req, res) => {
  const id = req.params.id;
  const shopFilter = getShopFilter(req);
  
  let query = `
    SELECT ip.*,
           c.name as customer_name,
           c.email as customer_email,
           c.phone as customer_phone,
           c.address as customer_address,
           i.name as item_name,
           i.sku as item_sku,
           i.unit_price as item_unit_price,
           COALESCE(SUM(ipm.payment_amount), ip.paid_amount) as paid_amount
    FROM installment_payments ip
    LEFT JOIN customers c ON ip.customer_id = c.id
    LEFT JOIN items i ON ip.item_id = i.id
    LEFT JOIN installment_payments_payments ipm ON ip.id = ipm.installment_plan_id
    WHERE ip.id = ?
  `;
  const params = [id];
  
  // Add shop filter for non-superadmin
  if (req.user.role !== 'superadmin' && req.user.shop_id) {
    query += ' AND ip.shop_id = ?';
    params.push(req.user.shop_id);
  } else if (shopFilter.shop_id && req.user.role === 'superadmin') {
    query += ' AND ip.shop_id = ?';
    params.push(shopFilter.shop_id);
  }
  
  query += ' GROUP BY ip.id';
  
  db.get(query, params, (err, plan) => {
    if (err) {
      return res.status(500).json({ error: sanitizeError(err) });
    }
    if (!plan) {
      return res.status(404).json({ error: 'Installment plan not found' });
    }
    // Ensure paid_amount is a number
    plan.paid_amount = parseFloat(plan.paid_amount || 0);
    res.json(plan);
  });
});

// Create new installment plan
app.post('/api/installment-payments', authenticateToken, requireRole('admin', 'sales'), (req, res) => {
  const { customer_id, item_id, total_price, down_payment, installment_amount, number_of_installments, notes } = req.body;
  const shopFilter = getShopFilter(req);
  const shopId = shopFilter.shop_id || req.user.shop_id || null;
  
  // Validate required fields
  if (!customer_id || !item_id || !total_price || down_payment === undefined || !installment_amount || !number_of_installments) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  // Validate business logic
  if (down_payment >= total_price) {
    return res.status(400).json({ error: 'Down payment must be less than total price' });
  }
  
  if (down_payment < 0 || installment_amount <= 0 || number_of_installments < 1) {
    return res.status(400).json({ error: 'Invalid payment amounts or number of installments' });
  }
  
  db.run(
    `INSERT INTO installment_payments 
     (customer_id, item_id, total_price, down_payment, paid_amount, installment_amount, number_of_installments, status, notes, shop_id, created_by) 
     VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
    [customer_id, item_id, total_price, down_payment, down_payment, installment_amount, number_of_installments, notes || null, shopId, req.user.id],
    function(err) {
      if (err) {
        return res.status(500).json({ error: sanitizeError(err) });
      }
      
      // If down payment > 0, record it as first payment
      if (down_payment > 0) {
        db.run(
          `INSERT INTO installment_payments_payments 
           (installment_plan_id, payment_amount, payment_method, payment_date, notes, created_by) 
           VALUES (?, ?, 'cash', DATE('now'), ?, ?)`,
          [this.lastID, down_payment, notes ? 'Down payment: ' + notes : 'Down payment', req.user.id],
          (paymentErr) => {
            if (paymentErr) {
              console.error('Error recording down payment:', paymentErr);
            }
          }
        );
      }
      
      res.json({ id: this.lastID, message: 'Installment plan created successfully' });
    }
  );
});

// Update installment plan
app.put('/api/installment-payments/:id', authenticateToken, requireRole('admin', 'sales'), (req, res) => {
  const id = req.params.id;
  const { customer_id, item_id, total_price, down_payment, installment_amount, number_of_installments, notes } = req.body;
  const shopFilter = getShopFilter(req);
  
  // Validate required fields
  if (!customer_id || !item_id || !total_price || down_payment === undefined || !installment_amount || !number_of_installments) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  // Check if plan exists and user has permission
  let checkQuery = 'SELECT * FROM installment_payments WHERE id = ?';
  const checkParams = [id];
  
  if (req.user.role !== 'superadmin' && req.user.shop_id) {
    checkQuery += ' AND shop_id = ?';
    checkParams.push(req.user.shop_id);
  } else if (shopFilter.shop_id && req.user.role === 'superadmin') {
    checkQuery += ' AND shop_id = ?';
    checkParams.push(shopFilter.shop_id);
  }
  
  db.get(checkQuery, checkParams, (err, plan) => {
    if (err) {
      return res.status(500).json({ error: sanitizeError(err) });
    }
    if (!plan) {
      return res.status(404).json({ error: 'Installment plan not found' });
    }
    
    // Don't allow editing completed or cancelled plans
    if (plan.status === 'completed' || plan.status === 'cancelled') {
      return res.status(400).json({ error: 'Cannot edit completed or cancelled plans' });
    }
    
    // Validate business logic
    if (down_payment >= total_price) {
      return res.status(400).json({ error: 'Down payment must be less than total price' });
    }
    
    // Get current paid amount (excluding down payment that might change)
    const currentPaid = parseFloat(plan.paid_amount || 0);
    const currentDownPayment = parseFloat(plan.down_payment || 0);
    const paymentsAfterDownPayment = currentPaid - currentDownPayment;
    const newPaidAmount = down_payment + paymentsAfterDownPayment;
    
    // Update plan
    db.run(
      `UPDATE installment_payments 
       SET customer_id = ?, item_id = ?, total_price = ?, down_payment = ?, paid_amount = ?, 
           installment_amount = ?, number_of_installments = ?, notes = ?, updated_at = CURRENT_TIMESTAMP 
       WHERE id = ?`,
      [customer_id, item_id, total_price, down_payment, newPaidAmount, installment_amount, number_of_installments, notes || null, id],
      function(updateErr) {
        if (updateErr) {
          return res.status(500).json({ error: sanitizeError(updateErr) });
        }
        if (this.changes === 0) {
          return res.status(404).json({ error: 'Installment plan not found' });
        }
        
        // Check if plan is now completed
        if (newPaidAmount >= total_price) {
          db.run('UPDATE installment_payments SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', ['completed', id], (statusErr) => {
            if (statusErr) {
              console.error('Error updating plan status:', statusErr);
            }
          });
        }
        
        res.json({ message: 'Installment plan updated successfully' });
      }
    );
  });
});

// Delete installment plan
app.delete('/api/installment-payments/:id', authenticateToken, requireRole('admin', 'sales'), (req, res) => {
  const id = req.params.id;
  const shopFilter = getShopFilter(req);
  
  let query = 'DELETE FROM installment_payments WHERE id = ?';
  const params = [id];
  
  // Add shop filter for non-superadmin
  if (req.user.role !== 'superadmin' && req.user.shop_id) {
    query += ' AND shop_id = ?';
    params.push(req.user.shop_id);
  } else if (shopFilter.shop_id && req.user.role === 'superadmin') {
    query += ' AND shop_id = ?';
    params.push(shopFilter.shop_id);
  }
  
  db.run(query, params, function(err) {
    if (err) {
      return res.status(500).json({ error: sanitizeError(err) });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Installment plan not found' });
    }
    res.json({ message: 'Installment plan deleted successfully' });
  });
});

// Record payment for installment plan
app.post('/api/installment-payments/payments', authenticateToken, requireRole('admin', 'sales'), (req, res) => {
  const { 
    installment_plan_id, 
    payment_amount, 
    payment_method, 
    payment_date, 
    notes,
    // Pay-per-visit specific fields
    payment_type = 'full_contract', // 'full_contract' or 'per_visit'
    service_date, // Required for per_visit payments
    receipt_number,
    transaction_reference,
    is_partial_payment = false,
    expected_amount, // Required for partial payments
    installation_cost = 0,
    service_fee = 0
  } = req.body;
  const shopFilter = getShopFilter(req);
  
  // Validate required fields
  if (!installment_plan_id || !payment_amount || !payment_method || !payment_date) {
    return res.status(400).json({ error: 'Missing required fields: installment_plan_id, payment_amount, payment_method, and payment_date are required' });
  }
  
  if (payment_amount <= 0) {
    return res.status(400).json({ error: 'Payment amount must be greater than 0' });
  }
  
  // Validate payment type
  if (payment_type !== 'full_contract' && payment_type !== 'per_visit') {
    return res.status(400).json({ error: 'Invalid payment_type. Must be "full_contract" or "per_visit"' });
  }
  
  // For per-visit payments, service_date is required (Mistake #2: Not Linking Payment to Visit)
  if (payment_type === 'per_visit' && !service_date) {
    return res.status(400).json({ error: 'service_date is required for per-visit payments' });
  }
  
  // Validate payment date is not in the future (Mistake #4: Incorrect Timing)
  const paymentDateObj = new Date(payment_date);
  const today = new Date();
  today.setHours(23, 59, 59, 999); // End of today
  if (paymentDateObj > today) {
    return res.status(400).json({ error: 'Payment date cannot be in the future' });
  }
  
  // For per-visit payments, service_date should not be in the future (accrual accounting)
  if (payment_type === 'per_visit' && service_date) {
    const serviceDateObj = new Date(service_date);
    if (serviceDateObj > today) {
      return res.status(400).json({ error: 'Cannot record payment for future service date. Service must be delivered before payment is recorded as earned revenue.' });
    }
  }
  
  // Validate partial payment fields (Mistake #5: Ignoring Partial Payments)
  const isPartial = is_partial_payment === true || is_partial_payment === 1 || is_partial_payment === 'true';
  if (isPartial) {
    if (!expected_amount || expected_amount <= 0) {
      return res.status(400).json({ error: 'expected_amount is required for partial payments' });
    }
    if (payment_amount >= expected_amount) {
      return res.status(400).json({ error: 'Partial payment amount must be less than expected amount' });
    }
  }
  
  // Validate installation_cost and service_fee (Mistake #8: Mixing Installation Costs with Service Fees)
  const installationCost = parseFloat(installation_cost || 0);
  const serviceFee = parseFloat(service_fee || 0);
  const totalComponents = installationCost + serviceFee;
  
  if (payment_type === 'per_visit' && totalComponents > 0) {
    // For per-visit, ensure payment_amount matches the sum of components
    const tolerance = 0.01; // Allow small rounding differences
    if (Math.abs(payment_amount - totalComponents) > tolerance) {
      return res.status(400).json({ 
        error: `Payment amount (${payment_amount.toFixed(2)}) must equal installation_cost (${installationCost.toFixed(2)}) + service_fee (${serviceFee.toFixed(2)}) = ${totalComponents.toFixed(2)}` 
      });
    }
  }
  
  // Get plan details
  let planQuery = 'SELECT * FROM installment_payments WHERE id = ?';
  const planParams = [installment_plan_id];
  
  if (req.user.role !== 'superadmin' && req.user.shop_id) {
    planQuery += ' AND shop_id = ?';
    planParams.push(req.user.shop_id);
  } else if (shopFilter.shop_id && req.user.role === 'superadmin') {
    planQuery += ' AND shop_id = ?';
    planParams.push(shopFilter.shop_id);
  }
  
  db.get(planQuery, planParams, (err, plan) => {
    if (err) {
      return res.status(500).json({ error: sanitizeError(err) });
    }
    if (!plan) {
      return res.status(404).json({ error: 'Installment plan not found' });
    }
    
    // Check if plan is active
    if (plan.status !== 'active') {
      return res.status(400).json({ error: 'Cannot record payment for non-active plan' });
    }
    
    const totalPrice = parseFloat(plan.total_price || 0);
    const currentPaid = parseFloat(plan.paid_amount || 0);
    const remaining = totalPrice - currentPaid;
    
    // For per-visit payments, validate against expected visit amount, not total contract (Mistake #1: Misclassifying Payment)
    if (payment_type === 'per_visit') {
      // Per-visit payments should typically match the installment_amount
      const installmentAmount = parseFloat(plan.installment_amount || 0);
      if (!isPartial && Math.abs(payment_amount - installmentAmount) > 0.01) {
        // Warn but allow if user confirms
        console.warn(`Per-visit payment amount (${payment_amount}) differs from expected installment amount (${installmentAmount})`);
      }
    } else {
      // For full contract payments, validate against remaining balance
    if (payment_amount > remaining) {
      return res.status(400).json({ error: `Payment amount cannot exceed remaining balance of ${remaining.toFixed(2)}` });
    }
    }
    
    // Check for duplicate payments (Mistake #3: Double Recording)
    // Check by receipt_number if provided
    if (receipt_number) {
      db.get(
        'SELECT id FROM installment_payments_payments WHERE receipt_number = ? AND installment_plan_id = ?',
        [receipt_number, installment_plan_id],
        (dupErr, duplicate) => {
          if (dupErr) {
            return res.status(500).json({ error: sanitizeError(dupErr) });
          }
          if (duplicate) {
            return res.status(400).json({ error: `Duplicate payment detected. Receipt number ${receipt_number} already exists for this plan.` });
          }
          processPayment();
        }
      );
    } else {
      // Check for duplicate by service_date and amount for per-visit payments
      if (payment_type === 'per_visit' && service_date) {
        db.get(
          'SELECT id FROM installment_payments_payments WHERE installment_plan_id = ? AND service_date = ? AND payment_amount = ? AND payment_type = ?',
          [installment_plan_id, service_date, payment_amount, 'per_visit'],
          (dupErr, duplicate) => {
            if (dupErr) {
              return res.status(500).json({ error: sanitizeError(dupErr) });
            }
            if (duplicate) {
              return res.status(400).json({ 
                error: `Duplicate payment detected. A payment of ${payment_amount.toFixed(2)} for service date ${service_date} already exists for this plan.` 
              });
            }
            processPayment();
          }
        );
      } else {
        processPayment();
      }
    }
    
    function processPayment() {
      // Generate receipt number if not provided (Mistake #7: No Audit Trail)
      let finalReceiptNumber = receipt_number;
      if (!finalReceiptNumber) {
        // Generate receipt number: REC-{plan_id}-{timestamp}
        const timestamp = Date.now();
        finalReceiptNumber = `REC-${installment_plan_id}-${timestamp}`;
    }
    
    const newPaidAmount = currentPaid + payment_amount;
    const isCompleted = newPaidAmount >= totalPrice;
    
      // Insert payment record with all fields
    db.run(
      `INSERT INTO installment_payments_payments 
         (installment_plan_id, payment_amount, payment_method, payment_date, notes, created_by,
          payment_type, service_date, receipt_number, transaction_reference, 
          is_partial_payment, expected_amount, installation_cost, service_fee) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          installment_plan_id, 
          payment_amount, 
          payment_method, 
          payment_date, 
          notes || null, 
          req.user.id,
          payment_type,
          service_date || null,
          finalReceiptNumber,
          transaction_reference || null,
          isPartial ? 1 : 0,
          expected_amount || null,
          installationCost,
          serviceFee
        ],
      function(paymentErr) {
        if (paymentErr) {
            // Check if it's a duplicate receipt number error
            if (paymentErr.message && paymentErr.message.includes('UNIQUE constraint')) {
              return res.status(400).json({ error: `Receipt number ${finalReceiptNumber} already exists. Please use a different receipt number.` });
            }
          return res.status(500).json({ error: sanitizeError(paymentErr) });
        }
        
        const paymentId = this.lastID;
        
        // Update plan paid amount and status
          // For per-visit partial payments, only count the amount paid
          const amountToAdd = payment_amount;
          const updatedPaidAmount = currentPaid + amountToAdd;
          const updateStatus = updatedPaidAmount >= totalPrice ? 'completed' : 'active';
          
        db.run(
          `UPDATE installment_payments 
           SET paid_amount = ?, status = ?, updated_at = CURRENT_TIMESTAMP 
           WHERE id = ?`,
            [updatedPaidAmount, updateStatus, installment_plan_id],
          function(updateErr) {
            if (updateErr) {
              // If update fails, try to delete the payment record (rollback)
              db.run('DELETE FROM installment_payments_payments WHERE id = ?', [paymentId], () => {});
              return res.status(500).json({ error: sanitizeError(updateErr) });
            }
            
            res.json({ 
              id: paymentId, 
                receipt_number: finalReceiptNumber,
              message: isCompleted 
                ? 'Payment recorded successfully. Installment plan completed!' 
                  : isPartial
                    ? `Partial payment recorded successfully. Remaining: ${(expected_amount - payment_amount).toFixed(2)}`
                : 'Payment recorded successfully',
                plan_completed: isCompleted,
                remaining_balance: totalPrice - updatedPaidAmount
            });
          }
        );
      }
    );
    }
  });
});

// Get payment history for an installment plan
app.get('/api/installment-payments/:id/payments', authenticateToken, (req, res) => {
  const id = req.params.id;
  const shopFilter = getShopFilter(req);
  
  // First verify plan exists and user has permission
  let planQuery = 'SELECT * FROM installment_payments WHERE id = ?';
  const planParams = [id];
  
  if (req.user.role !== 'superadmin' && req.user.shop_id) {
    planQuery += ' AND shop_id = ?';
    planParams.push(req.user.shop_id);
  } else if (shopFilter.shop_id && req.user.role === 'superadmin') {
    planQuery += ' AND shop_id = ?';
    planParams.push(shopFilter.shop_id);
  }
  
  db.get(planQuery, planParams, (err, plan) => {
    if (err) {
      return res.status(500).json({ error: sanitizeError(err) });
    }
    if (!plan) {
      return res.status(404).json({ error: 'Installment plan not found' });
    }
    
    // Get payment history
    db.all(
      `SELECT * FROM installment_payments_payments 
       WHERE installment_plan_id = ? 
       ORDER BY payment_date DESC, created_at DESC`,
      [id],
      (paymentsErr, payments) => {
        if (paymentsErr) {
          return res.status(500).json({ error: sanitizeError(paymentsErr) });
        }
        res.json(payments);
      }
    );
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
  
  // Filter by shop_id if provided (for superadmin)
  if (shopFilter.shop_id && req.user.role === 'superadmin') {
    query += ` WHERE EXISTS (
      SELECT 1 FROM sales_items si
      JOIN sales s ON si.sale_id = s.id
      JOIN users u ON s.created_by = u.id
      WHERE si.item_id = i.id AND u.shop_id = ${shopFilter.shop_id}
      UNION
      SELECT 1 FROM purchase_items pi
      JOIN purchases p ON pi.purchase_id = p.id
      JOIN users u ON p.created_by = u.id
      WHERE pi.item_id = i.id AND u.shop_id = ${shopFilter.shop_id}
    )`;
  }
  
  query += ` ORDER BY i.stock_quantity ASC`;
  
  db.all(query, (err, items) => {
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
  const query = `
    SELECT i.id, i.name, i.sku,
           SUM(si.quantity) as total_sold,
           SUM(si.total_price) as total_revenue
    FROM items i
    JOIN sales_items si ON i.id = si.item_id
    GROUP BY i.id
    ORDER BY total_sold DESC
    LIMIT 10
  `;
  db.all(query, (err, results) => {
    if (err) {
      return res.status(500).json({ error: sanitizeError(err) });
    }
    res.json(results);
  });
});

app.get('/api/reports/slow-moving', authenticateToken, requireRole('admin', 'manager'), (req, res) => {
  const query = `
    SELECT i.id, i.name, i.sku, i.stock_quantity,
           COALESCE(SUM(si.quantity), 0) as total_sold
    FROM items i
    LEFT JOIN sales_items si ON i.id = si.item_id
    GROUP BY i.id
    HAVING total_sold = 0 OR total_sold < 5
    ORDER BY total_sold ASC, i.stock_quantity DESC
    LIMIT 10
  `;
  db.all(query, (err, results) => {
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

// Cleanup old backups manually
app.post('/api/backups/cleanup', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const shopFilter = getShopFilter(req);
    
    // Get backup retention setting
    let query = 'SELECT * FROM settings WHERE key = ? AND (shop_id = ? OR shop_id IS NULL) ORDER BY shop_id DESC LIMIT 1';
    const params = ['backup_retention_days', shopFilter.shop_id || req.user.shop_id || null];
    
    db.get(query, params, async (err, setting) => {
      if (err) {
        return res.status(500).json({ error: sanitizeError(err) });
      }
      
      const retentionDays = setting ? parseInt(setting.value || '30', 10) : 30;
      const backupDir = path.join(__dirname, 'backups');
      
      const cleanupResult = await cleanupOldBackups(backupDir, retentionDays);
      
      res.json({
        success: true,
        message: `Backup cleanup completed. Deleted ${cleanupResult.deleted_count} old backups.`,
        ...cleanupResult
      });
    });
  } catch (error) {
    console.error('Error cleaning up backups:', error);
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

// ==================== SETTINGS ROUTES ====================

// Get all settings grouped by category
app.get('/api/settings', authenticateToken, requireRole('admin', 'superadmin'), (req, res) => {
  const shopFilter = getShopFilter(req);
  let query = `
    SELECT * FROM settings 
    WHERE 1=1
  `;
  const params = [];
  
  if (req.user.role !== 'superadmin' && req.user.shop_id) {
    query += ' AND (shop_id = ? OR shop_id IS NULL)';
    params.push(req.user.shop_id);
  } else if (shopFilter.shop_id && req.user.role === 'superadmin') {
    query += ' AND (shop_id = ? OR shop_id IS NULL)';
    params.push(shopFilter.shop_id);
  } else if (req.user.role === 'superadmin') {
    // Superadmin can see global settings (shop_id IS NULL) or all shop settings
    query += ' AND (shop_id IS NULL OR shop_id IN (SELECT id FROM shops))';
  } else {
    // Regular admin sees only global settings or their shop settings
    query += ' AND (shop_id IS NULL OR shop_id = ?)';
    if (req.user.shop_id) {
      params.push(req.user.shop_id);
    }
  }
  
  query += ' ORDER BY category, key';
  
  db.all(query, params, (err, settings) => {
    if (err) {
      return res.status(500).json({ error: sanitizeError(err) });
    }
    
    // Group settings by category
    const grouped = {};
    settings.forEach(setting => {
      const category = setting.category || 'general';
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push({
        id: setting.id,
        key: setting.key,
        value: setting.value,
        category: setting.category,
        description: setting.description,
        shop_id: setting.shop_id,
        is_encrypted: setting.is_encrypted === 1
      });
    });
    
    res.json(grouped);
  });
});

// Update settings
app.put('/api/settings', authenticateToken, requireRole('admin', 'superadmin'), (req, res) => {
  const { settings } = req.body;
  const shopFilter = getShopFilter(req);
  
  if (!settings || !Array.isArray(settings)) {
    return res.status(400).json({ error: 'Settings array is required' });
  }
  
  let shopId = null;
  if (req.user.role === 'superadmin' && shopFilter.shop_id) {
    shopId = shopFilter.shop_id;
  } else if (req.user.role !== 'superadmin' && req.user.shop_id) {
    shopId = req.user.shop_id;
  }
  
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO settings (key, value, category, description, shop_id, is_encrypted, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `);
  
  let successCount = 0;
  let errorCount = 0;
  let completedCount = 0;
  const totalSettings = settings.length;
  
  settings.forEach(setting => {
    if (!setting.key) {
      errorCount++;
      completedCount++;
      checkCompletion();
      return;
    }
    
    // Determine category from key if not provided
    let category = setting.category || 'general';
    if (!category) {
      // Auto-detect category from key prefix
      if (setting.key.startsWith('email_')) category = 'email';
      else if (setting.key.startsWith('backup_')) category = 'backup';
      else if (setting.key.startsWith('security_') || setting.key.includes('password') || setting.key.includes('login')) category = 'security';
      else if (setting.key.includes('currency') || setting.key.includes('tax')) category = 'currency';
      else if (setting.key.includes('date') || setting.key.includes('time') || setting.key.includes('timezone')) category = 'datetime';
      else if (setting.key.includes('display') || setting.key.includes('theme') || setting.key.includes('language')) category = 'display';
      else if (setting.key.includes('notification') || setting.key.includes('low_stock')) category = 'notification';
      else category = 'general';
    }
    
    const value = setting.value !== null && setting.value !== undefined ? String(setting.value) : null;
    
    // Mark email_password as encrypted
    const isEncrypted = setting.key === 'email_password' ? 1 : 0;
    
    stmt.run([setting.key, value, category, setting.description || null, shopId, isEncrypted], (err) => {
      completedCount++;
      if (err) {
        errorCount++;
        console.error('Error saving setting:', setting.key, err);
      } else {
        successCount++;
      }
      checkCompletion();
    });
  });
  
  function checkCompletion() {
    if (completedCount === totalSettings) {
      stmt.finalize((err) => {
        if (err) {
          return res.status(500).json({ error: sanitizeError(err) });
        }
        
        if (errorCount > 0 && successCount === 0) {
          return res.status(500).json({ error: 'Failed to save settings' });
        }
        
        // Clear notification settings cache when settings are updated
        clearNotificationSettingsCache();
        // Update API rate limiter if rate limit settings changed
        const rateLimitSettings = settings.filter(s => s.key === 'enable_api_rate_limit' || s.key === 'api_rate_limit_per_minute');
        if (rateLimitSettings.length > 0) {
          updateApiRateLimiter();
        }
        
        res.json({ 
          message: `Settings saved successfully. ${successCount} updated${errorCount > 0 ? `, ${errorCount} failed` : ''}`,
          saved: successCount,
          failed: errorCount
        });
      });
    }
  }
});

// Export settings
app.get('/api/settings/export', authenticateToken, requireRole('admin', 'superadmin'), (req, res) => {
  const shopFilter = getShopFilter(req);
  let query = 'SELECT * FROM settings WHERE 1=1';
  const params = [];
  
  if (req.user.role !== 'superadmin' && req.user.shop_id) {
    query += ' AND (shop_id = ? OR shop_id IS NULL)';
    params.push(req.user.shop_id);
  } else if (shopFilter.shop_id && req.user.role === 'superadmin') {
    query += ' AND (shop_id = ? OR shop_id IS NULL)';
    params.push(shopFilter.shop_id);
  }
  
  db.all(query, params, (err, settings) => {
    if (err) {
      return res.status(500).json({ error: sanitizeError(err) });
    }
    
    res.json({
      export_date: new Date().toISOString(),
      settings: settings.map(s => ({
        key: s.key,
        value: s.is_encrypted ? null : s.value, // Don't export encrypted values
        category: s.category,
        description: s.description
      }))
    });
  });
});

// Import settings
app.post('/api/settings/import', authenticateToken, requireRole('admin', 'superadmin'), (req, res) => {
  const { settings } = req.body;
  const shopFilter = getShopFilter(req);
  
  if (!settings || !Array.isArray(settings)) {
    return res.status(400).json({ error: 'Settings array is required' });
  }
  
  let shopId = null;
  if (req.user.role === 'superadmin' && shopFilter.shop_id) {
    shopId = shopFilter.shop_id;
  } else if (req.user.role !== 'superadmin' && req.user.shop_id) {
    shopId = req.user.shop_id;
  }
  
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO settings (key, value, category, description, shop_id, updated_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `);
  
  let importedCount = 0;
  
  settings.forEach(setting => {
    if (!setting.key) return;
    
    let category = setting.category || 'general';
    if (!category) {
      if (setting.key.startsWith('email_')) category = 'email';
      else if (setting.key.startsWith('backup_')) category = 'backup';
      else if (setting.key.startsWith('security_') || setting.key.includes('password') || setting.key.includes('login')) category = 'security';
      else if (setting.key.includes('currency') || setting.key.includes('tax')) category = 'currency';
      else if (setting.key.includes('date') || setting.key.includes('time') || setting.key.includes('timezone')) category = 'datetime';
      else if (setting.key.includes('display') || setting.key.includes('theme') || setting.key.includes('language')) category = 'display';
      else if (setting.key.includes('notification') || setting.key.includes('low_stock')) category = 'notification';
      else category = 'general';
    }
    
    const value = setting.value !== null && setting.value !== undefined ? String(setting.value) : null;
    
    stmt.run([setting.key, value, category, setting.description || null, shopId], (err) => {
      if (!err) importedCount++;
    });
  });
  
  stmt.finalize((err) => {
    if (err) {
      return res.status(500).json({ error: sanitizeError(err) });
    }
    
    res.json({ 
      message: 'Settings imported successfully',
      imported_count: importedCount
    });
  });
});

// Reset settings to defaults
app.post('/api/settings/reset', authenticateToken, requireRole('admin', 'superadmin'), (req, res) => {
  const { shop_id } = req.body;
  const shopFilter = getShopFilter(req);
  
  let targetShopId = shop_id;
  if (!targetShopId) {
    if (req.user.role === 'superadmin' && shopFilter.shop_id) {
      targetShopId = shopFilter.shop_id;
    } else if (req.user.role !== 'superadmin' && req.user.shop_id) {
      targetShopId = req.user.shop_id;
    }
  }
  
  // Delete shop-specific settings
  let query = 'DELETE FROM settings WHERE shop_id = ?';
  const params = [targetShopId];
  
  db.run(query, params, function(err) {
    if (err) {
      return res.status(500).json({ error: sanitizeError(err) });
    }
    
    res.json({ 
      message: 'Settings reset to defaults successfully',
      deleted_count: this.changes
    });
  });
});

// Test email configuration
app.post('/api/settings/test-email', authenticateToken, requireRole('admin', 'superadmin'), async (req, res) => {
  const { test_email } = req.body;
  
  if (!test_email || !test_email.includes('@')) {
    return res.status(400).json({ error: 'Valid email address is required' });
  }
  
  // Get email settings
  const shopFilter = getShopFilter(req);
  let query = 'SELECT * FROM settings WHERE key LIKE ? AND (shop_id = ? OR shop_id IS NULL) ORDER BY shop_id DESC';
  const params = ['email_%', shopFilter.shop_id || req.user.shop_id || null];
  
  db.all(query, params, async (err, emailSettings) => {
    if (err) {
      return res.status(500).json({ error: sanitizeError(err) });
    }
    
    // Group settings by shop_id to get the most specific settings
    // Settings with shop_id take precedence over global settings (shop_id IS NULL)
    const settingsMap = new Map();
    emailSettings.forEach(s => {
      const key = s.key;
      if (!settingsMap.has(key) || (s.shop_id !== null && settingsMap.get(key).shop_id === null)) {
        settingsMap.set(key, s);
      }
    });
    
    // Convert map back to array
    const finalSettings = Array.from(settingsMap.values());
    
    try {
      // Send test email using email utility
      const emailInfo = await sendTestEmail(finalSettings, test_email);
      
      res.json({ 
        message: `Test email sent successfully to ${test_email}`,
        test_email: test_email,
        messageId: emailInfo.messageId,
        valid: true
      });
    } catch (error) {
      console.error('Error sending test email:', error);
      
      // Provide helpful error messages
      let errorMessage = 'Failed to send test email';
      if (error.message.includes('Missing required')) {
        errorMessage = error.message;
      } else if (error.message.includes('Email is not enabled')) {
        errorMessage = 'Email notifications are not enabled. Please enable them first.';
      } else if (error.code === 'EAUTH') {
        errorMessage = 'Authentication failed. Please check your SMTP username and password.';
      } else if (error.code === 'ECONNECTION' || error.code === 'ETIMEDOUT') {
        errorMessage = 'Connection failed. Please check your SMTP host and port settings.';
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      return res.status(400).json({ 
        error: errorMessage,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
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

