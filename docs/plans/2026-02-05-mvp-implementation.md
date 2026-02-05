# ClaimCoach AI MVP Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a complete property insurance claim management system that enables property managers to act as public adjusters through a 7-phase workflow from property onboarding to claim closure.

**Architecture:** React/Vite frontend communicating with a Go REST API backend. PostgreSQL for data persistence, Supabase for authentication and file storage. LLM-powered AI audit compares carrier estimates against industry pricing using web-grounded search.

**Tech Stack:**
- Frontend: React 18 + Vite + TypeScript + Tailwind CSS + TanStack Query
- Backend: Go 1.21+ + PostgreSQL + golang-migrate
- Auth/Storage: Supabase (JWT auth, file storage, email)
- LLM: Perplexity API (web-grounded pricing)
- Deployment: Vercel (frontend) + Railway (backend)

---

## Implementation Phases

### Phase 0: Project Foundation
- Backend scaffolding (Go + PostgreSQL)
- Frontend scaffolding (React + Vite)
- Database migrations
- Environment configuration

### Phase 1: Authentication & User Management
- Supabase auth integration
- Organization & user models
- Auth middleware
- Login/signup flows

### Phase 2: Property & Policy Management
- Property CRUD operations
- Insurance policy entry
- Property dashboard UI

### Phase 3: Claims Management Core
- Claim creation & status management
- Claim workspace UI
- Document uploads
- Activity logging

### Phase 4: Magic Link System
- Token generation & validation
- Contractor portal (mobile-first)
- Email notifications
- File uploads via magic link

### Phase 5: Deductible Comparison
- Estimate upload & parsing
- Deductible comparison logic
- Decision gate UI

### Phase 6: AI Audit System
- LLM integration (Perplexity API)
- Industry estimate generation
- Carrier estimate parsing
- Delta report generation & UI

### Phase 7: Field Logistics & Payments
- Adjuster scheduling
- Payment tracking
- Claim closure

---

## Phase 0: Project Foundation

### Task 0.1: Initialize Backend Structure

**Files:**
- Create: `backend/cmd/server/main.go`
- Create: `backend/internal/api/router.go`
- Create: `backend/internal/config/config.go`
- Create: `backend/go.mod`
- Create: `backend/.env.example`
- Create: `backend/Dockerfile`

**Step 1: Initialize Go module**

```bash
cd backend
go mod init github.com/claimcoach/backend
```

**Step 2: Create main.go entry point**

```go
// backend/cmd/server/main.go
package main

import (
	"log"
	"os"

	"github.com/claimcoach/backend/internal/api"
	"github.com/claimcoach/backend/internal/config"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	router := api.NewRouter(cfg)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("Server starting on port %s", port)
	if err := router.Run(":" + port); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
```

**Step 3: Create config loader**

```go
// backend/internal/config/config.go
package config

import (
	"fmt"
	"os"
)

type Config struct {
	DatabaseURL        string
	SupabaseURL        string
	SupabaseServiceKey string
	SupabaseJWTSecret  string
	PerplexityAPIKey   string
	AllowedOrigins     string
	Port               string
}

func Load() (*Config, error) {
	cfg := &Config{
		DatabaseURL:        os.Getenv("DATABASE_URL"),
		SupabaseURL:        os.Getenv("SUPABASE_URL"),
		SupabaseServiceKey: os.Getenv("SUPABASE_SERVICE_KEY"),
		SupabaseJWTSecret:  os.Getenv("SUPABASE_JWT_SECRET"),
		PerplexityAPIKey:   os.Getenv("PERPLEXITY_API_KEY"),
		AllowedOrigins:     os.Getenv("ALLOWED_ORIGINS"),
		Port:               os.Getenv("PORT"),
	}

	if cfg.DatabaseURL == "" {
		return nil, fmt.Errorf("DATABASE_URL is required")
	}

	return cfg, nil
}
```

**Step 4: Create basic router**

