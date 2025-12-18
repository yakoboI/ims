/**
 * Migration Script: Convert Base64 Images to Cloudinary
 * 
 * This script:
 * 1. Finds all items with base64 image URLs (data:image/...)
 * 2. Uploads them to Cloudinary
 * 3. Updates the database with Cloudinary URLs
 * 
 * Usage: node migrate-images-to-cloudinary.js
 */

require('dotenv').config();
const sqlite3 = require('sqlite3').verbose();
const cloudinary = require('cloudinary').v2;
const path = require('path');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
});

// Database path
const DB_PATH = process.env.DATABASE_PATH || './ims.db';

// Check if Cloudinary is configured
if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
  console.error('❌ Error: Cloudinary credentials not found in environment variables.');
  console.error('Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET');
  process.exit(1);
}

// Open database
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('❌ Error opening database:', err.message);
    process.exit(1);
  }
  console.log('✓ Connected to database');
});

// Function to upload base64 image to Cloudinary
function uploadBase64ToCloudinary(base64Data, shopId, itemId) {
  return new Promise((resolve, reject) => {
    // Extract base64 data (remove data:image/...;base64, prefix)
    const base64Image = base64Data.split(',')[1] || base64Data;
    
    // Upload to Cloudinary
    cloudinary.uploader.upload(
      `data:image/jpeg;base64,${base64Image}`,
      {
        folder: `ims/products/shop_${shopId || 'global'}`,
        public_id: `item_${itemId}_${Date.now()}`,
        resource_type: 'image',
        format: 'webp',
        quality: 'auto',
        transformation: [
          { width: 1920, height: 1920, crop: 'limit' },
          { quality: 'auto:good' }
        ]
      },
      (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      }
    );
  });
}

// Main migration function
async function migrateImages() {
  console.log('\n🔄 Starting image migration to Cloudinary...\n');
  
  // Find all items with base64 images
  db.all(
    `SELECT id, name, image_url, shop_id FROM items WHERE image_url LIKE 'data:image/%'`,
    [],
    async (err, items) => {
      if (err) {
        console.error('❌ Error querying database:', err.message);
        db.close();
        process.exit(1);
      }
      
      if (items.length === 0) {
        console.log('✓ No base64 images found. Migration not needed.');
        db.close();
        process.exit(0);
      }
      
      console.log(`📊 Found ${items.length} items with base64 images\n`);
      
      let successCount = 0;
      let errorCount = 0;
      const errors = [];
      
      // Process each item
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        console.log(`[${i + 1}/${items.length}] Processing: ${item.name} (ID: ${item.id})`);
        
        try {
          // Upload to Cloudinary
          const result = await uploadBase64ToCloudinary(item.image_url, item.shop_id, item.id);
          
          // Update database
          await new Promise((resolve, reject) => {
            db.run(
              'UPDATE items SET image_url = ? WHERE id = ?',
              [result.secure_url, item.id],
              function(updateErr) {
                if (updateErr) {
                  reject(updateErr);
                } else {
                  resolve();
                }
              }
            );
          });
          
          console.log(`  ✓ Uploaded: ${result.secure_url}`);
          console.log(`  ✓ Size: ${(result.bytes / 1024).toFixed(2)}KB (WebP format)`);
          successCount++;
          
          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 100));
          
        } catch (error) {
          console.error(`  ❌ Error: ${error.message}`);
          errors.push({ item: item.name, id: item.id, error: error.message });
          errorCount++;
        }
      }
      
      // Summary
      console.log('\n' + '='.repeat(60));
      console.log('📊 Migration Summary:');
      console.log(`  ✓ Successfully migrated: ${successCount}`);
      console.log(`  ❌ Failed: ${errorCount}`);
      console.log('='.repeat(60));
      
      if (errors.length > 0) {
        console.log('\n❌ Errors:');
        errors.forEach(e => {
          console.log(`  - Item ${e.id} (${e.item}): ${e.error}`);
        });
      }
      
      db.close();
      console.log('\n✓ Migration completed!');
      process.exit(errorCount > 0 ? 1 : 0);
    }
  );
}

// Run migration
migrateImages().catch((error) => {
  console.error('❌ Fatal error:', error);
  db.close();
  process.exit(1);
});

