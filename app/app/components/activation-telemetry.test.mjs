import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const bridge = fs.readFileSync(
  path.join(process.cwd(), "app/components/entry-intent-bridge.tsx"),
  "utf8",
);
const telemetry = fs.readFileSync(
  path.join(process.cwd(), "app/app/components/activation-telemetry.tsx"),
  "utf8",
);
const layout = fs.readFileSync(
  path.join(process.cwd(), "app/app/layout.tsx"),
  "utf8",
);

function propertiesFor(source, eventName) {
  const match = source.match(
    new RegExp(`safeTrack\\(\\"${eventName}\\",\\s*\\{([\\s\\S]*?)\\}\\);`),
  );
  assert.ok(match, `${eventName} must be tracked`);
  return match[1];
}

test("activation funnel tracks selection, start, resume, and completion", () => {
  assert.match(bridge, /intent_selected/);
  assert.match(telemetry, /activation_started/);
  assert.match(telemetry, /activation_resumed/);
  assert.match(telemetry, /activation_completed/);
  assert.match(layout, /<ActivationTelemetry \/>/);
});

test("activation analytics properties exclude direct identity and transaction data", () => {
  const forbiddenProperty = /\b(wallet|email|address|signature|receiptId|projectId|score|name)\s*:/i;
  const calls = [
    propertiesFor(bridge, "intent_selected"),
    propertiesFor(telemetry, "activation_started"),
    propertiesFor(telemetry, "activation_resumed"),
    propertiesFor(telemetry, "activation_completed"),
  ];
  for (const properties of calls) {
    assert.doesNotMatch(properties, forbiddenProperty);
  }
});

test("completion milestones represent real product outcomes", () => {
  for (const milestone of [
    "project_created",
    "validation_started",
    "identity_established",
    "identity_strengthened",
    "reputation_scored",
    "proof_of_control_verified",
    "verified_transaction_activity",
  ]) {
    assert.match(telemetry, new RegExp(milestone));
  }
  assert.match(telemetry, /\/api\/daily-ideas\/workspace/);
  assert.match(telemetry, /\/api\/gwapscore\/social-verification/);
  assert.match(telemetry, /\/api\/ppv\/activity/);
});
