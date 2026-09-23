<script lang="ts">
	import { page } from '$app/state';
	import { getRelativeTime } from '$lib/format/date-time';
	import { removeCourseType } from '$lib/grades/course-name';
	import { acc } from '$lib/account.svelte';
	import { brand, brandName, releaseChannel } from '$lib/brand';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { Spinner } from '$lib/components/ui/spinner';
	import {
		gradebookState,
		initializeGradebookCatalog,
		resetGradebookCatalog,
		switchReportPeriod
	} from '$lib/grades/catalog.svelte';
	import { getActiveGradebook } from '$lib/grades/gradebook';
	import {
		markPortalConnected,
		portalConnection,
		resetPortalConnection
	} from '$lib/session.svelte';
	import { StudentVueSessionExpiredError } from '$lib/synergy';
	import AppWindowMacIcon from '@lucide/svelte/icons/app-window-mac';
	import BookOpenIcon from '@lucide/svelte/icons/book-open';
	import CalendarDaysIcon from '@lucide/svelte/icons/calendar-days';
	import CheckIcon from '@lucide/svelte/icons/check';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import FileTextIcon from '@lucide/svelte/icons/file-text';
	import LogOutIcon from '@lucide/svelte/icons/log-out';
	import MailIcon from '@lucide/svelte/icons/mail';
	import MessageCircleIcon from '@lucide/svelte/icons/message-circle';
	import MoonIcon from '@lucide/svelte/icons/moon';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import ShieldCheckIcon from '@lucide/svelte/icons/shield-check';
	import SunIcon from '@lucide/svelte/icons/sun';
	import TrophyIcon from '@lucide/svelte/icons/trophy';
	import { mode, setMode } from 'mode-watcher';
	import { toast } from 'svelte-sonner';
	import { onMount, type Component } from 'svelte';
	import { installPrompt } from '../../hooks.client';
	import { attendanceState, loadAttendance } from './attendance/attendance.svelte';
	import { documentsState, loadDocuments } from './documents/documents.svelte';
	import { loadMailData, mailDataState } from './mail/mailData.svelte';
	import { resetNonGradeRecords } from './resetNonGradeRecords.svelte';
	import { loadStudentInfo, studentInfoState } from './studentinfo/studentInfo.svelte';

	const sidebar = Sidebar.useSidebar();
	$effect(() => {
		page.url.pathname;
		if (sidebar.isMobile) sidebar.setOpenMobile(false);
	});

	let refreshingAll = $state(false);
	let backgroundRefreshPromise: Promise<void> | undefined;
	let lastSuccessfulRefresh = $state<number | undefined>();

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

	const courses = $derived(getActiveGradebook()?.Courses.Course);
	const gradebookLastRefresh = $derived.by(() => {
		const catalog = gradebookState.gradebookCatalog;
		if (!catalog) return undefined;
		const index = catalog.overrideIndex ?? catalog.defaultIndex;
		return catalog.recordCache[index]?.lastRefresh;
	});
	const lastSync = $derived(lastSuccessfulRefresh ?? gradebookLastRefresh);
	const profileName = $derived.by(() => {
		const formattedName = studentInfoState.data?.FormattedName?.trim();
		if (!formattedName) return 'Student profile';
		const givenNames = formattedName.includes(',')
			? formattedName.split(',').slice(1).join(' ').trim()
			: formattedName;
		return givenNames.split(/\s+/)[0] || formattedName;
	});

	async function refreshAll() {
		if (refreshingAll || backgroundRefreshPromise) return;
		refreshingAll = true;
		try {
			// A single lightweight probe stops a dead upstream session from causing five
			// duplicate failed requests and opens the reconnect prompt immediately.
			await acc.studentAccount?.keepAlive();
			// Gradebook is the page's primary refresh target. StudentVUE requests for one
			// session are serialized, so enqueue it before the lower-priority records.
			const gradebookRefresh = gradebookState.gradebookCatalog
				? switchReportPeriod({ forceRefresh: true, delta: true })
				: Promise.resolve();
			const backgroundRefreshes: Promise<unknown>[] = [
				loadAttendance(true),
				loadDocuments(true),
				loadMailData(true),
				loadStudentInfo(true)
			];
			backgroundRefreshPromise = Promise.allSettled(backgroundRefreshes)
				.then(() => {
					const recordFailed = [
						attendanceState.error,
						documentsState.error,
						mailDataState.error,
						studentInfoState.error
					].some(Boolean);
					// A successful secondary-record refresh must not hide a definitive
					// gradebook session-expiry prompt from the same refresh cycle.
					if (!recordFailed && portalConnection.state !== 'reconnect')
						markPortalConnected(Date.now());
				})
				.finally(() => {
					backgroundRefreshPromise = undefined;
				});
			await gradebookRefresh;
			lastSuccessfulRefresh = Date.now();
			markPortalConnected(lastSuccessfulRefresh);
		} catch (error) {
			if (!(error instanceof StudentVueSessionExpiredError))
				toast.error("StudentVUE didn't cooperate", {
					description: error instanceof Error ? error.message : String(error),
					duration: 6000
				});
		} finally {
			refreshingAll = false;
		}
	}

	function installWebApp() {
		$installPrompt.prompt?.();
	}

	function isRouteActive(url: string) {
		return page.url.pathname === url || page.url.pathname.startsWith(`${url}/`);
	}

	const navigation: { title: string; url: string; icon: Component }[] = [
		{ title: 'Gradebook', url: '/grades', icon: BookOpenIcon },
		{ title: 'Rankings', url: '/rankings', icon: TrophyIcon },
		{ title: 'Attendance', url: '/attendance', icon: CalendarDaysIcon },
		{ title: 'Documents', url: '/documents', icon: FileTextIcon },
		{ title: 'Mail', url: '/mail', icon: MailIcon },
		{ title: 'Feedback', url: '/feedback', icon: MessageCircleIcon }
	];

	onMount(() => {
		initializeGradebookCatalog();
		loadStudentInfo();
	});
