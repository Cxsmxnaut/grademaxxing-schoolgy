export type SchoologyDistrict = {
	id: string;
	name: string;
	schoolUrl: string;
	region?: string;
	aliases?: string[];
	sourceUrl?: string;
};

export type SchoologyDistrictChoice = SchoologyDistrict & { canConnect: boolean };

// Public district documentation verifies these destinations, not approval of our app.
// Checked 2026-10-18. Only the server's explicit allowlist can enable OAuth.
export const schoologyDistrictDirectory: SchoologyDistrict[] = [
	{
		id: 'fairfax-va',
		name: 'Fairfax County Public Schools',
		region: 'Virginia',
		aliases: ['FCPS', 'VA'],
		schoolUrl: 'https://lms.fcps.edu',
		sourceUrl: 'https://www.fcps.edu/schoology/students/overview'
	},
	{
		id: 'frederick-md',
		name: 'Frederick County Public Schools',
		region: 'Maryland',
		aliases: ['FCPS', 'MD'],
		schoolUrl: 'https://lms.fcps.org',
		sourceUrl: 'https://sites.google.com/fcps.org/schoology/getting-started'
	},
	{
		id: 'baltimore-md',
		name: 'Baltimore County Public Schools',
		region: 'Maryland',
		aliases: ['BCPS', 'MD'],
		schoolUrl: 'https://bcps.schoology.com',
		sourceUrl: 'https://innovationhub.bcps.org/digital-resource-toolbox/schoology'
	},
	{
		id: 'lausd-ca',
		name: 'Los Angeles Unified School District',
		region: 'California',
		aliases: ['LAUSD', 'CA'],
		schoolUrl: 'https://lms.lausd.net',
		sourceUrl: 'https://www.lausd.org/cms/lib/CA01000043/Centricity/Domain/548/signin.pdf'
	},
	{
		id: 'center-line-mi',
		name: 'Center Line Public Schools',
		region: 'Michigan',
		aliases: ['CLPS', 'MI'],
		schoolUrl: 'https://centerline.schoology.com',
		sourceUrl: 'https://www.clps.org/apps/pages/techhelp'
	}
];

export function matchesSchoologyDistrict(district: SchoologyDistrict, query: string): boolean {
	const searchable = [
		district.name,
		district.region,
		district.schoolUrl,
		...(district.aliases ?? [])
	]
		.join(' ')
		.toLocaleLowerCase();
	return query
		.trim()
		.toLocaleLowerCase()
		.split(/\s+/)
		.every((term) => searchable.includes(term));
}
