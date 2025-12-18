/**
 * Swagger/OpenAPI Configuration
 * API documentation setup
 */

const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Inventory Management System API',
      version: '1.0.0',
      description: 'RESTful API for multi-shop inventory management system',
      contact: {
        name: 'API Support',
        email: 'support@example.com'
      },
      license: {
        name: 'ISC',
        url: 'https://opensource.org/licenses/ISC'
      }
    },
    servers: [
      {
        url: process.env.API_BASE_URL || 'http://localhost:3000',
        description: 'Development server'
      },
      {
        url: process.env.PRODUCTION_URL || 'https://your-domain.com',
        description: 'Production server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT token obtained from /api/login endpoint'
        }
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'string',
              description: 'Error message'
            },
            code: {
              type: 'integer',
              description: 'Error code (optional)'
            },
            requestId: {
              type: 'string',
              description: 'Request ID for tracking'
            }
          }
        },
        Item: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            name: { type: 'string' },
            sku: { type: 'string' },
            description: { type: 'string' },
            category_id: { type: 'integer' },
            unit_price: { type: 'number', format: 'float' },
            cost_price: { type: 'number', format: 'float' },
            stock_quantity: { type: 'integer' },
            min_stock_level: { type: 'integer' },
            unit: { type: 'string' },
            image_url: { type: 'string', format: 'uri' },
            shop_id: { type: 'integer' },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' }
          }
        },
        Shop: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            shop_name: { type: 'string' },
            shop_code: { type: 'string' },
            subscription_plan: { type: 'string', enum: ['basic', 'standard', 'premium'] },
            subscription_expires_at: { type: 'string', format: 'date-time' },
            created_at: { type: 'string', format: 'date-time' }
          }
        },
        ImageUpload: {
          type: 'object',
          properties: {
            image_url: { type: 'string', format: 'uri' },
            public_id: { type: 'string' },
            width: { type: 'integer' },
            height: { type: 'integer' },
            format: { type: 'string' },
            bytes: { type: 'integer' }
          }
        }
      },
      responses: {
        UnauthorizedError: {
          description: 'Authentication required',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
              example: { error: 'Access token required' }
            }
          }
        },
        ForbiddenError: {
          description: 'Insufficient permissions',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
              example: { error: 'Insufficient permissions' }
            }
          }
        },
        NotFoundError: {
          description: 'Resource not found',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
              example: { error: 'Resource not found' }
            }
          }
        },
        ValidationError: {
          description: 'Validation error',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
              example: { error: 'Invalid input data' }
            }
          }
        }
      }
    },
    security: [
      {
        bearerAuth: []
      }
    ]
  },
  apis: ['./server.js'] // Path to API files with JSDoc comments
};

function setupSwagger(app) {
  try {
    const swaggerSpec = swaggerJsdoc(options);
    
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
      customCss: '.swagger-ui .topbar { display: none }',
      customSiteTitle: 'IMS API Documentation'
    }));
    
    // JSON endpoint for Swagger spec
    app.get('/api-docs.json', (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.send(swaggerSpec);
    });
    
    console.log('📚 Swagger documentation available at /api-docs');
  } catch (error) {
    console.error('Error setting up Swagger:', error);
  }
}

module.exports = {
  setupSwagger
};

