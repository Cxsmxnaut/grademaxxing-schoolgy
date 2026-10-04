import { Pxp2Client, type Pxp2TimingSpan } from '$lib/server/pxp2';
import { afterEach, expect, test, vi } from 'vitest';

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

const state = {
	baseUrl: 'https://ca-example-psv.edupoint.com/',
	cookies: { ASP_NET_SessionId: 'synthetic-session' }
};

test('upstream timing separates response headers from a delayed complete body read', async () => {
	let now = 0;
	vi.spyOn(performance, 'now').mockImplementation(() => now);
	let controller!: ReadableStreamDefaultController<Uint8Array>;
	const spans: Pxp2TimingSpan[] = [];
	vi.stubGlobal(
		'fetch',
		vi.fn<typeof fetch>().mockImplementation(async () => {
			now = 12;
			return new Response(
				new ReadableStream<Uint8Array>({
					start(value) {
						controller = value;
					}
				})
			);
		})
	);
	const client = Pxp2Client.resume(state, undefined, (span) => spans.push(span));
	const read = client.keepAlive();
	await vi.waitFor(() =>
		expect(spans).toEqual([{ name: 'keepalive_portal_network', durationMs: 12 }])
	);
	now = 37;
	controller.enqueue(new TextEncoder().encode('<title>StudentVUE</title>'));
	controller.close();
	await read;
	expect(spans).toEqual([
		{ name: 'keepalive_portal_network', durationMs: 12 },
		{ name: 'keepalive_portal_body', durationMs: 25 }
	]);
	expect(client.exportSessionState()).toEqual(state);
});

test('gradebook timing uses class and missing-detail ordinals without leaking identifiers', async () => {
	const focus = (id: string) =>
		JSON.stringify({
			LoadParams: { ControlName: 'Gradebook_ClassDetails' },
			FocusArgs: { classID: id }
		}).replaceAll('"', '&quot;');
	const page = `<script>PXP.GBCurrentFocus = {"FocusArgs":{"gradePeriodGU":"synthetic-period","AGU":"synthetic-student"}};</script>
	<script>PXP.GBFocusData = {"GradingPeriods":[{"GU":"synthetic-period","defaultFocus":true,"Name":"Quarter 1"}]};</script>
	${['synthetic-course-a', 'synthetic-course-b']
		.map(
			(id, index) =>
				`<div class="gb-class-header"><span class="course-title" data-focus="${focus(id)}">${index + 1}: Synthetic class</span></div>
		<div class="gb-class-row" data-guid="${id}"><span class="mark">A</span></div>`
		)
		.join('')}`;
	const spans: Pxp2TimingSpan[] = [];
	vi.stubGlobal(
		'fetch',
		vi.fn<typeof fetch>().mockImplementation(async (input) => {
			const path = String(input);
			if (path.includes('PXP2_Gradebook.aspx')) return new Response(page);
			if (path.includes('GradebookFocusClassInfo'))
				return Response.json({
					d: {
						Data: {
							Classes: [
								{ ID: 'synthetic-course-a', Name: 'Synthetic class' },
								{ ID: 'synthetic-course-b', Name: 'Synthetic class' }
							]
						}
					}
				});
			if (path.includes('LoadControl'))
				return Response.json({
					d: {
						Data: { html: '<div id="AssignmentsGrid"></div><script>{"dataSource":[]}</script>' }
					}
				});
			if (path.includes('GetClassData'))
				return Response.json({
					assignments: [{ gradeBookId: 'synthetic-omitted-work', score: 8 }]
				});
			throw new Error('Unexpected synthetic request.');
		})
	);
	await Pxp2Client.resume(state, undefined, (span) => spans.push(span)).gradebook(
		undefined,
		false,
		true
	);
	const names = spans.map((span) => span.name);
	expect(names).toEqual(
		expect.arrayContaining([
			'gb_context_network',
			'gb_context_body',
			'gb_context_parse',
			'gb_classes_network',
			'gb_classes_body',
			'gb_headers_parse',
			'gb_class_detail_1_network',
			'gb_class_detail_1_body',
			'gb_class_parse_1',
			'gb_class_data_1_network',
			'gb_class_data_1_body',
			'gb_assignment_detail_1_1_network',
			'gb_assignment_detail_1_1_body',
			'gb_assignment_parse_1_1',
			'gb_class_prepare_1',
			'gb_class_reconcile_1',
			'gb_class_detail_2_network',
			'gb_class_detail_2_body',
			'gb_assignment_detail_2_1_network',
			'gb_assignment_detail_2_1_body',
			'gb_result'
		])
	);
	expect(names.indexOf('gb_class_reconcile_1')).toBeLessThan(
		names.indexOf('gb_class_detail_2_network')
	);
	for (const span of spans) {
		expect(Object.keys(span).sort()).toEqual(['durationMs', 'name']);
		expect(span.durationMs).toBeGreaterThanOrEqual(0);
		expect(span.name).not.toMatch(/synthetic|example|https|StudentVUE/);
	}
});

test('failed upstream body reads record their elapsed stage without the error text', async () => {
	let now = 0;
	vi.spyOn(performance, 'now').mockImplementation(() => now);
	const spans: Pxp2TimingSpan[] = [];
	vi.stubGlobal(
		'fetch',
		vi.fn<typeof fetch>().mockImplementation(async () => {
			now = 7;
			return new Response(
				new ReadableStream<Uint8Array>({
					pull(controller) {
						now = 19;
						controller.error(new Error('Synthetic private portal message'));
					}
				})
			);
		})
	);
	await expect(
		Pxp2Client.resume(state, undefined, (span) => spans.push(span)).keepAlive()
	).rejects.toThrow();
	expect(spans.map((span) => span.name)).toEqual([
		'keepalive_portal_network',
		'keepalive_portal_body'
	]);
	expect(JSON.stringify(spans)).not.toContain('private');
});
