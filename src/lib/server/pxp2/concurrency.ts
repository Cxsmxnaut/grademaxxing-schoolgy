export async function mapWithConcurrency<T, U>(
	items: T[],
	concurrency: number,
	operation: (item: T) => Promise<U>
): Promise<U[]> {
	const output = new Array<U>(items.length);
	let cursor = 0;
	await Promise.all(
		Array.from({ length: Math.min(concurrency, items.length) }, async () => {
			while (cursor < items.length) {
				const index = cursor++;
				output[index] = await operation(items[index]!);
			}
		})
	);
	return output;
}
