import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

const root = '/tmp/grademaxxing-parity';
const outputDirectory = `${root}/diff/audit`;
const threshold = Number(process.env.VISUAL_THRESHOLD ?? '0.1');
const pairs = [
	['desktop-dark', 'desktop-dark', 'desktop-dark'],
	['mobile-dark', 'mobile-dark', 'mobile-dark'],
	['desktop-light', 'desktop-light', 'desktop-light'],
	['mobile-light', 'mobile-light', 'mobile-light'],
	['desktop-public-dark', 'desktop-dark', 'desktop-public'],
	['mobile-public-dark', 'mobile-dark', 'mobile-public']
] as const;

type Result = {
	pair: string;
	state: string;
	referenceMode: string;
	localMode: string;
	referenceSize: string;
	localSize: string;
	comparedSize: string;
	dimensionDelta: { width: number; height: number };
	mismatchedPixels: number;
	mismatchPercentage: number;
	classification: 'close' | 'minor' | 'substantial';
	diffPath: string;
};

function crop(source: PNG, width: number, height: number) {
	const result = new PNG({ width, height });
	PNG.bitblt(source, result, 0, 0, width, height, 0, 0);
	return result;
}

function classify(percentage: number): Result['classification'] {
	if (percentage >= 3) return 'substantial';
	if (percentage >= 1) return 'minor';
	return 'close';
}

async function pngNames(directory: string) {
	try {
		return new Set((await readdir(directory)).filter((name) => name.endsWith('.png')));
	} catch {
		return new Set<string>();
	}
}

await mkdir(outputDirectory, { recursive: true });
const results: Result[] = [];

for (const [pair, referenceMode, localMode] of pairs) {
	const referenceDirectory = `${root}/reference/${referenceMode}`;
	const localDirectory = `${root}/local/${localMode}`;
	const [referenceNames, localNames] = await Promise.all([
		pngNames(referenceDirectory),
		pngNames(localDirectory)
	]);
	const commonNames = [...referenceNames]
		.filter((name) => localNames.has(name))
		.sort((a, b) => a.localeCompare(b));

	for (const name of commonNames) {
		const [referenceSource, localSource] = await Promise.all([
			readFile(`${referenceDirectory}/${name}`),
			readFile(`${localDirectory}/${name}`)
		]);
		const reference = PNG.sync.read(referenceSource);
		const local = PNG.sync.read(localSource);
		const width = Math.min(reference.width, local.width);
		const height = Math.min(reference.height, local.height);
		const referenceCrop = crop(reference, width, height);
		const localCrop = crop(local, width, height);
		const diff = new PNG({ width, height });
		const mismatchedPixels = pixelmatch(
			referenceCrop.data,
			localCrop.data,
			diff.data,
			width,
			height,
			{
				threshold,
				includeAA: false,
				diffColor: [255, 0, 128],
				aaColor: [0, 180, 255]
			}
		);
		const mismatchPercentage =
			Math.round((mismatchedPixels / (width * height)) * 1_000_000) / 10_000;
		const state = name.replace(/\.png$/, '');
		const diffPath = `${outputDirectory}/${pair}-${state}.png`;
		await writeFile(diffPath, PNG.sync.write(diff));
		results.push({
			pair,
			state,
			referenceMode,
			localMode,
			referenceSize: `${reference.width}×${reference.height}`,
			localSize: `${local.width}×${local.height}`,
			comparedSize: `${width}×${height}`,
			dimensionDelta: {
				width: local.width - reference.width,
				height: local.height - reference.height
			},
			mismatchedPixels,
			mismatchPercentage,
			classification: classify(mismatchPercentage),
			diffPath
		});
	}
}

results.sort((a, b) => b.mismatchPercentage - a.mismatchPercentage);
const summary = {
	generatedAt: new Date().toISOString(),
	threshold,
	comparedStates: results.length,
	close: results.filter((result) => result.classification === 'close').length,
	minor: results.filter((result) => result.classification === 'minor').length,
	substantial: results.filter((result) => result.classification === 'substantial').length,
	results
};

const markdown = [
	'# Visual parity interaction audit',
	'',
	`Generated: ${summary.generatedAt}`,
	'',
	`Compared ${summary.comparedStates} paired rendered states: ${summary.close} close, ${summary.minor} minor, ${summary.substantial} substantial.`,
	'',
	'Raw pixel percentages include intentional branding, navigation, and mock-data differences. Dimension deltas expose structural drift separately.',
	'',
	'| Class | Pair | State | Pixel mismatch | Reference | Local | Δ width | Δ height |',
	'| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |',
	...results.map(
		(result) =>
			`| ${result.classification} | ${result.pair} | ${result.state} | ${result.mismatchPercentage.toFixed(4)}% | ${result.referenceSize} | ${result.localSize} | ${result.dimensionDelta.width} | ${result.dimensionDelta.height} |`
	),
	''
].join('\n');

await Promise.all([
	writeFile(`${outputDirectory}/visual-parity-audit.json`, `${JSON.stringify(summary, null, 2)}\n`),
	writeFile(`${outputDirectory}/visual-parity-audit.md`, markdown)
]);

console.log(
	JSON.stringify(
		{
			...summary,
			results: results.slice(0, 15),
			report: `${outputDirectory}/visual-parity-audit.md`
		},
		null,
		2
	)
);
