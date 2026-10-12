/**
 * Wire decoding — MWA's wire shapes (base64 addresses, snake_case JSON)
 * into the port's decoded shapes (base58 `SeekerAccount.address`, raw
 * bytes). The structural twin of the web adapter's `createSessionWallet`.
 *
 * TODO(Phase 2): verify every wire field name against the installed
 * `@solana-mobile/mobile-wallet-adapter-protocol` d.ts and the upstream
 * fake harness (`research/seeker-connect/js/packages/web/test/fakeWalletCore.ts`
 * is executable evidence of the wire shape). Use the protocol package's
 * `/encoding` subpath for conversions — do not hand-roll base58/base64.
 */
import type {
	SeekerAccount,
	SeekerAuthorization,
	SeekerSignInResult,
	SeekerWallet,
	SeekerWalletCapabilities,
} from '@solana-mobile/seeker-connect-core';

/**
 * The live MWA wallet handle inside one session — wire-shaped, exactly
 * what the RN MWA session resolves. TODO(Phase 2): replace with the
 * protocol package's `MobileWallet` type once the native seam is picked;
 * the adapter's contract is what `createSessionWallet` consumes, not this.
 */
export interface MwaWalletHandle {
	authorize(request?: unknown): Promise<unknown>;
	deauthorize(request: { auth_token: string }): Promise<void>;
	getCapabilities(): Promise<unknown>;
	signMessages(request: unknown): Promise<unknown>;
	signTransactions(request: unknown): Promise<unknown>;
	signAndSendTransactions(request: unknown): Promise<unknown>;
}

/**
 * Wraps one wire-shaped handle as the port's `SeekerWallet`. Every method
 * passes through and decodes; nothing here outlives the session.
 *
 * TODO(Phase 2): `authorize` needs the config's chain to default the wire
 * request's chain (web's `createSessionWallet(wallet, config)` takes the
 * whole config for this). Reintroduce that parameter when implementing —
 * the contract suite pins `forwards the configured chain to the wallet`.
 */
export function createSessionWallet(handle: MwaWalletHandle): SeekerWallet {
	return {
		async authorize(request): Promise<SeekerAuthorization> {
			// TODO(Phase 2): map {chain, authToken, signInPayload} → the
			// wire authorize, decode accounts (base64 → base58 + bytes),
			// auth_token, wallet_uri_base, and the optional sign_in_result.
			void request;
			throw decodeNotImplemented('authorize');
		},
		async deauthorize(request): Promise<void> {
			await handle.deauthorize({ auth_token: request.authToken });
		},
		async getCapabilities(): Promise<SeekerWalletCapabilities> {
			// TODO(Phase 2): snake_case wire → the decoded capabilities
			// (max_messages_per_request → maxMessagesPerRequest, etc.).
			void handle;
			throw decodeNotImplemented('getCapabilities');
		},
		async signMessages(request): Promise<Uint8Array[]> {
			// TODO(Phase 2): addresses are base58 IN, base64 on the wire;
			// payloads out are base64 on the wire, bytes in the port.
			void request;
			throw decodeNotImplemented('signMessages');
		},
		async signTransactions(request): Promise<Uint8Array[]> {
			void request;
			throw decodeNotImplemented('signTransactions');
		},
		async signAndSendTransactions(request): Promise<Uint8Array[]> {
			void request;
			throw decodeNotImplemented('signAndSendTransactions');
		},
	};
}

function decodeNotImplemented(method: string): Error {
	return new Error(
		`SeekerWallet.${method}: wire decoding unimplemented (scaffold — Phase 2 TODO)`,
	);
}

/** Sanity types the decoder must produce; kept exported for unit tests. */
export type DecodedSignResult = SeekerSignInResult;
export type DecodedAccounts = readonly SeekerAccount[];
