package main

import (
	"context"
	"encoding/json"
	"log"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	ginadapter "github.com/awslabs/aws-lambda-go-api-proxy/gin"

	"fmt"
	"time"

	"github.com/claimcoach/backend/internal/api"
	"github.com/claimcoach/backend/internal/config"
	"github.com/claimcoach/backend/internal/database"
	"github.com/claimcoach/backend/internal/services"
	"github.com/claimcoach/backend/internal/slack"
)

var ginLambda *ginadapter.GinLambdaV2
var auditService *services.AuditService
var slackSvc *slack.SlackService

func init() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	db, err := database.Connect(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}

	if err := database.RunMigrations(db); err != nil {
		log.Fatalf("Failed to run migrations: %v", err)
	}

	router, svc, err := api.NewRouter(cfg, db)
	if err != nil {
		log.Fatalf("Failed to create router: %v", err)
	}

	ginLambda = ginadapter.NewV2(router)
	auditService = svc
	slackSvc = slack.NewSlackService(cfg.SlackBotToken)
}

// asyncJobEvent is the payload sent when the Lambda invokes itself asynchronously.
type asyncJobEvent struct {
	JobType       string `json:"job_type"`
	AuditReportID string `json:"audit_report_id"`
	ClaimID       string `json:"claim_id"`
	UserID        string `json:"user_id"`
	OrgID         string `json:"org_id"`
}

func handler(ctx context.Context, raw json.RawMessage) (interface{}, error) {
	// Detect async job invocation by checking for job_type field
	var job asyncJobEvent
	if err := json.Unmarshal(raw, &job); err == nil && job.JobType == "process_audit_estimate" {
		log.Printf("Processing async audit job: audit_report_id=%s claim_id=%s", job.AuditReportID, job.ClaimID)
		if err := auditService.ProcessEstimateJob(ctx, job.AuditReportID, job.ClaimID, job.UserID, job.OrgID); err != nil {
			log.Printf("ProcessEstimateJob failed: %v", err)
			msg := fmt.Sprintf(
				"🚨 *ClaimCoach — Async Job Failed*\nJob: Estimate generation\nAudit Report ID: %s\nClaim: %s\nError: %s\n_%s UTC_",
				job.AuditReportID, job.ClaimID, err.Error(), time.Now().UTC().Format("2006-01-02 15:04"),
			)
			_ = slackSvc.PostAlertWithFingerprint(msg, "estimate-gen|"+job.AuditReportID)
		}
		return nil, nil
	}

	// Otherwise treat as an API Gateway V2 HTTP request
	var req events.APIGatewayV2HTTPRequest
	if err := json.Unmarshal(raw, &req); err != nil {
		return nil, err
	}
	return ginLambda.ProxyWithContext(ctx, req)
}

func main() {
	lambda.Start(handler)
}
