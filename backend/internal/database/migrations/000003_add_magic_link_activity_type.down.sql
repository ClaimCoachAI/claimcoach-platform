-- Rollback: Remove 'magic_link_generated' from claim_activities activity_type constraint
ALTER TABLE claim_activities
DROP CONSTRAINT claim_activities_activity_type_check;

ALTER TABLE claim_activities
ADD CONSTRAINT claim_activities_activity_type_check
CHECK (activity_type IN ('status_change', 'document_upload', 'estimate_added', 'comment', 'assignment'));
