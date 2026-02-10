package handlers

import (
	"database/sql"
	"log"
	"net/http"

	"github.com/claimcoach/backend/internal/auth"
	"github.com/claimcoach/backend/internal/models"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type AuthHandler struct {
	db       *sql.DB
	supabase *auth.SupabaseClient
}

func NewAuthHandler(db *sql.DB, supabase *auth.SupabaseClient) *AuthHandler {
	return &AuthHandler{
		db:       db,
		supabase: supabase,
	}
}

type CompleteSignupInput struct {
	Token string `json:"token" binding:"required"`
	Name  string `json:"name" binding:"required"`
}

// CompleteSignup creates a user record in the database after Supabase signup
func (h *AuthHandler) CompleteSignup(c *gin.Context) {
	var input CompleteSignupInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   err.Error(),
		})
		return
	}

	// Verify the Supabase token and get user ID
	userID, err := h.supabase.VerifyToken(input.Token)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{
			"success": false,
			"error":   "Invalid token",
		})
		return
	}

	// Get user email from Supabase
	supabaseUser, err := h.supabase.GetUser(input.Token)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to get user info from Supabase",
		})
		return
	}

	// Check if user already exists
	var existingUserID string
	err = h.db.QueryRowContext(c.Request.Context(), `
		SELECT id FROM users WHERE id = $1
	`, userID).Scan(&existingUserID)

	if err == nil {
		// User already exists, return success
		var user models.User
		err = h.db.QueryRowContext(c.Request.Context(), `
			SELECT id, organization_id, email, name, role, created_at, updated_at
			FROM users
			WHERE id = $1
		`, userID).Scan(
			&user.ID,
			&user.OrganizationID,
			&user.Email,
			&user.Name,
			&user.Role,
			&user.CreatedAt,
			&user.UpdatedAt,
		)
		if err != nil {
			log.Printf("Error fetching existing user: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{
				"success": false,
				"error":   "Database error",
			})
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"data":    user,
		})
		return
	}

	// Create organization for the new user
	orgID := uuid.New().String()
	orgName := input.Name + "'s Organization"

	_, err = h.db.ExecContext(c.Request.Context(), `
		INSERT INTO organizations (id, name)
		VALUES ($1, $2)
	`, orgID, orgName)
	if err != nil {
		log.Printf("Error creating organization: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to create organization",
		})
		return
	}

	// Create user record in database
	_, err = h.db.ExecContext(c.Request.Context(), `
		INSERT INTO users (id, organization_id, email, name, role)
		VALUES ($1, $2, $3, $4, 'admin')
	`, userID, orgID, supabaseUser.Email, input.Name)
	if err != nil {
		log.Printf("Error creating user: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to create user record",
		})
		return
	}

	// Fetch the created user
	var user models.User
	err = h.db.QueryRowContext(c.Request.Context(), `
		SELECT id, organization_id, email, name, role, created_at, updated_at
		FROM users
		WHERE id = $1
	`, userID).Scan(
		&user.ID,
		&user.OrganizationID,
		&user.Email,
		&user.Name,
		&user.Role,
		&user.CreatedAt,
		&user.UpdatedAt,
	)
	if err != nil {
		log.Printf("Error fetching created user: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to fetch user",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    user,
	})
}
