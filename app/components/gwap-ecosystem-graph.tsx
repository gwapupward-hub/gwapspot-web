"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import { getProductDestination, isExternalProductDestination, productBySlug } from "../lib/ecosystem";

const graphNodes = [
  { slug: "daily-ideas", shortLabel: "IDEAS", x: 104, y: 136 },
  { slug: "gns", shortLabel: "GNS", x: 290, y: 98 },
  { slug: "gwapscore", shortLabel: "GWAPSCORE", x: 520, y: 164 },
  { slug: "occo", shortLabel: "OCCO", x: 792, y: 116 },
  { slug: "private-proof-vault", shortLabel: "VAULT", x: 866, y: 330 },
  { slug: "marketplace", shortLabel: "MARKET", x: 616, y: 468 },
  { slug: "money-neva-sleeps", shortLabel: "MN$", x: 370, y: 492 },
  { slug: "dimi", shortLabel: "DIMI", x: 132, y: 370 },
] as const;

type GraphSlug = (typeof graphNodes)[number]["slug"];
type GraphChannel = "identity" | "trust" | "commerce" | "intelligence";
type GraphMode = "all" | GraphChannel;

type GraphRelation = {
  from: GraphSlug;
  to: GraphSlug;
  label: string;
  detail: string;
  channels: readonly GraphChannel[];
};

const graphModes = [
  {
    id: "all",
    label: "All Rails",
    shortLabel: "ALL",
    description: "The complete designed relationship view across identity, trust, opportunity, commerce, creator, proof, and intelligence rails.",
  },
  {
    id: "identity",
    label: "Identity",
    shortLabel: "ID",
    description: "How portable identity can resolve people, wallets, creators, project context, and private proof across the ecosystem.",
  },
  {
    id: "trust",
    label: "Trust",
    shortLabel: "TRUST",
    description: "How reputation, verified evidence, and transaction context can strengthen explainable confidence between ecosystem modules.",
  },
  {
    id: "commerce",
    label: "Commerce",
    shortLabel: "COMMERCE",
    description: "How creators, brands, marketplace activity, proofs, and reputation can converge around ecosystem transactions.",
  },
  {
    id: "intelligence",
    label: "Intelligence",
    shortLabel: "INTEL",
    description: "How identity, reputation, proof, and institutional context can combine into higher-quality risk and wallet interpretation.",
  },
] as const satisfies readonly {
  id: GraphMode;
  label: string;
  shortLabel: string;
  description: string;
}[];

const modeAnchor: Record<GraphChannel, GraphSlug> = {
  identity: "gns",
  trust: "gwapscore",
  commerce: "marketplace",
  intelligence: "occo",
};

const graphRelations = [
  {
    from: "gns",
    to: "gwapscore",
    label: "Identity + reputation",
    detail: "Readable identity context can strengthen explainable reputation and verification signals.",
    channels: ["identity", "trust", "intelligence"],
  },
  {
    from: "gns",
    to: "private-proof-vault",
    label: "Identity + private proof",
    detail: "Selective proofs can attach to identity without requiring private evidence to live on a public profile.",
    channels: ["identity", "trust"],
  },
  {
    from: "gns",
    to: "dimi",
    label: "Creator identity",
    detail: "Portable identity can travel with creator ownership, collaboration, and attribution workflows.",
    channels: ["identity"],
  },
  {
    from: "gns",
    to: "daily-ideas",
    label: "Identity + opportunity",
    detail: "Optional portable identity can connect saved opportunities, project attribution, and future collaboration without blocking discovery.",
    channels: ["identity"],
  },
  {
    from: "gns",
    to: "occo",
    label: "Readable credit identity",
    detail: "Institutional wallet intelligence can resolve back to a recognizable identity layer instead of raw addresses alone.",
    channels: ["identity", "intelligence"],
  },
  {
    from: "daily-ideas",
    to: "marketplace",
    label: "Opportunity + commerce",
    detail: "Developed ideas can produce execution briefs for hiring, services, and launch work in the Marketplace.",
    channels: ["commerce"],
  },
  {
    from: "gwapscore",
    to: "marketplace",
    label: "Trust + commerce",
    detail: "Explainable reputation can help buyers, sellers, and merchants evaluate counterparties before transacting.",
    channels: ["trust", "commerce"],
  },
  {
    from: "gwapscore",
    to: "occo",
    label: "Reputation + credit context",
    detail: "Reputation-eligible wallet intelligence can support broader credit-intelligence and risk interpretation without making wallet wealth a reputation signal.",
    channels: ["trust", "intelligence"],
  },
  {
    from: "gwapscore",
    to: "private-proof-vault",
    label: "Proof + trust",
    detail: "Verified evidence, attestations, and dispute outcomes can become explainable trust inputs when appropriate.",
    channels: ["trust", "intelligence"],
  },
  {
    from: "marketplace",
    to: "private-proof-vault",
    label: "Transaction proof",
    detail: "Agreements, disputes, and transaction evidence can be selectively verified without making every record public.",
    channels: ["trust", "commerce"],
  },
  {
    from: "dimi",
    to: "marketplace",
    label: "Creator + commerce",
    detail: "Creator work, services, and digital products can move into marketplace discovery and transactions.",
    channels: ["commerce"],
  },
  {
    from: "money-neva-sleeps",
    to: "marketplace",
    label: "Brand + commerce",
    detail: "Lifestyle products can become ecosystem inventory while keeping the brand experience distinct.",
    channels: ["commerce"],
  },
] as const satisfies readonly GraphRelation[];

