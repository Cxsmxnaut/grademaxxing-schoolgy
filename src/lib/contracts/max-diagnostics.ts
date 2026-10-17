export type MaxDiagnosticStatus =
	'running' | 'success' | 'failed' | 'empty' | 'cancelled' | 'incomplete';
export type MaxReportReason = 'empty' | 'incorrect' | 'unhelpful' | 'formatting';
export type MaxDiagnosticEvent = {
	ms: number;
	type: 'provider' | 'tool';
	name: string;
	outcome: string;
	durationMs: number;
	status?: number | null;
	model?: string;
};
export type MaxDiagnostic = {
	id: string;
	createdAt: number;
	action: 'chat' | 'title';
	topic: string;
	status: MaxDiagnosticStatus;
	question: string | null;
	durationMs: number;
	firstTokenMs: number | null;
	tokenFrames: number;
	outputChars: number;
	provider: string | null;
	model: string | null;
	errorCode: string | null;
	flags: string[];
	events: MaxDiagnosticEvent[];
	reportedReason: MaxReportReason | null;
};
export type MaxDiagnosticSummary = {
	items: MaxDiagnostic[];
	nextBefore: string | null;
	retentionDays: number;
	totals: { requests: number; failed: number; flagged: number; reported: number };
};
