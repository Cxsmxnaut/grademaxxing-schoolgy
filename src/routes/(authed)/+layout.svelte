<script lang="ts">
	import '../../app-utilities.css';
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { LocalStorageKey } from '$lib/storage/keys';
	import { acc, loadStudentAccount, persistStudentAccount } from '$lib/account.svelte';
	import { clearStoredCredentials, loadStoredCredentials } from '$lib/auth/credential-vault';
	import { prepareStudentAccountCaches } from '$lib/auth/account-cache';
	import { brandName } from '$lib/brand';
	import BoundaryFailure from '$lib/components/BoundaryFailure.svelte';
	import PostLoginLoadingScreen from '$lib/components/auth/PostLoginLoadingScreen.svelte';
	import SessionRecoveryScreen from '$lib/components/auth/SessionRecoveryScreen.svelte';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { Spinner } from '$lib/components/ui/spinner';
	import {
		gradebookState,
		initializeGradebookCatalog,
		refreshGradebookAfterSessionRestore,
		resetGradebookCatalog,
		switchReportPeriod
	} from '$lib/grades/catalog.svelte';
	import { gradebookRefreshNeeded } from '$lib/grades/catalog';
	import {
		beginSessionRecovery,
		finishSessionRecovery,
		getSessionRecoverySignal,
		isSessionRecoveryCurrent,
		markPortalChecking,
		markPortalConnected,
		markPortalOffline,
		markPortalRetryScheduled,
		markSessionRecoveryRefreshing,
		portalConnection,
		resetPortalConnection,
		sessionRecovery
	} from '$lib/session.svelte';
	import { StudentAccount, StudentVueSessionExpiredError } from '$lib/synergy';
	import {
		StudentVueAppSessionInvalidError,
		StudentVueAuthenticationError
	} from '$lib/studentvue/api';
	import BookOpenIcon from '@lucide/svelte/icons/book-open';
	import CalendarDaysIcon from '@lucide/svelte/icons/calendar-days';
	import FileTextIcon from '@lucide/svelte/icons/file-text';
	import LogOutIcon from '@lucide/svelte/icons/log-out';
	import MailIcon from '@lucide/svelte/icons/mail';
	import AppSidebar from './AppSidebar.svelte';
	import QuickJump from './QuickJump.svelte';
	import ReconnectStudentVue from './ReconnectStudentVue.svelte';
	import { resetNonGradeRecords } from './resetNonGradeRecords.svelte';
	import { onMount } from 'svelte';

	let { children } = $props();

	// Local to this mount: returning tabs must validate their saved session before
	// child pages can turn an expected expired cookie into a visible record error.
	let startingSession = $state(true);
	let confirmMobileLogOut = $state(false);
	const KEEPALIVE_INTERVAL_MS = 8 * 60 * 1000;
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
		return error instanceof StudentVueAppSessionInvalidError;
	}

	function normalizedDomain(value: string) {
		return value
			.trim()
			.replace(/^https?:\/\//i, '')
			.replace(/\/+$/, '')
			.toLowerCase();
	}

	async function restoreExpiredSession(
		current?: NonNullable<typeof acc.studentAccount>,
		isCurrent = () => true
	) {
		const recovery = beginSessionRecovery();
		let originalToken: string | null;
		try {
			originalToken = localStorage.getItem(LocalStorageKey.token);
		} catch {
			finishSessionRecovery(recovery);
			return false;
		}
		const canRestore = () => {
			try {
				return (
					isCurrent() &&
					isSessionRecoveryCurrent(recovery) &&
					acc.studentAccount === current &&
					localStorage.getItem(LocalStorageKey.token) === originalToken
				);
			} catch {
				return false;
			}
		};
		try {
			const stored = await loadStoredCredentials();
			if (
				!stored ||
				!canRestore() ||
				(current &&
					(stored.username.toLowerCase() !== current.userID.toLowerCase() ||
						normalizedDomain(stored.domain) !== normalizedDomain(current.domain)))
			)
				return false;
			const replacement = new StudentAccount(stored.domain, stored.username, stored.password);
			await replacement.checkLogin(getSessionRecoverySignal(recovery));
			if (!canRestore()) return false;
			if (!(await prepareStudentAccountCaches(replacement, canRestore))) return false;
			persistStudentAccount(replacement);
			acc.studentAccount = replacement;
			resetNonGradeRecords();
			markSessionRecoveryRefreshing(recovery);
			try {
				if (await refreshGradebookAfterSessionRestore(replacement)) markPortalConnected();
			} catch {
				// Authentication succeeded. A grade outage must retain the renewed session
				// and saved grades, with the gradebook's retry control available.
				if (acc.studentAccount !== replacement || !isSessionRecoveryCurrent(recovery)) return false;
				markPortalOffline();
				schedulePortalRetry();
			}
			return true;
		} catch (error) {
			if (error instanceof StudentVueAuthenticationError && canRestore())
				await clearStoredCredentials(canRestore);
			return false;
		} finally {
			finishSessionRecovery(recovery);
		}
	}

	async function logOut() {
		const response = await fetch('/api/session', { method: 'DELETE' }).catch(() => undefined);
		await response?.arrayBuffer().catch(() => undefined);
		await clearStoredCredentials();
		localStorage.clear();
		resetGradebookCatalog();
		resetNonGradeRecords();
		acc.studentAccount = undefined;
		resetPortalConnection();
		location.assign('/login');
	}

	async function maintainStudentVueSession(force = false, initial = false) {
		if (
			!acc.studentAccount ||
			(!initial && document.visibilityState !== 'visible') ||
			!navigator.onLine ||
			sessionRecovery.active ||
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
				if (!gradebookState.gradebookCatalog) await initializeGradebookCatalog();
				if (acc.studentAccount !== account) return;
				const catalog = gradebookState.gradebookCatalog;
				if (!catalog || catalog.loadingIndex !== undefined) return;
				const index = catalog.overrideIndex ?? catalog.defaultIndex;
				const record = catalog.recordCache[index];
				const retryingGrades = gradebookState.loadingError !== undefined;
				if (!record || retryingGrades || gradebookRefreshNeeded(record)) {
					await switchReportPeriod({
						overrideIndex: catalog.overrideIndex,
						forceRefresh: true,
						silent: true,
						delta: !retryingGrades,
						fresh: retryingGrades
					});
					if (acc.studentAccount === account) markPortalConnected();
				}
			} catch (error) {
				if (acc.studentAccount !== account) return;
				if (initial && isDefinitiveAppSessionFailure(error)) throw error;
				if (error instanceof StudentVueSessionExpiredError) return;
				markPortalOffline(
					!navigator.onLine
						? 'You appear to be offline. Showing your last saved data.'
						: 'StudentVUE is unavailable. Showing your last saved data while it figures things out.'
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
		const delay =
			PORTAL_RETRY_DELAYS_MS[Math.min(portalRetryAttempts, PORTAL_RETRY_DELAYS_MS.length - 1)]!;
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
	}

	async function startStudentSession(isCurrent: () => boolean) {
		const initialAccount = acc.studentAccount;
		if (!initialAccount) {
			const restored = await restoreExpiredSession(undefined, isCurrent);
			if (!isCurrent()) return;
			if (restored && acc.studentAccount) startingSession = false;
			else if (!acc.studentAccount) void goto('/login');
			return;
		}
		try {
			await initialAccount.checkLogin();
			if (!isCurrent() || acc.studentAccount !== initialAccount) return;
			if (gradebookState.loadingError !== undefined) {
				markPortalOffline();
				schedulePortalRetry();
			} else {
				// Reuse the normal initial keepalive and grade initialization. The status
				// endpoint validates our cookie, while this also validates StudentVUE.
				await maintainStudentVueSession(true, true);
			}
			if (isCurrent() && acc.studentAccount === initialAccount) startingSession = false;
		} catch (error) {
			if (!isCurrent() || acc.studentAccount !== initialAccount) return;
			// A temporary status failure keeps saved grades usable, with the normal
			// offline retry. Only a definitive invalid app session requires sign-in.
			if (!isDefinitiveAppSessionFailure(error)) {
				markPortalOffline();
				schedulePortalRetry();
				startingSession = false;
				return;
			}
			const restored = await restoreExpiredSession(initialAccount, isCurrent);
			if (!isCurrent()) return;
			if (restored && acc.studentAccount) {
				startingSession = false;
				return;
			}
			if (acc.studentAccount !== initialAccount) return;
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
	}

	onMount(() => {
		let startupCurrent = true;
		void startStudentSession(() => startupCurrent);

		const resume = () => {
			if (startingSession) return;
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
			if (
				replacementSessionId !== undefined &&
				replacementSessionId === acc.studentAccount?.sessionId
			)
				return;
			startupCurrent = false;
			resetPortalConnection();
			resetGradebookCatalog();
			resetNonGradeRecords();
			acc.studentAccount = undefined;
			location.assign(replacementSessionId ? '/grades' : '/login');
		};
		window.addEventListener('storage', handleStorage);
		return () => {
			startupCurrent = false;
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

{#if startingSession}
	<div data-testid="session-startup-loading">
		{#if sessionRecovery.active}
			<SessionRecoveryScreen stage={sessionRecovery.stage} />
		{:else}
			<PostLoginLoadingScreen message="Restoring your session…" recoveryStage="saving" />
		{/if}
	</div>
{:else}
	<svelte:boundary>
		<div inert={sessionRecovery.active} aria-hidden={sessionRecovery.active ? 'true' : undefined}>
			<Sidebar.Provider class="md:h-svh md:overflow-hidden">
				{#key acc.studentAccount}
					<AppSidebar />
					<QuickJump />
				{/key}

				<Sidebar.Inset
					class="min-w-0 pb-[3.75rem] md:h-svh md:overflow-y-auto md:pb-0"
					data-testid="app-content-scroll"
				>
					<ReconnectStudentVue onGradebookUnavailable={schedulePortalRetry} />
					<header
						class="bg-card border-border/70 sticky top-0 z-30 flex h-[3.09375rem] shrink-0 items-center border-b px-4 md:hidden"
					>
						<a
							href="/grades"
							class="mr-auto flex items-center gap-2 text-lg font-extrabold tracking-[-0.035em] whitespace-nowrap"
						>
							<img src="/grademaxxing-growth-mark.png" class="size-7" alt="" />
							<span>{brandName}</span>
						</a>
						<AlertDialog.Root bind:open={confirmMobileLogOut}>
							<AlertDialog.Trigger
								class="text-muted-foreground hover:text-foreground flex size-9 items-center justify-center rounded-lg"
								aria-label="Log out"
							>
								<LogOutIcon class="size-4" />
							</AlertDialog.Trigger>
							<AlertDialog.Content>
								<AlertDialog.Header>
									<AlertDialog.Title>Log out of Grademaxxing?</AlertDialog.Title>
									<AlertDialog.Description>
										This clears your saved grades and records on this device, and returns you to the
										sign-in page. Your StudentVUE account is untouched.
									</AlertDialog.Description>
								</AlertDialog.Header>
								<AlertDialog.Footer>
									<AlertDialog.Cancel>Stay signed in</AlertDialog.Cancel>
									<AlertDialog.Action
										class="bg-destructive hover:bg-destructive/90 text-white"
										onclick={() => void logOut()}
									>
										Log out
									</AlertDialog.Action>
								</AlertDialog.Footer>
							</AlertDialog.Content>
						</AlertDialog.Root>
					</header>

					<div class="flex flex-1 flex-col">
						<svelte:boundary>
							{#key acc.studentAccount}
								{@render children()}
							{/key}

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
		</div>
		{#if sessionRecovery.active}
			<SessionRecoveryScreen stage={sessionRecovery.stage} />
		{/if}

		{#snippet failed(error, reset)}
			<BoundaryFailure {error} {reset} />
		{/snippet}
	</svelte:boundary>
{/if}
