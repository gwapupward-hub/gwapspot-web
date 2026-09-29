# Vendor & Service Register

This register tracks production services that can affect confidentiality, integrity, availability, authentication, deployment, or transaction execution.

| Service | Purpose | Data / access category | Primary risk | Required review |
| --- | --- | --- | --- | --- |
| GitHub | Source control, pull requests, Actions | Source code, CI metadata, repository permissions | Unauthorized code/config changes; supply-chain compromise | Access + repository security settings |
| Vercel | Hosting and deployment | Application artifacts, environment variables, runtime/deployment logs | Production compromise or outage | Access, environment separation, deployment controls |
| Privy | Authentication and wallet/session integration | Identity/authentication/session-related data | Account/session compromise | Auth configuration, access, privacy/security terms |
| Redis-compatible storage (Upstash/Vercel KV/Redis URL) | Workspace/application state | Application data; may include user-associated records | Unauthorized read/write, data loss | Credential scope, environment separation, retention/recovery |
| Solana RPC provider | Blockchain reads/submission | Public chain requests plus infrastructure metadata | Availability, incorrect network, provider trust | Network configuration, failover/availability requirements |
| Solana programs used by GwapOS/PPV | On-chain execution | Public transaction/program state | Program/configuration defects, authority/custody risk | Program IDs, network, authority/custody boundary, release evidence |

## Review rules

Before a new production vendor is introduced, record:

1. product purpose and owner;
2. data classifications processed;
3. privileged permissions granted;
4. production secrets required;
5. availability impact;
6. deletion/retention constraints;
7. security/compliance documentation appropriate to the risk;
8. exit or replacement path for critical vendors.

Material vendor changes must be captured in the pull request or risk register.
