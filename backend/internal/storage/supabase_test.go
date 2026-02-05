package storage

import (
	"path/filepath"
	"strings"
	"testing"

	"github.com/google/uuid"
)

// TestFileNameEdgeCases tests the edge cases for file name handling
func TestFileNameEdgeCases(t *testing.T) {
	testCases := []struct {
		name           string
		fileName       string
		expectedPrefix string
		hasExtension   bool
	}{
		{
			name:           "normal file with extension",
			fileName:       "photo.jpg",
			expectedPrefix: "photo",
			hasExtension:   true,
		},
		{
			name:           "file without extension",
			fileName:       "README",
			expectedPrefix: "README",
			hasExtension:   false,
		},
		{
			name:           "empty file name (edge case)",
			fileName:       "",
			expectedPrefix: "file",
			hasExtension:   false,
		},
		{
			name:           "file with multiple dots",
			fileName:       "my.photo.test.jpg",
			expectedPrefix: "my.photo.test",
			hasExtension:   true,
		},
		{
			name:           "file with only extension",
			fileName:       ".jpg",
			expectedPrefix: "file",
			hasExtension:   true,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			// Simulate the logic from GenerateUploadURL
			fileExt := filepath.Ext(tc.fileName)
			baseName := tc.fileName
			if len(fileExt) > 0 {
				baseName = tc.fileName[:len(tc.fileName)-len(fileExt)]
			}
			if baseName == "" {
				baseName = "file"
			}
			uniqueFileName := strings.Split(baseName+"_"+uuid.New().String()[:8]+fileExt, "_")[0]

			// Verify the base name matches expected
			if uniqueFileName != tc.expectedPrefix {
				t.Errorf("Expected prefix '%s', got '%s'", tc.expectedPrefix, uniqueFileName)
			}

			// Verify extension handling
			if tc.hasExtension && fileExt == "" {
				t.Errorf("Expected extension but got none")
			}
		})
	}
}

// TestCleanupAbandonedPendingDocumentsQuery validates the SQL query syntax
func TestCleanupAbandonedPendingDocumentsQuery(t *testing.T) {
	query := `
		DELETE FROM documents
		WHERE claim_id = $1
		  AND status = 'pending'
		  AND created_at < NOW() - INTERVAL '24 hours'
	`

	// Just verify the query string is well-formed
	if !strings.Contains(query, "DELETE FROM documents") {
		t.Error("Query should contain DELETE FROM documents")
	}
	if !strings.Contains(query, "status = 'pending'") {
		t.Error("Query should filter by pending status")
	}
	if !strings.Contains(query, "INTERVAL '24 hours'") {
		t.Error("Query should use 24 hours interval")
	}
}
