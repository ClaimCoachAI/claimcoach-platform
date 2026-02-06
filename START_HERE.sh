#!/bin/bash

# ClaimCoachAI - Dev Partner Onboarding Script
# Run this first: bash START_HERE.sh

# Colors for better readability
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

clear

echo -e "${CYAN}${BOLD}"
cat << "EOF"
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║        🚀 CLAIMCOACH AI - DEV PARTNER ONBOARDING 🚀          ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
EOF
echo -e "${NC}"

echo -e "${BOLD}Welcome to ClaimCoachAI!${NC}\n"
echo -e "This project is ${GREEN}95% complete${NC} and ready for production deployment."
echo -e "Your mission: Complete the final 5% to launch! 🎯\n"

# What's Complete
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}${BOLD}✅ WHAT'S ALREADY COMPLETE${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}\n"

cat << EOF
📦 Phase 1: Foundation & Authentication
   ✓ User registration/login with Supabase Auth
   ✓ JWT-based authentication
   ✓ Role-based access control
   ✓ Organization management

📦 Phase 2: Property & Claim Management
   ✓ Property CRUD operations
   ✓ Claim creation and management
   ✓ Document upload/download (Supabase Storage)

📦 Phase 3: Magic Links for Contractors
   ✓ Token-based authentication (72-hour expiration)
   ✓ Email notification system (currently mock)
   ✓ Public endpoints for contractor access

📦 Phase 4: Contractor Portal
   ✓ Photo upload interface (drag & drop)
   ✓ Scope sheet form (106+ fields, 4-tab interface)
   ✓ Magic link validation

📦 Phase 5: Deductible Comparison
   ✓ Track contractor vs carrier estimates
   ✓ Comparison display in UI

📦 Phase 6: AI Audit System ⭐ JUST COMPLETED
   ✓ Industry estimate generation (Perplexity API)
   ✓ PDF parsing with LLM structuring
   ✓ Automated estimate comparison
   ✓ Professional rebuttal letter generation
   ✓ API usage tracking

📊 Project Stats:
   • 48 Backend Go files (~8,000 lines)
   • 22 Frontend TypeScript/React files (~3,700 lines)
   • 11 Database tables
   • 25+ API endpoints
   • Comprehensive test coverage

EOF

# What's Left
echo -e "\n${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}${BOLD}⚠️  WHAT'S LEFT TO COMPLETE${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}\n"

cat << EOF
${BOLD}CRITICAL (Must complete before launch):${NC}

${RED}1. Email Service Implementation${NC} ⚠️ HIGHEST PRIORITY
   • Current: MockEmailService (logs to console only)
   • Needed: Real SendGrid integration
   • Time: 1-2 hours
   • File: backend/internal/services/email_service.go

   What to do:
   - Sign up for SendGrid (free tier: 100 emails/day)
   - Get API key
   - Replace MockEmailService with SendGridEmailService
   - Code examples already provided in comments (lines 183-219)

${YELLOW}2. Production Environment Setup${NC}
   • Set up production database (Supabase)
   • Configure environment variables
   • Run database migrations
   • Time: 1 hour

${YELLOW}3. Deploy Backend & Frontend${NC}
   • Backend: Deploy to Railway (recommended)
   • Frontend: Deploy to Vercel (recommended)
   • Configure DNS/CORS
   • Time: 1-2 hours

${GREEN}RECOMMENDED (Strongly suggested):${NC}
   • Error tracking (Sentry) - 30 min
   • Health checks & monitoring - 1 hour
   • Database backups strategy - 1 hour

${BOLD}Total Time to Production: 3-4 hours${NC}

EOF

# Tech Stack
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}${BOLD}🛠️  TECH STACK${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}\n"

cat << EOF
Backend:  Go 1.21+ with Gin framework
Frontend: React 18 + TypeScript + Vite + Tailwind CSS
Database: PostgreSQL (Supabase)
Auth:     Supabase Auth (JWT)
Storage:  Supabase Storage
LLM:      Perplexity API (sonar-pro model)

Infrastructure (to be set up):
  • Railway (backend hosting)
  • Vercel (frontend hosting)
  • SendGrid (email delivery)

EOF

# Quick Start
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}${BOLD}🚀 QUICK START - WHAT TO DO RIGHT NOW${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}\n"

cat << EOF
${BOLD}Step 1: Read the Documentation${NC}

   📄 ${YELLOW}PRODUCTION_COMPLETION_CHECKLIST.md${NC} (Your main reference)
      Complete step-by-step guide with code examples

   📄 ${YELLOW}DEV_PARTNER_HANDOFF.md${NC} (Full context)
      System architecture, API endpoints, troubleshooting

