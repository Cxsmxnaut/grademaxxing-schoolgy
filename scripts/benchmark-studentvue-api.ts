import { execFileSync } from 'node:child_process';
import { appendFile, mkdir } from 'node:fs/promises';
import { userInfo } from 'node:os';
import { dirname, resolve } from 'node:path';
import { stdin as input, stdout as output } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { Pxp2Client, type Pxp2RequestMetric } from '../src/lib/server/pxp2';

type RunMode = 'fast' | 'complete' | 'all';
type BenchmarkCredentials = { district: string; username: string; password: string };
type ResourceResult = {
	resource: string;
	ok: boolean;
	durationMs: number;
	errorKind?: string;
};

const KEYCHAIN_SERVICE = 'grademaxxing.studentvue.benchmark.v1';
const KEYCHAIN_ACCOUNT = safeKeychainAccount();
const argumentsList = process.argv.slice(2);
const command =
	argumentsList[0] === 'configure' || argumentsList[0] === 'clear' ? argumentsList[0] : 'run';

if (command === 'configure') {
	await configureCredentials();
	process.exit(0);
}

if (command === 'clear') {
	clearStoredCredentials();
	console.log('Removed the local StudentVUE benchmark credentials from macOS Keychain.');
	process.exit(0);
}

if (argumentsList.includes('--help') || argumentsList.includes('-h')) {
	printHelp();
	process.exit(0);
}

const mode = readMode(argumentsList);
const json = argumentsList.includes('--json');
const failOverBudget = argumentsList.includes('--fail-over-budget');
const budgetMs = readPositiveIntegerArgument(argumentsList, '--budget-ms', 4_000);
const recordPath = readOptionalPathArgument(
	argumentsList,
	'--record',
	'.local/studentvue-api-benchmarks.ndjson'
);
const credentials = loadCredentials();

if (!credentials) {
	throw new Error(
		'No benchmark credentials found. Run `npm run benchmark:studentvue -- configure` or provide the three documented environment variables.'
	);
}

const requestMetrics: Pxp2RequestMetric[] = [];
const startedAt = performance.now();
let client: Pxp2Client;
try {
	client = await Pxp2Client.login(
		credentials.district,
		{ username: credentials.username, password: credentials.password },
		(metric) => requestMetrics.push(metric)
	);
} catch (cause) {
	throw new Error(`StudentVUE benchmark login failed: ${errorKind(cause)}.`);
}
const loginMs = Math.round(performance.now() - startedAt);
const resources: ResourceResult[] = [];

if (mode === 'fast') {
	resources.push(await measure('gradebook-fast', () => client.gradebook(undefined, true)));
} else if (mode === 'complete') {
	resources.push(await measure('gradebook-complete', () => client.gradebook()));
} else {
	// Keep these calls serial: StudentVUE mutates focus and cookie state on the same portal session.
	resources.push(await measure('gradebook-complete', () => client.gradebook()));
	resources.push(await measure('attendance', () => client.attendanceDetails()));
	resources.push(await measure('calendar', () => client.calendar()));
	resources.push(await measure('student-info', () => client.studentInfo()));
	resources.push(await measure('schedule', () => client.schedule()));
	resources.push(await measure('school-info', () => client.schoolInfo()));
	resources.push(await measure('documents-index', () => client.documents()));
	resources.push(await measure('report-cards-index', () => client.reportCards()));
	resources.push(await measure('mailbox-index', () => client.mailbox()));
}

const totalMs = Math.round(performance.now() - startedAt);
const report = {
	mode,
	budgetMs,
	withinBudget: totalMs <= budgetMs,
	loginMs,
	totalMs,
	resources,
	requestMetrics: requestMetrics.map((metric) => ({
		path: safeRequestPath(metric.path),
		status: metric.status,
		durationMs: metric.durationMs,
		outcome: metric.outcome
	}))
};

if (json) {
	console.log(JSON.stringify(report, null, 2));
} else {
	console.log(`StudentVUE API benchmark: ${mode}`);
	console.log(
		`Login: ${loginMs} ms · Total: ${totalMs} ms · ${budgetMs} ms budget: ${report.withinBudget ? 'met' : 'not met'}`
	);
	for (const result of resources) {
		console.log(
			`${result.ok ? 'PASS' : 'FAIL'} ${result.resource.padEnd(22)} ${String(result.durationMs).padStart(6)} ms${
				result.errorKind ? ` · ${result.errorKind}` : ''
			}`
		);
	}
	console.log(`Upstream requests: ${requestMetrics.length}`);
}

