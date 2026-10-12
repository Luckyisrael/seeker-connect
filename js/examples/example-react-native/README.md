# skr-connect-example-react-native

Device harness for `@solana-mobile/seeker-connect-react-native` — the
same role `example-web` plays for the web package: a minimal app whose
only job is to exercise the SDK against a real wallet on a real device.

## What it proves

- **Connect** — one local MWA session: association → `authorize`
  (consent UI) → `get_capabilities`, then the session closes.
- **Reconnect (cached)** — the stored authorization (AsyncStorage) is
  replayed as `authToken` + `walletUriBase`, targeting the same wallet
  directly with no consent UI.
- **Sign message** — `signMessages` over a live session with the cached
  grant.
- **Disconnect** — `deauthorize` on the wallet, then the local cache is
  cleared.

Every outcome (success, decline, timeout, cancel) lands in the on-screen
log as a `SeekerConnectError` code.

## Prerequisites

1. An Android device (API 24+) with a lock screen.
2. [Mock MWA Wallet](https://github.com/solana-mobile/mock-mwa-wallet)
   installed; press **Authenticate** in it first (enables signing for
   15 minutes).

## Run

```sh
pnpm install          # from js/
pnpm android          # or: npx react-native run-android
```

For a live JS reload session, run `pnpm start` in a second terminal.