const graphNodeMap = new Map(graphNodes.map((node) => [node.slug, node]));
const graphModeMap = new Map(graphModes.map((mode) => [mode.id, mode]));

function ProductNode({
  slug,
  selected,
  emphasized,
  muted,
  onSelect,
}: {
  slug: GraphSlug;
  selected: boolean;
  emphasized: boolean;
  muted: boolean;
  onSelect: (slug: GraphSlug) => void;
}) {
  const node = graphNodeMap.get(slug)!;
  const product = productBySlug.get(slug)!;
  return (
    <button
      type="button"
      className={`gwap-graph-node accent-${product.accent}${selected ? " is-primary" : ""}${emphasized ? " is-neighbor" : ""}${muted ? " is-muted" : ""}`}
      style={{
        "--gwap-node-x": `${node.x / 10}%`,
        "--gwap-node-y": `${(node.y / 590) * 100}%`,
      } as CSSProperties}
      data-gwap-graph-node={slug}
      aria-pressed={selected}
      aria-label={`${product.name}. ${product.status}. Show ecosystem relationships.`}
      onClick={() => onSelect(slug)}
    >
      <span className="gwap-graph-node-status">{product.status === "In Development" ? "BUILD" : product.status.toUpperCase()}</span>
      <strong>{node.shortLabel}</strong>
      <small>{product.eyebrow}</small>
      <i aria-hidden="true" />
    </button>
  );
}

function buildEdgePath(from: GraphSlug, to: GraphSlug) {
  const a = graphNodeMap.get(from)!;
  const b = graphNodeMap.get(to)!;
  const midX = (a.x + b.x) / 2;
  const midY = (a.y + b.y) / 2;
  const bendX = 500 - midX;
  const bendY = 300 - midY;
  const controlX = midX + bendX * 0.22;
  const controlY = midY + bendY * 0.22;
  return `M ${a.x} ${a.y} Q ${controlX.toFixed(1)} ${controlY.toFixed(1)} ${b.x} ${b.y}`;
}

