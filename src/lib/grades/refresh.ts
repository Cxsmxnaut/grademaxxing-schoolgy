import type { ReportPeriod } from '$lib/contracts/studentvue/gradebook';
import { parseGradebookXML } from '$lib/synergy';
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

/**
 * Compare only the fields available from a fast gradebook response. Assignment
 * detail is intentionally excluded so a cached detailed record can be reused
 * when the official course marks have not changed.
 */
export function gradebookSummaryMatches(cachedXml: string, summaryXml: string) {
	try {
		const cached = parseGradebookXML(cachedXml);
		const summary = parseGradebookXML(summaryXml);
		if (cached.ReportingPeriod._Index !== summary.ReportingPeriod._Index) return false;

		const courseSummary = (course: (typeof cached.Courses.Course)[number]) => {
			const mark = course.Marks?.Mark?.[0];
			return {
				courseID: course._CourseID,
				courseName: course._CourseName,
				period: course._Period,
				score: mark?._CalculatedScoreString ?? '',
				scoreRaw: mark?._CalculatedScoreRaw ?? ''
			};
		};

		const normalize = (courses: typeof cached.Courses.Course) =>
			courses
				.map(courseSummary)
				.sort((left, right) =>
					`${left.courseID}:${left.period}`.localeCompare(`${right.courseID}:${right.period}`)
				);

		const cachedCourses = normalize(cached.Courses.Course);
		const summaryCourses = normalize(summary.Courses.Course);
		if (cachedCourses.length !== summaryCourses.length) return false;

		return cachedCourses.every((cachedCourse, index) => {
			const summaryCourse = summaryCourses[index];
			if (!summaryCourse) return false;
			return (
				cachedCourse.courseID === summaryCourse.courseID &&
				cachedCourse.courseName === summaryCourse.courseName &&
				cachedCourse.period === summaryCourse.period &&
				gradeValuesMatch(cachedCourse.score, summaryCourse.score) &&
				// StudentVUE sometimes omits the raw percentage from the fast response.
				// The displayed mark is authoritative; compare raw percentages only when
				// both responses actually provide one.
				(!cachedCourse.scoreRaw ||
					!summaryCourse.scoreRaw ||
					gradeValuesMatch(cachedCourse.scoreRaw, summaryCourse.scoreRaw))
			);
		});
	} catch {
		// A malformed response must take the safe path and fetch complete details.
		return false;
	}
}

function gradeValuesMatch(left: string, right: string) {
	const normalizedLeft = left.trim().replace(/\s+/g, ' ').toLowerCase();
	const normalizedRight = right.trim().replace(/\s+/g, ' ').toLowerCase();
	if (normalizedLeft === normalizedRight) return true;

	const numericLeft = Number.parseFloat(normalizedLeft.replace(/%$/, ''));
	const numericRight = Number.parseFloat(normalizedRight.replace(/%$/, ''));
	return Number.isFinite(numericLeft) && Number.isFinite(numericRight)
		? numericLeft === numericRight
		: false;
}

export function getGradebookCacheOwnerFor(account?: { domain: string; userID: string }) {
	if (!account) return undefined;
	return `${account.domain.trim().toLowerCase()}\n${account.userID.trim().toLowerCase()}`;
}
