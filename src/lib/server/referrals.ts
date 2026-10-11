import { protectedStudentUsageKey } from '$lib/server/analytics/usage';
import { randomUUID } from 'node:crypto';

type D1Statement = {
	bind: (...values: unknown[]) => D1Statement;
	run: () => Promise<{ meta?: { changes?: number } }>;
	first: <T>() => Promise<T | null>;
	all: <T>() => Promise<{ results?: T[] }>;
};

type ReferralDatabase = { prepare: (query: string) => D1Statement };
type WorkerPlatform = { env?: { GRADEMAXXING_USAGE_DB?: ReferralDatabase } };

export const referralCodeCookie =
	process.env.NODE_ENV === 'production' ? '__Host-grademaxxing_referral' : 'grademaxxing_referral';
export const referralCodeMaxAge = 30 * 24 * 60 * 60;

export type ReferralPartnerSummary = {
	id: string;
	code: string;
	firstName: string;
	lastName: string;
	email: string;
	createdAt: string;
	active: boolean;
	referrals: number;
	lastReferralAt: string | null;
};

function database(platform: unknown) {
	return (platform as WorkerPlatform | undefined)?.env?.GRADEMAXXING_USAGE_DB;
}

function normalizedEmail(email: string) {
	return email.trim().toLowerCase();
}

function validName(value: string) {
	return value.trim().length >= 1 && value.trim().length <= 80;
}

export function validReferralIdentity(firstName: string, lastName: string, email: string) {
	return (
		validName(firstName) &&
		validName(lastName) &&
		email.length <= 254 &&
		/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail(email))
	);
}

function nameCode(name: string) {
	return name
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[^a-z0-9]/g, '')
		.slice(0, 80);
}

export async function createReferralPartner(
	platform: unknown,
	identity: { firstName: string; lastName: string; email: string }
) {
	const db = database(platform);
	if (!db) return undefined;
	const record = {
		id: randomUUID(),
		firstName: identity.firstName.trim(),
		lastName: identity.lastName.trim(),
		email: normalizedEmail(identity.email),
		createdAt: Date.now()
	};
	const firstNameCode = nameCode(record.firstName) || 'share';
	const withInitial = `${firstNameCode}${nameCode(record.lastName).charAt(0)}`;
	for (let attempt = 0; attempt < 100; attempt++) {
		const code =
			attempt === 0 ? firstNameCode : attempt === 1 ? withInitial : `${withInitial}${attempt}`;
		// The unique code constraint chooses the winner even for simultaneous creations.
		// Email conflicts still fail, so the same partner cannot be registered twice.
		const result = await db
			.prepare(
				`INSERT INTO referral_partners
				 (id, code, first_name, last_name, email, created_at, active)
				 VALUES (?, ?, ?, ?, ?, ?, 1)
				 ON CONFLICT(code) DO NOTHING`
			)
			.bind(record.id, code, record.firstName, record.lastName, record.email, record.createdAt)
			.run();
		if (result.meta?.changes === 1) return { ...record, code };
	}
	throw new Error('No referral link is available for this name.');
}

export async function getReferralLeaderboard(platform: unknown) {
	const db = database(platform);
	if (!db) return undefined;
	const result = await db
		.prepare(
			`SELECT partners.id, partners.code,
			 partners.first_name AS firstName, partners.last_name AS lastName,
			 partners.email, partners.created_at AS createdAt, partners.active,
			 COUNT(attributions.student_key) AS referrals,
			 MAX(attributions.created_at) AS lastReferralAt
			 FROM referral_partners partners
			 LEFT JOIN referral_attributions attributions ON attributions.partner_id = partners.id
			 GROUP BY partners.id
			 ORDER BY referrals DESC, partners.created_at ASC`
		)
		.all<{
			id: string;
			code: string;
			firstName: string;
			lastName: string;
			email: string;
			createdAt: number;
			active: number;
			referrals: number;
			lastReferralAt: number | null;
		}>();
	return (result.results ?? []).map((row): ReferralPartnerSummary => ({
		...row,
		createdAt: new Date(Number(row.createdAt)).toISOString(),
		active: Number(row.active) === 1,
		referrals: Number(row.referrals),
		lastReferralAt: row.lastReferralAt ? new Date(Number(row.lastReferralAt)).toISOString() : null
	}));
}

export async function getReferralPartner(platform: unknown, code: string) {
	const db = database(platform);
	if (!db) return undefined;
	return db
		.prepare(
			`SELECT id, first_name AS firstName, last_name AS lastName
			 FROM referral_partners WHERE code = ? AND active = 1`
		)
		.bind(code)
		.first<{ id: string; firstName: string; lastName: string }>();
}

export async function recordNewStudentReferral(
	platform: unknown,
	code: string | undefined,
	domain: string,
	username: string
) {
	const db = database(platform);
	const secret = process.env.GRADEMAXXING_ANALYTICS_HMAC_SECRET;
	// Accept simple names and existing invitations until their partners are removed.
	if (!db || !secret || !code || !/^[a-z0-9]{1,83}(?:-[0-9a-f]{8})?$/.test(code)) return false;
	const studentKey = protectedStudentUsageKey(domain, username, secret);
	const result = await db
		.prepare(
			`INSERT INTO referral_attributions (partner_id, student_key, created_at)
			 SELECT partners.id, students.student_key, ?
			 FROM referral_partners partners
			 JOIN unique_student_usage students ON students.student_key = ?
			 WHERE partners.code = ? AND partners.active = 1
			 ON CONFLICT(student_key) DO NOTHING`
		)
		.bind(Date.now(), studentKey, code)
		.run();
	return result.meta?.changes === 1;
}
