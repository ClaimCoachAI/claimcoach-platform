package handlers

import (
	"database/sql"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"github.com/claimcoach/backend/internal/models"
	"github.com/claimcoach/backend/internal/services"
	"github.com/claimcoach/backend/internal/storage"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type ClaimMediaHandler struct {
	claimService *services.ClaimService
	db           *sql.DB
	storage      *storage.SupabaseStorage
}

func NewClaimMediaHandler(
	claimService *services.ClaimService,
	_ *services.InspectionService, // kept for router compat, unused
	db *sql.DB,
	storage *storage.SupabaseStorage,
) *ClaimMediaHandler {
	return &ClaimMediaHandler{
		claimService: claimService,
		db:           db,
		storage:      storage,
	}
}

type mediaItem struct {
	URL     string `json:"url"`
	Caption string `json:"caption"`
}

// GetMedia handles GET /api/claims/:id/media
func (h *ClaimMediaHandler) GetMedia(c *gin.Context) {
	claimID := c.Param("id")
	user := c.MustGet("user").(models.User)

	if _, err := h.claimService.GetClaim(claimID, user.OrganizationID); err != nil {
		if err.Error() == "claim not found" {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Claim not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to get claim: " + err.Error()})
		return
	}

	rows, err := h.db.QueryContext(c.Request.Context(),
		`SELECT file_path, file_name, caption FROM claim_photos WHERE claim_id = $1 ORDER BY uploaded_at ASC`,
		claimID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "failed to query photos"})
		return
	}
	defer rows.Close()

	items := []mediaItem{}
	for rows.Next() {
		var filePath, fileName, caption string
		if err := rows.Scan(&filePath, &fileName, &caption); err != nil {
			continue
		}
		cap := caption
		if cap == "" {
			cap = fileName
		}
		items = append(items, mediaItem{URL: h.storage.GetPublicURL(filePath), Caption: cap})
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": items})
}

type requestPhotoUploadURLInput struct {
	FileName string `json:"file_name" binding:"required"`
	FileSize int64  `json:"file_size"`
	MimeType string `json:"mime_type"`
}

// RequestPhotoUploadURL handles POST /api/claims/:id/media/upload-url
func (h *ClaimMediaHandler) RequestPhotoUploadURL(c *gin.Context) {
	claimID := c.Param("id")
	user := c.MustGet("user").(models.User)

	if _, err := h.claimService.GetClaim(claimID, user.OrganizationID); err != nil {
		if err.Error() == "claim not found" {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Claim not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": err.Error()})
		return
	}

	var input requestPhotoUploadURLInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid request: " + err.Error()})
		return
	}

	ext := strings.ToLower(filepath.Ext(input.FileName))
	allowed := map[string]bool{".jpg": true, ".jpeg": true, ".png": true, ".heic": true, ".webp": true}
	if !allowed[ext] {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Only image files are allowed (jpg, png, heic, webp)"})
		return
	}

	uploadURL, filePath, err := h.storage.GenerateUploadURL(user.OrganizationID, claimID, "claim-photos", input.FileName)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to generate upload URL: " + err.Error()})
		return
	}

	photoID := uuid.New().String()
	_, err = h.db.ExecContext(c.Request.Context(),
		`INSERT INTO claim_photos (id, claim_id, uploaded_by_user_id, file_path, file_name, uploaded_at)
		 VALUES ($1, $2, $3, $4, $5, $6)`,
		photoID, claimID, user.ID, filePath, input.FileName, time.Now().UTC(),
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to reserve photo record: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{
		"upload_url": uploadURL,
		"photo_id":   photoID,
	}})
}

type confirmPhotoUploadInput struct {
	PhotoID string `json:"photo_id" binding:"required"`
	Caption string `json:"caption"`
}

// ConfirmPhotoUpload handles POST /api/claims/:id/media
func (h *ClaimMediaHandler) ConfirmPhotoUpload(c *gin.Context) {
	claimID := c.Param("id")
	user := c.MustGet("user").(models.User)

	if _, err := h.claimService.GetClaim(claimID, user.OrganizationID); err != nil {
		if err.Error() == "claim not found" {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Claim not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": err.Error()})
		return
	}

	var input confirmPhotoUploadInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid request: " + err.Error()})
		return
	}

	res, err := h.db.ExecContext(c.Request.Context(),
		`UPDATE claim_photos SET caption = $1 WHERE id = $2 AND claim_id = $3`,
		input.Caption, input.PhotoID, claimID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to confirm photo: " + err.Error()})
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Photo not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"photo_id": input.PhotoID}})
}
