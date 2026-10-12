/**
 * Runs the upstream `SeekerLink` contract suite against the React Native
 * local adapter via the fake-wallet double — the exact wiring shape of
 * the web package's contract.test.ts, plugged into the RN adapter's
 * `LocalSessionStarter` injection point. Upstream runs this on their CI
 * when the PR lands; it must never fail.
 */
import { base58FromUint8Array } from '@solana-mobile/mobile-wallet-adapter-protocol/encoding';

import { testSeekerLinkContract } from '@solana-mobile/seeker-connect-core/testing';
import { expect, it } from 'vitest';

import { createLocalSeekerLink } from './index.js';
import {
	DEFAULT_FAKE_CAPABILITIES,
	FakeNativeWallet,
	fakeDecodedAccount,
	fakeSignature,
	fakeSignedPayload,
} from '../../test/fake-native-wallet.js';

const PUBLIC_KEY = Uint8Array.of(
	1,
	2,
	3,
	4,
	5,
	6,
	7,
	8,
	9,
	10,
	11,
	12,
	13,
	14,
	15,
	16,
	17,
	18,
	19,
	20,
	21,
	22,
	23,
	24,
	25,
	26,
	27,
	28,
	29,
	30,
	31,
	32,
);

const WALLET = {
	publicKey: PUBLIC_KEY,
	label: 'Contract Account',
	authToken: 'CONTRACT_TOKEN',
	walletUriBase: 'https://contractwallet.example.com',
};

let wallet: FakeNativeWallet;

testSeekerLinkContract('react-native local adapter', {
	setup() {
		wallet = new FakeNativeWallet(WALLET);
		return {
			link: createLocalSeekerLink(wallet.startSession),
			config: {
				identity: {
					name: 'Contract Dapp',
					uri: 'https://dapp.example.com',
				},
				// The shared config type requires relayDomain, but this
				// adapter never touches a relay. Placeholder; never dialed.
				relayDomain: 'unavailable-for-local.example',
			},
			expected: {
				accounts: [fakeDecodedAccount(WALLET)],
				authToken: WALLET.authToken,
				walletUriBase: WALLET.walletUriBase,
				capabilities: {
					maxMessagesPerRequest: DEFAULT_FAKE_CAPABILITIES.max_messages_per_request,
					maxTransactionsPerRequest: DEFAULT_FAKE_CAPABILITIES.max_transactions_per_request,
					supportedTransactionVersions: DEFAULT_FAKE_CAPABILITIES.supported_transaction_versions,
					features: DEFAULT_FAKE_CAPABILITIES.features,
					supportsSignAndSendTransactions: DEFAULT_FAKE_CAPABILITIES.supports_sign_and_send_transactions,
				},
				signedPayload: fakeSignedPayload,
				transactionSignature: fakeSignature,
			},
			observed: {
				sessionsOpened: () => wallet.sessionsEstablished,
				openSessions: () => wallet.openSessions,
				targetedBaseUris: () => wallet.targetedBaseUris,
				authorizeRequests: () => wallet.authorizeRequests,
				deauthorizedTokens: () => wallet.deauthorizedTokens,
			},
			scriptAuthorizeDecline: () => {
				wallet.script.authorizeError = {
					code: -1,
					message: 'authorization declined',
				};
			},
			scriptUnresponsiveWallet: () => {
				wallet.script.unresponsive = true;
			},
		};
	},
	teardown() {
		wallet.reset();
	},
});

// Cross-check that the double's own expectations are self-consistent —
// catches a drifting PUBLIC_KEY/base58 helper before the suite blames the
// adapter for the double's bug.
it('the double decodes its own account to the expected base58 address', () => {
	expect(base58FromUint8Array(PUBLIC_KEY)).toBe(fakeDecodedAccount(WALLET).address);
});
