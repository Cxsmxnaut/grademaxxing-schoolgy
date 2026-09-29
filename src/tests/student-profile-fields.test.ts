import { expect, test } from 'vitest';
import { normalizeProfileFields } from '../routes/(authed)/studentinfo/studentInfo.svelte';

test('coerces non-string profile field values to displayable text', () => {
	// The StudentVUE portal and older caches can hand back numbers, nulls, and
	// blanks. Presentation code calls string methods on every value, so a
	// non-string here once crashed the whole page ("0.trim is not a function").
	const fields = normalizeProfileFields({
		Counselor: 'Ms. Alvarez',
		Locker: 0,
		Grade: 9,
		Empty: '',
		Missing: null,
		Undefined: undefined
	});

	expect(fields).toEqual({
		Counselor: 'Ms. Alvarez',
		Locker: '0',
		Grade: '9'
	});
});

test('rejects malformed profile field payloads', () => {
	expect(normalizeProfileFields(null)).toEqual({});
	expect(normalizeProfileFields(undefined)).toEqual({});
	expect(normalizeProfileFields([['Locker', 'B-214']])).toEqual({});
	expect(normalizeProfileFields('Locker=B-214')).toEqual({});
});
