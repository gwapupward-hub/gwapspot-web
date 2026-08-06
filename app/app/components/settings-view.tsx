"use client";

import { useClerk } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { GWAP_OS_STORAGE_KEY } from "../lib/os-state";
import { useGwapOs } from "./os-provider";

export function SettingsView() {
  const clerk = useClerk();
  const router = useRouter();
  const { account, state, syncStatus, updateSettings, resetWorkspace } = useGwapOs();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [accountError, setAccountError] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function deleteAccount() {
    setDeleting(true);
    setAccountError("");

    try {
      const response = await fetch("/api/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: "DELETE" }),
        credentials: "same-origin",
      });
      if (!response.ok) throw new Error("Account deletion failed");

      window.localStorage.removeItem(GWAP_OS_STORAGE_KEY);
      router.replace("/");
      router.refresh();
    } catch {
      setAccountError("We could not delete the account. Please retry.");
      setDeleting(false);
    }
  }

  return (
    <div className="os-page">
      <section className="os-page-heading">
        <div>
          <span className="os-kicker">WORKSPACE SETTINGS</span>
          <h1>Control motion, density, and update preferences.</h1>
          <p>
            These preferences sync securely across every device signed in to your
            GWAP OS account.
          </p>
        </div>
      </section>

      <section className="os-settings-grid">
        <div className="os-panel os-settings-panel">
          <div className="os-panel-heading">
            <div>
              <span>EXPERIENCE</span>
              <h2>Interface preferences</h2>
            </div>
          </div>

          <SettingToggle
            title="Compact application cards"
            description="Reduce card spacing and show more products at once."
            checked={state.settings.compactMode}
            onChange={(compactMode) => updateSettings({ compactMode })}
          />
          <SettingToggle
            title="Reduce interface motion"
            description="Disable nonessential GWAP OS animation and glow movement."
            checked={state.settings.reduceMotion}
            onChange={(reduceMotion) => updateSettings({ reduceMotion })}
          />
        </div>

        <div className="os-panel os-settings-panel">
          <div className="os-panel-heading">
            <div>
              <span>COMMUNICATION</span>
              <h2>Future notification preferences</h2>
            </div>
          </div>

          <SettingToggle
            title="Product release updates"
            description="Prepare to receive important ecosystem launch updates."
            checked={state.settings.productUpdates}
            onChange={(productUpdates) => updateSettings({ productUpdates })}
          />
          <SettingToggle
            title="Community announcements"
            description="Prepare to receive selected GWAP community updates."
            checked={state.settings.communityUpdates}
            onChange={(communityUpdates) => updateSettings({ communityUpdates })}
          />
          <p className="os-settings-note">
            No messages are sent until a notification channel is activated.
          </p>
        </div>

        <div className="os-panel os-settings-panel">
          <div className="os-panel-heading">
            <div>
              <span>ACCOUNT & SESSIONS</span>
              <h2>{account.displayName}</h2>
            </div>
            <small>{syncStatus === "error" ? "Sync paused" : "Protected"}</small>
          </div>
          <p className="os-settings-note">
            {account.email}
            {account.verifiedWallet
              ? ` · Wallet ${account.verifiedWallet.slice(0, 4)}…${account.verifiedWallet.slice(-4)}`
              : " · No Solana wallet linked"}
          </p>
          <div className="os-account-actions">
            <button type="button" onClick={() => clerk.openUserProfile()}>
              Manage account
            </button>
            <button type="button" onClick={() => void clerk.signOut({ redirectUrl: "/" })}>
              Sign out
            </button>
          </div>
        </div>

        <div className="os-panel os-danger-panel">
          <div>
            <span>ACCOUNT DATA</span>
            <h2>Reset this workspace</h2>
            <p>
              Clear the synced profile, favorites, activity, and settings while
              keeping the account active.
            </p>
          </div>
          <button type="button" onClick={resetWorkspace}>
            Reset workspace data
          </button>
        </div>

        <div className="os-panel os-danger-panel">
          <div>
            <span>PERMANENT ACTION</span>
            <h2>Delete GWAP OS account</h2>
            <p>
              Permanently delete the account, sessions, verified connections, and
              workspace data. This cannot be undone.
            </p>
            {accountError ? <small role="alert">{accountError}</small> : null}
          </div>
          {confirmDelete ? (
            <div className="os-delete-confirmation">
              <button type="button" onClick={() => setConfirmDelete(false)} disabled={deleting}>
                Cancel
              </button>
              <button type="button" onClick={() => void deleteAccount()} disabled={deleting}>
                {deleting ? "Deleting…" : "Delete permanently"}
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmDelete(true)}>
              Delete account
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

function SettingToggle({
  title,
  description,
  checked,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="os-setting-row">
      <span>
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <i aria-hidden="true" />
    </label>
  );
}