```go
// backend/internal/api/router.go
package api

import (
	"net/http"

	"github.com/claimcoach/backend/internal/config"
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

func NewRouter(cfg *config.Config) *gin.Engine {
	r := gin.Default()

	// CORS
	r.Use(cors.New(cors.Config{
		AllowOrigins:     []string{cfg.AllowedOrigins},
		AllowMethods:     []string{"GET", "POST", "PATCH", "DELETE"},
		AllowHeaders:     []string{"Authorization", "Content-Type"},
		AllowCredentials: true,
	}))

	// Health check
	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	return r
}
```

**Step 5: Create .env.example**

```bash
# backend/.env.example
DATABASE_URL=postgresql://user:password@localhost:5432/claimcoach?sslmode=disable
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=your-service-key
SUPABASE_JWT_SECRET=your-jwt-secret
PERPLEXITY_API_KEY=your-api-key
ALLOWED_ORIGINS=http://localhost:5173
PORT=8080
```

**Step 6: Create Dockerfile**

```dockerfile
# backend/Dockerfile
FROM golang:1.21-alpine AS builder

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /server cmd/server/main.go

FROM alpine:latest
RUN apk --no-cache add ca-certificates
WORKDIR /root/
COPY --from=builder /server ./
COPY migrations ./migrations

EXPOSE 8080
CMD ["./server"]
```

**Step 7: Install dependencies**

```bash
cd backend
go get github.com/gin-gonic/gin
go get github.com/gin-contrib/cors
go get github.com/lib/pq
go mod tidy
```

**Step 8: Test server starts**

```bash
cd backend
DATABASE_URL="postgresql://localhost/test" go run cmd/server/main.go
# Expected: Server starts, health check available at localhost:8080/health
```

**Step 9: Commit**

```bash
git add backend/
git commit -m "feat: initialize Go backend with basic server structure

- Add main.go entry point
- Configure Gin router with CORS
- Add config loader for environment variables
- Create Dockerfile for containerization
- Add health check endpoint

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### Task 0.2: Setup Database Migrations

**Files:**
- Create: `backend/migrations/000001_initial_schema.up.sql`
- Create: `backend/migrations/000001_initial_schema.down.sql`
- Create: `backend/internal/database/db.go`
- Create: `backend/internal/database/migrate.go`

**Step 1: Install golang-migrate**

```bash
cd backend
go get -tags 'postgres' github.com/golang-migrate/migrate/v4
go get github.com/golang-migrate/migrate/v4/database/postgres
go get github.com/golang-migrate/migrate/v4/source/file
```

**Step 2: Create initial schema migration (up)**

```sql
-- backend/migrations/000001_initial_schema.up.sql

-- Organizations (multi-tenancy root)
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Users
CREATE TABLE users (
    id UUID PRIMARY KEY, -- Supabase auth user ID
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'member')),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_organization ON users(organization_id);

-- Mortgage Banks
CREATE TABLE mortgage_banks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    endorsement_required BOOLEAN NOT NULL DEFAULT true,
    instruction_letter_template TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Properties
CREATE TABLE properties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    nickname TEXT NOT NULL,
    legal_address TEXT NOT NULL,
    lat DECIMAL(10, 8),
    lng DECIMAL(11, 8),
    owner_entity_name TEXT NOT NULL,
    mortgage_bank_id UUID REFERENCES mortgage_banks(id),
    status TEXT NOT NULL CHECK (status IN ('draft', 'active_monitored', 'archived')) DEFAULT 'draft',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_properties_organization ON properties(organization_id);

-- Insurance Policies
CREATE TABLE insurance_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    carrier_name TEXT NOT NULL,
    policy_number TEXT,
    coverage_a_limit DECIMAL(12, 2),
    coverage_b_limit DECIMAL(12, 2),
    coverage_d_limit DECIMAL(12, 2),
    deductible_type TEXT NOT NULL CHECK (deductible_type IN ('percentage', 'fixed')),
    deductible_value DECIMAL(12, 2) NOT NULL,
    deductible_calculated DECIMAL(12, 2) NOT NULL,
    policy_pdf_url TEXT,
    effective_date DATE,
    expiration_date DATE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(property_id)
);