export function GwapEcosystemGraph() {
  const [selectedSlug, setSelectedSlug] = useState<GraphSlug>("gwapscore");
  const [mode, setMode] = useState<GraphMode>("all");

  useEffect(() => {
    if (mode === "all") return;
    setSelectedSlug(modeAnchor[mode]);
  }, [mode]);

  const modeRelations = useMemo(() => {
    if (mode === "all") return graphRelations;
    return graphRelations.filter((relation) => relation.channels.includes(mode));
  }, [mode]);

  const visibleRelations = useMemo(
    () => modeRelations.filter((relation) => relation.from === selectedSlug || relation.to === selectedSlug),
    [modeRelations, selectedSlug],
  );

  const relatedSlugs = useMemo(
    () => new Set<GraphSlug>(visibleRelations.map((relation) => relation.from === selectedSlug ? relation.to : relation.from)),
    [selectedSlug, visibleRelations],
  );

  const selectedProduct = productBySlug.get(selectedSlug)!;
  const activeMode = graphModeMap.get(mode)!;

  const chooseNode = (slug: GraphSlug) => {
    setSelectedSlug(slug);
  };

  return (
    <section className="gwap-ecosystem-graph" aria-labelledby="gwap-graph-heading">
      <header className="gwap-graph-header">
        <div><span>NETWORK / RELATIONSHIP MAP</span><h3 id="gwap-graph-heading">See how the ecosystem compounds.</h3></div>
        <p>This map shows shared rails and designed relationships across GWAP. It does not imply that every connection is already live in production.</p>
      </header>

      <div className="gwap-graph-modebar">
        <div className="gwap-graph-mode-controls" role="group" aria-label="Filter ecosystem relationship map">
          <span>VIEW</span>
          {graphModes.map((graphMode) => (
            <button
              key={graphMode.id}
              type="button"
              className={mode === graphMode.id ? "is-active" : undefined}
              aria-pressed={mode === graphMode.id}
              onClick={() => setMode(graphMode.id)}
            >
              <b>{graphMode.shortLabel}</b>
              <em>{graphMode.label}</em>
            </button>
          ))}
        </div>
        <div className="gwap-graph-mode-readout" aria-live="polite">
          <span>{activeMode.label.toUpperCase()} LENS</span>
          <strong>{modeRelations.length} rails · {new Set(modeRelations.flatMap((relation) => [relation.from, relation.to])).size} modules</strong>
          <p>{activeMode.description}</p>
        </div>
      </div>

      <div className="gwap-graph-layout">
        <div className="gwap-graph-viewport" role="group" aria-label={`Interactive GWAP product relationship map, ${activeMode.label} view`}>
          <div className="gwap-graph-stage" data-active-product={selectedSlug} data-graph-mode={mode}>
            <svg className="gwap-graph-svg" viewBox="0 0 1000 590" role="img" aria-labelledby="gwap-graph-svg-title gwap-graph-svg-desc">
              <title id="gwap-graph-svg-title">GWAP ecosystem relationship paths</title>
              <desc id="gwap-graph-svg-desc">Animated paths connect product nodes that share identity, reputation, opportunity, proof, commerce, creator, and credit infrastructure.</desc>
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
              <text className="gwap-graph-core-status" x="500" y="316" textAnchor="middle">{activeMode.shortLabel} RAILS</text>
              {graphRelations.map((relation) => {
                const active = relation.from === selectedSlug || relation.to === selectedSlug;
                const inMode = mode === "all" || relation.channels.includes(mode);
                return (
                  <g className={`gwap-graph-edge${active ? " is-active" : ""}${inMode ? " is-in-mode" : " is-out-of-mode"}`} data-from={relation.from} data-to={relation.to} key={`${relation.from}-${relation.to}`}>
                    <path className="gwap-graph-edge-base" d={buildEdgePath(relation.from, relation.to)} pathLength="1" />
                    <path className="gwap-graph-edge-signal" d={buildEdgePath(relation.from, relation.to)} pathLength="1" />
                  </g>
                );
              })}
            </svg>

            <div className="gwap-graph-nodes">
              {graphNodes.map((node) => {
                const participatesInMode = mode === "all" || modeRelations.some((relation) => relation.from === node.slug || relation.to === node.slug);
                return (
                  <ProductNode
                    key={node.slug}
                    slug={node.slug}
                    selected={node.slug === selectedSlug}
                    emphasized={relatedSlugs.has(node.slug)}
                    muted={!participatesInMode || (node.slug !== selectedSlug && !relatedSlugs.has(node.slug))}
                    onSelect={chooseNode}
                  />
                );
              })}
            </div>
          </div>
        </div>

        <aside className="gwap-graph-inspector" aria-label={`Selected product relationships for ${selectedProduct.name}`}>
          <div className="gwap-graph-inspector-heading">
            <span>{selectedProduct.status}</span>
            <strong>{selectedProduct.name}</strong>
            <p>{selectedProduct.role}</p>
          </div>
          <div className="gwap-graph-relations">
            <small>{activeMode.label.toUpperCase()} · CONNECTED RAILS · {visibleRelations.length}</small>
            {visibleRelations.length > 0 ? visibleRelations.map((relation) => {
              const counterpartSlug = relation.from === selectedSlug ? relation.to : relation.from;
              const counterpart = productBySlug.get(counterpartSlug)!;
              return (
                <button type="button" onClick={() => chooseNode(counterpartSlug)} key={`${relation.from}-${relation.to}`}>
                  <span><b>{relation.label}</b><em>{counterpart.name}</em></span>
                  <p>{relation.detail}</p>
                </button>
              );
            }) : (
              <p className="gwap-graph-empty">This product does not participate in the selected system lens yet. Choose another product or switch views.</p>
            )}
          </div>
          <div className="gwap-graph-inspector-actions">
            <Link href={getProductDestination(selectedProduct)} target={isExternalProductDestination(selectedProduct) ? "_blank" : undefined} rel={isExternalProductDestination(selectedProduct) ? "noreferrer" : undefined}>Open {selectedProduct.name}</Link>
            <span>Select a system lens, hover a participating product card, or pin another node to reroute the signal.</span>
          </div>
        </aside>
      </div>
    </section>
  );
}
