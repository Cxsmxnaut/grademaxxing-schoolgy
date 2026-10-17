import { getReportPeriodName, gradebookState } from '$lib/grades/catalog.svelte';
import { removeCourseType } from '$lib/grades/course-name';
import { getActiveGradebook } from '$lib/grades/gradebook';

/**
 * Builds the compact, non-identifying grade summary that the Max AI tab sends
 * along with each question (the "active screen context" the Max engine
 * packages into its prompt). Deliberately excludes student name, ID, photo,
 * staff names, and anything else identifying — only course titles, marks and
 * data freshness.
 */

export interface MaxCourseContext {
	course: string;
	markName: string;
	/** letter/score string exactly as reported */
	letter: string;
	/** parsed percentage, or null when the mark carries no numeric score */
	percent: number | null;
}

export interface MaxStudentContext {
	screen: 'max-ai';
	reportingPeriod: string;
	/** ISO timestamp of the cached gradebook data, when known */
	dataAsOf: string | null;
	courses: MaxCourseContext[];
	officialValuesNote: string;
}

const OFFICIAL_VALUES_NOTE =
	'These are official StudentVUE values. Any projected or what-if numbers Max derives are estimates, not official grades.';

export function buildMaxStudentContext(): MaxStudentContext | null {
	// Touch the state version so reactive callers re-derive when grades change.
	void gradebookState.version;
	const gradebook = getActiveGradebook();
	const catalog = gradebookState.gradebookCatalog;
	if (!gradebook || !catalog) return null;

	const index = catalog.overrideIndex ?? catalog.defaultIndex;
	const lastRefresh = catalog.recordCache[index]?.lastRefresh;

	const courses: MaxCourseContext[] = (gradebook.Courses?.Course ?? []).map((course) => {
		const mark = course.Marks?.Mark[0];
		const rawPercent = mark?._CalculatedScoreRaw;
		const parsed = rawPercent === undefined ? Number.NaN : Number.parseFloat(rawPercent);
		return {
			course: removeCourseType(course._CourseName),
			markName: mark?._MarkName ?? '',
			letter: mark?._CalculatedScoreString ?? '',
			percent: Number.isFinite(parsed) ? parsed : null
		};
	});

	return {
		screen: 'max-ai',
		reportingPeriod: getReportPeriodName(index),
		dataAsOf: lastRefresh === undefined ? null : new Date(lastRefresh).toISOString(),
		courses,
		officialValuesNote: OFFICIAL_VALUES_NOTE
	};
}
