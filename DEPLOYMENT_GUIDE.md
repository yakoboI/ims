# Free Hosting Guide for IMS

## 🚀 Recommended Platforms

### 1. **Railway** (Easiest - Recommended)
**Free Tier:** $5/month credit (usually enough for small apps)
**Supports:** SQLite ✅, Node.js ✅

#### Steps:
1. Sign up at https://railway.app (use GitHub)
2. Click "New Project" → "Deploy from GitHub"
3. Connect your GitHub repository
4. Railway auto-detects Node.js and deploys
5. Add environment variable: `JWT_SECRET=your-secret-key-here`
6. Your app will be live at: `your-app-name.railway.app`

**Pros:**
- ✅ Easiest deployment
- ✅ Supports SQLite
- ✅ Auto-deploys on git push
- ✅ Free SSL certificate

---

### 2. **Render**
**Free Tier:** 750 hours/month
**Note:** May need PostgreSQL (they provide free PostgreSQL)

#### Steps:
1. Sign up at https://render.com
2. Click "New" → "Web Service"
3. Connect your GitHub repository
4. Settings:
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Environment:** Node
5. Add environment variable: `JWT_SECRET=your-secret-key-here`
6. Deploy!

**Pros:**
- ✅ Free PostgreSQL available
- ✅ Auto-deploys on git push
- ✅ Free SSL

**Cons:**
- ⚠️ Free tier sleeps after 15 min inactivity (takes ~30 sec to wake)

---

### 3. **Fly.io**
**Free Tier:** 3 shared VMs

#### Steps:
1. Install Fly CLI: `npm install -g @fly/cli`
2. Sign up at https://fly.io
3. Run: `fly launch` in your project directory
4. Follow prompts
5. Deploy: `fly deploy`

**Pros:**
- ✅ Supports SQLite
- ✅ Global edge network
- ✅ Fast performance

---

### 4. **Glitch**
**Free Tier:** Always-on option available

#### Steps:
1. Sign up at https://glitch.com
2. Click "New Project" → "Import from GitHub"
3. Paste your repository URL
4. Add environment variable: `JWT_SECRET`
5. Click "Show" to get your live URL

**Pros:**
- ✅ Very simple
- ✅ Always-on option
- ✅ Live code editing

**Cons:**
- ⚠️ Limited resources on free tier

---

## 📋 Pre-Deployment Checklist

### 1. Environment Variables
Create a `.env` file (or set in hosting platform):
```env
JWT_SECRET=your-very-secure-secret-key-change-this-in-production
PORT=3000
NODE_ENV=production
```

### 2. Update CORS Settings
Make sure `allowedOrigins` in `server.js` includes your hosting URL.

### 3. Database
- SQLite file (`ims.db`) will be created automatically
- For Render: Consider migrating to PostgreSQL for better reliability

### 4. Static Files
- All files in `public/` folder are served automatically
- FontAwesome is already local (no CDN needed)

---

## 🔧 Quick Railway Setup (Step-by-Step)

1. **Prepare your code:**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin YOUR_GITHUB_REPO_URL
   git push -u origin main
   ```

2. **On Railway:**
   - Go to https://railway.app
   - Click "New Project"
   - Select "Deploy from GitHub"
   - Choose your repository
   - Railway auto-detects and deploys

3. **Set Environment Variables:**
   - Go to your project → Variables
   - Add: `JWT_SECRET` = `your-secret-key-here`

4. **Get your URL:**
   - Railway provides: `your-app.railway.app`
   - Update CORS in `server.js` if needed

---

## 🌐 Alternative: Static Frontend + Backend API

If you want to separate frontend and backend:

### Frontend (Static):
- **Netlify** (https://netlify.com) - Free
- **Vercel** (https://vercel.com) - Free
- **GitHub Pages** - Free

### Backend API:
- **Railway** - Free tier
- **Render** - Free tier
- **Fly.io** - Free tier

---

## 💡 Tips

1. **Always use environment variables** for secrets (never commit `.env`)
2. **Enable HTTPS** (all platforms provide free SSL)
3. **Set up auto-deployment** from GitHub
4. **Monitor your usage** on free tiers
5. **Backup your database** regularly

---

## 🆘 Troubleshooting

### Port Issues
- Most platforms set `PORT` automatically
- Your code already uses: `process.env.PORT || 3000` ✅

### Database Issues
- SQLite works on Railway and Fly.io
- Render may need PostgreSQL (they provide it free)

### CORS Issues
- Update `allowedOrigins` in `server.js` with your hosting URL

---

## 📚 Resources

- Railway Docs: https://docs.railway.app
- Render Docs: https://render.com/docs
- Fly.io Docs: https://fly.io/docs
