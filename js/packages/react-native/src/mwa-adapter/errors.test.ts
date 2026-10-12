/**
 * Unit laws for the error taxonomy: every protocol/adapter error class
 * maps onto the port's closed taxonomy, and non-protocol errors pass
 * through untouched (the consumer's callback errors must reach the
 * caller unmodified).
 */
import { SeekerConnectError, SeekerConnectErrorCode } from '@solana-mobile/seeker-connect-core';
import {
	SolanaMobileWalletAdapterError,
	SolanaMobileWalletAdapterProtocolError,
	SolanaMobileWalletAdapterProtocolErrorCode,
} from '@solana-mobile/mobile-wallet-adapter-protocol';
import { describe, expect, it } from 'vitest';

import { associationFailure, mapWalletError } from './errors.js';

function protocolError(code: number): SolanaMobileWalletAdapterProtocolError<number> {
	return new SolanaMobileWalletAdapterProtocolError(0, code, `protocol error ${code}`);
}

function adapterError(code: `ERROR_${string}`): SolanaMobileWalletAdapterError<'ERROR_SESSION_CLOSED'> {
	return new SolanaMobileWalletAdapterError(code, `adapter error ${code}`) as never;
}

describe('mapWalletError', () => {
	it('maps authorization failure to authorization-declined', () => {
		const mapped = mapWalletError(
			protocolError(SolanaMobileWalletAdapterProtocolErrorCode.ERROR_AUTHORIZATION_FAILED),
		);
		expect(mapped).toBeInstanceOf(SeekerConnectError);
		expect((mapped as SeekerConnectError).code).toBe(SeekerConnectErrorCode.authorizationDeclined);
	});

	it.each([
		SolanaMobileWalletAdapterProtocolErrorCode.ERROR_NOT_SIGNED,
		SolanaMobileWalletAdapterProtocolErrorCode.ERROR_NOT_SUBMITTED,
	])('maps protocol code %s to request-declined', (code) => {
		const mapped = mapWalletError(protocolError(code));
		expect((mapped as SeekerConnectError).code).toBe(SeekerConnectErrorCode.requestDeclined);
	});

	it.each([
		SolanaMobileWalletAdapterProtocolErrorCode.ERROR_INVALID_PAYLOADS,
		SolanaMobileWalletAdapterProtocolErrorCode.ERROR_TOO_MANY_PAYLOADS,
	])('maps protocol code %s to wallet-error', (code) => {
		const mapped = mapWalletError(protocolError(code));
		expect((mapped as SeekerConnectError).code).toBe(SeekerConnectErrorCode.walletError);
	});

	it.each(['ERROR_SESSION_CLOSED', 'ERROR_SESSION_TIMEOUT'] as const)(
		'maps adapter error %s to session-closed',
		(code) => {
			const mapped = mapWalletError(adapterError(code));
			expect((mapped as SeekerConnectError).code).toBe(SeekerConnectErrorCode.sessionClosed);
		},
	);

	it('maps other adapter errors to wallet-error', () => {
		const mapped = mapWalletError(adapterError('ERROR_WALLET_NOT_FOUND'));
		expect((mapped as SeekerConnectError).code).toBe(SeekerConnectErrorCode.walletError);
	});

	it('passes non-protocol errors through unchanged', () => {
		const original = new Error('thrown by the consumer callback');
		expect(mapWalletError(original)).toBe(original);
	});
});

describe('associationFailure', () => {
	it('wraps any thrown value as association-failed with cause preserved', () => {
		const cause = new Error('intent delivery failed');
		const failure = associationFailure(cause);
		expect(failure.code).toBe(SeekerConnectErrorCode.associationFailed);
		expect(failure.cause).toBe(cause);
	});

	it('stringifies non-error causes', () => {
		expect(associationFailure('reflector unreachable').message).toContain('reflector unreachable');
	});
});
