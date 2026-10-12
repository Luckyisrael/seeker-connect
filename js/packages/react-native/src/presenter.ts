/**
 * `SeekerConnectPresenter` implementations — the SDK-owned UI surface
 * around wallet interactions. Core's law: implementations "must tolerate
 * any call ordering and never throw."
 *
 * The web package ships lit components; this package ships the no-op
 * default. Apps that want the interaction overlay supply their own —
 * the example app demonstrates a React Native modal presenter wired via
 * the hook's `presenter` option.
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
