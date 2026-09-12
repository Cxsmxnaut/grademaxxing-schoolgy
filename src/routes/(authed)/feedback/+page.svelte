<script lang="ts">
	import { page } from '$app/state';
	import { brand, releaseVersion, supportIssueUrl } from '$lib/brand';
	import AppPageShell from '$lib/components/AppPageShell.svelte';
	import { Button } from '$lib/components/ui/button';
	let message = $state('');

	const canReport = $derived(message.trim().length >= 3);
	const reportUrl = $derived.by(() => {
		const summary = message.trim().split(/\r?\n/, 1)[0]?.slice(0, 72) || 'Tester feedback';
		const body = [
			'## What happened',
			message.trim(),
			'',
			'## Beta context',
			`- Version: ${releaseVersion}`,
			`- Page: ${page.url.pathname}`,
			'',
			'_I checked that this report contains no password, student ID, full name, or unredacted student record._'
		].join('\n');
		const query = new URLSearchParams({ title: `[Beta] ${summary}`, body });
		return `${supportIssueUrl}?${query}`;
	});
</script>

<svelte:head><title>Feedback - {brand}</title></svelte:head>

<AppPageShell class="max-w-[67.5rem]">
	<p class="text-primary text-[0.68rem] font-bold tracking-[0.2em] uppercase">We read every one</p>
	<h1
		class="font-heading mt-2 text-2xl leading-[1.5] font-bold tracking-[-0.035em] sm:text-[1.875rem] sm:leading-[1.2]"
	>
		Tell us what broke.
	</h1>
	<p class="text-muted-foreground mt-2 max-w-5xl text-sm leading-5">
		Found a bug, a wrong class name, or a grade that looks off? Describe it below and open a beta
		report on GitHub. Review the report before posting because its contents may be visible to
		others. StudentVUE remains the official record while this beta is being validated.
	</p>

	<section class="border-border/80 bg-card mt-4 overflow-hidden rounded-xl border shadow-sm">
		<header class="border-border/70 flex items-center justify-between border-b px-5 py-4">
			<h2 class="font-bold">Before you report</h2>
			<span class="text-muted-foreground text-xs">Beta safety</span>
		</header>
		<div id="feedback-safety" class="text-muted-foreground px-5 py-4 text-sm leading-6">
			Do not include your password, student ID, full name, or an unredacted screenshot of your
			school record. Include the class, report period, expected result, and what appeared instead.
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
			aria-describedby="feedback-safety"
			placeholder="What happened, and what did you expect?"
			class="border-input bg-background min-h-14 flex-1 resize-y rounded-lg border px-3 py-2 font-mono text-sm"
		></textarea>
		<Button
			href={reportUrl}
			target="_blank"
			rel="noopener noreferrer"
			disabled={!canReport}
			title={canReport ? 'Open a prefilled beta report' : 'Describe the issue first'}
			>Open report</Button
		>
	</form>
</AppPageShell>
