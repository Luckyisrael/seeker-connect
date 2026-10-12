/**
 * React Native implementation of the Seeker Connect `SeekerLink` port.
 *
 * The RN target listed as "Planned" in the upstream Seeker Connect docs.
 * Mirrors the web package's layout: everything MWA-shaped lives behind
 * `mwa-adapter/` — the only module permitted to import `@solana-mobile/*`
 * (the lint boundary core's doc comment prescribes).
 */
export {
	createLocalSeekerLink,
	nativeSessionStarter,
	type LocalSessionStarter,
	type MwaScenario,
} from './mwa-adapter/index.js';
export {
	createAsyncStorageAuthorizationCache,
	type KeyValueStorage,
} from './authorization-cache.js';
export { isSeekerDevice } from './detect.js';
export { noopSeekerConnectPresenter } from './presenter.js';

// The shared contracts, re-exported for consumers' convenience — types
// come from core so every target agrees on one definition.
export type {
	SeekerLink,
	SeekerConnectConfig,
	SeekerWallet,
	SeekerAuthorization,
	SeekerAccount,
	SeekerSignInPayload,
	SeekerSignInResult,
	StoredAuthorization,
	AuthorizationCache,
	SeekerConnectPresenter,
} from '@solana-mobile/seeker-connect-core';
export {
	SeekerConnectError,
	SeekerConnectErrorCode,
	DEFAULT_SEEKER_CHAIN,
	DEFAULT_FIRST_CONNECT_WALLET_BASE_URI,
} from '@solana-mobile/seeker-connect-core';
