import { DISTRICTS } from '$lib/data/districts';
import { expect, test } from 'vitest';

test('the local StudentVUE district snapshot is complete and deterministic', () => {
	expect(DISTRICTS.length).toBe(829);
	expect(DISTRICTS).toContainEqual({
		state: 'California',
		name: 'Pleasanton Unified School District',
		domain: 'ca-pleas-psv.edupoint.com'
	});
	expect(new Set(DISTRICTS.map(({ name, domain }) => `${name}\n${domain}`)).size).toBe(
		DISTRICTS.length
	);
});

test('every district entry is safe to place in the server allowlist', () => {
	for (const district of DISTRICTS) {
		expect(district.name.trim()).toBe(district.name);
		expect(district.state.trim()).toBe(district.state);
		expect(district.domain).toMatch(/^[a-z0-9._/-]+$/);
		const portal = new URL(`https://${district.domain}`);
		expect(portal.protocol).toBe('https:');
		expect(portal.username).toBe('');
		expect(portal.password).toBe('');
		expect(portal.port).toBe('');
		expect(portal.hostname).not.toMatch(/(^|\.)(localhost|local)$/);
		expect(portal.pathname).not.toContain('..');
		expect(portal.search).toBe('');
		expect(portal.hash).toBe('');
	}
});
