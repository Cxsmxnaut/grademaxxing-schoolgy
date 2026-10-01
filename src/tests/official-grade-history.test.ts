import {
	getOfficialGradeHistory,
	recordOfficialGradebookSnapshot,
	withCurrentOfficialGrade
} from '$lib/grades/official-grade-history';
import { parseGradebookXML } from '$lib/synergy';
import { beforeEach, expect, test } from 'vitest';

class MemoryStorage {
	#values = new Map<string, string>();

	getItem(key: string) {
		return this.#values.get(key) ?? null;
	}

	setItem(key: string, value: string) {
		this.#values.set(key, value);
	}
}

function gradebook(period: number, officialPercentage: string) {
	return parseGradebookXML(
		`<Gradebook><ReportingPeriod Index="${period}" GradePeriod="Quarter ${period + 1}"/><ReportingPeriods><ReportPeriod Index="${period}" GradePeriod="Quarter ${period + 1}"/></ReportingPeriods><Courses><Course CourseID="history" CourseName="History" Period="1"><Marks><Mark MarkName="Quarter ${period + 1}" CalculatedScoreRaw="${officialPercentage}" CalculatedScoreString="A"><Assignments><Assignment GradebookID="quiz" Measure="Quiz" Type="Homework" Date="9/20/2026" Score="9.5" ScoreCalValue="9.5" ScoreMaxValue="1" Points="9.5 / 1" Point="9.5" PointPossible="1"/></Assignments></Mark></Marks></Course></Courses></Gradebook>`
	);
}

beforeEach(() => {
	Object.defineProperty(globalThis, 'localStorage', {
		configurable: true,
		value: new MemoryStorage()
	});
	localStorage.setItem('gradebookOwner', 'student-a');
});

test('history uses only upstream course marks, not assignment point math', () => {
	recordOfficialGradebookSnapshot(gradebook(0, '96.5'), 1000);
	expect(getOfficialGradeHistory('history', 0)).toEqual([{ observedAt: 1000, percentage: 96.5 }]);

	recordOfficialGradebookSnapshot(gradebook(0, '96.5'), 2000);
	expect(getOfficialGradeHistory('history', 0)).toHaveLength(1);

	recordOfficialGradebookSnapshot(gradebook(0, '97'), 3000);
	expect(getOfficialGradeHistory('history', 0).map(({ percentage }) => percentage)).toEqual([
		96.5, 97
	]);
});

test('history stays within the current student and report period', () => {
	recordOfficialGradebookSnapshot(gradebook(0, '96.5'), 1000);
	recordOfficialGradebookSnapshot(gradebook(1, '87'), 2000);
	expect(getOfficialGradeHistory('history', 1).map(({ percentage }) => percentage)).toEqual([87]);
	expect(getOfficialGradeHistory('history', 0).map(({ percentage }) => percentage)).toEqual([96.5]);
	localStorage.setItem('gradebookOwner', 'student-b');
	expect(getOfficialGradeHistory('history', 0)).toEqual([]);
});

test('a current official mark remains visible when no history was saved', () => {
	expect(withCurrentOfficialGrade([], { observedAt: 1000, percentage: 96.5 })).toEqual([
		{ observedAt: 1000, percentage: 96.5 }
	]);
	expect(
		withCurrentOfficialGrade([{ observedAt: 1000, percentage: 96.5 }], {
			observedAt: 2000,
			percentage: 96.5
		})
	).toHaveLength(1);
});
