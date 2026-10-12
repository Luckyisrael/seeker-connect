const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

// pnpm workspace: the app lives at js/examples/*, packages at js/packages/*.
// Watch the whole workspace and let resolution fall back to the workspace
// root so the workspace:* packages and their transitive deps resolve.
const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

// packages/* test against react/react-query/react-native peer pairings that
// differ from the exact versions this app pins, so a naive resolve from the
// linked package would put a second copy of each into the bundle (two Reacts
// = "useContext of null"). Redirect these to the app's own copies so every
// require sees the same instances the renderer uses.
const singletons = new Set([
	'react',
	'react-native',
	'@tanstack/react-query',
	'@solana-mobile/mobile-wallet-adapter-protocol',
]);

function fromAppRoot(moduleName) {
	return singletons.has(moduleName) || moduleName.startsWith('react/') || moduleName.startsWith('react-native/');
}

const config = {
	watchFolders: [workspaceRoot],
	resolver: {
		nodeModulesPaths: [path.resolve(projectRoot, 'node_modules'), path.resolve(workspaceRoot, 'node_modules')],
		resolveRequest: (context, moduleName, platform) => {
			if (fromAppRoot(moduleName)) {
				return context.resolveRequest(
					{ ...context, originModulePath: path.join(projectRoot, 'index.js') },
					moduleName,
					platform,
				);
			}
			return context.resolveRequest(context, moduleName, platform);
		},
	},
};

module.exports = mergeConfig(getDefaultConfig(projectRoot), config);
