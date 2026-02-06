# Dev Partner Handoff - ClaimCoachAI

**Date:** 2026-02-06
**Status:** Phase 6 complete and merged to main. System 95% production-ready.

---

## 🎯 Quick Start for Your Dev Partner

**Copy this prompt and send it to your dev partner:**

```
Hi! I need you to complete the production deployment of ClaimCoachAI. The system is 95% complete - Phase 6 (AI Audit System) was just finished and merged to main. Here's what you need to do:

CRITICAL TASK (2-3 hours):
1. Replace the mock email service with SendGrid integration
2. Set up production environment (database + env variables)
3. Deploy backend to Railway and frontend to Vercel

The codebase has comprehensive documentation and a complete checklist. Here's how to get started:

1. Clone the repo and read PRODUCTION_COMPLETION_CHECKLIST.md (complete step-by-step instructions)
2. Read DEV_PARTNER_HANDOFF.md (this file - full context and architecture)
3. Start with item #1 in the checklist: Email Service Implementation

Everything is documented with code examples. The system is fully functional in development mode - you just need to swap the mock email service and deploy.

Let me know if you have questions!
```

---

## 📋 What's Complete

### ✅ Phase 1-6 Fully Implemented

**Phase 1: Foundation & Authentication**
- User registration and login with Supabase Auth
- JWT-based authentication
- Role-based access control (Property Managers and Super Admins)
- Organization management

**Phase 2: Property & Claim Management**
- Property CRUD operations
- Claim creation and management
- Claim status workflow
- Document upload/download (Supabase Storage)

**Phase 3: Magic Links for Contractors**
- Token-based authentication (72-hour expiration)
- Email notification system (currently mock - **needs replacement**)
- Public endpoints for contractor access
- Photo upload workflow

**Phase 4: Contractor Portal**
- Photo upload interface (drag & drop)
- Scope sheet form (106+ fields, 4-tab interface)
- Magic link validation
- Submission workflow

**Phase 5: Deductible Comparison**
- Track contractor estimate vs carrier estimate
- Comparison display in UI
- Status tracking

**Phase 6: AI Audit System** ⭐ JUST COMPLETED
- Industry estimate generation using Perplexity API
- Carrier estimate PDF parsing and structuring
- Automated estimate comparison with discrepancies
- Professional rebuttal letter generation
- API usage tracking for cost monitoring

---

## 🏗️ System Architecture

### Tech Stack

**Backend:**
- Go 1.21+ with Gin framework
- PostgreSQL database (Supabase)
- Perplexity API for LLM features

**Frontend:**
- React 18 + TypeScript
- Vite bundler
- Tailwind CSS
- React Query for data fetching

**Infrastructure:**
- Supabase: Auth + Database + Storage
- (Pending) Railway: Backend hosting
- (Pending) Vercel: Frontend hosting
- (Pending) SendGrid: Email delivery

### Database Schema (11 Tables)

```
users
  ├─ organizations (many-to-one)
  ├─ properties (many-to-many through org)
  └─ claims (many-to-one)
      ├─ documents (one-to-many)
      ├─ magic_links (one-to-many)
      ├─ scope_sheets (one-to-one)
      ├─ carrier_estimates (one-to-many)
      ├─ audit_reports (one-to-many)
      │   └─ rebuttals (one-to-many)
      └─ api_usage_logs (one-to-many)
```

**Key Tables:**
- `users` - Authentication and authorization
- `organizations` - Multi-tenant support
- `properties` - Physical properties
- `claims` - Insurance claims
- `documents` - File attachments (stored in Supabase Storage)
- `magic_links` - Contractor authentication tokens
- `scope_sheets` - 106-field damage assessment form
- `carrier_estimates` - Uploaded PDF estimates with parsing
- `audit_reports` - LLM-generated estimates and comparisons
- `rebuttals` - Professional rebuttal letters
- `api_usage_logs` - Cost tracking for LLM API calls

### API Architecture

**25+ REST Endpoints:**

**Authentication:**
- POST `/api/auth/register` - User registration
- POST `/api/auth/login` - User login

