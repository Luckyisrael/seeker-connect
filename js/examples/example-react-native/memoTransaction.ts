/**
 * Builds an unsigned legacy Solana transaction carrying one Memo program
 * instruction, serialized to the wire format wallets sign. Hand-rolled to
 * keep this example free of heavyweight SDK dependencies — same builder
 * the web example uses.
 *
 * RN-safety note: no `TextEncoder` (the memo is ASCII, and the existing
 * example already encodes bytes by hand for Hermes compatibility) and no
 * `AbortSignal.timeout` (not guaranteed in Hermes); the fetch timeout is
 * a manual AbortController + setTimeout instead.
 */
import { base58Decode } from './base58';

const MEMO_PROGRAM_ID = base58Decode('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

/** Solana shortvec: little-endian base-128 varint. */
function shortvec(length: number): number[] {
	const out: number[] = [];
	let remaining = length;
	for (;;) {
		const byte = remaining & 0x7f;
		remaining >>= 7;
		if (remaining === 0) {
			out.push(byte);
			return out;
		}
		out.push(byte | 0x80);
	}
}

function asciiBytes(text: string): Uint8Array {
	return Uint8Array.from(text, (character) => character.charCodeAt(0));
}

export function buildMemoTransaction(feePayer: Uint8Array, recentBlockhash: Uint8Array, memo: string): Uint8Array {
	const data = asciiBytes(memo);
	const message = [
		// Header: 1 required signature, 0 readonly signed, 1 readonly unsigned.
		1,
		0,
		1,
		...shortvec(2),
		...feePayer,
		...MEMO_PROGRAM_ID,
		...recentBlockhash,
		...shortvec(1),
		1, // program id index (memo program)
		...shortvec(0), // no instruction accounts
		...shortvec(data.length),
		...data,
	];
	// Unsigned transaction: signature count + zeroed signature placeholder.
	return Uint8Array.from([...shortvec(1), ...new Array(64).fill(0), ...message]);
}

/**
 * Latest blockhash from the configured RPC; falls back to a placeholder
 * (fine for mock-wallet tests, rejected by a real cluster) when the RPC
 * is unreachable.
 */
export async function fetchRecentBlockhash(): Promise<{
	blockhash: Uint8Array;
	placeholder: boolean;
}> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), 4000);
	try {
		const response = await fetch('https://api.devnet.solana.com', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				jsonrpc: '2.0',
				id: 1,
				method: 'getLatestBlockhash',
			}),
			signal: controller.signal,
		});
		const body = (await response.json()) as {
			result?: { value?: { blockhash?: string } };
		};
		const blockhash = body.result?.value?.blockhash;
		if (blockhash) {
			return { blockhash: base58Decode(blockhash), placeholder: false };
		}
	} catch {
		// Fall through to the placeholder.
	} finally {
		clearTimeout(timer);
	}
	return { blockhash: new Uint8Array(32).fill(1), placeholder: true };
}
