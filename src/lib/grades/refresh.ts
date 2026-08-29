import { parseGradebookXML } from '$lib/synergy';
import type { ReportPeriod } from '$lib/types/Gradebook';
import type { GradebookCatalog, GradebookRecord } from './catalog';

export function getReportPeriodIndex(reportPeriod: ReportPeriod, fallbackIndex: number) {
	const index = Number.parseInt(reportPeriod._Index);
	return Number.isInteger(index) && index >= 0 ? index : fallbackIndex;
}

/** Replace one period atomically and return the period the portal actually sent. */
export function cacheGradebookRecord(
	gradebookCatalog: GradebookCatalog,
	gradebookRecord: GradebookRecord
) {
	const gradebook = parseGradebookXML(gradebookRecord.xml);
	const receivedIndex = Number.parseInt(gradebook.ReportingPeriod._Index);
	if (!Number.isInteger(receivedIndex) || receivedIndex < 0) {
		throw new Error('StudentVUE returned a gradebook with an invalid report period.');
	}

	gradebookCatalog.recordCache[receivedIndex] = gradebookRecord;
	return { gradebook, receivedIndex };
}

export function getGradebookCacheOwnerFor(account?: { domain: string; userID: string }) {
	if (!account) return undefined;
	return `${account.domain.trim().toLowerCase()}\n${account.userID.trim().toLowerCase()}`;
}
