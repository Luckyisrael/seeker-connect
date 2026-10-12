/**
 * Core's presenter contract: tolerate any call ordering, never throw.
 * The no-op default is the trivially-correct implementation of both.
 */
import { SeekerConnectError, SeekerConnectErrorCode } from '@solana-mobile/seeker-connect-core';
import { describe, expect, it } from 'vitest';

import { noopSeekerConnectPresenter } from './presenter.js';

const ERROR = new SeekerConnectError(SeekerConnectErrorCode.walletError, 'anything');

describe('noopSeekerConnectPresenter', () => {
	it('tolerates interactionFailed without a preceding interactionStarted', () => {
		expect(() => noopSeekerConnectPresenter.interactionFailed(ERROR)).not.toThrow();
	});

	it('tolerates multiple starts and their closers in any order', () => {
		const closeA = noopSeekerConnectPresenter.interactionStarted(() => undefined);
		const closeB = noopSeekerConnectPresenter.interactionStarted(() => undefined);
		expect(() => {
			closeA();
			closeB();
			closeA();
		}).not.toThrow();
	});

	it('tolerates a closer invoked after interactionFailed', () => {
		const close = noopSeekerConnectPresenter.interactionStarted(() => undefined);
		noopSeekerConnectPresenter.interactionFailed(ERROR);
		expect(() => close()).not.toThrow();
	});
});
