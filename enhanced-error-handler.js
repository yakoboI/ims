/**
 * Enhanced Error Handling Middleware
 * Provides structured error responses and logging
 */

/**
 * Error categories
 */
const ErrorCategory = {
  VALIDATION: 'VALIDATION',
  AUTHENTICATION: 'AUTHENTICATION',
  AUTHORIZATION: 'AUTHORIZATION',
  NOT_FOUND: 'NOT_FOUND',
  DATABASE: 'DATABASE',
  EXTERNAL_SERVICE: 'EXTERNAL_SERVICE',
  INTERNAL: 'INTERNAL',
  RATE_LIMIT: 'RATE_LIMIT'
};

/**
 * Create structured error response
 * @param {Error} err - Error object
 * @param {Object} req - Express request object
 * @param {string} category - Error category
 * @returns {Object} Structured error response
 */
function createErrorResponse(err, req, category = ErrorCategory.INTERNAL) {
  const requestId = req.id || req.headers['x-request-id'] || 'unknown';
  
  // Determine HTTP status code based on category
  const statusMap = {
    [ErrorCategory.VALIDATION]: 400,
    [ErrorCategory.AUTHENTICATION]: 401,
    [ErrorCategory.AUTHORIZATION]: 403,
    [ErrorCategory.NOT_FOUND]: 404,
    [ErrorCategory.DATABASE]: 500,
    [ErrorCategory.EXTERNAL_SERVICE]: 502,
    [ErrorCategory.INTERNAL]: 500,
    [ErrorCategory.RATE_LIMIT]: 429
  };
  
  const statusCode = statusMap[category] || 500;
  
  // Sanitize error message for production
  const isProduction = process.env.NODE_ENV === 'production';
  let message = err.message || 'An error occurred';
  
  if (isProduction) {
    // Sanitize sensitive information
    if (message.includes('SQLITE')) {
      message = 'Database error occurred. Please try again or contact support.';
    } else if (message.includes('JWT') || message.includes('token')) {
      message = 'Authentication error. Please log in again.';
    } else if (message.includes('password')) {
      message = 'Authentication failed.';
    }
  }
  
  const response = {
    error: message,
    category,
    requestId,
    timestamp: new Date().toISOString()
  };
  
  // Add error code if available
  if (err.code) {
    response.code = err.code;
  }
  
  // Add stack trace in development
  if (!isProduction && err.stack) {
    response.stack = err.stack;
  }
  
  return {
    statusCode,
    body: response
  };
}

/**
 * Enhanced error handler middleware
 */
function enhancedErrorHandler(err, req, res, next) {
  // Log error with context
  const logContext = {
    requestId: req.id,
    method: req.method,
    path: req.path,
    user: req.user?.id || 'anonymous',
    ip: req.ip,
    userAgent: req.get('user-agent')
  };
  
  console.error('[ERROR]', {
    ...logContext,
    error: {
      message: err.message,
      stack: err.stack,
      name: err.name,
      code: err.code
    }
  });
  
  // Determine error category
  let category = ErrorCategory.INTERNAL;
  
  if (err.name === 'ValidationError' || err.status === 400) {
    category = ErrorCategory.VALIDATION;
  } else if (err.name === 'UnauthorizedError' || err.status === 401) {
    category = ErrorCategory.AUTHENTICATION;
  } else if (err.name === 'ForbiddenError' || err.status === 403) {
    category = ErrorCategory.AUTHORIZATION;
  } else if (err.status === 404) {
    category = ErrorCategory.NOT_FOUND;
  } else if (err.status === 429) {
    category = ErrorCategory.RATE_LIMIT;
  } else if (err.message && err.message.includes('SQLITE')) {
    category = ErrorCategory.DATABASE;
  } else if (err.message && (err.message.includes('ECONNREFUSED') || err.message.includes('timeout'))) {
    category = ErrorCategory.EXTERNAL_SERVICE;
  }
  
  // Create structured error response
  const errorResponse = createErrorResponse(err, req, category);
  
  // Send response
  res.status(errorResponse.statusCode).json(errorResponse.body);
  
  // Log to audit log if available
  if (global.logAudit && req.user) {
    try {
      global.logAudit(req, 'API_ERROR', 'api', null, {
        category,
        message: err.message,
        path: req.path,
        method: req.method
      });
    } catch (auditError) {
      console.error('Failed to log error to audit:', auditError);
    }
  }
}

/**
 * 404 handler for undefined routes
 */
function notFoundHandler(req, res) {
  const errorResponse = createErrorResponse(
    new Error(`Route ${req.method} ${req.path} not found`),
    req,
    ErrorCategory.NOT_FOUND
  );
  
  res.status(errorResponse.statusCode).json(errorResponse.body);
}

/**
 * Async error wrapper
 * Wraps async route handlers to catch errors
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = {
  enhancedErrorHandler,
  notFoundHandler,
  asyncHandler,
  createErrorResponse,
  ErrorCategory
};

