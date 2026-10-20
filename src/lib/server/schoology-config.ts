import { env } from '$env/dynamic/private';
import {
	schoologyDistrictDirectory,
	type SchoologyDistrict,
	type SchoologyDistrictChoice
} from '$lib/schoology/districts';
import type { ConnectorOptions } from '../../../packages/schoology-connector/dist/index.js';

export type { SchoologyDistrict } from '$lib/schoology/districts';

function getCustomDistricts(): SchoologyDistrict[] {
	const configured = env.SCHOOLOGY_DISTRICTS;
	if (!configured) return [];
	try {
		const value = JSON.parse(configured) as unknown;
		if (!Array.isArray(value)) return [];
		return value.flatMap((item) => {
			if (!item || typeof item !== 'object') return [];
			const record = item as Record<string, unknown>;
			if (
				typeof record.id !== 'string' ||
				!/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(record.id) ||
				typeof record.name !== 'string' ||
				record.name.length < 1 ||
				record.name.length > 100 ||
				typeof record.schoolUrl !== 'string'
			)
				return [];
			try {
				const url = new URL(record.schoolUrl);
				if (
					url.protocol !== 'https:' ||
					url.username ||
					url.password ||
					url.pathname !== '/' ||
					url.search ||
					url.hash
				)
					return [];
				return [{ id: record.id, name: record.name, schoolUrl: url.origin }];
			} catch {
				return [];
			}
		});
	} catch {
		return [];
	}
}

export function getSchoologyDistricts(): SchoologyDistrict[] {
	const enabled = new Set(
		(env.SCHOOLOGY_ENABLED_DISTRICTS ?? '').split(',').map((id) => id.trim())
	);
	return [
		...new Map(
			[
				...schoologyDistrictDirectory.filter((district) => enabled.has(district.id)),
				...getCustomDistricts()
			].map((district) => [district.id, district])
		).values()
	];
}

export function getSchoologyDistrictChoices(): SchoologyDistrictChoice[] {
	const configured = getSchoologyDistricts();
	const enabled = new Set(configured.map((district) => district.id));
	const hasCredentials = Boolean(env.SCHOOLOGY_CONSUMER_KEY && env.SCHOOLOGY_CONSUMER_SECRET);
	return [
		...new Map(
			[...schoologyDistrictDirectory, ...configured].map((district) => [district.id, district])
		).values()
	]
		.map((district) => ({ ...district, canConnect: enabled.has(district.id) && hasCredentials }))
		.sort((a, b) => Number(b.canConnect) - Number(a.canConnect) || a.name.localeCompare(b.name));
}

export function getSchoologyDistrict(id: string) {
	return getSchoologyDistricts().find((district) => district.id === id);
}

export function getSchoologyConnectorOptions(
	district: SchoologyDistrict,
	token?: ConnectorOptions['token'],
	fetch?: typeof globalThis.fetch
): ConnectorOptions {
	const key = env.SCHOOLOGY_CONSUMER_KEY;
	const secret = env.SCHOOLOGY_CONSUMER_SECRET;
	if (!key || !secret) throw new Error('Schoology OAuth is not configured for this local edition.');
	return {
		consumer: { key, secret },
		schoolUrl: district.schoolUrl,
		...(token ? { token } : {}),
		...(fetch ? { fetch } : {})
	};
}
