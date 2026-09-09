/**
 * GPA policy configuration
 *
 * This is the single place to update after the district provides its official
 * transcript and admissions-GPA rules. The PUSD values below are provisional:
 * they are product assumptions, not a claim about the district's official
 * calculation. Keep `label` explicit until the rules are confirmed.
 */

export type GradePointMap = Readonly<Record<string, number>>;

export type GpaCourseWeightRule = {
	name: string;
	pattern: RegExp;
	bonusPoints: number;
};

export type GpaPolicy = {
	id: string;
	label: string;
	gradePoints: GradePointMap;
	weightRules: readonly GpaCourseWeightRule[];
	minimumGradePointsForWeight: number;
	minimumGradeLevel: number;
	academicCourseExclusions: readonly RegExp[];
	defaultCredits: number;
};

const flatFourPointScale: GradePointMap = {
	'A+': 4,
	A: 4,
	'A-': 4,
	'B+': 3,
	B: 3,
	'B-': 3,
	'C+': 2,
	C: 2,
	'C-': 2,
	'D+': 1,
	D: 1,
	'D-': 1,
	F: 0,
	// Failing pass/fail outcomes count as an F; P and CR intentionally remain unmapped.
	NC: 0,
	NP: 0
};

export const PUSD_PROVISIONAL_GPA_POLICY: GpaPolicy = {
	id: 'pusd-provisional',
	label: 'PUSD provisional',
	// Confirm plus/minus handling and every eligible honors course with a counselor.
	gradePoints: flatFourPointScale,
	weightRules: [
		{ name: 'AP / IB', pattern: /(?:^|\s)(?:AP|IB)(?:\s|$)/i, bonusPoints: 1 },
		{ name: 'Honors', pattern: /honou?rs?/i, bonusPoints: 0.5 }
	],
	// Provisional rule: do not add rigor points to D or F grades.
	minimumGradePointsForWeight: 2,
	minimumGradeLevel: 9,
	academicCourseExclusions: [
		/(?:^|\s)(?:PE|P\.E\.|Physical Education)(?:\s|$)/i,
		/driver'?s education/i,
		/(?:^|\s)ROTC(?:\s|$)/i
	],
	defaultCredits: 5
};

/** The policy used by all current GPA displays and calculations. */
export const GPA_POLICY = PUSD_PROVISIONAL_GPA_POLICY;
