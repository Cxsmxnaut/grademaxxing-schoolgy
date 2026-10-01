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
		_Type
	} = synergyAssignment;

	const finiteNumber = (value: string | undefined) => {
		if (value === undefined || value === '') return undefined;
		const parsed = Number.parseFloat(value);
		return Number.isFinite(parsed) ? parsed : undefined;
	};
	const displayedPointsPossible = _Points?.includes('/')
		? finiteNumber(_Points.split('/')[1]?.trim())
		: finiteNumber(_Points?.split(' Points Possible')[0]);

	let pointsEarned = _Point !== undefined ? (_Point === '' ? 0 : finiteNumber(_Point)) : undefined; // _Point can be empty; equivalent to 0

	let pointsPossible =
		_PointPossible !== undefined && _PointPossible !== ''
			? finiteNumber(_PointPossible)
			: _ScoreMaxValue !== undefined && _ScoreMaxValue !== ''
				? finiteNumber(_ScoreMaxValue)
				: _Points === undefined || _Points === 'Points Possible'
					? undefined
					: displayedPointsPossible;

	const pointsEarnedIsScaled =
		_Point !== undefined &&
		_Point !== '' &&
		_ScoreCalValue !== undefined &&
		_Point !== _ScoreCalValue;

	const pointsPossibleIsScaled =
		_PointPossible !== undefined &&
		_PointPossible !== '' &&
		_ScoreMaxValue !== undefined &&
		_PointPossible !== _ScoreMaxValue;

	let unscaledPoints: { pointsEarned: number; pointsPossible: number } | undefined = undefined;

	if (
		(pointsEarnedIsScaled || pointsPossibleIsScaled) &&
		_ScoreCalValue !== undefined &&
		_ScoreMaxValue !== undefined
	) {
		unscaledPoints = {
			pointsEarned: parseFloat(_ScoreCalValue),
			pointsPossible: parseFloat(_ScoreMaxValue)
		};
	}

	// A true scale changes earned and possible points by the same factor. If the
	// ratios disagree, use StudentVUE's displayed score pair instead of turning
	// a stale point maximum into a 950% assignment.
	if (
		_PointPossible !== '' &&
		pointsEarned !== undefined &&
		pointsPossible !== undefined &&
		unscaledPoints &&
		Number.isFinite(unscaledPoints.pointsEarned) &&
		Number.isFinite(unscaledPoints.pointsPossible) &&
		unscaledPoints.pointsPossible > 0
	) {
		const rawProduct = pointsEarned * unscaledPoints.pointsPossible;
		const displayedProduct = unscaledPoints.pointsEarned * pointsPossible;
		const roundingTolerance =
			Number.EPSILON * Math.max(1, Math.abs(rawProduct), Math.abs(displayedProduct)) * 8;
		if (Math.abs(rawProduct - displayedProduct) > roundingTolerance) {
			pointsEarned = unscaledPoints.pointsEarned;
			pointsPossible = unscaledPoints.pointsPossible;
			unscaledPoints = undefined;
		}
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
		extraCredit: _PointPossible === '',
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
