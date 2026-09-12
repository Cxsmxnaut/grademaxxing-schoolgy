import { error } from '@sveltejs/kit';

export function optionalInteger(
	value: string | null,
	minimum: number,
	maximum: number,
	label: string
) {
	if (value === null) return undefined;
	if (!/^\d+$/.test(value)) throw error(400, `${label} must be an integer.`);
	const number = Number(value);
	if (number < minimum || number > maximum)
		throw error(400, `${label} is outside the supported range.`);
	return number;
}
