# Post-Deployment Checklist

## ✅ You've Set Environment Variables - What's Next?

### Step 1: Verify Railway Deployment ✅

1. **Check Deployment Status**
   - Go to Railway Dashboard → Your Service
   - Check if deployment is "Active" and "Successful"
   - Look for green checkmarks ✅

2. **Check Build Logs**
   - Click on "Deploy Logs" tab
   - Look for these success messages:
     ```
     ✓ Environment variables validated
     ✓ Connected to SQLite database at: ./ims.db
     ✓ Database initialization complete
     ✓ IMS Server running on port XXXX
     ✓ Listening on 0.0.0.0:XXXX (Railway compatible)
     ```

3. **Check for Errors**
   - If you see "JWT_SECRET is not configured" → Go back and set it
   - If you see database errors → Check logs for details
   - If deployment failed → Check build logs for npm errors

---

### Step 2: Get Your Railway URL 🌐

1. **Find Your Domain**
   - Railway Dashboard → Your Service → Settings
   - Look for "Domains" section
   - Your URL will be something like: `https://ims-production-bf33.up.railway.app`
   - Or click "Generate Domain" if you don't have one

2. **Copy Your URL**
   - You'll need this to access your application

---

### Step 3: Test the Application 🧪

1. **Open Your Railway URL**
   - Open in browser: `https://your-railway-url.railway.app`
   - You should see the login page

2. **Login with Default Credentials**
   - **Username:** `admin`
   - **Password:** `admin123`
   - Click "Login"

3. **Expected Results:**
   - ✅ **Success:** You're redirected to the dashboard
   - ❌ **500 Error:** Check Railway logs for error details
   - ❌ **401 Error:** Credentials might be wrong, or admin user wasn't created

---

### Step 4: Verify Everything Works ✅

After successful login, test these:

- [ ] Dashboard loads correctly
- [ ] Can view inventory items
- [ ] Can create a new item
- [ ] Can view users
- [ ] Can access reports
- [ ] Navigation works between pages

---

### Step 5: Security - Change Default Password 🔒

**IMPORTANT:** Change the default admin password immediately!

1. **After Login:**
   - Go to Dashboard
   - Look for "Settings" or "Profile" section
   - Or go to Users page → Edit admin user
   - Change password from `admin123` to something secure

2. **Recommended Password:**
   - At least 8 characters
   - Mix of letters, numbers, and symbols
   - Don't use common passwords

---

### Step 6: Optional - Set Custom Domain 🌍

If you want a custom domain:

1. **Railway Dashboard → Settings → Domains**
2. **Add Custom Domain**
3. **Update ALLOWED_ORIGINS** environment variable:
   - Add your custom domain to the list
   - Format: `https://yourdomain.com,https://www.yourdomain.com`

---

## 🐛 Troubleshooting

### Problem: Can't Access the Site
**Solutions:**
- Check Railway deployment is "Active"
- Verify your Railway URL is correct
- Check if domain is properly configured

### Problem: 500 Error on Login
**Solutions:**
- Check Railway logs for error details
- Verify `JWT_SECRET` is set correctly
- Check if database initialized properly
- Look for "Database initialization complete" in logs

### Problem: 401 Invalid Credentials
**Solutions:**
- Verify you're using: `admin` / `admin123`
- Check Railway logs for "Database initialization complete"
- The admin user might not have been created
- Try restarting the Railway service

### Problem: Database Errors
**Solutions:**
- Check Railway logs for database connection errors
- Verify `DATABASE_PATH` is set correctly (if you changed it)
- SQLite database should be created automatically

---

## 📊 Monitoring Your Deployment

### Check Railway Logs Regularly:
1. **HTTP Logs** - See all incoming requests
2. **Deploy Logs** - See server startup and errors
3. **Build Logs** - See npm install and build process

### What to Monitor:
- ✅ Server is running (no crashes)
- ✅ Login attempts (successful/failed)
- ✅ Database operations (no errors)
- ✅ API requests (response times)

---

## 🎉 Success Checklist

- [ ] Environment variables set in Railway
- [ ] Deployment successful and active
- [ ] Can access Railway URL
- [ ] Login page loads
- [ ] Can login with admin/admin123
- [ ] Dashboard loads after login
- [ ] Can navigate between pages
- [ ] Changed default password
- [ ] Application is working correctly

---

## 🚀 Next Steps After Setup

1. **Create Additional Users**
   - Go to Users page
   - Create users with different roles (storekeeper, sales, manager)

2. **Add Inventory Items**
   - Go to Inventory page
   - Add your first items
   - Set up categories

3. **Configure Settings**
   - Set up suppliers
   - Configure stock levels
   - Customize as needed

4. **Test All Features**
   - Create a purchase
   - Make a sale
   - Generate reports
   - Test all modules

---

## 📞 Need Help?

If something isn't working:

1. **Check Railway Logs First** - Most errors are visible there
2. **Verify Environment Variables** - Make sure JWT_SECRET is set
3. **Check Deployment Status** - Make sure it's "Active"
4. **Review Error Messages** - They usually tell you what's wrong

---

**You're all set! Your application should now be running on Railway! 🎉**

