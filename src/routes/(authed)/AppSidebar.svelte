<script lang="ts">
	import { page } from '$app/state';
	import { getRelativeTime } from '$lib/format/date-time';
	import { removeCourseType } from '$lib/grades/course-name';
	import { acc } from '$lib/account.svelte';
	import { brandName } from '$lib/brand';
	import ThinkingOrb from '$lib/components/ThinkingOrb.svelte';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
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
	import BookIcon from '@lucide/svelte/icons/book';
	import CommandIcon from '@lucide/svelte/icons/command';
	import CalendarCheck2Icon from '@lucide/svelte/icons/calendar-check-2';
	import FilesIcon from '@lucide/svelte/icons/files';
	import LogOutIcon from '@lucide/svelte/icons/log-out';
	import MailOpenIcon from '@lucide/svelte/icons/mail-open';
	import MessageSquareQuoteIcon from '@lucide/svelte/icons/message-square-quote';
	import ShieldCheckIcon from '@lucide/svelte/icons/shield-check';
	import * as Avatar from '$lib/components/ui/avatar';
	import { toast } from 'svelte-sonner';
	import { onMount, type Component } from 'svelte';
	import { installPrompt } from '../../hooks.client';
	import { attendanceState, loadAttendance } from './attendance/attendance.svelte';
	import { documentsState, loadDocuments } from './documents/documents.svelte';
	import { loadMailData, mailDataState } from './mail/mailData.svelte';
	import { resetNonGradeRecords } from './resetNonGradeRecords.svelte';
	import { quickJumpState } from './quickJumpState.svelte';
	import { loadStudentInfo, studentInfoState } from './studentinfo/studentInfo.svelte';

	const sidebar = Sidebar.useSidebar();
	$effect(() => {
		page.url.pathname;
		if (sidebar.isMobile) sidebar.setOpenMobile(false);
	});

	let refreshingAll = $state(false);
	const refreshing = $derived(
		refreshingAll ||
			gradebookState.gradebookCatalog?.loadingIndex !== undefined ||
			(gradebookState.gradebookCatalog === undefined && gradebookState.loadingError === undefined)
	);
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
		if (refreshing || backgroundRefreshPromise) return;
		refreshingAll = true;
		try {
			// A single lightweight probe stops a dead upstream session from causing five
			// duplicate failed requests and opens the reconnect prompt immediately.
			await acc.studentAccount?.keepAlive();
			// Gradebook is the page's primary refresh target. StudentVUE requests for one
			// session are serialized, so enqueue it before the lower-priority records.
			const gradebookRefresh = gradebookState.gradebookCatalog
				? switchReportPeriod({
						overrideIndex: gradebookState.gradebookCatalog.overrideIndex,
						forceRefresh: true
					})
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

	let confirmLogOut = $state(false);

	function isRouteActive(url: string) {
		return page.url.pathname === url || page.url.pathname.startsWith(`${url}/`);
	}

	const navigation: {
		title: string;
		url: string;
		icon: Component;
		section: 'Overview' | 'School';
	}[] = [
		{ title: 'Gradebook', url: '/grades', icon: BookIcon, section: 'Overview' },
		{ title: 'Attendance', url: '/attendance', icon: CalendarCheck2Icon, section: 'School' },
		{ title: 'Documents', url: '/documents', icon: FilesIcon, section: 'School' },
		{ title: 'Mail', url: '/mail', icon: MailOpenIcon, section: 'School' },
		{ title: 'Feedback', url: '/feedback', icon: MessageSquareQuoteIcon, section: 'School' }
	];
	const navigationSections = ['Overview', 'School'] as const;
	const courseMarkerClasses = [
		'bg-chart-1',
		'bg-chart-2',
		'bg-chart-3',
		'bg-chart-4',
		'bg-chart-5'
	];

	onMount(() => {
		initializeGradebookCatalog();
		loadStudentInfo();
	});
</script>

<!-- Hallmark · component: sidebar · genre: atmospheric · theme: existing Grademaxxing tokens
 states: default · hover · focus · active · disabled · loading · error · success
 pre-emit critique: P5 H5 E5 S5 R5 V5 -->
<div
	class="hidden w-(--sidebar-width) shrink-0 md:block"
	aria-hidden="true"
	data-testid="sidebar-layout-spacer"
></div>

<Sidebar.Root
	collapsible={sidebar.isMobile ? 'offcanvas' : 'none'}
	class="sidebar-shell border-sidebar-border/80 h-svh shrink-0 overflow-hidden overscroll-none border-r md:fixed md:inset-y-0 md:left-0 md:z-40"
	data-testid="app-sidebar"
>
	<Sidebar.Header class="sidebar-header border-b-0 px-4 pt-5 pb-0">
		<div
			class="sidebar-brand flex h-12 w-full items-center gap-2 px-1 pt-1"
			data-testid="sidebar-brand"
		>
			<img src="/grademaxxing-growth-mark.png" class="size-8 shrink-0" alt="" />
			<span
				class="font-heading flex min-w-0 flex-1 flex-col text-xl leading-5 font-bold tracking-[-0.01em]"
				><span>{brandName}</span></span
			>
		</div>
	</Sidebar.Header>

	<Sidebar.Content
		class="sidebar-scroll-region gap-0 overflow-hidden overscroll-none px-4 pt-0 pb-2 group-data-[collapsible=icon]:p-2"
	>
		<nav
			aria-label="Primary navigation"
			data-testid="sidebar-primary-nav"
			class="group-data-[collapsible=icon]:w-8"
		>
			{#each navigationSections as section, sectionIndex (section)}
				<div class="sidebar-nav-section" class:mt-4={sectionIndex > 0}>
					<h2
						class="sidebar-section-heading text-tertiary-foreground mb-1.5 h-4 px-2 font-mono text-[0.5625rem] leading-4 font-semibold tracking-[0.18em] uppercase"
					>
						{section}
					</h2>
					<Sidebar.Menu class="gap-px">
						{#each navigation.filter((item) => item.section === section) as item (item.url)}
							<Sidebar.MenuItem>
								<Sidebar.MenuButton
									class="sidebar-nav-row text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground data-[active=true]:text-sidebar-accent-foreground h-9 gap-2.5 rounded-sm border-l-2 border-transparent px-3 text-sm font-medium transition-colors data-[active=true]:bg-transparent data-[active=true]:font-semibold!"
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
											<item.icon
												class="size-4 {item.url === '/grades' ? 'scale-[1.15]' : ''}"
												strokeWidth={1.75}
											/>
											<span class="flex-1">{item.title}</span>
										</a>
									{/snippet}
								</Sidebar.MenuButton>
							</Sidebar.MenuItem>
						{/each}
					</Sidebar.Menu>
				</div>
			{/each}
		</nav>

		<nav
			class="sidebar-classes-region mt-5 group-data-[collapsible=icon]:hidden"
			aria-labelledby="classes-heading"
			data-testid="sidebar-classes"
		>
			<h2
				id="classes-heading"
				class="sidebar-section-heading text-tertiary-foreground mb-1.5 flex h-4 items-center px-2 font-mono text-[0.5625rem] font-semibold tracking-[0.18em] uppercase"
			>
				Classes
			</h2>
			<button
				type="button"
				onclick={() => (quickJumpState.open = true)}
				class="text-muted-foreground hover:bg-sidebar-accent hover:text-foreground active:bg-sidebar-accent focus-visible:ring-sidebar-ring mb-1 -ml-1 flex h-7 w-full items-center gap-2 rounded-sm px-2 text-[0.78125rem] font-medium transition-colors outline-none focus-visible:ring-2"
				title="Quick jump (⌘K)"
				aria-label="Open quick jump"
				data-testid="quick-jump-trigger"
			>
				<CommandIcon class="size-3.5" strokeWidth={1.75} />
				<span>Jump to…</span>
				<span
					class="bg-sidebar-accent text-muted-foreground ml-auto rounded px-1 font-mono text-[0.625rem]"
					aria-hidden="true">⌘K</span
				>
			</button>

			<svelte:boundary>
				{#if courses}
					<ul class="space-y-px">
						{#each courses as course, index (course._CourseID)}
							<li>
								<a
									href={`/grades/${encodeURIComponent(course._CourseID)}`}
									class="sidebar-course-row hover:bg-sidebar-accent/60 hover:text-foreground active:bg-sidebar-accent focus-visible:ring-sidebar-ring flex h-7 items-center gap-2.5 rounded-sm border-l-2 px-2 text-[0.8125rem] transition-colors outline-none focus-visible:ring-2 {page
										.url.pathname === `/grades/${encodeURIComponent(course._CourseID)}`
										? 'text-sidebar-accent-foreground border-transparent font-semibold'
										: 'text-muted-foreground border-transparent'}"
									aria-current={page.url.pathname ===
									`/grades/${encodeURIComponent(course._CourseID)}`
										? 'page'
										: undefined}
									title={removeCourseType(course._CourseName)}
									data-testid="sidebar-course"
								>
									<span
										class="size-1.5 shrink-0 rounded-full {courseMarkerClasses[
											index % courseMarkerClasses.length
										]}"
										aria-hidden="true"
									>
									</span>
									<span class="truncate text-[0.78125rem] leading-none font-medium"
										>{removeCourseType(course._CourseName)}</span
									>
								</a>
							</li>
						{/each}
					</ul>
				{:else}
					<div class="text-muted-foreground flex items-center gap-2 px-3 py-4 text-sm">
						<Spinner class="size-4" /> Loading classes.
					</div>
				{/if}
			</svelte:boundary>
		</nav>

		<div
			class="sidebar-utilities mt-auto flex flex-col gap-2 pt-3 group-data-[collapsible=icon]:hidden"
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
			<div
				class="text-tertiary-foreground flex items-center gap-2 px-2 py-1 text-[0.6875rem] leading-[1.4]"
				data-testid="sidebar-privacy"
			>
				<ShieldCheckIcon class="text-success size-3.5 shrink-0" strokeWidth={1.75} />
				<span class="min-w-0"
					><strong class="text-foreground mr-1 font-medium">Privacy protected.</strong><a
						href="/privacy"
						class="text-link focus-visible:ring-sidebar-ring inline-flex whitespace-nowrap underline-offset-2 hover:underline focus-visible:rounded-sm focus-visible:ring-2 focus-visible:outline-none active:opacity-75"
						data-testid="sidebar-privacy-link">Details</a
					></span
				>
			</div>

			<button
				type="button"
				onclick={() => void refreshAll()}
				disabled={refreshing}
				class="hover:bg-sidebar-accent/60 active:bg-sidebar-accent focus-visible:ring-sidebar-ring flex min-h-12 w-full items-center gap-2 rounded-sm px-2 text-left transition-colors outline-none focus-visible:ring-2 disabled:cursor-wait disabled:opacity-70"
				aria-busy={refreshing}
				aria-label={refreshing
					? 'Refreshing grades and records'
					: portalConnection.state === 'offline'
						? 'Retry StudentVUE connection'
						: 'Refresh grades and records'}
				data-testid="sidebar-refresh"
			>
				<span class="flex size-9 shrink-0 items-center justify-center">
					{#key refreshing}
						<ThinkingOrb state={refreshing ? 'searching' : 'weaving'} />
					{/key}
				</span>
				<span class="min-w-0 flex-1">
					<span class="block text-[0.8125rem] leading-4 font-semibold"
						>{refreshing
							? 'Refreshing'
							: portalConnection.state === 'offline'
								? 'Retry connection'
								: 'Refresh'}</span
					>
					<span
						class="text-muted-foreground block truncate text-[0.6875rem] leading-4 font-normal"
						aria-live="polite"
						aria-atomic="true"
					>
						{refreshing
							? refreshingAll
								? 'Checking grades and records…'
								: 'Checking grades…'
							: lastSync !== undefined
								? `Updated ${getRelativeTime(new Date(lastSync))}`
								: 'Grades and records'}
					</span>
				</span>
			</button>
		</div>
	</Sidebar.Content>

	<Sidebar.Footer
		class="sidebar-footer border-sidebar-border border-t p-2"
		data-testid="sidebar-profile-footer"
	>
		<div class="flex items-center gap-1">
			<a
				href="/studentinfo"
				class="hover:bg-sidebar-accent active:bg-sidebar-accent focus-visible:ring-sidebar-ring flex h-11 min-w-0 flex-1 items-center gap-2 rounded-md px-2 transition-colors outline-none group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:p-0 focus-visible:ring-2"
				title={studentInfoState.data?.FormattedName ?? 'Student profile'}
				data-testid="sidebar-profile"
			>
				<Avatar.Root class="size-8 shrink-0 rounded-md after:rounded-md">
					{#if studentInfoState.data?.Photo}
						<Avatar.Image
							src="data:{studentInfoState.data.PhotoMimeType ||
								'image/png'};base64,{studentInfoState.data.Photo}"
							alt=""
						/>
					{/if}
					<Avatar.Fallback
						class="bg-sidebar-accent text-sidebar-accent-foreground rounded-md font-bold"
					>
						{profileName.charAt(0) || 'S'}
					</Avatar.Fallback>
				</Avatar.Root>
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
					class="hover:bg-sidebar-accent active:bg-sidebar-accent focus-visible:ring-sidebar-ring text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-md outline-none group-data-[collapsible=icon]:hidden focus-visible:ring-2"
					title="Install web app"
					aria-label="Install web app"
				>
					<AppWindowMacIcon class="size-4" strokeWidth={1.5} />
				</button>
			{/if}

			<AlertDialog.Root bind:open={confirmLogOut}>
				<AlertDialog.Trigger
					class="text-muted-foreground hover:bg-destructive-soft hover:text-destructive active:bg-destructive-soft active:text-destructive focus-visible:ring-sidebar-ring flex size-8 shrink-0 items-center justify-center rounded-md transition-colors outline-none group-data-[collapsible=icon]:hidden focus-visible:ring-2"
					title="Log out"
					aria-label="Log out"
					data-testid="sidebar-log-out"
				>
					<LogOutIcon class="size-4" strokeWidth={1.5} />
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
							onclick={logOut}
							data-testid="confirm-log-out"
						>
							Log out
						</AlertDialog.Action>
					</AlertDialog.Footer>
				</AlertDialog.Content>
			</AlertDialog.Root>
		</div>
	</Sidebar.Footer>
</Sidebar.Root>
