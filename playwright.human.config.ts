import { defineConfig } from '@playwright/test';

export default defineConfig({
	testDir: './tests/human',
	timeout: 180_000,
	expect: { timeout: 30_000 },
	fullyParallel: false,
	workers: 1,
	reporter: 'list',
	use: {
		baseURL: process.env.GRADEMAXXING_URL ?? 'http://127.0.0.1:5173',
		trace: 'off',
		screenshot: 'off',
		video: 'off'
	}
});
