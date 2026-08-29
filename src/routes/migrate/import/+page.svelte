<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { env } from '$env/dynamic/public';
	import { LocalStorageKey } from '$lib';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { onMount } from 'svelte';

	let sourceOrigin: string | null | undefined = $state(undefined);

	let hasExistingData = $state(false);

	onMount(() => {
		hasExistingData = localStorage.getItem(LocalStorageKey.token) !== null;
		sourceOrigin = page.url.searchParams.get('origin');
		if (!hasExistingData) startMigration();
	});

	function startMigration() {
		if (env.PUBLIC_ALLOWED_MIGRATION_ORIGINS === undefined) return;

		const allowedMigrationOrigins = env.PUBLIC_ALLOWED_MIGRATION_ORIGINS.split(',')
			.map((origin) => origin.trim())
			.filter(Boolean);

		if (
			opener !== null &&
			sourceOrigin !== null &&
			sourceOrigin !== undefined &&
			allowedMigrationOrigins.includes(sourceOrigin)
		) {
			(opener as Window).postMessage('ready', sourceOrigin);

			addEventListener('message', ({ origin, data, source }) => {
				if (
					source !== opener ||
					origin !== sourceOrigin ||
					!allowedMigrationOrigins.includes(origin) ||
					!(data instanceof Map)
				)
					return;

				const allowedKeys = new Set(Object.values(LocalStorageKey));
				data.forEach((value, key) => {
					if (
						typeof key === 'string' &&
						typeof value === 'string' &&
						allowedKeys.has(key as LocalStorageKey) &&
						value.length <= 10 * 1024 * 1024
					)
						localStorage.setItem(key, value);
				});

				source?.postMessage('success', { targetOrigin: origin });

				goto('/grades');
			});
		}
	}
</script>

<div class="flex min-h-screen min-w-screen items-center justify-center">
	<Card.Root>
		<Card.Header>
			<Card.Title>Migrate User Data</Card.Title>
		</Card.Header>

		<Card.Content class="space-y-4">
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

				<div class="flex gap-2">
					<Button href="/grades" variant="outline" class="flex-1">Cancel</Button>
					<Button onclick={startMigration} variant="destructive" class="flex-1 cursor-pointer">
						Overwrite
					</Button>
				</div>
			{/if}
		</Card.Content>
	</Card.Root>
</div>
