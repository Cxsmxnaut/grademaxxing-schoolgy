import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

const localChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const localExecutable = !process.env.CI && existsSync(localChrome) ? localChrome : undefined;

export default defineConfig({
	testDir: './tests/e2e',
	timeout: 120_000,
	expect: { timeout: 20_000 },
	fullyParallel: false,
	workers: 1,
	reporter: 'list',
	use: {
		baseURL: process.env.GRADEMAXXING_URL ?? 'http://127.0.0.1:5173',
		trace: 'retain-on-failure',
		launchOptions: localExecutable ? { executablePath: localExecutable } : undefined
	}
});
