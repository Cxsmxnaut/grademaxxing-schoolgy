<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { LocalStorageKey } from '$lib';
	import { acc, loadStudentAccount } from '$lib/account.svelte';
	import { brand } from '$lib/brand';
	import BoundaryFailure from '$lib/components/BoundaryFailure.svelte';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { Spinner } from '$lib/components/ui/spinner';
	import { resetGradebookCatalog } from '$lib/grades/catalog.svelte';
	import BookOpenIcon from '@lucide/svelte/icons/book-open';
	import CalendarDaysIcon from '@lucide/svelte/icons/calendar-days';
	import FileTextIcon from '@lucide/svelte/icons/file-text';
	import LogOutIcon from '@lucide/svelte/icons/log-out';
	import MailIcon from '@lucide/svelte/icons/mail';
	import MoonIcon from '@lucide/svelte/icons/moon';
	import SunIcon from '@lucide/svelte/icons/sun';
	import { mode, setMode } from 'mode-watcher';
	import AppSidebar from './AppSidebar.svelte';
	import { resetNonGradeRecords } from './resetNonGradeRecords.svelte';
	import { onMount } from 'svelte';

	let { children } = $props();

	const mobileNavigation = [
		{ title: 'Grades', url: '/grades', icon: BookOpenIcon },
		{ title: 'Attendance', url: '/attendance', icon: CalendarDaysIcon },
		{ title: 'Documents', url: '/documents', icon: FileTextIcon },
		{ title: 'Mail', url: '/mail', icon: MailIcon }
	];

	function isRouteActive(url: string) {
		return page.url.pathname === url || page.url.pathname.startsWith(`${url}/`);
	}

	async function logOut() {
		const response = await fetch('/api/session', { method: 'DELETE' }).catch(() => undefined);
		await response?.arrayBuffer().catch(() => undefined);
		localStorage.clear();
		resetGradebookCatalog();
		resetNonGradeRecords();
		acc.studentAccount = undefined;
		location.assign('/login');
	}

	if (browser && !acc.studentAccount) {
		loadStudentAccount();
		if (!acc.studentAccount) void goto('/login');
	}

	onMount(() => {
		if (!acc.studentAccount) return;
		void acc.studentAccount.checkLogin().catch(() => {
			try {
				localStorage.removeItem(LocalStorageKey.token);
			} catch {
				// The active module session is still cleared when managed storage is unavailable.
			}
			resetGradebookCatalog();
			resetNonGradeRecords();
			acc.studentAccount = undefined;
			void goto('/login');
		});

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
		return () => window.removeEventListener('storage', handleStorage);
	});
</script>

<svelte:boundary>
	<Sidebar.Provider>
		<AppSidebar />

		<Sidebar.Inset class="min-w-0 pb-[3.75rem] md:pb-0">
			<header
				class="bg-card border-border/70 sticky top-0 z-30 flex h-[3.125rem] shrink-0 items-center border-b px-4 md:hidden"
			>
				<a
					href="/grades"
					class="mr-auto flex items-center gap-2 text-lg font-extrabold tracking-[-0.035em] whitespace-nowrap"
				>
					<img src="/favicon.svg" class="size-6" alt="" />
					{brand}
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
