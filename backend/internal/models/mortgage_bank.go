package models

import "time"

type MortgageBank struct {
	ID                        string     `json:"id"`
	Name                      string     `json:"name"`
	EndorsementRequired       bool       `json:"endorsement_required"`
	InstructionLetterTemplate *string    `json:"instruction_letter_template,omitempty"`
	CreatedAt                 time.Time  `json:"created_at"`
}
