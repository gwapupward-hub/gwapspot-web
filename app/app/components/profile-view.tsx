"use client";

import { useState, type FormEvent } from "react";
import { getProfileCompletion, type GwapProfile } from "../lib/os-state";
import { useGwapOs } from "./os-provider";

export function ProfileView() {
  const { state, updateProfile } = useGwapOs();
  return (
    <ProfileForm
      key={state.profile.updatedAt || "default-profile"}
      profile={state.profile}
      onSave={updateProfile}
    />
  );
}

function ProfileForm({
  profile,
  onSave,
}: {
  profile: GwapProfile;
  onSave: (profile: Omit<GwapProfile, "updatedAt">) => void;
}) {
  const [saved, setSaved] = useState(false);
  const completion = getProfileCompletion(profile);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSave({
      displayName: String(form.get("displayName") ?? "").trim(),
      handle: String(form.get("handle") ?? "").trim().replace(/^@/, ""),
      bio: String(form.get("bio") ?? "").trim(),
      primaryWallet: String(form.get("primaryWallet") ?? "").trim(),
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
            This local profile establishes the data model for a future GNS-backed
            identity. Nothing entered here leaves this browser in Sprint 5.
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
            {saved ? <small role="status">Saved on this device</small> : null}
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
              <span>Primary wallet</span>
              <input
                name="primaryWallet"
                defaultValue={profile.primaryWallet}
                spellCheck={false}
                placeholder="Solana wallet address"
              />
              <small>Stored locally. Wallet verification is not active yet.</small>
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
            <small>Local browser storage only</small>
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
            <span>NEXT IDENTITY LAYER</span>
            <h2>GNS connection</h2>
            <p>
              A later sprint will map this profile to an owned .gwap name, verified
              wallets, GwapScore, and selective privacy controls.
            </p>
          </section>
        </aside>
      </section>
    </div>
  );
}
