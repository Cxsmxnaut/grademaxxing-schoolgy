<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { env } from '$env/dynamic/public';
	import { LocalStorageKey } from '$lib';
	import { brand } from '$lib/brand';
	import AuthPanelHeader from '$lib/components/auth/AuthPanelHeader.svelte';
	import AuthShell from '$lib/components/auth/AuthShell.svelte';
	import { Button } from '$lib/components/ui/button';

	let sourceOrigin: string | null | undefined = $state(undefined);

	let hasExistingData = $state(false);

	if (browser) {
		hasExistingData = localStorage.getItem(LocalStorageKey.token) !== null;

		sourceOrigin = page.url.searchParams.get('origin');

		if (localStorage.getItem(LocalStorageKey.token) === null) startMigration();
	}

	function startMigration() {
		if (env.PUBLIC_ALLOWED_MIGRATION_ORIGINS === undefined) return;

		const allowedMigrationOrigins = env.PUBLIC_ALLOWED_MIGRATION_ORIGINS.split(',');

		if (opener !== null && sourceOrigin !== null && sourceOrigin !== undefined) {
			(opener as Window).postMessage('ready', sourceOrigin);

			addEventListener('message', ({ origin, data, source }) => {
				if (!allowedMigrationOrigins.includes(origin) || !(data instanceof Map)) return;

				data.forEach((value, key) => localStorage.setItem(key, value));

				source?.postMessage('success', { targetOrigin: origin });

				goto('/grades');
			});
		}
	}
</script>

<svelte:head><title>Import Data - {brand}</title></svelte:head>

<AuthShell promo={false}>
	<section
		class="w-full max-w-[30rem] rounded-2xl border border-[rgba(228,238,248,0.1)] bg-[#0d2033] p-5 text-[#e4eef8] shadow-[0_1px_2px_rgba(0,0,0,0.4),0_8px_24px_rgba(0,0,0,0.3)] sm:p-9"
	>
		<AuthPanelHeader />
		<p class="mb-2 text-xs font-bold tracking-[0.14em] text-[#4db6f5] uppercase">Data import</p>
		<h1
			class="mb-5 text-[1.4375rem] leading-[2.15625rem] font-bold tracking-[-0.01em]"
			style="font-family: 'Space Grotesk', sans-serif"
		>
			Move your local app data
		</h1>

		<div class="space-y-4 text-sm leading-6 text-[#8fa9c2]">
			<p>
				{#if env.PUBLIC_ALLOWED_MIGRATION_ORIGINS !== undefined}
					{#if sourceOrigin !== null}
						Migrating user data from {sourceOrigin}...
					{:else}
						Cannot migrate user data: source origin unspecified
					{/if}
				{:else}
					Cannot migrate user data: no migration origins allowed
				{/if}
			</p>

			{#if env.PUBLIC_ALLOWED_MIGRATION_ORIGINS !== undefined && sourceOrigin !== null && hasExistingData}
				<p>You already have data here. Would you like to overwrite it?</p>

				<div class="flex gap-2 pt-2">
					<Button href="/grades" variant="outline" class="flex-1">Cancel</Button>
					<Button onclick={startMigration} variant="destructive" class="flex-1 cursor-pointer">
						Overwrite
					</Button>
				</div>
			{/if}
		</div>
	</section>
</AuthShell>
