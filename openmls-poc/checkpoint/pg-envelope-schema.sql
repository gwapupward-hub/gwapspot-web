-- TEST ONLY: PostgreSQL 16 delivery grants and authenticated recipient-pull fixture.
-- Load pg-schema.sql first. No production migration or live GNS/MLS private keys.
CREATE TABLE IF NOT EXISTS messenger_test_group_members (
  group_id TEXT NOT NULL CHECK(length(group_id) BETWEEN 3 AND 128),
  device_id TEXT NOT NULL REFERENCES messenger_checkpoint_devices(device_id),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY(group_id,device_id)
);
CREATE TABLE IF NOT EXISTS messenger_envelope_grants (
  sender_device_id TEXT NOT NULL REFERENCES messenger_checkpoint_devices(device_id),
  message_id TEXT NOT NULL CHECK(length(message_id) BETWEEN 8 AND 128),
  group_id TEXT NOT NULL,
  recipient_device_id TEXT NOT NULL REFERENCES messenger_checkpoint_devices(device_id),
  epoch BIGINT NOT NULL CHECK(epoch>=0),
  granted_revision BIGINT NOT NULL CHECK(granted_revision>0),
  binding_version BIGINT NOT NULL CHECK(binding_version>0),
  fence BIGINT NOT NULL CHECK(fence>0),
  snapshot_commitment CHAR(64) NOT NULL CHECK(snapshot_commitment ~ '^[a-f0-9]{64}$'),
  ciphertext_hash CHAR(64) NOT NULL CHECK(ciphertext_hash ~ '^[a-f0-9]{64}$'),
  idempotency_key TEXT NOT NULL,
  request_digest CHAR(64) NOT NULL CHECK(request_digest ~ '^[a-f0-9]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW()+INTERVAL '1 hour'),
  PRIMARY KEY(sender_device_id,message_id),
  UNIQUE(sender_device_id,idempotency_key),
  UNIQUE(sender_device_id,group_id,ciphertext_hash)
);
CREATE TABLE IF NOT EXISTS messenger_opaque_deliveries (
  seq BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sender_device_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  group_id TEXT NOT NULL,
  recipient_device_id TEXT NOT NULL,
  epoch BIGINT NOT NULL,
  ciphertext_hash CHAR(64) NOT NULL,
  ciphertext BYTEA NOT NULL CHECK(octet_length(ciphertext) BETWEEN 16 AND 16384),
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY(sender_device_id,message_id)
    REFERENCES messenger_envelope_grants(sender_device_id,message_id),
  UNIQUE(sender_device_id,message_id)
);
CREATE INDEX IF NOT EXISTS messenger_opaque_recipient_cursor
  ON messenger_opaque_deliveries(recipient_device_id,group_id,seq);
CREATE TABLE IF NOT EXISTS messenger_test_recipient_pull_nonces (
  recipient_device_id TEXT NOT NULL REFERENCES messenger_checkpoint_devices(device_id),
  nonce TEXT NOT NULL CHECK(length(nonce) BETWEEN 12 AND 128),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(recipient_device_id,nonce)
);
