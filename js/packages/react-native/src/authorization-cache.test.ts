/**
 * Unit laws for the injected-storage authorization cache: round trip,
 * corrupt-payload eviction, version gating, and the rule that a storage
 * failure degrades to "not connected" instead of bricking the app.
 */
import type { StoredAuthorization } from '@solana-mobile/seeker-connect-core';
import { describe, expect, it } from 'vitest';

import { createAsyncStorageAuthorizationCache, type KeyValueStorage } from './authorization-cache.js';

const AUTHORIZATION: StoredAuthorization = {
	accounts: [
		{
			address: '5ZiE3vPqMGJbXK4hM2pQ6R7sT9uV1wX3yA4bC5dE6fGh',
			publicKey: Uint8Array.of(1, 2, 3),
			label: 'Account 1',
		},
	],
	authToken: 'TOKEN',
	walletUriBase: 'https://wallet.example.com',
	chain: 'solana:mainnet',
	capabilities: {
		supportedTransactionVersions: ['legacy', 0],
		features: ['solana:signTransactions'],
		supportsSignAndSendTransactions: true,
	},
};

function memoryStorage(): KeyValueStorage & { data: Map<string, string> } {
	const data = new Map<string, string>();
	return {
		data,
		async getItem(key) {
			return data.get(key) ?? null;
		},
		async setItem(key, value) {
			data.set(key, value);
		},
		async removeItem(key) {
			data.delete(key);
		},
	};
}

describe('createAsyncStorageAuthorizationCache', () => {
	it('round-trips an authorization', async () => {
		const cache = createAsyncStorageAuthorizationCache(memoryStorage());
		await cache.set(AUTHORIZATION);
		expect(await cache.get()).toEqual(AUTHORIZATION);
	});

	it('resolves undefined when nothing is stored', async () => {
		const cache = createAsyncStorageAuthorizationCache(memoryStorage());
		expect(await cache.get()).toBeUndefined();
	});

	it('evicts a corrupt payload so it cannot fail forever', async () => {
		const storage = memoryStorage();
		const cache = createAsyncStorageAuthorizationCache(storage);
		await storage.setItem('seeker-connect.authorization', '{not json');
		expect(await cache.get()).toBeUndefined();
		expect(storage.data.has('seeker-connect.authorization')).toBe(false);
	});

	it('ignores payloads from a different envelope version', async () => {
		const storage = memoryStorage();
		const cache = createAsyncStorageAuthorizationCache(storage);
		await storage.setItem('seeker-connect.authorization', JSON.stringify({ v: 999, authorization: AUTHORIZATION }));
		expect(await cache.get()).toBeUndefined();
		// A future version's payload is left intact: a newer app build may
		// understand it; an older one must not destroy it.
		expect(storage.data.has('seeker-connect.authorization')).toBe(true);
	});

	it('degrades to "not connected" when storage read fails', async () => {
		const cache = createAsyncStorageAuthorizationCache({
			async getItem() {
				throw new Error('secure store unavailable');
			},
			async setItem() {},
			async removeItem() {},
		});
		expect(await cache.get()).toBeUndefined();
	});

	it('clear removes the stored authorization', async () => {
		const cache = createAsyncStorageAuthorizationCache(memoryStorage());
		await cache.set(AUTHORIZATION);
		await cache.clear();
		expect(await cache.get()).toBeUndefined();
	});

	it('honors a custom key', async () => {
		const storage = memoryStorage();
		const cache = createAsyncStorageAuthorizationCache(storage, 'custom.key');
		await cache.set(AUTHORIZATION);
		expect(storage.data.has('custom.key')).toBe(true);
	});
});
