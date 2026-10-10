import { acc } from '$lib/account.svelte';
import type { ReportPeriod } from '$lib/contracts/studentvue/gradebook';
import {
	getGradebookCatalogFromLocalStorage,
	saveGradebookCatalogToLocalStorage,
	type GradebookCatalog
} from '$lib/grades/catalog';
import {
	gradebookState,
	initializeGradebookCatalog,
	refreshGradebookAfterSessionRestore,
	resetGradebookCatalog,
	switchReportPeriod
} from '$lib/grades/catalog.svelte';
import {
	cacheGradebookRecord,
	getGradebookCacheOwnerFor,
	getReportPeriodIndex,
	gradebookCacheBelongsTo,
	gradebookSummaryMatches
} from '$lib/grades/refresh';
import { gradebookXml } from '$lib/server/gradebook-adapter';
import { StudentAccount } from '$lib/studentvue/account';
import { Operation, wrapEnvelope } from '$lib/studentvue/xml';
import { expect, test, vi } from 'vitest';

const reportPeriod = (index: string): ReportPeriod => ({
	_GradePeriod: 'Quarter',
	_Index: index,
	_StartDate: '',
	_EndDate: ''
});

test('grade-refresh accepts the same saved owner across domain spellings but rejects other students and districts', () => {
	const account = { domain: 'portal.example.test/district', userID: 'StudentA' };
	expect(
		gradebookCacheBelongsTo('https://Portal.Example.test/district/\n StudentA ', account)
	).toBe(true);
	expect(gradebookCacheBelongsTo('portal.example.test/district\nstudentb', account)).toBe(false);
	expect(gradebookCacheBelongsTo('portal.example.test/another\nstudenta', account)).toBe(false);
	expect(gradebookCacheBelongsTo(undefined, account)).toBe(false);
});

test('grade-refresh uses the portal report-period ID instead of its display position', () => {
	expect(getReportPeriodIndex(reportPeriod('7'), 1)).toBe(7);
	expect(getReportPeriodIndex(reportPeriod('invalid'), 1)).toBe(1);
});

test('grade-refresh atomically replaces the record returned for a report period', () => {
	const initial = { xml: gradebookXml([]), lastRefresh: 1 };
	const refreshed = { xml: gradebookXml([]), lastRefresh: 2 };
	const catalog: GradebookCatalog = { recordCache: [initial], defaultIndex: 0 };

	const result = cacheGradebookRecord(catalog, refreshed);

	expect(result.receivedIndex).toBe(0);
	expect(catalog.recordCache[0]).toBe(refreshed);
});

test('grade-refresh cache ownership is stable and account-specific', () => {
	expect(getGradebookCacheOwnerFor({ domain: 'Portal.Example.test ', userID: ' StudentA ' })).toBe(
		'portal.example.test\nstudenta'
	);
	expect(getGradebookCacheOwnerFor({ domain: 'portal.example.test', userID: 'StudentB' })).toBe(
		'portal.example.test\nstudentb'
	);
	expect(
		getGradebookCacheOwnerFor({ domain: 'https://Portal.Example.test/', userID: ' StudentA ' })
	).toBe('portal.example.test\nstudenta');
	expect(
		getGradebookCacheOwnerFor({
			domain: 'https://portal.example.test/district/',
			userID: 'StudentA'
		})
	).toBe('portal.example.test/district\nstudenta');
});

test('grade-refresh reuses details when only assignment payloads differ', () => {
	const cached = gradebookXml([
		{
			id: '1',
			period: '1',
			title: 'History',
			room: '101',
			teacher: 'Teacher',
			teacherEmail: '',
			score: 'A',
			scoreRaw: '95',
			missing: '',
			categories: [],
			assignments: [{ AssignmentID: 'old', Measure: 'Quiz' }]
		}
	]);
	const refreshed = gradebookXml([
		{
			id: '1',
			period: '1',
			title: 'History',
			room: '101',
			teacher: 'Teacher',
			teacherEmail: '',
			score: 'A',
			scoreRaw: '95',
			missing: '',
			categories: [],
			assignments: [{ AssignmentID: 'new', Measure: 'Project' }]
		}
	]);

	expect(gradebookSummaryMatches(cached, refreshed)).toBe(true);
});

test('grade-refresh detects changed official marks', () => {
	const cached = gradebookXml([
		{
			id: '1',
			period: '1',
			title: 'History',
			room: '101',
			teacher: 'Teacher',
			teacherEmail: '',
			score: 'A',
			scoreRaw: '95',
			missing: '',
			categories: [],
			assignments: []
		}
	]);
	const refreshed = gradebookXml([
		{
			id: '1',
			period: '1',
			title: 'History',
			room: '101',
			teacher: 'Teacher',
			teacherEmail: '',
			score: 'B',
			scoreRaw: '85',
			missing: '',
			categories: [],
			assignments: []
		}
	]);

	expect(gradebookSummaryMatches(cached, refreshed)).toBe(false);
});

