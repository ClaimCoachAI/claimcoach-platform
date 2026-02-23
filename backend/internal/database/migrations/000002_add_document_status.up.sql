-- Add status column to documents table for tracking upload confirmation
ALTER TABLE documents ADD COLUMN status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('pending', 'confirmed'));

-- Update the default for new records to be 'pending' (existing records will remain 'confirmed')
ALTER TABLE documents ALTER COLUMN status SET DEFAULT 'pending';

-- Add index for efficient queries on claim_id and status
CREATE INDEX idx_documents_claim_status ON documents(claim_id, status);
