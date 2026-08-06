"use client";

import { useGwapOs } from "./os-provider";

export function SettingsView() {
  const { state, updateSettings, resetWorkspace } = useGwapOs();

  return (
    <div className="os-page">
      <section className="os-page-heading">
        <div>
          <span className="os-kicker">WORKSPACE SETTINGS</span>
          <h1>Control motion, density, and update preferences.</h1>
          <p>
            These preferences apply to GWAP OS on this device and remain free of
            account or database dependencies.
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
            No messages are sent in preview mode. These settings establish the
            preference model for account activation.
          </p>
        </div>

        <div className="os-panel os-danger-panel">
          <div>
            <span>LOCAL DATA</span>
            <h2>Reset this workspace</h2>
            <p>
              Clear the profile, favorites, activity, and settings stored in this browser.
            </p>
          </div>
          <button type="button" onClick={resetWorkspace}>
            Reset local workspace
          </button>
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
