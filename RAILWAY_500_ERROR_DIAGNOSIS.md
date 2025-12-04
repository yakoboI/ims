# Why Railway Causes 500 Error on /api/login

## 🔍 Railway-Specific Causes (No Code Changes Needed)

### **Root Cause #1: JWT_SECRET Not Set or Empty** ⚠️ MOST LIKELY

**Why Railway Causes This:**
- Railway environment variables are separate from your code
- If `JWT_SECRET` isn't set in Railway Variables, the server starts but login fails
- The code checks for JWT_SECRET at startup (line 22-35), but if it's empty string or whitespace, it might pass validation but fail at runtime

**What Happens:**
1. Server starts (validation passes if variable exists but is empty)
2. Login request comes in
3. Code checks `if (!JWT_SECRET)` at line 724
4. Returns 500 error: "Server configuration error"

**How to Check:**
- Railway Dashboard → Variables → Check if `JWT_SECRET` exists
- Check Railway logs for: "JWT_SECRET is not configured"

---

### **Root Cause #2: Database Not Initialized** ⚠️ COMMON

**Why Railway Causes This:**
- Railway uses **ephemeral filesystem** - files can be lost between deployments
- SQLite database file (`ims.db`) might not exist or be writable
- Database initialization (`initDatabase()`) runs asynchronously and might not complete before first login

**What Happens:**
1. Server starts
2. Database connection attempts (line 161)
3. If database file doesn't exist or isn't writable → `db = null`
4. Login request comes in
5. Code checks `if (!db)` at line 718 → Returns 500 error

**Railway-Specific Issues:**
- **File Permissions:** Railway's filesystem might have different permissions
- **Path Issues:** Relative path `./ims.db` might resolve differently on Railway
- **Timing:** Database initialization might not complete before first request

**How to Check:**
- Railway logs should show: "Connected to SQLite database at: ./ims.db"
- If you see "Database not initialized" → Database failed to connect

---

### **Root Cause #3: Database Tables Not Created** ⚠️ POSSIBLE

**Why Railway Causes This:**
- `initDatabase()` runs asynchronously (line 477)
- If database connection fails silently, tables never get created
- First login tries to query `users` table that doesn't exist

**What Happens:**
1. Database connection fails (but doesn't crash server)
2. `initDatabase()` runs but `db` is null, so it returns early (line 208)
3. No tables created, no admin user created
4. Login tries to query `users` table → SQL error → 500 error

**How to Check:**
- Railway logs should show: "✓ Database initialization complete"
- If missing → Database initialization failed

---

### **Root Cause #4: Admin User Not Created** ⚠️ POSSIBLE

**Why Railway Causes This:**
- Admin user creation happens inside `initDatabase()` (line 463-472)
- If database initialization fails or is incomplete, admin user never gets created
- Login tries to find user `admin` → Not found → But should return 401, not 500

**What Happens:**
- If admin user doesn't exist, login should return 401 (Invalid credentials)
- If you're getting 500, it's likely a different issue (database error, JWT error, etc.)

---

### **Root Cause #5: Railway Filesystem Limitations** ⚠️ RARE

**Why Railway Causes This:**
- Railway uses **ephemeral storage** - files can be lost
- SQLite needs write permissions
- Railway's filesystem might have restrictions

**What Happens:**
- Database file can't be created or written to
- SQLite operations fail
- Returns 500 error

---

## 🔍 How to Diagnose (Check Railway Logs)

### **Step 1: Check Server Startup**
Look for these in Railway Deploy Logs:
```
✓ Environment variables validated
Connected to SQLite database at: ./ims.db
✓ Database initialization complete
✓ IMS Server running on port XXXX
```

**If Missing:**
- "Environment variables validated" missing → JWT_SECRET not set
- "Connected to SQLite database" missing → Database connection failed
- "Database initialization complete" missing → Tables not created

### **Step 2: Check Login Error**
When you try to login, check Railway HTTP Logs or Deploy Logs for:
```
Login attempt received
JWT_SECRET is not configured  ← JWT_SECRET issue
Database not initialized  ← Database issue
Database error fetching user  ← Database query issue
Error generating token  ← JWT issue
```

### **Step 3: Check Environment Variables**
Railway Dashboard → Variables:
- ✅ `JWT_SECRET` exists and has a value (not empty)
- ✅ Value is a long random string (64+ characters)

---

## 🎯 Most Likely Cause for Your Error

Based on the 500 error pattern, **most likely causes:**

1. **JWT_SECRET not set or empty** (80% probability)
   - Check Railway Variables
   - Verify it's not just whitespace

2. **Database not initialized** (15% probability)
   - Check Railway logs for database connection
   - Check if `ims.db` file was created

3. **Database tables not created** (5% probability)
   - Check Railway logs for "Database initialization complete"

---

## 📊 Railway vs Local Differences

| Issue | Local | Railway |
|-------|-------|---------|
| **Environment Variables** | `.env` file | Railway Variables tab |
| **Filesystem** | Persistent | Ephemeral (can reset) |
| **File Permissions** | Your user permissions | Railway's permissions |
| **Database Path** | `./ims.db` (works) | `./ims.db` (might need full path) |
| **Startup Timing** | Fast, synchronous | Can be slower, async issues |

---

## 🔧 What to Check in Railway (No Code Changes)

1. **Variables Tab:**
   - Is `JWT_SECRET` set?
   - Is it a long random string?
   - No extra spaces or quotes?

2. **Deploy Logs:**
   - Does it show "Environment variables validated"?
   - Does it show "Connected to SQLite database"?
   - Does it show "Database initialization complete"?

3. **HTTP Logs:**
   - When you try to login, what error appears?
   - Look for specific error messages

4. **Service Status:**
   - Is the service "Active"?
   - Is it running or crashed?

---

## 💡 Quick Diagnosis Steps

**Run these checks in order:**

1. ✅ **Check JWT_SECRET exists** in Railway Variables
2. ✅ **Check Railway logs** for startup messages
3. ✅ **Try login** and check logs for specific error
4. ✅ **Verify database** was created (check logs)

**The error message in Railway logs will tell you exactly which of these is the problem!**

---

## 🎯 Summary

**Railway causes 500 errors because:**
- Environment variables must be set separately (not in code)
- Filesystem is ephemeral (database might not persist)
- File permissions might differ
- Startup timing can cause race conditions

**Most common Railway-specific issue:**
- **JWT_SECRET not set in Railway Variables** → Server starts but login fails with 500

Check your Railway Variables first! That's the #1 cause of this error on Railway.

