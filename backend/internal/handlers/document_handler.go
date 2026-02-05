package handlers

import (
	"net/http"

	"github.com/claimcoach/backend/internal/models"
	"github.com/claimcoach/backend/internal/services"
	"github.com/gin-gonic/gin"
)

type DocumentHandler struct {
	service *services.DocumentService
}

func NewDocumentHandler(service *services.DocumentService) *DocumentHandler {
	return &DocumentHandler{service: service}
}

// RequestUploadURL generates a presigned upload URL
// POST /api/claims/:id/documents/upload-url
func (h *DocumentHandler) RequestUploadURL(c *gin.Context) {
	user := c.MustGet("user").(models.User)
	claimID := c.Param("id")

	var input services.RequestUploadURLInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "Invalid request: " + err.Error(),
		})
		return
	}

	response, err := h.service.RequestUploadURL(claimID, user.OrganizationID, user.ID, input)
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

		if err.Error() == "claim not found" {
			c.JSON(http.StatusNotFound, gin.H{
				"success": false,
				"error":   "Claim not found",
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

// ConfirmUpload confirms that a file has been uploaded
// POST /api/claims/:id/documents/:documentId/confirm
func (h *DocumentHandler) ConfirmUpload(c *gin.Context) {
	user := c.MustGet("user").(models.User)
	claimID := c.Param("id")
	documentID := c.Param("documentId")

	document, err := h.service.ConfirmUpload(claimID, documentID, user.OrganizationID, user.ID)
	if err != nil {
		if err.Error() == "claim not found" {
			c.JSON(http.StatusNotFound, gin.H{
				"success": false,
				"error":   "Claim not found",
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

// ListDocuments lists all documents for a claim
// GET /api/claims/:id/documents
func (h *DocumentHandler) ListDocuments(c *gin.Context) {
	user := c.MustGet("user").(models.User)
	claimID := c.Param("id")

	documents, err := h.service.ListDocuments(claimID, user.OrganizationID)
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
			"error":   "Failed to list documents: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    documents,
	})
}

// GetDocument retrieves a document and generates a download URL
// GET /api/documents/:id
func (h *DocumentHandler) GetDocument(c *gin.Context) {
	user := c.MustGet("user").(models.User)
	documentID := c.Param("id")

	document, downloadURL, err := h.service.GetDocument(documentID, user.OrganizationID)
	if err != nil {
		if err.Error() == "document not found" {
			c.JSON(http.StatusNotFound, gin.H{
				"success": false,
				"error":   "Document not found",
			})
			return
		}

		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to get document: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"document":     document,
			"download_url": downloadURL,
		},
	})
}
