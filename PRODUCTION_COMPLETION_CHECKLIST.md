# Production Completion Checklist

**Status:** Phase 6 complete and merged to main. System is 95% production-ready.

**Last Updated:** 2026-02-06

---

## Critical (Must Complete Before Launch)

### 1. Email Service Implementation ⚠️ CRITICAL
**Status:** ❌ Not Started
**Effort:** 1-2 hours
**Priority:** CRITICAL

**Current State:**
- Using `MockEmailService` that only logs to console
- File: `backend/internal/services/email_service.go`

**What Needs to be Done:**
1. Choose email provider (SendGrid recommended, see alternatives below)
2. Get API key from provider
3. Install SDK (e.g., `go get github.com/sendgrid/sendgrid-go`)
4. Implement `SendGridEmailService` struct (example code already in comments)
5. Update `main.go` to use real service instead of mock
6. Add `SENDGRID_API_KEY` to environment variables
7. Test with real email sending

**SendGrid Setup Steps:**
```bash
# 1. Sign up at sendgrid.com (free tier: 100 emails/day)
# 2. Create API key with "Mail Send" permission
# 3. Verify sender email address
# 4. Install Go SDK
go get github.com/sendgrid/sendgrid-go

# 5. Add to .env
echo 'SENDGRID_API_KEY=your_api_key_here' >> .env
echo 'FROM_EMAIL=noreply@claimcoach.ai' >> .env
echo 'FROM_NAME=ClaimCoach AI' >> .env
```

**Implementation (replace MockEmailService):**
```go
// backend/internal/services/email_service.go
// See lines 183-219 for complete SendGrid example

type SendGridEmailService struct {
    apiKey    string
    fromEmail string
    fromName  string
}

func NewSendGridEmailService(apiKey, fromEmail, fromName string) *SendGridEmailService {
    return &SendGridEmailService{
        apiKey:    apiKey,
        fromEmail: fromEmail,
        fromName:  fromName,
    }
}

func (s *SendGridEmailService) SendMagicLinkEmail(input SendMagicLinkEmailInput) error {
    from := mail.NewEmail(s.fromName, s.fromEmail)
    to := mail.NewEmail(input.ContractorName, input.To)
    subject := fmt.Sprintf("Upload Request - %s Claim", input.LossType)
    plainText := plainTextEmailTemplate(input)
    htmlContent := htmlEmailTemplate(input)

    message := mail.NewSingleEmail(from, subject, to, plainText, htmlContent)
    client := sendgrid.NewSendClient(s.apiKey)

    response, err := client.Send(message)
    if err != nil {
        return fmt.Errorf("failed to send email: %w", err)
    }

    if response.StatusCode >= 400 {
        return fmt.Errorf("email service error: %d", response.StatusCode)
    }

    return nil
}
```

**Update main.go:**
```go
// backend/cmd/server/main.go
// Replace:
emailService := services.NewMockEmailService()

// With:
emailService := services.NewSendGridEmailService(
    cfg.SendGridAPIKey,
    cfg.FromEmail,
    cfg.FromName,
)
```

**Alternative Providers:**
- **AWS SES:** Cost-effective for high volume ($0.10 per 1,000 emails)
  - See lines 221-255 in `email_service.go` for implementation example
- **Supabase SMTP:** Requires dashboard configuration, more setup
- **Mailgun:** Similar to SendGrid, good API

**Testing:**
```bash
# Test email sending
curl -X POST http://localhost:8080/api/magic-links \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "property_id": "...",
    "contractor_email": "test@example.com",
    "contractor_name": "Test Contractor"
  }'

# Check email received at test@example.com
```

---

### 2. Production Environment Configuration
**Status:** ❌ Not Started
**Effort:** 1 hour
**Priority:** CRITICAL

**What Needs to be Done:**

**A. Set Up Production Database (Supabase)**
1. Go to supabase.com project dashboard
2. Navigate to Settings → Database
3. Copy connection string
4. Run migrations:
```bash
export DATABASE_URL="postgres://..."
migrate -path backend/migrations -database $DATABASE_URL up
```

**B. Configure Environment Variables**

