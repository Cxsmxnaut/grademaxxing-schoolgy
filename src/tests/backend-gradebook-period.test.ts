import { gradebookXml } from '$lib/server/gradebook-adapter';
import { parseGradebookXML } from '$lib/synergy';
import { expect, test } from 'vitest';

test('modern gradebook preserves the canonical period catalog and selected index', () => {
	const xml = gradebookXml({
		courses: [],
		reportingPeriods: [
			{ name: 'Progress 1', index: 0, startDate: '', endDate: '' },
			{ name: 'Quarter 1', index: 1, startDate: '', endDate: '' }
		],
		selectedPeriod: { name: 'Quarter 1', index: 1, startDate: '', endDate: '' }
	});
	const gradebook = parseGradebookXML(xml);

	expect(gradebook.ReportingPeriods.ReportPeriod.map((period) => period._GradePeriod)).toEqual([
		'Progress 1',
		'Quarter 1'
	]);
	expect(gradebook.ReportingPeriod._GradePeriod).toBe('Quarter 1');
	expect(gradebook.ReportingPeriod._Index).toBe('1');
});