-- Claims
CREATE TABLE claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    policy_id UUID NOT NULL REFERENCES insurance_policies(id),
    claim_number TEXT,
    loss_type TEXT NOT NULL CHECK (loss_type IN ('fire', 'water', 'wind', 'hail', 'other')),
    incident_date TIMESTAMP NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('draft', 'assessing', 'filed', 'field_scheduled', 'audit_pending', 'negotiating', 'settled', 'closed')) DEFAULT 'draft',
    filed_at TIMESTAMP,
    assigned_user_id UUID REFERENCES users(id),
    adjuster_name TEXT,
    adjuster_phone TEXT,
    meeting_datetime TIMESTAMP,
    created_by_user_id UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_claims_property_status ON claims(property_id, status);

-- Documents
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
    uploaded_by_user_id UUID REFERENCES users(id),
    document_type TEXT NOT NULL CHECK (document_type IN ('policy_pdf', 'contractor_photo', 'contractor_estimate', 'carrier_estimate', 'proof_of_repair', 'other')),
    file_url TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_size_bytes INTEGER NOT NULL,
    mime_type TEXT NOT NULL,
    metadata JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_documents_claim ON documents(claim_id);

-- Estimates
CREATE TABLE estimates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
    estimate_type TEXT NOT NULL CHECK (estimate_type IN ('contractor_initial', 'industry_standard', 'carrier_acv', 'rebuttal')),
    source_name TEXT NOT NULL,
    total_amount DECIMAL(12, 2) NOT NULL,
    line_items JSONB,
    document_id UUID REFERENCES documents(id),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Magic Links
CREATE TABLE magic_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
    token TEXT UNIQUE NOT NULL,
    contractor_name TEXT NOT NULL,
    contractor_email TEXT NOT NULL,
    contractor_phone TEXT,
    expires_at TIMESTAMP NOT NULL,
    accessed_at TIMESTAMP,
    access_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL CHECK (status IN ('active', 'expired', 'completed')) DEFAULT 'active',
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_magic_links_token ON magic_links(token);

-- Claim Activities (Audit Trail)
CREATE TABLE claim_activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id),
    activity_type TEXT NOT NULL CHECK (activity_type IN ('status_change', 'document_upload', 'estimate_added', 'comment', 'assignment')),
    description TEXT NOT NULL,
    metadata JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_claim_activities_claim_created ON claim_activities(claim_id, created_at DESC);

-- Payments
CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
    payment_type TEXT NOT NULL CHECK (payment_type IN ('acv', 'rcv')),
    amount DECIMAL(12, 2) NOT NULL,
    check_number TEXT,
    received_date DATE NOT NULL,
    notes TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Seed mortgage banks
INSERT INTO mortgage_banks (name, endorsement_required) VALUES
    ('Wells Fargo', true),
    ('Bank of America', true),
    ('Chase', true),
    ('US Bank', true),
    ('Other', false);
```

**Step 3: Create down migration**

```sql
-- backend/migrations/000001_initial_schema.down.sql

DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS claim_activities;
DROP TABLE IF EXISTS magic_links;
DROP TABLE IF EXISTS estimates;
DROP TABLE IF EXISTS documents;
DROP TABLE IF EXISTS claims;
DROP TABLE IF EXISTS insurance_policies;
DROP TABLE IF EXISTS properties;
DROP TABLE IF EXISTS mortgage_banks;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS organizations;
```

**Step 4: Create database connection**

```go
// backend/internal/database/db.go
package database

import (
	"database/sql"
	"fmt"

	_ "github.com/lib/pq"
)

func Connect(databaseURL string) (*sql.DB, error) {
	db, err := sql.Open("postgres", databaseURL)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	return db, nil
}
```

**Step 5: Create migration runner**

```go
// backend/internal/database/migrate.go
package database

