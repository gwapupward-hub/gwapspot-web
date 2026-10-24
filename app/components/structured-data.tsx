const SITE_URL = "https://www.gwapspot.com";

/**
 * Site-wide JSON-LD. Rendered once from the root layout so every public route
 * carries Organization + WebSite identity; `/changelog` adds its own
 * CollectionPage graph on top of this.
 *
 * Emitted as a single `@graph` document so the nodes can cross-reference each
 * other by `@id` instead of repeating the publisher on every entity.
 */
const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: "GWAP",
      alternateName: "Grind With A Purpose",
      url: SITE_URL,
      logo: {
        "@type": "ImageObject",
        url: `${SITE_URL}/logos/gwap-agent.png`,
        width: 512,
        height: 512,
      },
      description:
        "GWAP builds connected tools for builders, creators, freelancers, and entrepreneurs to develop ideas, establish digital identity, grow verifiable reputation, and protect economic activity.",
      sameAs: [
        "https://x.com/_gwapspot",
        "https://github.com/Gwapoholics",
        "https://t.me/GwapSpot_SupportBot",
      ],
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: SITE_URL,
      name: "GWAP",
      description:
        "Start with your goal: build an idea, establish a .gwap identity, grow verifiable reputation, or protect digital work and transactions through the connected GWAP ecosystem.",
      publisher: { "@id": `${SITE_URL}/#organization` },
      inLanguage: "en",
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${SITE_URL}/#software`,
      name: "GWAP OS",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      url: `${SITE_URL}/app`,
      description:
        "A connected operating layer for building ideas, managing digital identity, understanding reputation, and accessing GWAP products from one place.",
      publisher: { "@id": `${SITE_URL}/#organization` },
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
    },
  ],
};

export function StructuredData() {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(structuredData).replaceAll("<", "\\u003c"),
      }}
    />
  );
}
