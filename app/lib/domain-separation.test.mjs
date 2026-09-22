import assert from "node:assert/strict";
import test from "node:test";
import nextConfig from "../../next.config.ts";

test("public hosts permanently redirect GWAP OS routes to app.gwapspot.com", async () => {
  const redirects = await nextConfig.redirects?.();
  assert.ok(Array.isArray(redirects));

  const expectedSources = [
    "/app",
    "/app/:path*",
    "/sign-in",
    "/sign-in/:path*",
    "/refresh",
    "/os-entry",
    "/os-entry/:path*",
    "/os-sign-in",
    "/os-sign-in/:path*",
  ];

  for (const host of ["gwapspot.com", "www.gwapspot.com"]) {
    for (const source of expectedSources) {
      const match = redirects.find(
        (redirect) =>
          redirect.source === source &&
          redirect.has?.some(
            (condition) => condition.type === "host" && condition.value === host,
          ),
      );

      assert.ok(match, `missing ${host}${source} redirect`);
      assert.equal(match.permanent, true);
      assert.equal(
        match.destination,
        `https://app.gwapspot.com${source}`,
      );
    }
  }
});

test("bare gwapspot.com still canonicalizes non-app routes to www", async () => {
  const redirects = await nextConfig.redirects?.();
  const fallback = redirects?.find(
    (redirect) =>
      redirect.source === "/:path*" &&
      redirect.has?.some(
        (condition) =>
          condition.type === "host" && condition.value === "gwapspot.com",
      ),
  );

  assert.ok(fallback);
  assert.equal(fallback.destination, "https://www.gwapspot.com/:path*");
  assert.equal(fallback.permanent, true);
});
