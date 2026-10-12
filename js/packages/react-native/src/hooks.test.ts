// @vitest-environment happy-dom
/**
 * Laws for `useSeekerConnect`: the cached authorization reads as a
 * query, wallet interactions run as a mutation that never auto-retries
 * (consent prompts must not fire unattended), and `disconnect` clears
 * both the cache and the query.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { AuthorizationCache, SeekerConnectConfig, StoredAuthorization } from '@solana-mobile/seeker-connect-core';
import { SeekerConnectError, SeekerConnectErrorCode } from '@solana-mobile/seeker-connect-core';
import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useSeekerConnect } from './hooks.js';

const CONFIG: SeekerConnectConfig = {
	identity: { name: 'Hook Dapp', uri: 'https://dapp.example.com' },
	relayDomain: 'unavailable-for-local.example',
};

const AUTHORIZATION: StoredAuthorization = {
	accounts: [{ address: 'ADDR', publicKey: Uint8Array.of(9) }],
	authToken: 'TOKEN',
	chain: 'solana:mainnet',
	capabilities: {
		supportedTransactionVersions: [],
		features: [],
		supportsSignAndSendTransactions: false,
	},
};

function fakeCache(overrides?: Partial<AuthorizationCache>): AuthorizationCache {
	return {
		get: vi.fn(async () => AUTHORIZATION),
		set: vi.fn(async () => undefined),
		clear: vi.fn(async () => undefined),
		...overrides,
	};
}

function harness(cache: AuthorizationCache, link?: Parameters<typeof useSeekerConnect>[0]['link']) {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	const wrapper = ({ children }: { children: ReactNode }) =>
		createElement(QueryClientProvider, { client: queryClient }, children);
	return renderHook(() => useSeekerConnect({ config: CONFIG, cache, link }), { wrapper });
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe('useSeekerConnect', () => {
	it('exposes the stored authorization from the cache', async () => {
		const { result } = harness(fakeCache());
		await waitFor(() => expect(result.current.authorization).toEqual(AUTHORIZATION));
	});

	it('exposes undefined authorization when the cache is empty', async () => {
		const { result } = harness(fakeCache({ get: vi.fn(async () => undefined) }));
		await waitFor(() => expect(result.current.authorization).toBeUndefined());
	});

	it('transact resolves the link result and marks the pending state', async () => {
		let settle!: (value: string) => void;
		const pending = new Promise<string>((resolve) => {
			settle = resolve;
		});
		const link = {
			transact: vi.fn(<T>(config: SeekerConnectConfig, callback: () => Promise<T>) => {
				void config;
				void callback;
				return pending as unknown as Promise<T>;
			}),
		};
		const { result } = harness(fakeCache(), link);
		let resolved: string | undefined;
		void result.current
			.transact(async () => 'ignored-by-fake')
			.then((value) => {
				resolved = value;
			});
		await waitFor(() => expect(result.current.isConnecting).toBe(true));
		settle('done');
		await waitFor(() => expect(resolved).toBe('done'));
		await waitFor(() => expect(result.current.isConnecting).toBe(false));
	});

	it('surfaces a failed transact as connectError without retrying', async () => {
		const failure = new SeekerConnectError(SeekerConnectErrorCode.authorizationDeclined, 'declined');
		let attempts = 0;
		const link = {
			transact: vi.fn(async () => {
				attempts += 1;
				throw failure;
			}),
		};
		const { result } = harness(fakeCache(), link);
		await expect(result.current.transact(async () => 'unreachable')).rejects.toBe(failure);
		await waitFor(() => expect(result.current.connectError).toBe(failure));
		expect(attempts).toBe(1);
	});

	it('disconnect clears the cache and empties the authorization', async () => {
		const cache = fakeCache();
		const { result } = harness(cache);
		await waitFor(() => expect(result.current.authorization).toEqual(AUTHORIZATION));
		cache.get = vi.fn(async () => undefined);
		await result.current.disconnect();
		await waitFor(() => expect(result.current.authorization).toBeUndefined());
		expect(cache.clear).toHaveBeenCalled();
	});
});

describe('presenter', () => {
	function presenterHarness() {
		const settle = vi.fn();
		const presenter = {
			interactionStarted: vi.fn((cancel: () => void) => {
				void cancel;
				return settle;
			}),
			interactionFailed: vi.fn(),
		};
		let transactError: SeekerConnectError | undefined;
		let hang = false;
		let seenSignal: AbortSignal | undefined;
		const link = {
			transact: vi.fn(
				<T>(config: SeekerConnectConfig, callback: () => Promise<T>, options?: { signal?: AbortSignal }) => {
					void config;
					void callback;
					seenSignal = options?.signal;
					if (hang) {
						return new Promise<T>((_resolve, reject) => {
							options?.signal?.addEventListener('abort', () => reject(new Error('session closed')), {
								once: true,
							});
						});
					}
					if (transactError) return Promise.reject(transactError) as Promise<T>;
					return Promise.resolve('ok' as T);
				},
			),
		};
		const queryClient = new QueryClient({
			defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
		});
		const wrapper = ({ children }: { children: ReactNode }) =>
			createElement(QueryClientProvider, { client: queryClient }, children);
		const { result } = renderHook(
			() =>
				useSeekerConnect({
					config: CONFIG,
					cache: fakeCache({ get: vi.fn(async () => undefined) }),
					link,
					presenter,
				}),
			{ wrapper },
		);
		return {
			result,
			presenter,
			settle,
			script: {
				failWith(error: SeekerConnectError) {
					transactError = error;
				},
				hang() {
					hang = true;
				},
				abortSignal: () => seenSignal,
			},
		};
	}

	it('wraps each interaction and settles on success', async () => {
		const { result, presenter, settle } = presenterHarness();

		await expect(result.current.transact(async () => 'unused')).resolves.toBe('ok');

		expect(presenter.interactionStarted).toHaveBeenCalledTimes(1);
		expect(presenter.interactionFailed).not.toHaveBeenCalled();
		expect(settle).toHaveBeenCalledTimes(1);
	});

	it('reports taxonomy failures to the presenter', async () => {
		const { result, presenter, settle, script } = presenterHarness();
		const failure = new SeekerConnectError(SeekerConnectErrorCode.authorizationDeclined, 'declined');
		script.failWith(failure);

		await expect(result.current.transact(async () => 'unused')).rejects.toBe(failure);

		expect(presenter.interactionFailed).toHaveBeenCalledWith(failure);
		expect(settle).toHaveBeenCalledTimes(1);
	});

	it('lets non-taxonomy errors through without announcing them', async () => {
		const settle = vi.fn();
		const presenter = {
			interactionStarted: vi.fn(() => settle),
			interactionFailed: vi.fn(),
		};
		const own = new Error('callback bug');
		const link = {
			transact: vi.fn(async () => {
				throw own;
			}),
		};
		const queryClient = new QueryClient({
			defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
		});
		const wrapper = ({ children }: { children: ReactNode }) =>
			createElement(QueryClientProvider, { client: queryClient }, children);
		const { result } = renderHook(
			() =>
				useSeekerConnect({
					config: CONFIG,
					cache: fakeCache({ get: vi.fn(async () => undefined) }),
					link,
					presenter,
				}),
			{ wrapper },
		);

		await expect(result.current.transact(async () => 'unused')).rejects.toBe(own);

		expect(presenter.interactionFailed).not.toHaveBeenCalled();
		expect(settle).toHaveBeenCalledTimes(1);
	});

	it('closing the progress UI aborts the session and rejects as cancelled', async () => {
		const { result, presenter, settle, script } = presenterHarness();
		script.hang();

		const connecting = result.current.transact(async () => 'unused');
		await vi.waitFor(() => expect(presenter.interactionStarted).toHaveBeenCalled());
		const cancel = presenter.interactionStarted.mock.calls[0]![0];
		cancel();

		const error = await connecting.then(
			() => {
				throw new Error('transact resolved unexpectedly');
			},
			(e: unknown) => e,
		);
		expect(error).toBeInstanceOf(SeekerConnectError);
		expect((error as SeekerConnectError).code).toBe(SeekerConnectErrorCode.cancelled);
		expect(presenter.interactionFailed).not.toHaveBeenCalled();
		expect(script.abortSignal()?.aborted).toBe(true);
		expect(settle).toHaveBeenCalledTimes(1);
	});
});
