# Audit fixes

This branch implements the post-audit performance and maintainability work:

- Generates the splash artwork at build time as `public/gwap-splash.webp`.
- Removes the Node runtime image endpoint.
- Adds lint, typecheck, and build validation in GitHub Actions.
- Removes per-frame layout reads from cinematic scroll calculations.
- Centralizes global stylesheet ordering.
- Uses Vercel's native Next.js build defaults.

The source splash fragments remain temporarily as build inputs. They can be replaced later with the original binary asset without changing runtime behavior.
