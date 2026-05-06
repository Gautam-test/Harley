# PRD Reference

The authoritative spec lives in the repo root as `../../PRD_HarleyDavidson_CPO_Marketplace.docx`.

This file is a placeholder so links from `README.md` and PR descriptions resolve. Once the PRD
is converted to markdown (e.g. via pandoc), drop the body into this file and reference section
numbers in commit messages and PR titles per Appendix C of the PRD.

## Quick links to PRD sections

- §2 Product Overview
- §3 Personas & Roles
- §4 System Architecture
- §5 Data Model — implemented in `apps/api/prisma/schema.prisma`
- §6 Functional Requirements
  - §6.1 Buyer — Public Website
  - §6.2 Dealer — Dealer Portal
  - §6.3 Admin — Admin Portal
- §7 Torque DMS Integration — see `packages/torque-client/`
- §8 Branding & Design System — implemented in `packages/config/tailwind.preset.js`
- §9 Non-Functional Requirements
- §10 Project Plan & Milestones
- §11 Open Questions — also tracked in `../DEVELOPMENT_PLAN.md` §9
