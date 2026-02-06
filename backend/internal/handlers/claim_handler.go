package handlers

import (
	"net/http"
	"strings"

	"github.com/claimcoach/backend/internal/models"
	"github.com/claimcoach/backend/internal/services"
	"github.com/gin-gonic/gin"
)

type ClaimHandler struct {
	service *services.ClaimService
}

func NewClaimHandler(service *services.ClaimService) *ClaimHandler {
	return &ClaimHandler{service: service}
}

func (h *ClaimHandler) Create(c *gin.Context) {
	user := c.MustGet("user").(models.User)

	var input services.CreateClaimInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "Invalid request: " + err.Error(),
		})
		return
	}

	claim, err := h.service.CreateClaim(input, user.ID, user.OrganizationID)
	if err != nil {
		if err.Error() == "property not found" {
			c.JSON(http.StatusNotFound, gin.H{
				"success": false,
				"error":   "Property not found",
			})
			return
		}
		if err.Error() == "no policy found for this property" {
			c.JSON(http.StatusBadRequest, gin.H{
				"success": false,
				"error":   "No policy found for this property. Please add a policy first.",
			})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to create claim: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"success": true,
		"data":    claim,
	})
}

func (h *ClaimHandler) List(c *gin.Context) {
	user := c.MustGet("user").(models.User)

	// Get optional query parameters
	statusFilter := c.Query("status")
	propertyIDFilter := c.Query("property_id")

	var statusPtr *string
	var propertyIDPtr *string

	if statusFilter != "" {
		statusPtr = &statusFilter
	}

	if propertyIDFilter != "" {
		propertyIDPtr = &propertyIDFilter
	}

	claims, err := h.service.GetClaims(user.OrganizationID, statusPtr, propertyIDPtr)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to get claims: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    claims,
	})
}

func (h *ClaimHandler) Get(c *gin.Context) {
	user := c.MustGet("user").(models.User)
	claimID := c.Param("id")

	claim, err := h.service.GetClaim(claimID, user.OrganizationID)
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
			"error":   "Failed to get claim: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    claim,
	})
}

func (h *ClaimHandler) UpdateStatus(c *gin.Context) {
	user := c.MustGet("user").(models.User)
	claimID := c.Param("id")

	var input services.UpdateClaimStatusInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "Invalid request: " + err.Error(),
		})
		return
	}

	claim, err := h.service.UpdateClaimStatus(claimID, user.OrganizationID, user.ID, input)
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
			"error":   "Failed to update claim status: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    claim,
	})
}

func (h *ClaimHandler) GetActivities(c *gin.Context) {
	user := c.MustGet("user").(models.User)
	claimID := c.Param("id")

	activities, err := h.service.GetClaimActivities(claimID, user.OrganizationID)
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
			"error":   "Failed to get claim activities: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    activities,
	})
}

type UpdateEstimateRequest struct {
	ContractorEstimateTotal float64 `json:"contractor_estimate_total" binding:"required,gt=0"`
}

func (h *ClaimHandler) PatchClaimEstimate(c *gin.Context) {
	// Get claim ID
	claimID := c.Param("id")

	// Get authenticated user
	user, exists := c.Get("user")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	userModel := user.(models.User)

	// Parse request
	var req UpdateEstimateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Update estimate
	claim, comparison, err := h.service.UpdateEstimate(
		claimID,
		req.ContractorEstimateTotal,
		userModel.ID,
		userModel.OrganizationID,
	)
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			c.JSON(http.StatusNotFound, gin.H{"error": "Claim not found"})
			return
		}
		if strings.Contains(err.Error(), "unauthorized") {
			c.JSON(http.StatusForbidden, gin.H{"error": "Forbidden"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"claim":      claim,
		"comparison": comparison,
	})
}
