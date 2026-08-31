<script lang="ts">
	import { page } from '$app/state';
	import { getRelativeTime, removeCourseType } from '$lib';
	import { acc } from '$lib/account.svelte';
	import { brand } from '$lib/brand';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { Spinner } from '$lib/components/ui/spinner';
	import {
		gradebookState,
		initializeGradebookCatalog,
		resetGradebookCatalog,
		switchReportPeriod
	} from '$lib/grades/catalog.svelte';
	import { getActiveGradebook } from '$lib/grades/gradebook';
	import AppWindowMacIcon from '@lucide/svelte/icons/app-window-mac';
	import BookOpenIcon from '@lucide/svelte/icons/book-open';
	import CalendarDaysIcon from '@lucide/svelte/icons/calendar-days';
	import FileTextIcon from '@lucide/svelte/icons/file-text';
	import HouseIcon from '@lucide/svelte/icons/house';
	import LogOutIcon from '@lucide/svelte/icons/log-out';
	import MailIcon from '@lucide/svelte/icons/mail';
	import MoonIcon from '@lucide/svelte/icons/moon';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import SunIcon from '@lucide/svelte/icons/sun';
	import { mode, setMode } from 'mode-watcher';
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

	async function logOut() {
		const response = await fetch('/api/session', { method: 'DELETE' }).catch(() => undefined);
		await response?.arrayBuffer().catch(() => undefined);
		localStorage.clear();
		resetGradebookCatalog();
		resetNonGradeRecords();
		acc.studentAccount = undefined;
		location.assign('/login');
	}

	const courses = $derived(getActiveGradebook()?.Courses.Course);
	const gradebookLastRefresh = $derived.by(() => {
		const catalog = gradebookState.gradebookCatalog;
		if (!catalog) return undefined;
		const index = catalog.overrideIndex ?? catalog.defaultIndex;
		return catalog.recordCache[index]?.lastRefresh;
	});
	const lastSync = $derived.by(() => {
		const values = [
			gradebookLastRefresh,
			attendanceState.lastRefresh,
			documentsState.lastRefresh,
			mailDataState.lastRefresh,
			studentInfoState.lastRefresh
		].filter((value): value is number => value !== undefined);
		return values.length ? Math.max(...values) : undefined;
	});
	const profileName = $derived.by(() => {
		const formattedName = studentInfoState.data?.FormattedName.trim();
		if (!formattedName) return 'Student profile';
		const givenNames = formattedName.includes(',')
			? formattedName.split(',').slice(1).join(' ').trim()
			: formattedName;
		return givenNames.split(/\s+/)[0] || formattedName;
	});

	async function refreshAll() {
		if (refreshingAll) return;
		refreshingAll = true;
		const refreshes: Promise<unknown>[] = [
			loadAttendance(true),
			loadDocuments(true),
			loadMailData(true),
			loadStudentInfo(true)
		];
		if (gradebookState.gradebookCatalog) refreshes.push(switchReportPeriod({ forceRefresh: true }));
		await Promise.allSettled(refreshes);
		refreshingAll = false;
	}

	function installWebApp() {
		$installPrompt.prompt?.();
	}

	function isRouteActive(url: string) {
		return page.url.pathname === url || page.url.pathname.startsWith(`${url}/`);
	}

	const navigation: { title: string; url: string; icon: Component }[] = [
		{ title: 'Dashboard', url: '/dashboard', icon: HouseIcon },
		{ title: 'Gradebook', url: '/grades', icon: BookOpenIcon },
		{ title: 'Attendance', url: '/attendance', icon: CalendarDaysIcon },
		{ title: 'Documents', url: '/documents', icon: FileTextIcon },
		{ title: 'Mail', url: '/mail', icon: MailIcon }
	];

	onMount(() => {
		initializeGradebookCatalog();
		loadStudentInfo();
	});
</script>

