/**
 * In-Memory Cache Middleware
 * Costless caching solution for frequently accessed product data
 * No external dependencies required - uses Node.js built-in features
 */

class InMemoryCache {
  constructor() {
    this.cache = new Map();
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0
    };
  }

  /**
   * Get cached value
   * @param {string} key - Cache key
   * @returns {any|null} - Cached value or null if not found/expired
   */
  get(key) {
    const item = this.cache.get(key);
    
    if (!item) {
      this.stats.misses++;
      return null;
    }

    // Check if expired
    if (item.expiresAt && Date.now() > item.expiresAt) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }

    this.stats.hits++;
    return item.value;
  }

  /**
   * Set cached value
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {number} ttlSeconds - Time to live in seconds (default: 300 = 5 minutes)
   */
  set(key, value, ttlSeconds = 300) {
    const expiresAt = Date.now() + (ttlSeconds * 1000);
    this.cache.set(key, {
      value,
      expiresAt,
      createdAt: Date.now()
    });
    this.stats.sets++;
  }

  /**
   * Delete cached value
   * @param {string} key - Cache key
   */
  delete(key) {
    if (this.cache.delete(key)) {
      this.stats.deletes++;
    }
  }

  /**
   * Delete all cache entries matching a pattern
   * @param {string} pattern - Pattern to match (e.g., 'items:*')
   */
  deletePattern(pattern) {
    const regex = new RegExp(pattern.replace('*', '.*'));
    let deleted = 0;
    
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
        deleted++;
      }
    }
    
    this.stats.deletes += deleted;
    return deleted;
  }

  /**
   * Clear all cache
   */
  clear() {
    const size = this.cache.size;
    this.cache.clear();
    this.stats.deletes += size;
  }

  /**
   * Clean expired entries
   */
  cleanExpired() {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, item] of this.cache.entries()) {
      if (item.expiresAt && now > item.expiresAt) {
        this.cache.delete(key);
        cleaned++;
      }
    }
    
    return cleaned;
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const hitRate = this.stats.hits + this.stats.misses > 0
      ? (this.stats.hits / (this.stats.hits + this.stats.misses) * 100).toFixed(2)
      : 0;

    return {
      ...this.stats,
      size: this.cache.size,
      hitRate: `${hitRate}%`
    };
  }

  /**
   * Get cache size in memory (approximate)
   */
  getSize() {
    return this.cache.size;
  }
}

// Create singleton instance
const cache = new InMemoryCache();

// Clean expired entries every 5 minutes
setInterval(() => {
  const cleaned = cache.cleanExpired();
  if (cleaned > 0) {
    console.log(`[Cache] Cleaned ${cleaned} expired entries`);
  }
}, 5 * 60 * 1000);

/**
 * Express middleware for caching GET requests
 * @param {Object} options - Cache options
 * @param {number} options.ttl - Time to live in seconds (default: 300)
 * @param {Function} options.keyGenerator - Custom key generator function
 * @param {Function} options.shouldCache - Function to determine if response should be cached
 */
function cacheMiddleware(options = {}) {
  const {
    ttl = 300, // 5 minutes default
    keyGenerator = (req) => {
      // Generate cache key from URL and query params
      const shopId = req.query.shop_id || req.user?.shop_id || 'all';
      const role = req.user?.role || 'anonymous';
      return `${req.path}:${role}:${shopId}:${JSON.stringify(req.query)}`;
    },
    shouldCache = (req, res) => {
      // Only cache successful GET requests
      return req.method === 'GET' && res.statusCode === 200;
    }
  } = options;

  return (req, res, next) => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      return next();
    }

    const cacheKey = keyGenerator(req);
    const cached = cache.get(cacheKey);

    if (cached !== null) {
      // Cache hit - return cached response
      return res.json(cached);
    }

    // Cache miss - intercept res.json to cache the response
    const originalJson = res.json.bind(res);
    res.json = function(data) {
      if (shouldCache(req, res)) {
        cache.set(cacheKey, data, ttl);
      }
      return originalJson(data);
    };

    next();
  };
}

/**
 * Invalidate cache for specific patterns
 * Call this after POST/PUT/DELETE operations
 */
function invalidateCache(pattern) {
  return cache.deletePattern(pattern);
}

/**
 * Cache helper for product/item endpoints
 */
const productCache = {
  // Invalidate all item-related cache
  invalidateItems: (shopId = null) => {
    if (shopId) {
      cache.deletePattern(`/api/items:*:${shopId}:*`);
    } else {
      cache.deletePattern('/api/items:*');
    }
  },

  // Invalidate specific item cache
  invalidateItem: (itemId, shopId = null) => {
    cache.deletePattern(`/api/items/${itemId}*`);
    productCache.invalidateItems(shopId);
  },

  // Invalidate category cache
  invalidateCategories: (shopId = null) => {
    if (shopId) {
      cache.deletePattern(`/api/categories:*:${shopId}:*`);
    } else {
      cache.deletePattern('/api/categories:*');
    }
  }
};

module.exports = {
  cache,
  cacheMiddleware,
  invalidateCache,
  productCache
};

