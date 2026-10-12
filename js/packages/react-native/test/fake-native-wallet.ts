/**
 * The wallet double for the React Native adapter's contract run.
 *
 * Where the double sits is the design difference from web: the web fake
 * intercepts the browser globals + relay socket + wallet endpoint; this
 * double plugs into the RN adapter's explicit `LocalSessionStarter`
 * injection point. Same job — the REAL adapter code runs unmocked in
 * node; only the session seam is fake.
 *
 * The double speaks WIRE shapes (snake_case, base64) because that is
 * what the real MWA handle resolves — the adapter's `wire.ts` decoder
 * must convert, and the contract suite's expectations are stated in the
 * port's decoded shapes, so a decoder bug fails the suite.
 *
 * TODO(Phase 2): verify the exact wire field names against the installed
 * protocol d.ts and the upstream fake (`research/seeker-connect/js/packages/web/test/fakeWalletCore.ts`
 * is executable evidence of the web-side wire shape).
 */
import { base64FromUint8Array, base58FromUint8Array } from '@solana-mobile/mobile-wallet-adapter-protocol/encoding';

import type { LocalSessionStarter, MwaWalletHandle } from '../src/mwa-adapter/index.js';

/** Scripted capabilities the double reports on `get_capabilities`. */
export const DEFAULT_FAKE_CAPABILITIES = {
	max_messages_per_request: 10,
	max_transactions_per_request: 10,
	supported_transaction_versions: ['legacy', 0],
	features: ['solana:signTransactions', 'solana:signInWithSolana'],
	supports_sign_and_send_transactions: true,
} as const;

/** Deterministic transform the double applies when signing a payload. */
export function fakeSignedPayload(payload: Uint8Array): Uint8Array {
	const out = new Uint8Array(payload.length + 1);
	out.set(payload);
	out[payload.length] = 0x53; // trailing marker byte
	return out;
}

/** Deterministic signature bytes the double reports per submitted tx. */
export function fakeSignature(payload: Uint8Array): Uint8Array {
	return payload.slice(0, 64).length === 64
		? payload.slice(0, 64)
		: new Uint8Array(64).fill(0x53);
}

export interface FakeNativeWalletOptions {
	/** Pubkey bytes the double authorizes. */
	publicKey: Uint8Array;
	/** Label the wallet assigned the account. */
	label?: string;
	/** Auth token the double issues on authorize. */
	authToken: string;
	/** Endpoint-specific URI the double hands out. */
	walletUriBase: string;
}

export interface FakeWalletScript {
	/** When set, the next authorize rejects with this coded error. */
	authorizeError?: { code: number; message: string };
	/** When true, sessions never resolve (association must time out). */
	unresponsive?: boolean;
}

export class FakeNativeWallet {
	readonly script: FakeWalletScript = {};
	sessionsEstablished = 0;
	openSessions = 0;
	readonly targetedBaseUris: (string | undefined)[] = [];
	readonly authorizeRequests: {
		authToken?: string;
		chain?: string;
		hasSignInPayload: boolean;
	}[] = [];
	readonly deauthorizedTokens: string[] = [];

	constructor(private readonly opts: FakeNativeWalletOptions) {}

	/** The injected session seam — wire the adapter to the double. */
	readonly startSession: LocalSessionStarter = async ({ walletUriBase }) => {
		this.sessionsEstablished += 1;
		this.openSessions += 1;
		this.targetedBaseUris.push(walletUriBase);
		if (this.script.unresponsive) {
			// Never resolves; abort/cleanup is the adapter's problem to
			// handle — exactly what the real association timeout faces.
			return new Promise<MwaWalletHandle>(() => undefined);
		}
		return this.buildHandle();
	};

	reset(): void {
		this.script.authorizeError = undefined;
		this.script.unresponsive = false;
		this.sessionsEstablished = 0;
		this.openSessions = 0;
		this.targetedBaseUris.length = 0;
		this.authorizeRequests.length = 0;
		this.deauthorizedTokens.length = 0;
	}

	private buildHandle(): MwaWalletHandle {
		const { publicKey, label, authToken, walletUriBase } = this.opts;
		return {
			authorize: async (request) => {
				const req = (request ?? {}) as {
					auth_token?: string;
					chain?: string;
					sign_in_payload?: unknown;
				};
				this.authorizeRequests.push({
					authToken: req.auth_token,
					chain: req.chain,
					hasSignInPayload: req.sign_in_payload != null,
				});
				if (this.script.authorizeError) {
					// Coded refusal, like the wire's error objects.
					throw { code: this.script.authorizeError.code, message: this.script.authorizeError.message };
				}
				return {
					auth_token: authToken,
					wallet_uri_base: walletUriBase,
					accounts: [
						{
							address: base64FromUint8Array(publicKey),
							...(label != null ? { label } : {}),
						},
					],
					// TODO(Phase 2): SIWS sign_in_result wire shape
					// (base64 address/signed_message/signature) when the
					// request carried a sign_in_payload — verified against
					// the protocol d.ts, not guessed.
				};
			},
			deauthorize: async ({ auth_token }) => {
				this.deauthorizedTokens.push(auth_token);
			},
			getCapabilities: async () => ({ ...DEFAULT_FAKE_CAPABILITIES }),
			signMessages: async ({ payloads }: { payloads: Uint8Array[] }) =>
				payloads.map((p) => base64FromUint8Array(fakeSignedPayload(p))),
			signTransactions: async ({ payloads }: { payloads: Uint8Array[] }) =>
				payloads.map((p) => base64FromUint8Array(p)),
			signAndSendTransactions: async ({ payloads }: { payloads: Uint8Array[] }) =>
				payloads.map((p) => base64FromUint8Array(fakeSignature(p))),
		};
	}
}

/** Expected decoded account for contract expectations. */
export function fakeDecodedAccount(opts: FakeNativeWalletOptions) {
	return {
		address: base58FromUint8Array(opts.publicKey),
		publicKey: opts.publicKey,
		...(opts.label != null ? { label: opts.label } : {}),
	};
}