import (
	"database/sql"
	"fmt"

	"github.com/golang-migrate/migrate/v4"
	"github.com/golang-migrate/migrate/v4/database/postgres"
	_ "github.com/golang-migrate/migrate/v4/source/file"
)

func RunMigrations(db *sql.DB) error {
	driver, err := postgres.WithInstance(db, &postgres.Config{})
	if err != nil {
		return fmt.Errorf("failed to create migrate driver: %w", err)
	}

	m, err := migrate.NewWithDatabaseInstance(
		"file://migrations",
		"postgres",
		driver,
	)
	if err != nil {
		return fmt.Errorf("failed to create migrate instance: %w", err)
	}

	if err := m.Up(); err != nil && err != migrate.ErrNoChange {
		return fmt.Errorf("failed to run migrations: %w", err)
	}

	return nil
}
```

**Step 6: Update main.go to run migrations**

```go
// backend/cmd/server/main.go
package main

import (
	"log"
	"os"

	"github.com/claimcoach/backend/internal/api"
	"github.com/claimcoach/backend/internal/config"
	"github.com/claimcoach/backend/internal/database"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	// Connect to database
	db, err := database.Connect(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.Close()

	// Run migrations
	if err := database.RunMigrations(db); err != nil {
		log.Fatalf("Failed to run migrations: %v", err)
	}

	router := api.NewRouter(cfg)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("Server starting on port %s", port)
	if err := router.Run(":" + port); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
```

**Step 7: Test migrations**

```bash
# Start local PostgreSQL (Docker)
docker run --name claimcoach-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=claimcoach -p 5432:5432 -d postgres:15

# Set DATABASE_URL
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/claimcoach?sslmode=disable"

# Run server (migrations run automatically)
cd backend
go run cmd/server/main.go

# Expected: Migrations complete, server starts
```

**Step 8: Commit**

```bash
git add backend/
git commit -m "feat: add database migrations and connection

- Create initial schema with 11 tables
- Add migration runner using golang-migrate
- Connect database on server startup
- Seed mortgage banks

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### Task 0.3: Initialize Frontend Structure

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/tsconfig.json`
- Create: `frontend/tailwind.config.js`
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/App.tsx`
- Create: `frontend/index.html`
- Create: `frontend/.env.example`

**Step 1: Create package.json**

```json
{
  "name": "claimcoach-frontend",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "lint": "eslint . --ext ts,tsx --report-unused-disable-directives --max-warnings 0"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.21.0",
    "@tanstack/react-query": "^5.17.0",
    "@supabase/supabase-js": "^2.39.0",
    "axios": "^1.6.5"
  },
  "devDependencies": {
    "@types/react": "^18.2.48",
    "@types/react-dom": "^18.2.18",
    "@typescript-eslint/eslint-plugin": "^6.18.1",
    "@typescript-eslint/parser": "^6.18.1",
    "@vitejs/plugin-react": "^4.2.1",
    "autoprefixer": "^10.4.16",
    "eslint": "^8.56.0",
    "eslint-plugin-react-hooks": "^4.6.0",
    "eslint-plugin-react-refresh": "^0.4.5",
    "postcss": "^8.4.33",
    "tailwindcss": "^3.4.1",
    "typescript": "^5.3.3",
    "vite": "^5.0.11"
  }
}
```

**Step 2: Create Vite config**

```typescript
// frontend/vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      }
    }
  }
})
```

**Step 3: Create TypeScript config**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

**Step 4: Create Tailwind config**

```javascript
// frontend/tailwind.config.js
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
```

**Step 5: Create index.html**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>ClaimCoach AI</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

**Step 6: Create main.tsx**

```tsx
// frontend/src/main.tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

**Step 7: Create index.css**

```css
/* frontend/src/index.css */
@tailwind base;
@tailwind components;
@tailwind utilities;
```

**Step 8: Create App.tsx**

```tsx
// frontend/src/App.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const queryClient = new QueryClient()

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white shadow">
          <div className="max-w-7xl mx-auto py-6 px-4">
            <h1 className="text-3xl font-bold text-gray-900">
              ClaimCoach AI
            </h1>
          </div>
        </header>
        <main className="max-w-7xl mx-auto py-6 px-4">
          <p className="text-gray-600">Welcome to ClaimCoach AI</p>
        </main>
      </div>
    </QueryClientProvider>
  )
}

