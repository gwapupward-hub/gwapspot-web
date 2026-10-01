-- GWAP workspace storage compatibility schema.
-- Runtime application traffic uses DATABASE_URL (pooled Neon endpoint).
-- Schema/admin tooling should use DATABASE_URL_UNPOOLED.
--
-- The application currently creates this table idempotently during the dev
-- pilot so a fresh isolated database can come online without manual DDL. This
-- migration remains the canonical schema source for future managed migrations.

CREATE TABLE IF NOT EXISTS gwap_workspace_kv_v1 (
  storage_key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  expires_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS gwap_workspace_kv_v1_expires_at_idx
  ON gwap_workspace_kv_v1 (expires_at)
  WHERE expires_at IS NOT NULL;
