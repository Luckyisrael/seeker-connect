/**
 * React Native implementation of the `SeekerLink` port over the RN local
 * Mobile Wallet Adapter session — the structural twin of the web Nostr
 * adapter (`js/packages/web/src/mwa-adapter/index.ts`, 247 lines), with
 * the session seam swapped and made INJECTABLE so the contract suite can
 * drive a wallet double without a device.
 *
 * Per-interaction sessions, like every upstream target: one `transact` =
 * one association, one callback, always torn down. Continuity across
 * interactions is the wallet-issued auth token through the injected
 * AuthorizationCache — never a held transport.
 */
import type {
	SeekerAuthorization,
	SeekerConnectConfig,
	SeekerLink,
	SeekerTransactOptions,
	SeekerWallet,
} from '@solana-mobile/seeker-connect-core';
import {
	DEFAULT_FIRST_CONNECT_WALLET_BASE_URI,
	DEFAULT_SEEKER_CHAIN,
	SeekerConnectError,
	SeekerConnectErrorCode,
} from '@solana-mobile/seeker-connect-core';

import { mapSessionError } from './errors.js';
import { createSessionWallet, type MwaWalletHandle } from './wire.js';

export type { MwaWalletHandle };

const DEFAULT_ASSOCIATION_TIMEOUT_MS = 30_000;

/**
 * Establishes one MWA session against the device's wallet endpoint and
 * resolves the live (wire-shaped) wallet handle.
 *
 * The injection point that makes this adapter contract-testable without
 * hardware: production defaults to the native session below; tests pass a
 * fake that records observations for the contract suite.
 *
 * TODO(Phase 2): implement `nativeSessionStarter` over the RN MWA local
 * session. The candidates, to verify against the installed d.ts rather
 * than guess:
 *   - `transact` / `startScenario` from `@solana-mobile/mobile-wallet-adapter-protocol`
 *     (the same ^3 package the web adapter imports its Nostr scenario from),
 *   - the protocol-kit wrapper the wallet-ui stack uses on RN.
 * The MWA wire shapes on the other side of this seam are identical to
 * web's — that is why `wire.ts` ports cleanly.
 */
export type LocalSessionStarter = (args: {
	config: SeekerConnectConfig;
	walletUriBase?: string | undefined;
	signal?: AbortSignal | undefined;
}) => Promise<MwaWalletHandle>;

/**
 * Creates the React Native `SeekerLink`. Each `transact` opens one local
 * MWA session and closes it when the callback settles.
 *
 * @param startSession - Session seam; defaults to the native RN session.
 */
export function createLocalSeekerLink(
	startSession: LocalSessionStarter = () => {
		throw new SeekerConnectError(
			SeekerConnectErrorCode.walletError,
			'createLocalSeekerLink: no native session starter available yet — the RN MWA session seam is unimplemented (scaffold). Pass a LocalSessionStarter or complete TODO(Phase 2).',
		);
	},
): SeekerLink {
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
			// TODO(Phase 2): real association. The structure below is the
			// web adapter's, kept deliberately: map every failure through
			// the taxonomy, race the association phase against
			// `associationTimeoutMs` (association only, never the
			// interaction), and settle exactly once.
			void DEFAULT_ASSOCIATION_TIMEOUT_MS;
			void DEFAULT_SEEKER_CHAIN;
			void DEFAULT_FIRST_CONNECT_WALLET_BASE_URI;
			void mapSessionError;
			let handle: MwaWalletHandle;
			try {
				handle = await startSession({
					config,
					walletUriBase:
						options?.walletUriBase ??
						config.firstConnectWalletBaseUri ??
						DEFAULT_FIRST_CONNECT_WALLET_BASE_URI,
					signal,
				});
			} catch (e) {
				throw mapSessionError(e, 'association');
			}
			const onAbort = () => {
				// TODO(Phase 2): tear the native session down (mirrors the
				// web adapter's `scenario.close()` on abort).
				void handle;
			};
			signal?.addEventListener('abort', onAbort, { once: true });
			try {
				return await callback(createSessionWallet(handle));
			} catch (e) {
				throw mapSessionError(e, 'interaction');
			} finally {
				signal?.removeEventListener('abort', onAbort);
				// TODO(Phase 2): close the native session. MWA sessions are
				// per-interaction — nothing outlives this call.
			}
		},
	};
}

/** What the SIWS authorize path returns, decoded — re-exported shape doc. */
export type { SeekerAuthorization };
