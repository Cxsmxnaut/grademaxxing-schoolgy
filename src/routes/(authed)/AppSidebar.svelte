<script lang="ts">
	import { page } from '$app/state';
	import { getRelativeTime, removeCourseType } from '$lib';
	import { acc } from '$lib/account.svelte';
	import { brand } from '$lib/brand';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import {
		gradebookState,
		initializeGradebookCatalog,
		resetGradebookCatalog,
		switchReportPeriod
	} from '$lib/grades/catalog.svelte';
	import { getActiveGradebook } from '$lib/grades/gradebook';
	import BookOpenIcon from '@lucide/svelte/icons/book-open';
	import CalendarDaysIcon from '@lucide/svelte/icons/calendar-days';
	import FileTextIcon from '@lucide/svelte/icons/file-text';
	import LayoutDashboardIcon from '@lucide/svelte/icons/layout-dashboard';
	import LogOutIcon from '@lucide/svelte/icons/log-out';
	import MailIcon from '@lucide/svelte/icons/mail';
	import MoonIcon from '@lucide/svelte/icons/moon';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import SunIcon from '@lucide/svelte/icons/sun';
	import { mode, setMode } from 'mode-watcher';
	import { onMount, type Component } from 'svelte';
	import { installPrompt } from '../../hooks.client';
	import { loadAttendance } from './attendance/attendance.svelte';
	import { loadDocuments } from './documents/documents.svelte';
	import { loadMailData } from './mail/mailData.svelte';
	import { resetNonGradeRecords } from './resetNonGradeRecords.svelte';
	import { loadStudentInfo, studentInfoState } from './studentinfo/studentInfo.svelte';

	const sidebar = Sidebar.useSidebar();

	let refreshing = $state(false);

	const courses = $derived(getActiveGradebook()?.Courses.Course ?? []);
	const studentName = $derived(studentInfoState.data?.FormattedName?.trim() || 'Student');
	const studentInitial = $derived(studentName.charAt(0).toUpperCase());
	const studentDetail = $derived(
		studentInfoState.data?.Grade === null || studentInfoState.data?.Grade === undefined
			? 'Student information'
			: `Grade ${studentInfoState.data.Grade}`
	);
	const lastRefresh = $derived.by(() => {
		gradebookState.version;
		const catalog = gradebookState.gradebookCatalog;
		if (!catalog) return undefined;
		const activeIndex = catalog.overrideIndex ?? catalog.defaultIndex;
		return catalog.recordCache[activeIndex]?.lastRefresh;
	});

	const navigation: { title: string; url: string; icon: Component }[] = [
		{ title: 'Dashboard', url: '/dashboard', icon: LayoutDashboardIcon },
		{ title: 'Gradebook', url: '/grades', icon: BookOpenIcon },
		{ title: 'Documents', url: '/documents', icon: FileTextIcon },
		{ title: 'Mail', url: '/mail', icon: MailIcon },
		{ title: 'Attendance', url: '/attendance', icon: CalendarDaysIcon }
	];

	function closeMobileSidebar() {
		if (sidebar.isMobile) sidebar.setOpenMobile(false);
	}

	function routeIsActive(url: string) {
		return page.url.pathname === url || page.url.pathname.startsWith(`${url}/`);
	}

	async function refreshEverything() {
		if (refreshing || !acc.studentAccount) return;
		refreshing = true;
		try {
			if (gradebookState.gradebookCatalog) {
				await switchReportPeriod({
					overrideIndex: gradebookState.gradebookCatalog.overrideIndex,
					forceRefresh: true
				}).catch(() => undefined);
			} else {
				await initializeGradebookCatalog().catch(() => undefined);
			}
			await Promise.allSettled([
				loadAttendance(true),
				loadDocuments(true),
				loadMailData(true),
				loadStudentInfo(true)
			]);
		} finally {
			refreshing = false;
		}
	}

	async function logOut() {
		const response = await fetch('/api/session', { method: 'DELETE' }).catch(() => undefined);
		await response?.arrayBuffer().catch(() => undefined);
		try {
			localStorage.clear();
		} catch {
			// Continue clearing in-memory private data when managed storage is unavailable.
		}
		resetGradebookCatalog();
		resetNonGradeRecords();
		acc.studentAccount = undefined;
		location.assign('/login');
	}

	onMount(() => {
		if (!acc.studentAccount) return;
		void initializeGradebookCatalog();
		void loadStudentInfo();
	});
</script>