**Claims:**
- GET `/api/claims` - List user's claims
- POST `/api/claims` - Create new claim
- GET `/api/claims/:id` - Get claim details
- PUT `/api/claims/:id` - Update claim
- DELETE `/api/claims/:id` - Delete claim

**Documents:**
- POST `/api/claims/:id/documents/upload-url` - Request upload URL
- POST `/api/claims/:id/documents/:docId/confirm` - Confirm upload
- GET `/api/claims/:id/documents` - List documents
- GET `/api/documents/:id/download-url` - Get download URL

**Magic Links (Contractor Portal):**
- POST `/api/magic-links` - Create magic link
- GET `/api/magic-links/:token/validate` - Validate token
- GET `/api/magic-links/:token/claim` - Get claim details (public)
- POST `/api/magic-links/:token/photos` - Upload photos (public)
- POST `/api/magic-links/:token/scope-sheet` - Submit scope sheet (public)

**AI Audit System:**
- POST `/api/claims/:id/audit/generate` - Generate industry estimate
- GET `/api/claims/:id/audit` - Get audit report
- POST `/api/claims/:id/audit/:auditId/compare` - Compare estimates
- POST `/api/claims/:id/audit/:auditId/rebuttal` - Generate rebuttal
- GET `/api/rebuttals/:id` - Get rebuttal
- POST `/api/claims/:id/carrier-estimate/upload-url` - Request upload URL
- POST `/api/claims/:id/carrier-estimate/:estimateId/confirm` - Confirm upload
- POST `/api/claims/:id/carrier-estimate/:estimateId/parse` - Parse PDF
- GET `/api/claims/:id/carrier-estimate` - List estimates

---

## 📁 Key Files & Their Purpose

### Backend (Go)

**Entry Point:**
- `backend/cmd/server/main.go` - Server initialization and routing

**Configuration:**
- `backend/internal/config/config.go` - Environment variables and settings

**Database:**
- `backend/migrations/` - Database schema migrations (6 files)
- `backend/internal/database/database.go` - Database connection

**Models:**
- `backend/internal/models/*.go` - Data structures for all tables

**Services (Business Logic):**
- `backend/internal/services/auth_service.go` - Authentication
- `backend/internal/services/claim_service.go` - Claim management
- `backend/internal/services/document_service.go` - File handling
- `backend/internal/services/magic_link_service.go` - Contractor auth
- `backend/internal/services/scope_sheet_service.go` - Scope sheet CRUD
- `backend/internal/services/carrier_estimate_service.go` - Estimate uploads
- `backend/internal/services/pdf_parser_service.go` - PDF text extraction + LLM structuring
- `backend/internal/services/audit_service.go` - **Core AI features** (860 lines)
- `backend/internal/services/email_service.go` - **⚠️ NEEDS REPLACEMENT**

**LLM Integration:**
- `backend/internal/llm/perplexity_client.go` - Perplexity API client with retry logic

**Handlers (HTTP Layer):**
- `backend/internal/handlers/*.go` - Request/response handling for all endpoints

**Middleware:**
- `backend/internal/middleware/auth.go` - JWT validation
- `backend/internal/middleware/cors.go` - CORS configuration

### Frontend (React + TypeScript)

**Entry Point:**
- `frontend/src/main.tsx` - React app initialization

**Routing:**
- `frontend/src/App.tsx` - Route definitions

**Pages:**
- `frontend/src/pages/Login.tsx` - Login page
- `frontend/src/pages/Dashboard.tsx` - Property manager dashboard
- `frontend/src/pages/Claims.tsx` - Claims list
- `frontend/src/pages/ClaimDetail.tsx` - Claim detail with **full audit UI**
- `frontend/src/pages/ContractorPortal.tsx` - Contractor upload interface

**Components:**
- `frontend/src/components/ScopeSheetForm.tsx` - **106-field form** (1,537 lines)
- `frontend/src/components/Navigation.tsx` - App navigation

**API Client:**
- `frontend/src/lib/api.ts` - Axios wrapper with auth token handling
- `frontend/src/lib/supabase.ts` - Supabase client initialization

**State Management:**
- React Context for authentication
- React Query for server state

---

## 🚀 Getting Started (Local Development)

