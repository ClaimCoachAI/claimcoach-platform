package services

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/claimcoach/backend/internal/models"
	"github.com/google/uuid"
)

// Sentinel errors for scope sheet operations
var (
	ErrTokenInvalid     = errors.New("magic link token is invalid or expired")
	ErrDraftNotFound    = errors.New("draft not found")
	ErrInvalidDraftStep = errors.New("draft_step must be a non-negative integer")
)

type ScopeSheetService struct {
	db *sql.DB
}

func NewScopeSheetService(db *sql.DB) *ScopeSheetService {
	return &ScopeSheetService{
		db: db,
	}
}

// CreateScopeSheetInput is the incoming payload from the contractor wizard
type CreateScopeSheetInput struct {
	Areas            []models.ScopeArea `json:"areas"`
	TriageSelections []string           `json:"triage_selections"`
	GeneralNotes     *string            `json:"general_notes"`
	DraftStep        *int               `json:"draft_step"`
}

// CreateScopeSheet creates a new submitted scope sheet for a claim
func (s *ScopeSheetService) CreateScopeSheet(ctx context.Context, claimID string, input CreateScopeSheetInput) (*models.ScopeSheet, error) {
	scopeSheetID := uuid.New().String()
	now := time.Now()

	areasJSON, err := json.Marshal(input.Areas)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal areas: %w", err)
	}
	triageJSON, err := json.Marshal(input.TriageSelections)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal triage_selections: %w", err)
	}

	query := `
		INSERT INTO scope_sheets (
			id, claim_id, areas, triage_selections, general_notes,
			is_draft, submitted_at, created_at, updated_at
		)
		VALUES ($1, $2, $3, $4, $5, false, NULL, $6, $7)
		RETURNING
			id, claim_id, areas, triage_selections, general_notes,
			is_draft, draft_step, draft_saved_at, submitted_at, created_at, updated_at
	`

	row := s.db.QueryRowContext(ctx, query,
		scopeSheetID, claimID, areasJSON, triageJSON, input.GeneralNotes,
		now, now,
	)
	return scanScopeSheet(row)
}

// GetScopeSheetByClaimID retrieves a submitted scope sheet by claim ID.
// Returns nil if not found (not an error).
func (s *ScopeSheetService) GetScopeSheetByClaimID(ctx context.Context, claimID string) (*models.ScopeSheet, error) {
	query := `
		SELECT
			id, claim_id, areas, triage_selections, general_notes,
			is_draft, draft_step, draft_saved_at, submitted_at, created_at, updated_at
		FROM scope_sheets
		WHERE claim_id = $1 AND is_draft = false
		ORDER BY created_at DESC
		LIMIT 1
	`

	row := s.db.QueryRowContext(ctx, query, claimID)
	scopeSheet, err := scanScopeSheet(row)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return scopeSheet, err
}

// SubmitScopeSheet marks a scope sheet as submitted by setting submitted_at to NOW()
func (s *ScopeSheetService) SubmitScopeSheet(ctx context.Context, scopeSheetID string) error {
	query := `UPDATE scope_sheets SET submitted_at = NOW(), updated_at = NOW() WHERE id = $1`

	result, err := s.db.ExecContext(ctx, query, scopeSheetID)
	if err != nil {
		return fmt.Errorf("failed to submit scope sheet: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to check rows affected: %w", err)
	}
	if rowsAffected == 0 {
		return fmt.Errorf("scope sheet not found")
	}

	return nil
}

// validateMagicLinkToken validates a magic link token and returns the associated claim ID
func (s *ScopeSheetService) validateMagicLinkToken(ctx context.Context, token string) (string, error) {
	var claimID string
	query := `SELECT claim_id FROM magic_links WHERE token = $1 AND status = 'active' AND expires_at > NOW()`
	err := s.db.QueryRowContext(ctx, query, token).Scan(&claimID)
	if err == sql.ErrNoRows {
		return "", ErrTokenInvalid
	}
	if err != nil {
		return "", fmt.Errorf("failed to validate token: %w", err)
	}
	return claimID, nil
}