export default App
```

**Step 9: Create .env.example**

```bash
# frontend/.env.example
VITE_API_URL=http://localhost:8080
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

**Step 10: Install dependencies and test**

```bash
cd frontend
npm install
npm run dev
# Expected: Dev server starts on http://localhost:5173
```

**Step 11: Commit**

```bash
git add frontend/
git commit -m "feat: initialize React frontend with Vite and Tailwind

- Add Vite config with API proxy
- Configure TypeScript strict mode
- Setup Tailwind CSS
- Add TanStack Query for server state
- Create basic app shell

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Phase 1: Authentication & User Management

### Task 1.1: Supabase Authentication Backend

**Files:**
- Create: `backend/internal/auth/supabase.go`
- Create: `backend/internal/auth/middleware.go`
- Create: `backend/internal/models/user.go`
- Modify: `backend/internal/api/router.go`

**Step 1: Create user model**

```go
// backend/internal/models/user.go
package models

import "time"

type User struct {
	ID             string    `json:"id" db:"id"`
	OrganizationID string    `json:"organization_id" db:"organization_id"`
	Email          string    `json:"email" db:"email"`
	Name           string    `json:"name" db:"name"`
	Role           string    `json:"role" db:"role"`
	CreatedAt      time.Time `json:"created_at" db:"created_at"`
	UpdatedAt      time.Time `json:"updated_at" db:"updated_at"`
}

type Organization struct {
	ID        string    `json:"id" db:"id"`
	Name      string    `json:"name" db:"name"`
	CreatedAt time.Time `json:"created_at" db:"created_at"`
	UpdatedAt time.Time `json:"updated_at" db:"updated_at"`
}
```

**Step 2: Create Supabase client**

```go
// backend/internal/auth/supabase.go
package auth

import (
	"context"
	"fmt"

	supabase "github.com/supabase-community/supabase-go"
)

type SupabaseClient struct {
	client    *supabase.Client
	jwtSecret string
}

func NewSupabaseClient(url, serviceKey, jwtSecret string) (*SupabaseClient, error) {
	client, err := supabase.NewClient(url, serviceKey, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create supabase client: %w", err)
	}

	return &SupabaseClient{
		client:    client,
		jwtSecret: jwtSecret,
	}, nil
}

func (s *SupabaseClient) VerifyToken(token string) (string, error) {
	// Verify JWT token and extract user ID
	user, err := s.client.Auth.User(context.Background(), token)
	if err != nil {
		return "", fmt.Errorf("invalid token: %w", err)
	}

	return user.ID, nil
}
```

**Step 3: Create auth middleware**

```go
// backend/internal/auth/middleware.go
package auth

import (
	"database/sql"
	"net/http"
	"strings"

	"github.com/claimcoach/backend/internal/models"
	"github.com/gin-gonic/gin"
)

