package services

import (
	"context"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/claimcoach/backend/internal/models"
	"github.com/claimcoach/backend/internal/storage"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCarrierEstimateService_CreateCarrierEstimate(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer db.Close()

	// Mock storage client (will be nil for this test since we don't test storage)
	var storageClient *storage.SupabaseStorage = nil
	claimService := NewClaimService(db, NewPropertyService(db))
	service := NewCarrierEstimateService(db, storageClient, claimService)

	ctx := context.Background()
	claimID := "claim-123"
	userID := "user-123"
	filePath := "organizations/org-123/claims/claim-123/carrier-estimate/estimate.pdf"
	fileName := "estimate.pdf"
	fileSize := int64(1024)

	now := time.Now()

	// Mock the INSERT query
	mock.ExpectQuery(`INSERT INTO carrier_estimates`).
		WithArgs(
			sqlmock.AnyArg(), // id (UUID)
			claimID,
			userID,
			filePath,
			fileName,
			fileSize,
			models.ParseStatusPending,
			sqlmock.AnyArg(), // uploaded_at
		).
		WillReturnRows(sqlmock.NewRows([]string{"id", "claim_id", "uploaded_by_user_id", "file_path", "file_name", "file_size_bytes", "parse_status", "uploaded_at"}).
			AddRow("estimate-123", claimID, userID, filePath, fileName, fileSize, models.ParseStatusPending, now))

	estimate, err := service.CreateCarrierEstimate(ctx, claimID, userID, filePath, fileName, fileSize)

	require.NoError(t, err)
	assert.NotNil(t, estimate)
	assert.Equal(t, "estimate-123", estimate.ID)
	assert.Equal(t, claimID, estimate.ClaimID)
	assert.Equal(t, userID, estimate.UploadedByUserID)
	assert.Equal(t, filePath, estimate.FilePath)
	assert.Equal(t, fileName, estimate.FileName)
	assert.Equal(t, models.ParseStatusPending, estimate.ParseStatus)
	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestCarrierEstimateService_GetCarrierEstimatesByClaimID(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer db.Close()

	var storageClient *storage.SupabaseStorage = nil
	claimService := NewClaimService(db, NewPropertyService(db))
	service := NewCarrierEstimateService(db, storageClient, claimService)

	ctx := context.Background()
	claimID := "claim-123"
	organizationID := "org-123"
	propertyID := "property-123"
	policyID := "policy-123"

	now := time.Now()
	parsedAt := now.Add(1 * time.Hour)

	// Mock claim ownership verification
	mock.ExpectQuery(`SELECT c.id, c.property_id, c.policy_id, c.claim_number, c.loss_type, c.incident_date, c.status, c.filed_at, c.assigned_user_id, c.adjuster_name, c.adjuster_phone, c.meeting_datetime, c.created_by_user_id, c.created_at, c.updated_at FROM claims c INNER JOIN properties p ON c.property_id = p.id WHERE c.id = \$1 AND p.organization_id = \$2`).
		WithArgs(claimID, organizationID).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "property_id", "policy_id", "claim_number", "loss_type", "incident_date",
			"status", "filed_at", "assigned_user_id", "adjuster_name", "adjuster_phone",
			"meeting_datetime", "created_by_user_id", "created_at", "updated_at",
		}).AddRow(claimID, propertyID, policyID, "CLAIM-001", "water", now,
			"draft", nil, nil, nil, nil, nil, "user-1", now, now))

	// Mock the SELECT query for carrier estimates
	rows := sqlmock.NewRows([]string{
		"id", "claim_id", "uploaded_by_user_id", "file_path", "file_name",
		"file_size_bytes", "parsed_data", "parse_status", "parse_error",
		"uploaded_at", "parsed_at",
	}).
		AddRow("estimate-1", claimID, "user-1", "path/to/file1.pdf", "file1.pdf",
			1024, nil, models.ParseStatusPending, nil,
			now, nil).
		AddRow("estimate-2", claimID, "user-2", "path/to/file2.pdf", "file2.pdf",
			2048, nil, models.ParseStatusCompleted, nil,
			now.Add(24*time.Hour), &parsedAt)

	mock.ExpectQuery(`SELECT (.+) FROM carrier_estimates WHERE claim_id = \$1 ORDER BY uploaded_at DESC`).
		WithArgs(claimID).
		WillReturnRows(rows)

	estimates, err := service.GetCarrierEstimatesByClaimID(ctx, claimID, organizationID)

	require.NoError(t, err)
	assert.Len(t, estimates, 2)
	assert.Equal(t, "estimate-1", estimates[0].ID)
	assert.Equal(t, models.ParseStatusPending, estimates[0].ParseStatus)
	assert.Equal(t, "estimate-2", estimates[1].ID)
	assert.Equal(t, models.ParseStatusCompleted, estimates[1].ParseStatus)
	assert.NoError(t, mock.ExpectationsWereMet())
}
