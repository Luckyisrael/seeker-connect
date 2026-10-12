/**
 * React Native implementation of the `SeekerLink` port over the local
 * Mobile Wallet Adapter session (`transact` from the React Native export
 * of `@solana-mobile/mobile-wallet-adapter-protocol` — the same package
 * the web adapter runs its scenario API on; the session seam is the only
 * difference between the two targets).
 *
 * Per-interaction sessions, like every upstream target: one `transact` =
 * one association, one callback, always torn down. Continuity across
 * interactions is the wallet-issued auth token through the injected
 * AuthorizationCache — never a held transport.
 */
import type {
	SeekerConnectConfig,
	SeekerLink,
	SeekerTransactOptions,
	SeekerWallet,
} from '@solana-mobile/seeker-connect-core';
import {
	DEFAULT_FIRST_CONNECT_WALLET_BASE_URI,
	SeekerConnectError,
	SeekerConnectErrorCode,
} from '@solana-mobile/seeker-connect-core';
import {
	transact,
	type MobileWallet,
	type Scenario,
	type WalletAssociationConfig,
} from '@solana-mobile/mobile-wallet-adapter-protocol';

import { associationFailure } from './errors.js';
import { createSessionWallet } from './wire.js';

export type { Scenario as MwaScenario };

const DEFAULT_ASSOCIATION_TIMEOUT_MS = 30_000;

/**
 * Establishes one MWA scenario against the device's wallet endpoint.
 *
 * The injection point that makes this adapter contract-testable without
 * hardware: production defaults to the native session below; tests pass a
 * fake scenario that records observations for the contract suite.
 */
export type LocalSessionStarter = (args: { baseUri?: string }) => Promise<Scenario>;

/**
 * The real local session. The protocol package's React Native export
 * provides the callback-scoped `transact` rather than the scenario API
 * its shared types also declare (`startScenario` exists only on the
 * web/default exports), so the native session is bridged into the
 * `Scenario` shape: `transact` associates through the Android intent
 * mechanism and holds its session open until `close()` releases the
 * callback, which ends it natively. Association retries and their
 * timeout live inside the native module; the adapter additionally
 * bounds association with a loose outer race that only fires on genuine
 * hangs — see `associate` below.
 *
 * `baseUri` selects the association target. A learned
 * endpoint-specific URI (the wallet-issued `wallet_uri_base`) passes
 * through so that wallet's App-Link resolves directly; the shared-web
 * first-connect sentinel has no Android association meaning, so it and
 * an absent URI both fall back to Android's own default — an unprefixed
 * `solana-wallet:` intent, the wallet chooser when several qualify.
 */
export const nativeSessionStarter: LocalSessionStarter = async ({ baseUri }) => {
	const config: WalletAssociationConfig | undefined =
		baseUri === undefined || baseUri === DEFAULT_FIRST_CONNECT_WALLET_BASE_URI ? undefined : { baseUri };
	let deliver!: (wallet: MobileWallet) => void;
	let abandon!: (reason: unknown) => void;
	const wallet = new Promise<MobileWallet>((resolve, reject) => {
		deliver = resolve;
		abandon = reject;
	});
	let release!: () => void;
	const released = new Promise<void>((resolve) => {
		release = resolve;
	});
	// `transact`'s rejection lands on the wallet promise the adapter
	// awaits and observes, never as an unhandled rejection of its own.
	void transact(async (sessionWallet) => {
		deliver(sessionWallet);
		await released;
	}, config).then(undefined, abandon);
	return { wallet, close: release };
};

/** Bounds association only; the interaction itself is never timed out. */
async function associate(walletPromise: Scenario['wallet'], timeoutMs: number): Promise<Awaited<Scenario['wallet']>> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			walletPromise,
			new Promise<never>((_, reject) => {
				timer = setTimeout(
					() =>
						reject(
							new SeekerConnectError(
								SeekerConnectErrorCode.associationFailed,
								`No wallet completed association within ${timeoutMs}ms`,
							),
						),
					timeoutMs,
				);
			}),
		]);
	} catch (e) {
		throw e instanceof SeekerConnectError ? e : associationFailure(e);
	} finally {
		clearTimeout(timer);
	}
}

/**
 * Creates the React Native `SeekerLink`. Each `transact` opens one local
 * MWA scenario and closes it when the callback settles.
 *
 * @param startSession - Session seam; defaults to the native RN session.
 */
export function createLocalSeekerLink(startSession: LocalSessionStarter = nativeSessionStarter): SeekerLink {
	return {
		async transact<T>(
			config: SeekerConnectConfig,
			callback: (wallet: SeekerWallet) => Promise<T>,
			options?: SeekerTransactOptions,
		): Promise<T> {
			const signal = options?.signal;
			if (signal?.aborted) {
				throw new SeekerConnectError(
					SeekerConnectErrorCode.sessionClosed,
					'The interaction was aborted before the session started',
				);
			}
			let scenario: Scenario;
			try {
				scenario = await startSession({
					baseUri:
						options?.walletUriBase ||
						config.firstConnectWalletBaseUri ||
						DEFAULT_FIRST_CONNECT_WALLET_BASE_URI,
				});
			} catch (e) {
				throw associationFailure(e);
			}
			// The scenario closes below regardless of outcome; if the race is
			// lost, the abandoned wallet promise still rejects on close and must
			// not surface as an unhandled rejection.
			void scenario.wallet.then(undefined, () => undefined);
			const onAbort = () => scenario.close();
			signal?.addEventListener('abort', onAbort, { once: true });
			try {
				const wallet = await associate(
					scenario.wallet,
					config.associationTimeoutMs ?? DEFAULT_ASSOCIATION_TIMEOUT_MS,
				);
				return await callback(createSessionWallet(wallet, config));
			} finally {
				signal?.removeEventListener('abort', onAbort);
				scenario.close();
			}
		},
	};
}