func AuthMiddleware(supabase *SupabaseClient, db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.JSON(http.StatusUnauthorized, gin.H{
				"success": false,
				"error":   "Authorization header required",
				"code":    "UNAUTHORIZED",
			})
			c.Abort()
			return
		}

		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || parts[0] != "Bearer" {
			c.JSON(http.StatusUnauthorized, gin.H{
				"success": false,
				"error":   "Invalid authorization header format",
				"code":    "UNAUTHORIZED",
			})
			c.Abort()
			return
		}

		token := parts[1]
		userID, err := supabase.VerifyToken(token)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{
				"success": false,
				"error":   "Invalid or expired token",
				"code":    "UNAUTHORIZED",
			})
			c.Abort()
			return
		}

		// Fetch user from database
		var user models.User
		err = db.QueryRow(`
			SELECT id, organization_id, email, name, role, created_at, updated_at
			FROM users
			WHERE id = $1
		`, userID).Scan(
			&user.ID,
			&user.OrganizationID,
			&user.Email,
			&user.Name,
			&user.Role,
			&user.CreatedAt,
			&user.UpdatedAt,
		)
		if err != nil {
			if err == sql.ErrNoRows {
				c.JSON(http.StatusNotFound, gin.H{
					"success": false,
					"error":   "User not found",
					"code":    "USER_NOT_FOUND",
				})
			} else {
				c.JSON(http.StatusInternalServerError, gin.H{
					"success": false,
					"error":   "Database error",
					"code":    "INTERNAL_ERROR",
				})
			}
			c.Abort()
			return
		}

		c.Set("user", user)
		c.Next()
	}
}
```

**Step 4: Install Supabase Go client**

```bash
cd backend
go get github.com/supabase-community/supabase-go
go mod tidy
```

**Step 5: Update router to use auth middleware**

```go
// backend/internal/api/router.go (add to existing file)
package api

