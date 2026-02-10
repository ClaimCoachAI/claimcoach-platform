package services

import (
	"context"
	"database/sql"
	"testing"
	"time"

	"github.com/claimcoach/backend/internal/models"
	_ "github.com/lib/pq"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestPhase7IntegrationSuccess tests the complete Phase 7 workflow
func TestPhase7IntegrationSuccess(t *testing.T) {
	// Skip if not in integration test mode
	if testing.Short() {
		t.Skip("Skipping integration test in short mode")
	}

	// Setup test database connection
	db, err := setupTestDB(t)
	require.NoError(t, err)
	defer cleanupTestDB(t, db)

	ctx := context.Background()
	testOrgID := "test-org-" + time.Now().Format("20060102150405")
	testUserID := "test-user-" + time.Now().Format("20060102150405")

	// Step 1: Create test property and claim
	propertyService := NewPropertyService(db)
	propertyID, err := createTestProperty(t, ctx, propertyService, testUserID, testOrgID)
	require.NoError(t, err)

	claimService := NewClaimService(db, propertyService)
	claimID, err := createTestClaim(t, ctx, claimService, propertyID, testUserID, testOrgID)
	require.NoError(t, err)

	// Step 2: Create meeting service and schedule a meeting
	emailService := NewMockEmailService()
	meetingService := NewMeetingService(db, emailService, claimService)

	meetingInput := CreateMeetingInput{
		MeetingType:    "adjuster_inspection",
		ScheduledDate:  time.Now().AddDate(0, 0, 7).Format("2006-01-02"),
		ScheduledTime:  "10:00:00",
		Location:       "123 Test St, Test City, TS 12345",
		DurationMinutes: intPtr(60),
		AdjusterName:    strPtr("John Adjuster"),
		AdjusterEmail:   strPtr("adjuster@insurance.com"),
		Notes:           strPtr("Initial inspection meeting"),
	}

	meetingID, err := meetingService.CreateMeeting(ctx, claimID, testUserID, testOrgID, meetingInput)
	require.NoError(t, err)
	assert.NotEmpty(t, meetingID)

	// Verify meeting was created
	meeting, err := meetingService.GetMeeting(ctx, meetingID, testOrgID)
	require.NoError(t, err)
	assert.NotNil(t, meeting)
	assert.Equal(t, "adjuster_inspection", meeting.MeetingType)
	assert.Equal(t, models.MeetingStatusScheduled, meeting.Status)

	// Step 3: Complete the meeting
	completeInput := CompleteMeetingInput{
		OutcomeSummary: "Meeting completed successfully. Adjuster reviewed all damages. Estimate to follow.",
	}
	err = meetingService.CompleteMeeting(ctx, meetingID, testUserID, testOrgID, completeInput)
	require.NoError(t, err)

	// Verify meeting status
	meeting, err = meetingService.GetMeeting(ctx, meetingID, testOrgID)
	require.NoError(t, err)
	assert.Equal(t, models.MeetingStatusCompleted, meeting.Status)
	assert.NotNil(t, meeting.CompletedAt)
	assert.Equal(t, completeInput.OutcomeSummary, *meeting.OutcomeSummary)

	// Step 4: Create payment service and record expected ACV payment
	paymentService := NewPaymentService(db, claimService)

	acvInput := CreateExpectedPaymentInput{
		PaymentType:    models.PaymentTypeACV,
		ExpectedAmount: 50000.00,
		Notes:          strPtr("Expected ACV payment from carrier"),
	}
	acvPaymentID, err := paymentService.CreateExpectedPayment(ctx, claimID, testUserID, testOrgID, acvInput)
	require.NoError(t, err)
	assert.NotEmpty(t, acvPaymentID)

	// Step 5: Record ACV payment received
	acvReceivedInput := RecordPaymentReceivedInput{
		Amount:       50000.00,
		CheckNumber:  strPtr("CHK-12345"),
		ReceivedDate: time.Now().Format("2006-01-02"),
		Notes:        strPtr("ACV payment received"),
	}
	err = paymentService.RecordPaymentReceived(ctx, acvPaymentID, testUserID, testOrgID, acvReceivedInput)
	require.NoError(t, err)

	// Step 6: Reconcile ACV payment
	err = paymentService.ReconcilePayment(ctx, acvPaymentID, testUserID, testOrgID)
	require.NoError(t, err)

	// Verify ACV payment status
	payments, err := paymentService.GetPaymentsByClaimID(ctx, claimID, testOrgID)
	require.NoError(t, err)
	assert.Len(t, payments, 1)
	assert.Equal(t, models.PaymentStatusReconciled, payments[0].Status)

	// Step 7: Create expected RCV payment
	rcvInput := CreateExpectedPaymentInput{
		PaymentType:    models.PaymentTypeRCV,
		ExpectedAmount: 20000.00,
		Notes:          strPtr("Expected RCV payment after repairs completed"),
	}
	rcvPaymentID, err := paymentService.CreateExpectedPayment(ctx, claimID, testUserID, testOrgID, rcvInput)
	require.NoError(t, err)

	// Step 8: Record partial RCV payment (to test outstanding balance)
	rcvReceivedInput := RecordPaymentReceivedInput{
		Amount:       15000.00,
		CheckNumber:  strPtr("CHK-67890"),
		ReceivedDate: time.Now().Format("2006-01-02"),
		Notes:        strPtr("Partial RCV payment received"),
	}
	err = paymentService.RecordPaymentReceived(ctx, rcvPaymentID, testUserID, testOrgID, rcvReceivedInput)
	require.NoError(t, err)

	// Step 9: Get payment summary
	summary, err := paymentService.GetPaymentSummary(ctx, claimID, testOrgID)
	require.NoError(t, err)
	assert.Equal(t, 50000.00, summary.TotalACVReceived)
	assert.Equal(t, 15000.00, summary.TotalRCVReceived)
	assert.Equal(t, 50000.00, summary.ExpectedACV)
	assert.Equal(t, 20000.00, summary.ExpectedRCV)
	assert.False(t, summary.FullyReconciled) // RCV not yet reconciled
	assert.False(t, summary.HasDisputes)

	// Step 10: Generate RCV demand letter for outstanding balance
	mockLLMClient := &MockLLMClient{
		MockResponse: models.LLMResponse{
			Choices: []models.LLMChoice{
				{
					Message: models.LLMMessage{
						Content: "Dear Insurance Company,\n\nThis letter serves as a formal demand for the outstanding RCV payment...",
					},
				},
			},
			Usage: models.LLMUsage{
				TotalTokens: 500,
			},
		},
	}
	rcvDemandService := NewRCVDemandService(db, mockLLMClient, claimService, paymentService)

	demandLetterID, err := rcvDemandService.GenerateRCVDemandLetter(ctx, claimID, testUserID, testOrgID)
	require.NoError(t, err)
	assert.NotEmpty(t, demandLetterID)

	// Verify demand letter was created
	demandLetter, err := rcvDemandService.GetRCVDemandLetter(ctx, demandLetterID, testOrgID)
	require.NoError(t, err)
	assert.NotNil(t, demandLetter)
	assert.Equal(t, 50000.00, *demandLetter.ACVReceived)
	assert.Equal(t, 20000.00, *demandLetter.RCVExpected)
	assert.Equal(t, 5000.00, *demandLetter.RCVOutstanding) // 20000 - 15000

	// Step 11: Mark demand letter as sent
	markSentInput := MarkAsSentInput{
		SentToEmail: "adjuster@insurance.com",
	}
	err = rcvDemandService.MarkAsSent(ctx, demandLetterID, testUserID, testOrgID, markSentInput)
	require.NoError(t, err)

	// Verify letter marked as sent
	demandLetter, err = rcvDemandService.GetRCVDemandLetter(ctx, demandLetterID, testOrgID)
	require.NoError(t, err)
	assert.NotNil(t, demandLetter.SentAt)
	assert.Equal(t, markSentInput.SentToEmail, *demandLetter.SentToEmail)

	// Step 12: Check claim closure status (should not be ready yet - RCV outstanding)
	closureStatus, err := paymentService.CheckClaimReadyForClosure(ctx, claimID, testOrgID)
	require.NoError(t, err)
	assert.False(t, closureStatus.CanClose)
	assert.Contains(t, closureStatus.BlockingReason, "RCV payment pending")
	assert.True(t, closureStatus.ACVReceived)
	assert.False(t, closureStatus.RCVReceived)

	// Step 13: Complete RCV payment
	remainingRCVInput := RecordPaymentReceivedInput{
		Amount:       5000.00,
		CheckNumber:  strPtr("CHK-99999"),
		ReceivedDate: time.Now().Format("2006-01-02"),
		Notes:        strPtr("Final RCV payment received"),
	}

	// Create new expected payment for remaining balance
	finalRCVInput := CreateExpectedPaymentInput{
		PaymentType:    models.PaymentTypeRCV,
		ExpectedAmount: 5000.00,
		Notes:          strPtr("Final RCV payment expected"),
	}
	finalRCVPaymentID, err := paymentService.CreateExpectedPayment(ctx, claimID, testUserID, testOrgID, finalRCVInput)
	require.NoError(t, err)

	err = paymentService.RecordPaymentReceived(ctx, finalRCVPaymentID, testUserID, testOrgID, remainingRCVInput)
	require.NoError(t, err)

	// Reconcile all payments
	err = paymentService.ReconcilePayment(ctx, rcvPaymentID, testUserID, testOrgID)
	require.NoError(t, err)
	err = paymentService.ReconcilePayment(ctx, finalRCVPaymentID, testUserID, testOrgID)
	require.NoError(t, err)

	// Step 14: Check claim closure status again (should be ready now)
	closureStatus, err = paymentService.CheckClaimReadyForClosure(ctx, claimID, testOrgID)
	require.NoError(t, err)
	assert.True(t, closureStatus.CanClose)
	assert.Empty(t, closureStatus.BlockingReason)
	assert.True(t, closureStatus.ACVReceived)
	assert.True(t, closureStatus.RCVReceived)
	assert.True(t, closureStatus.AllReconciled)
}

// TestMeetingCancellation tests meeting cancellation workflow
func TestMeetingCancellation(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test in short mode")
	}

	db, err := setupTestDB(t)
	require.NoError(t, err)
	defer cleanupTestDB(t, db)

	ctx := context.Background()
	testOrgID := "test-org-" + time.Now().Format("20060102150405")
	testUserID := "test-user-" + time.Now().Format("20060102150405")

	// Setup
	propertyService := NewPropertyService(db)
	propertyID, err := createTestProperty(t, ctx, propertyService, testUserID, testOrgID)
	require.NoError(t, err)

	claimService := NewClaimService(db, propertyService)
	claimID, err := createTestClaim(t, ctx, claimService, propertyID, testUserID, testOrgID)
	require.NoError(t, err)

	emailService := NewMockEmailService()
	meetingService := NewMeetingService(db, emailService, claimService)

	// Create meeting
	meetingInput := CreateMeetingInput{
		MeetingType:   "adjuster_inspection",
		ScheduledDate: time.Now().AddDate(0, 0, 7).Format("2006-01-02"),
		ScheduledTime: "10:00:00",
		Location:      "123 Test St",
	}

	meetingID, err := meetingService.CreateMeeting(ctx, claimID, testUserID, testOrgID, meetingInput)
	require.NoError(t, err)

	// Cancel meeting
	cancelInput := CancelMeetingInput{
		CancellationReason: "Adjuster requested reschedule",
	}
	err = meetingService.CancelMeeting(ctx, meetingID, testUserID, testOrgID, cancelInput)
	require.NoError(t, err)

	// Verify cancellation
	meeting, err := meetingService.GetMeeting(ctx, meetingID, testOrgID)
	require.NoError(t, err)
	assert.Equal(t, models.MeetingStatusCancelled, meeting.Status)
	assert.NotNil(t, meeting.CancelledAt)
	assert.Equal(t, cancelInput.CancellationReason, *meeting.CancellationReason)
}

