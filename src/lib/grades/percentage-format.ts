const percentageFormatter = new Intl.NumberFormat('en-US', {
	maximumFractionDigits: 2
});

/** Display a percentage value without changing the precision used in calculations. */
export function formatPercentage(value: number) {
	return percentageFormatter.format(value);
}
