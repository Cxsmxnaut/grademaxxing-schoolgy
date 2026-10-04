/** Diagnostics are request-scoped and opt-in; no portal values belong in a span. */
export const timingRequestHeader = 'X-Grademaxxing-Timing';

export type RequestTimingSpan = { name: string; durationMs: number };

const maximumSpans = 256;
const maximumHeaderBytes = 12 * 1024;
const fixedNames = new Set([
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
const classOperation =
	/^gb_(?:class_detail|class_data|course_items|grade_card)_[1-9]\d{0,2}_(?:network|body)$/;
const classParse = /^gb_class_(?:parse|prepare|reconcile)_[1-9]\d{0,2}$/;
const assignmentOperation = /^gb_assignment_detail_[1-9]\d{0,2}_[1-9]\d{0,2}_(?:network|body)$/;
const assignmentParse = /^gb_assignment_parse_[1-9]\d{0,2}_[1-9]\d{0,2}$/;
const safeName = (name: string) =>
	!/[^a-z0-9_]/.test(name) &&
	(fixedNames.has(name) ||
		classOperation.test(name) ||
		classParse.test(name) ||
		assignmentOperation.test(name) ||
		assignmentParse.test(name));
const durationFormat = new Intl.NumberFormat('en-US', {
	useGrouping: false,
	minimumFractionDigits: 1,
	maximumFractionDigits: 1
});

/** Preserve timing entries added by another part of the request. */
export function appendServerTiming(headers: Headers, value: string): void {
	if (value.trim()) headers.append('Server-Timing', value);
}

export class RequestTiming {
	private readonly spans: RequestTimingSpan[] = [];

	constructor(private readonly clock: () => number = () => performance.now()) {}

	record(span: RequestTimingSpan): void {
		if (
			this.spans.length >= maximumSpans ||
			!safeName(span.name) ||
			!Number.isFinite(span.durationMs) ||
			span.durationMs < 0
		) {
			return;
		}
		this.spans.push({ name: span.name, durationMs: Math.max(0, span.durationMs) });
	}

	start(name: string): () => void {
		const startedAt = this.clock();
		let finished = false;
		return () => {
			if (finished) return;
			finished = true;
			this.record({ name, durationMs: this.clock() - startedAt });
		};
	}

	measureSync<T>(name: string, operation: () => T): T {
		const finish = this.start(name);
		try {
			return operation();
		} finally {
			finish();
		}
	}

	async measure<T>(name: string, operation: () => Promise<T>): Promise<T> {
		const finish = this.start(name);
		try {
			return await operation();
		} finally {
			finish();
		}
	}

	append(headers: Headers): void {
		let headerBytes = new TextEncoder().encode(headers.get('Server-Timing') ?? '').byteLength;
		const entries: string[] = [];
		for (const span of this.spans) {
			const entry = `${span.name};dur=${durationFormat.format(span.durationMs)}`;
			const bytes = entry.length + (headerBytes > 0 ? 2 : 0);
			if (headerBytes + bytes > maximumHeaderBytes) break;
			entries.push(entry);
			headerBytes += bytes;
		}
		appendServerTiming(headers, entries.join(', '));
	}
}
