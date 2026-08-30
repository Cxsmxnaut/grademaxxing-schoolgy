<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { LocalStorageKey } from '$lib';
	import { acc, loadStudentAccount } from '$lib/account.svelte';
	import { brand } from '$lib/brand';
	import BoundaryFailure from '$lib/components/BoundaryFailure.svelte';
	import Disclaimer from '$lib/components/Disclaimer.svelte';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { Spinner } from '$lib/components/ui/spinner';
	import { resetGradebookCatalog } from '$lib/grades/catalog.svelte';
	import AppSidebar from './AppSidebar.svelte';
	import { resetNonGradeRecords } from './resetNonGradeRecords.svelte';
	import { onMount } from 'svelte';

	let { children } = $props();

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
			location.assign(replacementSessionId ? '/dashboard' : '/login');
		};
		window.addEventListener('storage', handleStorage);
		return () => window.removeEventListener('storage', handleStorage);
	});
</script>

<svelte:boundary>
	<Sidebar.Provider>
		<AppSidebar />

		<Sidebar.Inset class="min-w-0">
			<header class="bg-background sticky top-0 z-20 flex shrink-0 items-center p-2 md:hidden">
				<Sidebar.Trigger />
				<a
					href="/dashboard"
					class="mr-auto ml-1 flex items-center gap-2 text-xl font-semibold tracking-tight whitespace-nowrap"
				>
					<img src="/favicon.svg" class="size-6" alt={brand} />
					{brand}
				</a>
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

			{#if page.url.pathname !== '/feedback'}
				<div class="mt-auto w-full text-xs">
					<div class="text-muted-foreground mx-auto w-fit p-4 pb-0">
						<a href="/feedback" class="text-tertiary-foreground">Report an issue</a> •
						<a href="/feedback" class="text-tertiary-foreground">Suggest a feature</a> •
						<a href="/feedback" class="text-tertiary-foreground">Provide feedback</a>
					</div>

					<Disclaimer trademark={false} />
				</div>
			{/if}
		</Sidebar.Inset>
	</Sidebar.Provider>

	{#snippet failed(error, reset)}
		<BoundaryFailure {error} {reset} />
	{/snippet}
</svelte:boundary>
