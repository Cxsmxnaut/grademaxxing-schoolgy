import { browser } from '$app/environment';
import { LocalStorageKey } from '$lib/storage/keys';

export type QuickJumpTargetKind = 'page' | 'class' | 'mail' | 'document';

export interface QuickJumpTarget {
	title: string;
	subtitle: string;
	url: string;
	kind: QuickJumpTargetKind;
}

const MAX_RECENTS = 6;

function isTarget(value: unknown): value is QuickJumpTarget {
	if (typeof value !== 'object' || value === null) return false;
	const entry = value as Record<string, unknown>;
	return (
		typeof entry.title === 'string' &&
		typeof entry.subtitle === 'string' &&
		typeof entry.url === 'string' &&
		typeof entry.kind === 'string'
	);
}

function readRecents(): QuickJumpTarget[] {
	if (!browser) return [];
	try {
		const raw = localStorage.getItem(LocalStorageKey.quickJumpRecents);
		const parsed: unknown = raw ? JSON.parse(raw) : [];
		return Array.isArray(parsed) ? parsed.filter(isTarget).slice(0, MAX_RECENTS) : [];
	} catch {
		return [];
	}
}

function persist(recents: QuickJumpTarget[]) {
	try {
		localStorage.setItem(LocalStorageKey.quickJumpRecents, JSON.stringify(recents));
	} catch {
		// Storage can be unavailable (private mode, quota); recents just won't persist.
	}
}

export const quickJumpRecents: QuickJumpTarget[] = $state(readRecents());

/** Moves the target to the front of the recents list and persists the list. */
export function recordQuickJump(target: QuickJumpTarget) {
	const next = [target, ...quickJumpRecents.filter((recent) => recent.url !== target.url)].slice(
		0,
		MAX_RECENTS
	);
	quickJumpRecents.splice(0, quickJumpRecents.length, ...next);
	persist(quickJumpRecents);
}
