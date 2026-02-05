-- Remove index
DROP INDEX IF EXISTS idx_documents_claim_status;

-- Remove status column from documents table
ALTER TABLE documents DROP COLUMN status;
