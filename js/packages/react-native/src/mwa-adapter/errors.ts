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
 * Raw shape of the RN bridge's JSON-RPC rejection
 * (`promise.reject("JSON_RPC_ERROR", cause, userInfo)` in the Android
 * module). The protocol package converts this to
 * `SolanaMobileWalletAdapterProtocolError` in `handleError`, but its RN
 * fork returns `invoke()` from `try` without awaiting, so the conversion
 * never runs and the raw shape reaches callers — live evidence: a wallet
 * decline surfaced as `wallet-error: -1/authorization request failed`
 * instead of `authorization-declined`. Classified here by the same
 * numeric codes.
 */
type RnBridgeError = Error & {
	code?: string;
	userInfo?: { jsonRpcErrorCode?: number };
};

/** Extracts the MWA protocol error code from either delivery shape. */
function protocolErrorCode(e: unknown): number | undefined {
	if (e instanceof SolanaMobileWalletAdapterProtocolError) return e.code;
	if (e instanceof Error) {
		const bridge = e as RnBridgeError;
		if (bridge.code === 'JSON_RPC_ERROR' && typeof bridge.userInfo?.jsonRpcErrorCode === 'number') {
			return bridge.userInfo.jsonRpcErrorCode;
		}
	}
	return undefined;
}

/**
 * Maps protocol-layer failures onto `SeekerConnectError`; anything else
 * (notably callback-originated errors) passes through untouched.
 */
export function mapWalletError(e: unknown): unknown {
	const protocolCode = protocolErrorCode(e);
	if (protocolCode !== undefined) {
		const message = e instanceof Error ? e.message : String(e);
		switch (protocolCode) {
			case SolanaMobileWalletAdapterProtocolErrorCode.ERROR_AUTHORIZATION_FAILED:
				return new SeekerConnectError(SeekerConnectErrorCode.authorizationDeclined, message, { cause: e });
			case SolanaMobileWalletAdapterProtocolErrorCode.ERROR_NOT_SIGNED:
			case SolanaMobileWalletAdapterProtocolErrorCode.ERROR_NOT_SUBMITTED:
				return new SeekerConnectError(SeekerConnectErrorCode.requestDeclined, message, { cause: e });
			default:
				return new SeekerConnectError(SeekerConnectErrorCode.walletError, message, { cause: e });
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

/**
 * Seals a failure raised inside a guarded wallet method into the
 * taxonomy: classified protocol errors map precisely; anything else
 * becomes `walletError` — the React Native bridge can deliver raw
 * platform exceptions (e.g. a session `CancellationException`) that
 * match none of the protocol error classes. Only errors from the
 * consumer's own callback escape this; they never run inside a guard.
 */
export function walletFailure(e: unknown): SeekerConnectError {
	const mapped = mapWalletError(e);
	if (mapped instanceof SeekerConnectError) return mapped;
	return new SeekerConnectError(
		SeekerConnectErrorCode.walletError,
		mapped instanceof Error && mapped.message ? mapped.message : String(mapped),
		{ cause: mapped },
	);
}
