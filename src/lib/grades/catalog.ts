import { LocalStorageKey } from '$lib';
import { acc } from '$lib/account.svelte';
import { Operation, parseGradebookXML, unwrapEnvelope } from '$lib/synergy';
import type { ReportPeriod } from '$lib/types/Gradebook';
import { getGradebookCacheOwnerFor, getReportPeriodIndex } from './refresh';

export { cacheGradebookRecord, getReportPeriodIndex } from './refresh';

export interface GradebookRecord {
	xml: string;
	lastRefresh: number;
	/** Summary records have official course marks but deliberately omit assignment detail. */
	detailed?: boolean;
}

interface GradebookCatalogLocalStorageCache {
	recordCache: (null | GradebookRecord)[];
	defaultIndex: number;
	overrideIndex: number | null;
	owner?: string;
}

export interface GradebookCatalog {
	recordCache: (undefined | GradebookRecord)[];
	defaultIndex: number;
	overrideIndex?: number;
	loadingIndex?: number;
	receivingData?: boolean;
	canonicalReportPeriodEntries?: ReportPeriod[];
}

export function getGradebookCatalogFromLocalStorage() {
	const cacheStr = localStorage.getItem(LocalStorageKey.gradebook);
	if (cacheStr === null) return undefined;

	const cache = JSON.parse(cacheStr) as Partial<GradebookCatalogLocalStorageCache>;
	const owner = getGradebookCacheOwner();
	// Old caches were not account-scoped. Never render one into a newly signed-in account.
	if (!owner || cache.owner !== owner) return undefined;
	if (
		!Array.isArray(cache.recordCache) ||
		cache.recordCache.length === 0 ||
		cache.recordCache.length > 100 ||
		!Number.isInteger(cache.defaultIndex) ||
		cache.defaultIndex! < 0 ||
		cache.defaultIndex! >= cache.recordCache.length ||
		(cache.overrideIndex !== null &&
			cache.overrideIndex !== undefined &&
			(!Number.isInteger(cache.overrideIndex) ||
				cache.overrideIndex < 0 ||
				cache.overrideIndex >= cache.recordCache.length)) ||
		cache.recordCache.some(
			(record) =>
				record !== null &&
				(typeof record !== 'object' ||
					typeof record.xml !== 'string' ||
					record.xml.length === 0 ||
					record.xml.length > 5 * 1024 * 1024 ||
					!Number.isFinite(record.lastRefresh) ||
					record.lastRefresh < 0 ||
					(record.detailed !== undefined && typeof record.detailed !== 'boolean'))
		)
	)
		throw new Error('Saved grade data is invalid.');

	const defaultRecord = cache.recordCache[cache.defaultIndex!];
	if (!defaultRecord) throw new Error('Saved grade data has no default reporting period.');

	const canonicalReportPeriodEntries = defaultRecord
		? parseGradebookXML(defaultRecord.xml).ReportingPeriods.ReportPeriod
		: undefined;

	const gradebookCatalog: GradebookCatalog = {
		recordCache: cache.recordCache.map((record) => record ?? undefined),
		defaultIndex: cache.defaultIndex!,
		overrideIndex: cache.overrideIndex ?? undefined,
		canonicalReportPeriodEntries
	};
	return gradebookCatalog;
}

export function saveGradebookCatalogToLocalStorage(gradebookCatalog: GradebookCatalog) {
	const owner = getGradebookCacheOwner();
	if (!owner) return;
	const cache: GradebookCatalogLocalStorageCache = {
		recordCache: gradebookCatalog.recordCache.map((record) => record ?? null),
		defaultIndex: gradebookCatalog.defaultIndex,
		overrideIndex: gradebookCatalog.overrideIndex ?? null,
		owner
	};

	try {
		localStorage.setItem(LocalStorageKey.gradebook, JSON.stringify(cache));
	} catch {
		// Live grade data remains usable when storage is disabled or full.
	}
}

export function getGradebookCacheOwner() {
	return getGradebookCacheOwnerFor(acc.studentAccount);
}

export async function getGradebookRecord(
	onReceivingData?: () => void,
	reportPeriod?: number,
	summary = false
) {
	const { studentAccount } = acc;
	if (!studentAccount) throw new Error('Cannot get synergy gradebook: student account not loaded');

	const res = await studentAccount.gradebookRequest(reportPeriod, summary);

	onReceivingData?.();

	const envelopeStr = await res.text();

	const record: GradebookRecord = {
		xml: unwrapEnvelope(envelopeStr, Operation.Request),
		lastRefresh: Date.now(),
		detailed: res.headers.get('X-Grademaxxing-Gradebook-Detail') !== 'false'
	};
	return record;
}

export async function getInitialGradebookCatalog() {
	const defaultGradebookRecord = await getGradebookRecord(undefined, undefined, true);

	const defaultGradebook = parseGradebookXML(defaultGradebookRecord.xml);

	const canonicalReportPeriodEntries = defaultGradebook.ReportingPeriods.ReportPeriod;

	const defaultIndex = parseInt(defaultGradebook.ReportingPeriod._Index);
	const highestReportPeriodIndex = canonicalReportPeriodEntries.reduce(
		(highest, reportPeriod, fallbackIndex) =>
			Math.max(highest, getReportPeriodIndex(reportPeriod, fallbackIndex)),
		defaultIndex
	);
	const reportingPeriods: (undefined | GradebookRecord)[] = Array(
		highestReportPeriodIndex + 1
	).fill(undefined);

	reportingPeriods[defaultIndex] = defaultGradebookRecord;

	const gradebookCatalog: GradebookCatalog = {
		recordCache: reportingPeriods,
		defaultIndex,
		canonicalReportPeriodEntries
	};
	return gradebookCatalog;
}

const cacheExpirationTime = 1000 * 60 * 5;

export const gradebookRefreshNeeded = (record: GradebookRecord) =>
	Date.now() - record.lastRefresh > cacheExpirationTime;
