# Inventory Management System (IMS)

A comprehensive inventory management system built with Node.js, Express, and SQLite.

## Features

- Inventory management
- Sales and purchase tracking
- Multi-shop support with subscription plans
- User role-based access control
- Reports and analytics
- Multi-language support

## Prerequisites

- Node.js 22.x or higher
- npm 9.x or higher

## Local Development

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables (create `.env` file):
```
JWT_SECRET=your-secret-key-here
PORT=3000
NODE_ENV=development
```

3. Start the server:
```bash
npm start
```

Or on Windows:
```bash
start-server.bat
```

4. Access the application at `http://localhost:3000`

5. Create superadmin user:
```bash
node create-superadmin-railway.js
```

## Railway Deployment

The project is configured for Railway deployment with:
- `railway.json` - Railway configuration
- `nixpacks.toml` - Build configuration

Set the following environment variables in Railway:
- `JWT_SECRET` - Secret key for JWT tokens
- `PORT` - Server port (Railway sets this automatically)
- `NODE_ENV` - Set to `production`

## Project Structure

```
├── server.js              # Main server file
├── package.json           # Dependencies and scripts
├── railway.json           # Railway deployment config
├── nixpacks.toml          # Build configuration
├── public/                # Frontend files
│   ├── *.html            # Page templates
│   ├── *.js              # JavaScript files
│   ├── *.css             # Stylesheets
│   └── locales/          # Translation files
└── .gitignore            # Git ignore rules
```

## License

Proprietary - All rights reserved