// TestPaymentDispute tests payment dispute workflow
func TestPaymentDispute(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test in short mode")
	}

	db, err := setupTestDB(t)
	require.NoError(t, err)
	defer cleanupTestDB(t, db)

	ctx := context.Background()
	testOrgID := "test-org-" + time.Now().Format("20060102150405")
	testUserID := "test-user-" + time.Now().Format("20060102150405")

	// Setup
	propertyService := NewPropertyService(db)
	propertyID, err := createTestProperty(t, ctx, propertyService, testUserID, testOrgID)
	require.NoError(t, err)

	claimService := NewClaimService(db, propertyService)
	claimID, err := createTestClaim(t, ctx, claimService, propertyID, testUserID, testOrgID)
	require.NoError(t, err)

	paymentService := NewPaymentService(db, claimService)

	// Create expected payment
	input := CreateExpectedPaymentInput{
		PaymentType:    models.PaymentTypeACV,
		ExpectedAmount: 50000.00,
	}
	paymentID, err := paymentService.CreateExpectedPayment(ctx, claimID, testUserID, testOrgID, input)
	require.NoError(t, err)

	// Record payment received (different amount)
	receivedInput := RecordPaymentReceivedInput{
		Amount:       45000.00, // $5000 less than expected
		ReceivedDate: time.Now().Format("2006-01-02"),
	}
	err = paymentService.RecordPaymentReceived(ctx, paymentID, testUserID, testOrgID, receivedInput)
	require.NoError(t, err)

	// Dispute payment
	disputeInput := DisputePaymentInput{
		DisputeReason: "Payment amount is $5000 less than expected ACV",
	}
	err = paymentService.DisputePayment(ctx, paymentID, testUserID, testOrgID, disputeInput)
	require.NoError(t, err)

	// Verify dispute
	payments, err := paymentService.GetPaymentsByClaimID(ctx, claimID, testOrgID)
	require.NoError(t, err)
	assert.Len(t, payments, 1)
	assert.Equal(t, models.PaymentStatusDisputed, payments[0].Status)
	assert.Equal(t, disputeInput.DisputeReason, *payments[0].DisputeReason)

	// Verify summary reflects dispute
	summary, err := paymentService.GetPaymentSummary(ctx, claimID, testOrgID)
	require.NoError(t, err)
	assert.True(t, summary.HasDisputes)
	assert.False(t, summary.FullyReconciled)
}

// Helper functions

func setupTestDB(t *testing.T) (*sql.DB, error) {
	// This would connect to a test database
	// For actual testing, you would use a test database URL
	dbURL := "postgres://user:pass@localhost/claimcoach_test?sslmode=disable"
	return sql.Open("postgres", dbURL)
}

func cleanupTestDB(t *testing.T, db *sql.DB) {
	db.Close()
}

func createTestProperty(t *testing.T, ctx context.Context, service *PropertyService, userID, orgID string) (string, error) {
	// Create a test property
	return "test-property-id", nil // Simplified for test
}

func createTestClaim(t *testing.T, ctx context.Context, service *ClaimService, propertyID, userID, orgID string) (string, error) {
	// Create a test claim
	return "test-claim-id", nil // Simplified for test
}

func strPtr(s string) *string {
	return &s
}

func intPtr(i int) *int {
	return &i
}

// MockLLMClient for testing
type MockLLMClient struct {
	MockResponse models.LLMResponse
	MockError    error
}

func (m *MockLLMClient) Chat(ctx context.Context, messages []models.LLMMessage, temperature float64, maxTokens int) (*models.LLMResponse, error) {
	if m.MockError != nil {
		return nil, m.MockError
	}
	return &m.MockResponse, nil
}
