package api

import (
	"database/sql"
	"log"
	"net/http"
	"strings"

	"github.com/claimcoach/backend/internal/auth"
	"github.com/claimcoach/backend/internal/config"
	"github.com/claimcoach/backend/internal/handlers"
	"github.com/claimcoach/backend/internal/llm"
	"github.com/claimcoach/backend/internal/services"
	"github.com/claimcoach/backend/internal/storage"
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

func NewRouter(cfg *config.Config, db *sql.DB) (*gin.Engine, error) {
	r := gin.Default()

	// Parse allowed origins
	allowedOrigins := []string{"*"}
	if cfg.AllowedOrigins != "" {
		allowedOrigins = strings.Split(cfg.AllowedOrigins, ",")
		for i, origin := range allowedOrigins {
			allowedOrigins[i] = strings.TrimSpace(origin)
		}
	}

	// CORS
	r.Use(cors.New(cors.Config{
		AllowOrigins:     allowedOrigins,
		AllowMethods:     []string{"GET", "POST", "PATCH", "DELETE", "OPTIONS"},
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

	// Supabase Storage client
	storageClient, err := storage.NewSupabaseStorage(
		cfg.SupabaseURL,
		cfg.SupabaseServiceKey,
	)
	if err != nil {
		return nil, err
	}

	// Initialize LLM client
	llmClient := llm.NewPerplexityClient(
		cfg.PerplexityAPIKey,
		cfg.PerplexityModel,
		cfg.PerplexityTimeout,
		cfg.PerplexityMaxRetries,
	)

	// Initialize services needed for both public and protected routes
	propertyService := services.NewPropertyService(db)
	policyService := services.NewPolicyService(db, storageClient, propertyService)
	claimService := services.NewClaimService(db, propertyService, policyService)

	// Conditionally use SendGrid or Mock email service based on API key
	var emailService services.EmailService
	if cfg.SendGridAPIKey != "" {
		emailService = services.NewSendGridEmailService(
			cfg.SendGridAPIKey,
			cfg.SendGridFromEmail,
			cfg.SendGridFromName,
			cfg.ClaimCoachEmail,
			cfg.FrontendURL,
		)
		log.Println("✓ Using SendGrid email service")
	} else {
		emailService = services.NewMockEmailService()
		log.Println("⚠ Using Mock email service (emails logged to console)")
	}

	magicLinkService := services.NewMagicLinkService(db, cfg, storageClient, claimService, emailService)
	magicLinkHandler := handlers.NewMagicLinkHandler(magicLinkService)
	scopeSheetService := services.NewScopeSheetService(db)
	scopeSheetHandler := handlers.NewScopeSheetHandler(scopeSheetService, magicLinkService, claimService)
	auditService := services.NewAuditService(db, llmClient, scopeSheetService)
	auditHandler := handlers.NewAuditHandler(auditService)

	// Phase 7 services and handlers
	meetingService := services.NewMeetingService(db, emailService, claimService)
	meetingHandler := handlers.NewMeetingHandler(meetingService)
	paymentService := services.NewPaymentService(db, claimService)
	paymentHandler := handlers.NewPaymentHandler(paymentService)
	rcvDemandService := services.NewRCVDemandService(db, llmClient, claimService, paymentService)
	rcvDemandHandler := handlers.NewRCVDemandHandler(rcvDemandService)

	// Public routes
	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	// Public auth endpoints (no auth required)
	authHandler := handlers.NewAuthHandler(db, supabase)
	r.POST("/api/auth/complete-signup", authHandler.CompleteSignup)

	// Public mortgage banks endpoint (no auth required for dropdown)
	mortgageBankService := services.NewMortgageBankService(db)
	mortgageBankHandler := handlers.NewMortgageBankHandler(mortgageBankService)
	r.GET("/api/mortgage-banks", mortgageBankHandler.GetAllBanks)

	// Public magic link endpoints (no auth required)
	r.GET("/api/magic-links/:token/validate", magicLinkHandler.ValidateToken)
	r.GET("/api/magic-links/:token/documents", magicLinkHandler.ListDocuments)
	r.POST("/api/magic-links/:token/documents/upload-url", magicLinkHandler.RequestUploadURL)
	r.POST("/api/magic-links/:token/documents/:documentId/confirm", magicLinkHandler.ConfirmUpload)
	r.POST("/api/magic-links/:token/scope-sheet", scopeSheetHandler.CreateViaMagicLink)
	r.POST("/api/magic-links/:token/scope-sheet/draft", scopeSheetHandler.SaveDraft)
	r.GET("/api/magic-links/:token/scope-sheet/draft", scopeSheetHandler.GetDraft)

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

		// Property routes
		propertyHandler := handlers.NewPropertyHandler(propertyService)

		api.POST("/properties", propertyHandler.Create)
		api.GET("/properties", propertyHandler.List)
		api.GET("/properties/:id", propertyHandler.Get)
		api.PATCH("/properties/:id", propertyHandler.Update)

		// Policy routes (use same param name :id to avoid gin routing conflicts)
		policyHandler := handlers.NewPolicyHandler(policyService)

		api.POST("/properties/:id/policy", policyHandler.Create)
		api.GET("/properties/:id/policy", policyHandler.Get)
		api.DELETE("/properties/:id/policy", policyHandler.Delete)
		api.POST("/properties/:id/policy/pdf/upload-url", policyHandler.RequestPDFUploadURL)
		api.POST("/properties/:id/policy/pdf/confirm", policyHandler.ConfirmPDFUpload)

		// Claim routes
		claimHandler := handlers.NewClaimHandler(claimService, emailService)

		api.POST("/claims", claimHandler.Create)
		api.GET("/claims", claimHandler.List)
		api.GET("/claims/:id", claimHandler.Get)
		api.DELETE("/claims/:id", claimHandler.Delete)
		api.PATCH("/claims/:id/status", claimHandler.UpdateStatus)
		api.PATCH("/claims/:id/step", claimHandler.UpdateClaimStep)
		api.PATCH("/claims/:id/estimate", claimHandler.PatchClaimEstimate)
		api.GET("/claims/:id/activities", claimHandler.GetActivities)

		// Document routes
		documentService := services.NewDocumentService(db, storageClient, claimService)
		documentHandler := handlers.NewDocumentHandler(documentService)

		api.POST("/claims/:id/documents/upload-url", documentHandler.RequestUploadURL)
		api.POST("/claims/:id/documents/:documentId/confirm", documentHandler.ConfirmUpload)
		api.GET("/claims/:id/documents", documentHandler.ListDocuments)
		api.GET("/documents/:id", documentHandler.GetDocument)

		// Carrier Estimate routes
		carrierEstimateService := services.NewCarrierEstimateService(db, storageClient, claimService)
		pdfParserService := services.NewPDFParserService(db, storageClient, llmClient, claimService)
		carrierEstimateHandler := handlers.NewCarrierEstimateHandler(carrierEstimateService, pdfParserService)

		api.POST("/claims/:id/carrier-estimate/upload-url", carrierEstimateHandler.RequestUploadURL)
		api.POST("/claims/:id/carrier-estimate/:estimateId/confirm", carrierEstimateHandler.ConfirmUpload)
		api.GET("/claims/:id/carrier-estimate", carrierEstimateHandler.ListCarrierEstimates)
		api.POST("/claims/:id/carrier-estimate/:estimateId/parse", carrierEstimateHandler.ParseCarrierEstimate)

		// Magic Link routes (protected - requires auth)
		api.POST("/claims/:id/magic-link", magicLinkHandler.GenerateMagicLink)
		api.GET("/claims/:id/magic-links", magicLinkHandler.GetMagicLinks)

		// Scope Sheet routes (protected - requires auth)
		api.GET("/claims/:id/scope-sheet", scopeSheetHandler.GetByClaimID)

		// Audit routes (protected - requires auth)
		api.POST("/claims/:id/audit/generate", auditHandler.GenerateIndustryEstimate)
		api.GET("/claims/:id/audit", auditHandler.GetAuditReport)
		api.POST("/claims/:id/audit/:auditId/compare", auditHandler.CompareEstimates)
		api.POST("/claims/:id/audit/:auditId/rebuttal", auditHandler.GenerateRebuttal)
		api.GET("/rebuttals/:id", auditHandler.GetRebuttal)

		// Meeting routes (Phase 7 - protected)
		api.POST("/claims/:id/meetings", meetingHandler.CreateMeeting)
		api.GET("/claims/:id/meetings", meetingHandler.ListMeetingsByClaimID)
		api.GET("/meetings/:id", meetingHandler.GetMeeting)
		api.PATCH("/meetings/:id/status", meetingHandler.UpdateMeetingStatus)
		api.PATCH("/meetings/:id/complete", meetingHandler.CompleteMeeting)
		api.PATCH("/meetings/:id/cancel", meetingHandler.CancelMeeting)
		api.PATCH("/meetings/:id/assign", meetingHandler.AssignRepresentative)

		// Payment routes (Phase 7 - protected)
		api.POST("/claims/:id/payments", paymentHandler.CreateExpectedPayment)
		api.GET("/claims/:id/payments", paymentHandler.ListPaymentsByClaimID)
		api.PATCH("/payments/:id/received", paymentHandler.RecordPaymentReceived)
		api.PATCH("/payments/:id/reconcile", paymentHandler.ReconcilePayment)
		api.PATCH("/payments/:id/dispute", paymentHandler.DisputePayment)
		api.GET("/claims/:id/payment-summary", paymentHandler.GetPaymentSummary)
		api.GET("/claims/:id/closure-status", paymentHandler.CheckClaimReadyForClosure)

		// RCV Demand routes (Phase 7 - protected)
		api.POST("/claims/:id/rcv-demand/generate", rcvDemandHandler.GenerateRCVDemandLetter)
		api.GET("/claims/:id/rcv-demand", rcvDemandHandler.ListRCVDemandLettersByClaimID)
		api.GET("/rcv-demand/:id", rcvDemandHandler.GetRCVDemandLetter)
		api.PATCH("/rcv-demand/:id/mark-sent", rcvDemandHandler.MarkAsSent)
	}

	return r, nil
}
