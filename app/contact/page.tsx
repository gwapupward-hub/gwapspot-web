import {
  ArrowIcon,
  PageHero,
  PageShell,
  SparkIcon,
} from "../components/site-shell";
import { createPageMetadata } from "../lib/metadata";

export const metadata = createPageMetadata({
  title: "Contact & Partnerships",
  description:
    "Contact GWAP through its official community, development, and partnership channels.",
  path: "/contact",
});

const contactPaths = [
  {
    title: "Community and general contact",
    description:
      "Use Telegram for community questions, introductions, product feedback, and direct ecosystem discussion.",
    label: "Open Telegram",
    href: "https://t.me/thagwapspot",
  },
  {
    title: "Public announcements and media",
    description:
      "Use X for public updates, release discussions, media contact, and visible partnership conversations.",
    label: "Open X",
    href: "https://x.com/_gwapspot?s=21",
  },
  {
    title: "Development and integrations",
    description:
      "Use GitHub for repositories, technical review, issues, implementation context, and open-source collaboration.",
    label: "Open GitHub",
    href: "https://github.com/Gwapoholics",
  },
  {
    title: "Brand and visual collaborations",
    description:
      "Use Instagram for apparel, campaigns, creator collaborations, and visual partnership inquiries.",
    label: "Open Instagram",
    href: "https://www.instagram.com/_gwapspot?igsh=emlydnV6eXljYjd4",
  },
] as const;

const intake = [
  "Who you are and the organization or community you represent",
  "Which GWAP product or infrastructure layer is relevant",
  "The problem, audience, or opportunity you want to address",
  "What you can contribute and what you need from GWAP",
  "A clear proposed next step",
] as const;

export default function ContactPage() {
  return (
    <PageShell>
      <PageHero
        eyebrow="Contact and partnerships"
        title="Use the channel built for the conversation."
        description="GWAP currently manages contact through its official public channels. Select the path that matches community, media, technical, or brand work."
      />

      <section className="inner-section">
        <div className="contact-grid">
          {contactPaths.map((path) => (
            <article className="contact-card" key={path.title}>
              <span>OFFICIAL CHANNEL</span>
              <h2>{path.title}</h2>
              <p>{path.description}</p>
              <a href={path.href} target="_blank" rel="noreferrer">
                {path.label} <ArrowIcon />
              </a>
            </article>
          ))}
        </div>
      </section>

      <section className="inner-section">
        <div className="split-panel">
          <div>
            <span className="eyebrow">
              <SparkIcon /> Partnership intake
            </span>
            <h2>Bring a concrete proposal.</h2>
            <p>
              The fastest way to get a useful response is to provide enough
              context for a real decision. Broad “let’s work” messages usually
              create broad silence. Ancient business law.
            </p>
          </div>
          <ol className="intake-list">
            {intake.map((item, index) => (
              <li key={item}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                {item}
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="inner-section">
        <div className="cta-panel">
          <div>
            <span className="eyebrow">
              <SparkIcon /> Best starting point
            </span>
            <h2>Telegram is the fastest general-purpose channel.</h2>
            <p>
              For anything that does not clearly belong in GitHub, X, or
              Instagram, start with the official Telegram community.
            </p>
          </div>
          <a
            className="primary-button"
            href="https://t.me/thagwapspot"
            target="_blank"
            rel="noreferrer"
          >
            Start on Telegram <ArrowIcon />
          </a>
        </div>
      </section>
    </PageShell>
  );
}
