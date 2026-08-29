<script lang="ts">
	import * as Alert from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';

	interface Props {
		label: string;
		error: string;
		retry: () => unknown | Promise<unknown>;
		refreshing?: boolean;
	}

	let { label, error, retry, refreshing = false }: Props = $props();
	let sessionExpired = $derived(/session has expired|sign in/i.test(error));
</script>

<Alert.Root variant="destructive" class="mx-auto my-4 w-fit max-w-[calc(100%-2rem)]">
	<TriangleAlertIcon />
	<Alert.Title>Couldn't load {label}.</Alert.Title>
	<Alert.Description class="space-y-3">
		<p>{error}</p>
		{#if sessionExpired}
			<Button href="/login" variant="outline" data-sveltekit-reload>Sign in again</Button>
		{:else}
			<Button onclick={retry} variant="outline" disabled={refreshing}>
				{refreshing ? 'Retrying…' : 'Try again'}
			</Button>
		{/if}
	</Alert.Description>
</Alert.Root>