${BOLD}Step 2: Set Up Local Development${NC}

   ${CYAN}# Backend setup${NC}
   cd backend
   go mod download

   ${CYAN}# Create .env file (copy from DEV_PARTNER_HANDOFF.md)${NC}
   cp .env.example .env
   # Edit .env with your credentials

   ${CYAN}# Run migrations${NC}
   migrate -path migrations -database \$DATABASE_URL up

   ${CYAN}# Start backend${NC}
   go run cmd/server/main.go

   ${CYAN}# Frontend setup (new terminal)${NC}
   cd frontend
   npm install

   ${CYAN}# Create .env file${NC}
   cp .env.example .env
   # Edit .env with your credentials

   ${CYAN}# Start frontend${NC}
   npm run dev

   ${CYAN}# Access at http://localhost:5173${NC}

${BOLD}Step 3: Complete Priority #1 (Email Service)${NC}

   Open ${YELLOW}PRODUCTION_COMPLETION_CHECKLIST.md${NC}
   Follow instructions in "1. Email Service Implementation"

   ${CYAN}# Install SendGrid SDK${NC}
   cd backend
   go get github.com/sendgrid/sendgrid-go

   ${CYAN}# Update email_service.go${NC}
   # (Complete code examples provided in the file)

${BOLD}Step 4: Deploy to Production${NC}

   Follow instructions in ${YELLOW}PRODUCTION_COMPLETION_CHECKLIST.md${NC}
   Sections 2-3: Environment Setup + Deployment

EOF

# Environment Variables Needed
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}${BOLD}🔐 ENVIRONMENT VARIABLES YOU'LL NEED${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}\n"

cat << EOF
${YELLOW}Backend (.env):${NC}
  DATABASE_URL              (Supabase connection string)
  SUPABASE_URL             (Supabase project URL)
  SUPABASE_JWT_SECRET      (Supabase JWT secret)
  SUPABASE_SERVICE_ROLE_KEY (Supabase service role key)
  PERPLEXITY_API_KEY       (Perplexity API key)
  SENDGRID_API_KEY         (SendGrid API key - TO BE OBTAINED)
  FROM_EMAIL               (Sender email address)
  FROM_NAME                (Sender name)
  PORT                     (8080)
  ENV                      (development/production)
  FRONTEND_URL             (Frontend URL)
  ALLOWED_ORIGINS          (CORS allowed origins)

${YELLOW}Frontend (.env):${NC}
  VITE_API_URL             (Backend API URL)
  VITE_SUPABASE_URL        (Supabase project URL)
  VITE_SUPABASE_ANON_KEY   (Supabase anon key)

${BOLD}📋 See complete .env templates in DEV_PARTNER_HANDOFF.md${NC}

EOF

# Cost Estimates
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}${BOLD}💰 COST ESTIMATES${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}\n"

cat << EOF
${BOLD}Development (Free Tiers):${NC}
  Supabase:    Free (500MB database, 1GB storage)
  Railway:     \$5 free credit
  Vercel:      Free
  SendGrid:    Free (100 emails/day)
  Perplexity:  Pay-as-you-go (~\$0.01 per claim)

  ${GREEN}Total: ~\$0/month${NC}

${BOLD}Production (Recommended):${NC}
  Supabase Pro:  \$25/mo (backups, better support)
  Railway:       \$10-20/mo (backend hosting)
  SendGrid:      \$20/mo (40k emails) or free tier
  Perplexity:    ~\$0.01 per claim

  ${YELLOW}Total: ~\$60-90/month${NC}

EOF

# Documentation Links
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}${BOLD}📚 DOCUMENTATION AVAILABLE${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}\n"

cat << EOF
📄 PRODUCTION_COMPLETION_CHECKLIST.md
   → Your main reference with complete step-by-step instructions

📄 DEV_PARTNER_HANDOFF.md
   → Full system architecture and handoff documentation

📄 docs/phase6/PHASE_6_COMPLETE_GUIDE.md (21KB)
   → Complete Phase 6 architecture and API guide

📄 docs/phase6/API_REFERENCE_PHASE_6.md (17KB)
   → API endpoint documentation with examples

📄 docs/phase6/USER_GUIDE_PHASE_6.md (16KB)
   → User workflow guides

📄 backend/README.md
   → Backend setup instructions

📄 frontend/README.md
   → Frontend setup instructions

EOF

# Success Criteria
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}${BOLD}✅ SUCCESS CRITERIA - YOU'RE DONE WHEN:${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}\n"

