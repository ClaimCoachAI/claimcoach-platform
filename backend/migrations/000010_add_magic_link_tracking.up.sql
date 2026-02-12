-- Phase 10: Magic Link Email Tracking
-- Add tracking for who sent the magic link and whether the email was sent successfully

-- Add created_by_user_id to track which agent generated the link
ALTER TABLE magic_links ADD COLUMN created_by_user_id UUID REFERENCES users(id);

-- Add email send tracking fields
ALTER TABLE magic_links ADD COLUMN email_sent BOOLEAN DEFAULT false NOT NULL;
ALTER TABLE magic_links ADD COLUMN email_sent_at TIMESTAMP;
ALTER TABLE magic_links ADD COLUMN email_error TEXT;

-- Add index for querying by claim_id (for history listing)
CREATE INDEX idx_magic_links_claim_id ON magic_links(claim_id, created_at DESC);

-- Add index for created_by_user_id (for agent activity queries)
CREATE INDEX idx_magic_links_created_by ON magic_links(created_by_user_id);
