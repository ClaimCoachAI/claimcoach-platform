-- Organizations (multi-tenancy root)
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Users
CREATE TABLE users (
    id UUID PRIMARY KEY, -- Supabase auth user ID
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'member')),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_organization ON users(organization_id);

-- Mortgage Banks
CREATE TABLE mortgage_banks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    endorsement_required BOOLEAN NOT NULL DEFAULT true,
    instruction_letter_template TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Properties
CREATE TABLE properties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    nickname TEXT NOT NULL,
    legal_address TEXT NOT NULL,
    lat DECIMAL(10, 8),
    lng DECIMAL(11, 8),
    owner_entity_name TEXT NOT NULL,
    mortgage_bank_id UUID REFERENCES mortgage_banks(id),
    status TEXT NOT NULL CHECK (status IN ('draft', 'active_monitored', 'archived')) DEFAULT 'draft',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_properties_organization ON properties(organization_id);

-- Insurance Policies
CREATE TABLE insurance_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    carrier_name TEXT NOT NULL,
    policy_number TEXT,
    coverage_a_limit DECIMAL(12, 2),
    coverage_b_limit DECIMAL(12, 2),
    coverage_d_limit DECIMAL(12, 2),
    deductible_type TEXT NOT NULL CHECK (deductible_type IN ('percentage', 'fixed')),
    deductible_value DECIMAL(12, 2) NOT NULL,
    deductible_calculated DECIMAL(12, 2) NOT NULL,
    policy_pdf_url TEXT,
    effective_date DATE,
    expiration_date DATE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(property_id)
);

-- Claims
CREATE TABLE claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    policy_id UUID NOT NULL REFERENCES insurance_policies(id),
    claim_number TEXT,
    loss_type TEXT NOT NULL CHECK (loss_type IN ('fire', 'water', 'wind', 'hail', 'other')),
    incident_date TIMESTAMP NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('draft', 'assessing', 'filed', 'field_scheduled', 'audit_pending', 'negotiating', 'settled', 'closed')) DEFAULT 'draft',
    filed_at TIMESTAMP,
    assigned_user_id UUID REFERENCES users(id),
    adjuster_name TEXT,
    adjuster_phone TEXT,
    meeting_datetime TIMESTAMP,
    created_by_user_id UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_claims_property_status ON claims(property_id, status);

-- Documents
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
    uploaded_by_user_id UUID REFERENCES users(id),
    document_type TEXT NOT NULL CHECK (document_type IN ('policy_pdf', 'contractor_photo', 'contractor_estimate', 'carrier_estimate', 'proof_of_repair', 'other')),
    file_url TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_size_bytes INTEGER NOT NULL,
    mime_type TEXT NOT NULL,
    metadata JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_documents_claim ON documents(claim_id);

-- Estimates
CREATE TABLE estimates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
    estimate_type TEXT NOT NULL CHECK (estimate_type IN ('contractor_initial', 'industry_standard', 'carrier_acv', 'rebuttal')),
    source_name TEXT NOT NULL,
    total_amount DECIMAL(12, 2) NOT NULL,
    line_items JSONB,
    document_id UUID REFERENCES documents(id),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Magic Links
CREATE TABLE magic_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
    token TEXT UNIQUE NOT NULL,
    contractor_name TEXT NOT NULL,
    contractor_email TEXT NOT NULL,
    contractor_phone TEXT,
    expires_at TIMESTAMP NOT NULL,
    accessed_at TIMESTAMP,
    access_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL CHECK (status IN ('active', 'expired', 'completed')) DEFAULT 'active',
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_magic_links_token ON magic_links(token);

-- Claim Activities (Audit Trail)
CREATE TABLE claim_activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id),
    activity_type TEXT NOT NULL CHECK (activity_type IN ('status_change', 'document_upload', 'estimate_added', 'comment', 'assignment')),
    description TEXT NOT NULL,
    metadata JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_claim_activities_claim_created ON claim_activities(claim_id, created_at DESC);

-- Payments
CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
    payment_type TEXT NOT NULL CHECK (payment_type IN ('acv', 'rcv')),
    amount DECIMAL(12, 2) NOT NULL,
    check_number TEXT,
    received_date DATE NOT NULL,
    notes TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Seed mortgage banks
INSERT INTO mortgage_banks (name, endorsement_required) VALUES
    ('Wells Fargo', true),
    ('Bank of America', true),
    ('Chase', true),
    ('US Bank', true),
    ('Other', false);
