import assert from 'node:assert/strict';
import test from 'node:test';
import { SchoologyClient } from '../src/index.js';
import { json, mockFetch, options } from './fixtures.js';

test('all pages are read, historical HTTP links upgraded, and each request freshly signed', async () => {
	const calls: { url: URL; init: RequestInit }[] = [];
	const client = new SchoologyClient({
		...options,
		fetch: mockFetch((url, init) => {
			calls.push({ url, init });
			return json(
				url.searchParams.has('start')
					? { section: [{ id: '2' }] }
					: {
							section: [{ id: '1' }],
							links: { next: 'http://api.schoology.com/v1/users/7/sections?start=100' }
						}
			);
		})
	});
	assert.deepEqual(await client.getSections('7'), [{ id: '1' }, { id: '2' }]);
	assert.equal(calls[1]!.url.protocol, 'https:');
	assert.equal(calls[0]!.init.redirect, 'manual');
	assert.notEqual(
		new Headers(calls[0]!.init.headers).get('authorization'),
		new Headers(calls[1]!.init.headers).get('authorization')
	);
	assert.ok(calls.every((call) => call.init.method === 'GET'));
	assert.equal(JSON.stringify(client), '{}');
});

test('same-origin 303 profile redirects are re-signed', async () => {
	const calls: string[] = [];
	const client = new SchoologyClient({
		...options,
		fetch: mockFetch((url) => {
			calls.push(url.pathname);
			return url.pathname.endsWith('/me')
				? new Response(null, { status: 303, headers: { location: '/v1/users/7' } })
				: json({ uid: 7 });
		})
	});
	assert.equal((await client.getMe()).uid, 7);
	assert.deepEqual(calls, ['/v1/users/me', '/v1/users/7']);
});

test('reading inbox message details preserves the existing unread state', async () => {
	let requestUrl: URL | undefined;
	const client = new SchoologyClient({
		...options,
		fetch: mockFetch((url) => {
			requestUrl = url;
			return json({ id: 'message-1', subject: 'Fictional message', message: 'Fictional body' });
		})
	});
	assert.equal((await client.getInboxMessage('message-1')).subject, 'Fictional message');
	assert.equal(requestUrl?.pathname, '/v1/messages/inbox/message-1');
	assert.equal(requestUrl?.searchParams.get('keep_unread'), 'TRUE');
});

for (const next of [
	'https://evil.example/v1/steal',
	'https://api.schoology.com/steal',
	'https://name:secret@api.schoology.com/v1/users',
	'https://api.schoology.com/v1/users?oauth_token=steal'
]) {
	test(`rejects untrusted pagination target: ${next}`, async () => {
		let calls = 0;
		const client = new SchoologyClient({
			...options,
			fetch: mockFetch(() => {
				calls++;
				return json({ section: [], links: { next } });
			})
		});
		await assert.rejects(client.getSections('7'), { code: 'URL' });
		assert.equal(calls, 1);
	});
}

test('redirects cannot forward authorization to another origin', async () => {
	let calls = 0;
	const client = new SchoologyClient({
		...options,
		fetch: mockFetch(() => {
			calls++;
			return new Response(null, {
				status: 302,
				headers: { location: 'https://evil.example/v1/users' }
			});
		})
	});
	await assert.rejects(client.getMe(), { code: 'URL' });
	assert.equal(calls, 1);
});

test('pagination cycles and page limits fail explicitly instead of returning partial grades', async () => {
	const client = new SchoologyClient({
		...options,
		fetch: mockFetch(() => json({ section: [], links: { next: '?limit=100' } }))
	});
	await assert.rejects(client.getSections('7'), { code: 'PAGINATION' });
	const limited = new SchoologyClient({
		...options,
		maxPages: 1,
		fetch: mockFetch(() => json({ section: [], links: { next: '?start=100' } }))
	});
	await assert.rejects(limited.getSections('7'), { code: 'PAGINATION' });
});

