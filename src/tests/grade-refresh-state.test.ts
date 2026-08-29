import type { GradebookCatalog } from '$lib/grades/catalog';
import {
	cacheGradebookRecord,
	getGradebookCacheOwnerFor,
	getReportPeriodIndex
} from '$lib/grades/refresh';
import { gradebookXml } from '$lib/server/gradebook-adapter';
import type { ReportPeriod } from '$lib/types/Gradebook';
import { expect, test } from 'vitest';

const reportPeriod = (index: string): ReportPeriod => ({
	_GradePeriod: 'Quarter',
	_Index: index,
	_StartDate: '',
	_EndDate: ''
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
});
