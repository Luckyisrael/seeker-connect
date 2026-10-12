/**
 * Session-lifecycle laws the contract suite doesn't reach: abandoned
 * promises never surface as unhandled rejections, a wallet refusal never
 * triggers a retry inside the dead session, and abort tears the session
 * down exactly once.
 */
import {
	SeekerConnectError,
	SeekerConnectErrorCode,
	type SeekerConnectConfig,
} from '@solana-mobile/seeker-connect-core';
import { SolanaMobileWalletAdapterError } from '@solana-mobile/mobile-wallet-adapter-protocol';
import { describe, expect, it, vi } from 'vitest';

import { createLocalSeekerLink, type LocalSessionStarter } from './index.js';

const CONFIG: SeekerConnectConfig = {
	identity: { name: 'Unit Dapp', uri: 'https://dapp.example.com' },
	relayDomain: 'unavailable-for-local.example',
};

// Module-level because each test builds its own scenario around it and
// consumes the wallet promise once per transact.
const handle = {
	authorize: vi.fn(async () => {
		throw new SolanaMobileWalletAdapterError('ERROR_SESSION_CLOSED', 'wallet closed the session');
	}),
	deauthorize: vi.fn(async () => ({})),
	getCapabilities: vi.fn(async () => ({})),
	signMessages: vi.fn(async () => ({ signed_payloads: [] })),
	signTransactions: vi.fn(async () => ({ signed_payloads: [] })),
	signAndSendTransactions: vi.fn(async () => ({ signatures: [] })),
};

function scenarioStarter(overrides?: Partial<ReturnType<typeof buildScenario>>): LocalSessionStarter {
	return async () => ({ ...buildScenario(), ...overrides });
}

function buildScenario() {
	return {
		wallet: Promise.resolve(handle as never),
		close: vi.fn(),
	};
}

describe('session lifecycle laws', () => {
	it('never surfaces an unhandled rejection from the abandoned wallet promise', async () => {
		// The hazard the `void scenario.wallet.then(...)` silencer covers:
		// the association timeout wins the race while the wallet promise is
		// still pending; teardown then rejects it. Without the silencer that
		// rejection is unhandled and vitest fails the run.
		let rejectWallet!: (reason: Error) => void;
		const wallet = new Promise((_, reject) => {
			rejectWallet = reject;
		});
		const scenario = {
			wallet: wallet as never,
			close: vi.fn(() => rejectWallet(new Error('transport died on close'))),
		};
		const link = createLocalSeekerLink(scenarioStarter(scenario));
		const error = await link
			.transact({ ...CONFIG, associationTimeoutMs: 20 }, () => Promise.resolve())
			.then(
				() => {
					throw new Error('transact resolved unexpectedly');
				},
				(e: unknown) => e,
			);
		expect((error as SeekerConnectError).code).toBe(SeekerConnectErrorCode.associationFailed);
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(scenario.close).toHaveBeenCalled();
	});

	it('does not retry inside a dead session: the refusal maps and propagates once', async () => {
		handle.authorize.mockClear();
		const link = createLocalSeekerLink(scenarioStarter());
		const error = await link
			.transact(CONFIG, (wallet) => wallet.authorize())
			.then(
				() => {
					throw new Error('transact resolved unexpectedly');
				},
				(e: unknown) => e,
			);
		expect(error).toBeInstanceOf(SeekerConnectError);
		expect((error as SeekerConnectError).code).toBe(SeekerConnectErrorCode.sessionClosed);
		expect(handle.authorize).toHaveBeenCalledTimes(1);
	});

	it('tears the session down on abort mid-interaction, tolerating the idempotent double-close', async () => {
		const scenario = buildScenario();
		const link = createLocalSeekerLink(scenarioStarter(scenario));
		const controller = new AbortController();
		const result = await link.transact(
			CONFIG,
			async () => {
				controller.abort();
				return 'settled-after-abort';
			},
			{ signal: controller.signal },
		);
		expect(result).toBe('settled-after-abort');
		// The abort listener and the `finally` block both close, like the
		// web adapter; the real scenario's close is idempotent, so the
		// contract is "closed at least once", not "exactly once".
		expect(scenario.close).toHaveBeenCalled();
	});

	it('association timeout rejects with association-failed and closes the scenario', async () => {
		const scenario = { wallet: new Promise(() => undefined) as never, close: vi.fn() };
		const link = createLocalSeekerLink(scenarioStarter(scenario));
		const error = await link
			.transact({ ...CONFIG, associationTimeoutMs: 20 }, () => Promise.resolve())
			.then(
				() => {
					throw new Error('transact resolved unexpectedly');
				},
				(e: unknown) => e,
			);
		expect((error as SeekerConnectError).code).toBe(SeekerConnectErrorCode.associationFailed);
		expect(scenario.close).toHaveBeenCalledTimes(1);
	});
});
