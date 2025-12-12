/**
 * Version Update Script
 * Run this script after deploying changes to update the version number
 * This forces browsers to fetch new CSS/JS files
 * 
 * Usage: node update-version.js
 */

const fs = require('fs');
const path = require('path');

const versionFile = path.join(__dirname, 'public', 'version.json');

// Read current version or create new
let versionData = {
  version: '1.0.0',
  build: Date.now().toString(),
  timestamp: new Date().toISOString()
};

if (fs.existsSync(versionFile)) {
  try {
    versionData = JSON.parse(fs.readFileSync(versionFile, 'utf8'));
    // Update build number and timestamp
    versionData.build = Date.now().toString();
    versionData.timestamp = new Date().toISOString();
    // Increment version patch number
    const versionParts = versionData.version.split('.');
    if (versionParts.length === 3) {
      versionParts[2] = (parseInt(versionParts[2]) + 1).toString();
      versionData.version = versionParts.join('.');
    }
  } catch (error) {
    console.warn('Could not read existing version file, creating new one');
  }
}

// Write updated version
fs.writeFileSync(versionFile, JSON.stringify(versionData, null, 2), 'utf8');

console.log('✓ Version updated successfully!');
console.log(`  Version: ${versionData.version}`);
console.log(`  Build: ${versionData.build}`);
console.log(`  Timestamp: ${versionData.timestamp}`);
console.log('\n💡 Tip: After deploying, users may need to hard refresh (Ctrl+F5) to see changes immediately.');

