"use client";

import { useClerk } from "@clerk/nextjs";
import { useState, type FormEvent } from "react";
import { getProfileCompletion, type GwapProfile } from "../lib/os-state";
import { useGwapOs } from "./os-provider";

export function ProfileView() {
  const { account, state, syncStatus, updateProfile } = useGwapOs();
  return (
    <ProfileForm
      account={account}
      key={state.profile.updatedAt || "default-profile"}
      profile={state.profile}
      syncStatus={syncStatus}
      onSave={updateProfile}
    />
  );
}

function ProfileForm({
  account,
  profile,
  syncStatus,
  onSave,
}: {
  account: { verifiedWallet: string };
  profile: GwapProfile;
  syncStatus: "idle" | "saving" | "saved" | "error";
  onSave: (profile: Omit<GwapProfile, "updatedAt">) => void;
}) {
  const clerk = useClerk();
  const [saved, setSaved] = useState(false);
  const completion = getProfileCompletion(profile);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSave({
      displayName: String(form.get("displayName") ?? "").trim(),
      handle: String(form.get("handle") ?? "").trim().replace(/^@/, ""),
      bio: String(form.get("bio") ?? "").trim(),
      primaryWallet: account.verifiedWallet,
      website: String(form.get("website") ?? "").trim(),
      location: String(form.get("location") ?? "").trim(),
    });
    setSaved(true);
  }

  return (
    <div className="os-page">
      <section className="os-page-heading">
        <div>
          <span className="os-kicker">UNIFIED PROFILE</span>
          <h1>Build the identity behind your ecosystem access.</h1>
          <p>
            Your account-backed profile is ready for future GNS identity,
            reputation, and product access.
          </p>
        </div>
        <div className="os-completion-badge">
          <strong>{completion}%</strong>
          <span>complete</span>
        </div>
      </section>

      <section className="os-profile-layout">
        <form className="os-panel os-profile-form" onSubmit={handleSubmit}>
          <div className="os-panel-heading">
            <div>
              <span>PROFILE DETAILS</span>
              <h2>Public identity foundation</h2>
            </div>
            {saved ? (
              <small role="status">
                {syncStatus === "error"
                  ? "Saved locally — sync needs attention"
                  : syncStatus === "saving"
                    ? "Syncing to account…"
                    : "Saved to your account"}
              </small>
            ) : null}
          </div>

          <div className="os-form-grid">
            <label>
              <span>Display name</span>
              <input
                name="displayName"
                defaultValue={profile.displayName}
                autoComplete="name"
                required
              />
            </label>
            <label>
              <span>GWAP handle</span>
              <div className="os-prefixed-input">
                <i>@</i>
                <input
                  name="handle"
                  defaultValue={profile.handle}
                  autoComplete="username"
                  required
                  pattern="[A-Za-z0-9._-]+"
                />
              </div>
            </label>
            <label className="os-field-wide">
              <span>Bio</span>
              <textarea
                name="bio"
                defaultValue={profile.bio}
                rows={4}
                maxLength={240}
                placeholder="What are you building with purpose?"
              />
            </label>
            <label className="os-field-wide">
              <span>Verified Solana wallet</span>
              <input
                name="primaryWallet"
                value={account.verifiedWallet || "No verified wallet connected"}
                readOnly
                spellCheck={false}
              />
              <small>
                Wallet ownership is verified by a signed Clerk challenge; signatures
                are never stored by GWAPSpot.
              </small>
            </label>
            <label>
              <span>Website</span>
              <input
                name="website"
                type="url"
                defaultValue={profile.website}
                autoComplete="url"
                placeholder="https://"
              />
            </label>
            <label>
              <span>Location</span>
              <input
                name="location"
                defaultValue={profile.location}
                autoComplete="address-level2"
                placeholder="City, state or region"
              />
            </label>
          </div>

          <div className="os-form-actions">
            <button className="os-primary-action" type="submit">
              Save profile
            </button>
            <small>Encrypted session · account-backed sync</small>
          </div>
        </form>

        <aside className="os-side-stack">
          <section className="os-panel os-profile-preview">
            <span>PROFILE PREVIEW</span>
            <div className="os-preview-avatar">
              {profile.displayName
                .split(/\s+/)
                .filter(Boolean)
                .slice(0, 2)
                .map((part) => part[0]?.toUpperCase())
                .join("") || "GW"}
            </div>
            <h2>{profile.displayName}</h2>
            <strong>@{profile.handle || "gwap-builder"}</strong>
            <p>{profile.bio || "Your purpose statement will appear here."}</p>
          </section>

          <section className="os-panel os-account-panel">
            <span>SECURITY & IDENTITY</span>
            <h2>Verified connections</h2>
            <p>
              Manage email, Google, GitHub, Solana wallets, active sessions, and
              account security from one protected profile.
            </p>
            <button
              className="os-secondary-action"
              type="button"
              onClick={() => clerk.openUserProfile()}
            >
              Manage sign-in methods
            </button>
          </section>
        </aside>
      </section>
    </div>
  );
}
