package api

import (
	"context"
	"database/sql"
	"log"
	"net/http"
	"strings"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"

	"github.com/claimcoach/backend/internal/auth"
	"github.com/claimcoach/backend/internal/config"
	"github.com/claimcoach/backend/internal/handlers"
	"github.com/claimcoach/backend/internal/llm"
	"github.com/claimcoach/backend/internal/middleware"
	"github.com/claimcoach/backend/internal/services"
	"github.com/claimcoach/backend/internal/slack"
	"github.com/claimcoach/backend/internal/storage"
)

func NewRouter(cfg *config.Config, db *sql.DB) (*gin.Engine, *services.AuditService, error) {
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
		AllowMethods:     []string{"GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Authorization", "Content-Type"},
		AllowCredentials: true,
	}))

	// Slack error alerting (no-op if token not set)
	slackSvc := slack.NewSlackService(cfg.SlackBotToken)
	r.Use(middleware.ErrorReporter(slackSvc))

	// Supabase client
	supabase, err := auth.NewSupabaseClient(
		cfg.SupabaseURL,
		cfg.SupabaseServiceKey,
		cfg.SupabaseJWTSecret,
	)
	if err != nil {
		return nil, nil, err
	}

	// Supabase Storage client
	storageClient, err := storage.NewSupabaseStorage(
		cfg.SupabaseURL,
		cfg.SupabaseServiceKey,
	)
	if err != nil {
		return nil, nil, err
	}

	// Initialize LLM client (Claude for all AI features)
	llmClient := llm.NewClaudeClient(cfg.AnthropicAPIKey, cfg.AnthropicModel, 120)

	// OpenAI client for live pricing search (required — estimate jobs hard-fail without it)
	var searchClient services.LLMClient
	if cfg.OpenAIAPIKey != "" {
		searchClient = llm.NewOpenAIClient(cfg.OpenAIAPIKey, cfg.OpenAIModel, cfg.OpenAITimeout)
		log.Println("✓ OpenAI live pricing search enabled")
	} else {
		log.Println("⚠ OpenAI live pricing search disabled (OPENAI_API_KEY not set)")
	}

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
	inspectionService := services.NewInspectionService(db, magicLinkService, storageClient)
	inspectionHandler := handlers.NewInspectionHandler(inspectionService)
	scopeSheetService := services.NewScopeSheetService(db)
	scopeSheetHandler := handlers.NewScopeSheetHandler(scopeSheetService, magicLinkService, claimService)
	asyncInvoker, err := services.NewLambdaAsyncInvoker(context.Background())
	if err != nil {
		log.Printf("⚠ Failed to create Lambda async invoker: %v (will run synchronously)", err)
	}
	if asyncInvoker != nil {
		log.Println("✓ Lambda async invoker enabled")
	} else {
		log.Println("⚠ Lambda async invoker disabled (running synchronously)")
	}
	auditService := services.NewAuditService(db, llmClient, searchClient, scopeSheetService, asyncInvoker)
	auditHandler := handlers.NewAuditHandler(auditService)
	legalPackageService := services.NewLegalPackageService(db, storageClient, auditService)
	legalPackageHandler := handlers.NewLegalPackageHandler(legalPackageService)

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

	// Error reporting (unauthenticated — frontend fires-and-forgets)
	errorReporterHandler := handlers.NewErrorReporterHandler(slackSvc)
	r.POST("/api/errors", errorReporterHandler.Report)

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

	// Inspection V2 routes (public - no auth required)
	r.GET("/api/magic-links/:token/v2/inspection", inspectionHandler.GetSetup)
	r.POST("/api/magic-links/:token/v2/inspection", inspectionHandler.SaveSetup)
	r.GET("/api/magic-links/:token/v2/inspection/elevations", inspectionHandler.GetElevations)
	r.PUT("/api/magic-links/:token/v2/inspection/elevations/:side", inspectionHandler.SaveElevation)

	// Roof section routes (multi-section)
	r.GET("/api/magic-links/:token/v2/inspection/roof-sections", inspectionHandler.ListRoofSections)
	r.POST("/api/magic-links/:token/v2/inspection/roof-sections", inspectionHandler.CreateRoofSection)
	r.PATCH("/api/magic-links/:token/v2/inspection/roof-sections/:roofId", inspectionHandler.UpdateRoofSection)
	r.DELETE("/api/magic-links/:token/v2/inspection/roof-sections/:roofId", inspectionHandler.DeleteRoofSection)
	r.POST("/api/magic-links/:token/v2/inspection/roof-sections/:roofId/damage-spots", inspectionHandler.AddRoofSectionDamageSpot)
	r.DELETE("/api/magic-links/:token/v2/inspection/roof-sections/:roofId/damage-spots/:spotId", inspectionHandler.DeleteRoofSectionDamageSpot)

	// Rooms routes
	r.GET("/api/magic-links/:token/v2/inspection/rooms", inspectionHandler.GetRooms)
	r.POST("/api/magic-links/:token/v2/inspection/rooms", inspectionHandler.CreateRoom)
	r.PUT("/api/magic-links/:token/v2/inspection/rooms/:roomId", inspectionHandler.UpdateRoom)
	r.DELETE("/api/magic-links/:token/v2/inspection/rooms/:roomId", inspectionHandler.DeleteRoom)
	r.POST("/api/magic-links/:token/v2/inspection/rooms/:roomId/photos", inspectionHandler.AddRoomPhoto)
	r.DELETE("/api/magic-links/:token/v2/inspection/rooms/:roomId/photos/:photoId", inspectionHandler.DeleteRoomPhoto)
	r.POST("/api/magic-links/:token/v2/inspection/submit", inspectionHandler.SubmitInspection)

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
		api.DELETE("/properties/:id", propertyHandler.Delete)

		// Policy routes (use same param name :id to avoid gin routing conflicts)
		policyHandler := handlers.NewPolicyHandler(policyService)

		api.POST("/properties/:id/policy", policyHandler.Create)
		api.GET("/properties/:id/policy", policyHandler.Get)
		api.DELETE("/properties/:id/policy", policyHandler.Delete)
		api.GET("/properties/:id/policy/pdf/url", policyHandler.GetPDFDownloadURL)
		api.POST("/properties/:id/policy/pdf/upload-url", policyHandler.RequestPDFUploadURL)
		api.POST("/properties/:id/policy/pdf/confirm", policyHandler.ConfirmPDFUpload)

		// Claim routes
		claimHandler := handlers.NewClaimHandler(claimService, emailService, slackSvc)

		api.POST("/claims", claimHandler.Create)
		api.GET("/claims", claimHandler.List)
		api.GET("/claims/:id", claimHandler.Get)
		api.DELETE("/claims/:id", claimHandler.Delete)
		api.PATCH("/claims/:id/status", claimHandler.UpdateStatus)
		api.PATCH("/claims/:id/step", claimHandler.UpdateClaimStep)
		api.PATCH("/claims/:id/estimate", claimHandler.PatchClaimEstimate)
		api.GET("/claims/:id/activities", claimHandler.GetActivities)
		api.POST("/claims/:id/notify-claimcoach", claimHandler.NotifyClaimCoach)

		// Document routes
		documentService := services.NewDocumentService(db, storageClient, claimService)
		documentHandler := handlers.NewDocumentHandler(documentService)

		api.POST("/claims/:id/documents/upload-url", documentHandler.RequestUploadURL)
		api.POST("/claims/:id/documents/:documentId/confirm", documentHandler.ConfirmUpload)
		api.GET("/claims/:id/documents", documentHandler.ListDocuments)
		api.GET("/documents/:id", documentHandler.GetDocument)
		api.DELETE("/claims/:id/documents/:documentId", documentHandler.DeleteDocument)

		// Carrier Estimate routes
		pdfClaudeClient := llm.NewClaudeClient(cfg.AnthropicAPIKey, cfg.AnthropicPDFModel, 120)
		carrierEstimateService := services.NewCarrierEstimateService(db, storageClient, claimService)
		pdfParserService := services.NewPDFParserService(db, storageClient, pdfClaudeClient, claimService)
		carrierEstimateHandler := handlers.NewCarrierEstimateHandler(carrierEstimateService, pdfParserService, slackSvc)

		api.POST("/claims/:id/carrier-estimate/upload-url", carrierEstimateHandler.RequestUploadURL)
		api.POST("/claims/:id/carrier-estimate/:estimateId/confirm", carrierEstimateHandler.ConfirmUpload)
		api.GET("/claims/:id/carrier-estimate", carrierEstimateHandler.ListCarrierEstimates)
		api.POST("/claims/:id/carrier-estimate/:estimateId/parse", carrierEstimateHandler.ParseCarrierEstimate)

		// Contractor Estimate routes (Step 2 — PDF upload from contractor)
		contractorEstimateService := services.NewContractorEstimateService(db, storageClient, claimService)
		contractorParserService := services.NewContractorPDFParserService(db, storageClient, pdfClaudeClient, claimService)
		contractorEstimateHandler := handlers.NewContractorEstimateHandler(contractorEstimateService, contractorParserService, slackSvc)

		api.POST("/claims/:id/contractor-estimate/upload-url", contractorEstimateHandler.RequestUploadURL)
		api.POST("/claims/:id/contractor-estimate/:estimateId/confirm", contractorEstimateHandler.ConfirmUpload)
		api.GET("/claims/:id/contractor-estimate", contractorEstimateHandler.GetLatest)
		api.POST("/claims/:id/contractor-estimate/:estimateId/parse", contractorEstimateHandler.ParseContractorEstimate)

		// Magic Link routes (protected - requires auth)
		api.POST("/claims/:id/magic-link", magicLinkHandler.GenerateMagicLink)
		api.GET("/claims/:id/magic-links", magicLinkHandler.GetMagicLinks)

		// Scope Sheet routes (protected - requires auth)
		api.GET("/claims/:id/scope-sheet", scopeSheetHandler.GetByClaimID)

		// Inspection V2 routes (protected - requires auth)
		api.GET("/claims/:id/inspection", inspectionHandler.GetByClaimID)

		// Media routes (protected - requires auth)
		claimMediaHandler := handlers.NewClaimMediaHandler(claimService, inspectionService, db, storageClient)
		api.GET("/claims/:id/media", claimMediaHandler.GetMedia)
		api.POST("/claims/:id/media/upload-url", claimMediaHandler.RequestPhotoUploadURL)
		api.POST("/claims/:id/media", claimMediaHandler.ConfirmPhotoUpload)
		api.DELETE("/claims/:id/media/:photoId", claimMediaHandler.DeletePhoto)

		// Audit routes (protected - requires auth)
		api.POST("/claims/:id/audit/generate", auditHandler.GenerateIndustryEstimate)
		api.GET("/claims/:id/audit/status/:jobId", auditHandler.GetJobStatus)
		api.POST("/claims/:id/audit/viability", auditHandler.AnalyzeClaimViability)
		api.GET("/claims/:id/audit", auditHandler.GetAuditReport)
		api.POST("/claims/:id/audit/:auditId/pm-brain", auditHandler.RunPMBrain)
		api.POST("/claims/:id/audit/:auditId/dispute-letter", auditHandler.GenerateDisputeLetter)
		api.POST("/claims/:id/audit/:auditId/owner-pitch", auditHandler.GenerateOwnerPitch)

		// Legal Package routes
		api.GET("/claims/:id/legal-package/download", legalPackageHandler.Download)

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

	return r, auditService, nil
}
