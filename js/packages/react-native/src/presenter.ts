/**
 * `SeekerConnectPresenter` implementations — the SDK-owned UI surface
 * around wallet interactions. Core's law: implementations "must tolerate
 * any call ordering and never throw."
 *
 * The web package ships lit components; this package ships a no-op
 * default plus an optional React Native modal presenter.
 */
import type { SeekerConnectPresenter } from '@solana-mobile/seeker-connect-core';

/** Does nothing; safe under any call ordering. The default. */
export const noopSeekerConnectPresenter: SeekerConnectPresenter = {
	interactionStarted() {
		return () => undefined;
	},
	interactionFailed() {
		// no-op by contract
	},
};
