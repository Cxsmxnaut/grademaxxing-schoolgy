<script lang="ts">
	import { brand } from '$lib/brand';
	import AppPageShell from '$lib/components/AppPageShell.svelte';
	import { Button } from '$lib/components/ui/button';
	let message = $state('');
</script>

<svelte:head><title>Feedback - {brand}</title></svelte:head>

<AppPageShell class="max-w-[67.5rem]">
	<p class="text-primary text-[0.68rem] font-bold tracking-[0.2em] uppercase">We read every one</p>
	<h1 class="font-heading mt-2 text-2xl font-bold tracking-[-0.035em] sm:text-[1.875rem]">
		Chat with the team
	</h1>
	<p class="text-muted-foreground mt-2 max-w-5xl text-sm leading-5">
		Found a bug, a wrong class name, or a grade that looks off? Tell us here and keep notes in this
		thread. This local preview has no support server connected, so messages stay on this device and
		are never sent. <span class="sm:hidden">Nothing leaves this device.</span>
	</p>

	<section class="border-border/80 bg-card mt-4 overflow-hidden rounded-xl border shadow-sm">
		<header class="border-border/70 flex items-center justify-between border-b px-5 py-4">
			<h2 class="font-bold">Your thread</h2>
			<span class="text-muted-foreground text-xs">Local preview</span>
		</header>
		<div
			class="border-border/80 text-muted-foreground m-4 flex min-h-28 items-center justify-center rounded-xl border border-dashed px-5 text-center"
		>
			Nothing yet. Say hi, or tell us what broke.
		</div>
	</section>

	<form
		class="border-border/80 bg-card mt-4 flex items-end gap-3 rounded-xl border p-4 shadow-sm"
		onsubmit={(event) => event.preventDefault()}
	>
		<label for="feedback-message" class="sr-only">Feedback message</label>
		<textarea
			id="feedback-message"
			bind:value={message}
			placeholder="What's up?"
			class="border-input bg-background min-h-14 flex-1 resize-y rounded-lg border px-3 py-2 font-mono text-sm"
		></textarea>
		<Button type="submit" disabled title="Support is not connected in this local build">Send</Button
		>
	</form>
</AppPageShell>
