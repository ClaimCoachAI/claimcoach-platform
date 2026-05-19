package services

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"

	sqlmock "github.com/DATA-DOG/go-sqlmock"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type mockUploader struct {
	uploadedPath string
	uploadedData []byte
	uploadedMime string
	err          error
}

func (m *mockUploader) UploadFile(filePath string, data []byte, mimeType string) error {
	m.uploadedPath = filePath
	m.uploadedData = data
	m.uploadedMime = mimeType
	return m.err
}

func sampleEstimateJSON(t *testing.T) string {
	t.Helper()
	report := estimateReport{
		LineItems: []estimateLineItem{
			{
				XactimateCode: "RFG 300S",
				Description:   "Laminated shingles",
				Quantity:      25,
				Unit:          "SQ",
				UnitCost:      120.00,
				Total:         3000.00,
				Category:      "Roofing",
				Justification: "Full replacement required due to hail impact.",
			},
		},
		Subtotal:       3000.00,
		OverheadProfit: 600.00,
		Total:          3600.00,
	}
	b, err := json.Marshal(report)
	require.NoError(t, err)
	return string(b)
}

func TestPDFReportService_GenerateAndStore_Success(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer db.Close()

	uploader := &mockUploader{}
	svc := NewPDFReportService(db, uploader)

	claimID := "claim-1234"
	orgID := "org-5678"
	userID := "user-9999"
	reportID := "report-abcd"
	address := "123 Main St, Houston, TX 77001"
	estimateJSON := sampleEstimateJSON(t)

	mock.ExpectExec(`INSERT INTO documents`).
		WithArgs(
			sqlmock.AnyArg(),
			claimID,
			userID,
			"audit_report",
			sqlmock.AnyArg(),
			"ClaimCoach Estimate Report.pdf",
			sqlmock.AnyArg(),
			"application/pdf",
			"confirmed",
			sqlmock.AnyArg(),
		).
		WillReturnResult(sqlmock.NewResult(1, 1))

	err = svc.GenerateAndStore(context.Background(), claimID, orgID, userID, reportID, estimateJSON, address)
	assert.NoError(t, err)
	assert.NotEmpty(t, uploader.uploadedPath)
	assert.Contains(t, uploader.uploadedPath, "audit_report")
	assert.Contains(t, uploader.uploadedPath, reportID[:8])
	assert.Equal(t, "application/pdf", uploader.uploadedMime)
	assert.Greater(t, len(uploader.uploadedData), 0)
	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestPDFReportService_GenerateAndStore_InvalidJSON(t *testing.T) {
	db, _, err := sqlmock.New()
	require.NoError(t, err)
	defer db.Close()

	svc := NewPDFReportService(db, &mockUploader{})
	err = svc.GenerateAndStore(context.Background(), "c1", "o1", "u1", "r1", "not-json", "addr")
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "failed to parse estimate JSON")
}

func TestPDFReportService_GenerateAndStore_UploadFails(t *testing.T) {
	db, _, err := sqlmock.New()
	require.NoError(t, err)
	defer db.Close()

	uploader := &mockUploader{err: fmt.Errorf("storage unavailable")}
	svc := NewPDFReportService(db, uploader)
	err = svc.GenerateAndStore(context.Background(), "c1", "o1", "u1", "r1", sampleEstimateJSON(t), "addr")
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "failed to upload PDF")
}

func TestParseEstimateJSON(t *testing.T) {
	input := sampleEstimateJSON(t)
	report, err := parseEstimateJSON(input)
	require.NoError(t, err)
	assert.Equal(t, 1, len(report.LineItems))
	assert.Equal(t, "RFG 300S", report.LineItems[0].XactimateCode)
	assert.Equal(t, "Roofing", report.LineItems[0].Category)
	assert.Equal(t, 3600.00, report.Total)
}
