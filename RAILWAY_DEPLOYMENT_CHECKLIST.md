# Railway Deployment Checklist

This document verifies that the IMS application is properly configured for Railway deployment.

## ✅ Verified Configuration

### 1. Start Script ✓
- **Status**: ✅ Correct
- **Location**: `package.json`
- **Script**: `"start": "node server.js"`
- Railway will automatically use this script to start the application.

### 2. Port Binding ✓
- **Status**: ✅ Correct
- **Code**: `const PORT = process.env.PORT || 3000;`
- **Listen**: `app.listen(PORT, '0.0.0.0', ...)`
- The server correctly uses `process.env.PORT` and listens on `0.0.0.0` for Railway compatibility.

### 3. Dependencies ✓
- **Status**: ✅ All runtime dependencies are in `dependencies`
- **Dev Dependencies**: Only `nodemon` (not needed in production)
- All required packages are properly listed:
  - express, cors, body-parser
  - sqlite3, bcryptjs, jsonwebtoken
  - helmet, express-rate-limit
  - dotenv, uuid, pdfkit
  - And others...

### 4. Environment Variables ⚠️ REQUIRED
- **Status**: ⚠️ Must be set in Railway
- **Required Variables**:
  ```
  JWT_SECRET=<your-secret-key-here>
  ```
- **Optional Variables**:
  ```
  NODE_ENV=production
  PORT=<auto-set-by-railway>
  DATABASE_PATH=./ims.db
  JWT_EXPIRES_IN=24h
  REFRESH_TOKEN_EXPIRES_IN=7d
  ALLOWED_ORIGINS=https://your-domain.railway.app
  ```

### 5. Build Configuration ✓
- **Status**: ✅ Configured
- **File**: `railway.json`
- **Build Command**: `npm ci --production=false`
- **Start Command**: `npm start`
- **Restart Policy**: ON_FAILURE with 10 retries

### 6. Node.js Version ✓
- **Status**: ✅ Specified
- **Engines**: `"node": ">=18.0.0"` in `package.json`
- Railway will use a compatible Node.js version.

## 🚀 Deployment Steps

1. **Set Environment Variables in Railway**:
   - Go to Railway Dashboard → Your Service → Variables
   - Add `JWT_SECRET` with a secure random string
   - Optionally set `NODE_ENV=production`

2. **Deploy**:
   - Railway automatically deploys on git push
   - Or manually trigger from Railway dashboard

3. **Monitor Logs**:
   - Check Railway logs for startup messages
   - Look for: "IMS Server running on port XXXX"
   - Verify database connection status

4. **Test**:
   - Access your Railway URL
   - Try logging in with default credentials:
     - Username: `admin`
     - Password: `admin123`

## 🔍 Troubleshooting

### If you see "Internal Server Error (500)":

1. **Check JWT_SECRET**:
   - Must be set in Railway Variables
   - Should be a long, random string
   - Generate with: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`

2. **Check Logs**:
   - Railway Dashboard → Logs tab
   - Look for error messages
   - Check for "JWT_SECRET is not configured" errors

3. **Verify Database**:
   - SQLite database will be created automatically
   - Check logs for "Connected to SQLite database"
   - Database file persists in Railway's filesystem

4. **Check Port**:
   - Railway sets PORT automatically
   - Server should log: "Listening on 0.0.0.0:XXXX"

### Common Issues:

- **"JWT_SECRET is not configured"**: Add JWT_SECRET to Railway Variables
- **"Database not initialized"**: Check database path permissions
- **"Port already in use"**: Railway handles this automatically
- **"Module not found"**: All dependencies should be in `dependencies`, not `devDependencies`

## 📝 Notes

- Railway automatically handles HTTPS termination
- The app listens on `0.0.0.0` to accept Railway's internal network connections
- Database file (`ims.db`) persists between deployments
- All security features are enabled in production mode

## ✅ Verification Commands

After deployment, verify these in Railway logs:

```
✓ Environment variables validated
✓ Connected to SQLite database at: ./ims.db
✓ IMS Server running on port XXXX
✓ Listening on 0.0.0.0:XXXX (Railway compatible)
✓ Environment: production
✓ Security features enabled
```

If all these appear, your deployment is successful! 🎉


