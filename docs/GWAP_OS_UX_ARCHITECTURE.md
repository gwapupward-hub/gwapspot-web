# GWAP OS UX Architecture — Trust Operating Layer

Status: LOCKED PRODUCT DIRECTION

## Product thesis

GWAP OS is not a dashboard that contains separate GWAP products. It is the operating layer that turns identity into leverage by connecting trust, proof, reputation, intelligence, opportunity, and economic activity.

The user-facing system should feel like one coherent advantage:

Identity → Proof → Reputation → Intelligence → Opportunity → Economic Activity

The technology can be sophisticated. The interface must feel obvious.

Quality bar: complex trust infrastructure with consumer-grade simplicity.

## UX invariants

1. Every major capability is understandable by outcome before the user needs to know the underlying GWAP product name.
2. The home screen answers four questions quickly:
   - Who am I?
   - What do I own?
   - How am I trusted?
   - What should I do next?
3. Navigation is organized around user intent and outcomes, not internal product architecture.
4. Trust and reputation are actionable throughout the ecosystem, not isolated scores or profile decorations.
5. Identity progressively strengthens as users connect wallets, .gwap, social accounts, proofs, projects, and transaction history.
6. The system recommends the highest-value next action instead of forcing users to explore every module.
7. Builders, freelancers, creators, investors, businesses, and casual users should see different emphasis from the same underlying operating system.
8. GWAP product names remain visible as brands, but plain-language outcomes lead.

## Core capability map

- GNS: verified digital identity
- GwapScore: credibility and reputation signal
- Wallet Intelligence: wallet meaning, portfolio, exposure, and risk
- Private Proof Vault: selective evidence and verified claims
- Daily Ideas: opportunity discovery and execution
- Marketplace: reputation-backed economic activity
- Developer API: machine-readable GWAP trust and intelligence infrastructure
- OCCO: on-chain financial credibility infrastructure

GWAP OS connects all capabilities into one user/account runtime.

## Primary interaction loop

Connect → Verify → Build Reputation → Unlock Value

Longer-term economic loop:

Identity → Proof → Reputation → Opportunity → Transaction → More Reputation

## Home screen model

The adaptive home should prioritize:

### Who am I?
.gwap identity, verified wallet, connected accounts, identity strength.

### What do I own?
Mainnet wallet portfolio, assets, projects, saved ideas, active work.

### How am I trusted?
GwapScore, reputation status, verification coverage, proof coverage, trust recommendations.

### What can I do next?
Personalized next-best actions based on missing identity/trust signals and active user work.

## Identity Strength

Identity Strength is a progression signal, not a financial/reputation score. It measures coverage of verified account signals and actionable profile completeness.

Initial components can include:

- verified primary wallet
- .gwap identity
- public profile completeness
- GwapScore availability
- linked Telegram account
- verified social accounts when GwapScore social verification ships
- Proof Vault claims when Proof Vault ships
- Marketplace/developer activity when those signals become meaningful

The system should always explain how to improve Identity Strength.

## Universal GWAP action bar

GWAP OS should expose one persistent command/search layer for actions and entities.

Example intents:

- Check a wallet
- Find a .gwap name
- Show my reputation
- Improve my identity
- Open my portfolio
- Create an API key
- Find an opportunity
- Open Daily Ideas
- View Proof Vault

Long-term, this becomes the natural interface for a GWAP Agent that can route and orchestrate actions across the OS.

## Audience adaptation

One system, different emphasis:

- Builder/developer: projects, API, GitHub/social verification, wallet intelligence, Daily Ideas
- Freelancer: reputation, proofs, profile, opportunities, Marketplace
- Creator/influencer: social verification, audience reputation, profile, Proof Vault, monetization
- Investor: wallet intelligence, watchlists, counterparties, risk, projects
- Business: team identity, verification, API access, counterparties, reputation
- Casual user: identity, wallet, reputation, discover

Do not fork the underlying product into separate applications for each audience. Adapt ordering, recommendations, and shortcuts.

### Adaptive persona implementation

GWAP OS stores one account-synced persona preference:

- `builder`
- `freelancer`
- `creator`
- `investor`
- `business`
- `general`

Persona selection changes emphasis, action ordering, and next-best recommendations only. It never changes entitlement or hides capabilities.

Universal trust prerequisites stay ahead of persona-specific recommendations:

1. establish `.gwap` identity;
2. complete enough public context to be understandable;
3. make reputation/trust state inspectable;
4. then prioritize the user's chosen outcome path.

This keeps personalization useful without creating six disconnected versions of GWAP OS.

## Product presentation rule

Never lead with a product name when a clearer outcome exists.

Prefer:
- "Build your reputation" before "GwapScore"
- "Claim your digital identity" before "GNS"
- "Analyze a wallet" before "Wallet Intelligence"
- "Prove something privately" before "Private Proof Vault"
- "Find an opportunity" before "Daily Ideas"

Then reveal the GWAP product powering that action.

## Current implementation phase

Phase A — UX architecture
- adaptive home
- intent routing
- Identity Strength
- universal action bar
- outcome-based navigation
- next-best-action recommendations
- account-synced persona selection
- persona-aware action ordering and recommendations

Phase B — trust graph expansion
- social verification
- Proof Vault activation
- richer trust signals
- entity relationship graph

Phase C — economic activation
- reputation-backed Marketplace flows
- business/developer integrations
- reputation rewards and transaction history
- automated GWAP Agent orchestration

## Non-goals for Phase A

- no public-site redesign
- no mainnet GNS deployment
- no fake Proof Vault implementation
- no speculative trust score changes
- no duplicate backend architecture
- no burying existing products behind marketing copy

## Success test

A cold user should be able to open GWAP OS and understand within seconds:

1. who GWAP knows them to be;
2. how strong/complete their verified identity is;
3. what their wallet/account currently contains;
4. how their reputation is represented;
5. the single highest-value thing they can do next.
