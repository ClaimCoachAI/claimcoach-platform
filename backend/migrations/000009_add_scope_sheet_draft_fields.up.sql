-- Add draft-related fields to scope_sheets table
ALTER TABLE scope_sheets
ADD COLUMN is_draft BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN draft_step INTEGER CHECK (draft_step >= 1 AND draft_step <= 10),
ADD COLUMN draft_saved_at TIMESTAMP;

-- Create index for efficient draft lookups
CREATE INDEX idx_scope_sheets_draft ON scope_sheets(claim_id, is_draft) WHERE is_draft = true;

-- Add comment for clarity
COMMENT ON COLUMN scope_sheets.is_draft IS 'True if this is a draft submission, false if finalized';
COMMENT ON COLUMN scope_sheets.draft_step IS 'Current wizard step (1-10) for draft, NULL if not started or finalized';
COMMENT ON COLUMN scope_sheets.draft_saved_at IS 'Timestamp of last draft save';