<Sidebar.Root data-testid="app-sidebar">
	<Sidebar.Header class="px-5 pt-6 pb-3">
		<a
			href="/dashboard"
			onclick={closeMobileSidebar}
			class="focus-visible:ring-sidebar-ring flex items-center gap-3 rounded-xl px-1 py-2 outline-none focus-visible:ring-2"
		>
			<img src="/favicon.svg" class="size-10 drop-shadow-sm" alt="" />
			<span class="text-xl font-bold tracking-tight">{brand}</span>
		</a>
	</Sidebar.Header>

	<Sidebar.Content class="px-4 pb-3">
		<nav aria-label="Student navigation" class="space-y-1">
			{#each navigation as item (item.url)}
				{@const active = routeIsActive(item.url)}
				<a
					href={item.url}
					onclick={closeMobileSidebar}
					aria-current={active ? 'page' : undefined}
					class:bg-sidebar-accent={active}
					class:text-sidebar-accent-foreground={active}
					class="text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-sidebar-ring flex h-11 items-center gap-3 rounded-xl px-3 text-base font-semibold transition-colors focus-visible:ring-2 focus-visible:outline-none"
				>
					<item.icon class="size-5" />
					<span>{item.title}</span>
				</a>
			{/each}
		</nav>

		<section class="mt-7" aria-labelledby="sidebar-classes-heading">
			<h2
				id="sidebar-classes-heading"
				class="text-sidebar-foreground/55 px-3 text-xs font-semibold tracking-[0.16em] uppercase"
			>
				Classes
			</h2>
			<div class="mt-2 space-y-0.5">
				{#each courses as course (course._CourseID)}
					{@const url = `/grades/${encodeURIComponent(course._CourseID)}`}
					{@const active = page.url.pathname === url}
					<a
						href={url}
						onclick={closeMobileSidebar}
						aria-current={active ? 'page' : undefined}
						class:bg-sidebar-accent={active}
						class:text-sidebar-accent-foreground={active}
						class="text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-sidebar-ring grid min-h-9 grid-cols-[1.25rem_1fr] items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
					>
						<span class="text-sidebar-foreground/50 font-mono text-xs">{course._Period}</span>
						<span class="truncate">{removeCourseType(course._CourseName)}</span>
					</a>
				{:else}
					<p class="px-3 py-2 text-sm text-sidebar-foreground/50">Loading classes…</p>
				{/each}
			</div>
		</section>

		<div class="mt-auto space-y-3 pt-6">
			<a
				href="/privacy"
				onclick={closeMobileSidebar}
				class="bg-sidebar-accent/45 text-sidebar-foreground/65 hover:bg-sidebar-accent focus-visible:ring-sidebar-ring block rounded-xl px-4 py-3 text-sm leading-relaxed transition-colors focus-visible:ring-2 focus-visible:outline-none"
			>
				Your password is never stored. Signing out deletes your secure server session.
			</a>
			<div class="text-sidebar-foreground/55 flex items-center justify-center gap-2 text-xs">
				<a href="/feedback" onclick={closeMobileSidebar} class="hover:text-sidebar-foreground"
					>Feedback</a
				>
				{#if $installPrompt.prompt}
					<span aria-hidden="true">·</span>
					<button
						type="button"
						onclick={() => $installPrompt.prompt?.()}
						class="hover:text-sidebar-foreground"
					>
						Install app
					</button>
				{/if}
			</div>
		</div>
	</Sidebar.Content>

	<Sidebar.Footer class="gap-3 px-4 pt-5 pb-5">
		<button
			type="button"
			onclick={() => void refreshEverything()}
			disabled={refreshing}
			aria-busy={refreshing}
			class="bg-card text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-sidebar-ring flex h-10 w-full items-center justify-center gap-3 rounded-xl text-sm font-semibold shadow-sm transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:cursor-wait disabled:opacity-60"
		>
			<RefreshCwIcon class={['size-4', refreshing && 'animate-spin']} />
			<span>{refreshing ? 'Refreshing' : 'Refresh'}</span>
			{#if lastRefresh !== undefined}
				<span class="text-sidebar-foreground/50 font-mono text-xs font-normal">
					{getRelativeTime(new Date(lastRefresh))}
				</span>
			{/if}
		</button>

		<div class="bg-muted grid grid-cols-2 rounded-xl p-1" aria-label="Color theme">
			<button
				type="button"
				onclick={() => setMode('dark')}
				aria-pressed={mode.current === 'dark'}
				class:bg-sidebar-accent={mode.current === 'dark'}
				class:text-sidebar-accent-foreground={mode.current === 'dark'}
				class="text-sidebar-foreground/55 hover:text-sidebar-foreground focus-visible:ring-sidebar-ring flex h-9 items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:outline-none"
			>
				<MoonIcon class="size-4" /> Dark
			</button>
			<button
				type="button"
				onclick={() => setMode('light')}
				aria-pressed={mode.current === 'light'}
				class:bg-sidebar-accent={mode.current === 'light'}
				class:text-sidebar-accent-foreground={mode.current === 'light'}
				class="text-sidebar-foreground/55 hover:text-sidebar-foreground focus-visible:ring-sidebar-ring flex h-9 items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:outline-none"
			>
				<SunIcon class="size-4" /> Light
			</button>
		</div>

		<div class="flex items-center gap-3 pt-2">
			<a
				href="/studentinfo"
				onclick={closeMobileSidebar}
				class="focus-visible:ring-sidebar-ring flex min-w-0 flex-1 items-center gap-3 rounded-lg focus-visible:ring-2 focus-visible:outline-none"
			>
				{#if studentInfoState.data?.Photo}
					<img
						src="data:{studentInfoState.data.PhotoMimeType || 'image/png'};base64,{studentInfoState
							.data.Photo}"
						class="size-10 shrink-0 rounded-full object-cover"
						alt=""
					/>
				{:else}
					<span
						class="bg-sidebar-accent text-sidebar-accent-foreground flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold"
						>{studentInitial}</span
					>
				{/if}
				<span class="min-w-0">
					<strong class="block truncate text-sm">{studentName}</strong>
					<span class="text-sidebar-foreground/55 block truncate text-xs">{studentDetail}</span>
				</span>
			</a>
			<button
				type="button"
				onclick={() => void logOut()}
				aria-label="Log out"
				class="text-sidebar-foreground/55 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-sidebar-ring flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors focus-visible:ring-2 focus-visible:outline-none"
			>
				<LogOutIcon class="size-4" />
			</button>
		</div>
	</Sidebar.Footer>
</Sidebar.Root>