// SaveScopeDraft saves or updates a draft scope sheet (UPSERT via ON CONFLICT)
func (s *ScopeSheetService) SaveScopeDraft(ctx context.Context, token string, draft *CreateScopeSheetInput) (*models.ScopeSheet, error) {
	claimID, err := s.validateMagicLinkToken(ctx, token)
	if err != nil {
		return nil, err
	}

	if draft.DraftStep != nil && *draft.DraftStep < 0 {
		return nil, ErrInvalidDraftStep
	}

	areasJSON, err := json.Marshal(draft.Areas)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal areas: %w", err)
	}
	triageJSON, err := json.Marshal(draft.TriageSelections)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal triage_selections: %w", err)
	}

	now := time.Now()
	scopeSheetID := uuid.New().String()

	query := `
		INSERT INTO scope_sheets (
			id, claim_id, areas, triage_selections, general_notes,
			is_draft, draft_step, draft_saved_at, submitted_at, created_at, updated_at
		)
		VALUES ($1, $2, $3, $4, $5, true, $6, $7, NULL, $8, $9)
		ON CONFLICT (claim_id) WHERE is_draft = true
		DO UPDATE SET
			areas             = EXCLUDED.areas,
			triage_selections = EXCLUDED.triage_selections,
			general_notes     = EXCLUDED.general_notes,
			draft_step        = EXCLUDED.draft_step,
			draft_saved_at    = EXCLUDED.draft_saved_at,
			updated_at        = EXCLUDED.updated_at
		RETURNING
			id, claim_id, areas, triage_selections, general_notes,
			is_draft, draft_step, draft_saved_at, submitted_at, created_at, updated_at
	`

	row := s.db.QueryRowContext(ctx, query,
		scopeSheetID, claimID, areasJSON, triageJSON, draft.GeneralNotes,
		draft.DraftStep, now, now, now,
	)
	return scanScopeSheet(row)
}

// GetScopeDraft retrieves the draft scope sheet for a claim via magic link token.
// Returns ErrDraftNotFound if no draft exists.
func (s *ScopeSheetService) GetScopeDraft(ctx context.Context, token string) (*models.ScopeSheet, error) {
	claimID, err := s.validateMagicLinkToken(ctx, token)
	if err != nil {
		return nil, err
	}

	query := `
		SELECT
			id, claim_id, areas, triage_selections, general_notes,
			is_draft, draft_step, draft_saved_at, submitted_at, created_at, updated_at
		FROM scope_sheets
		WHERE claim_id = $1 AND is_draft = true
	`

	row := s.db.QueryRowContext(ctx, query, claimID)
	scopeSheet, err := scanScopeSheet(row)
	if err == sql.ErrNoRows {
		return nil, ErrDraftNotFound
	}
	return scopeSheet, err
}

// scanScopeSheet scans a single DB row into a ScopeSheet, unmarshalling JSONB columns.
func scanScopeSheet(row *sql.Row) (*models.ScopeSheet, error) {
	var ss models.ScopeSheet
	var areasJSON []byte
	var triageJSON []byte

	err := row.Scan(
		&ss.ID, &ss.ClaimID,
		&areasJSON, &triageJSON, &ss.GeneralNotes,
		&ss.IsDraft, &ss.DraftStep, &ss.DraftSavedAt,
		&ss.SubmittedAt, &ss.CreatedAt, &ss.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}

	if len(areasJSON) > 0 {
		if err := json.Unmarshal(areasJSON, &ss.Areas); err != nil {
			return nil, fmt.Errorf("failed to unmarshal areas: %w", err)
		}
	}
	if ss.Areas == nil {
		ss.Areas = []models.ScopeArea{}
	}

	if len(triageJSON) > 0 {
		if err := json.Unmarshal(triageJSON, &ss.TriageSelections); err != nil {
			return nil, fmt.Errorf("failed to unmarshal triage_selections: %w", err)
		}
	}
	if ss.TriageSelections == nil {
		ss.TriageSelections = []string{}
	}

	return &ss, nil
}
