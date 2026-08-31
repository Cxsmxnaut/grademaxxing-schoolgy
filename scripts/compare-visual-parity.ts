import { mkdir, readFile, writeFile } from 'node:fs/promises';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

const root = '/tmp/grademaxxing-parity';
const mode = process.env.VISUAL_MODE ?? process.argv[2] ?? 'desktop-dark';
const referenceMode = process.env.VISUAL_REFERENCE_MODE ?? mode;
const localMode = process.env.VISUAL_LOCAL_MODE ?? mode;
const page = process.env.VISUAL_PAGE ?? process.argv[3] ?? 'gradebook';
const threshold = Number(process.env.VISUAL_THRESHOLD ?? '0.1');

const referencePath = `${root}/reference/${referenceMode}/${page}.png`;
const localPath = `${root}/local/${localMode}/${page}.png`;
const outputDirectory = `${root}/diff`;
const outputPath = `${outputDirectory}/${page}-${mode}-pixelmatch.png`;
const reportPath = `${outputDirectory}/${page}-${mode}-pixelmatch.json`;

const [referenceSource, localSource] = await Promise.all([
	readFile(referencePath),
	readFile(localPath)
]);
const reference = PNG.sync.read(referenceSource);
const local = PNG.sync.read(localSource);
const width = Math.min(reference.width, local.width);
const height = Math.min(reference.height, local.height);

function crop(source: PNG) {
	const result = new PNG({ width, height });
	PNG.bitblt(source, result, 0, 0, width, height, 0, 0);
	return result;
}

const referenceCrop = crop(reference);
const localCrop = crop(local);
const diff = new PNG({ width, height });
const mismatchedPixels = pixelmatch(referenceCrop.data, localCrop.data, diff.data, width, height, {
	threshold,
	includeAA: false,
	diffColor: [255, 0, 128],
	aaColor: [0, 180, 255]
});
const totalPixels = width * height;
const report = {
	page,
	mode,
	referenceMode,
	localMode,
	width,
	height,
	threshold,
	mismatchedPixels,
	mismatchPercentage: Math.round((mismatchedPixels / totalPixels) * 1_000_000) / 10_000
};

await mkdir(outputDirectory, { recursive: true });
await Promise.all([
	writeFile(outputPath, PNG.sync.write(diff)),
	writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`)
]);

console.log(JSON.stringify({ ...report, outputPath }, null, 2));
