import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMarketplaceCollaborationPacket,
  getCanonicalTrustProfileUrl,
} from "./marketplace-collaboration-packet.ts";

test("Ready briefs produce a bounded collaboration packet with canonical Trust Profile", () => {
  const packet = buildMarketplaceCollaborationPacket({
    status: "Ready",
    projectTitle: "Creator storefront",
    role: "designer",
    brief: "Design the storefront flow and responsive component system.",
    budget: "$2,500",
    timeline: "2–4 weeks",
    gnsName: "Builder.GWAP",
  });

  assert.ok(packet);
  assert.equal(packet.trustProfileUrl, "https://www.gwapspot.com/profile/builder");
  assert.match(packet.text, /GWAP Collaboration Packet/);
  assert.match(packet.text, /Project: Creator storefront/);
  assert.match(packet.text, /Capability needed: Designer/);
  assert.match(packet.text, /Budget: \$2,500/);
  assert.match(packet.text, /Timeline: 2–4 weeks/);
  assert.match(packet.text, /Public trust profile: https:\/\/www\.gwapspot\.com\/profile\/builder/);
  assert.match(packet.text, /does not publish or match this brief/);
});

test("Draft or empty-scope briefs fail closed", () => {
  assert.equal(
    buildMarketplaceCollaborationPacket({
      status: "Draft",
      projectTitle: "Project",
      role: "developer",
      brief: "Build it",
    }),
    null,
  );
  assert.equal(
    buildMarketplaceCollaborationPacket({
      status: "Ready",
      projectTitle: "Project",
      role: "developer",
      brief: "   ",
    }),
    null,
  );
});

test("unknown roles fail closed and optional fields stay explicit", () => {
  assert.equal(
    buildMarketplaceCollaborationPacket({
      status: "Ready",
      projectTitle: "Project",
      role: "admin",
      brief: "Valid scope",
    }),
    null,
  );

  const packet = buildMarketplaceCollaborationPacket({
    status: "Ready",
    projectTitle: "Project",
    role: "operations",
    brief: "Set up operating procedures.",
  });
  assert.ok(packet);
  assert.match(packet.text, /Budget: Not specified/);
  assert.match(packet.text, /Timeline: Not specified/);
  assert.match(packet.text, /Public trust profile: Not attached/);
});

test("Trust Profile URLs use only canonical valid .gwap names", () => {
  assert.equal(
    getCanonicalTrustProfileUrl("alice.gwap"),
    "https://www.gwapspot.com/profile/alice",
  );
  assert.equal(getCanonicalTrustProfileUrl("../alice"), null);
  assert.equal(getCanonicalTrustProfileUrl(""), null);
});

test("packet text strips control characters and bounds user text", () => {
  const packet = buildMarketplaceCollaborationPacket({
    status: "Ready",
    projectTitle: `Project\u0000${"x".repeat(160)}`,
    role: "researcher",
    brief: `Research\u0007 scope\r\n${"y".repeat(1500)}`,
    budget: "TBD",
    timeline: "1 week",
  });

  assert.ok(packet);
  assert.doesNotMatch(packet.text, /\u0000|\u0007/);
  assert.ok(packet.text.length < 1900);
});
