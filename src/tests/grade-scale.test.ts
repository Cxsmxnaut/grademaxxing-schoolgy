import { describe, expect, it } from 'vitest';
import { estimateHypotheticalLetter, type GradeScaleObservation } from '$lib/grades/grade-scale';

const observed = (percentage: number, letter: string): GradeScaleObservation => ({
	percentage,
	letter,
	observedAt: 1
});

describe('class-specific hypothetical letter estimates', () => {
	it('keeps a whole-letter class pattern when StudentVUE has shown a plain A at 91%', () => {
		expect(estimateHypotheticalLetter(90, [observed(91, 'A')])).toEqual({
			letter: 'A',
			basis: 'class-pattern'
		});
	});

	it('uses a teacher mark across an observed range before using a template', () => {
		expect(estimateHypotheticalLetter(92, [observed(90, 'A'), observed(95, 'A')])).toEqual({
			letter: 'A',
			basis: 'observed-range'
		});
	});

	it('uses plus-minus style only after that class has actually shown it', () => {
		expect(estimateHypotheticalLetter(92, [observed(91, 'A-')])).toEqual({
			letter: 'A-',
			basis: 'class-pattern'
		});
	});
});
