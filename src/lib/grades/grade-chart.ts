const DEFAULT_GRADE_CHART_DOMAIN: readonly [number, number] = [0, 100];

/**
 * Returns a focused vertical domain for the course grade trend chart.
 *
 * Grade percentages are commonly clustered in a narrow band (for example,
 * 88–96%). Using the full 0–100 range makes those changes look flat, so the
 * chart gets a small amount of breathing room around the values it actually
 * displays.
 */
export function getGradeChartDomain(values: readonly number[]): [number, number] {
	const finiteValues = values.filter(Number.isFinite);
	if (finiteValues.length === 0) return [...DEFAULT_GRADE_CHART_DOMAIN];

	const minimum = Math.min(...finiteValues);
	const maximum = Math.max(...finiteValues);

	if (minimum === maximum) {
		return [minimum - 5, maximum + 5];
	}

	const padding = Math.max(2, (maximum - minimum) * 0.1);
	return [minimum - padding, maximum + padding];
}
