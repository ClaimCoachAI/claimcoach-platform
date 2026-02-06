-- Audit reports table (LLM-generated comparisons)
CREATE TABLE audit_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
    scope_sheet_id UUID NOT NULL REFERENCES scope_sheets(id) ON DELETE CASCADE,
    carrier_estimate_id UUID REFERENCES carrier_estimates(id) ON DELETE SET NULL,

    generated_estimate JSONB, -- LLM-generated industry-standard estimates
    comparison_data JSONB, -- Line-by-line comparison of contractor vs carrier estimates
    total_contractor_estimate DECIMAL(12, 2) NULL,
    total_carrier_estimate DECIMAL(12, 2) NULL,
    total_delta DECIMAL(12, 2) NULL,

    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    error_message TEXT,

    created_by_user_id UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_reports_claim ON audit_reports(claim_id);
CREATE INDEX idx_audit_reports_scope_sheet ON audit_reports(scope_sheet_id);
CREATE INDEX idx_audit_reports_carrier_estimate ON audit_reports(carrier_estimate_id);
CREATE INDEX idx_audit_reports_status ON audit_reports(status);
CREATE INDEX idx_audit_reports_created_by ON audit_reports(created_by_user_id);

-- Rebuttals table (generated rebuttal letters)
CREATE TABLE rebuttals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    audit_report_id UUID NOT NULL REFERENCES audit_reports(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rebuttals_audit ON rebuttals(audit_report_id);
CREATE INDEX idx_rebuttals_created ON rebuttals(created_at);

-- API usage logs table (track Perplexity API costs)
CREATE TABLE api_usage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    audit_report_id UUID REFERENCES audit_reports(id) ON DELETE SET NULL,
    api_call_type VARCHAR(50) NOT NULL CHECK (api_call_type IN ('estimate_generation', 'comparison_analysis', 'rebuttal_generation', 'pricing_lookup')),
    tokens_used INTEGER,
    estimated_cost DECIMAL(10, 4), -- 4 decimals for fractional penny costs in API billing
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_api_logs_audit ON api_usage_logs(audit_report_id);
CREATE INDEX idx_api_logs_created ON api_usage_logs(created_at);
CREATE INDEX idx_api_logs_type ON api_usage_logs(api_call_type);
