"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import { productBySlug } from "../lib/ecosystem";

const graphNodes = [
  { slug: "isnad-sunnah", shortLabel: "ISNAD", x: 104, y: 136 },
  { slug: "gns", shortLabel: "GNS", x: 290, y: 98 },
  { slug: "gwapscore", shortLabel: "GWAPSCORE", x: 520, y: 164 },
  { slug: "occo", shortLabel: "OCCO", x: 792, y: 116 },
  { slug: "private-proof-vault", shortLabel: "VAULT", x: 866, y: 330 },
  { slug: "marketplace", shortLabel: "MARKET", x: 616, y: 468 },
  { slug: "money-neva-sleeps", shortLabel: "MN$", x: 370, y: 492 },
  { slug: "dimi", shortLabel: "DIMI", x: 132, y: 370 },
] as const;

type GraphSlug = (typeof graphNodes)[number]["slug"];

type GraphRelation = {
  from: GraphSlug;
  to: GraphSlug;
  label: string;
  detail: string;
};

const graphRelations = [
  {
    from: "gns",
    to: "gwapscore",
    label: "Identity + reputation",
    detail: "Readable identity context can strengthen explainable reputation and verification signals.",
  },
  {
    from: "gns",
    to: "private-proof-vault",
    label: "Identity + private proof",
    detail: "Selective proofs can attach to identity without requiring private evidence to live on a public profile.",
  },
  {
    from: "gns",
    to: "dimi",
    label: "Creator identity",
    detail: "Portable identity can travel with creator ownership, collaboration, and attribution workflows.",
  },
  {
    from: "gns",
    to: "isnad-sunnah",
    label: "Portable identity",
    detail: "Identity rails can support saved learning context, profiles, and community participation across experiences.",
  },
  {
    from: "gns",
    to: "occo",
    label: "Readable credit identity",
    detail: "Institutional wallet intelligence can resolve back to a recognizable identity layer instead of raw addresses alone.",
  },
  {
    from: "gwapscore",
    to: "marketplace",
    label: "Trust + commerce",
    detail: "Explainable reputation can help buyers, sellers, and merchants evaluate counterparties before transacting.",
  },
  {
    from: "gwapscore",
    to: "occo",
    label: "Reputation + credit context",
    detail: "Wallet reputation can contribute to broader credit-intelligence and risk interpretation workflows.",
  },
  {
    from: "gwapscore",
    to: "private-proof-vault",
    label: "Proof + trust",
    detail: "Verified evidence, attestations, and dispute outcomes can become explainable trust inputs when appropriate.",
  },
  {
    from: "marketplace",
    to: "private-proof-vault",
    label: "Transaction proof",
    detail: "Agreements, disputes, and transaction evidence can be selectively verified without making every record public.",
  },
  {
    from: "dimi",
    to: "marketplace",
    label: "Creator commerce",
    detail: "Creator work, services, rights, and collaborations can move into verified ecosystem commerce.",
  },
  {
    from: "money-neva-sleeps",
    to: "marketplace",
    label: "Brand commerce",
    detail: "Lifestyle products and collaborations can use the same marketplace identity, trust, and transaction rails.",
  },
] as const satisfies readonly GraphRelation[];

const graphNodeBySlug = new Map(graphNodes.map((node) => [node.slug, node]));
const graphSlugs = new Set<GraphSlug>(graphNodes.map((node) => node.slug));

function isGraphSlug(value: string | undefined | null): value is GraphSlug {
  return Boolean(value && graphSlugs.has(value as GraphSlug));
}

function getProduct(slug: GraphSlug) {
  const product = productBySlug.get(slug);
  if (!product) throw new Error(`Missing ecosystem product for graph node: ${slug}`);
  return product;
}

function getCurve(relation: GraphRelation, index: number) {
  const from = graphNodeBySlug.get(relation.from);
  const to = graphNodeBySlug.get(relation.to);
  if (!from || !to) return "";

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const normalX = -dy / length;
  const normalY = dx / length;
  const bend = (index % 2 === 0 ? 1 : -1) * Math.min(54, 22 + length * 0.055);
  const controlX = (from.x + to.x) / 2 + normalX * bend;
  const controlY = (from.y + to.y) / 2 + normalY * bend;

  return `M ${from.x} ${from.y} Q ${controlX.toFixed(1)} ${controlY.toFixed(1)} ${to.x} ${to.y}`;
}