### Prerequisites
```bash
# Required software
Go 1.21+
Node.js 18+
PostgreSQL 14+ (or use Supabase)
```

### 1. Clone and Setup

```bash
# Clone repository
git clone <repo-url>
cd ClaimCoachAI

# Backend setup
cd backend
go mod download

# Frontend setup
cd ../frontend
npm install
```

### 2. Environment Variables

**Backend (`backend/.env`):**
```bash
# Database
DATABASE_URL=postgres://user:pass@localhost:5432/claimcoach

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_JWT_SECRET=your-jwt-secret
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Perplexity API
PERPLEXITY_API_KEY=your-perplexity-key

# Email (CURRENTLY MOCK - NEEDS REPLACEMENT)
# SENDGRID_API_KEY=your-sendgrid-key
# FROM_EMAIL=noreply@claimcoach.ai
# FROM_NAME=ClaimCoach AI

# Server
PORT=8080
ENV=development
FRONTEND_URL=http://localhost:5173

# CORS
ALLOWED_ORIGINS=http://localhost:5173
```

**Frontend (`frontend/.env`):**
```bash
VITE_API_URL=http://localhost:8080
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### 3. Database Setup

```bash
# Install golang-migrate
go install -tags 'postgres' github.com/golang-migrate/migrate/v4/cmd/migrate@latest

# Run migrations
cd backend
migrate -path migrations -database $DATABASE_URL up

# Verify (should see 11 tables)
psql $DATABASE_URL -c "\dt"
```

### 4. Run Development Servers

```bash
# Terminal 1: Backend
cd backend
go run cmd/server/main.go

# Terminal 2: Frontend
cd frontend
npm run dev

# Access at http://localhost:5173
```

### 5. Test the System

**Create Test User:**
```bash
curl -X POST http://localhost:8080/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123",
    "full_name": "Test User",
    "organization_name": "Test Org"
  }'
