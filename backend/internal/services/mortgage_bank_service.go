package services

import (
	"database/sql"
	"fmt"

	"github.com/claimcoach/backend/internal/models"
)

type MortgageBankService struct {
	db *sql.DB
}

func NewMortgageBankService(db *sql.DB) *MortgageBankService {
	return &MortgageBankService{db: db}
}

func (s *MortgageBankService) GetAllBanks() ([]models.MortgageBank, error) {
	query := `
		SELECT id, name, endorsement_required, instruction_letter_template, created_at
		FROM mortgage_banks
		ORDER BY name
	`

	rows, err := s.db.Query(query)
	if err != nil {
		return nil, fmt.Errorf("failed to get mortgage banks: %w", err)
	}
	defer rows.Close()

	banks := []models.MortgageBank{}
	for rows.Next() {
		var bank models.MortgageBank
		err := rows.Scan(
			&bank.ID,
			&bank.Name,
			&bank.EndorsementRequired,
			&bank.InstructionLetterTemplate,
			&bank.CreatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan mortgage bank: %w", err)
		}
		banks = append(banks, bank)
	}

	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("failed to iterate mortgage banks: %w", err)
	}

	return banks, nil
}
