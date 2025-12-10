/**
 * Script to create a superadmin user in Railway database
 * Run this script to create a superadmin user when the database is fresh
 * 
 * Usage: node create-superadmin-railway.js
 * 
 * Environment variables:
 * - DATABASE_PATH: Path to database file (default: /data/ims.db for Railway, ./ims.db for local)
 * - SUPERADMIN_USERNAME: Username for superadmin (default: superadmin)
 * - SUPERADMIN_PASSWORD: Password for superadmin (default: superadmin123 - CHANGE THIS!)
 * - SUPERADMIN_EMAIL: Email for superadmin (default: superadmin@ims.com)
 */

const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Database path - use Railway volume path if on Railway, otherwise local
const isRailway = process.env.PORT && process.env.RAILWAY_ENVIRONMENT_NAME;
const DB_PATH = process.env.DATABASE_PATH || (isRailway ? '/data/ims.db' : './ims.db');

// Superadmin credentials (use environment variables or defaults)
const SUPERADMIN_USERNAME = process.env.SUPERADMIN_USERNAME || 'superadmin';
const SUPERADMIN_PASSWORD = process.env.SUPERADMIN_PASSWORD || 'superadmin123';
const SUPERADMIN_EMAIL = process.env.SUPERADMIN_EMAIL || 'superadmin@ims.com';
const SUPERADMIN_FULL_NAME = process.env.SUPERADMIN_FULL_NAME || 'Super Admin';

console.log('='.repeat(60));
console.log('Creating Superadmin User');
console.log('='.repeat(60));
console.log(`Database path: ${DB_PATH}`);
console.log(`Username: ${SUPERADMIN_USERNAME}`);
console.log(`Email: ${SUPERADMIN_EMAIL}`);
console.log('='.repeat(60));

// Ensure directory exists
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  try {
    fs.mkdirSync(dbDir, { recursive: true });
    console.log(`✓ Created database directory: ${dbDir}`);
  } catch (err) {
    console.error(`✗ Failed to create directory: ${err.message}`);
    process.exit(1);
  }
}

// Open database
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error(`✗ Error opening database: ${err.message}`);
    process.exit(1);
  }
  console.log(`✓ Connected to database`);
});

// Enable foreign keys
db.run('PRAGMA foreign_keys = ON');

// Check if superadmin already exists
db.get('SELECT * FROM users WHERE username = ? OR role = ?', [SUPERADMIN_USERNAME, 'superadmin'], (err, existingUser) => {
  if (err) {
    console.error(`✗ Error checking for existing superadmin: ${err.message}`);
    db.close();
    process.exit(1);
  }

  if (existingUser) {
    console.log(`⚠ Superadmin user already exists:`);
    console.log(`  Username: ${existingUser.username}`);
    console.log(`  Email: ${existingUser.email}`);
    console.log(`  Role: ${existingUser.role}`);
    console.log(`  ID: ${existingUser.id}`);
    db.close();
    process.exit(0);
  }

  // Create superadmin user
  const hashedPassword = bcrypt.hashSync(SUPERADMIN_PASSWORD, 10);
  
  db.run(
    'INSERT INTO users (username, email, password, role, full_name, shop_id, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [SUPERADMIN_USERNAME, SUPERADMIN_EMAIL, hashedPassword, 'superadmin', SUPERADMIN_FULL_NAME, null, 1],
    function(err) {
      if (err) {
        console.error(`✗ Error creating superadmin user: ${err.message}`);
        db.close();
        process.exit(1);
      }

      console.log('='.repeat(60));
      console.log('✓ Superadmin user created successfully!');
      console.log('='.repeat(60));
      console.log(`User ID: ${this.lastID}`);
      console.log(`Username: ${SUPERADMIN_USERNAME}`);
      console.log(`Email: ${SUPERADMIN_EMAIL}`);
      console.log(`Role: superadmin`);
      console.log(`Password: ${SUPERADMIN_PASSWORD}`);
      console.log('='.repeat(60));
      console.log('⚠ IMPORTANT: Change the password after first login!');
      console.log('='.repeat(60));
      
      db.close();
      process.exit(0);
    }
  );
});

