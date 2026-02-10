package handlers

import (
	"net/http"

	"github.com/claimcoach/backend/internal/services"
	"github.com/gin-gonic/gin"
)

type MortgageBankHandler struct {
	service *services.MortgageBankService
}

func NewMortgageBankHandler(service *services.MortgageBankService) *MortgageBankHandler {
	return &MortgageBankHandler{
		service: service,
	}
}

func (h *MortgageBankHandler) GetAllBanks(c *gin.Context) {
	banks, err := h.service.GetAllBanks()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to retrieve mortgage banks",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    banks,
	})
}