test('failed fresh recovery retains saved grades and its error across consumer mounts until a live retry succeeds', async () => {
	const storedValues = new Map<string, string>();
	vi.stubGlobal('localStorage', {
		getItem: (key: string) => storedValues.get(key) ?? null,
		setItem: (key: string, value: string) => storedValues.set(key, value),
		removeItem: (key: string) => storedValues.delete(key)
	});
	vi.spyOn(console, 'error').mockImplementation(() => undefined);
	const account = new StudentAccount('portal.example.test', 'synthetic-recovery-student', '');
	const course = {
		id: 'synthetic-recovery-course',
		period: '1',
		title: 'Recovery Test',
		room: '101',
		teacher: 'Example Teacher',
		teacherEmail: '',
		score: 'A',
		scoreRaw: '94',
		missing: '',
		categories: [],
		assignments: []
	};
	const savedRecord = {
		xml: gradebookXml([course]),
		lastRefresh: Date.now(),
		detailed: true
	};
	const liveXml = gradebookXml([{ ...course, scoreRaw: '98' }]);
	const outage = new Error('Synthetic gradebook outage');
	const request = vi
		.spyOn(account, 'gradebookRequest')
		.mockRejectedValueOnce(outage)
		.mockResolvedValueOnce(new Response(wrapEnvelope(liveXml, Operation.Request)));
	try {
		resetGradebookCatalog();
		acc.studentAccount = account;
		saveGradebookCatalogToLocalStorage({ recordCache: [savedRecord], defaultIndex: 0 });

		await expect(refreshGradebookAfterSessionRestore(account)).rejects.toBe(outage);
		const savedCatalog = gradebookState.gradebookCatalog;
		expect(savedCatalog?.recordCache[0]).toEqual(savedRecord);
		expect(gradebookState.loadingError).toBe(outage);
		expect(request).toHaveBeenCalledExactlyOnceWith(undefined, false, true);

		// Sidebar and page mounts reuse the failed recovery's catalog, preserving
		// the warning and retry control instead of declaring fresh cached data valid.
		await initializeGradebookCatalog();
		await initializeGradebookCatalog();
		expect(gradebookState.gradebookCatalog).toBe(savedCatalog);
		expect(gradebookState.loadingError).toBe(outage);
		expect(request).toHaveBeenCalledTimes(1);

		await switchReportPeriod({ forceRefresh: true, fresh: true, silent: true });
		expect(request).toHaveBeenCalledTimes(2);
		expect(request).toHaveBeenLastCalledWith(undefined, false, true);
		expect(gradebookState.loadingError).toBeUndefined();
		expect(gradebookState.gradebookCatalog?.recordCache[0]?.xml).toBe(liveXml);
	} finally {
		resetGradebookCatalog();
		acc.studentAccount = undefined;
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	}
});

test('an older in-flight refresh cannot overwrite or persist grades after a newer refresh finishes', async () => {
	const storedValues = new Map<string, string>();
	vi.stubGlobal('localStorage', {
		getItem: (key: string) => storedValues.get(key) ?? null,
		setItem: (key: string, value: string) => storedValues.set(key, value),
		removeItem: (key: string) => storedValues.delete(key)
	});
	const account = new StudentAccount(
		'portal.example.test',
		'synthetic-race-student',
		'',
		'session'
	);
	let finishOld!: (response: Response) => void;
	let finishNew!: (response: Response) => void;
	const oldResponse = new Promise<Response>((resolve) => (finishOld = resolve));
	const newResponse = new Promise<Response>((resolve) => (finishNew = resolve));
	const request = vi
		.spyOn(account, 'gradebookRequest')
		.mockReturnValueOnce(oldResponse)
		.mockReturnValueOnce(newResponse);
	const oldXml = gradebookXml([]);
	const newXml = oldXml.replace('Quarter 1', 'Refreshed Quarter');
	try {
		resetGradebookCatalog();
		acc.studentAccount = account;
		gradebookState.gradebookCatalog = {
			defaultIndex: 0,
			recordCache: [{ xml: oldXml, lastRefresh: 1, detailed: true }]
		};
		const older = switchReportPeriod({ fresh: true, silent: true });
		const newer = switchReportPeriod({ fresh: true, silent: true });
		finishNew(new Response(wrapEnvelope(newXml, Operation.Request)));
		await newer;
		finishOld(new Response(wrapEnvelope(oldXml, Operation.Request)));
		await older;
		expect(request).toHaveBeenCalledTimes(2);
		expect(gradebookState.gradebookCatalog?.recordCache[0]?.xml).toBe(newXml);
		expect(getGradebookCatalogFromLocalStorage()?.recordCache[0]?.xml).toBe(newXml);
	} finally {
		resetGradebookCatalog();
		acc.studentAccount = undefined;
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	}
});

test('saved grades from before the class identity fix are discarded for a complete refresh', () => {
	const storedValues = new Map<string, string>();
	vi.stubGlobal('localStorage', {
		getItem: (key: string) => storedValues.get(key) ?? null,
		setItem: (key: string, value: string) => storedValues.set(key, value),
		removeItem: (key: string) => storedValues.delete(key)
	});
	try {
		acc.studentAccount = new StudentAccount('portal.example.test', 'synthetic-cache-student', '');
		saveGradebookCatalogToLocalStorage({
			defaultIndex: 0,
			recordCache: [{ xml: gradebookXml([]), lastRefresh: 1 }]
		});
		const key = [...storedValues.keys()][0]!;
		const cache = JSON.parse(storedValues.get(key)!);
		cache.version = 6;
		storedValues.set(key, JSON.stringify(cache));
		expect(getGradebookCatalogFromLocalStorage()).toBeUndefined();
		expect(storedValues.has(key)).toBe(false);
	} finally {
		acc.studentAccount = undefined;
		vi.unstubAllGlobals();
	}
});
