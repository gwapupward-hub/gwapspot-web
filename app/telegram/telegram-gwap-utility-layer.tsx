"use client";

import { useCallback, useEffect, useState } from "react";

type TelegramWebApp = {
  initData: string;
  openLink(url: string): void;
  HapticFeedback?: {
    impactOccurred(style: "light" | "medium" | "heavy" | "rigid" | "soft"): void;
    notificationOccurred(type: "error" | "success" | "warning"): void;
  };
};

type BootstrapData = {
  linkedIdentity: { gnsIdentity: string | null; linkedAt: string } | null;
};

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

const actions = [
  {
    label: "Trust Graph",
    detail: "See what strengthens your credibility.",
    href: "https://www.gwapspot.com/app/trust",
  },
  {
    label: "Verify X account",
    detail: "Launch GWAP Public Proof.",
    href: "https://www.gwapspot.com/app/score#social-verification",
  },
  {
    label: "Relationship Graph",
    detail: "See how your verified identities connect.",
    href: "https://www.gwapspot.com/app/trust/relationships",
  },
  {
    label: "Wallet & portfolio",
    detail: "Open your full GWAP OS wallet workspace.",
    href: "https://www.gwapspot.com/app",
  },
] as const;

export default function TelegramGwapUtilityLayer() {
  const [telegram, setTelegram] = useState<TelegramWebApp | null>(null);
  const [open, setOpen] = useState(false);
  const [identity, setIdentity] = useState<BootstrapData["linkedIdentity"]>(null);
  const [loadingIdentity, setLoadingIdentity] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const haptic = useCallback((type: "tap" | "success" | "error") => {
    const feedback = telegram?.HapticFeedback;
    if (!feedback) return;
    if (type === "tap") feedback.impactOccurred("light");
    else feedback.notificationOccurred(type);
  }, [telegram]);

  const loadIdentity = useCallback(async (webApp: TelegramWebApp) => {
    try {
      const response = await fetch("/api/telegram/mini-app", {
        method: "GET",
        cache: "no-store",
        headers: { "x-telegram-init-data": webApp.initData },
      });
      if (!response.ok) return;
      const payload = (await response.json()) as BootstrapData;
      setIdentity(payload.linkedIdentity);
    } finally {
      setLoadingIdentity(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const detect = () => {
      const webApp = window.Telegram?.WebApp;
      if (!cancelled && webApp?.initData) {
        setTelegram(webApp);
        void loadIdentity(webApp);
        return true;
      }
      return false;
    };

    if (detect()) return () => { cancelled = true; };
    const timer = window.setInterval(() => {
      if (detect()) window.clearInterval(timer);
    }, 250);
    const stop = window.setTimeout(() => window.clearInterval(timer), 2500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.clearTimeout(stop);
    };
  }, [loadIdentity]);

  const openExternal = useCallback((href: string) => {
    if (!telegram) return;
    haptic("tap");
    telegram.openLink(href);
  }, [haptic, telegram]);

  const linkAccount = useCallback(async () => {
    if (!telegram || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/telegram/mini-app", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-telegram-init-data": telegram.initData,
        },
        body: JSON.stringify({ action: "link-token" }),
      });
      const result = (await response.json().catch(() => null)) as { linked?: boolean; gnsIdentity?: string | null; url?: string; error?: string } | null;
      if (!response.ok) throw new Error(result?.error || "Could not start account linking.");
      if (result?.linked) {
        setIdentity({ gnsIdentity: result.gnsIdentity || null, linkedAt: new Date().toISOString() });
        setMessage(result.gnsIdentity ? `Linked as ${result.gnsIdentity}` : "GWAP account linked.");
        haptic("success");
      } else if (result?.url) {
        telegram.openLink(new URL(result.url, window.location.origin).href);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not start account linking.");
      haptic("error");
    } finally {
      setBusy(false);
    }
  }, [busy, haptic, telegram]);

  if (!telegram) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Open GWAP utility actions"
        aria-expanded={open}
        onClick={() => { setOpen((value) => !value); haptic("tap"); }}
        style={{
          position: "fixed",
          right: 14,
          bottom: "calc(78px + env(safe-area-inset-bottom, 0px))",
          zIndex: 70,
          minWidth: 54,
          height: 54,
          borderRadius: 18,
          border: "1px solid rgba(19,221,19,.38)",
          background: "rgba(6,9,7,.94)",
          color: "#13DD13",
          fontWeight: 900,
          letterSpacing: ".05em",
          boxShadow: "0 14px 44px rgba(0,0,0,.38)",
          backdropFilter: "blur(18px)",
        }}
      >
        GWAP
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="false"
          aria-label="GWAP Telegram utilities"
          style={{
            position: "fixed",
            left: 12,
            right: 12,
            bottom: "calc(144px + env(safe-area-inset-bottom, 0px))",
            zIndex: 69,
            maxWidth: 520,
            margin: "0 auto",
            border: "1px solid rgba(255,255,255,.1)",
            borderRadius: 24,
            background: "rgba(7,9,8,.97)",
            color: "#f7f7f7",
            boxShadow: "0 30px 90px rgba(0,0,0,.52)",
            padding: 18,
            backdropFilter: "blur(22px)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start" }}>
            <div>
              <div style={{ color: "#13DD13", fontSize: 11, fontWeight: 900, letterSpacing: ".15em" }}>GWAP UTILITIES</div>
              <h2 style={{ margin: "7px 0 5px", fontSize: 22 }}>Your trust tools, one tap away.</h2>
              <p style={{ margin: 0, color: "#9aa19c", fontSize: 13, lineHeight: 1.5 }}>Telegram stays lightweight. Sensitive wallet signing and full reputation workflows hand off to GWAP OS.</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close GWAP utilities" style={{ border: 0, background: "transparent", color: "#c9ceca", fontSize: 24 }}>×</button>
          </div>

          <div style={{ marginTop: 16, padding: 13, borderRadius: 16, background: "rgba(255,255,255,.035)", border: "1px solid rgba(255,255,255,.08)" }}>
            <div style={{ fontSize: 11, color: "#727a74", letterSpacing: ".12em", fontWeight: 800 }}>GWAP ACCOUNT</div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginTop: 8 }}>
              <strong>{loadingIdentity ? "Checking identity…" : identity?.gnsIdentity || (identity ? "GWAP account linked" : "Not linked yet")}</strong>
              {!loadingIdentity && !identity ? (
                <button type="button" disabled={busy} onClick={() => void linkAccount()} style={{ border: "1px solid rgba(19,221,19,.45)", background: "rgba(19,221,19,.08)", color: "#13DD13", borderRadius: 11, padding: "9px 11px", fontWeight: 800 }}>{busy ? "Linking…" : "Link"}</button>
              ) : null}
            </div>
            {message ? <p style={{ margin: "8px 0 0", color: "#b6bcb8", fontSize: 12 }}>{message}</p> : null}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9, marginTop: 12 }}>
            {actions.map((action) => (
              <button
                key={action.label}
                type="button"
                onClick={() => openExternal(action.href)}
                style={{
                  minHeight: 94,
                  textAlign: "left",
                  borderRadius: 16,
                  border: "1px solid rgba(255,255,255,.08)",
                  background: "rgba(255,255,255,.035)",
                  color: "#f7f7f7",
                  padding: 13,
                }}
              >
                <strong style={{ display: "block", fontSize: 14 }}>{action.label}</strong>
                <span style={{ display: "block", color: "#8e9690", fontSize: 12, lineHeight: 1.45, marginTop: 6 }}>{action.detail}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}
