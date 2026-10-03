import { acc, loadStudentAccount } from '$lib/account.svelte';
import { LocalStorageKey } from '$lib/storage/keys';
import { registerSessionRecoveryGradeRefresh } from '$lib/studentvue/session-recovery';
import { parseGradebookXML, StudentVueSessionExpiredError } from '$lib/synergy';
import { toast } from 'svelte-sonner';
import {
	cacheGradebookRecord,
	completeGradebookRefreshInterval,
	getGradebookCatalogFromLocalStorage,
	getGradebookRecord,
	getInitialGradebookCatalog,
	gradebookRefreshNeeded,
	gradebookSummaryMatches,
	saveGradebookCatalogToLocalStorage,
	type GradebookCatalog
} from './catalog';
import { saveSeenAssignmentsToLocalStorage } from './seenAssignments';
import { seenAssignmentIDs } from './seenAssignments.svelte';

export const gradebookState = $state<{
	gradebookCatalog?: GradebookCatalog;
	loadingError?: unknown;
	version: number;
}>({
	gradebookCatalog: undefined,
	loadingError: undefined,
	version: 0
});

let requestSequence = 0;
let catalogGeneration = 0;

export const getReportPeriodName = (index: number) =>
	gradebookState.gradebookCatalog?.canonicalReportPeriodEntries?.find(
		(reportPeriod) => Number.parseInt(reportPeriod._Index) === index
	)?._GradePeriod ?? `Report Period ${index}`;

export async function switchReportPeriod({
	overrideIndex,
	forceRefresh,
	fresh = false,
	silent,
	summary = false,
	delta = false
}: {
	overrideIndex?: number;
	forceRefresh?: boolean;
	/** Bypass summary reuse and reload the complete portal context and assignments. */
	fresh?: boolean;
	silent?: boolean;
	summary?: boolean;
	/** Check a cached detailed record with a summary before fetching assignments. */
	delta?: boolean;
} = {}) {
	if (!gradebookState.gradebookCatalog)
		throw new Error(`Cannot switch report periods: gradebook catalog not initialized`);

	const catalog = gradebookState.gradebookCatalog;
	const requestedIndex = overrideIndex ?? gradebookState.gradebookCatalog.defaultIndex;
	const requestID = ++requestSequence;
	catalog.loadingIndex = requestedIndex;
	catalog.receivingData = false;
	gradebookState.loadingError = undefined;
	gradebookState.version += 1;

	const record = catalog.recordCache[requestedIndex];

	if (record) setReportPeriodIndex(requestedIndex);

	try {
		if (fresh || forceRefresh || !record || gradebookRefreshNeeded(record)) {
			const cachedDetailedRecord = record && record.detailed !== false ? record : undefined;
			const completeRefreshDue =
				cachedDetailedRecord &&
				Date.now() - cachedDetailedRecord.lastRefresh >= completeGradebookRefreshInterval;
			let gradebookRecord = await getGradebookRecord(
				() => {
					if (requestID !== requestSequence || gradebookState.gradebookCatalog !== catalog) return;
					catalog.receivingData = true;
					gradebookState.version += 1;
				},
				overrideIndex,
				!fresh && cachedDetailedRecord && delta && !completeRefreshDue ? true : summary,
				fresh
			);
			// A newer request owns the screen. Do not let this response overwrite it.
			if (requestID !== requestSequence || gradebookState.gradebookCatalog !== catalog) return;

			const canReuseCachedDetails =
				!fresh && delta && cachedDetailedRecord && gradebookRecord.detailed === false;
			if (canReuseCachedDetails && cachedDetailedRecord) {
				const summaryUnchanged = gradebookSummaryMatches(
					cachedDetailedRecord.xml,
					gradebookRecord.xml
				);
				if (summaryUnchanged && !completeRefreshDue) {
					// Keep the detailed XML and its assignment history. The summary request
					// was only a change check, so it must not replace the usable cache.
					setReportPeriodIndex(requestedIndex);
					cachedDetailedRecord.lastChecked = gradebookRecord.lastRefresh;
					saveGradebookCatalogToLocalStorage(catalog);
					return;
				}

				// A changed mark, or the periodic assignment refresh, needs the complete
				// response. The client keeps these focus-changing requests serialized.
				gradebookRecord = await getGradebookRecord(
					() => {
						if (requestID !== requestSequence || gradebookState.gradebookCatalog !== catalog)
							return;
						catalog.receivingData = true;
						gradebookState.version += 1;
					},
					overrideIndex,
					false,
					false
				);
				if (requestID !== requestSequence || gradebookState.gradebookCatalog !== catalog) return;
			}

			const { gradebook, receivedIndex } = cacheGradebookRecord(catalog, gradebookRecord);

			if (overrideIndex === undefined) {
				catalog.defaultIndex = receivedIndex;
				catalog.canonicalReportPeriodEntries = gradebook.ReportingPeriods.ReportPeriod;
			}

			if (receivedIndex !== requestedIndex) {
				if (overrideIndex === undefined) {
					toast.info(`${gradebook.ReportingPeriod._GradePeriod} is now the default`, {
						description: `${getReportPeriodName(requestedIndex)} may still be viewable`,
						duration: 6000
					});
				} else {
					toast.error(`${getReportPeriodName(requestedIndex)} is not available`, {
						duration: 6000
					});
				}
			} else {
				catalog.overrideIndex = overrideIndex !== catalog.defaultIndex ? overrideIndex : undefined;
				if (forceRefresh && !silent)
					toast.success(`${gradebook.ReportingPeriod._GradePeriod} grades updated`);
			}
		} else {
			setReportPeriodIndex(requestedIndex);
		}

		saveGradebookCatalogToLocalStorage(catalog);
	} catch (error) {
		if (requestID === requestSequence) {
			gradebookState.loadingError = error;
			if (!silent && !(error instanceof StudentVueSessionExpiredError))
				toast.error(`Couldn't update ${getReportPeriodName(requestedIndex)} grades`, {
					description: error instanceof Error ? error.message : String(error),
					duration: 6000
				});
		}
		throw error;
	} finally {
		if (requestID === requestSequence) {
			catalog.loadingIndex = undefined;
			catalog.receivingData = undefined;
			gradebookState.version += 1;
		}
	}
}

