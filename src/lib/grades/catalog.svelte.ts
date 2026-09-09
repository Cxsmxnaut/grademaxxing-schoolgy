import { LocalStorageKey } from '$lib';
import { acc, loadStudentAccount } from '$lib/account.svelte';
import { parseGradebookXML, StudentVueSessionExpiredError } from '$lib/synergy';
import { toast } from 'svelte-sonner';
import {
	cacheGradebookRecord,
	getGradebookCatalogFromLocalStorage,
	getGradebookRecord,
	getInitialGradebookCatalog,
	gradebookRefreshNeeded,
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
	silent,
	summary = false
}: {
	overrideIndex?: number;
	forceRefresh?: boolean;
	silent?: boolean;
	summary?: boolean;
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
		if (forceRefresh || !record || gradebookRefreshNeeded(record)) {
			const gradebookRecord = await getGradebookRecord(() => {
				if (requestID !== requestSequence || gradebookState.gradebookCatalog !== catalog) return;
				catalog.receivingData = true;
				gradebookState.version += 1;
			}, overrideIndex, summary);
			// A newer request owns the screen. Do not let this response overwrite it.
			if (requestID !== requestSequence) return;

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

	return lsCache ?? (await getInitialGradebookCatalog());
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

async function initializeGradebookCatalogOnce() {
	const generation = catalogGeneration;
	try {
		loadStudentAccount();
		// Protected routes may render for one frame while the layout redirects a signed-out
		// visitor. That is an expected navigation state, not a gradebook failure.
		if (!acc.studentAccount) return;

		const loadedCatalog = await getGradebookCatalog();
		if (generation !== catalogGeneration) return;
		gradebookState.gradebookCatalog = loadedCatalog;
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
			if (overrideIndex !== undefined) {
				try {
					// Assignment data is required for trend charts and "new" markers. A
					// summary response deliberately omits it, so it must never replace the
					// selected period during normal refresh/reload.
					await switchReportPeriod({ overrideIndex });
				} catch (error) {
					console.error(
						`Error loading override report period ${overrideIndex}; reverting to default`,
						error
					);
					toast.error(
						`Failed to load grades from ${getReportPeriodName(overrideIndex)}; loading default period instead`,
						{ description: error instanceof Error ? error.message : String(error), duration: 6000 }
					);
					await switchReportPeriod();
				}
			} else {
				await switchReportPeriod();
			}
			gradebookState.version += 1;
		};

		if (canRenderImmediately) {
			// Stale-while-revalidate: make saved grades usable in the current frame and
			// let a slow district portal refresh them without blocking the whole screen.
			void refreshSelectedPeriod().catch((error) => {
				if (generation !== catalogGeneration) return;
				console.error('Error refreshing grades:', error);
				gradebookState.loadingError = error;
				gradebookState.version += 1;
			});
		} else {
			await refreshSelectedPeriod();
		}
	} catch (error) {
		if (generation !== catalogGeneration) return;
		console.error('Error loading grades:', error);
		gradebookState.loadingError = error;
		initializationPromise = undefined;
		gradebookState.version += 1;
	}
}
