package handlers

import (
	"errors"
	"net/http"

	"github.com/claimcoach/backend/internal/models"
	"github.com/claimcoach/backend/internal/services"
	"github.com/gin-gonic/gin"
)

type ScopeSheetHandler struct {
	scopeSheetService *services.ScopeSheetService
	magicLinkService  *services.MagicLinkService
	claimService      *services.ClaimService
}

func NewScopeSheetHandler(
	scopeSheetService *services.ScopeSheetService,
	magicLinkService *services.MagicLinkService,
	claimService *services.ClaimService,
) *ScopeSheetHandler {
	return &ScopeSheetHandler{
		scopeSheetService: scopeSheetService,
		magicLinkService:  magicLinkService,
		claimService:      claimService,
	}
}

// CreateViaMagicLink creates a scope sheet using a magic link token (public endpoint, no auth required)
// POST /api/magic-links/:token/scope-sheet
func (h *ScopeSheetHandler) CreateViaMagicLink(c *gin.Context) {
	token := c.Param("token")

	// Bind JSON to CreateScopeSheetInput
	var input services.CreateScopeSheetInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "Invalid request: " + err.Error(),
		})
		return
	}

	// Validate the magic link token
	validationResult, err := h.magicLinkService.ValidateToken(token)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to validate token: " + err.Error(),
		})
		return
	}

	// Check if token is valid
	if !validationResult.Valid {
		status := http.StatusUnauthorized
		errorMessage := "Invalid or expired magic link"

		switch validationResult.Status {
		case "expired":
			errorMessage = "Magic link has expired"
		case "completed":
			errorMessage = "Magic link has already been used"
		case "not_found":
			errorMessage = "Magic link not found"
		}

		c.JSON(status, gin.H{
			"success": false,
			"error":   errorMessage,
		})
		return
	}

	// Create the scope sheet
	scopeSheet, err := h.scopeSheetService.CreateScopeSheet(c.Request.Context(), validationResult.Claim.ID, input)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to create scope sheet: " + err.Error(),
		})
		return
	}

	// Submit the scope sheet (set submitted_at)
	err = h.scopeSheetService.SubmitScopeSheet(c.Request.Context(), scopeSheet.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to submit scope sheet: " + err.Error(),
		})
		return
	}

	// Retrieve the updated scope sheet to return with submitted_at
	scopeSheet, err = h.scopeSheetService.GetScopeSheetByClaimID(c.Request.Context(), validationResult.Claim.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to retrieve scope sheet: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"success": true,
		"data":    scopeSheet,
	})
}

// GetByClaimID retrieves a scope sheet by claim ID (authenticated endpoint)
// GET /api/claims/:id/scope-sheet
func (h *ScopeSheetHandler) GetByClaimID(c *gin.Context) {
	user := c.MustGet("user").(models.User)
	claimID := c.Param("id")

	// Verify the claim belongs to the user's organization
	// GetClaim already checks organization ownership through JOIN with properties table
	_, err := h.claimService.GetClaim(claimID, user.OrganizationID)
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
			"error":   "Failed to verify claim: " + err.Error(),
		})
		return
	}

	// Get the scope sheet
	scopeSheet, err := h.scopeSheetService.GetScopeSheetByClaimID(c.Request.Context(), claimID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to get scope sheet: " + err.Error(),
		})
		return
	}

	// Return 404 if no scope sheet exists
	if scopeSheet == nil {
		c.JSON(http.StatusNotFound, gin.H{
			"success": false,
			"error":   "Scope sheet not found for this claim",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    scopeSheet,
	})
}

// SaveDraft saves or updates a draft scope sheet via magic link (public endpoint, no auth required)
// POST /api/magic-links/:token/scope-sheet/draft
func (h *ScopeSheetHandler) SaveDraft(c *gin.Context) {
	token := c.Param("token")

	// Bind JSON to CreateScopeSheetInput
	var input services.CreateScopeSheetInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "Invalid request: " + err.Error(),
		})
		return
	}

	// Save the draft
	scopeSheet, err := h.scopeSheetService.SaveScopeDraft(c.Request.Context(), token, &input)
	if err != nil {
		// Check for token errors using errors.Is
		if errors.Is(err, services.ErrTokenInvalid) {
			c.JSON(http.StatusUnauthorized, gin.H{
				"success": false,
				"error":   "Invalid or expired magic link",
			})
			return
		}

		// Check for invalid draft step
		if errors.Is(err, services.ErrInvalidDraftStep) {
			c.JSON(http.StatusBadRequest, gin.H{
				"success": false,
				"error":   "draft_step must be between 1 and 10",
			})
			return
		}

		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to save draft: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"success": true,
		"data":    scopeSheet,
	})
}

// GetDraft retrieves the draft scope sheet via magic link (public endpoint, no auth required)
// GET /api/magic-links/:token/scope-sheet/draft
func (h *ScopeSheetHandler) GetDraft(c *gin.Context) {
	token := c.Param("token")

	// Get the draft
	scopeSheet, err := h.scopeSheetService.GetScopeDraft(c.Request.Context(), token)
	if err != nil {
		// Check for token errors using errors.Is
		if errors.Is(err, services.ErrTokenInvalid) {
			c.JSON(http.StatusUnauthorized, gin.H{
				"success": false,
				"error":   "Invalid or expired magic link",
			})
			return
		}

		// Check for draft not found using errors.Is
		if errors.Is(err, services.ErrDraftNotFound) {
			c.JSON(http.StatusNotFound, gin.H{
				"success": false,
				"error":   "No draft exists for this claim",
			})
			return
		}

		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to get draft: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    scopeSheet,
	})
}