Create production `.env` file with:
```bash
# Database
DATABASE_URL=postgres://user:pass@host:5432/dbname

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_JWT_SECRET=your-jwt-secret
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Perplexity API
PERPLEXITY_API_KEY=your-perplexity-key

# Email Service
SENDGRID_API_KEY=your-sendgrid-key
FROM_EMAIL=noreply@claimcoach.ai
FROM_NAME=ClaimCoach AI

# Server
PORT=8080
ENV=production
FRONTEND_URL=https://your-frontend.vercel.app

# CORS
ALLOWED_ORIGINS=https://your-frontend.vercel.app
```

**C. Update CORS Settings**
```go
// backend/cmd/server/main.go
// Update AllowOrigins to production domain
config := cors.DefaultConfig()
config.AllowOrigins = []string{os.Getenv("FRONTEND_URL")}
```

---

### 3. Deployment Configuration
**Status:** ❌ Not Started
**Effort:** 2-3 hours
**Priority:** CRITICAL

**Backend Deployment (Railway Recommended)**

**Option A: Railway (Easiest)**
1. Sign up at railway.app
2. Create new project → Deploy from GitHub
3. Select repository
4. Add environment variables (use production .env)
5. Railway auto-detects Go and runs `go build`
6. Domain: `your-app.up.railway.app`

**Railway Config:**
```toml
# railway.toml (optional, for customization)
[build]
builder = "nixpacks"
buildCommand = "go build -o server ./backend/cmd/server"

[deploy]
startCommand = "./server"
restartPolicyType = "on-failure"
restartPolicyMaxRetries = 10
```

**Option B: Render**
1. Sign up at render.com
2. New Web Service → Connect repository
3. Build command: `go build -o server ./backend/cmd/server`
4. Start command: `./server`
5. Add environment variables
6. Free tier available

**Frontend Deployment (Vercel Recommended)**
1. Sign up at vercel.com
2. Import Git repository
3. Framework preset: Vite
4. Root directory: `frontend`
5. Build command: `npm run build`
6. Output directory: `dist`
7. Environment variables:
```
VITE_API_URL=https://your-backend.railway.app
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

**DNS Configuration:**
- Point custom domain to Vercel (A/CNAME records)
- Update `ALLOWED_ORIGINS` in backend to match

---

## Strongly Recommended

### 4. Error Tracking (Sentry)
**Status:** ❌ Not Started
**Effort:** 30 minutes
**Priority:** STRONGLY RECOMMENDED

**Setup:**
```bash
# 1. Sign up at sentry.io (free tier: 5,000 events/month)
# 2. Create new Go project
# 3. Install SDK
go get github.com/getsentry/sentry-go

# 4. Add to main.go
import "github.com/getsentry/sentry-go"

err := sentry.Init(sentry.ClientOptions{
    Dsn: os.Getenv("SENTRY_DSN"),
    Environment: os.Getenv("ENV"),
})
if err != nil {
    log.Fatalf("Sentry init failed: %v", err)
}
defer sentry.Flush(2 * time.Second)

# 5. Add error reporting to handlers
sentry.CaptureException(err)
```

---

### 5. Health Check & Monitoring
**Status:** ❌ Not Started
**Effort:** 1-2 hours
**Priority:** STRONGLY RECOMMENDED

**A. Health Check Endpoint**
```go
// backend/cmd/server/main.go
r.GET("/health", func(c *gin.Context) {
    // Check database connection
    err := db.Ping()
    if err != nil {
        c.JSON(500, gin.H{"status": "unhealthy", "database": "down"})
        return
    }

    c.JSON(200, gin.H{
        "status": "healthy",
        "database": "up",
        "version": "1.0.0",
    })
})
```

**B. Uptime Monitoring**
- Sign up for uptime robot (free)
- Monitor `/health` endpoint every 5 minutes
- Alert via email if down

**C. Application Logging**
```go
// Add structured logging with zerolog
import "github.com/rs/zerolog/log"

log.Info().
    Str("claim_id", claimID).
    Str("user_id", userID).
    Msg("Generated industry estimate")

log.Error().
    Err(err).
    Str("claim_id", claimID).
    Msg("Failed to generate estimate")
```

---

### 6. Database Backups
**Status:** ❌ Not Started
**Effort:** 1 hour
**Priority:** STRONGLY RECOMMENDED

**Supabase Backups (Automatic on Paid Plan)**
- Free tier: Manual backups only
- Pro plan ($25/mo): Daily automatic backups

**Manual Backup Script:**
```bash
#!/bin/bash
# scripts/backup-database.sh

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="backup_${DATE}.sql"

