/**
 * React layer over the `SeekerLink` port, for apps that use TanStack
 * Query. Exported from the `./hooks` subpath so the core entry stays
 * framework-free; `@tanstack/react-query` is an optional peer required
 * only by this module.
 *
 * Two deliberate stability choices, explained because they look like
 * bugs otherwise:
 * - `retry: false` on both queries: wallet consent prompts must never
 *   fire automatically — the taxonomy's "don't auto-retry" law, enforced
 *   at the data layer.
 * - `staleTime`/`gcTime` infinite on the authorization query: it is
 *   local storage, not a server; freshness is managed explicitly via
 *   `disconnect()` and post-`transact` invalidation.
 */
import { useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
	AuthorizationCache,
	SeekerConnectConfig,
	SeekerLink,
	SeekerTransactOptions,
	SeekerWallet,
	StoredAuthorization,
} from '@solana-mobile/seeker-connect-core';

import { createLocalSeekerLink } from './mwa-adapter/index.js';

/** Shareable key so apps can inspect or evict the authorization themselves. */
export const SEEKER_AUTHORIZATION_QUERY_KEY = ['seeker-connect', 'authorization'] as const;

export interface UseSeekerConnectOptions {
	config: SeekerConnectConfig;
	cache: AuthorizationCache;
	/** Supply to override the default local link (e.g. in tests). */
	link?: SeekerLink;
}

export interface UseSeekerConnectResult {
	/** The stored authorization, or `undefined` when absent or unreadable. */
	authorization: StoredAuthorization | undefined;
	/** True while a `transact` is in flight; use it to disable the connect button. */
	isConnecting: boolean;
	/** The last `transact` failure, as a `SeekerConnectError` (or the consumer's own error). */
	connectError: unknown;
	/** Runs one wallet interaction; identical semantics to `SeekerLink.transact`. */
	transact<T>(callback: (wallet: SeekerWallet) => Promise<T>, options?: SeekerTransactOptions): Promise<T>;
	/** Forgets the stored authorization and refreshes the query. */
	disconnect(): Promise<void>;
}

/**
 * Binds a `SeekerLink` and `AuthorizationCache` to the component tree.
 * The cached authorization reads as a query; wallet interactions run as
 * a mutation whose completion re-checks the cache.
 */
export function useSeekerConnect({ config, cache, link }: UseSeekerConnectOptions): UseSeekerConnectResult {
	const queryClient = useQueryClient();
	const seekerLink = useMemo(() => link ?? createLocalSeekerLink(), [link]);

	const authorizationQuery = useQuery({
		queryKey: SEEKER_AUTHORIZATION_QUERY_KEY,
		// React Query reserves `undefined` for "no data yet"; the cache's
		// "not connected" is a real answer, so it travels as `null`.
		queryFn: async () => (await cache.get()) ?? null,
		staleTime: Infinity,
		gcTime: Infinity,
		retry: false,
	});

	const transactMutation = useMutation({
		mutationFn: ({
			callback,
			options,
		}: {
			callback: (wallet: SeekerWallet) => Promise<unknown>;
			options?: SeekerTransactOptions;
		}) => seekerLink.transact(config, callback, options),
		retry: false,
		onSuccess: () => queryClient.invalidateQueries({ queryKey: SEEKER_AUTHORIZATION_QUERY_KEY }),
	});

	const transact = useCallback(
		<T>(callback: (wallet: SeekerWallet) => Promise<T>, options?: SeekerTransactOptions): Promise<T> =>
			// The mutation erases the callback's generic return; the cast
			// restores the exact type `SeekerLink.transact` resolved with.
			transactMutation.mutateAsync({ callback, options }) as Promise<T>,
		[transactMutation],
	);

	const disconnect = useCallback(async () => {
		await cache.clear();
		await queryClient.invalidateQueries({ queryKey: SEEKER_AUTHORIZATION_QUERY_KEY });
	}, [cache, queryClient]);

	return {
		authorization: authorizationQuery.data ?? undefined,
		isConnecting: transactMutation.isPending,
		connectError: transactMutation.error,
		transact,
		disconnect,
	};
}
