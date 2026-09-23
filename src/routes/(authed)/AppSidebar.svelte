<script lang="ts">
	import { page } from '$app/state';
	import { getRelativeTime } from '$lib/format/date-time';
	import { removeCourseType } from '$lib/grades/course-name';
	import { acc } from '$lib/account.svelte';
	import { brand, brandName, releaseChannel } from '$lib/brand';
	import ThinkingOrb from '$lib/components/ThinkingOrb.svelte';
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
	import ChartNoAxesCombinedIcon from '@lucide/svelte/icons/chart-no-axes-combined';
	import CheckIcon from '@lucide/svelte/icons/check';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import FolderOpenIcon from '@lucide/svelte/icons/folder-open';
	import InboxIcon from '@lucide/svelte/icons/inbox';
	import LogOutIcon from '@lucide/svelte/icons/log-out';
	import MedalIcon from '@lucide/svelte/icons/medal';
	import PencilLineIcon from '@lucide/svelte/icons/pencil-line';
	import ShieldCheckIcon from '@lucide/svelte/icons/shield-check';
	import UserCheckIcon from '@lucide/svelte/icons/user-check';
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
		{ title: 'Gradebook', url: '/grades', icon: ChartNoAxesCombinedIcon },
		{ title: 'Rankings', url: '/rankings', icon: MedalIcon },
		{ title: 'Attendance', url: '/attendance', icon: UserCheckIcon },
		{ title: 'Documents', url: '/documents', icon: FolderOpenIcon },
		{ title: 'Mail', url: '/mail', icon: InboxIcon },
		{ title: 'Feedback', url: '/feedback', icon: PencilLineIcon }
	];

	onMount(() => {
		initializeGradebookCatalog();
		loadStudentInfo();
	});
</script>

<Sidebar.Root collapsible="icon" class="border-sidebar-border/80" data-testid="app-sidebar">
	<Sidebar.Header
		class="border-b-0 px-3.5 pt-5 pb-0 group-data-[collapsible=icon]:p-2"
	>
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

	<Sidebar.Content
		class="gap-0 px-3.5 pt-0 pb-2 group-data-[collapsible=icon]:p-2"
	>
		<nav
			aria-label="Primary navigation"
			data-testid="sidebar-primary-nav"
			class="group-data-[collapsible=icon]:w-8"
		>
			<Sidebar.Menu class="gap-0.5">
				{#each navigation as item (item.url)}
					<Sidebar.MenuItem>
						<Sidebar.MenuButton
							class="text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground h-[2.28125rem] gap-2.5 rounded-[0.5rem] px-3 text-sm font-medium transition-colors data-[active=true]:font-semibold!"
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
			class="mt-[1.375rem] group-data-[collapsible=icon]:hidden"
			aria-labelledby="classes-heading"
			data-testid="sidebar-classes"
		>
			<h2
				id="classes-heading"
				class="text-tertiary-foreground mb-2 flex h-[1.03125rem] items-center px-2 font-mono text-[0.625rem] font-semibold tracking-[0.16em] uppercase"
			>
				Classes
			</h2>

			<svelte:boundary>
				{#if courses}
					<ol class="space-y-px">
						{#each courses as course, index (course._CourseID)}
							<li>
								<a
									href={`/grades/${encodeURIComponent(course._CourseID)}`}
									class="hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-sidebar-ring flex h-[1.78125rem] items-center gap-2 rounded-[0.4375rem] px-2 text-[0.83333rem] transition-colors outline-none focus-visible:ring-2 {page
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
										class="text-sidebar-accent-foreground flex w-3 shrink-0 items-center justify-center font-mono text-[0.625rem] leading-none tabular-nums"
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
				class="hover:bg-sidebar-accent focus-visible:ring-sidebar-ring flex min-h-12 w-full items-center gap-2.5 rounded-lg px-2 text-left transition-colors outline-none focus-visible:ring-2 disabled:cursor-wait disabled:opacity-70"
				aria-busy={refreshingAll}
				aria-label={refreshingAll
					? 'Refreshing grades and records'
					: portalConnection.state === 'offline'
						? 'Retry StudentVUE connection'
						: 'Refresh grades and records'}
				data-testid="sidebar-refresh"
			>
				<span class="flex size-9 shrink-0 items-center justify-center">
					{#key refreshingAll}
						<ThinkingOrb state={refreshingAll ? 'searching' : 'breathing'} />
					{/key}
				</span>
				<span class="min-w-0 flex-1">
					<span class="block text-[0.8125rem] leading-4 font-semibold"
						>{refreshingAll
						? 'Refreshing'
						: portalConnection.state === 'offline'
							? 'Retry connection'
							: 'Refresh data'}</span
					>
					<span
						class="text-muted-foreground block truncate text-[0.6875rem] leading-4 font-normal"
						aria-live="polite"
						aria-atomic="true"
					>
						{refreshingAll
							? 'Checking grades and records…'
							: lastSync !== undefined
								? `Updated ${getRelativeTime(new Date(lastSync))}`
								: 'Grades and records'}
					</span>
				</span>
				{#if lastSync !== undefined && !refreshingAll}
					<CheckIcon class="text-success size-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
				{/if}
			</button>

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
