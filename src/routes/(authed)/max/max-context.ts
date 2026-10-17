import { acc } from '$lib/account.svelte';
import {
	getReportPeriodName,
	gradebookState,
	initializeGradebookCatalog
} from '$lib/grades/catalog.svelte';
import { getActiveGradebook } from '$lib/grades/gradebook';
import { buildMaxContextFromRecords } from '$lib/max/app-context';
import { LocalStorageKey } from '$lib/storage/keys';
import {
	attendanceState,
	loadAttendance,
	loadSchedule,
	scheduleState
} from '../attendance/attendance.svelte';
import { loadStudentInfo, studentInfoState } from '../studentinfo/studentInfo.svelte';

let loading: Promise<void> | undefined;

/** Reuse the same caches/loaders as the app; never make the model retrieve portal records. */
export function loadMaxAppData() {
	if (loading) return loading;
	loading = (async () => {
		await initializeGradebookCatalog();
		const expired = (time: number | undefined, ttl: number) =>
			time !== undefined && Date.now() - time > ttl;
		await Promise.all([
			loadStudentInfo(expired(studentInfoState.lastRefresh, 30 * 24 * 60 * 60 * 1000)),
			loadAttendance(expired(attendanceState.lastRefresh, 60 * 60 * 1000)),
			loadSchedule(expired(scheduleState.lastRefresh, 30 * 60 * 1000))
		]);
	})().finally(() => {
		loading = undefined;
	});
	return loading;
}

export function buildMaxStudentContext(query = '', maximumBytes = 16 * 1024) {
	void gradebookState.version;
	if (!acc.studentAccount) return null;
	const catalog = gradebookState.gradebookCatalog;
	const index = catalog ? (catalog.overrideIndex ?? catalog.defaultIndex) : undefined;
	const record = index === undefined ? undefined : catalog?.recordCache[index];
	return buildMaxContextFromRecords(
		{
			gradebook: getActiveGradebook(),
			reportingPeriod: index === undefined ? '' : getReportPeriodName(index),
			gradebookAsOf: record?.lastRefresh,
			gradebookError: gradebookState.loadingError !== undefined,
			assignmentDetailsAvailable: !!record && record.detailed !== false,
			gradeLevel: studentInfoState.data?.Grade ?? undefined,
			attendance: attendanceState.data,
			attendanceAsOf: attendanceState.lastRefresh,
			attendanceError: !!attendanceState.error,
			schedule: scheduleState.data,
			scheduleAsOf: scheduleState.lastRefresh,
			scheduleError: !!scheduleState.error
		},
		query,
		maximumBytes
	);
}

/** Receipt capabilities go only to our server, never into model context/history. */
export function maxFeedbackReceipts() {
	try {
		const items: unknown = JSON.parse(
			localStorage.getItem(LocalStorageKey.feedbackReceipts) ?? '[]'
		);
		return Array.isArray(items)
			? items
					.slice(0, 20)
					.flatMap((item) =>
						typeof item?.id === 'string' &&
						/^[0-9a-f-]{36}$/i.test(item.id) &&
						typeof item?.replyToken === 'string' &&
						/^[A-Za-z0-9_-]{43}$/.test(item.replyToken)
							? [{ id: item.id, replyToken: item.replyToken }]
							: []
					)
			: [];
	} catch {
		return [];
	}
}
