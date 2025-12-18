/**
 * Shop Isolation Middleware
 * Ensures strict data isolation between shops (tenants)
 * Prevents cross-shop data access
 */

/**
 * Middleware to enforce shop isolation on resource access
 * Validates that users can only access resources belonging to their shop
 * 
 * @param {string} resourceTable - Database table name
 * @param {string} idParam - Route parameter name for resource ID (default: 'id')
 * @param {string} shopIdColumn - Column name for shop_id (default: 'shop_id')
 */
function enforceShopIsolation(resourceTable, idParam = 'id', shopIdColumn = 'shop_id') {
  return async (req, res, next) => {
    try {
      const resourceId = req.params[idParam];
      const user = req.user;
      
      if (!user) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      
      // Superadmin can access any resource (when explicitly filtering by shop_id)
      if (user.role === 'superadmin') {
        // If superadmin has selected a shop, validate resource belongs to that shop
        const shopFilter = req.query.shop_id || req.body.shop_id;
        if (shopFilter) {
          const shopId = parseInt(shopFilter);
          if (!isNaN(shopId)) {
            // Validate resource belongs to selected shop
            const db = req.app.locals.db || global.db;
            if (!db) {
              return res.status(500).json({ error: 'Database not available' });
            }
            
            return new Promise((resolve) => {
              db.get(
                `SELECT ${shopIdColumn} FROM ${resourceTable} WHERE id = ?`,
                [resourceId],
                (err, resource) => {
                  if (err) {
                    return res.status(500).json({ error: 'Database error' });
                  }
                  if (!resource) {
                    return res.status(404).json({ error: 'Resource not found' });
                  }
                  if (resource[shopIdColumn] !== shopId) {
                    return res.status(403).json({ error: 'Access denied: Resource does not belong to selected shop' });
                  }
                  next();
                  resolve();
                }
              );
            });
          }
        }
        // Superadmin without shop filter can access any resource
        return next();
      }
      
      // Non-superadmin users must have a shop_id
      if (!user.shop_id) {
        return res.status(403).json({ error: 'Access denied: User not assigned to a shop' });
      }
      
      // Validate resource belongs to user's shop
      const db = req.app.locals.db || global.db;
      if (!db) {
        return res.status(500).json({ error: 'Database not available' });
      }
      
      return new Promise((resolve) => {
        db.get(
          `SELECT ${shopIdColumn} FROM ${resourceTable} WHERE id = ?`,
          [resourceId],
          (err, resource) => {
            if (err) {
              return res.status(500).json({ error: 'Database error' });
            }
            if (!resource) {
              return res.status(404).json({ error: 'Resource not found' });
            }
            
            // Check if resource belongs to user's shop
            const resourceShopId = resource[shopIdColumn];
            if (resourceShopId !== user.shop_id) {
              console.warn(`[SECURITY] Shop isolation violation: User ${user.id} (shop ${user.shop_id}) attempted to access ${resourceTable} ${resourceId} (shop ${resourceShopId})`);
              
              // Log security event
              if (global.logAudit) {
                const mockReq = {
                  user: { id: user.id, username: user.username, role: user.role },
                  headers: req.headers,
                  ip: req.ip || req.connection.remoteAddress
                };
                global.logAudit(mockReq, 'SHOP_ISOLATION_VIOLATION', resourceTable, resourceId, {
                  attempted_shop_id: user.shop_id,
                  resource_shop_id: resourceShopId
                });
              }
              
              return res.status(403).json({ error: 'Access denied: Resource does not belong to your shop' });
            }
            
            next();
            resolve();
          }
        );
      });
    } catch (error) {
      console.error('Shop isolation middleware error:', error);
      return res.status(500).json({ error: 'Security check failed' });
    }
  };
}

/**
 * Middleware to validate shop_id in request body/params
 * Ensures users can only create/modify resources for their own shop
 */
function validateShopAccess() {
  return (req, res, next) => {
    const user = req.user;
    
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Superadmin can set any shop_id
    if (user.role === 'superadmin') {
      return next();
    }
    
    // Non-superadmin users can only access their own shop
    const requestedShopId = req.body.shop_id || req.params.shop_id || req.query.shop_id;
    
    if (requestedShopId !== undefined && requestedShopId !== null) {
      const parsedShopId = parseInt(requestedShopId);
      if (!isNaN(parsedShopId) && parsedShopId !== user.shop_id) {
        console.warn(`[SECURITY] Shop access violation: User ${user.id} (shop ${user.shop_id}) attempted to access shop ${parsedShopId}`);
        
        // Log security event
        if (global.logAudit) {
          const mockReq = {
            user: { id: user.id, username: user.username, role: user.role },
            headers: req.headers,
            ip: req.ip || req.connection.remoteAddress
          };
          global.logAudit(mockReq, 'SHOP_ACCESS_VIOLATION', 'shop', parsedShopId, {
            user_shop_id: user.shop_id,
            attempted_shop_id: parsedShopId
          });
        }
        
        return res.status(403).json({ error: 'Access denied: Cannot access other shops\' data' });
      }
    }
    
    // Automatically set shop_id to user's shop_id if not provided
    if (!req.body.shop_id && user.shop_id) {
      req.body.shop_id = user.shop_id;
    }
    
    next();
  };
}

/**
 * Helper to check if a resource belongs to a shop
 * @param {Object} db - Database connection
 * @param {string} table - Table name
 * @param {number} resourceId - Resource ID
 * @param {number} shopId - Shop ID to check
 * @param {Function} callback - Callback function (err, belongs)
 */
function checkResourceBelongsToShop(db, table, resourceId, shopId, callback) {
  db.get(
    `SELECT shop_id FROM ${table} WHERE id = ?`,
    [resourceId],
    (err, resource) => {
      if (err) {
        return callback(err, false);
      }
      if (!resource) {
        return callback(null, false);
      }
      callback(null, resource.shop_id === shopId);
    }
  );
}

module.exports = {
  enforceShopIsolation,
  validateShopAccess,
  checkResourceBelongsToShop
};