function connectedSlugs(slug: GraphSlug | null) {
  if (!slug) return new Set<GraphSlug>();

  const connected = new Set<GraphSlug>([slug]);
  for (const relation of graphRelations) {
    if (relation.from === slug) connected.add(relation.to);
    if (relation.to === slug) connected.add(relation.from);
  }
  return connected;
}

function productStatusLabel(status: string) {
  if (status === "In Development") return "BUILD";
  if (status === "Planned") return "PLANNED";
  return status.toUpperCase();
}

export function GwapEcosystemGraph() {
  const [pinnedSlug, setPinnedSlug] = useState<GraphSlug>("gwapscore");
  const [hoverSlug, setHoverSlug] = useState<GraphSlug | null>(null);
  const [cardSlug, setCardSlug] = useState<GraphSlug | null>(null);

  const activeSlug = hoverSlug ?? cardSlug ?? pinnedSlug;
  const activeProduct = getProduct(activeSlug);

  const activeRelations = useMemo(
    () => graphRelations.filter((relation) => relation.from === activeSlug || relation.to === activeSlug),
    [activeSlug],
  );

  const relatedSlugs = useMemo(() => connectedSlugs(activeSlug), [activeSlug]);

  useEffect(() => {
    const findCardSlug = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return null;
      const card = target.closest<HTMLElement>(".premium-product-card[data-gwap-product]");
      const slug = card?.dataset.gwapProduct;
      return isGraphSlug(slug) ? slug : null;
    };

    const onPointerOver = (event: PointerEvent) => {
      const slug = findCardSlug(event.target);
      if (slug) setCardSlug(slug);
    };

    const onPointerOut = (event: PointerEvent) => {
      const slug = findCardSlug(event.target);
      if (!slug) return;
      if (event.relatedTarget instanceof Node && (event.target as Element).closest(".premium-product-card")?.contains(event.relatedTarget)) return;
      setCardSlug((current) => (current === slug ? null : current));
    };

    const onFocusIn = (event: FocusEvent) => {
      const slug = findCardSlug(event.target);
      if (slug) setCardSlug(slug);
    };

    const onFocusOut = (event: FocusEvent) => {
      const slug = findCardSlug(event.target);
      if (!slug) return;
      if (event.relatedTarget instanceof Node && (event.target as Element).closest(".premium-product-card")?.contains(event.relatedTarget)) return;
      setCardSlug((current) => (current === slug ? null : current));
    };

    document.addEventListener("pointerover", onPointerOver, { passive: true });
    document.addEventListener("pointerout", onPointerOut, { passive: true });
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);

    return () => {
      document.removeEventListener("pointerover", onPointerOver);
      document.removeEventListener("pointerout", onPointerOut);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, []);

  useEffect(() => {
    const cards = document.querySelectorAll<HTMLElement>(".premium-product-card[data-gwap-product]");

    cards.forEach((card) => {
      const slug = card.dataset.gwapProduct;
      const isPrimary = slug === activeSlug;
      const isLinked = isGraphSlug(slug) && relatedSlugs.has(slug) && !isPrimary;
      card.classList.toggle("gwap-graph-primary", isPrimary);
      card.classList.toggle("gwap-graph-linked", isLinked);
      card.classList.toggle("gwap-graph-muted", !isPrimary && !isLinked);
    });

    return () => {
      cards.forEach((card) => {
        card.classList.remove("gwap-graph-primary", "gwap-graph-linked", "gwap-graph-muted");
      });
    };
  }, [activeSlug, relatedSlugs]);

  return (
    <section className="gwap-ecosystem-graph" aria-labelledby="gwap-graph-heading">
      <header className="gwap-graph-header">
        <div>
          <span>03 / RELATIONSHIP MAP</span>
          <h3 id="gwap-graph-heading">See how the ecosystem compounds.</h3>
        </div>
        <p>
          This map shows shared rails and designed relationships across GWAP. It does not imply that every connection is already live in production.
        </p>
      </header>

      <div className="gwap-graph-layout">
        <div className="gwap-graph-viewport" aria-label="Interactive GWAP product relationship map">
          <div className="gwap-graph-stage" data-active-product={activeSlug}>
            <svg className="gwap-graph-svg" viewBox="0 0 1000 590" role="img" aria-labelledby="gwap-graph-svg-title gwap-graph-svg-desc">
              <title id="gwap-graph-svg-title">GWAP ecosystem relationship paths</title>
              <desc id="gwap-graph-svg-desc">Animated paths connect product nodes that share identity, reputation, proof, commerce, creator, and credit infrastructure.</desc>
              <defs>
                <radialGradient id="gwapCoreGlow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="currentColor" stopOpacity=".18" />
                  <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
                </radialGradient>
              </defs>

              <circle className="gwap-graph-core-glow" cx="500" cy="300" r="150" fill="url(#gwapCoreGlow)" />
              <circle className="gwap-graph-core-ring" cx="500" cy="300" r="88" />
              <circle className="gwap-graph-core-ring is-inner" cx="500" cy="300" r="50" />
              <text className="gwap-graph-core-label" x="500" y="296" textAnchor="middle">GWAP CORE</text>
              <text className="gwap-graph-core-status" x="500" y="316" textAnchor="middle">SHARED RAILS</text>

              {graphRelations.map((relation, index) => {
                const active = relation.from === activeSlug || relation.to === activeSlug;
                const d = getCurve(relation, index);
                return (
                  <g
                    className={`gwap-graph-edge${active ? " is-active" : ""}`}
                    data-from={relation.from}
                    data-to={relation.to}
                    key={`${relation.from}-${relation.to}`}
                  >
                    <path className="gwap-graph-edge-base" d={d} pathLength="1" />
                    <path className="gwap-graph-edge-signal" d={d} pathLength="1" />
                  </g>
                );
              })}
            </svg>

            <div className="gwap-graph-nodes">
              {graphNodes.map((node) => {
                const product = getProduct(node.slug);
                const isPrimary = node.slug === activeSlug;
                const isNeighbor = !isPrimary && relatedSlugs.has(node.slug);
                const isMuted = !isPrimary && !isNeighbor;
                const style = {
                  "--gwap-node-x": `${node.x / 10}%`,
                  "--gwap-node-y": `${(node.y / 590) * 100}%`,
                } as CSSProperties;

                return (
                  <button
                    type="button"
                    className={`gwap-graph-node accent-${product.accent}${isPrimary ? " is-primary" : ""}${isNeighbor ? " is-neighbor" : ""}${isMuted ? " is-muted" : ""}`}
                    style={style}
                    aria-pressed={pinnedSlug === node.slug}
                    aria-label={`${product.name}. ${product.status}. Show ecosystem relationships.`}
                    onPointerEnter={() => setHoverSlug(node.slug)}
                    onPointerLeave={() => setHoverSlug(null)}
                    onFocus={() => setHoverSlug(node.slug)}
                    onBlur={() => setHoverSlug(null)}
                    onClick={() => setPinnedSlug(node.slug)}
                    key={node.slug}
                  >
                    <span className="gwap-graph-node-status">{productStatusLabel(product.status)}</span>
                    <strong>{node.shortLabel}</strong>
                    <small>{product.eyebrow}</small>
                    <i aria-hidden="true" />
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <aside className="gwap-graph-inspector" aria-live="polite">
          <div className="gwap-graph-inspector-heading">
            <span>{activeProduct.status}</span>
            <strong>{activeProduct.name}</strong>
            <p>{activeProduct.role}</p>
          </div>

          <div className="gwap-graph-relations">
            <small>CONNECTED RAILS · {activeRelations.length}</small>
            {activeRelations.map((relation) => {
              const neighborSlug = relation.from === activeSlug ? relation.to : relation.from;
              const neighbor = getProduct(neighborSlug);
              return (
                <button
                  type="button"
                  onClick={() => setPinnedSlug(neighborSlug)}
                  onPointerEnter={() => setHoverSlug(neighborSlug)}
                  onPointerLeave={() => setHoverSlug(null)}
                  onFocus={() => setHoverSlug(neighborSlug)}
                  onBlur={() => setHoverSlug(null)}
                  key={`${relation.from}-${relation.to}`}
                >
                  <span>
                    <b>{relation.label}</b>
                    <em>{neighbor.name}</em>
                  </span>
                  <p>{relation.detail}</p>
                </button>
              );
            })}
          </div>

          <div className="gwap-graph-inspector-actions">
            <Link href={`/ecosystem/${activeSlug}`}>Open {activeProduct.name}</Link>
            <span>Hover a product card or select another node to reroute the signal.</span>
          </div>
        </aside>
      </div>
    </section>
  );
}
