package services

import (
	"database/sql"
	"fmt"
	"time"

	"github.com/claimcoach/backend/internal/models"
	"github.com/google/uuid"
)

type PropertyService struct {
	db *sql.DB
}

func NewPropertyService(db *sql.DB) *PropertyService {
	return &PropertyService{db: db}
}

type CreatePropertyInput struct {
	Nickname        string  `json:"nickname" binding:"required"`
	LegalAddress    string  `json:"legal_address" binding:"required"`
	OwnerEntityName string  `json:"owner_entity_name" binding:"required"`
	MortgageBankID  *string `json:"mortgage_bank_id"`
}

type UpdatePropertyInput struct {
	Nickname        *string `json:"nickname"`
	LegalAddress    *string `json:"legal_address"`
	OwnerEntityName *string `json:"owner_entity_name"`
	MortgageBankID  *string `json:"mortgage_bank_id"`
}

func (s *PropertyService) CreateProperty(input CreatePropertyInput, organizationID string) (*models.Property, error) {
	property := &models.Property{
		ID:              uuid.New().String(),
		OrganizationID:  organizationID,
		Nickname:        input.Nickname,
		LegalAddress:    input.LegalAddress,
		OwnerEntityName: input.OwnerEntityName,
		MortgageBankID:  input.MortgageBankID,
		Status:          "draft",
		CreatedAt:       time.Now(),
		UpdatedAt:       time.Now(),
	}

	query := `
		INSERT INTO properties (
			id, organization_id, nickname, legal_address, lat, lng,
			owner_entity_name, mortgage_bank_id, status, created_at, updated_at
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
		RETURNING id, organization_id, nickname, legal_address, lat, lng,
			owner_entity_name, mortgage_bank_id, status, created_at, updated_at
	`

	err := s.db.QueryRow(
		query,
		property.ID,
		property.OrganizationID,
		property.Nickname,
		property.LegalAddress,
		nil, // lat
		nil, // lng
		property.OwnerEntityName,
		property.MortgageBankID,
		property.Status,
		property.CreatedAt,
		property.UpdatedAt,
	).Scan(
		&property.ID,
		&property.OrganizationID,
		&property.Nickname,
		&property.LegalAddress,
		&property.Lat,
		&property.Lng,
		&property.OwnerEntityName,
		&property.MortgageBankID,
		&property.Status,
		&property.CreatedAt,
		&property.UpdatedAt,
	)

	if err != nil {
		return nil, fmt.Errorf("failed to create property: %w", err)
	}

	return property, nil
}

func (s *PropertyService) GetProperties(organizationID string) ([]models.Property, error) {
	query := `
		SELECT id, organization_id, nickname, legal_address, lat, lng,
			owner_entity_name, mortgage_bank_id, status, created_at, updated_at
		FROM properties
		WHERE organization_id = $1
		ORDER BY created_at DESC
	`

	rows, err := s.db.Query(query, organizationID)
	if err != nil {
		return nil, fmt.Errorf("failed to get properties: %w", err)
	}
	defer rows.Close()

	properties := []models.Property{}
	for rows.Next() {
		var property models.Property
		err := rows.Scan(
			&property.ID,
			&property.OrganizationID,
			&property.Nickname,
			&property.LegalAddress,
			&property.Lat,
			&property.Lng,
			&property.OwnerEntityName,
			&property.MortgageBankID,
			&property.Status,
			&property.CreatedAt,
			&property.UpdatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan property: %w", err)
		}
		properties = append(properties, property)
	}

	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("failed to iterate properties: %w", err)
	}

	return properties, nil
}

func (s *PropertyService) GetProperty(id string, organizationID string) (*models.Property, error) {
	query := `
		SELECT id, organization_id, nickname, legal_address, lat, lng,
			owner_entity_name, mortgage_bank_id, status, created_at, updated_at
		FROM properties
		WHERE id = $1 AND organization_id = $2
	`

	var property models.Property
	err := s.db.QueryRow(query, id, organizationID).Scan(
		&property.ID,
		&property.OrganizationID,
		&property.Nickname,
		&property.LegalAddress,
		&property.Lat,
		&property.Lng,
		&property.OwnerEntityName,
		&property.MortgageBankID,
		&property.Status,
		&property.CreatedAt,
		&property.UpdatedAt,
	)

	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("property not found")
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get property: %w", err)
	}

	return &property, nil
}

func (s *PropertyService) UpdateProperty(id string, organizationID string, input UpdatePropertyInput) (*models.Property, error) {
	// First, check if property exists and belongs to organization
	existing, err := s.GetProperty(id, organizationID)
	if err != nil {
		return nil, err
	}

	// Build dynamic update query
	query := `UPDATE properties SET updated_at = $1`
	args := []interface{}{time.Now()}
	argPos := 2

	if input.Nickname != nil {
		query += fmt.Sprintf(", nickname = $%d", argPos)
		args = append(args, *input.Nickname)
		argPos++
	}

	if input.LegalAddress != nil {
		query += fmt.Sprintf(", legal_address = $%d", argPos)
		args = append(args, *input.LegalAddress)
		argPos++
	}

	if input.OwnerEntityName != nil {
		query += fmt.Sprintf(", owner_entity_name = $%d", argPos)
		args = append(args, *input.OwnerEntityName)
		argPos++
	}

	if input.MortgageBankID != nil {
		query += fmt.Sprintf(", mortgage_bank_id = $%d", argPos)
		args = append(args, *input.MortgageBankID)
		argPos++
	}

	query += fmt.Sprintf(" WHERE id = $%d AND organization_id = $%d", argPos, argPos+1)
	args = append(args, id, organizationID)

	query += `
		RETURNING id, organization_id, nickname, legal_address, lat, lng,
			owner_entity_name, mortgage_bank_id, status, created_at, updated_at
	`

	var property models.Property
	err = s.db.QueryRow(query, args...).Scan(
		&property.ID,
		&property.OrganizationID,
		&property.Nickname,
		&property.LegalAddress,
		&property.Lat,
		&property.Lng,
		&property.OwnerEntityName,
		&property.MortgageBankID,
		&property.Status,
		&property.CreatedAt,
		&property.UpdatedAt,
	)

	if err != nil {
		return nil, fmt.Errorf("failed to update property: %w", err)
	}

	// Merge with existing to ensure we return complete data
	if property.ID == "" {
		return existing, nil
	}

	return &property, nil
}
