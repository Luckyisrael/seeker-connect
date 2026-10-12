/**
 * `AuthorizationCache` implementations for React Native — the injected-
 * storage design the docs' caching recipe recommends for production.
 *
 * Storage is INJECTED, not imported: the async `getItem/setItem/removeItem`
 * contract is shared by AsyncStorage *and* `expo-secure-store`, so apps
 * plug in whichever they chose. (The upstream caching recipe warns the
 * default AsyncStorage cache is unencrypted — production apps inject
 * secure storage, which this shape exists for.)
 *
 * `StoredAuthorization.accounts[].publicKey` is bytes, which JSON does
 * not preserve: the envelope encodes each as base64 and the reader
 * revives them, so a round-tripped authorization is byte-identical.
 */
import type { SeekerAccount, StoredAuthorization, AuthorizationCache } from '@solana-mobile/seeker-connect-core';

/** AsyncStorage/expo-secure-store-compatible async key-value surface. */
export interface KeyValueStorage {
	getItem(key: string): Promise<string | null>;
	setItem(key: string, value: string): Promise<void>;
	removeItem(key: string): Promise<void>;
}

const DEFAULT_KEY = 'seeker-connect.authorization';

/** Envelope version — bump on shape changes; readers migrate forward. */
const VERSION = 1;

interface StoredAccount {
	address: string;
	publicKey: string;
	label?: string;
}

interface Envelope {
	v: number;
	authorization: Omit<StoredAuthorization, 'accounts'> & { accounts: StoredAccount[] };
}

function encodeAuthorization(authorization: StoredAuthorization): Envelope {
	return {
		v: VERSION,
		authorization: {
			...authorization,
			accounts: authorization.accounts.map((account) => ({
				...account,
				publicKey: bytesToBase64(account.publicKey),
			})),
		},
	};
}

function decodeAuthorization(envelope: Envelope): StoredAuthorization {
	return {
		...envelope.authorization,
		accounts: envelope.authorization.accounts.map((account): SeekerAccount => ({
			...account,
			publicKey: base64ToBytes(account.publicKey),
		})),
	};
}

function bytesToBase64(bytes: Uint8Array): string {
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary);
}

function base64ToBytes(encoded: string): Uint8Array {
	const binary = atob(encoded);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
	return bytes;
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
				return decodeAuthorization(parsed);
			} catch {
				// Corrupt payload: clear it so it cannot fail forever.
				void storage.removeItem(key).catch(() => undefined);
				return undefined;
			}
		},
		async set(authorization: StoredAuthorization): Promise<void> {
			await storage.setItem(key, JSON.stringify(encodeAuthorization(authorization)));
		},
		async clear(): Promise<void> {
			await storage.removeItem(key);
		},
	};
}
