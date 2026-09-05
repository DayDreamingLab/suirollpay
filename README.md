# Suiroll

AI prepares payroll. You approve. Sui settles.

## Run locally

From this directory:

```powershell
npm install
npm run dev
```

The parent `.env.local` is synchronized before development. Use `.env.example` for supported names. Server secrets must never use a `NEXT_PUBLIC_` prefix.

## Database

Apply `supabase/migrations/001_initial.sql`, then `002_approval_reservations.sql`, in a new Supabase project's SQL Editor. Sign up in the app and create a workspace. The owner role is assigned to its creator. Configure email redirect URLs for the deployed origin.

## Demo walkthrough

1. Browse the labeled sample workspace, then sign in.
2. Add three real testnet contractors with independently verified wallet addresses.
3. Import the CSV template or enter small manual payments. For a funded treasury with 13 USDC, use amounts such as 0.10 USDC plus a 0.02 USDC bonus. Include a repeated invoice reference to demonstrate exclusion, and a payment over 150% of base compensation to demonstrate a warning.
4. Let Gonka map columns; review source notes and the original values. Confirm adjustments, tax/fee inputs, and rates explicitly.
5. Review the calculated plan and findings; connect the configured treasury wallet.
6. Check payment readiness. Approve & Pay rechecks the exact PTB and asks the wallet to sign.
7. Watch reconciliation compare real balance changes and the registry event. Export the ledger CSV or open the Sui Explorer link.

The agent never signs for the user. No fake wallet, fake balance, or fabricated successful transaction is used.

## Validation

```powershell
npm run typecheck
npm test
sui move test --path move
```

Live checks are opt-in. They use the configured services; simulation does not submit a transaction:

```powershell
$env:RUN_LIVE_CHECKS='1'
npx vitest run tests/live-simulation.test.ts
```

See `docs/IMPLEMENTATION_STATUS.md` for scope and practical limitations and `docs/SETUP_REQUIRED.md` for configuration status.