```

**Login and Test Workflow:**
1. Login at http://localhost:5173
2. Create a property
3. Create a claim
4. Generate magic link (check console logs for link)
5. Access contractor portal via magic link
6. Upload photos and fill scope sheet
7. Upload carrier estimate PDF
8. Generate industry estimate (uses Perplexity API)
9. Compare estimates
10. Generate rebuttal

---

## ⚠️ Critical: What You Need to Complete

### PRIORITY 1: Email Service (1-2 hours)

**Current State:**
- Using `MockEmailService` in `backend/internal/services/email_service.go`
- Logs emails to console (not production-ready)

**Your Task:**
1. Sign up for SendGrid (free tier: 100 emails/day)
2. Get API key
3. Install SDK: `go get github.com/sendgrid/sendgrid-go`
4. Implement `SendGridEmailService` (example code is in comments at lines 183-219)
5. Update `main.go` to use real service
6. Test with real email

**Complete instructions in PRODUCTION_COMPLETION_CHECKLIST.md, item #1**

### PRIORITY 2: Production Deployment (2-3 hours)

1. Set up production environment variables
2. Run database migrations on production database
3. Deploy backend to Railway
4. Deploy frontend to Vercel
5. Configure DNS

**Complete instructions in PRODUCTION_COMPLETION_CHECKLIST.md, items #2-3**

---

## 📚 Documentation Reference

**Complete Documentation Available:**

1. **PRODUCTION_COMPLETION_CHECKLIST.md** - Step-by-step completion guide (THIS IS YOUR MAIN REFERENCE)
2. `docs/phase6/PHASE_6_COMPLETE_GUIDE.md` - Complete Phase 6 architecture (21KB)
3. `docs/phase6/API_REFERENCE_PHASE_6.md` - API documentation (17KB)
4. `docs/phase6/USER_GUIDE_PHASE_6.md` - User workflows (16KB)
5. `backend/README.md` - Backend setup
6. `frontend/README.md` - Frontend setup

---

## 🧪 Testing

**Backend Tests:**
```bash
cd backend
go test ./...
```

**Key Test Files:**
- `backend/internal/services/phase6_integration_test.go` - Complete Phase 6 workflow tests

**Frontend:**
```bash
cd frontend
npm run lint
npm run build  # Verify builds without errors
```

---

## 💰 Cost Estimates

**Development Costs (Using Free Tiers):**
- Supabase: Free tier (500MB database, 1GB storage, 50,000 auth users)
- Perplexity API: Pay-as-you-go (~$0.01 per claim)
- Railway: $5 free credit
- Vercel: Free tier
- SendGrid: 100 emails/day free

**Production Costs (Recommended Paid Plans):**
- Supabase Pro: $25/mo (backups, better support)
- Railway: ~$10-20/mo (backend hosting)
- SendGrid: $20/mo (40k emails) or stay on free tier
- Total: ~$60-90/mo for production-grade setup

---

## 🎯 Success Criteria

You're done when:

- [ ] Emails are sending via SendGrid (not logging to console)
- [ ] Backend is deployed and accessible via HTTPS
- [ ] Frontend is deployed and accessible via HTTPS
- [ ] Can complete full workflow:
  - [ ] Create claim → Generate magic link → Receive email
  - [ ] Contractor submits scope sheet and photos
  - [ ] Property manager generates industry estimate
  - [ ] Property manager uploads carrier estimate
  - [ ] System parses PDF and compares estimates
  - [ ] Property manager generates rebuttal
- [ ] All environment variables are set correctly
- [ ] Database migrations ran successfully
- [ ] CORS allows frontend to call backend
- [ ] Error tracking is working (optional but recommended)

---

## 🆘 Troubleshooting

**Common Issues:**

**1. Database connection fails**
- Check DATABASE_URL format
- Verify Supabase project is running
- Check IP whitelist in Supabase dashboard

**2. CORS errors**
- Verify ALLOWED_ORIGINS matches frontend URL
- Check FRONTEND_URL environment variable
- Clear browser cache

**3. JWT validation fails**
- Verify SUPABASE_JWT_SECRET matches Supabase project
- Check token expiration
- Ensure Authorization header format: "Bearer <token>"

**4. File uploads fail**
- Check SUPABASE_SERVICE_ROLE_KEY is set
- Verify storage bucket exists and has correct permissions
- Check file size limits

**5. Perplexity API errors**
- Verify PERPLEXITY_API_KEY is valid
- Check API quota/usage
- Review logs for specific error messages

**6. Email not sending (after implementing SendGrid)**
- Verify SENDGRID_API_KEY is valid
- Check sender email is verified in SendGrid dashboard
- Review SendGrid logs for delivery issues

---

## 📞 Support

**If you get stuck:**

1. Check `PRODUCTION_COMPLETION_CHECKLIST.md` for detailed steps
2. Review relevant documentation in `docs/phase6/`
3. Check console logs for error messages
4. Verify environment variables are set correctly
5. Test individual components (database connection, API endpoints, etc.)

**Key Commands:**

```bash
# Check database connection
psql $DATABASE_URL -c "SELECT 1"

# View backend logs
go run cmd/server/main.go

# Test API endpoint
curl http://localhost:8080/health

# Check migrations status
migrate -path migrations -database $DATABASE_URL version

# Build frontend
cd frontend && npm run build
```

---

## 📊 Project Stats

- **48 Backend Go Files** (~8,000 lines)
- **22 Frontend TypeScript/TSX Files** (~3,700 lines)
- **11 Database Tables**
- **25+ API Endpoints**
- **6 Database Migrations**
- **106-Field Scope Sheet Form**
- **4-Tab Contractor Interface**
- **Comprehensive Test Coverage**

---

## ✅ Final Checklist

**Before marking complete:**

- [ ] Email service replaced and tested
- [ ] Production environment configured
- [ ] Database migrations ran successfully
- [ ] Backend deployed and accessible
- [ ] Frontend deployed and accessible
- [ ] DNS configured (if using custom domain)
- [ ] End-to-end workflow tested in production
- [ ] Error tracking configured (recommended)
- [ ] Monitoring/health checks set up (recommended)
- [ ] Backup strategy implemented (recommended)

---

## 🎉 You're Almost There!

The heavy lifting is done. You're just connecting the dots:

1. **Swap mock email for real email** (1-2 hours)
2. **Deploy to Railway + Vercel** (1 hour)
3. **Test in production** (30 min)

Total: 3-4 hours to production.

Good luck! 🚀
