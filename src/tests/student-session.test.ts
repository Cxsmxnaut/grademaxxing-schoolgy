import {
	requireStudentSessionContext,
	runStudentOperation,
	StudentOperationAbortedError,
	StudentOperationGate,
	StudentServiceBusyError,
	StudentSessionBusyError
} from '$lib/server/student-session';
import { expect, test, vi } from 'vitest';

type Session = Parameters<typeof runStudentOperation>[0];

function fakeSession(): Session {
	return {
		operationTail: Promise.resolve(),
		queuedOperations: 0
	} as Session;
}

test('student operations are serialized within one portal session', async () => {
	const session = fakeSession();
	const events: string[] = [];
	let releaseFirst!: () => void;
	const firstMayFinish = new Promise<void>((resolve) => {
		releaseFirst = resolve;
	});

	const first = runStudentOperation(session, async () => {
		events.push('first:start');
		await firstMayFinish;
		events.push('first:end');
	});
	const second = runStudentOperation(session, async () => {
		events.push('second:start');
		events.push('second:end');
	});

	await vi.waitFor(() => expect(events).toEqual(['first:start']));
	releaseFirst();
	await Promise.all([first, second]);
	expect(events).toEqual(['first:start', 'first:end', 'second:start', 'second:end']);
	expect(session.queuedOperations).toBe(0);
});

test('one session cannot build an unbounded request queue', async () => {
	const session = fakeSession();
	let release!: () => void;
	const blocked = new Promise<void>((resolve) => {
		release = resolve;
	});
	const accepted = Array.from({ length: 12 }, () => runStudentOperation(session, () => blocked));

	await expect(runStudentOperation(session, async () => undefined)).rejects.toBeInstanceOf(
		StudentSessionBusyError
	);
	release();
	await Promise.all(accepted);
	expect(session.queuedOperations).toBe(0);
});

test('a stale browser tab cannot use a replacement student session', () => {
	const session = {
		...fakeSession(),
		clientSessionId: 'current-session'
	};
	expect(() => requireStudentSessionContext(session, 'current-session')).not.toThrow();
	expect(() => requireStudentSessionContext(session, 'stale-session')).toThrow(
		'different StudentVUE session'
	);
	expect(() => requireStudentSessionContext(session, null)).toThrow('different StudentVUE session');
});

test('school-wide work is bounded and queued fairly', async () => {
	const gate = new StudentOperationGate(2, 2);
	const events: string[] = [];
	const releases: Array<() => void> = [];
	const blocked = (name: string) =>
		gate.run(async () => {
			events.push(`${name}:start`);
			await new Promise<void>((resolve) => releases.push(resolve));
			events.push(`${name}:end`);
		});

	const first = blocked('first');
	const second = blocked('second');
	await Promise.resolve();
	expect(gate.metrics()).toEqual({ active: 2, queued: 0 });
	const third = blocked('third');
	const fourth = blocked('fourth');
	await Promise.resolve();
	expect(gate.metrics()).toEqual({ active: 2, queued: 2 });
	await expect(blocked('rejected')).rejects.toBeInstanceOf(StudentServiceBusyError);

	releases.shift()?.();
	await vi.waitFor(() => expect(events).toContain('third:start'));
	expect(gate.metrics()).toEqual({ active: 2, queued: 1 });
	releases.shift()?.();
	await vi.waitFor(() => expect(events).toContain('fourth:start'));
	releases.splice(0).forEach((release) => release());
	await Promise.all([first, second, third, fourth]);
	expect(gate.metrics()).toEqual({ active: 0, queued: 0 });
});

test('abandoned school-wide work is removed from the queue', async () => {
	const gate = new StudentOperationGate(1, 2, 1_000);
	let releaseFirst!: () => void;
	const first = gate.run(
		() =>
			new Promise<void>((resolve) => {
				releaseFirst = resolve;
			})
	);
	await vi.waitFor(() => expect(gate.metrics()).toEqual({ active: 1, queued: 0 }));

	const controller = new AbortController();
	const abandoned = gate.run(async () => undefined, controller.signal);
	await vi.waitFor(() => expect(gate.metrics()).toEqual({ active: 1, queued: 1 }));
	controller.abort();
	await expect(abandoned).rejects.toBeInstanceOf(StudentOperationAbortedError);
	expect(gate.metrics()).toEqual({ active: 1, queued: 0 });

	releaseFirst();
	await first;
	expect(gate.metrics()).toEqual({ active: 0, queued: 0 });
});

test('school-wide queued work times out instead of waiting indefinitely', async () => {
	vi.useFakeTimers();
	const gate = new StudentOperationGate(1, 1, 50);
	let releaseFirst!: () => void;
	const first = gate.run(
		() =>
			new Promise<void>((resolve) => {
				releaseFirst = resolve;
			})
	);
	await Promise.resolve();
	const waiting = gate.run(async () => undefined);
	expect(gate.metrics()).toEqual({ active: 1, queued: 1 });
	const rejection = expect(waiting).rejects.toBeInstanceOf(StudentServiceBusyError);

	await vi.advanceTimersByTimeAsync(50);
	await rejection;
	expect(gate.metrics()).toEqual({ active: 1, queued: 0 });

	releaseFirst();
	await first;
	expect(gate.metrics()).toEqual({ active: 0, queued: 0 });
	vi.useRealTimers();
});

test('a school-wide refresh burst stays within fixed active and queued capacity', async () => {
	const maximumActive = 8;
	const maximumQueued = 64;
	const gate = new StudentOperationGate(maximumActive, maximumQueued, 5_000);
	let release!: () => void;
	const blocker = new Promise<void>((resolve) => (release = resolve));
	let active = 0;
	let highestActive = 0;

	const requests = Array.from({ length: 200 }, () =>
		gate.run(async () => {
			active += 1;
			highestActive = Math.max(highestActive, active);
			await blocker;
			active -= 1;
		})
	);
	const settled = Promise.allSettled(requests);
	await vi.waitFor(() =>
		expect(gate.metrics()).toEqual({ active: maximumActive, queued: maximumQueued })
	);
	release();
	const results = await settled;

	expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(
		maximumActive + maximumQueued
	);
	expect(results.filter((result) => result.status === 'rejected')).toHaveLength(
		200 - maximumActive - maximumQueued
	);
	expect(
		results
			.filter((result): result is PromiseRejectedResult => result.status === 'rejected')
			.every((result) => result.reason instanceof StudentServiceBusyError)
	).toBe(true);
	expect(highestActive).toBeLessThanOrEqual(maximumActive);
	expect(gate.metrics()).toEqual({ active: 0, queued: 0 });
});
