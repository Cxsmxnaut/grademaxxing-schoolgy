import { load } from 'cheerio';
import { Pxp2Client } from '../src/lib/server/pxp2';

const username = process.env.STUDENTVUE_USERNAME;
const password = process.env.STUDENTVUE_PASSWORD;
const district = process.env.DISTRICT_URL;
if (!username || !password || !district)
	throw new Error('StudentVUE environment variables are required.');

const client = await Pxp2Client.login(district, { username, password });
const observedCalls: Array<Record<string, unknown>> = [];
const originalClientSideCall = (client as any).clientSideCall.bind(client);
(client as any).clientSideCall = async (
	friendlyName: string,
	method: string,
	parameters: unknown
) => {
	const result = await originalClientSideCall(friendlyName, method, parameters);
	observedCalls.push({ kind: 'client', friendlyName, method, result: safeShape(result) });
	return result;
};
const originalServiceCall = (client as any).serviceCall.bind(client);
(client as any).serviceCall = async (method: string, body: unknown, property?: string) => {
	const result = await originalServiceCall(method, body, property);
	const serialized = JSON.stringify(result);
	observedCalls.push({
		kind: 'service',
		method,
		property,
		contracts: [...new Set(serialized.match(/pxp\.[a-z0-9_.-]+/gi) ?? [])].toSorted(),
		result: safeShape(result)
	});
	return result;
};

const html = (await (client as any).pageHtml('gradebook')) as string;
const $ = load(html);
const scripts = $('script[src]')
	.map((_, element) => $(element).attr('src'))
	.get()
	.filter((source): source is string => Boolean(source));

await client.gradebook();

console.log(
	JSON.stringify(
		{
			pageVariables: [...html.matchAll(/\bPXP\.[A-Za-z0-9_]+\s*=/g)]
				.map((match) => match[0]!.replace(/\s*=.*/, ''))
				.toSorted(),
			scriptCount: scripts.length,
			observedCalls
		},
		null,
		2
	)
);

function safeShape(value: unknown, depth = 0): unknown {
	if (depth > 6) return '<max-depth>';
	if (
		value === null ||
		value === undefined ||
		typeof value === 'boolean' ||
		typeof value === 'number'
	)
		return value;
	if (typeof value === 'string') {
		const trimmed = value.trim();
		if (/^-?\d+(?:\.\d+)?%?$/.test(trimmed)) return trimmed;
		return `<text:${trimmed.length}>`;
	}
	if (Array.isArray(value))
		return {
			length: value.length,
			samples: value.slice(0, 3).map((item) => safeShape(item, depth + 1))
		};
	if (typeof value === 'object') {
		return Object.fromEntries(
			Object.entries(value as Record<string, unknown>).map(([key, item]) => [
				key,
				safeShape(item, depth + 1)
			])
		);
	}
	return `<${typeof value}>`;
}
