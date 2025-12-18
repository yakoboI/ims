/**
 * Centralized Logging System
 * Costless alternative to ELK stack / CloudWatch
 * Uses Winston for structured logging with file rotation
 */

const fs = require('fs');
const path = require('path');

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

/**
 * Simple file-based logger with rotation
 * No external dependencies - uses Node.js built-in modules
 */
class FileLogger {
  constructor() {
    this.logFile = path.join(logsDir, 'app.log');
    this.errorFile = path.join(logsDir, 'error.log');
    this.maxFileSize = 10 * 1024 * 1024; // 10MB
    this.maxFiles = 5; // Keep 5 rotated files
  }

  /**
   * Write log entry to file
   * @param {string} level - Log level (info, warn, error, debug)
   * @param {string} message - Log message
   * @param {Object} meta - Additional metadata
   */
  writeLog(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level: level.toUpperCase(),
      message,
      ...meta
    };

    const logLine = JSON.stringify(logEntry) + '\n';
    const targetFile = level === 'error' ? this.errorFile : this.logFile;

    try {
      // Check file size and rotate if needed
      if (fs.existsSync(targetFile)) {
        const stats = fs.statSync(targetFile);
        if (stats.size > this.maxFileSize) {
          this.rotateLog(targetFile);
        }
      }

      // Append to log file
      fs.appendFileSync(targetFile, logLine, 'utf8');
    } catch (error) {
      // Fallback to console if file write fails
      console.error('Failed to write log:', error);
      console[level] || console.log(`[${level.toUpperCase()}] ${message}`, meta);
    }
  }

  /**
   * Rotate log file
   * @param {string} filePath - Path to log file
   */
  rotateLog(filePath) {
    try {
      // Find next available rotation number
      let rotationNum = 1;
      let rotatedPath = `${filePath}.${rotationNum}`;
      
      while (fs.existsSync(rotatedPath) && rotationNum < this.maxFiles) {
        rotationNum++;
        rotatedPath = `${filePath}.${rotationNum}`;
      }

      // If we've reached max files, delete oldest
      if (rotationNum >= this.maxFiles) {
        // Delete oldest file
        const oldestPath = `${filePath}.1`;
        if (fs.existsSync(oldestPath)) {
          fs.unlinkSync(oldestPath);
        }
        // Rename all files down
        for (let i = 2; i < this.maxFiles; i++) {
          const oldPath = `${filePath}.${i}`;
          const newPath = `${filePath}.${i - 1}`;
          if (fs.existsSync(oldPath)) {
            fs.renameSync(oldPath, newPath);
          }
        }
        rotatedPath = `${filePath}.${this.maxFiles - 1}`;
      }

      // Rotate current file
      fs.renameSync(filePath, rotatedPath);
    } catch (error) {
      console.error('Error rotating log file:', error);
    }
  }

  /**
   * Log info message
   */
  info(message, meta = {}) {
    this.writeLog('info', message, meta);
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[INFO] ${message}`, meta);
    }
  }

  /**
   * Log warning message
   */
  warn(message, meta = {}) {
    this.writeLog('warn', message, meta);
    console.warn(`[WARN] ${message}`, meta);
  }

  /**
   * Log error message
   */
  error(message, error = null, meta = {}) {
    const errorMeta = {
      ...meta,
      error: error ? {
        message: error.message,
        stack: error.stack,
        name: error.name,
        code: error.code
      } : null
    };
    this.writeLog('error', message, errorMeta);
    console.error(`[ERROR] ${message}`, errorMeta);
  }

  /**
   * Log debug message
   */
  debug(message, meta = {}) {
    if (process.env.NODE_ENV !== 'production') {
      this.writeLog('debug', message, meta);
      console.debug(`[DEBUG] ${message}`, meta);
    }
  }

  /**
   * Get recent logs
   * @param {number} lines - Number of lines to retrieve
   * @param {string} level - Log level filter (optional)
   * @returns {Array} Array of log entries
   */
  getRecentLogs(lines = 100, level = null) {
    try {
      const logFile = level === 'error' ? this.errorFile : this.logFile;
      if (!fs.existsSync(logFile)) {
        return [];
      }

      const content = fs.readFileSync(logFile, 'utf8');
      const logLines = content.trim().split('\n').filter(line => line.trim());
      
      let logs = logLines
        .slice(-lines)
        .map(line => {
          try {
            return JSON.parse(line);
          } catch {
            return { raw: line };
          }
        });

      if (level) {
        logs = logs.filter(log => log.level === level.toUpperCase());
      }

      return logs.reverse(); // Most recent first
    } catch (error) {
      console.error('Error reading logs:', error);
      return [];
    }
  }

  /**
   * Get log statistics
   * @returns {Object} Log statistics
   */
  getStats() {
    try {
      const stats = {
        appLog: { size: 0, lines: 0 },
        errorLog: { size: 0, lines: 0 }
      };

      if (fs.existsSync(this.logFile)) {
        const appStats = fs.statSync(this.logFile);
        const appContent = fs.readFileSync(this.logFile, 'utf8');
        stats.appLog = {
          size: appStats.size,
          lines: appContent.split('\n').filter(l => l.trim()).length,
          modified: appStats.mtime
        };
      }

      if (fs.existsSync(this.errorFile)) {
        const errorStats = fs.statSync(this.errorFile);
        const errorContent = fs.readFileSync(this.errorFile, 'utf8');
        stats.errorLog = {
          size: errorStats.size,
          lines: errorContent.split('\n').filter(l => l.trim()).length,
          modified: errorStats.mtime
        };
      }

      return stats;
    } catch (error) {
      console.error('Error getting log stats:', error);
      return { appLog: {}, errorLog: {} };
    }
  }
}

// Create singleton instance
const logger = new FileLogger();

module.exports = logger;

