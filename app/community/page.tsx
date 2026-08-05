import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowIcon,
  PageHero,
  PageShell,
  SocialGrid,
  SparkIcon,
} from "../components/site-shell";

export const metadata: Metadata = {
  title: "Community",
  description:
    "Join the GWAP community and follow product releases, development updates, and ecosystem opportunities.",
  alternates: { canonical: "/community" },
};

const communityRoles = [
  {
    title: "Builders",
    body: "Developers, designers, operators, and technical partners helping turn the ecosystem into durable infrastructure.",
  },
  {
    title: "Creators",
    body: "Artists, educators, brands, and storytellers who give the products real-world meaning and distribution.",
  },
  {
    title: "Gwapoholics",
    body: "Early users and supporters who test releases, provide feedback, and help define the culture around the network.",
  },
] as const;

export default function CommunityPage() {
  return (
    <PageShell>
      <PageHero
        eyebrow="GWAP community"
        title="The network grows through participation."
        description="GWAP is not meant to be a collection of silent product pages. It is a builder, creator, and user network organized around purposeful execution."
      >
        <a
          className="primary-button"
          href="https://t.me/thagwapspot"
          target="_blank"
          rel="noreferrer"
        >
          Join Telegram <ArrowIcon />
        </a>
        <a
          className="secondary-button"
          href="https://x.com/_gwapspot?s=21"
          target="_blank"
          rel="noreferrer"
        >
          Follow on X
        </a>
      </PageHero>

      <section className="inner-section">
        <div className="inner-section-heading">
          <span className="eyebrow">
            <SparkIcon /> Who the network serves
          </span>
          <h2>Different roles. Shared direction.</h2>
        </div>
        <div className="feature-grid feature-grid-three">
          {communityRoles.map((role) => (
            <article className="feature-card" key={role.title}>
              <span>COMMUNITY ROLE</span>
              <h3>{role.title}</h3>
              <p>{role.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="inner-section">
        <div className="community-card">
          <div>
            <span className="eyebrow">
              <SparkIcon /> Official channels
            </span>
            <h2>Follow the build where it happens.</h2>
            <p>
              Each channel has a purpose: announcements, discussion,
              development, or visual releases. Use the one that matches how you
              want to participate.
            </p>
          </div>
          <SocialGrid />
        </div>
      </section>

      <section className="inner-section">
        <div className="cta-panel">
          <div>
            <span className="eyebrow">
              <SparkIcon /> Contribute with purpose
            </span>
            <h2>Good feedback is more valuable than empty hype.</h2>
            <p>
              Product testers, integration partners, community organizers, and
              experienced operators can help GWAP move faster without losing
              discipline.
            </p>
          </div>
          <Link className="primary-button" href="/contact">
            Find the right contact path <ArrowIcon />
          </Link>
        </div>
      </section>
    </PageShell>
  );
}
