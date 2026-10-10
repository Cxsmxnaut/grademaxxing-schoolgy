/** One registry for public metadata, discovery and canonical production URLs. */
export const SITE_ORIGIN = 'https://grademaxxing.app';
export const SITE_NAME = 'Grademaxxing';

export type PublicPage = {
	path: string;
	title: string;
	description: string;
	label: string;
	kind: 'page' | 'calculator' | 'guide';
	parent?: string;
};

export const PUBLIC_PAGES = [
	{
		path: '/',
		title: 'StudentVUE Grade Calculator & What-If Planner | Grademaxxing',
		description:
			'Explore StudentVUE grades with Grademaxxing, a read-only companion. Try free grade calculators and a fictional demo before signing in.',
		label: 'Home',
		kind: 'page'
	},
	{
		path: '/privacy',
		title: 'Privacy and data handling | Grademaxxing',
		description:
			'How Grademaxxing handles StudentVUE sign-in, encrypted sessions, optional credentials saved on your device, and signing out.',
		label: 'Privacy',
		kind: 'page'
	},
	{
		path: '/calculators',
		title: 'Free grade calculators | Grademaxxing',
		description:
			'Calculate final exam targets, assignment impact, weighted category grades and GPA with clear assumptions. Free tools that work without StudentVUE sign-in.',
		label: 'Grade calculators',
		kind: 'page'
	},
	{
		path: '/calculators/final-grade',
		title: 'Final grade calculator with formula | Grademaxxing',
		description:
			'Find the final exam score needed for a target course grade. See the weighted final formula, check a worked example and identify impossible targets.',
		label: 'Final grade calculator',
		kind: 'calculator',
		parent: '/calculators'
	},
	{
		path: '/calculators/assignment-impact',
		title: 'Assignment impact calculator | Grademaxxing',
		description:
			'Project how a new assignment or a replacement score changes a points-based or category-weighted grade. See the assumptions and achievable target range.',
		label: 'Assignment impact calculator',
		kind: 'calculator',
		parent: '/calculators'
	},
	{
		path: '/calculators/weighted-grade',
		title: 'Weighted grade calculator | Grademaxxing',
		description:
			'Combine category percentages and weights to estimate a course grade. Choose strict 100% weights or normalization and explicitly exclude ungraded categories.',
		label: 'Weighted grade calculator',
		kind: 'calculator',
		parent: '/calculators'
	},
	{
		path: '/calculators/gpa',
		title: 'GPA calculator with editable grade points | Grademaxxing',
		description:
			'Estimate GPA using credits and editable grade points. Make your policy assumptions explicit; this calculator does not issue an official transcript GPA.',
		label: 'GPA calculator',
		kind: 'calculator',
		parent: '/calculators'
	},
	{
		path: '/demo',
		title: 'Try a fictional gradebook demo | Grademaxxing',
		description:
			'Explore a clearly labeled fictional StudentVUE-style gradebook and assignment simulations. Try Grademaxxing without entering credentials or student records.',
		label: 'Fictional demo',
		kind: 'page'
	},
	{
		path: '/about',
		title: 'About Grademaxxing and its read-only scope',
		description:
			'What Grademaxxing does, how it connects to StudentVUE, its read-only limits and GradeCompass attribution. Independent of Edupoint and school districts.',
		label: 'About',
		kind: 'page'
	},
	{
		path: '/studentvue-grade-calculator',
		title: 'StudentVUE grade calculator and what-if tools | Grademaxxing',
		description:
			'Explore StudentVUE assignment what-if planning with Grademaxxing. Try anonymous grade calculators, a fictional demo and explanations of calculation limits.',
		label: 'StudentVUE grade calculator',
		kind: 'page'
	},
	{
		path: '/studentvue-compatibility',
		title: 'StudentVUE compatibility and sign-in limits | Grademaxxing',
		description:
			'Understand Grademaxxing’s StudentVUE connection requirements and known limits. Compatibility depends on portal configuration and does not imply district approval.',
		label: 'StudentVUE compatibility',
		kind: 'page'
	},
	{
		path: '/guides/studentvue-grade-calculation',
		title: 'How StudentVUE grade calculations work | Grademaxxing',
		description:
			'Understand points, category weights and assignment what-if calculations. Learn why local projections can differ from official StudentVUE grades.',
		label: 'StudentVUE grade calculation',
		kind: 'guide'
	},
	{
		path: '/guides/grade-mismatches',
		title: 'Why a calculated grade may differ from StudentVUE | Grademaxxing',
		description:
			'Check rounding, excluded assignments, category weights, dropped scores and teacher overrides when a local calculation differs from the official course grade.',
		label: 'Grade mismatch guide',
		kind: 'guide'
	},
	{
		path: '/guides/missing-excused-ungraded',
		title: 'Missing, excused and ungraded assignments | Grademaxxing',
		description:
			'Learn how missing, excused and ungraded work can affect grade projections. A missing label alone does not establish whether an assignment counts as zero.',
		label: 'Assignment status guide',
		kind: 'guide'
	},
	{
		path: '/methodology/grade-calculations',
		title: 'Grade calculation formulas and assumptions | Grademaxxing',
		description:
			'Reproduce Grademaxxing’s points, weighted category and assignment-target calculations. See formulas, worked examples and the limits of each supported model.',
		label: 'Grade calculation methodology',
		kind: 'guide'
	},
	{
		path: '/methodology/calculator-validation',
		title: 'Calculator validation and synthetic reference cases | Grademaxxing',
		description:
			'Check grade calculator arithmetic against fictional reference cases, expected results and explicit assumptions. Validation does not establish district policy support.',
		label: 'Calculator validation',
		kind: 'guide',
		parent: '/methodology/grade-calculations'
	}
] as const satisfies readonly PublicPage[];

