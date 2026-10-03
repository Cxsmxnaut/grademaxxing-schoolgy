import { XMLBuilder } from 'fast-xml-parser';
import type { PortalGradebook, PortalGradeCategory } from './pxp2';

type PortalCourse = {
	id: string;
	period: string;
	title: string;
	room: string;
	teacher: string;
	teacherEmail: string;
	score: string;
	scoreRaw: string;
	missing: string;
	categories: PortalGradeCategory[];
	assignments: Array<Record<string, string>>;
};

/** Convert current PXP2 JSON to the legacy Grademaxxing gradebook contract. */
export function gradebookXml(input: PortalCourse[] | PortalGradebook) {
	const gradebook = Array.isArray(input)
		? {
				courses: input,
				reportingPeriods: [{ name: 'Current', index: 0, startDate: '', endDate: '' }],
				selectedPeriod: { name: 'Current', index: 0, startDate: '', endDate: '' }
			}
		: input;
	const { courses, reportingPeriods, selectedPeriod } = gradebook;
	const builder = new XMLBuilder({
		ignoreAttributes: false,
		attributeNamePrefix: '_',
		suppressBooleanAttributes: false
	});
	return builder.build({
		Gradebook: {
			ReportingPeriods: {
				ReportPeriod: reportingPeriods.map((period) => ({
					_GradePeriod: period.name,
					_Index: String(period.index),
					_StartDate: period.startDate,
					_EndDate: period.endDate
				}))
			},
			ReportingPeriod: {
				_GradePeriod: selectedPeriod.name,
				_Index: String(selectedPeriod.index),
				_StartDate: selectedPeriod.startDate,
				_EndDate: selectedPeriod.endDate
			},
			Courses: {
				Course: courses.map((course) => ({
					_Period: course.period,
					_Title: course.title,
					_CourseName: course.title,
					_CourseID: course.id,
					_Room: course.room,
					_Staff: course.teacher,
					_StaffEMail: course.teacherEmail,
					_StaffGU: '',
					_ImageType: '',
					_HighlightPercentageCutOffForProgressBar: '0',
					_UsesRichContent: false,
					Marks: {
						Mark: [
							{
								_MarkName: selectedPeriod.name,
								_ShortMarkName: selectedPeriod.name,
								_CalculatedScoreString: course.score,
								_CalculatedScoreRaw:
									course.scoreRaw || course.score.match(/\d+(?:\.\d+)?/)?.[0] || '',
								StandardViews: '',
								GradeCalculationSummary: course.categories.length
									? {
											AssignmentGradeCalc: course.categories.map((category) => ({
												_Type: category.name,
												_Weight: category.weight,
												_Points: category.points,
												_PointsPossible: category.pointsPossible,
												_WeightedPct: category.weightedPercentage,
												_CalculatedMark: category.calculatedMark
											}))
										}
									: '',
								AssignmentsSinceLastAccess: '',
								Assignments: {
									Assignment: course.assignments.map((assignment, index) => {
										const points = assignmentPointValues(assignment);
										return {
											_GradebookID: assignment.AssignmentID || `${course.id}-${index}`,
											_Measure: assignment.Measure ?? '',
											_Type: assignment.Type ?? '',
											_Date: assignment.Date ?? '',
											_DueDate: assignment.DueDate ?? '',
											_Score: assignment.Score ?? '',
											_DisplayScore: assignment.Score ?? '',
											_ScoreCalValue: assignment.ScoreCalValue ?? points.earned,
											_TimeSincePost: '',
											_TotalSecondsSincePost: '0',
											_ScoreMaxValue: assignment.ScoreMaxValue ?? points.possible,
											_ScoreType: assignment.ScoreType ?? 'Raw Score',
											_AssignmentPercentage: assignment.AssignmentPercentage,
											_AssignmentPercentagePrecision: assignment.AssignmentPercentagePrecision,
											_CalculationUnavailable: assignment.CalculationUnavailable,
											_Points: assignment.Points ?? '',
											_Point: assignment.Point ?? points.earned,
											_PointPossible: points.possible,
											_Notes: assignment.Notes ?? '',
											_TeacherID: '',
											_StudentID: '',
											_MeasureDescription: assignment.Description ?? '',
											_HasDropBox: false,
											_DropStartDate: '',
											_DropEndDate: '',
											Resources: '',
											Standards: ''
										};
									})
								}
							}
						]
					}
				}))
			}
		}
	});
}

function assignmentPointValues(assignment: Record<string, string>) {
	const pair = assignment.Points?.match(/^\s*(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)?\s*$/);
	// A display score can use a different scale from weighted points. Only
	// serialize earned points when the portal actually supplied that point pair.
	return {
		earned: assignment.Point ?? pair?.[1],
		possible: assignment.PointPossible ?? (pair ? (pair[2] ?? '') : undefined)
	};
}
