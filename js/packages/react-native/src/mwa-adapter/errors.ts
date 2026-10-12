/**
 * MWA error → `SeekerConnectError` mapping — the port's error taxonomy is
 * CLOSED: `SeekerConnectError` is "the only error type SeekerLink
 * implementations may reject with" (core doc comment). Every path out of
 * `transact` funnels through here.
 */
import {
	SeekerConnectError,
	SeekerConnectErrorCode,
} from '@solana-mobile/seeker-connect-core';

/** Which phase of a session produced the failure. */
export type SessionPhase = 'association' | 'interaction';

interface MaybeCoded {
	code?: unknown;
	message?: string;
}

/**
 * Maps any thrown value from the MWA layer onto the taxonomy.
 *
 * TODO(Phase 2): complete the table against the installed
 * `@solana-mobile/mobile-wallet-adapter-protocol` d.ts — enumerate
 * `SolanaMobileWalletAdapterProtocolErrorCode` / `ErrorCode` and verify
 * each mapping by name (do NOT guess numbers; Talon's L77 lesson:
 * reverse-engineered internals rot, documented surfaces don't). The
 * anchors below are the ones the core taxonomy's own doc comments name:
 *
 *   ERROR_AUTHORIZATION_FAILED  → authorization-declined   (core names it)
 *   ERROR_NOT_SIGNED            → request-declined         (core names it)
 *   ERROR_NOT_SUBMITTED         → request-declined         (core names it)
 *   association/timeout errors  → association-failed       (phase-tagged)
 *   session torn down early     → session-closed
 *   anything else               → wallet-error             (the floor)
 *
 * Known live behavior to encode as a unit test (Talon, Xiaomi 12,
 * 2026-10-10): after a `reauthorize` refusal the wallet tears the session
 * down INSTANTLY (-1, no consent UI) — that maps to a decline-class code,
 * and the SDK layer's answer is a fresh authorize on a NEW session, never
 * a retry inside the dead one.
 */
export function mapSessionError(
	error: unknown,
	phase: SessionPhase,
): SeekerConnectError {
	if (error instanceof SeekerConnectError) {
		return error;
	}
	const coded = (error ?? {}) as MaybeCoded;
	const message = coded.message ?? String(error);

	// TODO(Phase 2): replace name-based probes below with the verified
	// error-code table. Name probes are honest placeholders: they cannot
	// mis-map numeric drift the way hardcoded numbers would.
	if (phase === 'association') {
		return new SeekerConnectError(
			SeekerConnectErrorCode.associationFailed,
			`The wallet could not be associated: ${message}`,
			{ cause: error },
		);
	}
	if (typeof coded.code === 'number') {
		// -1 observed live as the wallet's blanket refusal code (Phantom
		// 26.32 reauthorize refusal). Treat coded refusals as declines;
		// TODO(Phase 2) narrows this to the verified table.
		return new SeekerConnectError(
			SeekerConnectErrorCode.authorizationDeclined,
			`The wallet refused the request: ${message}`,
			{ cause: error },
		);
	}
	if (/session (closed|terminated)|connection (closed|lost)/i.test(message)) {
		return new SeekerConnectError(
			SeekerConnectErrorCode.sessionClosed,
			`The session ended before the interaction completed: ${message}`,
			{ cause: error },
		);
	}
	return new SeekerConnectError(
		SeekerConnectErrorCode.walletError,
		`The wallet reported an error: ${message}`,
		{ cause: error },
	);
}
