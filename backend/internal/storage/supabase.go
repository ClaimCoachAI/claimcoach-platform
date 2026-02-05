package storage

import (
	"fmt"
	"path/filepath"

	"github.com/google/uuid"
	storage_go "github.com/supabase-community/storage-go"
)

const (
	BucketName = "claim-documents"
)

type SupabaseStorage struct {
	client *storage_go.Client
}

func NewSupabaseStorage(url, serviceKey string) (*SupabaseStorage, error) {
	// Create storage client with the storage API URL
	storageURL := fmt.Sprintf("%s/storage/v1", url)
	client := storage_go.NewClient(storageURL, serviceKey, nil)

	return &SupabaseStorage{
		client: client,
	}, nil
}

// GenerateUploadURL creates a presigned URL for uploading a file
func (s *SupabaseStorage) GenerateUploadURL(organizationID, claimID, documentType, fileName string) (string, string, error) {
	// Generate unique file path to prevent collisions
	fileExt := filepath.Ext(fileName)
	fileNameWithoutExt := fileName[:len(fileName)-len(fileExt)]
	uniqueFileName := fmt.Sprintf("%s_%s%s", fileNameWithoutExt, uuid.New().String()[:8], fileExt)

	// Build storage path: organizations/{org-id}/claims/{claim-id}/{document-type}/{filename}
	filePath := fmt.Sprintf("organizations/%s/claims/%s/%s/%s",
		organizationID,
		claimID,
		documentType,
		uniqueFileName,
	)

	// Generate presigned upload URL
	response, err := s.client.CreateSignedUploadUrl(BucketName, filePath)
	if err != nil {
		return "", "", fmt.Errorf("failed to generate upload URL: %w", err)
	}

	return response.Url, filePath, nil
}

// GenerateDownloadURL creates a presigned URL for downloading a file
func (s *SupabaseStorage) GenerateDownloadURL(filePath string) (string, error) {
	// Generate presigned download URL (5 minutes expiry)
	expiresIn := 5 * 60 // 5 minutes in seconds

	response, err := s.client.CreateSignedUrl(BucketName, filePath, expiresIn)
	if err != nil {
		return "", fmt.Errorf("failed to generate download URL: %w", err)
	}

	return response.SignedURL, nil
}

// DeleteFile deletes a file from storage
func (s *SupabaseStorage) DeleteFile(filePath string) error {
	_, err := s.client.RemoveFile(BucketName, []string{filePath})
	if err != nil {
		return fmt.Errorf("failed to delete file: %w", err)
	}
	return nil
}

// GetPublicURL returns the public URL for a file (if bucket is public)
func (s *SupabaseStorage) GetPublicURL(filePath string) string {
	response := s.client.GetPublicUrl(BucketName, filePath)
	return response.SignedURL
}
