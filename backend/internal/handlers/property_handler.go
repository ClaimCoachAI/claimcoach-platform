package handlers

import (
	"net/http"

	"github.com/claimcoach/backend/internal/models"
	"github.com/claimcoach/backend/internal/services"
	"github.com/gin-gonic/gin"
)

type PropertyHandler struct {
	service *services.PropertyService
}

func NewPropertyHandler(service *services.PropertyService) *PropertyHandler {
	return &PropertyHandler{service: service}
}

func (h *PropertyHandler) Create(c *gin.Context) {
	user := c.MustGet("user").(models.User)

	var input services.CreatePropertyInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "Invalid request: " + err.Error(),
		})
		return
	}

	property, err := h.service.CreateProperty(input, user.OrganizationID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to create property: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"success": true,
		"data":    property,
	})
}

func (h *PropertyHandler) List(c *gin.Context) {
	user := c.MustGet("user").(models.User)

	properties, err := h.service.GetProperties(user.OrganizationID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to get properties: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    properties,
	})
}

func (h *PropertyHandler) Get(c *gin.Context) {
	user := c.MustGet("user").(models.User)
	propertyID := c.Param("id")

	property, err := h.service.GetProperty(propertyID, user.OrganizationID)
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
			"error":   "Failed to get property: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    property,
	})
}

func (h *PropertyHandler) Update(c *gin.Context) {
	user := c.MustGet("user").(models.User)
	propertyID := c.Param("id")

	var input services.UpdatePropertyInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "Invalid request: " + err.Error(),
		})
		return
	}

	property, err := h.service.UpdateProperty(propertyID, user.OrganizationID, input)
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
			"error":   "Failed to update property: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    property,
	})
}