pg_dump $DATABASE_URL > $BACKUP_FILE
gzip $BACKUP_FILE

# Upload to S3 or keep locally
echo "Backup saved: ${BACKUP_FILE}.gz"
```

**Schedule with cron:**
```bash
# Run daily at 2 AM
0 2 * * * /path/to/backup-database.sh
```

---

## Nice to Have (Post-Launch)

### 7. Analytics & Monitoring
**Status:** ❌ Not Started
**Effort:** 2-3 hours
**Priority:** NICE TO HAVE

- Plausible Analytics (privacy-friendly, GDPR compliant)
- Track key metrics: claims created, estimates generated, conversion rates

### 8. CI/CD Pipeline
**Status:** ❌ Not Started
**Effort:** 3-4 hours
**Priority:** NICE TO HAVE

**GitHub Actions Workflow:**
```yaml
# .github/workflows/deploy.yml
name: Deploy
on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-go@v4
        with:
          go-version: '1.21'
      - run: cd backend && go test ./...

  deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to Railway
        run: railway up
```

### 9. Rate Limiting
**Status:** ❌ Not Started
**Effort:** 1 hour
**Priority:** NICE TO HAVE

- Add rate limiting middleware to prevent abuse
- Limit LLM endpoints (expensive operations)

### 10. Advanced Security
**Status:** ❌ Not Started
**Effort:** 2-3 hours
**Priority:** NICE TO HAVE

- Implement CSRF protection
- Add request signing for webhook endpoints
- Security headers (helmet middleware)

---

## Quick Start Checklist

For immediate production launch, complete these in order:

- [ ] **1. Email Service** - Replace mock with SendGrid (1-2 hours)
- [ ] **2. Environment Config** - Set up production .env (30 min)
- [ ] **3. Database Setup** - Run migrations on production database (15 min)
- [ ] **4. Backend Deployment** - Deploy to Railway (30 min)
- [ ] **5. Frontend Deployment** - Deploy to Vercel (15 min)
- [ ] **6. DNS Configuration** - Point domain to Vercel (15 min)
- [ ] **7. Error Tracking** - Add Sentry (30 min)
- [ ] **8. Health Checks** - Add monitoring (1 hour)
- [ ] **9. Backup Strategy** - Set up database backups (1 hour)

**Total Time Estimate:** 6-8 hours for production-ready launch

---

## Testing Checklist

Before launching:

- [ ] Test magic link email sending with real email
- [ ] Test contractor flow end-to-end (receive email → submit scope sheet → upload photos)
- [ ] Test property manager flow (create claim → generate estimate → compare → generate rebuttal)
- [ ] Test deductible comparison feature
- [ ] Test document upload/download
- [ ] Verify CORS works with production domains
- [ ] Test authentication (JWT validation)
- [ ] Check all environment variables are set correctly
- [ ] Verify database migrations ran successfully
- [ ] Test error handling (what happens when API keys are invalid?)

---

## Cost Estimates

**Monthly Operating Costs (Estimated):**

| Service | Free Tier | Paid | Notes |
|---------|-----------|------|-------|
| Railway | $5 credit | ~$10-20/mo | Backend hosting |
| Vercel | Free | Free | Frontend hosting |
| Supabase | Free | $25/mo (Pro) | Database + Auth + Storage |
| SendGrid | 100 emails/day | $20/mo (40k emails) | Email sending |
| Perplexity | Pay-as-you-go | ~$0.01/claim | LLM API |
| Sentry | 5k events/mo | $26/mo (50k events) | Error tracking |

**Total:** ~$0-15/mo on free tiers, ~$60-90/mo on paid plans

---

## Support & Documentation

**Key Documentation Files:**
- `docs/phase6/PHASE_6_COMPLETE_GUIDE.md` - Complete system architecture
- `docs/phase6/API_REFERENCE_PHASE_6.md` - API documentation
- `docs/phase6/USER_GUIDE_PHASE_6.md` - User workflows
- `backend/README.md` - Backend setup instructions
- `frontend/README.md` - Frontend setup instructions

**Contact:**
- For issues: Create GitHub issue
- For questions: Check documentation first

---

## Notes

- Email service is the ONLY critical blocker for production
- Everything else is infrastructure/deployment setup
- System is fully functional in development mode
- 48 backend files, 22 frontend files, ~11,700 lines of code
- 25+ API endpoints, 11 database tables
- Comprehensive test coverage included
