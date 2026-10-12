/**
 * `AuthorizationCache` implementations for React Native — the injected-
 * storage design the docs' caching recipe recommends for production.
 *
 * Storage is INJECTED, not imported: the async `getItem/setItem/removeItem`
 * contract is shared by AsyncStorage *and* `expo-secure-store`, so apps
 * plug in whichever they chose. (The upstream caching recipe warns the
 * default AsyncStorage cache is unencrypted — production apps inject
 * secure storage, which this shape exists for.)
 */
import type {
	AuthorizationCache,
	StoredAuthorization,
} from '@solana-mobile/seeker-connect-core';

/** AsyncStorage/expo-secure-store-compatible async key-value surface. */
export interface KeyValueStorage {
	getItem(key: string): Promise<string | null>;
	setItem(key: string, value: string): Promise<void>;
	removeItem(key: string): Promise<void>;
}

const DEFAULT_KEY = 'seeker-connect.authorization';

/** Envelope version — bump on shape changes; readers migrate forward. */
const VERSION = 1;

interface Envelope {
	v: number;
	authorization: StoredAuthorization;
}

export function createAsyncStorageAuthorizationCache(
	storage: KeyValueStorage,
	key: string = DEFAULT_KEY,
): AuthorizationCache {
	return {
		async get(): Promise<StoredAuthorization | undefined> {
			let raw: string | null;
			try {
				raw = await storage.getItem(key);
			} catch {
				// A cache failure must never brick a wallet interaction —
				// behave as "not connected" and let the next authorize
				// re-establish.
				return undefined;
			}
			if (raw === null) return undefined;
			try {
				const parsed = JSON.parse(raw) as Envelope;
				if (parsed?.v !== VERSION || !parsed.authorization?.authToken) {
					return undefined;
				}
				return parsed.authorization;
			} catch {
				// Corrupt payload: clear it so it cannot fail forever.
				void storage.removeItem(key).catch(() => undefined);
				return undefined;
			}
		},
		async set(authorization: StoredAuthorization): Promise<void> {
			const envelope: Envelope = { v: VERSION, authorization };
			await storage.setItem(key, JSON.stringify(envelope));
		},
		async clear(): Promise<void> {
			await storage.removeItem(key);
		},
	};
}
