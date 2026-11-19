-- Test-only GWAP Messenger checkpoint schema, isolated CI PostgreSQL database.
-- NO MLS group secrets, message plaintext, decryption keys or wallets stored here.
-- Not a production migration. Production requires principal enrollment validation, RLS/DB roles,
-- operational alerts, TLS, persistent service keys and GNS verification.
CREATE TABLE IF NOT EXISTS messenger_checkpoint_devices (
    device_id TEXT PRIMARY KEY CHECK (length(device_id) BETWEEN 1 AND 128),
    account_id TEXT NOT NULL CHECK (length(account_id) BETWEEN 1 AND 128),
    binding_version BIGINT NOT NULL CHECK (binding_version > 0),
    public_key_spki TEXT NOT NULL,
    revision BIGINT NOT NULL CHECK (revision >= 0),
    commitment CHAR(64) NOT NULL CHECK (commitment ~ '^[0-9a-f]{64}$'),
    fence BIGINT NOT NULL DEFAULT 1 CHECK (fence > 0),
    revoked BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messenger_checkpoint_receipts (
    device_id TEXT NOT NULL REFERENCES messenger_checkpoint_devices(device_id) ON DELETE RESTRICT,
    idempotency_key TEXT NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 128),
    request_digest CHAR(64) NOT NULL CHECK (request_digest ~ '^[0-9a-f]{64}$'),
    revision BIGINT NOT NULL CHECK (revision > 0),
    commitment CHAR(64) NOT NULL CHECK (commitment ~ '^[0-9a-f]{64}$'),
    fence BIGINT NOT NULL CHECK (fence > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (device_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS messenger_checkpoint_receipts_revision
ON messenger_checkpoint_receipts (device_id,revision);
