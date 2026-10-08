import { includeIgnoreFile } from '@eslint/compat';
import eslint from '@eslint/js';
import prettier from 'eslint-config-prettier';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import { fileURLToPath } from 'node:url';
import svelteParser from 'svelte-eslint-parser';
import tseslint from 'typescript-eslint';

const gitignorePath = fileURLToPath(new URL('./.gitignore', import.meta.url));

export default tseslint.config(
	{ ignores: ['static/mockServiceWorker.js', 'admin-console/**', 'static/admin-app/**'] },
	includeIgnoreFile(gitignorePath),
	eslint.configs.recommended,
	...tseslint.configs.recommended,
	...svelte.configs['flat/recommended'],
	prettier,
	...svelte.configs['flat/prettier'],
	{
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node
			},
			parser: tseslint.parser,
			parserOptions: { extraFileExtensions: ['.svelte'] }
		},
		rules: {
			'no-duplicate-imports': 'error',
			'no-restricted-imports': [
				'error',
				{
					paths: [
						{
							name: '$lib',
							message:
								'Import from the module that owns the responsibility; $lib has no catch-all barrel.'
						}
					]
				}
			],
			eqeqeq: 'error',
			'@typescript-eslint/no-unused-vars': [
				'error',
				{ argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }
			],
			'svelte/no-navigation-without-resolve': 'off'
		}
	},
	{
		name: 'typescript',
		files: ['**/*.ts', '*.ts']
	},
	{
		name: 'svelte',
		files: [
			'**/*.svelte',
			'*.svelte',
			'**/*.svelte.js',
			'*.svelte.js',
			'**/*.svelte.ts',
			'*.svelte.ts'
		],
		languageOptions: {
			parser: svelteParser,
			parserOptions: {
				parser: tseslint.parser
			}
		},
		extends: [tseslint.configs.disableTypeChecked],
		rules: {
			'@typescript-eslint/no-unused-expressions': 'off',
			// Svelte's bindable values are consumed by template bindings that this core rule cannot see.
			'no-useless-assignment': 'off',
			'svelte/prefer-svelte-reactivity': 'off'
		}
	},
	{
		name: 'diagnostic scripts and browser tests',
		files: ['scripts/**/*.{ts,mjs}', 'tests/**/*.ts'],
		rules: {
			'@typescript-eslint/no-explicit-any': 'off',
			'no-empty-pattern': 'off'
		}
	}
);
