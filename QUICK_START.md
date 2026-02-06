# ClaimCoach AI - Quick Start Guide

Get up and running in 15 minutes!

---

## Prerequisites

- **Go 1.21+** installed
- **Node.js 18+** installed
- **PostgreSQL 15+** (Docker recommended)
- **Supabase account** (free tier works)

---

## Step 1: Database Setup (5 minutes)

### Option A: Docker (Recommended)
```bash
docker run --name claimcoach-postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=claimcoach \
  -p 5432:5432 -d postgres:15
```

### Option B: Local PostgreSQL
```bash
createdb claimcoach
```

---

## Step 2: Supabase Setup (5 minutes)

1. **Go to:** https://supabase.com/dashboard
2. **Create new project** (or use existing)
3. **Wait for project to initialize** (~2 minutes)
4. **Get your credentials:**
   - Go to **Settings** → **API**
   - Copy these values:
     - **Project URL** → `SUPABASE_URL`
     - **anon/public key** → `VITE_SUPABASE_ANON_KEY` (frontend)
     - **service_role key** → `SUPABASE_SERVICE_KEY` (backend)
   - Go to **Settings** → **API** → **JWT Settings**
     - Copy **JWT Secret** → `SUPABASE_JWT_SECRET`

5. **Create storage bucket:**
   - Go to **Storage**
   - Click **New Bucket**
   - Name: `claim-documents`
   - Privacy: **Private**
   - Click **Create**

6. **Create first user:**
   - Go to **Authentication** → **Users**
   - Click **Add User**
   - Email: `test@example.com`
   - Password: `password123`
   - Click **Create User**

---

## Step 3: Backend Setup (3 minutes)

```bash
cd backend

# Create .env file
cat > .env << 'EOF'
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/claimcoach?sslmode=disable
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key-here
SUPABASE_JWT_SECRET=your-jwt-secret-here
ALLOWED_ORIGINS=http://localhost:5173
PORT=8080
FRONTEND_URL=http://localhost:5173
EOF

# Edit .env with your Supabase credentials
nano .env  # or use your favorite editor

# Install dependencies
go mod download

# Start server (migrations run automatically)
go run cmd/server/main.go
```

**Expected output:**
```
Migrations complete
Server starting on port 8080
```

---

## Step 4: Frontend Setup (2 minutes)

```bash
# Open new terminal
cd frontend

# Create .env file
cat > .env << 'EOF'
VITE_API_URL=http://localhost:8080
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
EOF

# Edit .env with your Supabase credentials
nano .env

# Install dependencies
npm install

# Start dev server
npm run dev
```

**Expected output:**
```
  VITE ready in XXX ms
  ➜  Local:   http://localhost:5173/
```

---

## Step 5: Create Your Organization and User (1 minute)

Since you already created a user in Supabase, now create organization and user records:

```bash
# Open new terminal
cd backend

# Connect to database
psql $DATABASE_URL

# Create organization
INSERT INTO organizations (name) VALUES ('Test Property Management Co.');

# Get the organization ID
SELECT id FROM organizations;
# Copy this UUID

# Create user record (use the Supabase user ID and org ID)
INSERT INTO users (id, organization_id, email, name, role)
VALUES (
  'your-supabase-user-id',  -- From Supabase Auth Users page
  'your-org-id',             -- From query above
  'test@example.com',
  'Test User',
  'admin'
);

\q  # Exit psql
```

**Quick SQL script:**
```sql
-- All in one
WITH new_org AS (
  INSERT INTO organizations (name)
  VALUES ('Test Property Management Co.')
  RETURNING id
)
INSERT INTO users (id, organization_id, email, name, role)
VALUES (
  'your-supabase-user-id',
  (SELECT id FROM new_org),
  'test@example.com',
  'Test User',
  'admin'
);
```

---

## Step 6: Test It! (5 minutes)

### 1. Login
- Open http://localhost:5173
- Email: `test@example.com`
- Password: `password123`
- Should redirect to claims dashboard