if (recordPath) {
	await appendTimingRecord(recordPath, report);
	if (!json) console.log(`Timing history: ${recordPath}`);
}

if (failOverBudget && !report.withinBudget) process.exitCode = 2;

async function configureCredentials() {
	if (process.platform !== 'darwin')
		throw new Error('The one-time credential store currently requires macOS Keychain.');

	const readline = createInterface({ input, output });
	try {
		console.log(
			'Use only a designated StudentVUE test account. Credentials stay in macOS Keychain.'
		);
		const approved = (
			await readline.question('Type TEST to confirm this is an approved test account: ')
		).trim();
		if (approved !== 'TEST') throw new Error('Credential setup cancelled.');
		const district = (await readline.question('StudentVUE district URL: ')).trim();
		const username = (await readline.question('StudentVUE username: ')).trim();
		if (!district || !username) throw new Error('District URL and username are required.');
		readline.close();
		const password = await readHidden('StudentVUE password: ');
		if (!password) throw new Error('StudentVUE password is required.');
		saveStoredCredentials({ district, username, password });
		console.log(
			'Saved the benchmark credentials in macOS Keychain. No credential file was created.'
		);
	} finally {
		readline.close();
	}
}

function loadCredentials(): BenchmarkCredentials | undefined {
	const fromEnvironment = {
		district: process.env.DISTRICT_URL,
		username: process.env.STUDENTVUE_USERNAME,
		password: process.env.STUDENTVUE_PASSWORD
	};
	if (fromEnvironment.district && fromEnvironment.username && fromEnvironment.password) {
		if (process.env.STUDENTVUE_TEST_ACCOUNT !== '1') {
			throw new Error(
				'Set STUDENTVUE_TEST_ACCOUNT=1 to confirm the environment account is approved for testing.'
			);
		}
		return {
			district: fromEnvironment.district,
			username: fromEnvironment.username,
			password: fromEnvironment.password
		};
	}

	if (process.platform !== 'darwin') return undefined;
	const district = readKeychainValue('district');
	const username = readKeychainValue('username');
	const password = readKeychainValue('password');
	return district && username && password ? { district, username, password } : undefined;
}

function saveStoredCredentials(credentials: BenchmarkCredentials) {
	writeKeychainValue('district', credentials.district);
	writeKeychainValue('username', credentials.username);
	writeKeychainValue('password', credentials.password);
}

function clearStoredCredentials() {
	if (process.platform !== 'darwin') return;
	for (const field of ['district', 'username', 'password']) {
		try {
			execFileSync(
				'security',
				['delete-generic-password', '-a', KEYCHAIN_ACCOUNT, '-s', keychainService(field)],
				{
					stdio: ['ignore', 'ignore', 'ignore']
				}
			);
		} catch {
			// Missing entries are already cleared.
		}
	}
}

