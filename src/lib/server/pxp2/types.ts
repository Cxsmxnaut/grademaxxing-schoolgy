export type Credentials = { username: string; password: string };

export type Pxp2SessionState = {
	baseUrl: string;
	cookies: Record<string, string>;
	messageToken?: string;
	/** Minimal encrypted context needed to probe grade headers without reloading the slow page. */
	gradebookContext?: GradebookContext;
};

/** A payload-free timing record for local performance diagnostics. */
export type Pxp2RequestMetric = {
	path: string;
	status?: number;
	durationMs: number;
	outcome: 'response' | 'network-error' | 'timeout';
};

export type PortalDocument = { id: string; title: string; date: string; category: string };
export type PortalFile = { base64: string; mimeType: string; fileName: string };
export type PortalCalendarEvent = {
	id: string;
	type: string;
	title: string;
	description: string;
	details: string;
	date: string;
	time: string;
};
export type PortalScheduleClass = {
	period: string;
	courseTitle: string;
	teacher: string;
	teacherEmail: string;
	room: string;
	startTime: string;
	endTime: string;
	schoolName: string;
	date: string;
};
export type PortalReportingPeriod = {
	name: string;
	index: number;
	startDate: string;
	endDate: string;
};
export type PortalGradebook = {
	courses: PortalCourse[];
	reportingPeriods: PortalReportingPeriod[];
	selectedPeriod: PortalReportingPeriod;
	/**
	 * False only when the portal's rendered course headers were safely used as a
	 * quick first view. Those headers contain official current marks but not the
	 * assignment/category detail required by charts and what-if calculations.
	 */
	detailed?: boolean;
};

export type CourseFocus = {
	courseId: string;
	control: string;
	parameters: Record<string, unknown>;
};
export type CourseContentItem = Record<string, unknown> & {
	itemID?: unknown;
	title?: unknown;
	assignmentType?: unknown;
	date?: unknown;
	due_date?: unknown;
	gradeMark?: unknown;
	points?: unknown;
	pointsPossible?: unknown;
	commentText?: unknown;
	publicNote?: unknown;
};

export type ClassData = {
	enabled?: unknown;
	isAssignmentWeightingOn?: unknown;
	students?: Array<Record<string, unknown>>;
	measureTypes?: Array<Record<string, unknown>>;
	assignments?: Array<Record<string, unknown>>;
	measureTypeGrades?: Array<Record<string, unknown>>;
};

export type GradingPeriod = {
	Name?: unknown;
	GroupName?: unknown;
	GU?: unknown;
	OrgYearGU?: unknown;
	schoolID?: unknown;
	defaultFocus?: unknown;
	MarkPeriods?: Array<{ Name?: unknown; GU?: unknown }>;
};

export type GradebookContextPeriod = {
	GU: string;
	OrgYearGU: string;
	schoolID: string;
	GroupName: string;
	Name: string;
	markPeriodGU?: string;
	defaultFocus: boolean;
};

export type GradebookContext = {
	AGU: string;
	periods: GradebookContextPeriod[];
};

export type PortalCourse = {
	id: string;
	period: string;
	title: string;
	room: string;
	teacher: string;
	teacherEmail: string;
	score: string;
	scoreRaw: string;
	missing: string;
	categories: PortalGradeCategory[];
	assignments: Array<Record<string, string>>;
};

export type PortalGradeCategory = {
	name: string;
	weight: string;
	points: string;
	pointsPossible: string;
	weightedPercentage: string;
	calculatedMark: string;
};
