# @solana-mobile/seeker-connect-react-native

The React Native implementation of [Seeker Connect](https://github.com/solana-mobile/seeker-connect)
— connects your app directly to a Solana Mobile certified device's own
wallet (Seeker is the first) over the local Mobile Wallet Adapter
session. No "pick a wallet" chooser: first connections target the shared
App-Link domain so Android opens the installed certified wallet
directly; later connections reuse the learned endpoint-specific URI.

## Install

```sh
npm install @solana-mobile/seeker-connect-react-native
```

Peer dependencies: `react`, `react-native`. Optional: `@tanstack/react-query`
(required only for the `./hooks` subpath).

Android only — the local MWA session does not exist on iOS.

## Usage

`createLocalSeekerLink()` returns a `SeekerLink`. Its `transact` method
opens one local MWA session, runs your callback against a `SeekerWallet`,
and closes the session when the callback settles. The `wallet` handle is
valid only inside the callback; payloads are raw `Uint8Array` and
addresses are base58 strings.

```ts
import { createLocalSeekerLink } from '@solana-mobile/seeker-connect-react-native';
import type { SeekerConnectConfig } from '@solana-mobile/seeker-connect-react-native';

const link = createLocalSeekerLink();

const config: SeekerConnectConfig = {
	identity: { name: 'My Dapp', uri: 'https://mydapp.example.com' },
	// Required by the shared config type; ignored by the local adapter
	// (no relay is involved). Any placeholder satisfies the type.
	relayDomain: 'unavailable',
};

const authorization = await link.transact(config, async (wallet) => {
	const granted = await wallet.authorize({ chain: 'solana:mainnet' });
	// Persist the grant here — this callback owns the authorize result.
	await cache.set({
		accounts: granted.accounts,
		authToken: granted.authToken,
		walletUriBase: granted.walletUriBase,
		chain: 'solana:mainnet',
		capabilities: await wallet.getCapabilities(),
	});
	return granted;
});
```

Everything the callback throws passes through `transact` unmodified, so
domain errors raised inside your own code are never masked by the SDK's
error taxonomy.

### Sign in with Solana

`authorize` carries the full SIWS payload; the proof arrives on the
result:

```ts
const authorization = await link.transact(config, async (wallet) => {
	const result = await wallet.authorize({
		signInPayload: {
			domain: 'mydapp.example.com',
			statement: 'Sign in to My Dapp',
			uri: 'https://mydapp.example.com',
			nonce,
			issuedAt: new Date().toISOString(),
		},
	});
	return result.signInResult; // { address, publicKey, signedMessage, signature }
});
```

### Sign a transaction

`signTransactions` takes serialized transactions (base58-encoded on the
wire) and resolves the signed bytes, one per payload:

```ts
const [signed] = await link.transact(config, async (wallet) => {
	await wallet.authorize({ authToken: stored.authToken });
	return await wallet.signTransactions({ payloads: [serializedTransaction] });
});
```

If the session drops after `signAndSendTransactions`, re-check the chain
before retrying — the wallet may already have submitted the transaction.

### Reconnecting without a prompt

Persist the authorization through an `AuthorizationCache` and pass the
stored `authToken` back to `authorize` — the wallet reauthorizes
silently, no consent UI. Storage is injected, so you choose the
protection level (the docs' caching recipe recommends secure storage for
production, not plain AsyncStorage):

```ts
import { createAsyncStorageAuthorizationCache } from '@solana-mobile/seeker-connect-react-native';
import * as SecureStore from 'expo-secure-store';

const cache = createAsyncStorageAuthorizationCache(SecureStore);
const stored = await cache.get();
if (stored) {
	// reuse stored.walletUriBase as options.walletUriBase to target the
	// same wallet directly, and stored.authToken for silent reauthorization.
}
```

### React hooks (TanStack Query)

```ts
import { useSeekerConnect } from '@solana-mobile/seeker-connect-react-native/hooks';

const { authorization, isConnecting, transact, disconnect } = useSeekerConnect({
	config,
	cache,
});
```

The cached authorization reads as a query; `transact` runs as a
mutation that never auto-retries (wallet consent must not fire
unattended).

### Progress UI (presenter)

The hook accepts a `SeekerConnectPresenter` — the SDK-owned surface for
the spinner overlay, cancel button, and error dialogs around each
interaction. Its `cancel` aborts the session; a user-initiated cancel
rejects as `cancelled` without an error dialog:

```ts
const presenter: SeekerConnectPresenter = {
	interactionStarted: (cancel) => {
		showProgressOverlay({ onCancel: cancel });
		return () => hideProgressOverlay();
	},
	interactionFailed: (error) => {
		showErrorDialog(`${error.code}: ${error.message}`);
	},
};

const { transact } = useSeekerConnect({ config, cache, presenter });
```

Without a presenter, `transact` behaves identically — the overlay is
purely additive. The example app implements this with a native overlay.

## How it works

The adapter opens one local MWA session per `transact` call:

1. **Association** — the first connect targets the shared App-Link
   domain (`connect.solanamobile.com`), which Android resolves to the
   installed certified wallet; subsequent connects reuse the learned
   endpoint-specific `walletUriBase` to skip the chooser entirely.
2. **Session** — the MWA session carries `authorize`, `signMessages`,
   `signTransactions`, `signAndSendTransactions`, and `deauthorize`
   requests; the session closes when your callback settles.
3. **Wire** — payloads are base64-encoded on the MWA wire and decoded to
   raw `Uint8Array` for the SDK's consumers.
4. **Errors** — every failure is a `SeekerConnectError` with one of six
   codes (see below); errors thrown inside your callback pass through
   unmodified.

## Error handling

Every failure from `transact` (and from any `SeekerWallet` method) is a
`SeekerConnectError` with one of six codes: `association-failed`,
`authorization-declined`, `request-declined`, `session-closed`,
`cancelled`, `wallet-error`. Errors your own callback throws pass through
unmodified.

**`session-closed` after `signAndSendTransactions` does not mean the
transaction failed** — the wallet may already have submitted it. Never
retry automatically; re-check the chain state instead.

## Known limitations

- **Android only** — the local MWA session does not exist on iOS.
- **`relayDomain` is unused** — the local transport has no relay; the
  config field exists for type compatibility with the shared
  `SeekerConnectConfig` contract.
- **The RN protocol package's `transact` does not await `invoke()`** —
  the adapter handles this by holding the session until `close()`.
- **`isSeekerDevice()` is spoofable** — it checks
  `Platform.constants.Model === 'Seeker'`; fine for routing UX, not for
  guarantees.
- **Real Seeker hardware** is needed only for final acceptance; the
  mock MWA wallet covers development.

## Device detection

`isSeekerDevice()` checks `Platform.constants.Model === 'Seeker'`. It is
spoofable by design — fine for routing connect UX, not for guarantees.
For verified Seeker ownership, use the docs' server-side pattern: SIWS,
then an on-chain Seeker Genesis Token check.

## Testing

Against any Android device or emulator, install the
[mock MWA wallet](https://github.com/solana-mobile/mock-mwa-wallet)
(free; requires a device lock screen) — it simulates Seed Vault Wallet
functionality. Real Seeker hardware is needed only for final acceptance.

The example app (`js/examples/example-react-native`) exercises the full
surface: connect, reconnect, sign message, sign transaction, SIWS,
disconnect, and a share-log button for remote evidence collection.
