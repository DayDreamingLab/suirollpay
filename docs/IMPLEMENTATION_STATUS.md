# Suiroll implementation status

## Completed

- React/TypeScript Sites app with responsive navigation and light/dark/system themes.
- Overview, payroll runs, contractor directory/details, treasury, reconciliation, insights, settings, authentication, help.
- CSV/XLSX import, manual entry, source preservation, explicit input review.
- Supabase authentication, organization roles, private storage, SQL migrations, RLS.
- Exact bigint arithmetic, adjustments, user-verified taxes and FX rates, duplicate exclusions and policy blocking.
- Server-created immutable payment plans and SHA-256 commitments.
- Current Sui gRPC SDK, official dApp Kit wallet connection, exact PTB byte approval, signature verification, submission, reconciliation.
- Existing deployed registry ABI inspected. Reference Move source and local tests provided.
- Gonka provider abstraction, narrow schema-validated operations, bounded retries/timeouts, persisted checkpoints and evidence.
- Invoice reservations prevent concurrent approval across payroll runs.
- Supabase live authentication and RLS validation passed; temporary identities removed.
- 21 financial, commitment, AI parsing, and settlement-evidence tests passed.
- All three local Move tests passed: recording, duplicate prevention, paused registry.
- Live Gonka structured inference and real testnet simulation passed; no payment submitted.
- Live authenticated API workflow passed from import through approval, including duplicate reservations and invalid-signature rejection.
- TypeScript and application lint checks passed. Vendored starter UI and its mobile hook are excluded from application lint because the supplied catalog has existing rule violations.
- Dependency security updates applied; npm audit reports zero vulnerabilities.
- Production build passed, including all page and API routes.

## In progress

- Private deployment. Runtime configuration is securely saved for the Site.

## Architecture decisions

- Private financial state is writable only through authenticated role-checked server routes. Public keys are read-only under organization RLS.
- Payroll source values are never inferred from a summary. Operators verify imported defaults, adjustments, tax inputs and exchange rates before calculation.
- The deployed registry records commitments. Transfers occur in the same PTB and both balance changes and the BCS event are checked before signing and after settlement.
- Transaction digest is saved before submission; uncertain network outcomes remain pending and can be reconciled safely.
- Demo browsing is explicitly sample-only and cannot submit payments. Real testnet demo uses verified contractor addresses entered by the operator.

## Configuration and migration status

- User supplied Supabase, Gonka, treasury, registry, capability, and USDC settings.
- Markdown-formatted Supabase and Gonka URLs corrected in local environment files.
- Both SQL migrations applied by user and independently verified.
- Sui registry/capability/USDC metadata verified; no contract deployment or transfer performed by Codex.

## Known limits

- CSV/XLSX supported; invoice PDF/OCR and email connectors are not implemented.
- Tax amounts and FX rates are supplied by the operator, not jurisdiction-specific calculations or market quotations.
- Team roles supported; self-service invitations are not implemented.
- AI operations resume through explicit retry; no always-on job worker is deployed.
- Reference Move source matches the public ABI; it is not claimed to be the exact source of the existing deployment.

## Next step

Finish validation and private deployment; user signs a real testnet payment from their wallet for the final end-to-end demonstration.
