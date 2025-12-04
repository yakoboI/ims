# 📚 API Documentation

## Base URL
```
http://localhost:3000/api
```

Production: `https://yourdomain.com/api`

---

## Authentication

All API endpoints (except `/api/login`) require authentication via JWT token.

### Headers
```
Authorization: Bearer <token>
Content-Type: application/json
```

---

## Endpoints

### Authentication

#### POST /api/login
User login and authentication.

**Request Body:**
```json
{
  "username": "admin",
  "password": "admin123"
}
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "refresh_token_here",
  "user": {
    "id": 1,
    "username": "admin",
    "email": "admin@example.com",
    "role": "admin"
  }
}
```

**Error Responses:**
- `401` - Invalid credentials
- `429` - Too many login attempts

---

### Users

#### GET /api/users
Get all users (Admin only).

**Response:**
```json
[
  {
    "id": 1,
    "username": "admin",
    "email": "admin@example.com",
    "full_name": "Administrator",
    "role": "admin",
    "is_active": 1
  }
]
```

#### POST /api/users
Create new user (Admin only).

**Request Body:**
```json
{
  "username": "newuser",
  "email": "user@example.com",
  "password": "SecurePass123",
  "full_name": "New User",
  "role": "sales"
}
```

**Response:**
```json
{
  "id": 2,
  "username": "newuser",
  "email": "user@example.com",
  "role": "sales"
}
```

#### PUT /api/users/:id
Update user (Admin only).

**Request Body:**
```json
{
  "username": "updateduser",
  "email": "updated@example.com",
  "full_name": "Updated User",
  "role": "storekeeper",
  "is_active": 1
}
```

---

### Categories

#### GET /api/categories
Get all categories.

**Response:**
```json
[
  {
    "id": 1,
    "name": "Electronics",
    "description": "Electronic items"
  }
]
```

#### POST /api/categories
Create category.

**Request Body:**
```json
{
  "name": "Electronics",
  "description": "Electronic items"
}
```

---

### Items

#### GET /api/items
Get all items.

**Query Parameters:**
- `category_id` (optional) - Filter by category

**Response:**
```json
[
  {
    "id": 1,
    "name": "Laptop",
    "sku": "LAP001",
    "category_id": 1,
    "category_name": "Electronics",
    "unit_price": 999.99,
    "cost_price": 800.00,
    "stock_quantity": 10,
    "min_stock_level": 5,
    "unit": "pcs"
  }
]
```

#### GET /api/items/:id
Get item by ID.

#### POST /api/items
Create item.

**Request Body:**
```json
{
  "name": "Laptop",
  "sku": "LAP001",
  "category_id": 1,
  "unit_price": 999.99,
  "cost_price": 800.00,
  "stock_quantity": 10,
  "min_stock_level": 5,
  "unit": "pcs",
  "description": "High-performance laptop"
}
```

#### PUT /api/items/:id
Update item.

#### DELETE /api/items/:id
Deactivate item (soft delete).

---

### Sales

#### GET /api/sales
Get all sales.

**Response:**
```json
[
  {
    "id": 1,
    "sale_date": "2024-01-15T10:30:00.000Z",
    "total_amount": 1999.98,
    "customer_name": "John Doe",
    "created_by": 1,
    "created_by_name": "admin"
  }
]
```

#### GET /api/sales/:id
Get sale details with items.

**Response:**
```json
{
  "id": 1,
  "sale_date": "2024-01-15T10:30:00.000Z",
  "total_amount": 1999.98,
  "customer_name": "John Doe",
  "items": [
    {
      "item_id": 1,
      "item_name": "Laptop",
      "quantity": 2,
      "unit_price": 999.99,
      "total_price": 1999.98
    }
  ]
}
```

#### POST /api/sales
Create sale.

**Request Body:**
```json
{
  "items": [
    {
      "item_id": 1,
      "quantity": 2,
      "unit_price": 999.99
    }
  ],
  "customer_name": "John Doe",
  "notes": "Customer requested invoice"
}
```

---

### Purchases

#### GET /api/purchases
Get all purchases.

#### GET /api/purchases/:id
Get purchase details.

#### POST /api/purchases
Create purchase.

**Request Body:**
```json
{
  "supplier_id": 1,
  "items": [
    {
      "item_id": 1,
      "quantity": 10,
      "unit_price": 800.00
    }
  ],
  "notes": "Bulk purchase order"
}
```

---

### Reports

#### GET /api/reports/dashboard
Get dashboard statistics.

**Response:**
```json
{
  "totalItems": { "count": 100 },
  "lowStockItems": { "count": 5 },
  "totalSales": { "total": 50000.00 },
  "totalPurchases": { "total": 30000.00 }
}
```

#### GET /api/reports/stock
Get stock report.

#### GET /api/reports/sales
Get sales report.

**Query Parameters:**
- `start_date` (optional) - Start date (YYYY-MM-DD)
- `end_date` (optional) - End date (YYYY-MM-DD)

#### GET /api/reports/purchases
Get purchases report.

#### GET /api/reports/fast-moving
Get fast moving items report.

#### GET /api/reports/slow-moving
Get slow moving items report.

---

### Stock Adjustments

#### GET /api/stock-adjustments
Get all stock adjustments.

#### POST /api/stock-adjustments
Create stock adjustment.

**Request Body:**
```json
{
  "item_id": 1,
  "adjustment_type": "increase",
  "quantity": 5,
  "reason": "Stock correction"
}
```

**Adjustment Types:**
- `increase` - Add stock
- `decrease` - Remove stock
- `set` - Set to specific quantity

---

### Backup & Restore (Admin Only)

#### POST /api/backup
Create database backup.

**Response:**
```json
{
  "filename": "ims-backup-2024-01-15.db",
  "message": "Backup created successfully"
}
```

#### GET /api/backups
List all backups.

#### POST /api/restore
Restore from backup.

**Request Body:**
```json
{
  "filename": "ims-backup-2024-01-15.db"
}
```

#### DELETE /api/backups/:filename
Delete backup.

---

## Error Responses

All errors follow this format:

```json
{
  "error": "Error message here"
}
```

### HTTP Status Codes

- `200` - Success
- `201` - Created
- `400` - Bad Request (validation error)
- `401` - Unauthorized (invalid/missing token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `429` - Too Many Requests (rate limited)
- `500` - Internal Server Error

---

## Rate Limiting

- **Authentication endpoints:** 5 requests per 15 minutes
- **General API endpoints:** 100 requests per minute

Rate limit headers:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640000000
```

---

## Pagination

For endpoints returning large datasets, pagination can be implemented client-side using the pagination utility.

---

## Security Notes

1. All passwords must meet strength requirements:
   - Minimum 8 characters
   - At least one uppercase letter
   - At least one lowercase letter
   - At least one number

2. JWT tokens expire after 24 hours (configurable)

3. Refresh tokens expire after 7 days (configurable)

4. Account lockout after 5 failed login attempts

---

**Last Updated:** 2024
**API Version:** 1.0.0

