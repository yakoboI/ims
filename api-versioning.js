/**
 * API Versioning Middleware
 * Supports multiple API versions with backward compatibility
 */

/**
 * Create versioned router
 * @param {string} version - API version (e.g., 'v1', 'v2')
 * @returns {Object} Express router with version prefix
 */
function createVersionedRouter(version) {
  const express = require('express');
  const router = express.Router();
  
  // Store version in router for reference
  router.version = version;
  
  return router;
}

/**
 * Version routing middleware
 * Routes requests to appropriate version, defaults to v1
 */
function versionRouter(app) {
  const express = require('express');
  
  // Create versioned routers
  const v1Router = createVersionedRouter('v1');
  const v2Router = createVersionedRouter('v2'); // Future version
  
  // Mount versioned routers
  app.use('/api/v1', v1Router);
  app.use('/api/v2', v2Router);
  
  // Backward compatibility: redirect /api/* to /api/v1/*
  app.use('/api', (req, res, next) => {
    // Skip version endpoints and static files
    if (req.path.startsWith('/v1/') || req.path.startsWith('/v2/')) {
      return next();
    }
    
    // Redirect to v1 for backward compatibility
    if (req.path !== '/' && !req.path.startsWith('/login') && !req.path.startsWith('/refresh')) {
      // Keep original path but add v1 prefix
      req.url = `/v1${req.path}`;
    }
    
    next();
  });
  
  return {
    v1: v1Router,
    v2: v2Router
  };
}

/**
 * Get API version from request
 * @param {Object} req - Express request object
 * @returns {string} API version (default: 'v1')
 */
function getApiVersion(req) {
  const path = req.path || req.url;
  const match = path.match(/\/api\/(v\d+)\//);
  return match ? match[1] : 'v1';
}

module.exports = {
  createVersionedRouter,
  versionRouter,
  getApiVersion
};

