<script>
	import { brand } from '$lib/brand';
	import AppPageHeader from '$lib/components/AppPageHeader.svelte';
	import AppPageShell from '$lib/components/AppPageShell.svelte';
	import MessageSquareTextIcon from '@lucide/svelte/icons/message-square-text';
</script>

<svelte:head>
	<title>Feedback - {brand}</title>
</svelte:head>

<AppPageShell>
	<AppPageHeader
		eyebrow="We read every one"
		title="Feedback"
		description="Tell us what is confusing, inaccurate, or missing."
	/>

	<section class="bg-secondary/55 max-w-2xl rounded-xl p-5 shadow-sm sm:p-6">
		<div class="flex items-start gap-4">
			<div
				class="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-full"
			>
				<MessageSquareTextIcon class="size-5" />
			</div>
			<div>
				<h2 class="font-semibold">Feedback is not connected in this local build</h2>
				<p class="text-muted-foreground mt-1 text-sm leading-6">
					The page is ready for a support channel, but it will not pretend to send a message until a
					real feedback destination is configured.
				</p>
			</div>
		</div>
	</section>
</AppPageShell>