import (
	"database/sql"
	"net/http"

	"github.com/claimcoach/backend/internal/auth"
	"github.com/claimcoach/backend/internal/config"
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

func NewRouter(cfg *config.Config, db *sql.DB) (*gin.Engine, error) {
	r := gin.Default()

	// CORS
	r.Use(cors.New(cors.Config{
		AllowOrigins:     []string{cfg.AllowedOrigins},
		AllowMethods:     []string{"GET", "POST", "PATCH", "DELETE"},
		AllowHeaders:     []string{"Authorization", "Content-Type"},
		AllowCredentials: true,
	}))

	// Supabase client
	supabase, err := auth.NewSupabaseClient(
		cfg.SupabaseURL,
		cfg.SupabaseServiceKey,
		cfg.SupabaseJWTSecret,
	)
	if err != nil {
		return nil, err
	}

	// Public routes
	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	// Protected routes
	api := r.Group("/api")
	api.Use(auth.AuthMiddleware(supabase, db))
	{
		api.GET("/me", func(c *gin.Context) {
			user := c.MustGet("user")
			c.JSON(http.StatusOK, gin.H{
				"success": true,
				"data":    user,
			})
		})
	}

	return r, nil
}
```

**Step 6: Update main.go**

```go
// backend/cmd/server/main.go (update router creation)
router, err := api.NewRouter(cfg, db)
if err != nil {
	log.Fatalf("Failed to create router: %v", err)
}
```

**Step 7: Test auth middleware**

```bash
# Start server
cd backend
go run cmd/server/main.go

# Test without auth (should fail)
curl http://localhost:8080/api/me
# Expected: {"success":false,"error":"Authorization header required","code":"UNAUTHORIZED"}

# Test with invalid token (should fail)
curl -H "Authorization: Bearer invalid" http://localhost:8080/api/me
# Expected: {"success":false,"error":"Invalid or expired token","code":"UNAUTHORIZED"}
```

**Step 8: Commit**

```bash
git add backend/
git commit -m "feat: add Supabase authentication middleware

- Create Supabase client for JWT verification
- Add auth middleware to validate tokens
- Extract user from database after token verification
- Add protected /api/me endpoint for testing

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### Task 1.2: Frontend Authentication

**Files:**
- Create: `frontend/src/lib/supabase.ts`
- Create: `frontend/src/lib/api.ts`
- Create: `frontend/src/contexts/AuthContext.tsx`
- Create: `frontend/src/pages/Login.tsx`
- Create: `frontend/src/pages/Dashboard.tsx`
- Modify: `frontend/src/App.tsx`

**Step 1: Create Supabase client**

```typescript
// frontend/src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
```

**Step 2: Create API client**

```typescript
// frontend/src/lib/api.ts
import axios from 'axios'
import { supabase } from './supabase'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8080',
})

// Add auth token to every request
api.interceptors.request.use(async (config) => {
  const { data: { session } } = await supabase.auth.getSession()

  if (session?.access_token) {
    config.headers.Authorization = `Bearer ${session.access_token}`
  }

  return config
})

export default api
```

**Step 3: Create auth context**

```tsx
// frontend/src/contexts/AuthContext.tsx
import { createContext, useContext, useEffect, useState } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

interface AuthContextType {
  user: User | null
  session: Session | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session)
        setUser(session?.user ?? null)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (error) throw error
  }

  const signOut = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  }

  return (
    <AuthContext.Provider value={{ user, session, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
```

**Step 4: Create login page**

```tsx
// frontend/src/pages/Login.tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { signIn } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      await signIn(email, password)
      navigate('/dashboard')
    } catch (err: any) {
      setError(err.message || 'Failed to sign in')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="text-center text-3xl font-bold text-gray-900">
            ClaimCoach AI
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Sign in to your account
          </p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}
          <div className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
```

**Step 5: Create dashboard page**

```tsx
// frontend/src/pages/Dashboard.tsx
import { useAuth } from '../contexts/AuthContext'
import { useQuery } from '@tanstack/react-query'
import api from '../lib/api'

export default function Dashboard() {
  const { user, signOut } = useAuth()

  const { data, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const response = await api.get('/api/me')
      return response.data.data
    }
  })

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto py-6 px-4 flex justify-between items-center">
          <h1 className="text-3xl font-bold text-gray-900">ClaimCoach AI</h1>
          <button
            onClick={() => signOut()}
            className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Sign Out
          </button>
        </div>
      </header>
      <main className="max-w-7xl mx-auto py-6 px-4">
        {isLoading ? (
          <p>Loading...</p>
        ) : (
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Welcome!</h2>
            <div className="space-y-2 text-sm">
              <p><strong>Email:</strong> {data?.email}</p>
              <p><strong>Name:</strong> {data?.name}</p>
              <p><strong>Role:</strong> {data?.role}</p>
              <p><strong>Organization ID:</strong> {data?.organization_id}</p>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
```

**Step 6: Update App.tsx with routing**

```tsx
// frontend/src/App.tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'

const queryClient = new QueryClient()

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()

  if (loading) {
    return <div>Loading...</div>
  }

  if (!user) {
    return <Navigate to="/login" />
  }

  return <>{children}</>
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            <Route path="/" element={<Navigate to="/dashboard" />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}

export default App
```

**Step 7: Test authentication flow**

```bash
# Start frontend
cd frontend
npm run dev

# Navigate to http://localhost:5173
# Should redirect to /login
# Try signing in (you'll need to create a test user in Supabase first)
```

**Step 8: Commit**

```bash
git add frontend/
git commit -m "feat: add frontend authentication with Supabase

- Create auth context for global auth state
- Add login page with form
- Add protected dashboard route
- Configure API client to attach JWT tokens
- Add sign out functionality

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Implementation Notes

This plan continues with similar detailed tasks for:
- Phase 2: Property & Policy Management
- Phase 3: Claims Management Core
- Phase 4: Magic Link System
- Phase 5: Deductible Comparison
- Phase 6: AI Audit System
- Phase 7: Field Logistics & Payments

Each phase follows the same pattern:
1. Write failing tests
2. Run tests to verify failure
3. Implement minimal code
4. Run tests to verify pass
5. Commit with clear message

The complete plan would be ~500 tasks total. Would you like me to continue with the remaining phases, or would you prefer to start implementing Phase 0 and Phase 1 first?

---

## Execution Strategy

**Recommended Approach:** Subagent-Driven Development
- Execute tasks in this session
- Fresh subagent per task for clean context
- Code review between tasks
- Fast iteration and feedback

**Alternative:** Parallel Session Execution
- Open new Claude session in worktree
- Use @superpowers:executing-plans skill
- Batch execution with checkpoints

**Which would you prefer?**