<Sidebar.Root class="border-sidebar-border/80" data-testid="app-sidebar">
	<Sidebar.Header class="px-[0.875rem] pt-5 pb-[1.734375rem]">
		<a
			href="/dashboard"
			class="focus-visible:ring-sidebar-ring flex h-[3.03125rem] w-full items-start gap-[0.5625rem] rounded-lg px-2 pt-1 pb-4 outline-none focus-visible:ring-2"
			aria-label={`${brand} dashboard`}
			data-testid="sidebar-brand"
		>
			<img src="/favicon.svg" class="size-7" alt="" />
			<span
				class="text-[1.1875rem] leading-7 font-bold tracking-[-0.01em]"
				style="font-family: 'Space Grotesk Variable', 'Instrument Sans Variable', system-ui, sans-serif;"
				>{brand}</span
			>
		</a>
	</Sidebar.Header>

	<Sidebar.Content class="gap-0 px-[0.875rem] pb-0">
		<nav aria-label="Primary navigation" data-testid="sidebar-primary-nav">
			<Sidebar.Menu class="gap-[0.1875rem]">
				{#each navigation as item (item.url)}
					<Sidebar.MenuItem>
						<Sidebar.MenuButton
							class="text-muted-foreground hover:text-sidebar-accent-foreground data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground h-[2.3125rem] gap-2.5 rounded-[0.5rem] px-3 py-2.5 text-sm font-semibold transition-colors data-[active=true]:font-semibold"
							isActive={isRouteActive(item.url)}
						>
							{#snippet child({ props })}
								<a
									href={item.url}
									aria-current={page.url.pathname === item.url ? 'page' : undefined}
									data-testid={`sidebar-nav-${item.url.slice(1)}`}
									{...props}
								>
									<item.icon class="size-4" strokeWidth={1.5} />
									<span>{item.title}</span>
								</a>
							{/snippet}
						</Sidebar.MenuButton>
					</Sidebar.MenuItem>
				{/each}
			</Sidebar.Menu>
		</nav>

		<section class="mt-[1.375rem]" aria-labelledby="classes-heading" data-testid="sidebar-classes">
			<h2
				id="classes-heading"
				class="text-tertiary-foreground h-[1.03125rem] px-2 text-[0.6875rem] leading-[1.03125rem] font-semibold tracking-[0.1em] uppercase"
			>
				Classes
			</h2>

			<svelte:boundary>
				{#if courses}
					<ol class="mt-2 space-y-px">
						{#each courses as course, index (course._CourseID)}
							<li>
								<a
									href={`/grades/${encodeURIComponent(course._CourseID)}`}
									class="hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-sidebar-ring flex h-[1.8125rem] items-center gap-2 rounded-[0.4375rem] px-2 py-[0.4375rem] outline-none focus-visible:ring-2 {page
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
										class="text-tertiary-foreground w-3 shrink-0 font-mono text-[0.6875rem] leading-none tabular-nums"
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
						<Spinner class="size-4" /> Loading classes
					</div>
				{/if}
			</svelte:boundary>
		</section>

		<div class="mt-auto flex flex-col gap-3 pt-4" data-testid="sidebar-utilities">
			<a
				href="/privacy"
				class="border-border text-tertiary-foreground hover:bg-sidebar-accent block rounded-[0.5625rem] border px-[0.6875rem] py-[0.5625rem] text-[0.71875rem] leading-[1.45] transition-colors"
				data-testid="sidebar-privacy"
			>
				Your password is never stored. Signing out deletes your secure server session.
			</a>

			<div
				class="text-tertiary-foreground flex items-center px-1.5 text-[0.6875rem] leading-[0.9625rem]"
			>
				<span>Built for students</span>
				<span class="px-1.5" aria-hidden="true">·</span>
				<a href="/feedback" class="hover:text-foreground underline underline-offset-4">Feedback</a>
			</div>

			<button
				type="button"
				onclick={() => void refreshAll()}
				disabled={refreshingAll}
				class="border-input hover:bg-sidebar-accent flex h-9 w-full items-center justify-center gap-2 rounded-[0.4375rem] border px-3 text-[0.78125rem] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60"
				aria-busy={refreshingAll}
				data-testid="sidebar-refresh"
			>
				<RefreshCwIcon class="size-3.5 {refreshingAll ? 'animate-spin' : ''}" strokeWidth={1.5} />
				<span>{refreshingAll ? 'Refreshing' : 'Refresh'}</span>
				{#if lastSync !== undefined && !refreshingAll}
					<span class="text-muted-foreground font-normal"
						>{getRelativeTime(new Date(lastSync))}</span
					>
				{/if}
			</button>

			<div
				class="border-input grid grid-cols-2 gap-1 rounded-[0.5rem] border p-1"
				aria-label="Color theme"
				data-testid="sidebar-theme"
			>
				<button
					type="button"
					onclick={() => setMode('dark')}
					class="flex h-[1.9375rem] items-center justify-center gap-[0.4375rem] rounded-[0.3125rem] text-xs font-semibold transition-colors {mode.current ===
					'dark'
						? 'bg-sidebar-accent text-sidebar-accent-foreground'
						: 'text-muted-foreground hover:text-foreground'}"
					aria-pressed={mode.current === 'dark'}
				>
					<MoonIcon class="size-[0.8125rem]" strokeWidth={1.5} /> Dark
				</button>
				<button
					type="button"
					onclick={() => setMode('light')}
					class="flex h-[1.9375rem] items-center justify-center gap-[0.4375rem] rounded-[0.3125rem] text-xs font-semibold transition-colors {mode.current ===
					'light'
						? 'bg-sidebar-accent text-sidebar-accent-foreground'
						: 'text-muted-foreground hover:text-foreground'}"
					aria-pressed={mode.current === 'light'}
				>
					<SunIcon class="size-[0.8125rem]" strokeWidth={1.5} /> Light
				</button>
			</div>
		</div>
	</Sidebar.Content>

	<Sidebar.Footer
		class="border-sidebar-border border-t px-[0.875rem] py-2.5"
		data-testid="sidebar-profile-footer"
	>
		<div class="flex items-center gap-3">
			<a
				href="/studentinfo"
				class="hover:bg-sidebar-accent focus-visible:ring-sidebar-ring flex min-w-0 flex-1 items-center gap-2.5 rounded-lg p-1.5 outline-none focus-visible:ring-2"
				title={studentInfoState.data?.FormattedName ?? 'Student profile'}
				data-testid="sidebar-profile"
			>
				{#if studentInfoState.data?.Photo}
					<img
						src="data:{studentInfoState.data.PhotoMimeType || 'image/png'};base64,{studentInfoState
							.data.Photo}"
						class="size-9 shrink-0 rounded-full object-cover"
						alt=""
					/>
				{:else}
					<span
						class="bg-sidebar-accent text-sidebar-accent-foreground flex size-9 shrink-0 items-center justify-center rounded-full font-bold"
					>
						{profileName.charAt(0) || 'S'}
					</span>
				{/if}
				<span class="min-w-0">
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
					class="hover:bg-sidebar-accent focus-visible:ring-sidebar-ring text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-lg outline-none focus-visible:ring-2"
					title="Install web app"
					aria-label="Install web app"
				>
					<AppWindowMacIcon class="size-4" strokeWidth={1.5} />
				</button>
			{/if}

			<button
				type="button"
				onclick={logOut}
				class="hover:bg-sidebar-accent focus-visible:ring-sidebar-ring text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-lg outline-none focus-visible:ring-2"
				title="Log out"
				aria-label="Log out"
			>
				<LogOutIcon class="size-4" strokeWidth={1.5} />
			</button>
		</div>
	</Sidebar.Footer>
</Sidebar.Root>
