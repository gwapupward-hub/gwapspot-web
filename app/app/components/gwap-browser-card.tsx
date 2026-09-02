"use client";

import Image from "next/image";
import Link from "next/link";
import {
  browserAddressHref,
  categoryLabel,
  formatDate,
  GWAP_BROWSER_MARK,
  type BrowserProject,
} from "./gwap-browser-client";

export function GwapBrowserProjectCard({
  project,
  onOpen,
}: {
  project: BrowserProject;
  onOpen?: (project: BrowserProject) => void;
}) {
  return (
    <Link
      href={browserAddressHref(project.address)}
      className="gwb-card"
      onClick={() => onOpen?.(project)}
      aria-label={`Open ${project.title} at ${project.address}`}
    >
      <span className="gwb-card-art" aria-hidden="true">
        <Image src={GWAP_BROWSER_MARK} alt="" width={44} height={44} />
      </span>
      <span className="gwb-card-body">
        <h3>{project.title}</h3>
        <span className="gwb-card-address">{project.address}</span>
        <p className="gwb-card-summary">{project.summary}</p>
        <span className="gwb-card-meta">
          <span className="gwb-chip is-built">Built with GWAP</span>
          <span className="gwb-chip">{categoryLabel(project.category)}</span>
          {project.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="gwb-chip">#{tag}</span>
          ))}
          <span>by {project.ownerAddress}</span>
          <span>· {formatDate(project.updatedAt)}</span>
        </span>
      </span>
    </Link>
  );
}