test('HTTP errors expose a useful code and retry delay without leaking response contents', async () => {
	for (const [status, code] of [
		[401, 'AUTH'],
		[403, 'PERMISSION'],
		[429, 'RATE_LIMIT']
	] as const) {
		const client = new SchoologyClient({
			...options,
			fetch: mockFetch(
				() =>
					new Response('secret student information', { status, headers: { 'retry-after': '12' } })
			)
		});
		await assert.rejects(client.getMe(), (error: any) => {
			assert.equal(error.code, code);
			assert.equal(error.retryAfterSeconds, 12);
			assert.ok(!JSON.stringify(error).includes('secret'));
			return true;
		});
	}
});

test('invalid JSON, missing collections and network failures do not become empty gradebooks', async () => {
	for (const [response, code] of [
		[new Response('<html>Login</html>'), 'RESPONSE'],
		[json({}), 'RESPONSE']
	] as const) {
		const client = new SchoologyClient({ ...options, fetch: mockFetch(() => response) });
		await assert.rejects(client.getSections('7'), { code });
	}
	const client = new SchoologyClient({
		...options,
		fetch: mockFetch(() => {
			throw new Error('secret');
		})
	});
	await assert.rejects(client.getMe(), { code: 'NETWORK', message: 'Schoology request failed.' });
});

test('gradebook reads merge enrollment pages, separate official grades, and tolerate hidden metadata', async () => {
	const client = new SchoologyClient({
		...options,
		fetch: mockFetch((url) => {
			if (url.pathname.endsWith('/users/me'))
				return json({ uid: '7', name_display: 'Fictional Student' });
			if (url.pathname.endsWith('/users/7/sections'))
				return json({ section: [{ id: '9', course_title: 'Math' }] });
			if (url.pathname.endsWith('/users/7/grades')) {
				if (url.searchParams.has('start'))
					return json({
						section: [
							{
								section_id: '9',
								period: [
									{
										period_id: 'p1',
										assignment: [{ assignment_id: 'b', grade: null, max_points: 10, exception: 1 }]
									}
								]
							}
						]
					});
				return json({
					section: [
						{
							section_id: '9',
							period: [
								{
									period_id: 'p1',
									period_title: 'Semester 1',
									assignment: [
										{
											assignment_id: 'a',
											grade: '0',
											max_points: '10',
											category_id: 'c',
											exception: 0
										}
									]
								}
							],
							final_grade: [{ period_id: 'p1', grade: 'B+' }]
						}
					],
					links: { next: '?start=100' }
				});
			}
			if (url.pathname.endsWith('/sections/9'))
				return json({ id: '9', options: { weighted_grading_categories: '1' } });
			if (url.pathname.endsWith('/assignments'))
				return json({
					assignment: [
						{
							id: 'a',
							title: 'Quiz',
							grading_period: 1,
							grading_category: 'c',
							max_points: 10,
							factor: 2
						},
						{ id: 'c', title: 'Upcoming', grading_period: 1, grading_category: 'c', max_points: 20 }
					]
				});
			return new Response(null, { status: 403 });
		})
	});
	const snapshot = await client.getGradebook();
	assert.equal(snapshot.user.displayName, 'Fictional Student');
	const course = snapshot.courses[0]!;
	const period = course.periods[0]!;
	assert.equal(course.weightedCategories, true);
	assert.equal(period.officialGrade, 'B+');
	assert.equal(course.periods.length, 1);
	assert.equal(period.assignments.length, 3);
	assert.equal(period.assignments[0]!.score, 0);
	assert.equal(period.assignments[0]!.factor, 2);
	assert.equal(period.assignments[1]!.status, 'excused');
	assert.equal(period.assignments[2]!.status, 'ungraded');
	assert.ok(snapshot.warnings.some((warning) => warning.includes('403')));
});

test('an auth failure in optional metadata stops the snapshot instead of disguising it as a permission warning', async () => {
	const client = new SchoologyClient({
		...options,
		fetch: mockFetch((url) => {
			if (url.pathname.endsWith('/users/me')) return json({ uid: '7' });
			if (url.pathname.endsWith('/sections')) return json({ section: [{ id: '9' }] });
			if (url.pathname.endsWith('/grades')) return json({ section: [] });
			return new Response(null, { status: 401 });
		})
	});
	await assert.rejects(client.getGradebook(), { code: 'AUTH' });
});
