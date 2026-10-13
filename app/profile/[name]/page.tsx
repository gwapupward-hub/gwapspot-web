import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PpvVerifiedActivity } from "../../components/ppv/ppv-verified-activity";
import type { GnsPublicProfile } from "../../app/lib/gns-profile";
import {
  buildUniversalTrustProfilePath,
  getUniversalTrustProfile,
} from "../../lib/universal-trust-profile";
import styles from "./profile.module.css";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ name: string }>;
};

function safeHttpUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function socialHref(
  platform: keyof GnsPublicProfile["socials"],
  value: string,
) {
  const direct = safeHttpUrl(value);
  if (direct) return direct;
  const handle = value.trim().replace(/^@/, "");
  if (!handle) return null;

  if (platform === "twitter") return `https://x.com/${encodeURIComponent(handle)}`;
  if (platform === "instagram") {
    return `https://instagram.com/${encodeURIComponent(handle)}`;
  }
  if (platform === "telegram") {
    return `https://t.me/${encodeURIComponent(handle)}`;
  }
  return null;
}

function shortenWallet(wallet: string) {
  return wallet.length > 12
    ? `${wallet.slice(0, 6)}…${wallet.slice(-6)}`
    : wallet;
}

function getTrustSummary(profile: GnsPublicProfile) {
  if (profile.verified && !profile.score_hidden && profile.score !== null) {
    return "Identity verified · reputation signal active";
  }
  if (profile.verified) return "Identity verified · reputation still developing";
  if (!profile.score_hidden && profile.score !== null) {
    return "Registered identity · reputation signal active";
  }
  return "Registered identity · build more verified context";
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { name } = await params;
  const result = await getUniversalTrustProfile(name);
  if (result.status !== "found") {
    return {
      title: "Trust Profile | GWAP",
      description: "Public GWAP identity, reputation, and verified activity.",
      robots: { index: false, follow: false },
    };
  }

  const profile = result.profile;
  const canonicalPath = buildUniversalTrustProfilePath(profile.name) || "/";
  const description =
    profile.bio ||
    `Trust profile for ${profile.full_name}: identity, reputation signals, and verified GWAP activity.`;

  return {
    title: `${profile.full_name} — Trust Profile | GWAP`,
    description,
    alternates: { canonical: canonicalPath },
    openGraph: {
      title: `${profile.full_name} — GWAP Trust Profile`,
      description,
      type: "profile",
      url: canonicalPath,
      images: profile.avatar ? [{ url: profile.avatar }] : undefined,
    },
    twitter: {
      card: "summary",
      title: `${profile.full_name} — GWAP Trust Profile`,
      description,
      images: profile.avatar ? [profile.avatar] : undefined,
    },
  };
}

