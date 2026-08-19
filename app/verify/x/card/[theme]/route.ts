import React from "react";
import { ImageResponse } from "next/og";

export const runtime = "edge";

const CARD_PALETTES = {
  orange: { accent: "#FF9918", mid: "#FF9F20", edge: "#5E3512" },
  red: { accent: "#FF0909", mid: "#FF1010", edge: "#641313" },
  green: { accent: "#52FF00", mid: "#4CFF00", edge: "#285A18" },
  purple: { accent: "#A100FF", mid: "#9900FF", edge: "#3C1762" },
} as const;

type CardTheme = keyof typeof CARD_PALETTES;

function isCardTheme(value: string): value is CardTheme {
  return value in CARD_PALETTES;
}

function cardSvg(theme: CardTheme) {
  const { accent, mid, edge } = CARD_PALETTES[theme];
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="600" viewBox="0 0 1200 600">
      <defs>
        <radialGradient id="bg" cx="50%" cy="50%" r="72%">
          <stop offset="0%" stop-color="${accent}"/>
          <stop offset="47%" stop-color="${mid}"/>
          <stop offset="100%" stop-color="${edge}"/>
        </radialGradient>
        <filter id="glow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="10" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      <rect width="1200" height="600" fill="url(#bg)"/>
      <path d="M390 0H805L825 38 812 72 850 110V150L815 184 770 169 812 208C850 240 873 277 883 325L890 430 905 600H295L310 430 317 325C327 277 350 240 388 208L430 170 385 184 355 150V110L392 72 380 38Z" fill="#020304"/>
      <path d="M480 225C420 260 390 308 382 380L365 600H835L818 380C810 308 780 260 720 225L675 198H525Z" fill="#020304"/>
      <g filter="url(#glow)" fill="none" stroke="${accent}" stroke-width="4" stroke-linejoin="round">
        <path d="M535 323L552 286 579 309 603 275 626 309 654 286 671 323 646 329H560Z"/>
        <path d="M557 336Q603 325 649 336"/>
        <text x="600" y="445" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="900" font-size="150" letter-spacing="-6" fill="#020304" stroke="${accent}" stroke-width="5">GWAP</text>
      </g>
      <text x="600" y="520" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="22" letter-spacing="5" fill="${accent}">PROOF OF CONTROL</text>
    </svg>
  `;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ theme: string }> },
) {
  const { theme: rawTheme } = await context.params;
  const theme: CardTheme = isCardTheme(rawTheme) ? rawTheme : "green";
  const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(cardSvg(theme))}`;

  return new ImageResponse(
    React.createElement("img", {
      src: dataUrl,
      width: 1200,
      height: 600,
      alt: `GWAP ${theme} Proof of Control card`,
    }),
    {
      width: 1200,
      height: 600,
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    },
  );
}
