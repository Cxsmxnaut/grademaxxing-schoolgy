/** Opt-in, in-memory timings. Never retain request URLs, headers, bodies, or identity. */
export type ServerMetric = { name: string; durationMs: number };
export type RefreshAttempt = {
	attempt: number;
	retryAttempt: number;
	startedMs: number;
	elapsedMs?: number;
	status?: number;
	toHeadersMs?: number;
	bodyMs?: number;
	retryDelayMs?: number;
	error?: boolean;
	server: ServerMetric[];
};
export type RefreshRequest = {
	ordinal: number;
	path: string;
	queuedMs: number;
	queueWaitMs?: number;
	totalMs?: number;
	attempts: RefreshAttempt[];
};
export type RefreshTimingResult = {
	complete: boolean;
	elapsedMs: number;
	phases: { name: 'session' | 'grades'; durationMs: number }[];
	requests: RefreshRequest[];
};

const paths = new Set([
	'/api/session',
	'/api/session/keepalive',
	'/api/studentvue/gradebook',
	'/api/studentvue/attendance',
	'/api/studentvue/documents',
	'/api/studentvue/messages',
	'/api/studentvue/student-info'
]);
const fixedMetrics = new Set([
	'app',
	'session_decode',
	'queue',
	'session_encode',
	'usage',
	'gradebook_xml',
	'response_encode',
	'gb_context_network',
	'gb_context_body',
	'gb_period_network',
	'gb_period_body',
	'gb_classes_network',
	'gb_classes_body',
	'gb_context_parse',
	'gb_headers_parse',
	'gb_result',
	'keepalive_portal_network',
	'keepalive_portal_body',
	'attendance_portal_network',
	'attendance_portal_body',
	'attendance_parse',
	'documents_portal_network',
	'documents_portal_body',
	'documents_parse',
	'student_profile_portal_network',
	'student_profile_portal_body',
	'student_profile_parse',
	'student_photo_network',
	'student_photo_body',
	'mail_portal_network',
	'mail_portal_body',
	'mail_inbox_network',
	'mail_inbox_body',
	'mail_parse'
]);
const safeMetricName = (name: string) =>
	fixedMetrics.has(name) ||
	/^gb_(?:class_detail|class_data|course_items|grade_card)_[1-9]\d{0,2}_(?:network|body)$/.test(
		name
	) ||
	/^gb_class_(?:parse|prepare|reconcile)_[1-9]\d{0,2}$/.test(name) ||
	/^gb_assignment_detail_[1-9]\d{0,2}_[1-9]\d{0,2}_(?:network|body)$/.test(name) ||
	/^gb_assignment_parse_[1-9]\d{0,2}_[1-9]\d{0,2}$/.test(name);
const rounded = (value: number) => Math.round(Math.max(0, value) * 10) / 10;

export function parseServerMetrics(header: string | null): ServerMetric[] {
	return (header ?? '').split(',').flatMap((entry) => {
		const name = entry.split(';', 1)[0]?.trim() ?? '';
		const duration = entry.match(/;\s*dur\s*=\s*(\d+(?:\.\d+)?)(?:\s*;|\s*$)/)?.[1];
		const durationMs = Number(duration);
		return safeMetricName(name) && duration !== undefined && Number.isFinite(durationMs)
			? [{ name, durationMs }]
			: [];
	});
}

export class RefreshTimingRecorder {
	readonly result: RefreshTimingResult = {
		complete: false,
		elapsedMs: 0,
		phases: [],
		requests: []
	};
	private readonly startedAt: number;
	constructor(
		private readonly clock = () => performance.now(),
		private readonly changed = () => {}
	) {
		this.startedAt = clock();
	}
	now() {
		return this.clock();
	}
	phase(name: 'session' | 'grades', startedAt: number) {
		this.result.phases.push({ name, durationMs: rounded(this.clock() - startedAt) });
		this.changed();
	}
	capture(path: string) {
		const canonicalPath = path.split('?', 1)[0]!;
		if (this.result.complete || !paths.has(canonicalPath)) return undefined;
		const queuedAt = this.clock();
		const request: RefreshRequest = {
			ordinal: this.result.requests.length + 1,
			path: canonicalPath,
			queuedMs: rounded(queuedAt - this.startedAt),
			attempts: []
		};
		this.result.requests.push(request);
		this.changed();
		return {
			ready: () => {
				request.queueWaitMs ??= rounded(this.clock() - queuedAt);
				this.changed();
			},
			attempt: (index: number) => {
				const startedAt = this.clock();
				let headersAt: number | undefined;
				const attempt: RefreshAttempt = {
					attempt: request.attempts.length + 1,
					retryAttempt: index + 1,
					startedMs: rounded(startedAt - this.startedAt),
					server: []
				};
				request.attempts.push(attempt);
				this.changed();
				return {
					headers: (response: Response) => {
						headersAt = this.clock();
						attempt.status = response.status;
						attempt.toHeadersMs = rounded(headersAt - startedAt);
						attempt.server = parseServerMetrics(response.headers.get('Server-Timing'));
						this.changed();
					},
					finish: (error = false) => {
						attempt.elapsedMs = rounded(this.clock() - startedAt);
						if (headersAt !== undefined) attempt.bodyMs = rounded(this.clock() - headersAt);
						if (error) attempt.error = true;
						this.changed();
					},
					retry: (startedAt: number) => {
						attempt.retryDelayMs = rounded(this.clock() - startedAt);
						this.changed();
					}
				};
			},
			finish: () => {
				request.totalMs = rounded(this.clock() - queuedAt);
				this.changed();
			}
		};
	}
	finish() {
		this.result.elapsedMs = rounded(this.clock() - this.startedAt);
		this.result.complete = true;
		this.changed();
	}
}

export type RequestTimingCapture = NonNullable<ReturnType<RefreshTimingRecorder['capture']>>;
let active: RefreshTimingRecorder | undefined;
const subscribers = new Set<(result: RefreshTimingResult | undefined) => void>();
const publish = () => {
	const snapshot = active ? structuredClone(active.result) : undefined;
	for (const subscriber of subscribers) {
		try {
			subscriber(snapshot);
		} catch {
			/* Diagnostics must never interrupt a refresh. */
		}
	}
};
export function beginRefreshTiming() {
	active = new RefreshTimingRecorder(undefined, publish);
	publish();
	return active;
}
export const captureRequestTiming = (path: string) => active?.capture(path);
export function subscribeRefreshTiming(
	subscriber: (result: RefreshTimingResult | undefined) => void
) {
	subscribers.add(subscriber);
	subscriber(active ? structuredClone(active.result) : undefined);
	return () => {
		subscribers.delete(subscriber);
	};
}