function setReportPeriodIndex(index: number) {
	if (!gradebookState.gradebookCatalog)
		throw new Error(`Cannot set report period index: gradebook catalog not initialized`);

	gradebookState.gradebookCatalog.overrideIndex =
		index !== gradebookState.gradebookCatalog.defaultIndex ? index : undefined;
}

async function getGradebookCatalog() {
	let lsCache: GradebookCatalog | undefined;
	try {
		lsCache = getGradebookCatalogFromLocalStorage();
	} catch (error) {
		console.error('Error loading gradebook cache:', error);
		toast.warning('Failed to load saved gradebook data; refreshing', {
			description: error instanceof Error ? error.message : String(error),
			duration: 6000
		});
		try {
			localStorage.removeItem(LocalStorageKey.gradebook);
		} catch {
			// Continue with a live refresh if managed browser policy disables storage.
		}
	}

	return {
		catalog: lsCache ?? (await getInitialGradebookCatalog()),
		fromCache: lsCache !== undefined
	};
}

let initializationPromise: Promise<void> | undefined;

export function resetGradebookCatalog() {
	requestSequence += 1;
	catalogGeneration += 1;
	initializationPromise = undefined;
	gradebookState.gradebookCatalog = undefined;
	gradebookState.loadingError = undefined;
	gradebookState.version += 1;
}

export function initializeGradebookCatalog(): Promise<void> {
	initializationPromise ??= initializeGradebookCatalogOnce();
	return initializationPromise;
}

/** Keep recovery loading until this account's selected period has fresh assignments. */
export async function refreshGradebookAfterSessionRestore(expectedAccount = acc.studentAccount) {
	if (!expectedAccount || acc.studentAccount !== expectedAccount) return false;
	resetGradebookCatalog();
	const generation = catalogGeneration;
	initializationPromise = initializeGradebookCatalogOnce(true);
	await initializationPromise;
	if (generation !== catalogGeneration || acc.studentAccount !== expectedAccount) return false;
	if (gradebookState.loadingError) throw gradebookState.loadingError;
	if (!gradebookState.gradebookCatalog)
		throw new Error('The restored StudentVUE account could not load its grades.');
	return true;
}

registerSessionRecoveryGradeRefresh((expectedAccount) =>
	acc.studentAccount === expectedAccount
		? refreshGradebookAfterSessionRestore(acc.studentAccount)
		: Promise.resolve(false)
);

