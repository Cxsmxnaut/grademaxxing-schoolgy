export interface Credentials {
	key: string;
	secret: string;
}
export interface OAuthToken {
	key: string;
	secret: string;
}
export type RawRecord = Record<string, unknown>;
export type Query = Record<string, string | number | boolean | undefined>;

export interface ConnectorOptions {
	consumer: Credentials;
	/** Trusted, application-configured district origin, never arbitrary request input. */
	schoolUrl: string;
	token?: OAuthToken;
	apiBase?: string;
	fetch?: typeof globalThis.fetch;
	timeoutMs?: number;
	maxPages?: number;
}

/** Store server-side, bound to the initiating browser session, with an expiry. */
export interface PendingAuthorization {
	requestToken: OAuthToken;
	callbackUrl: string;
	state: string;
	createdAt: number;
}
export interface AuthorizationStart {
	authorizationUrl: string;
	pending: PendingAuthorization;
}

export interface GradingCategory {
	id: string;
	title: string;
	weight: number | null;
	calculation: 'points' | 'percent' | null;
	dropLowest: number | null;
}
export type AssignmentStatus =
	'graded' | 'ungraded' | 'excused' | 'incomplete' | 'missing' | 'unknown';
export interface GradebookAssignment {
	id: string;
	type: string;
	title: string | null;
	categoryId: string | null;
	score: number | null;
	rawGrade: number | string | null;
	maxPoints: number | null;
	factor: number;
	status: AssignmentStatus;
	exception: number | null;
	dueAt: string | null;
	updatedAt: string | null;
	isFinal: boolean;
	hypothetical?: boolean;
}
export interface GradebookPeriod {
	id: string;
	title: string;
	officialGrade: number | string | null;
	assignments: GradebookAssignment[];
}
export interface CourseGradebook {
	id: string;
	title: string;
	sectionTitle: string;
	weightedCategories: boolean | null;
	categories: GradingCategory[];
	periods: GradebookPeriod[];
}
export interface GradebookSnapshot {
	source: 'schoology';
	user: { id: string; displayName: string };
	fetchedAt: string;
	courses: CourseGradebook[];
	warnings: string[];
}