export type PublicPagePath = (typeof PUBLIC_PAGES)[number]['path'];

export function normalizePublicPath(pathname: string) {
	const path = pathname.split(/[?#]/, 1)[0] ?? '/';
	return path.replace(/\/+$/, '') || '/';
}

export function getPublicPage(pathname: string): PublicPage | undefined {
	const path = normalizePublicPath(pathname);
	return PUBLIC_PAGES.find((entry) => entry.path === path);
}

/** Never derive a canonical origin from a request, proxy header or client input. */
export function canonicalUrl(pathname: string) {
	const entry = getPublicPage(pathname);
	if (!entry) throw new Error('A canonical URL requires a registered public page.');
	return `${SITE_ORIGIN}${entry.path}`;
}

export function socialImagePath(pathname: string) {
	const entry = getPublicPage(pathname);
	if (!entry) throw new Error('A social image requires a registered public page.');
	const slug = entry.path === '/' ? 'home' : entry.path.slice(1).replaceAll('/', '-');
	return `/og/${slug}.png`;
}

export function isProductionHost(hostname: string) {
	return hostname.toLowerCase() === new URL(SITE_ORIGIN).hostname;
}

export function publicPageSchema(entry: PublicPage) {
	const url = canonicalUrl(entry.path);
	const graph: Record<string, unknown>[] = [
		{
			'@type': 'WebSite',
			'@id': `${SITE_ORIGIN}/#website`,
			url: `${SITE_ORIGIN}/`,
			name: SITE_NAME,
			inLanguage: 'en'
		},
		{
			'@type': 'WebPage',
			'@id': `${url}#webpage`,
			url,
			name: entry.title,
			description: entry.description,
			isPartOf: { '@id': `${SITE_ORIGIN}/#website` },
			inLanguage: 'en'
		}
	];
	if (entry.path !== '/') {
		const parent = entry.parent ? getPublicPage(entry.parent) : undefined;
		const ancestors = [getPublicPage('/')!, ...(parent ? [parent] : []), entry];
		graph.push({
			'@type': 'BreadcrumbList',
			'@id': `${url}#breadcrumbs`,
			itemListElement: ancestors.map((item, index) => ({
				'@type': 'ListItem',
				position: index + 1,
				name: item.label,
				item: canonicalUrl(item.path)
			}))
		});
	}
	if (entry.kind === 'calculator') {
		graph.push({
			'@type': 'WebApplication',
			'@id': `${url}#calculator`,
			name: entry.label,
			url,
			description: entry.description,
			applicationCategory: 'EducationalApplication',
			operatingSystem: 'Web browser',
			isAccessibleForFree: true
		});
	}
	return { '@context': 'https://schema.org', '@graph': graph };
}

/** JSON-LD is raw script text: escape markup delimiters before emitting it. */
export function serializeSchema(value: unknown) {
	return JSON.stringify(value)
		.replaceAll('<', '\\u003c')
		.replaceAll('>', '\\u003e')
		.replaceAll('&', '\\u0026');
}

export function schemaScript(value: unknown) {
	return `<script type="application/ld+json">${serializeSchema(value)}</script>`;
}
