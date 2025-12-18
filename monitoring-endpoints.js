/**
 * Monitoring & Health Check Endpoints
 * Costless alternative to Prometheus/Grafana
 * Provides health checks and metrics for monitoring
 */

const os = require('os');
const fs = require('fs');
const path = require('path');

/**
 * System metrics collector
 */
class MetricsCollector {
  constructor(db) {
    this.db = db;
    this.startTime = Date.now();
  }

  /**
   * Get system health status
   */
  async getHealth() {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      checks: {}
    };

    // Database health check
    if (!this.db) {
      health.checks.database = { status: 'unavailable', error: 'Database not initialized' };
      health.status = 'degraded';
    } else {
      try {
        await new Promise((resolve, reject) => {
          this.db.get('SELECT 1', (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
        health.checks.database = { status: 'healthy' };
      } catch (error) {
        health.checks.database = { status: 'unhealthy', error: error.message };
        health.status = 'degraded';
      }
    }

    // Disk space check
    try {
      const stats = fs.statSync(process.env.DATABASE_PATH || './ims.db');
      const dbSize = stats.size;
      health.checks.disk = {
        status: 'healthy',
        databaseSize: dbSize,
        databaseSizeMB: (dbSize / 1024 / 1024).toFixed(2)
      };
    } catch (error) {
      health.checks.disk = { status: 'unhealthy', error: error.message };
      health.status = 'degraded';
    }

    // Memory check
    const memUsage = process.memoryUsage();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const memUsagePercent = ((totalMem - freeMem) / totalMem * 100).toFixed(2);

    health.checks.memory = {
      status: memUsagePercent > 90 ? 'warning' : 'healthy',
      used: Math.round(memUsage.heapUsed / 1024 / 1024),
      total: Math.round(totalMem / 1024 / 1024),
      free: Math.round(freeMem / 1024 / 1024),
      usagePercent: parseFloat(memUsagePercent)
    };

    if (memUsagePercent > 90) {
      health.status = 'degraded';
    }

    return health;
  }

  /**
   * Get system metrics
   */
  async getMetrics() {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    const uptime = process.uptime();

    // Database metrics
    let dbMetrics = {};
    try {
      await new Promise((resolve, reject) => {
        this.db.get('SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()', (err, row) => {
          if (err) reject(err);
          else {
            dbMetrics.databaseSize = row.size;
            dbMetrics.databaseSizeMB = (row.size / 1024 / 1024).toFixed(2);
            resolve();
          }
        });
      });

      // Get record counts
      const tables = ['items', 'sales', 'purchases', 'customers', 'users', 'shops'];
      const counts = {};
      
      for (const table of tables) {
        await new Promise((resolve) => {
          this.db.get(`SELECT COUNT(*) as count FROM ${table}`, (err, row) => {
            if (!err && row) {
              counts[table] = row.count;
            }
            resolve();
          });
        });
      }
      dbMetrics.recordCounts = counts;
    } catch (error) {
      dbMetrics.error = error.message;
    }

    return {
      timestamp: new Date().toISOString(),
      uptime: Math.floor(uptime),
      memory: {
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
        rss: Math.round(memUsage.rss / 1024 / 1024),
        external: Math.round(memUsage.external / 1024 / 1024)
      },
      cpu: {
        user: cpuUsage.user / 1000000, // Convert to seconds
        system: cpuUsage.system / 1000000
      },
      system: {
        platform: os.platform(),
        arch: os.arch(),
        nodeVersion: process.version,
        totalMemory: Math.round(os.totalmem() / 1024 / 1024),
        freeMemory: Math.round(os.freemem() / 1024 / 1024),
        loadAverage: os.loadavg()
      },
      database: dbMetrics
    };
  }

  /**
   * Get application statistics
   */
  async getStats() {
    const stats = {
      timestamp: new Date().toISOString(),
      application: {
        name: 'Inventory Management System',
        version: require('./package.json').version,
        uptime: Math.floor((Date.now() - this.startTime) / 1000),
        environment: process.env.NODE_ENV || 'development'
      },
      database: {},
      users: {},
      shops: {}
    };

    try {
      // Database stats
      await new Promise((resolve) => {
        this.db.get('SELECT COUNT(*) as count FROM shops', (err, row) => {
          if (!err && row) stats.shops.total = row.count;
          resolve();
        });
      });

      await new Promise((resolve) => {
        this.db.get('SELECT COUNT(*) as count FROM users WHERE is_active = 1', (err, row) => {
          if (!err && row) stats.users.active = row.count;
          resolve();
        });
      });

      await new Promise((resolve) => {
        this.db.get('SELECT COUNT(*) as count FROM items', (err, row) => {
          if (!err && row) stats.database.items = row.count;
          resolve();
        });
      });

      await new Promise((resolve) => {
        this.db.get('SELECT COUNT(*) as count FROM sales', (err, row) => {
          if (!err && row) stats.database.sales = row.count;
          resolve();
        });
      });

      await new Promise((resolve) => {
        this.db.get('SELECT COUNT(*) as count FROM purchases', (err, row) => {
          if (!err && row) stats.database.purchases = row.count;
          resolve();
        });
      });
    } catch (error) {
      stats.error = error.message;
    }

    return stats;
  }
}

/**
 * Setup monitoring endpoints
 * @param {Object} app - Express app
 * @param {Object} db - Database connection
 */
function setupMonitoringEndpoints(app, db) {
  const metricsCollector = new MetricsCollector(db);

  /**
   * Health check endpoint
   * GET /api/health
   */
  app.get('/api/health', async (req, res) => {
    try {
      const health = await metricsCollector.getHealth();
      const statusCode = health.status === 'healthy' ? 200 : 503;
      res.status(statusCode).json(health);
    } catch (error) {
      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message
      });
    }
  });

  /**
   * Metrics endpoint (Prometheus-style)
   * GET /api/metrics
   */
  app.get('/api/metrics', async (req, res) => {
    try {
      const metrics = await metricsCollector.getMetrics();
      res.json(metrics);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Application statistics endpoint
   * GET /api/stats
   */
  app.get('/api/stats', async (req, res) => {
    try {
      const stats = await metricsCollector.getStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  console.log('📊 Monitoring endpoints available:');
  console.log('  - GET /api/health - Health check');
  console.log('  - GET /api/metrics - System metrics');
  console.log('  - GET /api/stats - Application statistics');
}

module.exports = {
  setupMonitoringEndpoints,
  MetricsCollector
};

