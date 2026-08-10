"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useCallback, useEffect, useMemo, useState } from "react";

type Plan = "developer" | "growth" | "scale";

type Usage = {
  used: number;
  limit: number;
  remaining: number;
  resetAt: string;
};

type DeveloperKey = {
  id: string;
  label: string;
  preview: string;
  plan: Plan;
  status: "active" | "revoked";
  createdAt: string;
  revokedAt: string | null;
  usage: Usage;
};

type KeysResponse = {
  plan?: Plan;
  usage?: Usage;
  keys?: DeveloperKey[];
  error?: string;
};

type CreateResponse = {
  apiKey?: string;
  key?: Omit<DeveloperKey, "usage">;
  warning?: string;
  error?: string;
};

type BillingResponse = {
  entitlement?: {
    plan: Plan;
    status: "free" | "active" | "past_due" | "canceled";
    currentPeriodEnd: string | null;
  };
  configuration?: {
    checkoutAvailable: { growth: boolean; scale: boolean };
  };
  plans?: Record<Plan, { requestsPerMonth: number; requestsPerMinute: number }>;
  error?: string;
};

type AnalyticsResponse = {
  daily?: Array<{ date: string; requests: number }>;
  error?: string;
};

export function DeveloperView() {
  const { getAccessToken } = usePrivy();
  const [keys, setKeys] = useState<DeveloperKey[]>([]);
  const [plan, setPlan] = useState<Plan>("developer");
  const [usage, setUsage] = useState<Usage | null>(null);
  const [billing, setBilling] = useState<BillingResponse | null>(null);
  const [daily, setDaily] = useState<Array<{ date: string; requests: number }>>([]);
  const [label, setLabel] = useState("Production");
  const [secret, setSecret] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [upgrading, setUpgrading] = useState<Plan | null>(null);
  const [error, setError] = useState("");

  const activeKeys = useMemo(
    () => keys.filter((key) => key.status === "active"),
    [keys],
  );

  const authHeaders = useCallback(async () => {
    const token = await getAccessToken();
    return {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }, [getAccessToken]);

  const loadDashboard = useCallback(async () => {
    setError("");
    try {
      const headers = await authHeaders();
      const [keysResponse, billingResponse, analyticsResponse] = await Promise.all([
        fetch("/api/v1/developer/keys", {
          headers,
          credentials: "same-origin",
          cache: "no-store",
        }),
        fetch("/api/v1/developer/billing/status", {
          headers,
          credentials: "same-origin",
          cache: "no-store",
        }),
        fetch("/api/v1/developer/analytics?days=30", {
          headers,
          credentials: "same-origin",
          cache: "no-store",
        }),
      ]);
      const keyBody = (await keysResponse.json()) as KeysResponse;
      const billingBody = (await billingResponse.json()) as BillingResponse;
      const analyticsBody = (await analyticsResponse.json()) as AnalyticsResponse;
      if (!keysResponse.ok) throw new Error(keyBody.error || "Unable to load API keys");
      if (!billingResponse.ok) throw new Error(billingBody.error || "Unable to load billing");
      if (!analyticsResponse.ok) throw new Error(analyticsBody.error || "Unable to load analytics");

      setKeys(keyBody.keys || []);
      setPlan(keyBody.plan || "developer");
      setUsage(keyBody.usage || null);
      setBilling(billingBody);
      setDaily(analyticsBody.daily || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load developer workspace");
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadDashboard(), 0);
    return () => window.clearTimeout(timer);
  }, [loadDashboard]);

  async function createKey() {
    setCreating(true);
    setError("");
    setSecret("");
    try {
      const response = await fetch("/api/v1/developer/keys", {
        method: "POST",
        headers: await authHeaders(),
        credentials: "same-origin",
        body: JSON.stringify({ label }),
      });
      const body = (await response.json()) as CreateResponse;
      if (!response.ok || !body.apiKey) throw new Error(body.error || "Unable to create API key");
      setSecret(body.apiKey);
      await loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create API key");
    } finally {
      setCreating(false);
    }
  }

  async function revokeKey(keyId: string) {
    setError("");
    try {
      const response = await fetch("/api/v1/developer/keys", {
        method: "DELETE",
        headers: await authHeaders(),
        credentials: "same-origin",
        body: JSON.stringify({ keyId }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || "Unable to revoke API key");
      }
      await loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to revoke API key");
    }
  }

  async function startCheckout(targetPlan: "growth" | "scale") {
    setUpgrading(targetPlan);
    setError("");
    try {
      const response = await fetch("/api/v1/developer/billing/checkout", {
        method: "POST",
        headers: await authHeaders(),
        credentials: "same-origin",
        body: JSON.stringify({ plan: targetPlan }),
      });
      const body = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !body.url) throw new Error(body.error || "Unable to start checkout");
      window.location.assign(body.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to start checkout");
      setUpgrading(null);
    }
  }

  const recentDaily = daily.slice(-7);
  const paidActive =
    billing?.entitlement?.plan !== "developer" &&
    (billing?.entitlement?.status === "active" || billing?.entitlement?.status === "past_due");

  return (
    <div className="os-page os-runtime-page">
      <header className="os-runtime-heading">
        <span className="os-terminal-label">~/developer</span>
        <h1>GWAP Intelligence API.</h1>
        <p>Create credentials, monitor usage, manage API capacity, and integrate GNS identity, GwapScore, portfolio intelligence, and wallet exposure risk through one endpoint.</p>
      </header>

      <section className="os-settings-grid">
        <div className="os-panel os-settings-panel">
          <div className="os-panel-heading"><div><span>ENDPOINT</span><h2>Wallet Intelligence v1</h2></div><small>Server-to-server</small></div>
          <code>GET /api/v1/b2b/intelligence/:wallet</code>
          <p className="os-settings-note">Send the key as <code>x-api-key: gwap_live_…</code> or <code>Authorization: Bearer gwap_live_…</code>.</p>
        </div>

        <div className="os-panel os-settings-panel">
          <div className="os-panel-heading"><div><span>CURRENT PLAN</span><h2>{plan.toUpperCase()}</h2></div><small>{billing?.entitlement?.status || "free"}</small></div>
          <p className="os-settings-note">
            {usage ? `${usage.used.toLocaleString()} / ${usage.limit.toLocaleString()} account requests used this month · ${usage.remaining.toLocaleString()} remaining · resets ${new Date(usage.resetAt).toLocaleDateString()}` : "Usage loading…"}
          </p>
          {billing?.entitlement?.currentPeriodEnd ? <p className="os-settings-note">Current billing period ends {new Date(billing.entitlement.currentPeriodEnd).toLocaleDateString()}.</p> : null}
        </div>

        <div className="os-panel os-settings-panel">
          <div className="os-panel-heading"><div><span>PLANS</span><h2>Increase API capacity</h2></div><small>Stripe checkout</small></div>
          {(["growth", "scale"] as const).map((targetPlan) => {
            const limits = billing?.plans?.[targetPlan];
            const available = billing?.configuration?.checkoutAvailable[targetPlan] === true;
            return (
              <div className="os-setting-row" key={targetPlan}>
                <span>
                  <strong>{targetPlan.toUpperCase()}</strong>
                  <small>{limits ? `${limits.requestsPerMonth.toLocaleString()} requests/month · ${limits.requestsPerMinute.toLocaleString()}/minute · price shown at checkout` : "Plan details loading…"}</small>
                </span>
                <button type="button" disabled={!available || paidActive || upgrading !== null} onClick={() => void startCheckout(targetPlan)}>
                  {upgrading === targetPlan ? "Opening…" : paidActive ? "Paid plan active" : available ? `Choose ${targetPlan}` : "Not configured"}
                </button>
              </div>
            );
          })}
        </div>

        <div className="os-panel os-settings-panel">
          <div className="os-panel-heading"><div><span>USAGE ANALYTICS</span><h2>Last 7 days</h2></div><small>Account-wide</small></div>
          {recentDaily.map((entry) => (
            <div className="os-setting-row" key={entry.date}>
              <span><strong>{new Date(`${entry.date}T00:00:00Z`).toLocaleDateString()}</strong><small>Authorized B2B requests</small></span>
              <strong>{entry.requests.toLocaleString()}</strong>
            </div>
          ))}
          {!loading && recentDaily.length === 0 ? <p className="os-settings-note">No usage has been recorded yet.</p> : null}
        </div>

        <div className="os-panel os-settings-panel">
          <div className="os-panel-heading"><div><span>NEW KEY</span><h2>Create API credential</h2></div><small>{activeKeys.length}/3 active</small></div>
          <label className="os-setting-row">
            <span><strong>Key label</strong><small>Use a name that identifies the integration.</small></span>
            <input value={label} maxLength={48} onChange={(event) => setLabel(event.target.value)} aria-label="API key label" />
          </label>
          <div className="os-account-actions"><button type="button" onClick={() => void createKey()} disabled={creating || activeKeys.length >= 3}>{creating ? "Creating…" : "Create API key"}</button></div>
          {secret ? (
            <div className="os-delete-confirmation" role="status">
              <div><strong>Copy this key now.</strong><small>It will not be shown again.</small></div>
              <code>{secret}</code>
              <button type="button" onClick={() => void navigator.clipboard.writeText(secret)}>Copy key</button>
            </div>
          ) : null}
          {error ? <small role="alert">{error}</small> : null}
        </div>

        <div className="os-panel os-settings-panel">
          <div className="os-panel-heading"><div><span>API KEYS</span><h2>Credentials</h2></div><small>{loading ? "Loading…" : `${keys.length} total`}</small></div>
          {!loading && keys.length === 0 ? <p className="os-settings-note">No developer keys yet. Create one above to activate B2B access.</p> : null}
          {keys.map((key) => (
            <div className="os-setting-row" key={key.id}>
              <span>
                <strong>{key.label} · {key.preview}</strong>
                <small>{plan.toUpperCase()} · created {new Date(key.createdAt).toLocaleDateString()}</small>
              </span>
              {key.status === "active" ? <button type="button" onClick={() => void revokeKey(key.id)}>Revoke</button> : <small>Revoked</small>}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
