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
	propertyID := c.Param("propertyId")

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
	propertyID := c.Param("propertyId")

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
