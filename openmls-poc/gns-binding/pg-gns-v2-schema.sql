-- TEST ONLY. Ephemeral PostgreSQL registry for verified GNS V2 device binding.
-- Do not execute against live GWAP or GNS databases.
CREATE TABLE IF NOT EXISTS messenger_gns_v2_names (
  name TEXT PRIMARY KEY,
  owner_wallet TEXT NOT NULL,
  ownership_version CHAR(64) NOT NULL,
  creation_signature TEXT NOT NULL,
  transfer_count BIGINT NOT NULL CHECK (transfer_count>=0),
  binding_generation BIGINT NOT NULL DEFAULT 1 CHECK (binding_generation>=1),
  finalized_slot BIGINT NOT NULL CHECK(finalized_slot>0),
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS messenger_gns_v2_accounts (
  account_id TEXT PRIMARY KEY,
  original_wallet TEXT NOT NULL,
  first_bound_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS messenger_gns_v2_challenges (
  nonce CHAR(32) PRIMARY KEY,
  name TEXT NOT NULL REFERENCES messenger_gns_v2_names(name),
  ownership_version CHAR(64) NOT NULL,
  expires_at_ms BIGINT NOT NULL,
  consumed BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE TABLE IF NOT EXISTS messenger_gns_v2_devices (
  device_id TEXT PRIMARY KEY,
  name TEXT NOT NULL REFERENCES messenger_gns_v2_names(name),
  account_id TEXT NOT NULL REFERENCES messenger_gns_v2_accounts(account_id),
  owner_wallet TEXT NOT NULL,
  ownership_version CHAR(64) NOT NULL,
  binding_generation BIGINT NOT NULL CHECK (binding_generation>=1),
  transport_public_spki_base64 TEXT NOT NULL,
  mls_keypackage_hash CHAR(64) NOT NULL,
  revoked BOOLEAN NOT NULL DEFAULT FALSE,
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS messenger_gns_unique_live_device_key
  ON messenger_gns_v2_devices(name,transport_public_spki_base64)
  WHERE revoked=FALSE;
CREATE TABLE IF NOT EXISTS messenger_gns_v2_action_nonces (
  device_id TEXT NOT NULL REFERENCES messenger_gns_v2_devices(device_id),
  nonce CHAR(32) NOT NULL,
  consumed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(device_id,nonce)
);