cat << EOF
☐ Emails are sending via SendGrid (not console logs)
☐ Backend is deployed and accessible via HTTPS
☐ Frontend is deployed and accessible via HTTPS
☐ Full workflow works in production:
  ☐ Create claim → Generate magic link → Email sent
  ☐ Contractor submits scope sheet and photos
  ☐ Property manager generates industry estimate
  ☐ Property manager uploads carrier estimate PDF
  ☐ System parses PDF and compares estimates
  ☐ Property manager generates rebuttal
☐ All environment variables configured
☐ Database migrations completed
☐ CORS configured correctly
☐ Error tracking working (recommended)

EOF

# Troubleshooting
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}${BOLD}🆘 IF YOU GET STUCK${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}\n"

cat << EOF
1. Check ${YELLOW}PRODUCTION_COMPLETION_CHECKLIST.md${NC} for detailed steps
2. Review ${YELLOW}DEV_PARTNER_HANDOFF.md${NC} troubleshooting section
3. Check console logs for error messages
4. Verify environment variables are set correctly
5. Test individual components (database, API, etc.)

${BOLD}Useful Commands:${NC}
  ${CYAN}# Check database connection${NC}
  psql \$DATABASE_URL -c "SELECT 1"

  ${CYAN}# Run backend${NC}
  cd backend && go run cmd/server/main.go

  ${CYAN}# Run frontend${NC}
  cd frontend && npm run dev

  ${CYAN}# Run tests${NC}
  cd backend && go test ./...

  ${CYAN}# Check migration status${NC}
  migrate -path migrations -database \$DATABASE_URL version

EOF

# Repository Info
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}${BOLD}📦 REPOSITORY INFO${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}\n"

cat << EOF
Repository: https://github.com/ClaimCoachAI/claimcoach-platform
Branch:     main
Commits:    53 (all phases complete)
Status:     95% production-ready

${GREEN}${BOLD}Clone command:${NC}
git clone https://github.com/ClaimCoachAI/claimcoach-platform.git
cd claimcoach-platform

EOF

# Final Message
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}${BOLD}🎉 YOU'VE GOT THIS!${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}\n"

cat << EOF
The heavy lifting is done. You're just connecting the dots:

${BOLD}Priority 1:${NC} Swap mock email for SendGrid (1-2 hours)
${BOLD}Priority 2:${NC} Deploy to Railway + Vercel (1 hour)
${BOLD}Priority 3:${NC} Test in production (30 min)

${GREEN}${BOLD}Total: 3-4 hours to production launch! 🚀${NC}

${BOLD}Next Steps:${NC}
1. Read PRODUCTION_COMPLETION_CHECKLIST.md
2. Set up local development environment
3. Start with Priority #1: Email Service

${YELLOW}Questions? Check DEV_PARTNER_HANDOFF.md or documentation in docs/phase6/${NC}

Good luck! 🎯

EOF

echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}\n"

# Ask if they want to open documentation
echo -e "${BOLD}Would you like to open the main documentation now?${NC}"
echo -e "  1) Open PRODUCTION_COMPLETION_CHECKLIST.md"
echo -e "  2) Open DEV_PARTNER_HANDOFF.md"
echo -e "  3) Open both"
echo -e "  4) I'll read them later\n"

read -p "Enter your choice (1-4): " choice

case $choice in
    1)
        if command -v code &> /dev/null; then
            code PRODUCTION_COMPLETION_CHECKLIST.md
        else
            cat PRODUCTION_COMPLETION_CHECKLIST.md
        fi
        ;;
    2)
        if command -v code &> /dev/null; then
            code DEV_PARTNER_HANDOFF.md
        else
            cat DEV_PARTNER_HANDOFF.md
        fi
        ;;
    3)
        if command -v code &> /dev/null; then
            code PRODUCTION_COMPLETION_CHECKLIST.md DEV_PARTNER_HANDOFF.md
        else
            echo -e "\n${GREEN}Opening PRODUCTION_COMPLETION_CHECKLIST.md:${NC}\n"
            cat PRODUCTION_COMPLETION_CHECKLIST.md
            echo -e "\n${GREEN}Opening DEV_PARTNER_HANDOFF.md:${NC}\n"
            cat DEV_PARTNER_HANDOFF.md
        fi
        ;;
    4)
        echo -e "\n${GREEN}Great! Start by reading PRODUCTION_COMPLETION_CHECKLIST.md when ready.${NC}\n"
        ;;
    *)
        echo -e "\n${RED}Invalid choice. Start by reading PRODUCTION_COMPLETION_CHECKLIST.md${NC}\n"
        ;;
esac

echo -e "${GREEN}${BOLD}Happy coding! 🚀${NC}\n"
