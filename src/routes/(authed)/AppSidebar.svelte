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

<Sidebar.Root class="border-sidebar-border/80">
	<Sidebar.Header class="px-[1.375rem] pt-6 pb-5">
		<a
			href="/dashboard"
			class="focus-visible:ring-sidebar-ring flex w-fit items-center gap-2.5 rounded-lg outline-none focus-visible:ring-2"
		>
			<img src="/favicon.svg" class="size-7" alt="" />
			<span class="text-[1.22rem] font-extrabold tracking-[-0.035em]">{brand}</span>
		</a>
	</Sidebar.Header>

	<Sidebar.Content class="px-[0.875rem] pb-3">
		<nav aria-label="Primary navigation">
			<Sidebar.Menu class="gap-0.5">
				{#each navigation as item (item.url)}
					<Sidebar.MenuItem>
						<Sidebar.MenuButton
							class="data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground h-[2.375rem] rounded-lg px-3 text-[0.90625rem] font-semibold"
							isActive={isRouteActive(item.url)}
						>
							{#snippet child({ props })}
								<a href={item.url} {...props}>
									<item.icon class="size-[1.15rem]" />
									<span>{item.title}</span>
								</a>
							{/snippet}
						</Sidebar.MenuButton>
					</Sidebar.MenuItem>
				{/each}
			</Sidebar.Menu>
		</nav>

		<section class="mt-[1.375rem]" aria-labelledby="classes-heading">
			<h2
				id="classes-heading"
				class="text-muted-foreground px-2 text-[0.6875rem] font-bold tracking-[0.15em] uppercase"
			>
				Classes
			</h2>

			<svelte:boundary>
				{#if courses}
					<ol class="mt-2 space-y-0">
						{#each courses as course, index (course._CourseID)}
							<li>
								<a
									href={`/grades/${encodeURIComponent(course._CourseID)}`}
									class="hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-sidebar-ring flex min-h-[1.875rem] items-center gap-2 rounded-lg px-2 py-1 text-[0.8125rem] outline-none focus-visible:ring-2 {page
										.url.pathname === `/grades/${encodeURIComponent(course._CourseID)}`
										? 'bg-sidebar-accent text-sidebar-accent-foreground font-semibold'
										: 'text-muted-foreground'}"
								>
									<span class="w-4 shrink-0 text-center tabular-nums">{index + 1}</span>
									<span class="truncate">{removeCourseType(course._CourseName)}</span>
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

		<div class="mt-auto space-y-2.5 pt-5">
			<a
				href="/privacy"
				class="border-border/70 text-muted-foreground hover:bg-sidebar-accent block rounded-lg border px-3 py-2.5 text-[0.7rem] leading-[1.45] transition-colors"
			>
				Your password is never stored. Signing out deletes your secure server session.
			</a>

			<div class="text-muted-foreground px-1 text-[0.6875rem] leading-4">
				<p>Built for students.</p>
				<a href="/feedback" class="hover:text-foreground underline underline-offset-4"
					>Send feedback</a
				>
			</div>

			<button
				type="button"
				onclick={() => void refreshAll()}
				disabled={refreshingAll}
				class="border-border/70 hover:bg-sidebar-accent flex h-9 w-full items-center justify-center gap-2 rounded-lg border px-3 text-[0.8125rem] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60"
				aria-busy={refreshingAll}
			>
				<RefreshCwIcon class="size-4 {refreshingAll ? 'animate-spin' : ''}" />
				<span>{refreshingAll ? 'Refreshing' : 'Refresh'}</span>
				{#if lastSync !== undefined && !refreshingAll}
					<span class="text-muted-foreground font-normal"
						>{getRelativeTime(new Date(lastSync))}</span
					>
				{/if}
			</button>

			<div
				class="border-border/70 grid grid-cols-2 gap-1 rounded-lg border p-1"
				aria-label="Color theme"
			>
				<button
					type="button"
					onclick={() => setMode('dark')}
					class="flex h-8 items-center justify-center gap-2 rounded-md text-[0.8125rem] font-semibold transition-colors {mode.current ===
					'dark'
						? 'bg-sidebar-accent text-sidebar-accent-foreground'
						: 'text-muted-foreground hover:text-foreground'}"
					aria-pressed={mode.current === 'dark'}
				>
					<MoonIcon class="size-4" /> Dark
				</button>
				<button
					type="button"
					onclick={() => setMode('light')}
					class="flex h-8 items-center justify-center gap-2 rounded-md text-[0.8125rem] font-semibold transition-colors {mode.current ===
					'light'
						? 'bg-sidebar-accent text-sidebar-accent-foreground'
						: 'text-muted-foreground hover:text-foreground'}"
					aria-pressed={mode.current === 'light'}
				>
					<SunIcon class="size-4" /> Light
				</button>
			</div>
		</div>
	</Sidebar.Content>

	<Sidebar.Footer class="border-sidebar-border/70 border-t px-[0.875rem] py-2.5">
		<div class="flex items-center gap-3">
			<a
				href="/studentinfo"
				class="hover:bg-sidebar-accent focus-visible:ring-sidebar-ring flex min-w-0 flex-1 items-center gap-2.5 rounded-lg p-1.5 outline-none focus-visible:ring-2"
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
						{studentInfoState.data?.FormattedName.trim().charAt(0) || 'S'}
					</span>
				{/if}
				<span class="min-w-0">
					<span class="block truncate text-sm font-bold">
						{studentInfoState.data?.FormattedName ?? 'Student profile'}
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
					<AppWindowMacIcon class="size-4" />
				</button>
			{/if}

			<button
				type="button"
				onclick={logOut}
				class="hover:bg-sidebar-accent focus-visible:ring-sidebar-ring text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-lg outline-none focus-visible:ring-2"
				title="Log out"
				aria-label="Log out"
			>
				<LogOutIcon class="size-4" />
			</button>
		</div>
	</Sidebar.Footer>
</Sidebar.Root>
