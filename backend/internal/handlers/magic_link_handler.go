package handlers

import (
	"net/http"

	"github.com/claimcoach/backend/internal/models"
	"github.com/claimcoach/backend/internal/services"
	"github.com/gin-gonic/gin"
)

type MagicLinkHandler struct {
	service *services.MagicLinkService
}

func NewMagicLinkHandler(service *services.MagicLinkService) *MagicLinkHandler {
	return &MagicLinkHandler{service: service}
}

func (h *MagicLinkHandler) GenerateMagicLink(c *gin.Context) {
	user := c.MustGet("user").(models.User)
	claimID := c.Param("id")

	var input services.GenerateMagicLinkInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "Invalid request: " + err.Error(),
		})
		return
	}

	response, err := h.service.GenerateMagicLink(claimID, user.OrganizationID, user.ID, input)
	if err != nil {
		if err.Error() == "claim not found" {
			c.JSON(http.StatusNotFound, gin.H{
				"success": false,
				"error":   "Claim not found",
			})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to generate magic link: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"success": true,
		"data":    response,
	})
}

// ValidateToken validates a magic link token (public endpoint, no auth required)
func (h *MagicLinkHandler) ValidateToken(c *gin.Context) {
	token := c.Param("token")

	result, err := h.service.ValidateToken(token)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to validate token: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    result,
	})
}

// RequestUploadURLInput for contractor uploads
type RequestUploadURLInput struct {
	FileName     string `json:"file_name" binding:"required"`
	FileSize     int64  `json:"file_size" binding:"required"`
	MimeType     string `json:"mime_type" binding:"required"`
	DocumentType string `json:"document_type" binding:"required"`
}

// RequestUploadURL generates a presigned upload URL using magic link token (public endpoint, no auth required)
// POST /api/magic-links/:token/documents/upload-url
func (h *MagicLinkHandler) RequestUploadURL(c *gin.Context) {
	token := c.Param("token")

	var input RequestUploadURLInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "Invalid request: " + err.Error(),
		})
		return
	}

	response, err := h.service.RequestUploadURLWithToken(
		token,
		input.FileName,
		input.FileSize,
		input.MimeType,
		input.DocumentType,
	)
	if err != nil {
		// Handle specific errors
		switch err {
		case models.ErrInvalidDocumentType:
			c.JSON(http.StatusBadRequest, gin.H{
				"success": false,
				"error":   "Invalid document type",
			})
			return
		case models.ErrFileTooLarge:
			c.JSON(http.StatusBadRequest, gin.H{
				"success": false,
				"error":   "File size exceeds maximum allowed",
			})
			return
		case models.ErrInvalidMimeType:
			c.JSON(http.StatusBadRequest, gin.H{
				"success": false,
				"error":   "File type not allowed for this document type",
			})
			return
		}

		// Check for token validation errors
		if err.Error() == "invalid or expired token: expired" ||
			err.Error() == "invalid or expired token: not_found" ||
			err.Error() == "invalid or expired token: completed" {
			c.JSON(http.StatusUnauthorized, gin.H{
				"success": false,
				"error":   "Invalid or expired magic link",
			})
			return
		}

		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to generate upload URL: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    response,
	})
}

// ConfirmUpload confirms that a file has been uploaded using magic link token (public endpoint, no auth required)
// POST /api/magic-links/:token/documents/:documentId/confirm
func (h *MagicLinkHandler) ConfirmUpload(c *gin.Context) {
	token := c.Param("token")
	documentID := c.Param("documentId")

	document, err := h.service.ConfirmUploadWithToken(token, documentID)
	if err != nil {
		// Check for token validation errors
		if err.Error() == "invalid or expired token: expired" ||
			err.Error() == "invalid or expired token: not_found" ||
			err.Error() == "invalid or expired token: completed" {
			c.JSON(http.StatusUnauthorized, gin.H{
				"success": false,
				"error":   "Invalid or expired magic link",
			})
			return
		}

		if err.Error() == "document not found or already confirmed" {
			c.JSON(http.StatusNotFound, gin.H{
				"success": false,
				"error":   "Document not found or already confirmed",
			})
			return
		}

		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to confirm upload: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    document,
	})
}

// GetMagicLinks retrieves all magic links for a claim (protected endpoint)
// GET /api/claims/:id/magic-links
func (h *MagicLinkHandler) GetMagicLinks(c *gin.Context) {
	user := c.MustGet("user").(models.User)
	claimID := c.Param("id")

	magicLinks, err := h.service.GetMagicLinksByClaimID(claimID, user.OrganizationID)
	if err != nil {
		if err.Error() == "claim not found" {
			c.JSON(http.StatusNotFound, gin.H{
				"success": false,
				"error":   "Claim not found",
			})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to retrieve magic links: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    magicLinks,
	})
}
