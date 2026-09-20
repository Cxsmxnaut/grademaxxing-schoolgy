import { protectedStudentUsageKey } from '$lib/server/analytics/usage';
import {
	createReferralPartner,
	getReferralLeaderboard,
	recordNewStudentReferral,
	validReferralIdentity
} from '$lib/server/referrals';
import { afterEach, describe, expect, test } from 'vitest';

type Partner = {
	id: string;
	code: string;
	firstName: string;
	lastName: string;
	email: string;
	createdAt: number;
	active: number;
};
type Attribution = { partnerId: string; studentKey: string; createdAt: number };

const previousSecret = process.env.GRADEMAXXING_ANALYTICS_HMAC_SECRET;
afterEach(() => {
	if (previousSecret === undefined) delete process.env.GRADEMAXXING_ANALYTICS_HMAC_SECRET;
	else process.env.GRADEMAXXING_ANALYTICS_HMAC_SECRET = previousSecret;
});

function referralPlatform() {
	const partners: Partner[] = [];
	const studentKeys = new Set<string>();
	const attributions: Attribution[] = [];
	const database = {
		prepare(query: string) {
			let values: unknown[] = [];
			return {
				bind(...bound: unknown[]) {
					values = bound;
					return this;
				},
				async run() {
					if (query.includes('INSERT INTO referral_partners')) {
						partners.push({
							id: String(values[0]),
							code: String(values[1]),
							firstName: String(values[2]),
							lastName: String(values[3]),
							email: String(values[4]),
							createdAt: Number(values[5]),
							active: 1
						});
						return { meta: { changes: 1 } };
					}
					if (query.includes('INSERT INTO referral_attributions')) {
						const [createdAt, studentKey, code] = values as [number, string, string];
						const partner = partners.find((item) => item.code === code && item.active === 1);
						if (
							!partner ||
							!studentKeys.has(studentKey) ||
							attributions.some((item) => item.studentKey === studentKey)
						)
							return { meta: { changes: 0 } };
						attributions.push({ partnerId: partner.id, studentKey, createdAt });
						return { meta: { changes: 1 } };
					}
					return { meta: { changes: 0 } };
				},
				async first() {
					return null;
				},
				async all() {
					if (!query.includes('FROM referral_partners partners')) return { results: [] };
					return {
						results: partners.map((partner) => {
							const matches = attributions.filter((item) => item.partnerId === partner.id);
							return {
								...partner,
								referrals: matches.length,
								lastReferralAt: matches.at(-1)?.createdAt ?? null
							};
						})
					};
				}
			};
		}
	};
	return { platform: { env: { GRADEMAXXING_USAGE_DB: database } }, studentKeys, attributions };
}

describe('referrals', () => {
	test('validates administrator-created referrer identities', () => {
		expect(validReferralIdentity('Ada', 'Lovelace', 'ada@example.com')).toBe(true);
		expect(validReferralIdentity('', 'Lovelace', 'ada@example.com')).toBe(false);
		expect(validReferralIdentity('Ada', 'Lovelace', 'not-an-email')).toBe(false);
	});

	test('credits a protected D1 student only once after the student exists', async () => {
		process.env.GRADEMAXXING_ANALYTICS_HMAC_SECRET = 'test-only-analytics-secret';
		const { platform, studentKeys, attributions } = referralPlatform();
		const partner = await createReferralPartner(platform, {
			firstName: 'Ada',
			lastName: 'Lovelace',
			email: 'ADA@example.com'
		});
		expect(partner?.code).toMatch(/^ada-[0-9a-f]{8}$/);

		const domain = 'district.example.edu';
		const username = 'new-student';
		expect(await recordNewStudentReferral(platform, partner!.code, domain, username)).toBe(false);
		studentKeys.add(protectedStudentUsageKey(domain, username, 'test-only-analytics-secret'));
		expect(await recordNewStudentReferral(platform, partner!.code, domain, username)).toBe(true);
		expect(await recordNewStudentReferral(platform, partner!.code, domain, username)).toBe(false);
		expect(attributions).toHaveLength(1);
		const leaderboard = await getReferralLeaderboard(platform);
		expect(leaderboard?.[0]).toMatchObject({ firstName: 'Ada', referrals: 1 });
	});
});
