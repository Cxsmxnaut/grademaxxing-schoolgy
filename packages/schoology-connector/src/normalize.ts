import { SchoologyError } from './errors.js';
import { record, records } from './transport.js';
import type {
	CourseGradebook,
	GradebookAssignment,
	GradebookPeriod,
	GradingCategory,
	RawRecord
} from './types.js';

export function numeric(value: unknown): number | null {
	if (typeof value !== 'number' && typeof value !== 'string') return null;
	if (typeof value === 'string' && !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim()))
		return null;
	const number = Number(value);
	return Number.isFinite(number) ? number : null;
}
const text = (value: unknown): string | null =>
	typeof value === 'string' || typeof value === 'number' ? String(value) : null;
const rawGrade = (value: unknown): number | string | null =>
	typeof value === 'number' || (typeof value === 'string' && value !== '') ? value : null;
const periodId = (value: unknown): string => (text(value) ?? '0').replace(/^p(?=\d+$)/, '');
const itemKey = (id: unknown, type: unknown): string =>
	`${text(type) ?? 'assignment'}:${text(id) ?? ''}`;
function assignment(grade: RawRecord, meta?: RawRecord): GradebookAssignment {
	const id = text(grade.assignment_id ?? grade.id ?? meta?.id);
	if (!id) throw new SchoologyError('RESPONSE', 'Grade item is missing its ID.');
	const exception = numeric(grade.exception);
	const value = rawGrade(grade.grade);
	const score = numeric(value);
	const status =
		exception === 1
			? 'excused'
			: exception === 2
				? 'incomplete'
				: exception !== null && exception !== 0
					? 'unknown'
					: score !== null
						? 'graded'
						: value === null
							? 'ungraded'
							: 'unknown';
	const timestamp = numeric(grade.timestamp);
	const date = timestamp === null ? null : new Date(timestamp * 1000);
	const factor = numeric(meta?.factor);
	return {
		id,
		type: text(grade.type ?? meta?.type) ?? 'assignment',
		title: text(meta?.title),
		categoryId: text(grade.category_id ?? meta?.grading_category),
		score: status === 'graded' ? score : null,
		rawGrade: value,
		maxPoints: numeric(grade.max_points ?? meta?.max_points),
		factor: factor ?? 1,
		status,
		exception,
		dueAt: text(meta?.due),
		updatedAt: date && Number.isFinite(date.getTime()) ? date.toISOString() : null,
		isFinal: numeric(grade.is_final ?? meta?.is_final) === 1
	};
}
function category(raw: RawRecord): GradingCategory {
	const id = text(raw.id ?? raw.category_id);
	if (id === null) throw new SchoologyError('RESPONSE', 'Grading category is missing its ID.');
	const calculation = numeric(raw.calculation_type);
	return {
		id,
		title: text(raw.title) ?? id,
		weight: numeric(raw.weight),
		calculation: calculation === 1 ? 'percent' : calculation === 2 ? 'points' : null,
		dropLowest: numeric(raw.drop_lowest)
	};
}

/** Merges a section repeated across enrollment-paginated user-grade responses. */
export function normalizeCourse(
	section: RawRecord,
	gradePages: RawRecord[],
	metadata: RawRecord[] = [],
	categoryMetadata: RawRecord[] = []
): CourseGradebook {
	const id = text(section.id ?? gradePages[0]?.section_id);
	if (!id) throw new SchoologyError('RESPONSE', 'Course section is missing its ID.');
	const meta = new Map(metadata.map((item) => [itemKey(item.id, item.type), item]));
	const periods = new Map<string, GradebookPeriod>();
	const categories = new Map<string, GradingCategory>();
	const getPeriod = (id: string, title?: unknown): GradebookPeriod => {
		let period = periods.get(id);
		if (!period) {
			period = { id, title: text(title) ?? id, officialGrade: null, assignments: [] };
			periods.set(id, period);
		} else if (title != null) period.title = text(title) ?? period.title;
		return period;
	};
	for (const page of gradePages) {
		for (const item of records(page.grading_category)) {
			const normalized = category(item);
			categories.set(normalized.id, normalized);
		}
		for (const raw of records(page.period)) {
			const period = getPeriod(periodId(raw.period_id), raw.period_title);
			for (const grade of records(raw.assignment)) {
				const normalized = assignment(grade, meta.get(itemKey(grade.assignment_id, grade.type)));
				const index = period.assignments.findIndex(
					(item) => item.id === normalized.id && item.type === normalized.type
				);
				if (index === -1) period.assignments.push(normalized);
				else period.assignments[index] = normalized;
			}
		}
		for (const raw of records(page.final_grade))
			getPeriod(periodId(raw.period_id)).officialGrade = rawGrade(raw.grade);
	}
	for (const raw of metadata) {
		const period = getPeriod(periodId(raw.grading_period));
		const normalized = assignment({ id: raw.id, type: raw.type }, raw);
		if (
			!period.assignments.some((item) => item.id === normalized.id && item.type === normalized.type)
		)
			period.assignments.push(normalized);
	}
	for (const raw of categoryMetadata) {
		const normalized = category(raw);
		categories.set(normalized.id, normalized);
	}
	const options = section.options == null ? {} : record(section.options);
	const weighted = numeric(options.weighted_grading_categories);
	return {
		id,
		title: text(section.course_title ?? section.title) ?? id,
		sectionTitle: text(section.section_title) ?? '',
		weightedCategories: weighted === 1 ? true : weighted === 0 ? false : null,
		categories: [...categories.values()],
		periods: [...periods.values()]
	};
}
