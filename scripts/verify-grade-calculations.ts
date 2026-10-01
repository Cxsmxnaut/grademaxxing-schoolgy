import {
	calculateAssignmentGPCs,
	calculateCourseGradePercentageFromCategories,
	calculateCourseGradePercentageFromTotals,
	getCalculableAssignments,
	getPointsByCategory,
	gradesMatch,
	parseSynergyAssignment
} from '../src/lib/grades/assignments';
import { gradebookXml } from '../src/lib/server/gradebook-adapter';
import { Pxp2Client } from '../src/lib/server/pxp2';
import { parseGradebookXML } from '../src/lib/synergy';

const username = process.env.STUDENTVUE_USERNAME;
const password = process.env.STUDENTVUE_PASSWORD;
const district = process.env.DISTRICT_URL;
if (!username || !password || !district)
	throw new Error('StudentVUE environment variables are required.');

const client = await Pxp2Client.login(district, { username, password });
const gradebook = parseGradebookXML(gradebookXml(await client.gradebook()));
const results = gradebook.Courses.Course.map((course, index) => {
	const mark = course.Marks?.Mark[0];
	const categories = mark?.GradeCalculationSummary?.AssignmentGradeCalc.map((category) => ({
		name: category._Type,
		weightPercentage: Number.parseFloat(category._Weight),
		pointsEarned: Number.parseFloat(category._Points),
		pointsPossible: Number.parseFloat(category._PointsPossible),
		weightedPercentage: Number.parseFloat(category._WeightedPct),
		gradeLetter: category._CalculatedMark
	})).filter((category) => category.name !== 'TOTAL');
	const real = calculateAssignmentGPCs(
		(mark?.Assignments?.Assignment ?? []).map(parseSynergyAssignment),
		categories
	);
	const calculable = getCalculableAssignments(real);
	const calculated = categories
		? calculateCourseGradePercentageFromCategories(getPointsByCategory(calculable), categories)
		: calculateCourseGradePercentageFromTotals(calculable);
	const official = Number.parseFloat(mark?._CalculatedScoreRaw ?? '');
	return {
		index,
		official: Number.isFinite(official) ? official : null,
		calculated,
		matches: Number.isFinite(official) ? gradesMatch(calculated, official) : true,
		visibleAssignments: real.length,
		categories:
			categories?.map(({ name: _name, ...category }, categoryIndex) => ({
				categoryIndex,
				...category
			})) ?? []
	};
});

console.log(JSON.stringify(results, null, 2));
