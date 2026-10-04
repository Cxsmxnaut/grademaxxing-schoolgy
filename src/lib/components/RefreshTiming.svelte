<script lang="ts">
	import { onMount } from 'svelte';
	import { subscribeRefreshTiming, type RefreshTimingResult } from '$lib/studentvue/refresh-timing';
	let result = $state<RefreshTimingResult>();
	onMount(() =>
		subscribeRefreshTiming((value) => {
			result = value;
		})
	);
</script>

<details class="border-border bg-card my-4 rounded-md border p-4" open data-testid="refresh-timing">
	<summary class="font-semibold">Refresh timings</summary>
	<p class="text-muted-foreground mt-2 text-sm">
		Use Refresh to measure this session. Timings stay in memory and contain no records or identity.
	</p>
	{#if result}
		<p class="my-2 text-sm" role="status">
			{result.complete ? `Complete: ${(result.elapsedMs / 1000).toFixed(2)} seconds` : 'Measuring…'}
		</p>
		<div class="overflow-x-auto">
			<table class="w-full text-left text-sm">
				<thead
					><tr
						><th class="p-2">Request</th><th class="p-2">Queue</th><th class="p-2"
							>Fetch to headers</th
						><th class="p-2">Body</th><th class="p-2">Status</th></tr
					></thead
				>
				<tbody>
					{#each result.requests as request (request.ordinal)}
						{#each request.attempts as attempt (attempt.attempt)}
							<tr
								><td class="p-2"
									>{request.path}{attempt.attempt > 1 ? ` (attempt ${attempt.attempt})` : ''}</td
								><td class="p-2">{request.queueWaitMs ?? 0} ms</td><td class="p-2"
									>{attempt.toHeadersMs ?? '…'} ms</td
								><td class="p-2">{attempt.bodyMs ?? '…'} ms</td><td class="p-2"
									>{attempt.status ?? '…'}</td
								></tr
							>
						{/each}
					{/each}
				</tbody>
			</table>
		</div>
		<details class="mt-2">
			<summary>Numeric timing details</summary>
			<pre class="mt-2 overflow-x-auto text-xs" data-testid="refresh-timing-result">{JSON.stringify(
					result,
					null,
					2
				)}</pre>
		</details>
	{/if}
</details>
