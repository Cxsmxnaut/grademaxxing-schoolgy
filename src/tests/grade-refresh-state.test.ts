import type { ReportPeriod } from '$lib/contracts/studentvue/gradebook';
import type { GradebookCatalog } from '$lib/grades/catalog';
import {
	cacheGradebookRecord,
	getGradebookCacheOwnerFor,
	getReportPeriodIndex,
	gradebookCacheBelongsTo,
	gradebookSummaryMatches
} from '$lib/grades/refresh';
import { gradebookXml } from '$lib/server/gradebook-adapter';
import { expect, test } from 'vitest';

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
