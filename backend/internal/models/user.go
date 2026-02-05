package models

import "time"

type User struct {
	ID             string    `json:"id" db:"id"`
	OrganizationID string    `json:"organization_id" db:"organization_id"`
	Email          string    `json:"email" db:"email"`
	Name           string    `json:"name" db:"name"`
	Role           string    `json:"role" db:"role"`
	CreatedAt      time.Time `json:"created_at" db:"created_at"`
	UpdatedAt      time.Time `json:"updated_at" db:"updated_at"`
}

type Organization struct {
	ID        string    `json:"id" db:"id"`
	Name      string    `json:"name" db:"name"`
	CreatedAt time.Time `json:"created_at" db:"created_at"`
	UpdatedAt time.Time `json:"updated_at" db:"updated_at"`
}
