package handlers

import (
	"net/http"

	"github.com/claimcoach/backend/internal/models"
	"github.com/claimcoach/backend/internal/services"
	"github.com/gin-gonic/gin"
)

type PolicyHandler struct {
	service *services.PolicyService
}

func NewPolicyHandler(service *services.PolicyService) *PolicyHandler {
	return &PolicyHandler{service: service}
}

func (h *PolicyHandler) Create(c *gin.Context) {
	user := c.MustGet("user").(models.User)
	propertyID := c.Param("id")

	var input services.UpsertPolicyInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "Invalid request: " + err.Error(),
		})
		return
	}

	policy, err := h.service.UpsertPolicy(input, propertyID, user.OrganizationID)
	if err != nil {
		if err.Error() == "property not found" {
			c.JSON(http.StatusNotFound, gin.H{
				"success": false,
				"error":   "Property not found",
			})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to create/update policy: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    policy,
	})
}

func (h *PolicyHandler) Get(c *gin.Context) {
	user := c.MustGet("user").(models.User)
	propertyID := c.Param("id")

	policy, err := h.service.GetPolicy(propertyID, user.OrganizationID)
	if err != nil {
		if err.Error() == "property not found" {
			c.JSON(http.StatusNotFound, gin.H{
				"success": false,
				"error":   "Property not found",
			})
			return
		}
		if err.Error() == "policy not found" {
			c.JSON(http.StatusNotFound, gin.H{
				"success": false,
				"error":   "Policy not found",
			})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to get policy: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    policy,
	})
}

func (h *PolicyHandler) Delete(c *gin.Context) {
	user := c.MustGet("user").(models.User)
	propertyID := c.Param("id")

	err := h.service.DeletePolicy(propertyID, user.OrganizationID)
	if err != nil {
		if err.Error() == "property not found" {
			c.JSON(http.StatusNotFound, gin.H{
				"success": false,
				"error":   "Property not found",
			})
			return
		}
		if err.Error() == "policy not found" {
			c.JSON(http.StatusNotFound, gin.H{
				"success": false,
				"error":   "Policy not found",
			})
			return
		}
		if err.Error() == "cannot delete policy with existing claims" {
			c.JSON(http.StatusBadRequest, gin.H{
				"success": false,
				"error":   "Cannot delete policy with existing claims. Please delete or reassign claims first.",
			})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to delete policy: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Policy deleted successfully",
	})
}

// RequestPDFUploadURL generates a presigned upload URL for policy PDF
// POST /api/properties/:id/policy/pdf/upload-url
func (h *PolicyHandler) RequestPDFUploadURL(c *gin.Context) {
	user := c.MustGet("user").(models.User)
	propertyID := c.Param("id")

	var input services.RequestPolicyPDFUploadInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "Invalid request: " + err.Error(),
		})
		return
	}

	response, err := h.service.RequestPDFUploadURL(propertyID, user.OrganizationID, input)
	if err != nil {
		if err.Error() == "property not found" {
			c.JSON(http.StatusNotFound, gin.H{
				"success": false,
				"error":   "Property not found",
			})
			return
		}
		if err.Error() == "policy not found" {
			c.JSON(http.StatusNotFound, gin.H{
				"success": false,
				"error":   "Policy not found",
			})
			return
		}
		if err.Error() == "file too large" {
			c.JSON(http.StatusBadRequest, gin.H{
				"success": false,
				"error":   "File size exceeds maximum allowed (10MB)",
			})
			return
		}
		if err.Error() == "invalid mime type" {
			c.JSON(http.StatusBadRequest, gin.H{
				"success": false,
				"error":   "Only PDF files are allowed",
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

// GetPDFDownloadURL returns a signed download URL for the policy PDF
// GET /api/properties/:id/policy/pdf/url
func (h *PolicyHandler) GetPDFDownloadURL(c *gin.Context) {
	user := c.MustGet("user").(models.User)
	propertyID := c.Param("id")

	url, err := h.service.GetPDFDownloadURL(propertyID, user.OrganizationID)
	if err != nil {
		if err.Error() == "policy not found" || err.Error() == "no PDF uploaded for this policy" {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to generate download URL: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"url": url}})
}

// ConfirmPDFUpload confirms that a policy PDF has been uploaded
// POST /api/properties/:id/policy/pdf/confirm
func (h *PolicyHandler) ConfirmPDFUpload(c *gin.Context) {
	user := c.MustGet("user").(models.User)
	propertyID := c.Param("id")

	policy, err := h.service.ConfirmPDFUpload(propertyID, user.OrganizationID)
	if err != nil {
		if err.Error() == "property not found" {
			c.JSON(http.StatusNotFound, gin.H{
				"success": false,
				"error":   "Property not found",
			})
			return
		}
		if err.Error() == "policy not found" {
			c.JSON(http.StatusNotFound, gin.H{
				"success": false,
				"error":   "Policy not found",
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
		"data":    policy,
	})
}