### 2. Create a Property
- Click **Properties** in navigation
- Click **Add Property**
- Fill in details:
  - Nickname: "Sunset Apartments"
  - Address: "123 Main St, Austin, TX"
  - Owner: "ABC Properties LLC"
- Click **Create**

### 3. Add Insurance Policy
- Click on the property you just created
- Fill in policy details:
  - Carrier: "State Farm"
  - Coverage A: $500,000
  - Coverage B: $50,000
  - Coverage D: $100,000
  - Deductible: 2% (or $5,000 fixed)
- Watch the deductible calculate automatically!
- Click **Save Policy**

### 4. Report a Claim
- Go to **Claims**
- Click **Report Incident**
- Select your property
- Loss Type: Water
- Incident Date: Today
- Click **Create**

### 5. Test Magic Link Flow
- Click on your new claim
- In claim workspace, you should see the claim details
- (Magic link generation button coming in UI - for now test via API)

### Test Magic Link via API:
```bash
# Get your JWT token from browser devtools (Application → Local Storage)
TOKEN="your-jwt-token"

# Generate magic link
curl -X POST http://localhost:8080/api/claims/YOUR_CLAIM_ID/magic-link \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "contractor_name": "Bob'\''s Roofing",
    "contractor_email": "bob@roofing.com"
  }'

# Check server console for email log
# Copy the link_url from response
# Open in incognito window: http://localhost:5173/upload/{token}
```

### 6. Upload as Contractor
- Open the magic link in **incognito/private window**
- See the claim details
- Upload a photo
- Upload a PDF estimate
- Add notes
- Submit
- Go back to claim workspace (as property manager)
- See the uploaded documents!

---

## Troubleshooting

### Backend won't start
```bash
# Check Go version
go version  # Should be 1.21+

# Check database connection
psql $DATABASE_URL -c "SELECT 1"

# Check environment variables
cat backend/.env
```

### Frontend won't start
```bash
# Check Node version
node --version  # Should be 18+

# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install
```

### Can't login
1. Verify user exists in Supabase: Authentication → Users
2. Verify user record exists in database: `SELECT * FROM users;`
3. Verify organization exists: `SELECT * FROM organizations;`
4. Check browser console for errors (F12)

### Migrations error
```bash
# Reset database (WARNING: deletes all data)
cd backend
migrate -path migrations -database $DATABASE_URL drop
go run cmd/server/main.go  # Runs migrations automatically
```

### CORS errors
- Make sure `ALLOWED_ORIGINS` in backend `.env` matches your frontend URL
- Make sure both servers are running
- Check browser console for exact error

---

## Common Issues

**Issue:** "Failed to load config: DATABASE_URL is required"
**Fix:** Create `backend/.env` file with database URL

**Issue:** "Invalid or expired token"
**Fix:** Make sure user record exists in database with correct Supabase user ID

**Issue:** "Network Error"
**Fix:** Check backend is running on port 8080

**Issue:** Upload fails with 404
**Fix:** Verify Supabase storage bucket `claim-documents` is created and private

**Issue:** Can't see uploaded files
**Fix:** Check backend logs, verify Supabase credentials are correct

---

## Features Available

- ✅ Authentication & Multi-tenancy
- ✅ Property & Policy Management
- ✅ Claims Workflow
- ✅ Document Upload (Supabase Storage)
- ✅ Magic Link for Contractors
- ✅ **Deductible Comparison** (NEW - Phase 5)

---

## Next Steps

Once everything works:
1. ✅ Test the complete workflow
2. ✅ Explore the API endpoints
3. ✅ Read `IMPLEMENTATION_SUMMARY.md` for full details
4. ✅ Check out the remaining phases (6-7)
5. ✅ Deploy to staging when ready

---

## Need Help?

- **Documentation:** `IMPLEMENTATION_SUMMARY.md`
- **Email Setup:** `backend/docs/email-setup.md`
- **Testing Guides:** Various testing docs in `backend/`
- **Design Docs:** `docs/plans/`

---

**Tip:** Keep the backend console visible - it logs helpful info including mock emails and debugging information!

🎉 **Enjoy building with ClaimCoach AI!**
