package storage

import (
	"fmt"
	"path/filepath"
	"strings"

	"github.com/google/uuid"
	storage_go "github.com/supabase-community/storage-go"
)

const (
	BucketName = "claim-documents"
)

type SupabaseStorage struct {
	client     *storage_go.Client
	baseURL    string
	projectRef string
}

func NewSupabaseStorage(url, serviceKey string) (*SupabaseStorage, error) {
	// Create storage client with the storage API URL
	storageURL := fmt.Sprintf("%s/storage/v1", url)
	client := storage_go.NewClient(storageURL, serviceKey, nil)

	// Extract project ref from URL (e.g., "vhksoorcpbpddhsguluv" from "https://vhksoorcpbpddhsguluv.supabase.co")
	projectRef := ""
	if strings.Contains(url, ".supabase.co") {
		parts := strings.Split(strings.TrimPrefix(url, "https://"), ".")
		if len(parts) > 0 {
			projectRef = parts[0]
		}
	}

	return &SupabaseStorage{
		client:     client,
		baseURL:    url,
		projectRef: projectRef,
	}, nil
}

// GenerateUploadURL creates a presigned URL for uploading a file
func (s *SupabaseStorage) GenerateUploadURL(organizationID, claimID, documentType, fileName string) (string, string, error) {
	// Generate unique file path to prevent collisions
	fileExt := filepath.Ext(fileName)
	baseName := fileName
	if len(fileExt) > 0 {
		baseName = fileName[:len(fileName)-len(fileExt)]
	}
	if baseName == "" {
		baseName = "file"
	}
	uniqueFileName := fmt.Sprintf("%s_%s%s", baseName, uuid.New().String()[:8], fileExt)

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

	// Log the response for debugging
	fmt.Printf("DEBUG: CreateSignedUploadUrl response.Url = %s\n", response.Url)
	fmt.Printf("DEBUG: Full upload URL will be: https://%s.supabase.co/storage/v1%s\n", s.projectRef, response.Url)

	// Construct full URL with proper Storage API path
	// The Go library returns /object/upload/sign/... but we need /storage/v1/object/upload/sign/...
	fullURL := fmt.Sprintf("https://%s.supabase.co/storage/v1%s", s.projectRef, response.Url)

	return fullURL, filePath, nil
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

// GeneratePolicyPDFUploadURL creates a presigned URL for uploading a policy PDF
func (s *SupabaseStorage) GeneratePolicyPDFUploadURL(organizationID, propertyID, fileName string) (string, string, error) {
	// Generate unique file path to prevent collisions
	fileExt := filepath.Ext(fileName)
	baseName := fileName
	if len(fileExt) > 0 {
		baseName = fileName[:len(fileName)-len(fileExt)]
	}
	if baseName == "" {
		baseName = "policy"
	}
	uniqueFileName := fmt.Sprintf("%s_%s%s", baseName, uuid.New().String()[:8], fileExt)

	// Build storage path: organizations/{org-id}/properties/{property-id}/policy/{filename}
	filePath := fmt.Sprintf("organizations/%s/properties/%s/policy/%s",
		organizationID,
		propertyID,
		uniqueFileName,
	)

	// Generate presigned upload URL
	response, err := s.client.CreateSignedUploadUrl(BucketName, filePath)
	if err != nil {
		return "", "", fmt.Errorf("failed to generate upload URL: %w", err)
	}

	return response.Url, filePath, nil
}

// GetPublicURL returns the public URL for a file (if bucket is public)
func (s *SupabaseStorage) GetPublicURL(filePath string) string {
	response := s.client.GetPublicUrl(BucketName, filePath)
	return response.SignedURL
}
