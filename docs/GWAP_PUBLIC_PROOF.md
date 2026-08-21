# GWAP Public Proof

Status: locked initial social Proof-of-Control direction

## Product role

GWAP Public Proof converts social-account verification into both a trust primitive and a product-led distribution loop.

The trust event is the independently verified public platform post. The share image, color, copy, and landing page are acquisition surfaces and never weaken verification requirements.

## Initial X flow

1. Authenticated user enters the X handle they claim to control.
2. User chooses one approved GWAP share theme.
3. GWAP creates a short-lived challenge such as `GWAP-X7F4-Q9LM`.
4. GWAP creates a public receipt URL and prewritten verification post.
5. User publishes the post from the claimed X account.
6. User submits the post URL to GWAP OS.
7. Server extracts the Post ID and retrieves it through X API v2.
8. Server confirms:
   - post exists and is public;
   - exact GWAP challenge is present;
   - author username matches the claimed handle;
   - stable X `author_id` is returned;
   - handle/stable account are not claimed by a different GWAP account;
   - challenge is valid, unused, and unexpired.
9. Verification becomes `verified` and enters Trust Graph + Relationship Graph as `proof-of-control` provenance.

## Share themes

Approved initial art family:

- Neon Green
- Red
- Electric Blue
- Purple
- White / Silver
- Orange

The supplied 1536×768 GWAP money-bag artwork is the canonical initial campaign family. Hosted asset URLs are configured through the six `NEXT_PUBLIC_GWAP_PUBLIC_PROOF_*_IMAGE_URL` variables. If an asset URL is missing, the share route uses a generated color-matched fallback card rather than returning a broken preview.

## Living receipt

The same `/v/<challenge>` URL represents:

- `challenge-issued` — public challenge active;
- `awaiting-post` — user submitted a post but verification did not complete yet;
- `verified` — post + author + challenge were independently verified;
- `revoked` — user revoked the social relationship;
- `expired` — challenge expired before verification.

Public receipts do not expose the internal GWAP account ID or the stable external account ID.

## Growth loop

Verify → Share GWAP → Viewer opens branded proof → Viewer discovers trust utilities → Viewer enters GWAP OS → New user verifies → Repeat.

The receipt CTA should prioritize:

- Open GWAP OS
- Claim / understand `.gwap` identity
- Build reputation
- Analyze wallets / trust

## Analytics contract

Future events may track:

- challenge generated
- theme selected
- share-link viewed
- X composer opened
- post URL submitted
- verification succeeded / failed
- receipt viewed
- GWAP OS CTA clicked
- new-account conversion attributed to proof link

Theme performance is a marketing metric only. It must never alter verification, Trust Coverage, or GwapScore.

## Future private method

Private Proof-of-Control may later use DM/OAuth/platform-native private verification. It should feed the same underlying relationship fact while recording a different verification method.
