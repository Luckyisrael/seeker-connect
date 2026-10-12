/**
 * The wallet double for the React Native adapter's contract run.
 *
 * Sits at the `LocalSessionStarter` injection point and speaks the same
 * shapes the real local session does: a `Scenario` ({ wallet, close })
 * whose wallet resolves to a wire-shaped handle. The REAL adapter code
 * runs unmocked in node; only the session seam is fake.
 *
 * Wire shapes throughout (snake_case, base64) because that is what the
 * real MWA handle resolves — a decoder bug in `wire.ts` fails the suite
 * rather than passing a same-wrong-shape round trip.
 */
import { base58FromUint8Array, base64FromUint8Array } from '@solana-mobile/mobile-wallet-adapter-protocol/encoding';
import { SolanaMobileWalletAdapterProtocolError } from '@solana-mobile/mobile-wallet-adapter-protocol';

import type { LocalSessionStarter } from '../src/mwa-adapter/index.js';

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
	out[payload.length] = 0x53;
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
	/** When true, association never completes until the session closes. */
	unresponsive?: boolean;
}

interface WireAuthorizationRequest {
	auth_token?: string;
	chain?: string;
	sign_in_payload?: unknown;
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

	#rejectPendingWallet: ((reason: Error) => void) | undefined;

	constructor(private readonly opts: FakeNativeWalletOptions) {}

	/** The injected session seam — wire the adapter to the double. */
	readonly startSession: LocalSessionStarter = async ({ baseUri }) => {
		this.sessionsEstablished += 1;
		this.openSessions += 1;
		this.targetedBaseUris.push(baseUri);
		let wallet: Promise<unknown>;
		if (this.script.unresponsive) {
			// Resolves only when the session closes; the adapter must tear
			// the session down (abort or association timeout) to settle.
			wallet = new Promise((_, reject) => {
				this.#rejectPendingWallet = reject;
			});
		} else {
			wallet = Promise.resolve(this.buildHandle());
		}
		return {
			wallet: wallet as never,
			// Idempotent like the real scenario's close: the adapter calls it
			// on abort AND in `finally`, so a second call must be a no-op.
			close: () => {
				if (this.#rejectPendingWallet === undefined && this.openSessions === 0) return;
				this.openSessions -= 1;
				this.#rejectPendingWallet?.(new Error('session closed'));
				this.#rejectPendingWallet = undefined;
			},
		};
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

	private buildHandle() {
		const { publicKey, label, authToken, walletUriBase } = this.opts;
		return {
			authorize: async (request?: WireAuthorizationRequest) => {
				const req = request ?? {};
				this.authorizeRequests.push({
					authToken: req.auth_token,
					chain: req.chain,
					hasSignInPayload: req.sign_in_payload != null,
				});
				if (this.script.authorizeError) {
					throw new SolanaMobileWalletAdapterProtocolError(
						0,
						this.script.authorizeError.code as never,
						this.script.authorizeError.message,
					);
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
					...(req.sign_in_payload != null
						? {
								sign_in_result: {
									address: base64FromUint8Array(publicKey),
									signed_message: base64FromUint8Array(fakeSignedPayload(publicKey)),
									signature: base64FromUint8Array(fakeSignature(publicKey)),
								},
							}
						: {}),
				};
			},
			deauthorize: async ({ auth_token }: { auth_token: string }) => {
				this.deauthorizedTokens.push(auth_token);
			},
			getCapabilities: async () => ({ ...DEFAULT_FAKE_CAPABILITIES }),
			signMessages: async ({ payloads }: { payloads: string[] }) => ({
				signed_payloads: payloads.map((p) => base64FromUint8Array(fakeSignedPayload(decodeBase64(p)))),
			}),
			signTransactions: async ({ payloads }: { payloads: string[] }) => ({
				signed_payloads: payloads.map((p) => base64FromUint8Array(fakeSignedPayload(decodeBase64(p)))),
			}),
			signAndSendTransactions: async ({ payloads }: { payloads: string[] }) => ({
				signatures: payloads.map((p) => base64FromUint8Array(fakeSignature(decodeBase64(p)))),
			}),
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

function decodeBase64(value: string): Uint8Array {
	return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}
