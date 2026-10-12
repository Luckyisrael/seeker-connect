import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
	{ ignores: ['**/dist/**'] },
	js.configs.recommended,
	...tseslint.configs.recommended,
	{
		// Metro and Babel only load their config as CommonJS; these files are
		// build-tool contracts, so exempt them from the ESM-only rules above.
		files: ['examples/*/metro.config.js', 'examples/*/babel.config.js'],
		languageOptions: {
			globals: { __dirname: 'readonly', module: 'readonly', require: 'readonly' },
		},
		rules: {
			'@typescript-eslint/no-require-imports': 'off',
		},
	},
	{
		// Only a package's mwa-adapter module may import the MWA libraries.
		files: ['packages/*/src/**/*.ts'],
		ignores: ['packages/*/src/mwa-adapter/**'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					patterns: [
						{
							group: ['@solana-mobile/*', '!@solana-mobile/seeker-connect-*'],
							message:
								"MWA libraries may only be imported inside a package's src/mwa-adapter/ module, behind the SeekerLink port.",
						},
					],
				},
			],
		},
	},
);
