/**
 * Wire decoding — MWA's wire shapes (base64 addresses, snake_case JSON)
 * into the port's decoded shapes (base58 `SeekerAccount.address`, raw
 * bytes). Structural twin of the web adapter's `createSessionWallet`.
 */
import type {
	SeekerAuthorization,
	SeekerConnectConfig,
	SeekerWallet,
	SeekerWalletCapabilities,
} from '@solana-mobile/seeker-connect-core';
import { DEFAULT_SEEKER_CHAIN } from '@solana-mobile/seeker-connect-core';
import type { AuthorizationResult, MobileWallet } from '@solana-mobile/mobile-wallet-adapter-protocol';
import {
	base58FromUint8Array,
	base58ToUint8Array,
	base64FromUint8Array,
	base64ToUint8Array,
} from '@solana-mobile/mobile-wallet-adapter-protocol/encoding';

import { walletFailure } from './errors.js';

/**
 * Wraps one live `MobileWallet` handle as the port's `SeekerWallet`.
 * Every method guards: all failures are sealed into the taxonomy —
 * classified protocol errors map precisely, anything else becomes
 * `walletError` (the React Native bridge can deliver raw platform
 * exceptions). Valid only inside the `transact` callback that received
 * it.
 */
export function createSessionWallet(wallet: MobileWallet, config: SeekerConnectConfig): SeekerWallet {
	const guard = async <T>(fn: () => Promise<T>): Promise<T> => {
		try {
			return await fn();
		} catch (e) {
			throw walletFailure(e);
		}
	};
	return {
		authorize: (request) =>
			guard(async () => {
				const result = await wallet.authorize({
					identity: config.identity,
					chain: request?.chain ?? config.chain ?? DEFAULT_SEEKER_CHAIN,
					auth_token: request?.authToken,
					sign_in_payload: request?.signInPayload,
				});
				return mapAuthorization(result);
			}),
		deauthorize: ({ authToken }) =>
			guard(async () => {
				await wallet.deauthorize({ auth_token: authToken });
			}),
		getCapabilities: () =>
			guard(async () => {
				const capabilities = await wallet.getCapabilities();
				return {
					maxMessagesPerRequest: capabilities.max_messages_per_request,
					maxTransactionsPerRequest: capabilities.max_transactions_per_request,
					supportedTransactionVersions: capabilities.supported_transaction_versions,
					features: capabilities.features,
					supportsSignAndSendTransactions: capabilities.supports_sign_and_send_transactions,
				} satisfies SeekerWalletCapabilities;
			}),
		signMessages: ({ addresses, payloads }) =>
			guard(async () => {
				const result = await wallet.signMessages({
					addresses: addresses.map((address) => base64FromUint8Array(base58ToUint8Array(address))),
					payloads: payloads.map((payload) => base64FromUint8Array(payload)),
				});
				return result.signed_payloads.map(base64ToUint8Array);
			}),
		signTransactions: ({ payloads }) =>
			guard(async () => {
				const result = await wallet.signTransactions({
					payloads: payloads.map((payload) => base64FromUint8Array(payload)),
				});
				return result.signed_payloads.map(base64ToUint8Array);
			}),
		signAndSendTransactions: ({ payloads, options }) =>
			guard(async () => {
				const result = await wallet.signAndSendTransactions({
					payloads: payloads.map((payload) => base64FromUint8Array(payload)),
					...(options
						? {
								options: {
									min_context_slot: options.minContextSlot,
									commitment: options.commitment,
									skip_preflight: options.skipPreflight,
									max_retries: options.maxRetries,
									wait_for_commitment_to_send_next_transaction:
										options.waitForCommitmentToSendNextTransaction,
								},
							}
						: {}),
				});
				return result.signatures.map(base64ToUint8Array);
			}),
	};
}

function mapAuthorization(result: AuthorizationResult): SeekerAuthorization {
	return {
		accounts: result.accounts.map((account) => {
			const publicKey = base64ToUint8Array(account.address);
			return {
				address: base58FromUint8Array(publicKey),
				publicKey,
				label: account.label,
			};
		}),
		authToken: result.auth_token,
		walletUriBase: result.wallet_uri_base ?? undefined,
		signInResult: result.sign_in_result
			? {
					address: base58FromUint8Array(base64ToUint8Array(result.sign_in_result.address)),
					publicKey: base64ToUint8Array(result.sign_in_result.address),
					signedMessage: base64ToUint8Array(result.sign_in_result.signed_message),
					signature: base64ToUint8Array(result.sign_in_result.signature),
				}
			: undefined,
	};
}
