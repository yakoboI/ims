# Railway Environment Variables Setup Guide

## 📋 Summary

**Total Environment Variables Needed:**
- **Required:** 1 variable
- **Optional:** 5 variables (recommended for production)

---

## 🔴 REQUIRED (Must Set)

### 1. `JWT_SECRET` ⚠️ **CRITICAL**
- **Purpose:** Secret key for signing JWT authentication tokens
- **Why Required:** Without this, the server will fail to start
- **How to Generate:**
  ```bash
  # On your local machine, run:
  node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
  ```
- **Example Value:** `a1b2c3d4e5f6...` (64+ character random string)
- **Security:** Keep this secret! Never commit it to git.

---

## 🟡 OPTIONAL (Recommended for Production)

### 2. `NODE_ENV`
- **Purpose:** Sets the application environment
- **Value:** `production`
- **Default:** `development` (if not set)
- **Why Set:** Enables production optimizations and security features

### 3. `PORT`
- **Purpose:** Server port number
- **Value:** Railway sets this automatically
- **Default:** `3000` (if not set)
- **Note:** ⚠️ **DO NOT SET THIS** - Railway automatically assigns a port

### 4. `DATABASE_PATH`
- **Purpose:** Path to SQLite database file
- **Value:** `./ims.db`
- **Default:** `./ims.db` (if not set)
- **When to Change:** Only if you want a custom database location

### 5. `JWT_EXPIRES_IN`
- **Purpose:** Access token expiration time
- **Value:** `24h` (24 hours)
- **Default:** `24h` (if not set)
- **Other Options:** `1h`, `7d`, `30d`, etc.

### 6. `REFRESH_TOKEN_EXPIRES_IN`
- **Purpose:** Refresh token expiration time
- **Value:** `7d` (7 days)
- **Default:** `7d` (if not set)

### 7. `ALLOWED_ORIGINS`
- **Purpose:** CORS allowed origins (comma-separated)
- **Value:** Your Railway domain, e.g., `https://ims-production-bf33.up.railway.app`
- **Default:** `http://localhost:3000,http://127.0.0.1:3000` (if not set)
- **Format:** `https://domain1.com,https://domain2.com`

---

## 🚀 How to Set Environment Variables in Railway

### Method 1: Railway Dashboard (Recommended)

1. **Go to Railway Dashboard**
   - Visit: https://railway.app
   - Login to your account

2. **Select Your Project**
   - Click on your project (e.g., "ims")

3. **Select Your Service**
   - Click on the service (e.g., "ims")

4. **Go to Variables Tab**
   - Click on **"Variables"** in the left sidebar
   - Or click the **"Variables"** button at the top

5. **Add Variables**
   - Click **"+ New Variable"** button
   - Enter the variable name (e.g., `JWT_SECRET`)
   - Enter the variable value
   - Click **"Add"** or **"Save"**

6. **Repeat for Each Variable**
   - Add all required and optional variables

7. **Redeploy (if needed)**
   - Railway automatically redeploys when you add variables
   - Or manually trigger: Click "Deployments" → "Redeploy"

### Method 2: Railway CLI (Advanced)

```bash
# Install Railway CLI
npm i -g @railway/cli

# Login
railway login

# Link to your project
railway link

# Set variables
railway variables set JWT_SECRET=your-secret-key-here
railway variables set NODE_ENV=production
railway variables set ALLOWED_ORIGINS=https://your-domain.railway.app
```

---

## 📝 Step-by-Step Setup for Your Project

### Step 1: Generate JWT_SECRET
```bash
# Run this command locally:
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```
Copy the output (it will be a long random string)

### Step 2: Set in Railway
1. Go to Railway Dashboard → Your Service → Variables
2. Click **"+ New Variable"**
3. Name: `JWT_SECRET`
4. Value: Paste the generated secret
5. Click **"Add"**

### Step 3: Set Optional Variables (Recommended)
Add these for production:

| Variable Name | Value | Notes |
|--------------|-------|-------|
| `NODE_ENV` | `production` | Enables production mode |
| `ALLOWED_ORIGINS` | `https://ims-production-bf33.up.railway.app` | Your Railway domain |

### Step 4: Verify
- Check Railway logs to see: `✓ Environment variables validated`
- If you see errors about missing JWT_SECRET, double-check the variable name

---

## ✅ Minimum Setup (Quick Start)

**For a quick start, you only need:**

1. `JWT_SECRET` - Generate and set this one variable

That's it! The server will work with just this one variable.

---

## 🔍 Verify Your Setup

After setting variables, check Railway logs:

**Good Signs:**
```
✓ Environment variables validated
✓ Connected to SQLite database at: ./ims.db
✓ IMS Server running on port XXXX
```

**Bad Signs (if you see these, check your variables):**
```
ERROR: Required environment variables are missing or invalid:
  - JWT_SECRET
```

---

## 🛠️ Troubleshooting

### Problem: Server won't start
**Solution:** Check that `JWT_SECRET` is set and not empty

### Problem: "JWT_SECRET is not configured" error
**Solution:** 
- Verify the variable name is exactly `JWT_SECRET` (case-sensitive)
- Make sure there are no extra spaces
- Redeploy after adding the variable

### Problem: CORS errors
**Solution:** Set `ALLOWED_ORIGINS` to your Railway domain

### Problem: Variables not updating
**Solution:** 
- Make sure you saved the variable
- Trigger a redeploy manually
- Check that you're editing the correct service

---

## 📊 Quick Reference

**Required Variables:**
- ✅ `JWT_SECRET` (1 variable)

**Optional Variables:**
- `NODE_ENV=production`
- `DATABASE_PATH=./ims.db`
- `JWT_EXPIRES_IN=24h`
- `REFRESH_TOKEN_EXPIRES_IN=7d`
- `ALLOWED_ORIGINS=https://your-domain.railway.app`

**Total: 1 required + 5 optional = 6 maximum**

---

## 🎯 Recommended Production Setup

For production, set these 3 variables:

1. `JWT_SECRET` (required)
2. `NODE_ENV=production` (recommended)
3. `ALLOWED_ORIGINS=https://your-railway-domain.railway.app` (recommended)

This gives you a secure, production-ready setup! 🚀

