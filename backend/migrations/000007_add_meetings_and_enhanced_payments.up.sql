-- Phase 7: Field Logistics & Payments
-- Add meetings table, enhance payments table, add rcv_demand_letters table

-- Create meetings table
CREATE TABLE meetings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
    meeting_type VARCHAR(50) NOT NULL DEFAULT 'adjuster_inspection'
        CHECK (meeting_type IN ('adjuster_inspection', 'contractor_walkthrough', 'final_inspection')),

    -- Scheduling (manual entry - no calendar integration)
    scheduled_date DATE NOT NULL,
    scheduled_time TIME NOT NULL,
    location TEXT NOT NULL,
    duration_minutes INTEGER DEFAULT 60,

    -- Status workflow: scheduled → confirmed → completed | cancelled
    status VARCHAR(50) NOT NULL DEFAULT 'scheduled'
        CHECK (status IN ('scheduled', 'confirmed', 'completed', 'cancelled', 'rescheduled')),

    -- Participants
    adjuster_name TEXT,
    adjuster_email TEXT,
    adjuster_phone TEXT,
    assigned_representative_id UUID REFERENCES users(id),

    -- Notes and outcomes
    notes TEXT,
    outcome_summary TEXT,

    -- Tracking
    created_by_user_id UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMP,
    cancelled_at TIMESTAMP,
    cancellation_reason TEXT
);

CREATE INDEX idx_meetings_claim ON meetings(claim_id);
CREATE INDEX idx_meetings_status ON meetings(status);
CREATE INDEX idx_meetings_scheduled_date ON meetings(scheduled_date);
CREATE INDEX idx_meetings_assigned_rep ON meetings(assigned_representative_id);

-- Enhance existing payments table
ALTER TABLE payments ADD COLUMN status VARCHAR(50) NOT NULL DEFAULT 'expected'
    CHECK (status IN ('expected', 'received', 'reconciled', 'disputed'));
ALTER TABLE payments ADD COLUMN expected_amount DECIMAL(12, 2);
ALTER TABLE payments ADD COLUMN received_by_user_id UUID REFERENCES users(id);
ALTER TABLE payments ADD COLUMN reconciled_at TIMESTAMP;
ALTER TABLE payments ADD COLUMN reconciled_by_user_id UUID REFERENCES users(id);
ALTER TABLE payments ADD COLUMN dispute_reason TEXT;
ALTER TABLE payments ADD COLUMN check_image_url TEXT;
ALTER TABLE payments ADD COLUMN metadata JSONB;
ALTER TABLE payments ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT NOW();

CREATE INDEX idx_payments_claim_type ON payments(claim_id, payment_type);
CREATE INDEX idx_payments_status ON payments(status);

-- Create rcv_demand_letters table
CREATE TABLE rcv_demand_letters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
    payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,

    content TEXT NOT NULL,

    -- Payment context
    acv_received DECIMAL(12, 2),
    rcv_expected DECIMAL(12, 2),
    rcv_outstanding DECIMAL(12, 2),

    -- Tracking
    created_by_user_id UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    sent_at TIMESTAMP,
    sent_to_email TEXT
);

CREATE INDEX idx_rcv_demand_letters_claim ON rcv_demand_letters(claim_id);
CREATE INDEX idx_rcv_demand_letters_created ON rcv_demand_letters(created_at);
