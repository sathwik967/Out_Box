
-- ==========================================
-- OUTBOX EMAIL SCHEDULER DATABASE
-- ==========================================

-- 1. Email Campaigns
CREATE TABLE IF NOT EXISTS campaigns (
    id SERIAL PRIMARY KEY,
    campaign_name VARCHAR(255) NOT NULL,
    subject VARCHAR(500) NOT NULL,
    email_body TEXT NOT NULL,
    scheduled_at TIMESTAMPTZ,
    delay_seconds INTEGER DEFAULT 0,
    hourly_limit INTEGER DEFAULT 100,
    status VARCHAR(30) DEFAULT 'draft'
        CHECK (status IN ('draft', 'scheduled', 'processing', 'completed', 'failed', 'cancelled')),
    total_recipients INTEGER DEFAULT 0,
    sent_count INTEGER DEFAULT 0,
    failed_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 2. Email Recipients
CREATE TABLE IF NOT EXISTS recipients (
    id SERIAL PRIMARY KEY,
    campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    name VARCHAR(255),
    email VARCHAR(255) NOT NULL,
    status VARCHAR(30) DEFAULT 'pending'
        CHECK (status IN ('pending', 'scheduled', 'sending', 'sent', 'failed')),
    scheduled_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (campaign_id, email)
);

-- 3. Email Sending Logs
CREATE TABLE IF NOT EXISTS email_logs (
    id SERIAL PRIMARY KEY,
    campaign_id INTEGER REFERENCES campaigns(id) ON DELETE SET NULL,
    recipient_id INTEGER REFERENCES recipients(id) ON DELETE SET NULL,
    recipient_email VARCHAR(255) NOT NULL,
    status VARCHAR(30) NOT NULL,
    message_id VARCHAR(500),
    error_message TEXT,
    sent_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 4. Useful Database Indexes
CREATE INDEX IF NOT EXISTS idx_campaigns_status
ON campaigns(status);

CREATE INDEX IF NOT EXISTS idx_recipients_campaign_id
ON recipients(campaign_id);

CREATE INDEX IF NOT EXISTS idx_recipients_status
ON recipients(status);

CREATE INDEX IF NOT EXISTS idx_recipients_scheduled_at
ON recipients(scheduled_at);

CREATE INDEX IF NOT EXISTS idx_email_logs_campaign_id
ON email_logs(campaign_id);

CREATE INDEX IF NOT EXISTS idx_email_logs_sent_at
ON email_logs(sent_at);
