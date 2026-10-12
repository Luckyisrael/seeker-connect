/**
 * Platform-seam laws for `nativeSessionStarter`: the React Native build's
 * callback-scoped `transact` must present as a `Scenario` (wallet
 * delivered once, native session held until `close`, association failures
 * rejected onto the awaited promise), and the association prefix must be
 * Android-meaningful — the shared-web first-connect sentinel collapses to
 * no prefix, learned endpoint URIs pass through.
 */
import { DEFAULT_FIRST_CONNECT_WALLET_BASE_URI } from '@solana-mobile/seeker-connect-core';
import {
	SolanaMobileWalletAdapterError,
	transact,
	type MobileWallet,
} from '@solana-mobile/mobile-wallet-adapter-protocol';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { nativeSessionStarter } from './index.js';

vi.mock('@solana-mobile/mobile-wallet-adapter-protocol', async (importOriginal) => ({
	...(await importOriginal<typeof import('@solana-mobile/mobile-wallet-adapter-protocol')>()),
	transact: vi.fn(),
}));

const transactMock = vi.mocked(transact);

beforeEach(() => {
	transactMock.mockReset();
});

describe('nativeSessionStarter', () => {
	it('delivers the wallet and holds the native session until close releases it', async () => {
		const wallet = {} as MobileWallet;
		let sessionEnded = false;
		transactMock.mockImplementation(async (callback) => {
			await callback(wallet);
			sessionEnded = true;
		});
		const scenario = await nativeSessionStarter({});
		expect(await scenario.wallet).toBe(wallet);
		// The callback must still be parked: `transact` ends its native
		// session only after the callback returns, which only `close` does.
		expect(sessionEnded).toBe(false);
		scenario.close();
		await vi.waitFor(() => expect(sessionEnded).toBe(true));
	});

	it('rejects the awaited wallet promise when association fails', async () => {
		const cause = new SolanaMobileWalletAdapterError('ERROR_WALLET_NOT_FOUND', 'no wallet installed');
		transactMock.mockRejectedValue(cause);
		const scenario = await nativeSessionStarter({});
		await expect(scenario.wallet).rejects.toBe(cause);
		scenario.close();
	});

	it('collapses the shared-web first-connect sentinel and an absent URI to no prefix', async () => {
		transactMock.mockImplementation(async () => undefined);
		const sentinel = await nativeSessionStarter({ baseUri: DEFAULT_FIRST_CONNECT_WALLET_BASE_URI });
		const absent = await nativeSessionStarter({});
		// Android's own default (the unprefixed `solana-wallet:` intent)
		// is expressed as no association config at all.
		expect(transactMock.mock.calls[0]?.[1]).toBeUndefined();
		expect(transactMock.mock.calls[1]?.[1]).toBeUndefined();
		sentinel.close();
		absent.close();
	});

	it('passes a learned endpoint URI through as the association prefix', async () => {
		const wallet = {} as MobileWallet;
		transactMock.mockImplementation(async (callback) => {
			await callback(wallet);
		});
		const endpoint = 'https://solanamobile.com/mwallet/';
		const scenario = await nativeSessionStarter({ baseUri: endpoint });
		expect(transactMock.mock.calls[0]?.[1]).toEqual({ baseUri: endpoint });
		scenario.close();
	});

	it('tolerates repeated close calls: the session releases exactly once', async () => {
		const wallet = {} as MobileWallet;
		let sessionEnds = 0;
		transactMock.mockImplementation(async (callback) => {
			await callback(wallet);
			sessionEnds += 1;
		});
		const scenario = await nativeSessionStarter({});
		scenario.close();
		scenario.close();
		await vi.waitFor(() => expect(sessionEnds).toBe(1));
	});
});
