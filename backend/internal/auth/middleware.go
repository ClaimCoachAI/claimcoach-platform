package auth

import (
	"database/sql"
	"net/http"
	"strings"

	"github.com/claimcoach/backend/internal/models"
	"github.com/gin-gonic/gin"
)

func AuthMiddleware(supabase *SupabaseClient, db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.JSON(http.StatusUnauthorized, gin.H{
				"success": false,
				"error":   "Authorization header required",
				"code":    "UNAUTHORIZED",
			})
			c.Abort()
			return
		}

		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || parts[0] != "Bearer" {
			c.JSON(http.StatusUnauthorized, gin.H{
				"success": false,
				"error":   "Invalid authorization header format",
				"code":    "UNAUTHORIZED",
			})
			c.Abort()
			return
		}

		token := parts[1]
		userID, err := supabase.VerifyToken(token)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{
				"success": false,
				"error":   "Invalid or expired token",
				"code":    "UNAUTHORIZED",
			})
			c.Abort()
			return
		}

		// Fetch user from database
		var user models.User
		err = db.QueryRow(`
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
			if err == sql.ErrNoRows {
				c.JSON(http.StatusNotFound, gin.H{
					"success": false,
					"error":   "User not found",
					"code":    "USER_NOT_FOUND",
				})
			} else {
				c.JSON(http.StatusInternalServerError, gin.H{
					"success": false,
					"error":   "Database error",
					"code":    "INTERNAL_ERROR",
				})
			}
			c.Abort()
			return
		}

		c.Set("user", user)
		c.Next()
	}
}
