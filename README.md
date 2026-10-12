# Seeker Connect

A dapp-only SDK that gives a tighter, branded, direct connect experience for a
Solana Mobile certified device's own wallet (Seeker is the first such device),
built **on top of** — not replacing — the official Mobile Wallet Adapter (MWA)
libraries.

Where generic MWA centers on a "pick a wallet" chooser, Seeker Connect skips that
disambiguation in favor of Seeker-Connect-owned UI and copy, using the MWA spec's
existing Endpoint-specific URI (Android App Link) mechanism. It is a UX/DX layer,
not a protocol reimplementation.

## Try it

A live example dapp is deployed from `js/examples/example-web`:

**<https://solana-mobile.github.io/seeker-connect/example-web/>**

## Packages

The web SDK ships as four npm packages under `@solana-mobile/seeker-connect-*`:

| Package | Purpose |
| --- | --- |
| [`@solana-mobile/seeker-connect-wallet-standard`](https://github.com/solana-mobile/seeker-connect/tree/main/js/packages/wallet-standard) | Wallet Standard implementation — the entry point most dapps use. |
| [`@solana-mobile/seeker-connect-web`](https://github.com/solana-mobile/seeker-connect/tree/main/js/packages/web) | Imperative web SDK for dapps not using Wallet Standard. |
| [`@solana-mobile/seeker-connect-ui`](https://github.com/solana-mobile/seeker-connect/tree/main/js/packages/ui) | Seeker-Connect-owned UI (Lit): connect button, progress overlay, error dialogs. |
| [`@solana-mobile/seeker-connect-core`](https://github.com/solana-mobile/seeker-connect/tree/main/js/packages/core) | Platform-agnostic contracts, shared types, and error taxonomy. |

The React Native target ships as one package:

| Package | Purpose |
| --- | --- |
| [`@solana-mobile/seeker-connect-react-native`](https://github.com/solana-mobile/seeker-connect/tree/main/js/packages/react-native) | React Native (Android) SDK — connects directly to the device's own wallet over the local MWA session. |

Most dapps depend only on `@solana-mobile/seeker-connect-wallet-standard`, which
pulls in `-web`, `-ui`, and `-core` transitively. React Native dapps depend on
`@solana-mobile/seeker-connect-react-native` alone.

The generated [API reference](https://solana-mobile.github.io/seeker-connect/api/)
covers all four packages and is rebuilt from `main` on every push.

## Install

```sh
npm install @solana-mobile/seeker-connect-wallet-standard
```

Discovering a Wallet Standard wallet also needs the standard registry helpers,
which most Solana dapps already have:

```sh
npm install @wallet-standard/app @wallet-standard/features
```

## Quick start (Wallet Standard)

```ts
import { registerSeekerConnect } from '@solana-mobile/seeker-connect-wallet-standard';
import { getWallets } from '@wallet-standard/app';
import { StandardConnect } from '@wallet-standard/features';

// 1. Register Seeker Connect into the page's Wallet Standard registry.
registerSeekerConnect({
  identity: { name: 'My Dapp', uri: window.location.origin, icon: '/icon.png' },
  relayDomain: '<relay-domain>',
});

// 2. Discover it like any other Wallet Standard wallet.
const wallet = getWallets()
  .get()
  .find((w) => w.name === 'Seeker Connect');

// 3. Connect — launches the wallet for user consent on first connect.
const { accounts } = await wallet.features[StandardConnect].connect();
console.log('connected as', accounts[0]?.address);
```

"Connected" means the dapp holds a wallet-issued authorization token — there is
no long-lived transport. Each interaction (authorize, sign) runs in its own
short-lived MWA session and silently reauthorizes with the cached token, so the
user is not re-prompted for consent.

For the full end-to-end walkthrough — auto-discovery, connect/sign flows, the
imperative `-web` path, configuration, and the error taxonomy — see the
[web integration guide](https://github.com/solana-mobile/seeker-connect/blob/main/docs/integration-web.md).

## Targets

Three dapp-side targets, built in this order:

1. **Web** (`js/`) — custom Wallet Standard implementation over the low-level MWA protocol package. (Shipping.)
2. **React Native** (`js/`) — over the MWA native module. (Shipping.)
3. **Android Kotlin** (`android/`) — gated on an upstream MWA patch. (Planned.)

## Repository layout

```
seeker-connect/
├── js/          JS/TS monorepo (web + React Native) — pnpm workspaces + Turborepo + vitest
│   ├── packages/
│   │   ├── core/                SeekerLink port, shared types, error taxonomy, contract-test suite
│   │   ├── wallet-standard/     Wallet Standard implementation — the first MVP
│   │   ├── ui/                  Seeker-Connect-owned UI (Lit): progress overlay + error dialogs
│   │   ├── web/                 imperative web SDK for dapps not using Wallet Standard
│   │   └── react-native/        React Native (Android) SDK over the local MWA session
│   └── examples/
│       ├── example-web/         Vite + React demo consuming Wallet Standard directly,
│       │                        plus the browser E2E harness (`pnpm e2e`)
│       └── example-react-native/ React Native device harness (mock wallet or Seeker)
└── android/     Android Kotlin SDK (Gradle) — added in the Android phase
```

The Wallet Standard package is non-negotiable: whatever other entry points
ship, a Wallet-Standard-compatible package is always provided.

## Design principles

- **Legacy-MWA dependency is isolated** behind an internal per-platform port
  (working name `SeekerLink`), so the eventual swap to the not-yet-built
  `mwa-core` (Kotlin Multiplatform) rewrite is a contained change. A shared
  contract-test suite guards that boundary.
- **Nostr relay transport is the primary connection path.** Local WebSocket is a
  post-MVP fallback; the custom reflector protocol is not used at all.
- **Automated tests are the release gate** — protocol-level tests (no Android) plus
  emulator E2E against Mock Wallet — not manual QA.

## Development

```sh
cd js
corepack pnpm install
corepack pnpm build
corepack pnpm test          # protocol-level + unit suites (no browser, no Android)
corepack pnpm lint
corepack pnpm format:check
corepack pnpm docs:build    # API reference → js/dist/api
```

Browser E2E (real Chromium via agent-browser; fake wallet over a real Nostr
relay — requires network access to the relay):

```sh
cd js/examples/example-web
corepack pnpm e2e
```

The example app itself: `corepack pnpm dev` in `js/examples/example-web`
(config via URL params — see `src/config.ts`).

## License

Apache-2.0.
