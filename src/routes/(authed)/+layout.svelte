<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { LocalStorageKey } from '$lib';
	import { acc, loadStudentAccount } from '$lib/account.svelte';
	import { brandName, releaseChannel } from '$lib/brand';
	import BoundaryFailure from '$lib/components/BoundaryFailure.svelte';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { Spinner } from '$lib/components/ui/spinner';
	import {
		gradebookState,
		initializeGradebookCatalog,
		resetGradebookCatalog,
		switchReportPeriod
	} from '$lib/grades/catalog.svelte';
	import {
		markPortalChecking,
		markPortalConnected,
		markPortalOffline,
		markPortalRetryScheduled,
		portalConnection,
		resetPortalConnection
	} from '$lib/session.svelte';
	import { StudentVueSessionExpiredError } from '$lib/synergy';
	import BookOpenIcon from '@lucide/svelte/icons/book-open';
	import CalendarDaysIcon from '@lucide/svelte/icons/calendar-days';
	import FileTextIcon from '@lucide/svelte/icons/file-text';
	import LogOutIcon from '@lucide/svelte/icons/log-out';
	import MailIcon from '@lucide/svelte/icons/mail';
	import MoonIcon from '@lucide/svelte/icons/moon';
	import SunIcon from '@lucide/svelte/icons/sun';
	import { mode, setMode } from 'mode-watcher';
	import AppSidebar from './AppSidebar.svelte';
	import ReconnectStudentVue from './ReconnectStudentVue.svelte';
	import { resetNonGradeRecords } from './resetNonGradeRecords.svelte';
	import { onMount } from 'svelte';

	let { children } = $props();
	const KEEPALIVE_INTERVAL_MS = 8 * 60 * 1000;
	const BACKGROUND_GRADE_REFRESH_MS = 5 * 60 * 1000;
	const RESUME_DEBOUNCE_MS = 30 * 1000;
	const PORTAL_RETRY_DELAYS_MS = [15_000, 30_000, 60_000, 2 * 60_000, 5 * 60_000];
	let lastMaintenanceAttempt = 0;
	let maintenancePromise: Promise<void> | undefined;
	let portalRetryAttempts = 0;
	let portalRetryTimer: number | undefined;

	const mobileNavigation = [
		{ title: 'Grades', url: '/grades', icon: BookOpenIcon },
		{ title: 'Attendance', url: '/attendance', icon: CalendarDaysIcon },
		{ title: 'Documents', url: '/documents', icon: FileTextIcon },
		{ title: 'Mail', url: '/mail', icon: MailIcon }
	];

	function isRouteActive(url: string) {
		return page.url.pathname === url || page.url.pathname.startsWith(`${url}/`);
	}

	function isDefinitiveAppSessionFailure(error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		return /session has expired|sign in again|different StudentVUE session/i.test(message);
	}

	async function logOut() {
		const response = await fetch('/api/session', { method: 'DELETE' }).catch(() => undefined);
		await response?.arrayBuffer().catch(() => undefined);
		localStorage.clear();
		resetGradebookCatalog();
		resetNonGradeRecords();
		acc.studentAccount = undefined;
		resetPortalConnection();
		location.assign('/login');
	}

	async function maintainStudentVueSession(force = false) {
		if (
			!acc.studentAccount ||
			document.visibilityState !== 'visible' ||
			!navigator.onLine ||
			portalConnection.state === 'reconnect'
		)
			return;
		const now = Date.now();
		if (!force && now - lastMaintenanceAttempt < RESUME_DEBOUNCE_MS) return;
		if (maintenancePromise) return maintenancePromise;
		lastMaintenanceAttempt = now;
		const account = acc.studentAccount;
		maintenancePromise = (async () => {
			markPortalChecking();
			try {
				await account.keepAlive();
				if (acc.studentAccount !== account) return;
				portalRetryAttempts = 0;
				markPortalConnected();
				await initializeGradebookCatalog();
				const catalog = gradebookState.gradebookCatalog;
				if (!catalog || catalog.loadingIndex !== undefined) return;
				const index = catalog.overrideIndex ?? catalog.defaultIndex;
				const lastRefresh = catalog.recordCache[index]?.lastRefresh ?? 0;
				if (Date.now() - lastRefresh >= BACKGROUND_GRADE_REFRESH_MS) {
					await switchReportPeriod({ forceRefresh: true, silent: true });
					markPortalConnected();
				}
			} catch (error) {
				if (error instanceof StudentVueSessionExpiredError) return;
				markPortalOffline(
					!navigator.onLine
						? 'You appear to be offline. Showing your last saved data.'
						: 'StudentVUE is temporarily unavailable. Showing your last saved data.'
				);
				schedulePortalRetry();
			} finally {
				maintenancePromise = undefined;
			}
		})();
		return maintenancePromise;
	}

	function schedulePortalRetry() {
		if (
			portalRetryTimer ||
			!acc.studentAccount ||
			document.visibilityState !== 'visible' ||
			!navigator.onLine ||
			portalConnection.state !== 'offline'
		)
			return;
		const delay = PORTAL_RETRY_DELAYS_MS[Math.min(portalRetryAttempts, PORTAL_RETRY_DELAYS_MS.length - 1)]!;
		portalRetryAttempts += 1;
		const nextRetryAt = Date.now() + delay;
		markPortalRetryScheduled(nextRetryAt);
		portalRetryTimer = window.setTimeout(() => {
			portalRetryTimer = undefined;
			void maintainStudentVueSession(true).finally(() => {
				if (portalConnection.state === 'offline') schedulePortalRetry();
			});
		}, delay);
	}

	if (browser && !acc.studentAccount) {
		loadStudentAccount();
		if (!acc.studentAccount) void goto('/login');
	}

	onMount(() => {
		if (!acc.studentAccount) return;
		void acc.studentAccount.checkLogin().then(
			() => void maintainStudentVueSession(true),
			(error) => {
				// A Worker cold start, network interruption, or temporary 5xx must never be
				// mistaken for sign-out. Retain the local session metadata and cached records;
				// only a confirmed invalid app session should take the student to login.
				if (!isDefinitiveAppSessionFailure(error)) {
					markPortalOffline();
					schedulePortalRetry();
					return;
				}
				try {
					localStorage.removeItem(LocalStorageKey.token);
				} catch {
					// The active module session is still cleared when managed storage is unavailable.
				}
				resetGradebookCatalog();
				resetNonGradeRecords();
				acc.studentAccount = undefined;
				void goto('/login');
			}
		);

		const resume = () => {
			if (portalConnection.state === 'offline') schedulePortalRetry();
			void maintainStudentVueSession();
		};
		const visibility = () => {
			if (document.visibilityState === 'visible') resume();
		};
		const interval = window.setInterval(resume, KEEPALIVE_INTERVAL_MS);
		window.addEventListener('focus', resume);
		window.addEventListener('pageshow', resume);
		window.addEventListener('online', resume);
		document.addEventListener('visibilitychange', visibility);

		const currentSessionId = acc.studentAccount.sessionId;
		const handleStorage = (event: StorageEvent) => {
			if (
				event.storageArea !== localStorage ||
				(event.key !== LocalStorageKey.token && event.key !== null)
			)
				return;
			let replacementSessionId: string | undefined;
			try {
				const value = JSON.parse(event.newValue ?? '') as { sessionId?: unknown };
				replacementSessionId = typeof value.sessionId === 'string' ? value.sessionId : undefined;
			} catch {
				// Clearing or corrupting the shared login record is treated as sign-out.
			}
			if (replacementSessionId === currentSessionId) return;
			resetGradebookCatalog();
			resetNonGradeRecords();
			acc.studentAccount = undefined;
			location.assign(replacementSessionId ? '/grades' : '/login');
		};
		window.addEventListener('storage', handleStorage);
		return () => {
			if (portalRetryTimer) window.clearTimeout(portalRetryTimer);
			window.clearInterval(interval);
			window.removeEventListener('focus', resume);
			window.removeEventListener('pageshow', resume);
			window.removeEventListener('online', resume);
			document.removeEventListener('visibilitychange', visibility);
			window.removeEventListener('storage', handleStorage);
		};
	});
