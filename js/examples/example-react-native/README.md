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
- **Sign transaction** — `signTransactions` over an unsigned Memo-program
  transaction (hand-rolled builder, no SDK dependency); the log shows the
  signed size and the first bytes of the returned signature. Falls back
  to a placeholder blockhash when the devnet RPC is unreachable.
- **Sign in (SIWS)** — `authorize` with a `signInPayload`; the log shows
  the returned address, signature, and signed message.
- **Disconnect** — `deauthorize` on the wallet, then the local cache is
  cleared.
- **Progress UI** — a presenter-driven overlay (spinner + Cancel) appears
  while any interaction is in flight; Cancel aborts the session and logs
  a `cancelled` error without an error dialog.
- **Share log** — sends the on-screen log through the native share sheet,
  so results can be collected from a device you don't physically hold
  (remote testing).

Every outcome (success, decline, timeout, cancel) lands in the on-screen
log as a `SeekerConnectError` code.

## Prerequisites

1. An Android device (API 24+) with a lock screen.
2. [Mock MWA Wallet](https://github.com/solana-mobile/mock-mwa-wallet)
   installed; press **Authenticate** in it first (enables signing for
   15 minutes).

On a Seeker, the built-in wallet answers the first connect via its
App Link directly — no chooser, no mock wallet needed.

## Run

```sh
pnpm install          # from js/
pnpm android          # or: npx react-native run-android
```

For a live JS reload session, run `pnpm start` in a second terminal.

## Standalone build (no Metro)

`assembleRelease` bundles the JS into the APK, producing a
self-contained installable file — useful for handing the app to someone
else (e.g. remote testing on hardware you don't hold):

```sh
cd android && ./gradlew assembleRelease
# → android/app/build/outputs/apk/release/app-release.apk
```
