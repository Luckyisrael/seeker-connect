/**
 * MWA error → `SeekerConnectError` mapping — the port's error taxonomy is
 * CLOSED: `SeekerConnectError` is "the only error type SeekerLink
 * implementations may reject with" (core doc comment).
 *
 * Protocol-layer failures are classified by the protocol package's own
 * error classes and codes; anything else (notably errors thrown by the
 * consumer's callback) passes through untouched.
 */
import { SeekerConnectError, SeekerConnectErrorCode } from '@solana-mobile/seeker-connect-core';
import {
	SolanaMobileWalletAdapterError,
	SolanaMobileWalletAdapterProtocolError,
	SolanaMobileWalletAdapterProtocolErrorCode,
} from '@solana-mobile/mobile-wallet-adapter-protocol';

/** Wraps any failure during session establishment as `association-failed`. */
export function associationFailure(cause: unknown): SeekerConnectError {
	return new SeekerConnectError(
		SeekerConnectErrorCode.associationFailed,
		`Wallet association failed: ${cause instanceof Error ? cause.message : String(cause)}`,
		{ cause },
	);
}

/**
 * Maps protocol-layer failures onto `SeekerConnectError`; anything else
 * (notably callback-originated errors) passes through untouched.
 */
export function mapWalletError(e: unknown): unknown {
	if (e instanceof SolanaMobileWalletAdapterProtocolError) {
		switch (e.code) {
			case SolanaMobileWalletAdapterProtocolErrorCode.ERROR_AUTHORIZATION_FAILED:
				return new SeekerConnectError(SeekerConnectErrorCode.authorizationDeclined, e.message, { cause: e });
			case SolanaMobileWalletAdapterProtocolErrorCode.ERROR_NOT_SIGNED:
			case SolanaMobileWalletAdapterProtocolErrorCode.ERROR_NOT_SUBMITTED:
				return new SeekerConnectError(SeekerConnectErrorCode.requestDeclined, e.message, { cause: e });
			default:
				return new SeekerConnectError(SeekerConnectErrorCode.walletError, e.message, { cause: e });
		}
	}
	if (e instanceof SolanaMobileWalletAdapterError) {
		switch (e.code) {
			case 'ERROR_SESSION_CLOSED':
			case 'ERROR_SESSION_TIMEOUT':
				return new SeekerConnectError(SeekerConnectErrorCode.sessionClosed, e.message, { cause: e });
			default:
				return new SeekerConnectError(SeekerConnectErrorCode.walletError, e.message, { cause: e });
		}
	}
	return e;
}
