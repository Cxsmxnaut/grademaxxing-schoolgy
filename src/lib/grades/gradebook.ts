import type { Gradebook } from '$lib/contracts/studentvue/gradebook';
import { parseGradebookXML } from '$lib/synergy';
import { gradebookState } from './catalog.svelte';

let parsedGradebook: { index: number; xml: string; gradebook: Gradebook } | undefined = undefined;

export function getActiveGradebook() {
	const { gradebookCatalog } = gradebookState;
	if (!gradebookCatalog) return;

	const index = gradebookCatalog.overrideIndex ?? gradebookCatalog.defaultIndex;
	const record = gradebookCatalog.recordCache[index];
	if (!record) return;

	if (parsedGradebook && index === parsedGradebook.index && parsedGradebook.xml === record.xml)
		return parsedGradebook.gradebook;

	parsedGradebook = {
		index,
		xml: record.xml,
		gradebook: parseGradebookXML(record.xml)
	};
	return parsedGradebook.gradebook;
}
