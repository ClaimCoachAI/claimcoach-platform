-- Rollback Phase 7: Field Logistics & Payments

-- Drop rcv_demand_letters table
DROP INDEX IF EXISTS idx_rcv_demand_letters_created;
DROP INDEX IF EXISTS idx_rcv_demand_letters_claim;
DROP TABLE IF EXISTS rcv_demand_letters;

-- Remove enhancements from payments table
DROP INDEX IF EXISTS idx_payments_status;
DROP INDEX IF EXISTS idx_payments_claim_type;

ALTER TABLE payments DROP COLUMN IF EXISTS updated_at;
ALTER TABLE payments DROP COLUMN IF EXISTS metadata;
ALTER TABLE payments DROP COLUMN IF EXISTS check_image_url;
ALTER TABLE payments DROP COLUMN IF EXISTS dispute_reason;
ALTER TABLE payments DROP COLUMN IF EXISTS reconciled_by_user_id;
ALTER TABLE payments DROP COLUMN IF EXISTS reconciled_at;
ALTER TABLE payments DROP COLUMN IF EXISTS received_by_user_id;
ALTER TABLE payments DROP COLUMN IF EXISTS expected_amount;
ALTER TABLE payments DROP COLUMN IF EXISTS status;

-- Drop meetings table
DROP INDEX IF EXISTS idx_meetings_assigned_rep;
DROP INDEX IF EXISTS idx_meetings_scheduled_date;
DROP INDEX IF EXISTS idx_meetings_status;
DROP INDEX IF EXISTS idx_meetings_claim;
DROP TABLE IF EXISTS meetings;
