"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useCallback, useEffect, useMemo, useState } from "react";

type DeveloperKey = {
  id: string;
  label: string;
  preview: string;
  plan: "developer" | "growth" | "scale";
  status: "active" | "revoked";
  createdAt: string;
  revokedAt: string | null;
  usage: {
    used: number;
    limit: number;
    remaining: number;
    resetAt: string;
  };
};

type KeysResponse = { keys?: DeveloperKey[]; error?: string };
type CreateResponse = {
  apiKey?: string;
  key?: Omit<DeveloperKey, "usage">;
  warning?: string;
  error?: string;
};

export function DeveloperView() {
  const { getAccessToken } = usePrivy();
  const [keys, setKeys] = useState<DeveloperKey[]>([]);
  const [label, setLabel] = useState("Production");
  const [secret, setSecret] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const activeKeys = useMemo(() => keys.filter((key) => key.status === "active"), [keys]);

  const authHeaders = useCallback(async () => {
    const token = await getAccessToken();
    return {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }, [getAccessToken]);

  const loadKeys = useCallback(async () => {
    setError("");
    try {
      const response = await fetch("/api/v1/developer/keys", {
        headers: await authHeaders(),
        credentials: "same-origin",
        cache: "no-store",
      });
      const body = (await response.json()) as KeysResponse;
      if (!response.ok) throw new Error(body.error || "Unable to load API keys");
      setKeys(body.keys || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load API keys");
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    void loadKeys();
  }, [loadKeys]);

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
      await loadKeys();
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
      await loadKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to revoke API key");
    }
  }

  return (
    <div className="os-page os-runtime-page">
      <header className="os-runtime-heading">
        <span className="os-terminal-label">~/developer</span>
        <h1>GWAP Intelligence API.</h1>
        <p>Create credentials, monitor usage, and integrate GNS identity, GwapScore, portfolio intelligence, and wallet exposure risk through one endpoint.</p>
      </header>

      <section className="os-settings-grid">
        <div className="os-panel os-settings-panel">
          <div className="os-panel-heading"><div><span>ENDPOINT</span><h2>Wallet Intelligence v1</h2></div><small>Server-to-server</small></div>
          <code>GET /api/v1/b2b/intelligence/:wallet</code>
          <p className="os-settings-note">Send the key as <code>x-api-key: gwap_live_…</code> or <code>Authorization: Bearer gwap_live_…</code>.</p>
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
          <div className="os-panel-heading"><div><span>API KEYS</span><h2>Credentials & monthly usage</h2></div><small>{loading ? "Loading…" : `${keys.length} total`}</small></div>
          {!loading && keys.length === 0 ? <p className="os-settings-note">No developer keys yet. Create one above to activate B2B access.</p> : null}
          {keys.map((key) => {
            const percent = key.usage.limit > 0 ? Math.min(100, Math.round((key.usage.used / key.usage.limit) * 100)) : 0;
            return (
              <div className="os-setting-row" key={key.id}>
                <span>
                  <strong>{key.label} · {key.preview}</strong>
                  <small>{key.plan.toUpperCase()} · {key.usage.used.toLocaleString()} / {key.usage.limit.toLocaleString()} requests this month ({percent}%) · resets {new Date(key.usage.resetAt).toLocaleDateString()}</small>
                </span>
                {key.status === "active" ? <button type="button" onClick={() => void revokeKey(key.id)}>Revoke</button> : <small>Revoked</small>}
              </div>
            );
          })}
        </div>

        <div className="os-panel os-settings-panel">
          <div className="os-panel-heading"><div><span>QUOTAS</span><h2>Current plan model</h2></div></div>
          <p className="os-settings-note"><strong>Developer:</strong> 1,000 requests/month · 60 requests/minute. Growth and Scale limits are supported by the gateway but upgrades/billing are intentionally not exposed until the billing sprint.</p>
        </div>
      </section>
    </div>
  );
}
