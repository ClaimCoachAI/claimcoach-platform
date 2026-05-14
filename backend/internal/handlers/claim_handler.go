package handlers

import (
	"fmt"
	"log"
	"net/http"
	"strings"

	"github.com/claimcoach/backend/internal/models"
	"github.com/claimcoach/backend/internal/services"
	"github.com/claimcoach/backend/internal/slack"
	"github.com/gin-gonic/gin"
)

type ClaimHandler struct {
	claimService *services.ClaimService
	emailService services.EmailService
	slackSvc     *slack.SlackService
}

func NewClaimHandler(claimService *services.ClaimService, emailService services.EmailService, slackSvc *slack.SlackService) *ClaimHandler {
	return &ClaimHandler{
		claimService: claimService,
		emailService: emailService,
		slackSvc:     slackSvc,
	}
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

	claim, err := h.claimService.CreateClaim(input, user.ID, user.OrganizationID)
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

	claims, err := h.claimService.GetClaims(user.OrganizationID, statusPtr, propertyIDPtr)
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

	claim, err := h.claimService.GetClaim(claimID, user.OrganizationID)
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

	claim, err := h.claimService.UpdateClaimStatus(claimID, user.OrganizationID, user.ID, input)
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

	activities, err := h.claimService.GetClaimActivities(claimID, user.OrganizationID)
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

func (h *ClaimHandler) NotifyClaimCoach(c *gin.Context) {
	user := c.MustGet("user").(models.User)
	claimID := c.Param("id")

	// Get full claim with relationships
	claim, err := h.claimService.GetClaim(claimID, user.OrganizationID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Claim not found"})
		return
	}

	// Build Slack message for the #new-claims channel
	address := claimID
	ownerEntity := ""
	carrierName := ""
	policyNumber := ""
	deductible := 0.0
	lossType := claim.LossType
	incidentDate := claim.IncidentDate.Format("January 2, 2006")

	if claim.Property != nil {
		address = claim.Property.LegalAddress
		ownerEntity = claim.Property.OwnerEntityName
	}
	if claim.Policy != nil {
		carrierName = claim.Policy.CarrierName
		deductible = claim.Policy.DeductibleValue
		if claim.Policy.PolicyNumber != nil {
			policyNumber = *claim.Policy.PolicyNumber
		}
	}

	description := "No description provided"
	if claim.Description != nil && *claim.Description != "" {
		description = *claim.Description
	}

	msg := fmt.Sprintf(
		":bell: *New Claim Submission*\n"+
			"*Property:* %s\n"+
			"*Owner:* %s\n"+
			"*Loss Type:* %s\n"+
			"*Incident Date:* %s\n"+
			"*Carrier:* %s  |  *Policy #:* %s  |  *Deductible:* $%.2f\n"+
			"*Description:* %s",
		address, ownerEntity, lossType, incidentDate,
		carrierName, policyNumber, deductible, description,
	)

	if err := h.slackSvc.PostToChannel("#new-claims", msg); err != nil {
		log.Printf("Failed to notify #new-claims for claim %s: %v", claimID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to notify ClaimCoach team"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true})
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
		c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": "Unauthorized"})
		return
	}
	userModel := user.(models.User)

	// Parse request
	var req UpdateEstimateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
		return
	}

	// Update estimate
	claim, comparison, err := h.claimService.UpdateEstimate(
		claimID,
		req.ContractorEstimateTotal,
		userModel.ID,
		userModel.OrganizationID,
	)
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Claim not found"})
			return
		}
		if strings.Contains(err.Error(), "unauthorized") {
			c.JSON(http.StatusForbidden, gin.H{"success": false, "error": "Forbidden"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"claim":      claim,
			"comparison": comparison,
		},
	})
}

// UpdateClaimStep updates claim step progress
// PATCH /api/claims/:id/step
func (h *ClaimHandler) UpdateClaimStep(c *gin.Context) {
	user := c.MustGet("user").(models.User)
	claimID := c.Param("id")

	var input services.UpdateClaimStepInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "Invalid request: " + err.Error(),
		})
		return
	}

	claim, err := h.claimService.UpdateClaimStep(claimID, user.OrganizationID, input)
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
			"error":   "Failed to update claim step: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    claim,
	})
}

// Delete deletes a claim
// DELETE /api/claims/:id
func (h *ClaimHandler) Delete(c *gin.Context) {
	user := c.MustGet("user").(models.User)
	claimID := c.Param("id")

	err := h.claimService.DeleteClaim(claimID, user.OrganizationID)
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
			"error":   "Failed to delete claim: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Claim deleted successfully",
	})
}
