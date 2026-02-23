-- Rollback Phase 10: Magic Link Email Tracking

-- Drop indexes
DROP INDEX IF EXISTS idx_magic_links_created_by;
DROP INDEX IF EXISTS idx_magic_links_claim_id;

-- Drop email tracking fields
ALTER TABLE magic_links DROP COLUMN IF EXISTS email_error;
ALTER TABLE magic_links DROP COLUMN IF EXISTS email_sent_at;
ALTER TABLE magic_links DROP COLUMN IF EXISTS email_sent;

-- Drop created_by_user_id field
ALTER TABLE magic_links DROP COLUMN IF EXISTS created_by_user_id;
