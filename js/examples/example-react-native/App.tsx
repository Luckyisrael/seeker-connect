import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { Button, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';

import {
	createAsyncStorageAuthorizationCache,
	DEFAULT_SEEKER_CHAIN,
	isSeekerDevice,
	SeekerConnectError,
	type SeekerConnectConfig,
} from '@solana-mobile/seeker-connect-react-native';
import { useSeekerConnect } from '@solana-mobile/seeker-connect-react-native/hooks';

const queryClient = new QueryClient();

const config: SeekerConnectConfig = {
	identity: { name: 'Seeker Connect Example', uri: 'https://seeker-connect.example.com' },
	// Required by the shared config type; no relay is involved locally.
	relayDomain: 'unavailable-for-local.example',
};

const cache = createAsyncStorageAuthorizationCache(AsyncStorage);

function errorText(error: unknown): string {
	if (error instanceof SeekerConnectError) return `${error.code}: ${error.message}`;
	return error instanceof Error ? error.message : String(error);
}

function asciiBytes(text: string): Uint8Array {
	return Uint8Array.from(text, (character) => character.charCodeAt(0));
}

function hex(bytes: Uint8Array): string {
	return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function Connector() {
	const { authorization, isConnecting, connectError, transact, disconnect } = useSeekerConnect({ config, cache });
	const [log, setLog] = useState<string[]>([]);

	const append = useCallback((line: string) => {
		setLog((current) => [`${new Date().toLocaleTimeString()}  ${line}`, ...current].slice(0, 50));
	}, []);

	const connect = () => {
		const stored = authorization;
		void (async () => {
			try {
				append(stored ? 'reconnecting with stored authorization…' : 'connecting…');
				await transact(
					async (wallet) => {
						const granted = await wallet.authorize(stored ? { authToken: stored.authToken } : undefined);
						const account = granted.accounts[0];
						append(
							`authorized ${account?.address ?? '(no account)'}${granted.walletUriBase ? ` via ${granted.walletUriBase}` : ''}`,
						);
						const capabilities = await wallet.getCapabilities();
						append(`capabilities: ${capabilities.features.join(', ') || '(none reported)'}`);
						// The hook only reads this cache; the callback that owns the
						// authorize result is where the grant gets persisted.
						await cache.set({
							accounts: granted.accounts,
							authToken: granted.authToken,
							walletUriBase: granted.walletUriBase,
							chain: config.chain ?? DEFAULT_SEEKER_CHAIN,
							capabilities,
						});
						append('authorization stored');
					},
					stored?.walletUriBase ? { walletUriBase: stored.walletUriBase } : undefined,
				);
				append('session closed');
			} catch (error) {
				append(`connect failed — ${errorText(error)}`);
			}
		})();
	};

	const signMessage = () => {
		const stored = authorization;
		const address = stored?.accounts[0]?.address;
		if (!stored || !address) {
			append('not connected — connect first');
			return;
		}
		void (async () => {
			try {
				await transact(
					async (wallet) => {
						await wallet.authorize({ authToken: stored.authToken });
						const payload = asciiBytes(`Seeker Connect example @ ${new Date().toISOString()}`);
						const [signed] = await wallet.signMessages({ addresses: [address], payloads: [payload] });
						append(`sign_messages ok — ${signed.length}B, first 16: ${hex(signed.slice(0, 16))}`);
					},
					stored.walletUriBase ? { walletUriBase: stored.walletUriBase } : undefined,
				);
			} catch (error) {
				append(`sign failed — ${errorText(error)}`);
			}
		})();
	};

	const forget = () => {
		const stored = authorization;
		void (async () => {
			if (stored) {
				try {
					await transact(
						async (wallet) => {
							await wallet.deauthorize({ authToken: stored.authToken });
						},
						stored.walletUriBase ? { walletUriBase: stored.walletUriBase } : undefined,
					);
					append('wallet deauthorized');
				} catch (error) {
					append(`deauthorize failed — ${errorText(error)}`);
				}
			}
			await disconnect();
			append('local authorization cleared');
		})();
	};

	return (
		<View style={styles.connector}>
			<Text style={styles.heading}>Seeker Connect: React Native example</Text>
			<Text style={styles.meta}>
				seeker device: {isSeekerDevice() ? 'yes' : 'no'} · status:{' '}
				{authorization ? 'connected' : 'not connected'}
			</Text>
			{authorization && (
				<View style={styles.status}>
					<Text style={styles.line}>address: {authorization.accounts[0]?.address ?? '(none)'}</Text>
					<Text style={styles.line}>chain: {authorization.chain}</Text>
					<Text style={styles.line}>
						walletUriBase: {authorization.walletUriBase ?? '(none chooser path)'}
					</Text>
					<Text style={styles.line}>authToken: {authorization.authToken ? 'stored' : 'missing'}</Text>
				</View>
			)}
			{connectError != null && <Text style={styles.error}>last error: {errorText(connectError)}</Text>}
			<View style={styles.buttons}>
				<Button
					title={authorization ? 'Reconnect (cached)' : 'Connect'}
					disabled={isConnecting}
					onPress={connect}
				/>
				<Button title="Sign message" disabled={isConnecting || !authorization} onPress={signMessage} />
				<Button title="Disconnect" disabled={isConnecting || !authorization} onPress={forget} />
			</View>
			<ScrollView style={styles.log}>
				{log.map((entry, index) => (
					<Text key={`${index}-${entry}`} style={styles.logLine}>
						{entry}
					</Text>
				))}
			</ScrollView>
		</View>
	);
}

export default function App() {
	return (
		<QueryClientProvider client={queryClient}>
			<View style={styles.root}>
				<Connector />
			</View>
		</QueryClientProvider>
	);
}

const styles = StyleSheet.create({
	root: {
		flex: 1,
		paddingTop: (StatusBar.currentHeight ?? 0) + 16,
		backgroundColor: '#0b0e14',
	},
	connector: {
		flex: 1,
		paddingHorizontal: 20,
		gap: 12,
	},
	heading: {
		color: '#ffffff',
		fontSize: 20,
		fontWeight: '600',
	},
	meta: {
		color: '#9aa4b2',
		fontSize: 13,
	},
	status: {
		backgroundColor: '#151a24',
		borderRadius: 8,
		padding: 12,
		gap: 4,
	},
	line: {
		color: '#c7d0dd',
		fontSize: 13,
	},
	error: {
		color: '#ff8f8f',
		fontSize: 13,
	},
	buttons: {
		gap: 8,
	},
	log: {
		flex: 1,
		marginTop: 4,
	},
	logLine: {
		color: '#8fd48f',
		fontSize: 12,
		fontFamily: 'monospace',
		marginBottom: 4,
	},
});
