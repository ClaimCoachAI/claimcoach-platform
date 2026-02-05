package models

import "time"

type Document struct {
	ID               string    `json:"id" db:"id"`
	ClaimID          string    `json:"claim_id" db:"claim_id"`
	UploadedByUserID *string   `json:"uploaded_by_user_id" db:"uploaded_by_user_id"`
	DocumentType     string    `json:"document_type" db:"document_type"`
	FileURL          string    `json:"file_url" db:"file_url"`
	FileName         string    `json:"file_name" db:"file_name"`
	FileSizeBytes    int64     `json:"file_size_bytes" db:"file_size_bytes"`
	MimeType         string    `json:"mime_type" db:"mime_type"`
	Metadata         *string   `json:"metadata,omitempty" db:"metadata"` // JSON string
	Status           string    `json:"status" db:"status"`               // "pending" or "confirmed"
	CreatedAt        time.Time `json:"created_at" db:"created_at"`
}

// DocumentType constants
const (
	DocumentTypePolicyPDF          = "policy_pdf"
	DocumentTypeContractorPhoto    = "contractor_photo"
	DocumentTypeContractorEstimate = "contractor_estimate"
	DocumentTypeCarrierEstimate    = "carrier_estimate"
	DocumentTypeProofOfRepair      = "proof_of_repair"
	DocumentTypeOther              = "other"
)

// FileValidationRule defines validation rules for file uploads
type FileValidationRule struct {
	MaxSizeBytes int64
	MimeTypes    []string
}

// FileValidationRules defines validation rules for each document type
var FileValidationRules = map[string]FileValidationRule{
	DocumentTypeContractorPhoto: {
		MaxSizeBytes: 50 * 1024 * 1024, // 50MB
		MimeTypes:    []string{"image/jpeg", "image/png", "image/heic"},
	},
	DocumentTypeContractorEstimate: {
		MaxSizeBytes: 25 * 1024 * 1024, // 25MB
		MimeTypes:    []string{"application/pdf"},
	},
	DocumentTypeCarrierEstimate: {
		MaxSizeBytes: 25 * 1024 * 1024, // 25MB
		MimeTypes:    []string{"application/pdf"},
	},
	DocumentTypePolicyPDF: {
		MaxSizeBytes: 25 * 1024 * 1024, // 25MB
		MimeTypes:    []string{"application/pdf"},
	},
	DocumentTypeProofOfRepair: {
		MaxSizeBytes: 50 * 1024 * 1024, // 50MB
		MimeTypes:    []string{"image/jpeg", "image/png", "image/heic", "application/pdf"},
	},
	DocumentTypeOther: {
		MaxSizeBytes: 25 * 1024 * 1024, // 25MB
		MimeTypes:    []string{"image/jpeg", "image/png", "image/heic", "application/pdf"},
	},
}

// ValidDocumentTypes is a list of all valid document types
var ValidDocumentTypes = []string{
	DocumentTypePolicyPDF,
	DocumentTypeContractorPhoto,
	DocumentTypeContractorEstimate,
	DocumentTypeCarrierEstimate,
	DocumentTypeProofOfRepair,
	DocumentTypeOther,
}

// IsValidDocumentType checks if a document type is valid
func IsValidDocumentType(docType string) bool {
	for _, validType := range ValidDocumentTypes {
		if docType == validType {
			return true
		}
	}
	return false
}

// ValidateFile validates a file against its document type rules
func ValidateFile(docType string, fileSize int64, mimeType string) error {
	rule, exists := FileValidationRules[docType]
	if !exists {
		return ErrInvalidDocumentType
	}

	if fileSize > rule.MaxSizeBytes {
		return ErrFileTooLarge
	}

	validMime := false
	for _, mt := range rule.MimeTypes {
		if mt == mimeType {
			validMime = true
			break
		}
	}

	if !validMime {
		return ErrInvalidMimeType
	}

	return nil
}

// Custom errors
type DocumentError string

func (e DocumentError) Error() string {
	return string(e)
}

const (
	ErrInvalidDocumentType = DocumentError("invalid document type")
	ErrFileTooLarge        = DocumentError("file size exceeds maximum allowed")
	ErrInvalidMimeType     = DocumentError("file type not allowed for this document type")
)