</script>

<Sidebar.Root collapsible="icon" class="border-sidebar-border/80" data-testid="app-sidebar">
	<Sidebar.Header class="border-sidebar-border border-b p-2">
		<a
			href="/grades"
			class="hover:bg-sidebar-accent focus-visible:ring-sidebar-ring flex h-12 w-full items-center gap-2 rounded-lg px-2 transition-colors outline-none group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:p-0 focus-visible:ring-2"
			aria-label={`${brand} gradebook`}
			data-testid="sidebar-brand"
		>
			<span class="bg-primary/10 flex size-8 shrink-0 items-center justify-center rounded-lg">
				<img src="/grademaxxing-logo.png" class="size-6" alt="" />
			</span>
			<span
				class="flex min-w-0 flex-1 flex-col text-sm leading-4 font-bold tracking-[-0.02em] group-data-[collapsible=icon]:hidden"
				style="font-family: 'Space Grotesk', 'Instrument Sans', system-ui, sans-serif;"
				><span>{brandName}</span><small
					class="text-primary mt-0.5 text-[0.5625rem] leading-3 font-bold tracking-[0.12em] uppercase"
					>{releaseChannel} workspace</small
				></span
			>
			<ChevronRightIcon
				class="text-muted-foreground size-4 group-data-[collapsible=icon]:hidden"
				strokeWidth={1.75}
			/>
		</a>
	</Sidebar.Header>

	<Sidebar.Content class="gap-2 p-2">
		<nav
			aria-label="Primary navigation"
			data-testid="sidebar-primary-nav"
			class="group-data-[collapsible=icon]:w-8"
		>
			<p
				class="text-tertiary-foreground mb-1 flex h-7 items-center px-2 font-mono text-[0.625rem] font-semibold tracking-[0.14em] uppercase group-data-[collapsible=icon]:invisible"
			>
				Explore
			</p>
			<Sidebar.Menu class="gap-1">
				{#each navigation as item (item.url)}
					<Sidebar.MenuItem>
						<Sidebar.MenuButton
							class="text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground h-9 gap-3 rounded-md px-2 text-[0.8125rem] font-medium transition-colors data-[active=true]:font-semibold!"
							isActive={isRouteActive(item.url)}
							tooltipContent={item.title}
						>
							{#snippet child({ props })}
								<a
									href={item.url}
									aria-current={page.url.pathname === item.url ? 'page' : undefined}
									data-testid={`sidebar-nav-${item.url.slice(1)}`}
									{...props}
								>
									<item.icon class="size-4" strokeWidth={1.75} />
									<span class="flex-1">{item.title}</span>
								</a>
							{/snippet}
						</Sidebar.MenuButton>
					</Sidebar.MenuItem>
				{/each}
			</Sidebar.Menu>
		</nav>

		<nav
			class="border-sidebar-border mt-2 border-t pt-2 group-data-[collapsible=icon]:hidden"
			aria-labelledby="classes-heading"
			data-testid="sidebar-classes"
		>
			<h2
				id="classes-heading"
				class="text-tertiary-foreground flex h-7 items-center px-2 font-mono text-[0.625rem] font-semibold tracking-[0.16em] uppercase"
			>
				Classes
			</h2>

			<svelte:boundary>
				{#if courses}
					<ol class="mt-1 space-y-0.5">
						{#each courses as course, index (course._CourseID)}
							<li>
								<a
									href={`/grades/${encodeURIComponent(course._CourseID)}`}
									class="hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-sidebar-ring flex h-8 items-center gap-2 rounded-md px-2 transition-colors outline-none focus-visible:ring-2 {page
										.url.pathname === `/grades/${encodeURIComponent(course._CourseID)}`
										? 'bg-sidebar-accent text-sidebar-accent-foreground font-semibold'
										: 'text-muted-foreground'}"
									aria-current={page.url.pathname ===
									`/grades/${encodeURIComponent(course._CourseID)}`
										? 'page'
										: undefined}
									title={removeCourseType(course._CourseName)}
									data-testid="sidebar-course"
								>
									<span
										class="bg-sidebar-accent text-sidebar-accent-foreground flex size-5 shrink-0 items-center justify-center rounded-md font-mono text-[0.625rem] leading-none tabular-nums"
										>{index + 1}</span
									>
									<span class="truncate text-[0.78125rem] leading-none font-medium"
										>{removeCourseType(course._CourseName)}</span
									>
								</a>
							</li>
						{/each}
					</ol>
				{:else}
					<div class="text-muted-foreground flex items-center gap-2 px-3 py-4 text-sm">
						<Spinner class="size-4" /> Loading classes.
					</div>
				{/if}
			</svelte:boundary>
		</nav>

		<div
			class="mt-auto flex flex-col gap-2 pt-3 group-data-[collapsible=icon]:hidden"
			data-testid="sidebar-utilities"
		>
			{#if portalConnection.state === 'offline'}
				<div
					class="text-tertiary-foreground border-l-2 border-amber-400/60 px-2 py-1 text-[0.71875rem] leading-[1.45]"
					role="status"
					data-testid="portal-offline-indicator"
				>
					StudentVUE is unavailable. Saved records stay available; we'll retry automatically.
				</div>
			{/if}
			<a
				href="/privacy"
				class="text-tertiary-foreground hover:bg-sidebar-accent hover:text-foreground group flex items-start gap-2 rounded-md px-2 py-1.5 text-[0.6875rem] leading-[1.4] transition-colors"
				data-testid="sidebar-privacy"
			>
				<ShieldCheckIcon class="text-success mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
				<span
					><strong class="text-foreground block text-[0.71875rem]">Privacy protected</strong>Your
					password stays encrypted on this device.</span
				>
			</a>

			<button
				type="button"
				onclick={() => void refreshAll()}
				disabled={refreshingAll}
				class="hover:bg-sidebar-accent flex min-h-9 w-full items-center gap-2 rounded-md px-2 text-[0.75rem] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60"
				aria-busy={refreshingAll}
				data-testid="sidebar-refresh"
			>
				{#if lastSync !== undefined && !refreshingAll}
					<CheckIcon class="size-3.5" strokeWidth={1.75} />
				{:else}
					<RefreshCwIcon class="size-3.5 {refreshingAll ? 'animate-spin' : ''}" strokeWidth={1.5} />
				{/if}
				<span class="flex-1 text-left"
					>{refreshingAll
						? 'Refreshing'
						: portalConnection.state === 'offline'
							? 'Retry now'
							: 'Refresh'}</span
				>
				{#if lastSync !== undefined && !refreshingAll}
					<span class="text-muted-foreground font-normal"
						>Updated {getRelativeTime(new Date(lastSync))}</span
					>
				{/if}
			</button>

			<div
				class="border-sidebar-border grid grid-cols-2 border-y py-1"
				aria-label="Color theme"
				data-testid="sidebar-theme"
			>
				<button
					type="button"
					onclick={() => setMode('dark')}
					class="flex h-7 items-center justify-center gap-[0.4375rem] rounded-md text-xs font-semibold transition-colors {mode.current ===
					'dark'
						? 'text-primary'
						: 'text-muted-foreground hover:bg-sidebar-accent hover:text-foreground'}"
					aria-pressed={mode.current === 'dark'}
				>
					<MoonIcon class="size-[0.8125rem]" strokeWidth={1.5} /> Dark
				</button>
				<button
					type="button"
					onclick={() => setMode('light')}
					class="flex h-7 items-center justify-center gap-[0.4375rem] rounded-md text-xs font-semibold transition-colors {mode.current ===
					'light'
						? 'text-primary'
						: 'text-muted-foreground hover:bg-sidebar-accent hover:text-foreground'}"
					aria-pressed={mode.current === 'light'}
				>
					<SunIcon class="size-[0.8125rem]" strokeWidth={1.5} /> Light
				</button>
			</div>

		</div>
	</Sidebar.Content>

	<Sidebar.Footer class="border-sidebar-border border-t p-2" data-testid="sidebar-profile-footer">
		<div class="flex items-center gap-1">
			<a
				href="/studentinfo"
				class="hover:bg-sidebar-accent focus-visible:ring-sidebar-ring flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-md px-2 transition-colors outline-none group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:p-0 focus-visible:ring-2"
				title={studentInfoState.data?.FormattedName ?? 'Student profile'}
				data-testid="sidebar-profile"
			>
				{#if studentInfoState.data?.Photo}
					<img
						src="data:{studentInfoState.data.PhotoMimeType || 'image/png'};base64,{studentInfoState
							.data.Photo}"
						class="size-8 shrink-0 rounded-md object-cover"
						alt=""
					/>
				{:else}
					<span
						class="bg-sidebar-accent text-sidebar-accent-foreground flex size-8 shrink-0 items-center justify-center rounded-md font-bold"
					>
						{profileName.charAt(0) || 'S'}
					</span>
				{/if}
				<span class="min-w-0 group-data-[collapsible=icon]:hidden">
					<span class="block truncate text-sm font-bold">
						{profileName}
					</span>
					<span class="text-muted-foreground block truncate text-xs">
						{studentInfoState.data?.Grade === null || studentInfoState.data?.Grade === undefined
							? 'Account details'
							: `Grade ${studentInfoState.data.Grade}`}
					</span>
				</span>
			</a>

			{#if $installPrompt.prompt}
				<button
					type="button"
					onclick={installWebApp}
					class="hover:bg-sidebar-accent focus-visible:ring-sidebar-ring text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-md outline-none group-data-[collapsible=icon]:hidden focus-visible:ring-2"
					title="Install web app"
					aria-label="Install web app"
				>
					<AppWindowMacIcon class="size-4" strokeWidth={1.5} />
				</button>
			{/if}

			<button
				type="button"
				onclick={logOut}
				class="text-muted-foreground hover:bg-destructive-soft hover:text-destructive focus-visible:ring-sidebar-ring flex size-8 shrink-0 items-center justify-center rounded-md transition-colors outline-none group-data-[collapsible=icon]:hidden focus-visible:ring-2"
				title="Log out"
				aria-label="Log out"
			>
				<LogOutIcon class="size-4" strokeWidth={1.5} />
			</button>
		</div>
	</Sidebar.Footer>
	<Sidebar.Rail />
</Sidebar.Root>
