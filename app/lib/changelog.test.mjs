import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLogEntries,
  escapeXml,
  latestBuildLogEntry,
  renderBuildLogRss,
} from "./changelog.ts";

test("build log entries stay unique and newest-first", () => {
  assert.ok(buildLogEntries.length >= 8);
  assert.equal(new Set(buildLogEntries.map((entry) => entry.slug)).size, buildLogEntries.length);

  const timestamps = buildLogEntries.map((entry) => Date.parse(entry.releasedAt));
  assert.deepEqual(timestamps, timestamps.toSorted((left, right) => right - left));
  assert.equal(latestBuildLogEntry, buildLogEntries[0]);
});

test("build log entries expose useful, internal destinations", () => {
  for (const entry of buildLogEntries) {
    assert.match(entry.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.equal(entry.status, "Live");
    assert.ok(entry.highlights.length >= 2);
    assert.ok(entry.links.length >= 1);
    assert.ok(entry.links.every((link) => link.href.startsWith("/")));
  }
});

test("RSS output is valid, complete, and XML-escaped", () => {
  assert.equal(escapeXml('GWAP & <GNS> "live"'), "GWAP &amp; &lt;GNS&gt; &quot;live&quot;");

  const rss = renderBuildLogRss();
  assert.match(rss, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(rss, /<rss version="2\.0"/);
  assert.match(rss, /<atom:link[^>]+application\/rss\+xml/);

  for (const entry of buildLogEntries) {
    assert.match(rss, new RegExp(`<guid isPermaLink="true">[^<]+#${entry.slug}</guid>`));
  }
});
