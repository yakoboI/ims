const fs = require('fs');
const path = require('path');

/**
 * Create a backup of the database
 * @param {String} dbPath - Path to the database file
 * @param {String} backupDir - Directory to store backups
 * @returns {Promise<Object>} Backup information (filename, path, size, created_at)
 */
async function createBackup(dbPath, backupDir) {
  return new Promise((resolve, reject) => {
    try {
      // Create backups directory if it doesn't exist
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }

      // Check if database file exists
      if (!fs.existsSync(dbPath)) {
        return reject(new Error('Database file not found'));
      }

      // Generate backup filename with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const backupFileName = `ims_backup_${timestamp}.db`;
      const backupPath = path.join(backupDir, backupFileName);

      // Copy database file to backup location
      fs.copyFileSync(dbPath, backupPath);

      // Get backup file info
      const stats = fs.statSync(backupPath);

      const backupInfo = {
        filename: backupFileName,
        path: backupPath,
        size: stats.size,
        created_at: new Date().toISOString()
      };

      console.log(`Backup created: ${backupFileName} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
      resolve(backupInfo);
    } catch (error) {
      console.error('Error creating backup:', error);
      reject(error);
    }
  });
}

/**
 * Clean up old backups based on retention days
 * @param {String} backupDir - Directory containing backups
 * @param {Number} retentionDays - Number of days to retain backups
 * @returns {Promise<Object>} Cleanup information (deleted_count, freed_space)
 */
async function cleanupOldBackups(backupDir, retentionDays) {
  return new Promise((resolve, reject) => {
    try {
      if (!fs.existsSync(backupDir)) {
        return resolve({ deleted_count: 0, freed_space: 0 });
      }

      const files = fs.readdirSync(backupDir)
        .filter(file => file.endsWith('.db') && file.startsWith('ims_backup_'))
        .map(file => {
          const filePath = path.join(backupDir, file);
          const stats = fs.statSync(filePath);
          return {
            filename: file,
            path: filePath,
            size: stats.size,
            created_at: stats.birthtime,
            age_days: Math.floor((Date.now() - stats.birthtime.getTime()) / (1000 * 60 * 60 * 24))
          };
        });

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      const backupsToDelete = files.filter(backup => {
        return backup.created_at < cutoffDate;
      });

      let deletedCount = 0;
      let freedSpace = 0;

      backupsToDelete.forEach(backup => {
        try {
          fs.unlinkSync(backup.path);
          deletedCount++;
          freedSpace += backup.size;
          console.log(`Deleted old backup: ${backup.filename} (${backup.age_days} days old)`);
        } catch (error) {
          console.error(`Error deleting backup ${backup.filename}:`, error);
        }
      });

      if (deletedCount > 0) {
        console.log(`Backup cleanup: Deleted ${deletedCount} old backups, freed ${(freedSpace / 1024 / 1024).toFixed(2)} MB`);
      }

      resolve({
        deleted_count: deletedCount,
        freed_space: freedSpace,
        total_backups: files.length - deletedCount
      });
    } catch (error) {
      console.error('Error cleaning up backups:', error);
      reject(error);
    }
  });
}

/**
 * Get backup frequency in milliseconds
 * @param {String} frequency - 'daily', 'weekly', or 'monthly'
 * @returns {Number} Milliseconds until next backup
 */
function getBackupInterval(frequency) {
  switch (frequency) {
    case 'daily':
      return 24 * 60 * 60 * 1000; // 24 hours
    case 'weekly':
      return 7 * 24 * 60 * 60 * 1000; // 7 days
    case 'monthly':
      return 30 * 24 * 60 * 60 * 1000; // 30 days (approximate)
    default:
      return 24 * 60 * 60 * 1000; // Default to daily
  }
}

/**
 * Get next backup time based on frequency
 * @param {String} frequency - 'daily', 'weekly', or 'monthly'
 * @returns {Date} Next backup date
 */
function getNextBackupTime(frequency) {
  const now = new Date();
  const next = new Date(now);

  switch (frequency) {
    case 'daily':
      next.setDate(next.getDate() + 1);
      next.setHours(2, 0, 0, 0); // 2 AM
      break;
    case 'weekly':
      // Next Monday at 2 AM
      const daysUntilMonday = (8 - next.getDay()) % 7 || 7;
      next.setDate(next.getDate() + daysUntilMonday);
      next.setHours(2, 0, 0, 0);
      break;
    case 'monthly':
      // First day of next month at 2 AM
      next.setMonth(next.getMonth() + 1, 1);
      next.setHours(2, 0, 0, 0);
      break;
    default:
      next.setDate(next.getDate() + 1);
      next.setHours(2, 0, 0, 0);
  }

  return next;
}

module.exports = {
  createBackup,
  cleanupOldBackups,
  getBackupInterval,
  getNextBackupTime
};

