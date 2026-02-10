package handlers

import (
	"context"
	"net/http"

	"github.com/claimcoach/backend/internal/models"
	"github.com/claimcoach/backend/internal/services"
	"github.com/gin-gonic/gin"
)

// MeetingServiceInterface defines the interface for meeting operations
type MeetingServiceInterface interface {
	CreateMeeting(ctx context.Context, claimID, userID, orgID string, input services.CreateMeetingInput) (string, error)
	GetMeeting(ctx context.Context, meetingID, orgID string) (*models.Meeting, error)
	ListMeetingsByClaimID(ctx context.Context, claimID, orgID string) ([]models.Meeting, error)
	UpdateMeetingStatus(ctx context.Context, meetingID, userID, orgID, status string) error
	CompleteMeeting(ctx context.Context, meetingID, userID, orgID string, input services.CompleteMeetingInput) error
	CancelMeeting(ctx context.Context, meetingID, userID, orgID string, input services.CancelMeetingInput) error
	AssignRepresentative(ctx context.Context, meetingID, userID, orgID string, representativeID string) error
}

type MeetingHandler struct {
	service MeetingServiceInterface
}

func NewMeetingHandler(service MeetingServiceInterface) *MeetingHandler {
	return &MeetingHandler{service: service}
}

// CreateMeeting creates a new meeting for a claim
// POST /api/claims/:id/meetings
func (h *MeetingHandler) CreateMeeting(c *gin.Context) {
	user := c.MustGet("user").(models.User)
	claimID := c.Param("id")

	var input services.CreateMeetingInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "Invalid request body: " + err.Error(),
		})
		return
	}

	meetingID, err := h.service.CreateMeeting(c.Request.Context(), claimID, user.ID, user.OrganizationID, input)
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
			"error":   "Failed to create meeting: " + err.Error(),
		})
		return
	}

	// Get the meeting to return in response
	meeting, err := h.service.GetMeeting(c.Request.Context(), meetingID, user.OrganizationID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to retrieve meeting: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    meeting,
	})
}

// ListMeetingsByClaimID retrieves all meetings for a claim
// GET /api/claims/:id/meetings
func (h *MeetingHandler) ListMeetingsByClaimID(c *gin.Context) {
	user := c.MustGet("user").(models.User)
	claimID := c.Param("id")

	meetings, err := h.service.ListMeetingsByClaimID(c.Request.Context(), claimID, user.OrganizationID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to list meetings: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    meetings,
	})
}

// GetMeeting retrieves a meeting by ID
// GET /api/meetings/:id
func (h *MeetingHandler) GetMeeting(c *gin.Context) {
	user := c.MustGet("user").(models.User)
	meetingID := c.Param("id")

	meeting, err := h.service.GetMeeting(c.Request.Context(), meetingID, user.OrganizationID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to get meeting: " + err.Error(),
		})
		return
	}

	if meeting == nil {
		c.JSON(http.StatusNotFound, gin.H{
			"success": false,
			"error":   "Meeting not found",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    meeting,
	})
}

// UpdateMeetingStatus updates a meeting's status
// PATCH /api/meetings/:id/status
func (h *MeetingHandler) UpdateMeetingStatus(c *gin.Context) {
	user := c.MustGet("user").(models.User)
	meetingID := c.Param("id")

	var input services.UpdateMeetingStatusInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "Invalid request body: " + err.Error(),
		})
		return
	}

	err := h.service.UpdateMeetingStatus(c.Request.Context(), meetingID, user.ID, user.OrganizationID, input.Status)
	if err != nil {
		if err.Error() == "meeting not found" {
			c.JSON(http.StatusNotFound, gin.H{
				"success": false,
				"error":   "Meeting not found",
			})
			return
		}

		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "Failed to update meeting status: " + err.Error(),
		})
		return
	}

	// Get the updated meeting
	meeting, _ := h.service.GetMeeting(c.Request.Context(), meetingID, user.OrganizationID)

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    meeting,
	})
}

// CompleteMeeting marks a meeting as completed with outcome
// PATCH /api/meetings/:id/complete
func (h *MeetingHandler) CompleteMeeting(c *gin.Context) {
	user := c.MustGet("user").(models.User)
	meetingID := c.Param("id")

	var input services.CompleteMeetingInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "Invalid request body: " + err.Error(),
		})
		return
	}

	err := h.service.CompleteMeeting(c.Request.Context(), meetingID, user.ID, user.OrganizationID, input)
	if err != nil {
		if err.Error() == "meeting not found" {
			c.JSON(http.StatusNotFound, gin.H{
				"success": false,
				"error":   "Meeting not found",
			})
			return
		}
		if err.Error() == "meeting already completed" {
			c.JSON(http.StatusBadRequest, gin.H{
				"success": false,
				"error":   "Meeting already completed",
			})
			return
		}

		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to complete meeting: " + err.Error(),
		})
		return
	}

	// Get the updated meeting
	meeting, _ := h.service.GetMeeting(c.Request.Context(), meetingID, user.OrganizationID)

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    meeting,
		"message": "Meeting completed successfully",
	})
}

// CancelMeeting cancels a meeting with reason
// PATCH /api/meetings/:id/cancel
func (h *MeetingHandler) CancelMeeting(c *gin.Context) {
	user := c.MustGet("user").(models.User)
	meetingID := c.Param("id")

	var input services.CancelMeetingInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "Invalid request body: " + err.Error(),
		})
		return
	}

	err := h.service.CancelMeeting(c.Request.Context(), meetingID, user.ID, user.OrganizationID, input)
	if err != nil {
		if err.Error() == "meeting not found" {
			c.JSON(http.StatusNotFound, gin.H{
				"success": false,
				"error":   "Meeting not found",
			})
			return
		}
		if err.Error() == "meeting already cancelled" {
			c.JSON(http.StatusBadRequest, gin.H{
				"success": false,
				"error":   "Meeting already cancelled",
			})
			return
		}

		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to cancel meeting: " + err.Error(),
		})
		return
	}

	// Get the updated meeting
	meeting, _ := h.service.GetMeeting(c.Request.Context(), meetingID, user.OrganizationID)

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    meeting,
		"message": "Meeting cancelled successfully",
	})
}

// AssignRepresentative assigns a representative to a meeting
// PATCH /api/meetings/:id/assign
func (h *MeetingHandler) AssignRepresentative(c *gin.Context) {
	user := c.MustGet("user").(models.User)
	meetingID := c.Param("id")

	var input services.AssignRepresentativeInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "Invalid request body: " + err.Error(),
		})
		return
	}

	err := h.service.AssignRepresentative(c.Request.Context(), meetingID, user.ID, user.OrganizationID, input.RepresentativeID)
	if err != nil {
		if err.Error() == "meeting not found" {
			c.JSON(http.StatusNotFound, gin.H{
				"success": false,
				"error":   "Meeting not found",
			})
			return
		}

		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to assign representative: " + err.Error(),
		})
		return
	}

	// Get the updated meeting
	meeting, _ := h.service.GetMeeting(c.Request.Context(), meetingID, user.OrganizationID)

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    meeting,
		"message": "Representative assigned successfully",
	})
}
