-- SevaDesk Central Coordination PostgreSQL Schema
-- Manages verified scheme catalogs, official fee gazettes, versioned portal adapters,
-- and aggregate, zero-PII telemetry from edge kiosks.

CREATE TABLE IF NOT EXISTS central_schemes (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    department VARCHAR(255) NOT NULL,
    state VARCHAR(64) NOT NULL,
    portal_url TEXT NOT NULL,
    official_fee NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    max_operator_charge NUMERIC(10, 2) NOT NULL DEFAULT 30.00,
    fee_source_url TEXT NOT NULL,
    fee_verified_at DATE NOT NULL,
    max_upload_mb REAL DEFAULT 2.0,
    allowed_extensions VARCHAR(255) DEFAULT 'pdf,jpg',
    required_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
    adapter_id VARCHAR(64),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS portal_adapters (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    portal_domain VARCHAR(255) NOT NULL,
    state VARCHAR(64) NOT NULL,
    version VARCHAR(32) NOT NULL,
    fields_config JSONB NOT NULL,
    disallowed_selectors JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS fee_gazettes (
    id VARCHAR(64) PRIMARY KEY,
    scheme_id VARCHAR(64) REFERENCES central_schemes(id),
    state VARCHAR(64) NOT NULL,
    gazette_order_ref VARCHAR(128) NOT NULL,
    official_fee NUMERIC(10, 2) NOT NULL,
    effective_from DATE NOT NULL,
    source_url TEXT NOT NULL,
    verified_by VARCHAR(128) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS zero_pii_telemetry (
    id BIGSERIAL PRIMARY KEY,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    portal_domain VARCHAR(255) NOT NULL,
    adapter_id VARCHAR(64),
    error_category VARCHAR(64) NOT NULL,
    unmapped_message_pattern VARCHAR(255),
    success_count INT DEFAULT 1,
    failure_count INT DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_telemetry_category ON zero_pii_telemetry(error_category);
CREATE INDEX IF NOT EXISTS idx_telemetry_domain ON zero_pii_telemetry(portal_domain);
CREATE INDEX IF NOT EXISTS idx_schemes_state ON central_schemes(state);