function readKeychainValue(field: string) {
	try {
		return execFileSync(
			'security',
			['find-generic-password', '-a', KEYCHAIN_ACCOUNT, '-s', keychainService(field), '-w'],
			{ encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
		).trim();
	} catch {
		return undefined;
	}
}

function writeKeychainValue(field: string, value: string) {
	// `security` receives the secret only as a short-lived process argument. It is
	// never written to a file, printed, or placed in the shell command string.
	execFileSync(
		'security',
		[
			'add-generic-password',
			'-a',
			KEYCHAIN_ACCOUNT,
			'-s',
			keychainService(field),
			'-U',
			'-w',
			value
		],
		{ stdio: ['ignore', 'ignore', 'ignore'] }
	);
}

function keychainService(field: string) {
	return `${KEYCHAIN_SERVICE}.${field}`;
}

function safeKeychainAccount() {
	try {
		return userInfo().username || 'current-user';
	} catch {
		return process.env.USER || 'current-user';
	}
}

async function readHidden(prompt: string) {
	if (!input.isTTY || typeof input.setRawMode !== 'function')
		throw new Error(
			'Credential setup requires an interactive terminal so the password can be hidden.'
		);
	output.write(prompt);
	input.setRawMode(true);
	input.resume();
	return await new Promise<string>((resolve) => {
		let value = '';
		const onData = (chunk: Buffer) => {
			for (const character of chunk.toString('utf8')) {
				if (character === '\u0003') {
					input.setRawMode?.(false);
					input.off('data', onData);
					output.write('\n');
					process.exit(130);
				}
				if (character === '\r' || character === '\n') {
					input.setRawMode?.(false);
					input.off('data', onData);
					output.write('\n');
					resolve(value);
					return;
				}
				if (character === '\u007f' || character === '\b') {
					value = value.slice(0, -1);
					continue;
				}
				value += character;
			}
		};
		input.on('data', onData);
	});
}

async function measure(resource: string, loader: () => Promise<unknown>): Promise<ResourceResult> {
	const started = performance.now();
	try {
		await loader();
		return { resource, ok: true, durationMs: Math.round(performance.now() - started) };
	} catch (cause) {
		return {
			resource,
			ok: false,
			durationMs: Math.round(performance.now() - started),
			errorKind: errorKind(cause)
		};
	}
}

function errorKind(cause: unknown) {
	return cause instanceof Error ? cause.constructor.name : 'UnknownError';
}

function safeRequestPath(path: string) {
	if (path.startsWith('/Photos/')) return '/Photos/:photo';
	return path
		.split('/')
		.map((segment) => (/^[A-Za-z0-9_-]{24,}$/.test(segment) ? ':id' : segment))
		.join('/');
}

function readMode(values: string[]): RunMode {
	const index = values.indexOf('--mode');
	const value = index === -1 ? 'fast' : values[index + 1];
	if (value === 'fast' || value === 'complete' || value === 'all') return value;
	throw new Error('Use --mode fast, --mode complete, or --mode all.');
}

function readPositiveIntegerArgument(values: string[], name: string, fallback: number) {
	const index = values.indexOf(name);
	if (index === -1) return fallback;
	const value = Number(values[index + 1]);
	if (!Number.isSafeInteger(value) || value < 1)
		throw new Error(`${name} must be a positive integer.`);
	return value;
}

function readOptionalPathArgument(values: string[], name: string, defaultPath: string) {
	const index = values.indexOf(name);
	if (index === -1) return undefined;
	const requestedPath = values[index + 1];
	return !requestedPath || requestedPath.startsWith('--') ? defaultPath : requestedPath;
}

/** Keep a comparison history without retaining portal content or credentials. */
async function appendTimingRecord(path: string, value: typeof report) {
	const resolvedPath = resolve(path);
	const timingOnly = {
		recordedAt: new Date().toISOString(),
		mode: value.mode,
		budgetMs: value.budgetMs,
		withinBudget: value.withinBudget,
		loginMs: value.loginMs,
		totalMs: value.totalMs,
		resources: value.resources,
		upstream: value.requestMetrics.map(({ path: requestPath, status, durationMs, outcome }) => ({
			requestPath,
			...(status === undefined ? {} : { status }),
			durationMs,
			outcome
		}))
	};
	await mkdir(dirname(resolvedPath), { recursive: true, mode: 0o700 });
	await appendFile(resolvedPath, `${JSON.stringify(timingOnly)}\n`, {
		encoding: 'utf8',
		mode: 0o600
	});
}

function printHelp() {
	console.log(`StudentVUE API benchmark (uses the actual Pxp2Client path)

First-time setup:
  npm run benchmark:studentvue -- configure

Run the fastest gradebook path (default):
  npm run benchmark:studentvue

Other modes:
  npm run benchmark:studentvue -- --mode complete
  npm run benchmark:studentvue -- --mode all

Options:
  --json                  Emit machine-readable timings only
  --budget-ms <number>    Compare total time to a budget (default: 4000)
  --fail-over-budget      Exit 2 when the budget is exceeded
  --record [path]         Append payload-free timing history
  clear                   Remove the Keychain credentials

Environment fallback for CI or non-macOS:
  STUDENTVUE_TEST_ACCOUNT=1 STUDENTVUE_USERNAME=... \\
  STUDENTVUE_PASSWORD=... DISTRICT_URL=... npm run benchmark:studentvue`);
}
