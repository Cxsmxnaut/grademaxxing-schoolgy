import { afterEach, expect, test, vi } from 'vitest';

const { privateEnv } = vi.hoisted(() => ({ privateEnv: {} as Record<string, string> }));
vi.mock('$env/dynamic/private', () => ({ env: privateEnv }));

import { matchesSchoologyDistrict, schoologyDistrictDirectory } from '$lib/schoology/districts';
import {
	getSchoologyDistrict,
	getSchoologyDistrictChoices,
	getSchoologyDistricts
} from '$lib/server/schoology-config';

afterEach(() => {
	for (const key of Object.keys(privateEnv)) delete privateEnv[key];
});

test('public directory entries do not authorize OAuth or claim a working connection', () => {
	expect(getSchoologyDistrictChoices()).toHaveLength(5);
	expect(getSchoologyDistrictChoices().every((district) => !district.canConnect)).toBe(true);
	expect(getSchoologyDistricts()).toEqual([]);
	expect(getSchoologyDistrict('fairfax-va')).toBeUndefined();
});

test('only explicit known district IDs plus both credentials make a connection available', () => {
	privateEnv.SCHOOLOGY_ENABLED_DISTRICTS = ' fairfax-va,unknown-id ';
	expect(getSchoologyDistricts().map((district) => district.id)).toEqual(['fairfax-va']);
	expect(getSchoologyDistrictChoices().every((district) => !district.canConnect)).toBe(true);
	privateEnv.SCHOOLOGY_CONSUMER_KEY = 'fictional-key';
	privateEnv.SCHOOLOGY_CONSUMER_SECRET = 'fictional-secret';
	expect(
		getSchoologyDistrictChoices()
			.filter((district) => district.canConnect)
			.map((district) => district.id)
	).toEqual(['fairfax-va']);
});

test('custom configuration rejects unsafe origins and deduplicates configured districts', () => {
	privateEnv.SCHOOLOGY_DISTRICTS = JSON.stringify([
		{ id: 'fictional', name: 'Fictional School', schoolUrl: 'https://school.example.org' },
		{ id: 'fictional', name: 'Fictional School', schoolUrl: 'https://school.example.org' },
		{ id: 'insecure', name: 'Insecure', schoolUrl: 'http://school.example.org' },
		{
			id: 'credential',
			name: 'Credential URL',
			schoolUrl: 'https://user:secret@school.example.org'
		},
		{ id: 'path', name: 'Path URL', schoolUrl: 'https://school.example.org/login' }
	]);
	expect(getSchoologyDistricts().map((district) => district.id)).toEqual(['fictional']);
	privateEnv.SCHOOLOGY_DISTRICTS = '{invalid-json';
	expect(getSchoologyDistricts()).toEqual([]);
});

test('search handles abbreviations, region, hostname, and multiple terms without mixing up FCPS districts', () => {
	const search = (query: string) =>
		schoologyDistrictDirectory
			.filter((district) => matchesSchoologyDistrict(district, query))
			.map((district) => district.id);
	expect(search('FCPS')).toEqual(['fairfax-va', 'frederick-md']);
	expect(search('  FCPS  VA ')).toEqual(['fairfax-va']);
	expect(search('lms.fcps.org')).toEqual(['frederick-md']);
	expect(search('california')).toEqual(['lausd-ca']);
	expect(search('unknown district')).toEqual([]);
});