export default async function UniversalTrustProfilePage({ params }: PageProps) {
  const { name } = await params;
  const result = await getUniversalTrustProfile(name);

  if (result.status === "not_found") notFound();

  if (result.status === "unavailable") {
    return (
      <main className={styles.page}>
        <div className={styles.ambient} aria-hidden="true" />
        <section className={styles.unavailable}>
          <span>GWAP TRUST PROFILE</span>
          <h1>Trust data is temporarily unavailable.</h1>
          <p>
            GWAP will not guess when identity evidence cannot be verified. Try the
            profile again after the registry recovers.
          </p>
          <Link href="/">Return to GWAPSpot</Link>
        </section>
      </main>
    );
  }

  const profile = result.profile;
  const banner = safeHttpUrl(profile.banner);
  const avatar = safeHttpUrl(profile.avatar);
  const visibleScore = !profile.score_hidden && profile.score !== null;
  const socialEntries = (
    Object.entries(profile.socials) as Array<
      [keyof GnsPublicProfile["socials"], string | null]
    >
  ).filter((entry): entry is [keyof GnsPublicProfile["socials"], string] =>
    Boolean(entry[1]),
  );
  const safeLinks = profile.links
    .map((link) => ({ ...link, safeUrl: safeHttpUrl(link.url) }))
    .filter((link) => Boolean(link.safeUrl));
  const paymentMethods = [
    profile.payments.sol_enabled ? "SOL" : null,
    profile.payments.usdc_enabled ? "USDC" : null,
  ].filter(Boolean);

  return (
    <main className={styles.page}>
      <div className={styles.ambient} aria-hidden="true" />

      <header className={styles.header}>
        <Link className={styles.brand} href="/">
          <img src="/logos/gwap-agent-clear.svg" alt="" width={38} height={38} />
          <span>
            <strong>GWAP</strong>
            <small>TRUST PROFILE</small>
          </span>
        </Link>
        <Link className={styles.headerAction} href="/app/identity">
          Build your identity
        </Link>
      </header>

      <div className={styles.shell}>
        <section className={styles.hero}>
          <div
            className={styles.banner}
            style={banner ? { backgroundImage: `url(${JSON.stringify(banner)})` } : undefined}
            aria-hidden="true"
          />
          <div className={styles.heroBody}>
            <div className={styles.avatar}>
              {avatar ? (
                <img src={avatar} alt={`${profile.full_name} avatar`} />
              ) : (
                <span>{profile.name.slice(0, 1).toUpperCase()}</span>
              )}
            </div>

            <div className={styles.identityCopy}>
              <div className={styles.identityLine}>
                <h1>{profile.full_name}</h1>
                {profile.verified ? <span className={styles.verified}>Verified</span> : null}
                {profile.is_genesis ? <span className={styles.genesis}>Genesis</span> : null}
              </div>
              <p>{profile.bio || "This identity has not added a public bio yet."}</p>
              <div className={styles.metaRow}>
                <span>{getTrustSummary(profile)}</span>
                <span>Identity owner {shortenWallet(profile.owner)}</span>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.trustGrid} aria-label="Trust snapshot">
          <article className={styles.trustCard}>
            <small>IDENTITY</small>
            <strong>{profile.verified ? "Verified" : "Registered"}</strong>
            <p>
              {profile.status === "active"
                ? `${profile.full_name} is an active GNS identity.`
                : "This GNS identity is currently expired."}
            </p>
          </article>

          <article className={styles.trustCard}>
            <small>REPUTATION</small>
            <strong>
              {profile.score_hidden
                ? "Private"
                : visibleScore
                  ? profile.score
                  : "Developing"}
            </strong>
            <p>
              {profile.score_hidden
                ? "This Genesis identity has chosen not to publish its GwapScore."
                : visibleScore
                  ? profile.score_tier || "GwapScore signal available"
                  : "No public GwapScore is available yet."}
            </p>
          </article>

          <article className={styles.trustCard}>
            <small>PROOF</small>
            <strong>Inspectable</strong>
            <p>PPV activity is shown as factual verified history, not as a trust guarantee.</p>
          </article>
        </section>

        <div className={styles.contentGrid}>
          <div className={styles.primaryColumn}>
            <section className={styles.panel} id="verified-activity">
              <div className={styles.panelHeading}>
                <div>
                  <span>PROOF, NOT CLAIMS</span>
                  <h2>Verified activity</h2>
                </div>
                <span className={styles.liveDot}>Live evidence</span>
              </div>
              <PpvVerifiedActivity
                wallet={profile.owner}
                domain={profile.name}
                title="Identity-bound PPV activity"
                receiptHref={(id) => `/receipt/${id}`}
              />
            </section>

            {safeLinks.length ? (
              <section className={styles.panel}>
                <div className={styles.panelHeading}>
                  <div>
                    <span>PUBLIC LINKS</span>
                    <h2>Work and destinations</h2>
                  </div>
                </div>
                <div className={styles.linkList}>
                  {safeLinks.map((link) => (
                    <a
                      href={link.safeUrl || "#"}
                      key={`${link.title}-${link.order}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <span>{link.title}</span>
                      <strong>↗</strong>
                    </a>
                  ))}
                </div>
              </section>
            ) : null}
          </div>

          <aside className={styles.sidebar}>
            <section className={styles.panel}>
              <div className={styles.panelHeading}>
                <div>
                  <span>PUBLIC PRESENCE</span>
                  <h2>Connected context</h2>
                </div>
              </div>

              {socialEntries.length ? (
                <div className={styles.socialList}>
                  {socialEntries.map(([platform, value]) => {
                    const href = socialHref(platform, value);
                    const label = platform === "twitter" ? "X / Twitter" : platform;
                    return href ? (
                      <a href={href} key={platform} target="_blank" rel="noreferrer">
                        <span>{label}</span>
                        <strong>↗</strong>
                      </a>
                    ) : (
                      <div key={platform}>
                        <span>{label}</span>
                        <strong>{value}</strong>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className={styles.emptyCopy}>No public social accounts are listed yet.</p>
              )}
            </section>

            <section className={styles.panel}>
              <div className={styles.panelHeading}>
                <div>
                  <span>CAPABILITIES</span>
                  <h2>Ready to transact</h2>
                </div>
              </div>
              <dl className={styles.definitionList}>
                <div>
                  <dt>Profile tier</dt>
                  <dd>{profile.tier}</dd>
                </div>
                <div>
                  <dt>Payments</dt>
                  <dd>{paymentMethods.length ? paymentMethods.join(" + ") : "Not enabled"}</dd>
                </div>
                <div>
                  <dt>Identity status</dt>
                  <dd>{profile.status}</dd>
                </div>
              </dl>
            </section>

            <section className={styles.disclaimer}>
              <strong>Trust needs evidence.</strong>
              <p>
                GWAP surfaces identity, reputation signals, and verifiable activity so
                you can make a better decision. No score or badge guarantees future behavior.
              </p>
            </section>
          </aside>
        </div>

        <section className={styles.cta}>
          <span>BUILD YOUR OWN TRUST HISTORY</span>
          <h2>Make your digital credibility easier to verify.</h2>
          <p>
            Create a GWAP identity, build reputation through real activity, and keep
            proof people can inspect when trust matters.
          </p>
          <div>
            <Link href="/app/identity">Start with identity</Link>
            <Link href="/#overview">Explore GWAP</Link>
          </div>
        </section>
      </div>
    </main>
  );
}