</script>

<svelte:boundary>
	<Sidebar.Provider>
		<AppSidebar />

		<Sidebar.Inset class="min-w-0 pb-[3.75rem] md:pb-0">
			<ReconnectStudentVue />
			<header
				class="bg-card border-border/70 sticky top-0 z-30 flex h-[3.09375rem] shrink-0 items-center border-b px-4 md:hidden"
			>
				<a
					href="/grades"
					class="mr-auto flex items-center gap-2 text-lg font-extrabold tracking-[-0.035em] whitespace-nowrap"
				>
					<img src="/favicon.svg" class="size-6" alt="" />
					<span>{brandName}</span><small
						class="rounded bg-sky-400/10 px-1.5 py-0.5 text-[0.5625rem] font-bold tracking-[0.04em] text-sky-400"
						>({releaseChannel})</small
					>
				</a>
				<button
					type="button"
					onclick={() => setMode(mode.current === 'dark' ? 'light' : 'dark')}
					class="text-muted-foreground hover:text-foreground flex size-9 items-center justify-center rounded-lg"
					aria-label={mode.current === 'dark' ? 'Use light theme' : 'Use dark theme'}
				>
					{#if mode.current === 'dark'}<SunIcon class="size-4" />{:else}<MoonIcon
							class="size-4"
						/>{/if}
				</button>
				<button
					type="button"
					onclick={() => void logOut()}
					class="text-muted-foreground hover:text-foreground flex size-9 items-center justify-center rounded-lg"
					aria-label="Log out"
				>
					<LogOutIcon class="size-4" />
				</button>
			</header>

			<div class="flex flex-1 flex-col">
				<svelte:boundary>
					{@render children()}

					{#snippet pending()}
						<div class="flex min-h-screen w-full items-center justify-center">
							<Spinner class="size-8" />
						</div>
					{/snippet}

					{#snippet failed(error, reset)}
						<BoundaryFailure {error} {reset} />
					{/snippet}
				</svelte:boundary>
			</div>

			<nav
				class="bg-card border-border fixed inset-x-0 bottom-0 z-40 grid h-[3.375rem] grid-cols-4 border-t md:hidden"
				aria-label="Mobile navigation"
			>
				{#each mobileNavigation as item (item.url)}
					<a
						href={item.url}
						class="flex min-w-0 flex-col items-center justify-center gap-0.5 px-1 text-[0.625rem] font-semibold {isRouteActive(
							item.url
						)
							? 'text-primary'
							: 'text-muted-foreground'}"
						aria-current={isRouteActive(item.url) ? 'page' : undefined}
					>
						<item.icon class="size-[1.1rem]" />
						<span class="truncate">{item.title}</span>
					</a>
				{/each}
			</nav>
		</Sidebar.Inset>
	</Sidebar.Provider>

	{#snippet failed(error, reset)}
		<BoundaryFailure {error} {reset} />
	{/snippet}
</svelte:boundary>
