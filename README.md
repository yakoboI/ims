# Inventory Management System (IMS)

A comprehensive web-based Inventory Management System built with Node.js, Express, SQLite, and vanilla JavaScript. This system helps businesses track inventory levels, manage sales and purchases, and generate detailed reports.

## Features

### Core Modules

1. **Inventory Module**
   - Add, update, and manage items
   - Track stock levels in real-time
   - Low stock alerts
   - Stock adjustments
   - Category management

2. **Purchasing Module**
   - Create purchase orders
   - Record supplier details
   - Automatically update stock on purchase
   - Purchase history tracking

3. **Sales Module**
   - Record sales transactions
   - Automatic stock deduction
   - Generate sales receipts
   - Customer information tracking

4. **User Management**
   - Create and manage users
   - Role-based access control (Admin, Storekeeper, Sales, Manager)
   - User authentication and authorization

5. **Reporting Module**
   - Stock reports with low stock alerts
   - Sales reports with date filtering
   - Purchase reports
   - Fast-moving and slow-moving items analysis
   - Dashboard with key metrics

## System Requirements

- Node.js (v14 or higher)
- npm (Node Package Manager)

## Installation

1. **Clone or download the project**
   ```bash
   cd ims
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Create environment file (optional)**
   Create a `.env` file in the root directory:
   ```
   PORT=3000
   JWT_SECRET=your-secret-key-change-in-production
   ```

4. **Start the server**
   ```bash
   npm start
   ```
   
   For development with auto-reload:
   ```bash
   npm run dev
   ```

5. **Access the application**
   Open your browser and navigate to:
   ```
   http://localhost:3000
   ```

## Default Login Credentials

- **Username:** `admin`
- **Password:** `admin123`
- **Role:** Admin (Full access)

**⚠️ Important:** Change the default admin password after first login for security.

## User Roles & Permissions

### Admin
- Full access

### Storekeeper
- Manages stock

### Sales/Staff User
- Sells items

### Manager
- Views reports

## Database

The system uses SQLite database (`ims.db`) which is automatically created on first run. The database includes the following tables:

- `users` - User accounts and roles
- `categories` - Item categories
- `items` - Inventory items
- `suppliers` - Supplier information
- `purchases` - Purchase orders
- `purchase_items` - Purchase line items
- `sales` - Sales transactions
- `sales_items` - Sales line items
- `stock_adjustments` - Stock adjustment history

## API Endpoints

### Authentication
- `POST /api/login` - User login

### Users
- `GET /api/users` - Get all users (Admin only)
- `POST /api/users` - Create user (Admin only)
- `PUT /api/users/:id` - Update user (Admin only)

### Categories
- `GET /api/categories` - Get all categories
- `POST /api/categories` - Create category

### Items
- `GET /api/items` - Get all items
- `GET /api/items/:id` - Get item by ID
- `POST /api/items` - Create item
- `PUT /api/items/:id` - Update item
- `DELETE /api/items/:id` - Deactivate item

### Suppliers
- `GET /api/suppliers` - Get all suppliers
- `POST /api/suppliers` - Create supplier

### Purchases
- `GET /api/purchases` - Get all purchases
- `GET /api/purchases/:id` - Get purchase by ID
- `POST /api/purchases` - Create purchase

### Sales
- `GET /api/sales` - Get all sales
- `GET /api/sales/:id` - Get sale by ID
- `POST /api/sales` - Create sale

### Stock Adjustments
- `GET /api/stock-adjustments` - Get all adjustments
- `POST /api/stock-adjustments` - Create adjustment

### Backup & Restore
- `POST /api/backup` - Create database backup (Admin only)
- `GET /api/backups` - List all backups (Admin only)
- `POST /api/restore` - Restore from backup (Admin only)
- `DELETE /api/backups/:filename` - Delete backup (Admin only)

### Reports
- `GET /api/reports/dashboard` - Dashboard statistics
- `GET /api/reports/stock` - Stock report
- `GET /api/reports/sales` - Sales report
- `GET /api/reports/purchases` - Purchase report
- `GET /api/reports/fast-moving` - Fast moving items
- `GET /api/reports/slow-moving` - Slow moving items

## Project Structure

```
ims/
├── server.js              # Express server and API routes
├── package.json           # Dependencies and scripts
├── ims.db                 # SQLite database (created automatically)
├── public/                # Frontend files
│   ├── index.html         # Login page
│   ├── dashboard.html     # Dashboard
│   ├── inventory.html     # Inventory management
│   ├── sales.html         # Sales management
│   ├── purchases.html    # Purchase management
│   ├── reports.html       # Reports
│   ├── users.html         # User management
│   ├── styles.css         # Global styles
│   ├── app.js             # Common JavaScript functions
│   ├── dashboard.js       # Dashboard functionality
│   ├── inventory.js       # Inventory functionality
│   ├── sales.js           # Sales functionality
│   ├── purchases.js      # Purchase functionality
│   ├── reports.js         # Reports functionality
│   └── users.js           # User management functionality
└── README.md              # This file
```

## Features in Detail

### Inventory Management
- Add items with SKU, name, category, pricing, and stock levels
- Set minimum stock levels for automatic alerts
- Real-time stock tracking
- Stock adjustments with reason tracking
- Search and filter items

### Sales Management
- Quick sale entry with multiple items
- Automatic stock deduction
- Customer information capture
- Sales history and receipts
- **Print receipts/invoices** - Professional printable receipts
- Stock validation before sale

### Purchase Management
- Supplier management
- Purchase order creation
- Automatic stock updates on purchase
- Purchase history tracking
- Multi-item purchase support

### Reporting
- Real-time dashboard with key metrics
- Stock reports with low stock alerts
- Sales reports with date filtering
- Purchase reports
- Fast-moving items analysis
- Slow-moving items identification

## Data Backup & Restore

The system includes comprehensive backup and restore functionality:

- **Manual Backup Creation** - Create database backups on demand
- **Backup Management** - View, list, and delete backups
- **Restore Functionality** - Restore database from any backup
- **Safety Measures** - Automatic pre-restore backup creation
- **Admin UI** - Easy-to-use interface in User Management page

**Access:** Admin users can access backup/restore features from the User Management page.

## Security

- JWT-based authentication
- Password hashing with bcrypt
- Role-based access control
- SQL injection protection (parameterized queries)
- CORS enabled for API access

## Future Enhancements

As per the documentation, future enhancements may include:
- Barcode scanning integration
- Multi-branch inventory support
- Mobile app version
- Automated email alerts

## Troubleshooting

### Database Issues
If you encounter database errors, delete the `ims.db` file and restart the server. The database will be recreated automatically.

### Port Already in Use
If port 3000 is already in use, change the PORT in `.env` file or modify `server.js`.

### Login Issues
- Ensure you're using the correct default credentials
- Check browser console for errors
- Verify the server is running

## License

This project is provided as-is for educational and business use.

## Support

For issues or questions, please check the code comments or refer to the inline documentation.

---

**Note:** This is a production-ready system but should be deployed with proper security measures, including:
- Strong JWT secret key
- HTTPS in production
- Regular database backups
- User password policies
- Rate limiting for API endpoints

