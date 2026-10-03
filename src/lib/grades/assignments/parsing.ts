import type { AssignmentEntity } from '$lib/contracts/studentvue/gradebook';
import { isNotForGrade } from '../course';
import type { RealAssignment } from './types';

export function parseSynergyAssignment(synergyAssignment: AssignmentEntity) {
	const {
		_Date,
		_DueDate,
		_Measure,
		_MeasureDescription,
		_Notes,
		_Point,
		_PointPossible,
		_Points,
		_ScoreCalValue,
		_ScoreMaxValue,
		_AssignmentPercentage,
		_AssignmentPercentagePrecision,
		_CalculationUnavailable,
		_Type
	} = synergyAssignment;

	const finiteNumber = (value: string | undefined) => {
		const normalized = String(value ?? '').trim();
		if (!normalized || !/^-?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(normalized))
			return undefined;
		const parsed = Number(normalized);
		return Number.isFinite(parsed) ? parsed : undefined;
	};
	const fraction = /^\s*(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)?\s*$/.exec(_Points ?? '');
	const displayedPointsPossible = _Points?.includes('/')
		? finiteNumber(fraction?.[2])
		: finiteNumber(_Points?.split(' Points Possible')[0]);

	const pointsEarned =
		_Point !== undefined ? (_Point === '' ? 0 : finiteNumber(_Point)) : finiteNumber(fraction?.[1]);

	const calculationUnavailable = String(_CalculationUnavailable) === 'true';
	const weightedMaximum = finiteNumber(_PointPossible) ?? displayedPointsPossible;
	const extraCredit =
		!calculationUnavailable &&
		(_PointPossible === '' ||
			(fraction !== null && fraction[2] === undefined) ||
			weightedMaximum === 0);
	// A raw score maximum describes the display scale, not assignment weight.
	const pointsPossible = extraCredit ? 0 : weightedMaximum;

	let unscaledPoints: { pointsEarned: number; pointsPossible: number } | undefined = undefined;
	const rawEarned = finiteNumber(_ScoreCalValue);
	const rawPossible = finiteNumber(_ScoreMaxValue);
	if (
		rawEarned !== undefined &&
		rawPossible !== undefined &&
		rawPossible > 0 &&
		(rawEarned !== pointsEarned || rawPossible !== pointsPossible)
	) {
		unscaledPoints = { pointsEarned: rawEarned, pointsPossible: rawPossible };
	}

	// The server reconciles assignment evidence. Raw score metadata is for
	// display; swapping it into calculations would change the assignment weight.
	const officialPercentage = finiteNumber(_AssignmentPercentage);
	let calculationPointsEarned: number | undefined;
	if (
		officialPercentage !== undefined &&
		pointsPossible !== undefined &&
		pointsPossible > 0 &&
		!extraCredit
	) {
		const precision = finiteNumber(_AssignmentPercentagePrecision);
		const usePercentage =
			pointsEarned === undefined ||
			precision === undefined ||
			(precision >= 0 &&
				Number.isInteger(precision) &&
				0.5 * 10 ** -precision <
					weightedRatioUncertainty(
						pointsEarned,
						pointsPossible,
						_Point ?? fraction?.[1],
						_PointPossible ?? fraction?.[2]
					));
		if (usePercentage) calculationPointsEarned = (officialPercentage / 100) * pointsPossible;
	}

	const notesFormatted = _Notes.replace(/^\s*\(\s*not\s+for\s+grading\s*\)\s*/i, '').trim();
	const assignmentDate = new Date(_Date);
	const dueDate = new Date(_DueDate);
	const safeDate = Number.isFinite(assignmentDate.getTime())
		? assignmentDate
		: Number.isFinite(dueDate.getTime())
			? dueDate
			: new Date(0);

	const assignment: RealAssignment = {
		name: _Measure,
		id: synergyAssignment._GradebookID,
		pointsEarned,
		pointsPossible,
		unscaledPoints,
		...(officialPercentage !== undefined
			? {
					officialPercentage,
					publishedPoints: { pointsEarned, pointsPossible, extraCredit },
					...(calculationPointsEarned !== undefined ? { calculationPointsEarned } : {})
				}
			: {}),
		...(calculationUnavailable ? { calculationUnavailable: true } : {}),
		extraCredit,
		gradePercentageChange: undefined,
		notForGrade: isNotForGrade(_Notes),
		hidden: false,
		category: _Type,
		date: safeDate,
		newHypothetical: false,
		description: _MeasureDescription.length > 0 ? _MeasureDescription : undefined,
		comments: notesFormatted.length > 0 ? notesFormatted : undefined
	};

	return assignment;
}

function weightedRatioUncertainty(
	earned: number,
	possible: number,
	earnedText: string | undefined,
	possibleText: string | undefined
) {
	const uncertainty = (value: string | undefined) => {
		const match = /^-?(?:\d+(?:\.(\d*))?|\.(\d+))(?:e([+-]?\d+))?$/i.exec(value?.trim() ?? '');
		if (!match) return Infinity;
		const decimalPlaces = (match[1] ?? match[2] ?? '').length;
		const exponent = Number(match[3] ?? 0);
		return 0.5 * 10 ** (exponent - decimalPlaces);
	};
	const earnedDelta = uncertainty(earnedText);
	const possibleDelta = uncertainty(possibleText);
	if (possible <= possibleDelta) return Infinity;
	const candidates = [
		(earned - earnedDelta) / (possible - possibleDelta),
		(earned - earnedDelta) / (possible + possibleDelta),
		(earned + earnedDelta) / (possible - possibleDelta),
		(earned + earnedDelta) / (possible + possibleDelta)
	];
	return Math.max(...candidates.map((ratio) => Math.abs(ratio - earned / possible) * 100));
}
