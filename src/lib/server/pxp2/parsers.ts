import { load } from 'cheerio';
import { Buffer } from 'node:buffer';
import { Pxp2InputError } from './errors';
import type {
	ClassData,
	CourseContentItem,
	CourseFocus,
	GradebookContext,
	GradebookContextPeriod,
	GradingPeriod,
	PortalDocument,
	PortalGradeCategory
} from './types';

export function text(value: unknown) {
	return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}
export function identifier(value: unknown) {
	return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

export function normalizeGradebookContext(value: unknown): GradebookContext | undefined {
	if (!value || typeof value !== 'object') return undefined;
	const candidate = value as Partial<GradebookContext>;
	if (
		typeof candidate.AGU !== 'string' ||
		candidate.AGU.length === 0 ||
		candidate.AGU.length > 1024 ||
		!Array.isArray(candidate.periods) ||
		candidate.periods.length === 0 ||
		candidate.periods.length > 100
	)
		return undefined;
	const periods = candidate.periods.map((value) => {
		if (!value || typeof value !== 'object') return undefined;
		const period = value as Partial<GradebookContextPeriod>;
		const required = [period.GU, period.OrgYearGU, period.schoolID, period.GroupName, period.Name];
		if (
			!required.every((item) => typeof item === 'string' && item.length <= 1024) ||
			(period.markPeriodGU !== undefined &&
				(typeof period.markPeriodGU !== 'string' || period.markPeriodGU.length > 1024))
		)
			return undefined;
		return {
			GU: period.GU!,
			OrgYearGU: period.OrgYearGU!,
			schoolID: period.schoolID!,
			GroupName: period.GroupName!,
			Name: period.Name!,
			...(period.markPeriodGU ? { markPeriodGU: period.markPeriodGU } : {}),
			defaultFocus: period.defaultFocus === true
		};
	});
	return periods.every((period): period is GradebookContextPeriod => Boolean(period))
		? { AGU: candidate.AGU, periods }
		: undefined;
}

export function buildGradebookContext(
	focusArgs: Record<string, unknown>,
	periods: GradingPeriod[]
): GradebookContext | undefined {
	const AGU = identifier(focusArgs.AGU);
	if (!AGU) return undefined;
	const contextPeriods = periods.flatMap((period) => {
		const GU = identifier(period.GU);
		const OrgYearGU = identifier(period.OrgYearGU);
		const schoolID = identifier(period.schoolID);
		if (!GU || !OrgYearGU || !schoolID) return [];
		const markPeriodGU = identifier(period.MarkPeriods?.[0]?.GU);
		return [
			{
				GU,
				OrgYearGU,
				schoolID,
				GroupName: text(period.GroupName),
				Name: text(period.Name),
				...(markPeriodGU ? { markPeriodGU } : {}),
				defaultFocus: period.defaultFocus === true
			}
		];
	});
	return normalizeGradebookContext({ AGU, periods: contextPeriods });
}

export function numericText(value: unknown) {
	return identifier(value).match(/-?\d+(?:\.\d+)?/)?.[0] ?? '';
}
export function gradeLetter(value: string) {
	const normalized = value.trim();
	if (!normalized || /^(?:N\/?A|N\.A\.|--|—)$/i.test(normalized)) return '';
	return normalized.match(/\b[A-F][+-]?(?![A-Z])/i)?.[0] ?? '';
}

export function gradeCategories(classData: ClassData): PortalGradeCategory[] {
	if (classData.isAssignmentWeightingOn !== true) return [];
	const names = new Map(
		(classData.measureTypes ?? []).map((measureType) => [
			identifier(measureType.id),
			text(measureType.name)
		])
	);
	return (classData.measureTypeGrades ?? []).flatMap((grade) => {
		const name = names.get(identifier(grade.measureTypeId));
		const weight = numericText(grade.measureTypeWeight);
		const points = numericText(grade.points);
		const pointsPossible = numericText(grade.pointsPossible);
		if (!name || !weight || !points || !pointsPossible) return [];
		const weightedPercentage =
			Number(pointsPossible) === 0
				? '0'
				: String((Number(points) / Number(pointsPossible)) * Number(weight));
		return [
			{
				name,
				weight,
				points,
				pointsPossible,
				weightedPercentage,
				calculatedMark: text(grade.calculatedMark)
			}
		];
	});
}

export function assignmentCategories(classData: ClassData) {
	const names = new Map(
		(classData.measureTypes ?? []).map((measureType) => [
			identifier(measureType.id),
			text(measureType.name)
		])
	);
	return new Map(
		(classData.assignments ?? []).flatMap((assignment) => {
			const assignmentId = identifier(assignment.gradeBookId);
			const category = names.get(identifier(assignment.measureTypeId));
			return assignmentId && category ? [[assignmentId, category] as const] : [];
		})
	);
}

/** The class data endpoint lists graded assignment IDs even when a rendered grid omits rows. */
export function missingGradedAssignmentIds(
	classData: ClassData,
	visibleAssignments: Array<Record<string, string>>
) {
	const visibleIds = new Set(visibleAssignments.map((assignment) => assignment.AssignmentID));
	return [
		...new Set(
			(classData.assignments ?? []).flatMap((assignment) => {
				const id = identifier(assignment.gradeBookId);
				const score = identifier(assignment.score);
				return id && score && !visibleIds.has(id) ? [id] : [];
			})
		)
	];
}
export function escapeRegExp(value: string) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
export function decodeHtml(value: string) {
	return value
		.replace(/&#x([0-9a-f]+);/gi, (_, digits: string) =>
			String.fromCodePoint(Number.parseInt(digits, 16))
		)
		.replace(/&#(\d+);/g, (_, digits: string) => String.fromCodePoint(Number(digits)))
		.replace(/&quot;/g, '"')
		.replace(/&#39;|&apos;/g, "'")
		.replace(/&nbsp;/g, '\u00a0')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&amp;/g, '&');
}
function stripHtml(value: string) {
	return decodeHtml(
		value
			.replace(/<[^>]*>/g, ' ')
			.replace(/\s+/g, ' ')
			.trim()
	);
}

export function elementInnerHtml(html: string, id: string) {
	const open = new RegExp(`<([a-z][a-z0-9]*)[^>]*id=["']${escapeRegExp(id)}["'][^>]*>`, 'i').exec(
		html
	);
	if (!open) return undefined;
	const close = html.toLowerCase().lastIndexOf(`</${open[1]!.toLowerCase()}>`);
	const start = open.index + open[0].length;
	return close >= start ? html.slice(start, close) : undefined;
}

export function jsonAssignment(html: string, variable: string): unknown {
	const marker = `${variable} = `;
	const start = html.indexOf(marker);
	const jsonStart = start + marker.length;
	if (start < 0 || html[jsonStart] !== '{') return undefined;
	let depth = 0,
		inString = false,
		escaped = false;
	for (let index = jsonStart; index < html.length; index += 1) {
		const char = html[index];
		if (inString) {
			if (escaped) escaped = false;
			else if (char === '\\') escaped = true;
			else if (char === '"') inString = false;
			continue;
		}
		if (char === '"') inString = true;
		else if (char === '{') depth += 1;
		else if (char === '}' && --depth === 0) {
			try {
				return JSON.parse(html.slice(jsonStart, index + 1));
			} catch {
				return undefined;
			}
		}
	}
}

export function extractCourseHeaders(html: string) {
	const output = new Map<
		string,
		{ title: string; period: string; room: string; score: string; missing: string }
	>();
	const $ = load(html);
	$('.gb-class-header').each((_index, header) => {
		const details = $(header).next('.gb-class-row');
		const classId = details.attr('data-guid')?.trim();
		if (!classId) return;
		const titleText = $(header).find('.course-title').first().text().replace(/\s+/g, ' ').trim();
		const headerText = $(header).text();
		output.set(classId, {
			title: titleText.replace(/^\d+:\s*/, ''),
			period: titleText.match(/^(\d+):/)?.[1] ?? '',
			room: headerText.match(/Room:\s*([^\n]+)/i)?.[1]?.trim() ?? '',
			score: details.find('.mark').first().text().replace(/\s+/g, ' ').trim(),
			missing: details.text().match(/(\d+)\s+Missing Assignments/i)?.[1] ?? '0'
		});
	});
	return output;
}

export function normalizeCourseTitle(value: string) {
	return value.replace(/\s+/g, ' ').trim().toLocaleLowerCase();
}

export function tableFields(html: string) {
	const fields: Record<string, string> = {};
	for (const match of html.matchAll(
		/<[^>]*class=["'][^"']*tbl_label[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>([\s\S]*?)<\/t[dr]>/gi
	)) {
		const key = stripHtml(match[1] ?? '').replace(/:\s*$/, '');
		const value = stripHtml(match[2] ?? '');
		if (key && value) fields[key] = value;
	}
	return fields;
}

export function attendanceCourseRecords(html: string) {
	const $ = load(html);
	const table = $(
		'#attendance-by-course > .detail-grid > .school-detail > table.table-striped'
	).first();
	if (!table.length) return [];
	const rows = table.children('tbody').first().children('tr').toArray();
	const courses: Array<{
		course: string;
		totals: Record<string, number>;
		events: Array<Record<string, string>>;
	}> = [];
	for (let index = 0; index < rows.length; index += 1) {
		const row = $(rows[index]!);
		if (row.hasClass('empty-row') || row.hasClass('att-course-details')) continue;
		const cells = row
			.children('td')
			.toArray()
			.map((cell) => $(cell).text().replace(/\s+/g, ' ').trim());
		if (cells.length < 7 || !cells[1]) continue;
		const detailRow = row.next('tr.att-course-details');
		const events = detailRow
			.find('table tbody tr')
			.toArray()
			.flatMap((eventRow) => {
				const values = $(eventRow)
					.children('td')
					.toArray()
					.map((cell) => $(cell).text().replace(/\s+/g, ' ').trim());
				if (values.length < 5 || !portalDate(values[0] ?? '')) return [];
				return [
					{
						date: portalDate(values[0]!),
						startTime: values[1] ?? '',
						endTime: values[2] ?? '',
						absence: values[3] ?? '',
						reason: values[4] ?? ''
					}
				];
			});
		courses.push({
			course: cells[1],
			totals: {
				present: Number(cells[2]) || 0,
				tardy: Number(cells[3]) || 0,
				absent: Number(cells[4]) || 0,
				excused: Number(cells[5]) || 0,
				unexcused: Number(cells[6]) || 0
			},
			events
		});
	}
	return courses;
}

export function attendancePeriodRecords(html: string) {
	const $ = load(html);
	const table = $(
		'#attendance-by-period > .detail-grid > .school-detail > table.table-striped'
	).first();
	if (!table.length) return [];
	const rows = table.children('tbody').first().children('tr').toArray();
	const periods: Array<{
		period: string;
		startTime: string;
		endTime: string;
		totals: Record<string, number>;
		events: Array<Record<string, string>>;
	}> = [];
	for (const rowElement of rows) {
		const row = $(rowElement);
		if (row.hasClass('empty-row') || row.hasClass('att-course-details')) continue;
		const cells = row
			.children('td')
			.toArray()
			.map((cell) => $(cell).text().replace(/\s+/g, ' ').trim());
		if (cells.length < 8 || !cells[1]) continue;
		const detailRow = row.next('tr.att-course-details');
		const events = detailRow
			.find('table tbody tr')
			.toArray()
			.flatMap((eventRow) => {
				const values = $(eventRow)
					.children('td')
					.toArray()
					.map((cell) => $(cell).text().replace(/\s+/g, ' ').trim());
				if (values.length < 3 || !portalDate(values[0] ?? '')) return [];
				return [
					{
						date: portalDate(values[0]!),
						absence: values[1] ?? '',
						reason: values[2] ?? ''
					}
				];
			});
		periods.push({
			period: cells[1],
			startTime: cells[2] ?? '',
			endTime: cells[3] ?? '',
			totals: {
				tardy: Number(cells[4]) || 0,
				absent: Number(cells[5]) || 0,
				excused: Number(cells[6]) || 0,
				unexcused: Number(cells[7]) || 0
			},
			events
		});
	}
	return periods;
}

export function attendanceDays(data: Record<string, unknown> | undefined) {
	const attendanceData = data?.attendanceData as Record<string, unknown> | undefined;
	const calendar = attendanceData?.Calendar as Record<string, unknown> | undefined;
	const entries = calendar?.attData;
	if (!Array.isArray(entries))
		throw new Error('StudentVUE did not provide structured attendance data.');
	const start = mdyDate(text(calendar?.startDate));
	if (!start) throw new Error('StudentVUE returned an invalid attendance start date.');
	return entries.map((raw, index) => {
		const entry = raw as Record<string, unknown>;
		const date = new Date(start);
		date.setDate(start.getDate() + index);
		return {
			date: date.toISOString().slice(0, 10),
			type: identifier(entry.Type),
			reason: text(entry.Reason),
			holidayType: text(entry.HolType),
			pending: Boolean(entry.Pending)
		};
	});
}

export function courseFocuses(html: string): CourseFocus[] {
	const output = new Map<string, CourseFocus>();
	const $ = load(html);
	$('.course-title[data-focus]').each((_index, element) => {
		const encoded = $(element).attr('data-focus');
		if (!encoded) return;
		try {
			const parsed = JSON.parse(decodeHtml(encoded)) as {
				LoadParams?: { ControlName?: unknown };
				FocusArgs?: unknown;
			};
			if (
				typeof parsed.LoadParams?.ControlName === 'string' &&
				parsed.FocusArgs &&
				typeof parsed.FocusArgs === 'object'
			) {
				const parameters = parsed.FocusArgs as Record<string, unknown>;
				const courseId = identifier(parameters.classID);
				if (courseId)
					output.set(courseId, { courseId, control: parsed.LoadParams.ControlName, parameters });
			}
		} catch {
			// Ignore malformed portal markup; it should not block every course.
		}
	});
	return [...output.values()];
}

export function flattenCourseItems(items: unknown[]): CourseContentItem[] {
	const output: CourseContentItem[] = [];
	for (const item of items) {
		if (!item || typeof item !== 'object') continue;
		const record = item as Record<string, unknown>;
		if (Array.isArray(record.items)) output.push(...flattenCourseItems(record.items));
		else if (identifier(record.itemID) && text(record.title))
			output.push(record as CourseContentItem);
	}
	return output;
}

export function courseAssignment(
	item: CourseContentItem,
	categoriesByAssignment: Map<string, string>
): Record<string, string> {
	const score = text(item.gradeMark);
	const possible = text(item.pointsPossible);
	const portalPoints = text(item.points);
	const scorePair = /^\s*-?\d+(?:\.\d+)?\s*$/.test(score) ? pointPair(score, possible) : '';
	const points = /^\s*-?\d+(?:\.\d+)?\s*\/\s*-?\d+(?:\.\d+)?\s*$/.test(portalPoints)
		? portalPoints
		: scorePair || portalPoints;
	const rawPair = /^\s*(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)\s*$/.exec(scorePair);
	const assignmentId = identifier(item.itemID);
	const dueDate = portalDate(text(item.due_date));
	const assignedDate = portalDate(text(item.date)) || dueDate;
	return {
		AssignmentID: assignmentId,
		Measure: text(item.title),
		Type: categoriesByAssignment.get(assignmentId) || text(item.assignmentType),
		Date: assignedDate,
		DueDate: dueDate || assignedDate,
		Score: score,
		ScoreType: 'Raw Score',
		Points: points,
		...(rawPair ? { ScoreCalValue: rawPair[1]!, ScoreMaxValue: rawPair[2]! } : {}),
		Notes: [text(item.commentText), text(item.publicNote)].filter(Boolean).join(' — '),
		Description: text(item.publicNote)
	};
}

/** Parse a modern Gradebook_AssignmentDetails fragment into the legacy assignment contract. */
export function parseGradebookAssignmentDetail(
	html: string,
	assignmentId: string
): Record<string, string> | undefined {
	const $ = load(html);
	const values: Record<string, string> = {};
	$('.info_tbl td').each((_index, cell) => {
		const label = $(cell).find('.tbl_label').first().text().replace(/:\s*$/, '').trim();
		const value = $(cell).find('.tbl_value').first().text().replace(/\s+/g, ' ').trim();
		if (label) values[label] = value;
	});
	const measure = values.Assignment ?? '';
	const date = portalDate(values.Date ?? values['Due Date'] ?? '');
	if (!measure || !date) return undefined;
	return {
		AssignmentID: assignmentId,
		Measure: measure,
		Type: values['Assignment Type'] ?? '',
		Date: date,
		DueDate: portalDate(values['Due Date'] ?? '') || date,
		Score: values.Score ?? '',
		ScoreType: values['Score Type'] ?? 'Raw Score',
		Points: values.Points ?? pointPair(values.Score, values.Points),
		Notes: values.Notes ?? '',
		Description: values.Description ?? ''
	};
}

const assignmentGridKeys = ['GBAssignment', 'GBPoints', 'GradebookID', 'Measure'];
const categoryGridKeys = [
	'CategoryName',
	'Category',
	'Weight',
	'WeightPercentage',
	'CategoryWeight',
	'WeightedPct',
	'CalculatedMark'
];

/** Parse the complete modern Gradebook_ClassDetails fragment. Exported for fixtures. */
export function parseGradebookClassDetail(html: string) {
	const gradeAnchor = html.indexOf('current-grade');
	const gradeSection = gradeAnchor < 0 ? '' : html.slice(gradeAnchor, gradeAnchor + 1200);
	const markText = stripHtml(
		/class=["']mark["'][^>]*>([\s\S]*?)<\//i.exec(gradeSection)?.[1] ?? ''
	);
	const letter = gradeLetter(markText);
	const displayedPercentage =
		/class=["']score["'][^>]*>\s*([-+]?\d+(?:\.\d+)?)\s*%/i.exec(gradeSection)?.[1] ?? '';
	const percentage =
		/^(?:N\/?A|N\.A\.|--|—)$/i.test(markText) && Number(displayedPercentage) === 0
			? ''
			: displayedPercentage;
	const split = html.indexOf('AssignmentsGrid');
	const categoryRows = findDataSourceWithKeys(
		split < 0 ? '' : html.slice(0, split),
		categoryGridKeys
	);
	const assignmentRows = findDataSourceWithKeys(
		split < 0 ? html : html.slice(split),
		assignmentGridKeys
	);
	const categories = categoryRows.flatMap(detailCategory);
	return {
		hasAssignmentGrid: split >= 0,
		letter,
		percentage,
		categories,
		assignments: reconcileAssignmentPoints(
			assignmentRows.map(detailAssignment).filter((assignment) => assignment.Date),
			categories,
			percentage
		)
	};
}

function detailCategory(row: Record<string, unknown>): PortalGradeCategory[] {
	const first = (...keys: string[]) => {
		for (const key of keys)
			if (row[key] !== undefined && row[key] !== null && row[key] !== '') return row[key];
	};
	const name = stripHtml(cellText(first('CategoryName', 'Category', 'Type')));
	const weight = numericText(cellText(first('Weight', 'WeightPercentage', 'CategoryWeight')));
	if (!name || !weight) return [];
	return [
		{
			name,
			weight,
			points: numericText(cellText(first('Points', 'PointsEarned'))),
			pointsPossible: numericText(cellText(first('PointsPossible', 'PointPossible'))),
			weightedPercentage: numericText(cellText(first('WeightedPct', 'WeightedPercentage'))),
			calculatedMark: stripHtml(cellText(first('CalculatedMark', 'Mark', 'Letter')))
		}
	];
}

function detailAssignment(row: Record<string, unknown>): Record<string, string> {
	if (!('GBAssignment' in row || 'GBPoints' in row)) {
		return Object.fromEntries(
			Object.entries(row).flatMap(([key, value]) => {
				const normalized = cellText(value);
				return normalized === '' ? [] : [[key, normalized]];
			})
		);
	}

	const assignmentCell = row.GBAssignment;
	const assignmentSource =
		typeof assignmentCell === 'string' ? assignmentCell : JSON.stringify(assignmentCell ?? '');
	const minedId = /["']assignmentID\\?["']\s*:\s*["']?(-?\d+)/i.exec(
		decodeHtml(assignmentSource)
	)?.[1];
	const id =
		cellText(row.gradeBookId ?? row.GBAssignmentID ?? row.GradebookID ?? row.AssignmentID) ||
		minedId ||
		'';
	const pointsText = stripHtml(cellText(row.GBPoints));
	const scoreText = stripHtml(cellText(row.GBScore));
	const fraction = /^(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)$/.exec(pointsText);
	const rawScore = /^(-?\d+(?:\.\d+)?)\s+out of\s+(-?\d+(?:\.\d+)?)$/i.exec(scoreText);
	const barePoints = /^-?\d+(?:\.\d+)?$/.test(pointsText);
	const bareScore = /^-?\d+(?:\.\d+)?$/.test(scoreText);
	let point = '';
	let pointPossible = '';
	if (fraction) {
		point = fraction[1]!;
		pointPossible = fraction[2]!;
	} else if (barePoints) {
		pointPossible = pointsText;
		if (bareScore) point = scoreText;
	}
	const rawDiffers = Boolean(
		rawScore &&
		(!fraction ||
			Number(rawScore[1]) !== Number(fraction[1]) ||
			Number(rawScore[2]) !== Number(fraction[2]))
	);
	return {
		AssignmentID: id,
		Measure: stripHtml(cellText(assignmentCell)),
		Type: stripHtml(cellText(row.GBAssignmentType ?? row.Type)),
		Date: portalDate(cellText(row.Date)),
		DueDate: portalDate(cellText(row.DueDate) || cellText(row.Date)),
		Score: scoreText,
		ScoreType: stripHtml(cellText(row.GBScoreType)) || 'Raw Score',
		Points: pointsText,
		...(point || fraction ? { Point: point } : {}),
		...(pointPossible ? { PointPossible: pointPossible } : {}),
		...(rawDiffers ? { ScoreCalValue: rawScore![1]!, ScoreMaxValue: rawScore![2]! } : {}),
		Notes: stripHtml(cellText(row.GBNotes)),
		Description: stripHtml(cellText(row.GBDescription ?? row.MeasureDescription))
	};
}

function pointRatiosAgree(earnedA: string, possibleA: string, earnedB: string, possibleB: string) {
	const a = Number(earnedA) / Number(possibleA);
	const b = Number(earnedB) / Number(possibleB);
	return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 0.01;
}

/**
 * Use the complete upstream class response as the source of truth. When its
 * displayed points and score disagree, the official category totals (or
 * official course mark for unweighted classes) resolve the ambiguity.
 */
export function reconcileAssignmentPoints(
	assignments: Array<Record<string, string>>,
	categories: PortalGradeCategory[],
	officialPercentage: string
) {
	const result = assignments.map((assignment) => ({ ...assignment }));
	const points = (assignment: Record<string, string>) => {
		const fraction = /^\s*(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)\s*$/.exec(
			assignment.Points ?? ''
		);
		const earned = assignment.Point ?? fraction?.[1];
		const possible = assignment.PointPossible ?? fraction?.[2];
		if (earned === undefined || possible === undefined || possible === '') return undefined;
		const parsed = { earned: Number(earned), possible: Number(possible) };
		return Number.isFinite(parsed.earned) && Number.isFinite(parsed.possible) && parsed.possible > 0
			? parsed
			: undefined;
	};
	const totals = (category?: string) =>
		result.reduce(
			(total, assignment) => {
				if (category !== undefined && assignment.Type !== category) return total;
				if (/^\s*\(\s*not\s+for\s+grading\s*\)/i.test(assignment.Notes ?? '')) return total;
				const pair = points(assignment);
				return pair
					? { earned: total.earned + pair.earned, possible: total.possible + pair.possible }
					: total;
			},
			{ earned: 0, possible: 0 }
		);

	for (const assignment of result) {
		const current = points(assignment);
		const scoreEarned = assignment.ScoreCalValue;
		const scorePossible = assignment.ScoreMaxValue;
		if (!current || !scoreEarned || !scorePossible) continue;
		const alternate = { earned: Number(scoreEarned), possible: Number(scorePossible) };
		if (
			!Number.isFinite(alternate.earned) ||
			!Number.isFinite(alternate.possible) ||
			alternate.possible <= 0 ||
			pointRatiosAgree(String(current.earned), String(current.possible), scoreEarned, scorePossible)
		)
			continue;

		const category = categories.find((entry) => entry.name === assignment.Type);
		let useAlternate = false;
		if (category?.points && category.pointsPossible) {
			const target = { earned: Number(category.points), possible: Number(category.pointsPossible) };
			const currentTotals = totals(category.name);
			const updated = {
				earned: currentTotals.earned - current.earned + alternate.earned,
				possible: currentTotals.possible - current.possible + alternate.possible
			};
			const earnedGap = Math.abs(currentTotals.earned - target.earned);
			const possibleGap = Math.abs(currentTotals.possible - target.possible);
			const newEarnedGap = Math.abs(updated.earned - target.earned);
			const newPossibleGap = Math.abs(updated.possible - target.possible);
			useAlternate =
				newEarnedGap <= earnedGap + 0.0001 &&
				newPossibleGap <= possibleGap + 0.0001 &&
				(newEarnedGap < earnedGap - 0.0001 || newPossibleGap < possibleGap - 0.0001);
		} else if (
			!categories.length &&
			officialPercentage.trim() !== '' &&
			Number.isFinite(Number(officialPercentage))
		) {
			const currentTotals = totals();
			const currentGrade = (currentTotals.earned / currentTotals.possible) * 100;
			const updatedGrade =
				((currentTotals.earned - current.earned + alternate.earned) /
					(currentTotals.possible - current.possible + alternate.possible)) *
				100;
			useAlternate =
				Number.isFinite(updatedGrade) &&
				Math.abs(updatedGrade - Number(officialPercentage)) <
					Math.abs(currentGrade - Number(officialPercentage));
		}
		if (!useAlternate) continue;
		assignment.Point = scoreEarned;
		assignment.PointPossible = scorePossible;
		assignment.Points = `${scoreEarned} / ${scorePossible}`;
		delete assignment.ScoreCalValue;
		delete assignment.ScoreMaxValue;
	}

	// StudentVUE sometimes publishes a row whose score contradicts its own
	// category total (for example 9.5/1 where the category counts 0.95/1),
	// which would show students a phantom 950% score. When the category gap is
	// explained by exactly one over-100% row, rewrite that row to the value the
	// official category math used. Ambiguous gaps are left alone — the client
	// reconciles those at the category level instead.
	const rowsByCategory = new Map<string, Record<string, string>[]>();
	for (const assignment of result) {
		if (!assignment.Type) continue;
		const rows = rowsByCategory.get(assignment.Type);
		if (rows) rows.push(assignment);
		else rowsByCategory.set(assignment.Type, [assignment]);
	}
	for (const [categoryName, rows] of rowsByCategory) {
		const category = categories.find((entry) => entry.name === categoryName);
		if (!category?.points || !category.pointsPossible) continue;
		const pairs = rows
			.filter((row) => !/^\s*\(\s*not\s+for\s+grading\s*\)/i.test(row.Notes ?? ''))
			.map((row) => ({ row, pair: points(row) }));
		const summedEarned = pairs.reduce((total, { pair }) => (pair ? total + pair.earned : total), 0);
		const gap = Number(category.points) - summedEarned;
		if (!Number.isFinite(gap) || Math.abs(gap) < 0.0001) continue;
		const candidates = pairs.filter(
			(
				entry
			): entry is { row: Record<string, string>; pair: { earned: number; possible: number } } =>
				entry.pair !== undefined &&
				entry.pair.earned > entry.pair.possible &&
				entry.pair.earned + gap >= 0 &&
				entry.pair.earned + gap <= entry.pair.possible
		);
		if (candidates.length !== 1) continue;
		const { row, pair } = candidates[0]!;
		const correctedEarned = Math.round((pair.earned + gap) * 1e6) / 1e6;
		row.Point = String(correctedEarned);
		row.Points = `${correctedEarned} / ${row.PointPossible ?? pair.possible}`;
		delete row.ScoreCalValue;
		delete row.ScoreMaxValue;
	}
	return result;
}

function cellText(value: unknown): string {
	if (typeof value === 'string') {
		const trimmed = value.trim();
		if (trimmed.startsWith('{') && trimmed.includes('"value"')) {
			try {
				return cellText(JSON.parse(trimmed));
			} catch {
				// It is ordinary text that happens to start with a brace.
			}
		}
		return value;
	}
	if (typeof value === 'number') return String(value);
	if (value && typeof value === 'object' && !Array.isArray(value)) {
		const inner = (value as Record<string, unknown>).value;
		if (inner !== undefined && inner !== value) return cellText(inner);
	}
	return '';
}

function extractJsonAfter(source: string, needle: string): unknown {
	const anchor = source.indexOf(needle);
	if (anchor < 0) return undefined;
	let start = anchor + needle.length;
	while (start < source.length && source[start] !== '[' && source[start] !== '{') start += 1;
	if (start >= source.length) return undefined;
	const open = source[start];
	const close = open === '[' ? ']' : '}';
	let depth = 0;
	let inString = false;
	let escaped = false;
	for (let index = start; index < source.length; index += 1) {
		const char = source[index];
		if (escaped) {
			escaped = false;
			continue;
		}
		if (char === '\\') {
			escaped = true;
			continue;
		}
		if (char === '"') {
			inString = !inString;
			continue;
		}
		if (inString) continue;
		if (char === open) depth += 1;
		else if (char === close && --depth === 0) {
			try {
				return JSON.parse(source.slice(start, index + 1));
			} catch {
				return undefined;
			}
		}
	}
}

function findDataSourceWithKeys(html: string, keys: string[]): Array<Record<string, unknown>> {
	const needle = '"dataSource":';
	let from = 0;
	while (from < html.length) {
		const index = html.indexOf(needle, from);
		if (index < 0) return [];
		const value = extractJsonAfter(html.slice(index), needle);
		if (
			Array.isArray(value) &&
			value.length > 0 &&
			value[0] &&
			typeof value[0] === 'object' &&
			keys.some((key) => key in (value[0] as Record<string, unknown>))
		)
			return value as Array<Record<string, unknown>>;
		from = index + needle.length;
	}
	return [];
}

export function portalDate(value: string) {
	if (!value) return '';
	const mdy = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
	if (mdy) return `${Number(mdy[1])}/${Number(mdy[2])}/${mdy[3]}`;
	const shortMdy = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})(?:\D|$)/);
	if (shortMdy)
		return `${Number(shortMdy[1])}/${Number(shortMdy[2])}/${2000 + Number(shortMdy[3])}`;
	const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
	if (iso) return `${Number(iso[2])}/${Number(iso[3])}/${iso[1]}`;
	const dotNet = value.match(/^\/Date\((-?\d+)/);
	const parsed = dotNet ? new Date(Number(dotNet[1])) : new Date(value);
	if (!Number.isFinite(parsed.getTime())) return '';
	return `${parsed.getUTCMonth() + 1}/${parsed.getUTCDate()}/${parsed.getUTCFullYear()}`;
}

export function dateMatches(value: string, month: number, year: number) {
	const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
	return Boolean(match && Number(match[1]) === month && Number(match[3]) === year);
}

function pointPair(score: string | undefined, points: string | undefined) {
	if (!score || !points) return points ?? '';
	const earned = score.match(/\d+(?:\.\d+)?/)?.[0];
	const values = [...points.matchAll(/\d+(?:\.\d+)?/g)];
	const possible = values.at(-1)?.[0];
	return earned && possible ? `${earned} / ${possible}` : points;
}

export function mdyDate(value: string) {
	const m = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
	return m ? new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2]), 12) : undefined;
}

