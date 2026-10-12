/**
 * Seeker device detection — the docs' recipe ("Detecting Seeker Users",
 * method 1).
 *
 * SPOOFABLE by design: `Platform.constants.Model` can be faked by a
 * rooted/modified device. That is fine for what this is for — routing the
 * connect UX (branded direct connect on Seeker, chooser elsewhere). For
 * a GUARANTEE that you are dealing with a Seeker owner, use the docs'
 * server-side method 2: SIWS-verify the wallet, then check on-chain for
 * the Seeker Genesis Token (SGT) and record its mint address.
 */
import { Platform } from 'react-native';

export function isSeekerDevice(): boolean {
	const model = (Platform.constants as { Model?: string } | undefined)?.Model;
	return model === 'Seeker';
}
