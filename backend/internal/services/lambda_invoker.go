package services

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	lambdasvc "github.com/aws/aws-sdk-go-v2/service/lambda"
	"github.com/aws/aws-sdk-go-v2/service/lambda/types"
)

// AsyncJobPayload is the payload sent when invoking the Lambda function asynchronously.
type AsyncJobPayload struct {
	JobType       string `json:"job_type"`
	AuditReportID string `json:"audit_report_id"`
	ClaimID       string `json:"claim_id"`
	UserID        string `json:"user_id"`
	OrgID         string `json:"org_id"`
}

// AsyncInvoker invokes the Lambda function asynchronously.
type AsyncInvoker interface {
	InvokeAsync(ctx context.Context, payload AsyncJobPayload) error
}

// LambdaAsyncInvoker uses the AWS Lambda SDK to fire-and-forget invoke the current function.
type LambdaAsyncInvoker struct {
	client       *lambdasvc.Client
	functionName string
}

// NewLambdaAsyncInvoker creates an invoker using the current AWS environment.
// Returns nil, nil if AWS_LAMBDA_FUNCTION_NAME is not set (e.g. local dev).
func NewLambdaAsyncInvoker(ctx context.Context) (*LambdaAsyncInvoker, error) {
	functionName := os.Getenv("AWS_LAMBDA_FUNCTION_NAME")
	if functionName == "" {
		return nil, nil // not running in Lambda — caller should handle nil invoker
	}

	cfg, err := awsconfig.LoadDefaultConfig(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to load AWS config: %w", err)
	}

	return &LambdaAsyncInvoker{
		client:       lambdasvc.NewFromConfig(cfg),
		functionName: functionName,
	}, nil
}

// InvokeAsync fires an asynchronous Lambda invocation with InvocationType=Event.
// The Lambda runtime will call our function with the given payload without waiting for a response.
func (i *LambdaAsyncInvoker) InvokeAsync(ctx context.Context, payload AsyncJobPayload) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal payload: %w", err)
	}

	log.Printf("LambdaAsyncInvoker: invoking function %s with job_type=%s, audit_report_id=%s",
		i.functionName, payload.JobType, payload.AuditReportID)

	_, err = i.client.Invoke(ctx, &lambdasvc.InvokeInput{
		FunctionName:   aws.String(i.functionName),
		InvocationType: types.InvocationTypeEvent, // async — no response, no 29s limit
		Payload:        body,
	})

	if err != nil {
		log.Printf("LambdaAsyncInvoker: failed to invoke function %s: %v", i.functionName, err)
		return fmt.Errorf("lambda invoke failed: %w", err)
	}

	log.Printf("LambdaAsyncInvoker: successfully invoked function %s", i.functionName)
	return nil
}