export function documentRows(html: string): PortalDocument[] {
	const marker = 'dataSource';
	let cursor = 0;
	while ((cursor = html.indexOf(marker, cursor)) >= 0) {
		const start = html.indexOf('[', cursor);
		const candidate = jsonArray(html, start);
		cursor += marker.length;
		if (
			!Array.isArray(candidate) ||
			!candidate.some((item) => item && typeof item === 'object' && 'DocumentUploadDate' in item)
		)
			continue;
		return candidate.flatMap((item) => {
			if (!item || typeof item !== 'object') return [];
			const row = item as Record<string, unknown>;
			const rawTitle = text(row.DocumentTitle);
			const href = decodeHtml(
				rawTitle.match(/href=["']([^"']*PXP_ShowDocument\.aspx[^"']*)["']/i)?.[1] ?? ''
			);
			let token = '';
			try {
				token = new URL(href, 'https://studentvue.invalid/').searchParams.get('docToken') ?? '';
			} catch {
				/* Ignore invalid portal markup. */
			}
			const title = stripHtml(rawTitle);
			const date = text(row.DocumentUploadDate);
			const category = text(row.DocumentCategory);
			return title && date && token ? [{ id: encodeOpaqueId(token), title, date, category }] : [];
		});
	}
	return [];
}

function encodeOpaqueId(value: string) {
	return Buffer.from(value, 'utf8').toString('base64url');
}
export function decodeOpaqueId(value: string) {
	if (!/^[A-Za-z0-9_-]{1,8192}$/.test(value))
		throw new Pxp2InputError('Invalid document identifier.');
	return Buffer.from(value, 'base64url').toString('utf8');
}
export function isUuid(value: string) {
	return /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);
}

function jsonArray(value: string, start: number): unknown {
	if (start < 0 || value[start] !== '[') return undefined;
	let depth = 0,
		inString = false,
		escaped = false;
	for (let index = start; index < value.length; index += 1) {
		const char = value[index];
		if (inString) {
			if (escaped) escaped = false;
			else if (char === '\\') escaped = true;
			else if (char === '"') inString = false;
			continue;
		}
		if (char === '"') inString = true;
		else if (char === '[') depth += 1;
		else if (char === ']' && --depth === 0) {
			try {
				return JSON.parse(value.slice(start, index + 1));
			} catch {
				return undefined;
			}
		}
	}
}