async function initializeGradebookCatalogOnce(fresh = false) {
	const generation = catalogGeneration;
	if (!gradebookState.gradebookCatalog) {
		// A retry owns the loading state immediately, including automatic retries
		// that follow the first failure before the student presses Refresh.
		gradebookState.loadingError = undefined;
		gradebookState.version += 1;
	}
	try {
		if (!acc.studentAccount) loadStudentAccount();
		// Protected routes may render for one frame while the layout redirects a signed-out
		// visitor. That is an expected navigation state, not a gradebook failure.
		if (!acc.studentAccount) return;

		const { catalog: loadedCatalog, fromCache } = await getGradebookCatalog();
		if (generation !== catalogGeneration) return;
		gradebookState.gradebookCatalog = loadedCatalog;
		saveGradebookCatalogToLocalStorage(loadedCatalog);
		gradebookState.version += 1;
		const catalog = gradebookState.gradebookCatalog;
		const activeIndex = catalog.overrideIndex ?? catalog.defaultIndex;
		const canRenderImmediately = catalog.recordCache[activeIndex] !== undefined;

		// If there aren't any seen assignment ids saved, mark all assignments as seen
		if (seenAssignmentIDs.size === 0) {
			gradebookState.gradebookCatalog.recordCache
				.filter((record) => record !== undefined)
				.flatMap((record) => parseGradebookXML(record.xml).Courses.Course)
				.map((course) => course.Marks?.Mark[0]?.Assignments?.Assignment)
				.filter((assignments) => assignments !== undefined)
				.flat()
				.forEach((assignment) => seenAssignmentIDs.add(assignment._GradebookID));

			saveSeenAssignmentsToLocalStorage(seenAssignmentIDs);
		}

		const refreshSelectedPeriod = async () => {
			const { overrideIndex } = catalog;
			const selectedIndex = overrideIndex ?? catalog.defaultIndex;
			const canDeltaRefresh = !fresh && catalog.recordCache[selectedIndex]?.detailed !== false;
			const forceRefresh = fresh && fromCache;
			if (overrideIndex !== undefined) {
				try {
					// Assignment data is required for "new" markers, what-if tools, and
					// chart estimates anchored to the official mark. A
					// summary response deliberately omits it, so it must never replace the
					// selected period during normal refresh/reload.
					await switchReportPeriod({
						overrideIndex,
						delta: canDeltaRefresh,
						forceRefresh,
						fresh: fresh && fromCache,
						silent: fresh
					});
				} catch (error) {
					// Recovery must complete for the selected period. A temporary failure
					// must not replace its saved context with another quarter's grades.
					if (fresh) throw error;
					console.error(
						`Error loading override report period ${overrideIndex}; reverting to default`,
						error
					);
					toast.error(
						`Failed to load grades from ${getReportPeriodName(overrideIndex)}; loading default period instead`,
						{ description: error instanceof Error ? error.message : String(error), duration: 6000 }
					);
					await switchReportPeriod({
						delta: canDeltaRefresh,
						forceRefresh,
						fresh: fresh && fromCache,
						silent: fresh
					});
				}
			} else {
				await switchReportPeriod({
					delta: canDeltaRefresh,
					forceRefresh,
					fresh: fresh && fromCache,
					silent: fresh
				});
			}
			gradebookState.version += 1;
		};

		const hydrateSelectedPeriod = () => {
			const selectedIndex = catalog.overrideIndex ?? catalog.defaultIndex;
			// The first portal response can be a verified header-only snapshot. It is
			// enough to show official course grades quickly, but never enough for
			// assignment markers, what-if calculations, or chart estimates. Hydrate the
			// same period after first paint instead of making the login wait for every
			// mutable class-focus request.
			if (catalog.recordCache[selectedIndex]?.detailed !== false) return;
			void switchReportPeriod({
				overrideIndex: catalog.overrideIndex,
				forceRefresh: true,
				silent: true
			}).catch((error) => {
				if (generation !== catalogGeneration) return;
				// Keep the official summary usable if the slower detail pass is
				// temporarily unavailable. The shared outage UI will offer retry.
				console.error('Error hydrating gradebook assignment details:', error);
				gradebookState.loadingError = error;
				gradebookState.version += 1;
			});
		};

		if (canRenderImmediately && !fresh) {
			// Stale-while-revalidate: make saved grades usable in the current frame and
			// let a slow district portal refresh them without blocking the whole screen.
			void refreshSelectedPeriod()
				.then(hydrateSelectedPeriod)
				.catch((error) => {
					if (generation !== catalogGeneration) return;
					console.error('Error refreshing grades:', error);
					gradebookState.loadingError = error;
					gradebookState.version += 1;
				});
		} else {
			await refreshSelectedPeriod();
			hydrateSelectedPeriod();
		}
	} catch (error) {
		if (generation !== catalogGeneration) return;
		console.error('Error loading grades:', error);
		gradebookState.loadingError = error;
		initializationPromise = undefined;
		gradebookState.version += 1;
	}
}
