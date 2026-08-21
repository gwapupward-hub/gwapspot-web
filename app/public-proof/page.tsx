import Link from "next/link";
import { ArrowIcon, PageHero, PageShell, SparkIcon } from "../components/site-shell";
import { createPageMetadata } from "../lib/metadata";

export const metadata = createPageMetadata({
  title: "GWAP Public Proof — X Proof of Control",
  description:
    "Verify control of an X account by publishing a one-time GWAP challenge. GWAP reads the submitted public X post through the X API v2 and verifies the post author before issuing a Proof-of-Control credential.",
  path: "/public-proof",
});

const steps = [
  "Claim the X handle you control inside GWAP OS.",
  "Choose a GWAP share theme and generate a one-time Public Proof challenge.",
  "Publish the generated verification message from the claimed X account.",
  "Paste the public X post URL back into GWAP OS.",
  "GWAP reads that public post through X API v2 and verifies the exact challenge, author handle, and stable X account ID.",
  "A successful check creates Proof-of-Control provenance in the GWAP Trust Graph and Relationship Graph.",
] as const;

export default function PublicProofPage() {
  return (
    <PageShell>
      <PageHero
        eyebrow="GWAP Public Proof"
        title="Prove control of an X account with a public challenge."
        description="GWAP Public Proof is a read-only X integration for account verification. Users publish a one-time challenge themselves; GWAP then retrieves the submitted public post through X API v2 to verify who authored it. GWAP does not post to X on the user's behalf."
      >
        <Link className="primary-button" href="/app/score">
          Open Public Proof in GWAP OS <ArrowIcon />
        </Link>
      </PageHero>

      <section className="inner-section">
        <div className="split-panel">
          <div>
            <span className="eyebrow"><SparkIcon /> X API v2 integration</span>
            <h2>Public post read access is used only to verify Proof of Control.</h2>
            <p>
              When a user submits an X post URL, the GWAP server requests that specific public post by ID and reads the author relationship needed to confirm that the claimed account published the one-time GWAP challenge.
            </p>
          </div>
          <div>
            <code>GET /2/tweets/:id</code>
            <p><code>tweet.fields=author_id</code></p>
            <p><code>expansions=author_id</code></p>
            <p><code>user.fields=username</code></p>
          </div>
        </div>
      </section>

      <section className="inner-section">
        <div className="contact-grid">
          <article className="contact-card">
            <span>READ ONLY</span>
            <h2>No automatic posting.</h2>
            <p>GWAP generates the verification text, but the user chooses whether to publish it from X. GWAP does not require write or Direct Message permission for Public Proof.</p>
          </article>
          <article className="contact-card">
            <span>AUTHOR VERIFIED</span>
            <h2>The pasted link is not trusted by itself.</h2>
            <p>GWAP independently checks the returned X post author and binds a successful verification to the stable X account ID, not only to a mutable username.</p>
          </article>
          <article className="contact-card">
            <span>LIMITED PURPOSE</span>
            <h2>Verification data stays scoped to trust provenance.</h2>
            <p>Public Proof records the challenge, submitted post reference, visible handle, verification status, method, and timestamps required to explain how the relationship was verified.</p>
          </article>
        </div>
      </section>

      <section className="inner-section">
        <div className="split-panel">
          <div>
            <span className="eyebrow"><SparkIcon /> Verification flow</span>
            <h2>Simple for users. Strict underneath.</h2>
            <p>A social account is never marked verified because a username looks similar, a profile image matches, or a user simply says they control it.</p>
          </div>
          <ol className="intake-list">
            {steps.map((step, index) => (
              <li key={step}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                {step}
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="inner-section">
        <div className="cta-panel">
          <div>
            <span className="eyebrow"><SparkIcon /> Learn more</span>
            <h2>See the verification and data-handling details.</h2>
            <p>Public Proof is documented alongside the broader GWAP trust, API, privacy, and account infrastructure.</p>
          </div>
          <div className="inner-hero-actions">
            <Link className="primary-button" href="/docs">Read docs <ArrowIcon /></Link>
            <Link className="secondary-button" href="/privacy">Privacy</Link>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
