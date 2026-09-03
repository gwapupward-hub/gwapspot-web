"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useExportWallet } from "@privy-io/react-auth/solana";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { GWAP_OS_STORAGE_KEY } from "../lib/os-state";
import { clearWalletPortfolioCache } from "../lib/use-wallet-portfolio";
import { useGwapOs } from "./os-provider";
import { SignOutButton } from "./sign-out-button";

type AccountCore = {
  id: string;
  linkedAccounts: {
    privy: boolean;
    telegram: { userId: string } | null;
  };
  wallets: Array<{
    address: string;
    kind: "embedded" | "external";
    primary: boolean;
  }>;
  primaryWallet: string;
  primaryGnsIdentity: string | null;
  createdAt: string;
  updatedAt: string;
};

function compactId(value: string) {
  return value.length > 20 ? `${value.slice(0, 10)}…${value.slice(-6)}` : value;
}

export function SettingsView() {
  const router = useRouter();
  const { getAccessToken, logout } = usePrivy();
  const { exportWallet } = useExportWallet();
  const { account, state, syncStatus, updateSettings, resetWorkspace } = useGwapOs();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [accountError, setAccountError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [accountCore, setAccountCore] = useState<AccountCore | null>(null);
  const [accountCoreError, setAccountCoreError] = useState("");

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const token = await getAccessToken();
        const response = await fetch("/api/account", {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          credentials: "same-origin",
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => null)) as AccountCore | { error?: string } | null;
        if (!active) return;
        if (!response.ok || !payload || !("id" in payload)) {
          setAccountCoreError(payload && "error" in payload && typeof payload.error === "string" ? payload.error : "Unified account status is unavailable.");
          return;
        }
        setAccountCore(payload);
        setAccountCoreError("");
      } catch {
        if (active) setAccountCoreError("Unified account status is unavailable.");
      }
    })();
    return () => {
      active = false;
    };
  }, [getAccessToken]);

  async function exportEmbeddedWallet() {
    if (!account.embeddedWallet) return;
    setExporting(true);
    setAccountError("");
    try {
      await exportWallet({ address: account.embeddedWallet });
    } catch {
      setAccountError("We could not open the wallet export. Please retry.");
    } finally {
      setExporting(false);
    }
  }

  async function deleteAccount() {
    setDeleting(true);
    setAccountError("");

    try {
      const token = await getAccessToken();
      const response = await fetch("/api/account", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ confirmation: "DELETE" }),
        credentials: "same-origin",
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: unknown;
        };
        throw new Error(
          typeof body.error === "string"
            ? body.error
            : "Account deletion failed",
        );
      }

      await logout().catch(() => undefined);
      window.localStorage.removeItem(GWAP_OS_STORAGE_KEY);
      clearWalletPortfolioCache();
      router.replace("/");
      router.refresh();
    } catch (error) {
      setAccountError(
        error instanceof Error
          ? error.message
          : "We could not delete the account. Please retry.",
      );
      setDeleting(false);
    }
  }

  return (
    <div className="os-page os-runtime-page">
      <header className="os-runtime-heading">
        <span className="os-terminal-label">~/settings</span>
        <h1>Runtime preferences.</h1>
        <p>Control boot behavior, motion, density, notifications, account links, and wallet security.</p>
      </header>

      <section className="os-settings-grid">
        <div className="os-panel os-settings-panel">
          <div className="os-panel-heading"><div><span>EXPERIENCE</span><h2>Interface preferences</h2></div></div>
          <SettingToggle title="Boot sequence" description="Play the GWAP OS terminal boot when entering the workspace. Return visits use the short sequence." checked={state.settings.bootAnimation} onChange={(bootAnimation) => updateSettings({ bootAnimation })} />
          <SettingToggle title="Compact application cards" description="Reduce card spacing and show more products at once." checked={state.settings.compactMode} onChange={(compactMode) => updateSettings({ compactMode })} />
          <SettingToggle title="Reduce interface motion" description="Disable nonessential GWAP OS animation and glow movement." checked={state.settings.reduceMotion} onChange={(reduceMotion) => updateSettings({ reduceMotion })} />
        </div>

        <div className="os-panel os-settings-panel">
          <div className="os-panel-heading"><div><span>COMMUNICATION</span><h2>Notification preferences</h2></div></div>
          <SettingToggle title="Product release updates" description="Prepare to receive important ecosystem launch updates." checked={state.settings.productUpdates} onChange={(productUpdates) => updateSettings({ productUpdates })} />
          <SettingToggle title="Community announcements" description="Prepare to receive selected GWAP community updates." checked={state.settings.communityUpdates} onChange={(communityUpdates) => updateSettings({ communityUpdates })} />
          <p className="os-settings-note">No messages are sent until a notification channel is activated.</p>
        </div>

        <div className="os-panel os-settings-panel">
          <div className="os-panel-heading"><div><span>GWAP ACCOUNT CORE</span><h2>{accountCore ? "Unified identity online" : "Resolving identity…"}</h2></div><small>{accountCore?.linkedAccounts.telegram ? "Telegram linked" : "OS linked"}</small></div>
          {accountCore ? (
            <>
              <p className="os-settings-note">GWAP ID · {compactId(accountCore.id)}</p>
              <p className="os-settings-note">Privy · Connected ✅ · Telegram · {accountCore.linkedAccounts.telegram ? `Connected ✅ (${compactId(accountCore.linkedAccounts.telegram.userId)})` : "Not linked"}</p>
              <p className="os-settings-note">Wallets · {accountCore.wallets.length} linked · Primary · {accountCore.primaryWallet.slice(0, 4)}…{accountCore.primaryWallet.slice(-4)}</p>
              <p className="os-settings-note">GNS · {accountCore.primaryGnsIdentity ? `${accountCore.primaryGnsIdentity}.gwap` : "No primary identity mounted"}</p>
              {!accountCore.linkedAccounts.telegram ? <p className="os-settings-note">To connect Telegram, open the Daily Ideas Mini App in Telegram and choose Connect GWAP Account. The one-time link will attach Telegram to this GWAP ID.</p> : null}
            </>
          ) : null}
          {accountCoreError ? <small role="alert">{accountCoreError}</small> : null}
        </div>

        <div className="os-panel os-settings-panel">
          <div className="os-panel-heading"><div><span>WALLET & SESSION</span><h2>{account.displayName}</h2></div><small>{syncStatus === "error" ? "Sync paused" : "Verified"}</small></div>
          <p className="os-settings-note">{account.email} · {account.walletProvider === "embedded" ? "Email-created wallet" : "External wallet"}{` · ${account.verifiedWallet.slice(0, 4)}…${account.verifiedWallet.slice(-4)}`}</p>
          <div className="os-account-actions">
            {account.embeddedWallet ? <button type="button" disabled={exporting} onClick={() => void exportEmbeddedWallet()}>{exporting ? "Opening export…" : "Export embedded wallet"}</button> : null}
            <SignOutButton />
          </div>
          {account.embeddedWallet ? <p className="os-settings-note">Store an exported private key somewhere secure before deleting this account. GWAPSpot never receives the key.</p> : null}
          {accountError ? <small role="alert">{accountError}</small> : null}
        </div>

        <div className="os-panel os-danger-panel"><div><span>ACCOUNT DATA</span><h2>Reset this workspace</h2><p>Clear the synced profile, favorites, activity, and settings while keeping the wallet account active.</p></div><button type="button" onClick={resetWorkspace}>Reset workspace data</button></div>

        <div className="os-panel os-danger-panel">
          <div><span>PERMANENT ACTION</span><h2>Delete GWAP OS account</h2><p>Permanently delete the unified GWAP account, active sessions, Telegram account link, verified wallet connection, workspace data, linked Daily Ideas state, and developer API keys. This cannot be undone. An active paid developer subscription must be canceled first.{account.embeddedWallet ? " Deleting before export can permanently remove access to the email-created wallet." : " Your external wallet itself is not deleted."}</p></div>
          {confirmDelete ? <div className="os-delete-confirmation"><button type="button" onClick={() => setConfirmDelete(false)} disabled={deleting}>Cancel</button><button type="button" onClick={() => void deleteAccount()} disabled={deleting}>{deleting ? "Deleting…" : "Delete permanently"}</button></div> : <button type="button" onClick={() => setConfirmDelete(true)}>Delete account</button>}
        </div>
      </section>
    </div>
  );
}

function SettingToggle({ title, description, checked, onChange }: { title: string; description: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="os-setting-row">
      <span><strong>{title}</strong><small>{description}</small></span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <i aria-hidden="true" />
    </label>
  );
}
