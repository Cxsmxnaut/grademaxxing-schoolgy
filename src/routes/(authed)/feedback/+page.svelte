<script>
	import { brand } from '$lib/brand';
	import AppPageHeader from '$lib/components/AppPageHeader.svelte';
	import AppPageShell from '$lib/components/AppPageShell.svelte';
	import BugIcon from '@lucide/svelte/icons/bug';
	import LightbulbIcon from '@lucide/svelte/icons/lightbulb';
	import MessageSquareTextIcon from '@lucide/svelte/icons/message-square-text';
	import ShieldAlertIcon from '@lucide/svelte/icons/shield-alert';
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

	<section class="bg-card mt-5 max-w-3xl overflow-hidden rounded-xl shadow-sm">
		<div class="border-border/70 border-b px-5 py-5 sm:px-6">
			<div class="flex items-start gap-4">
				<div
					class="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-full"
				>
					<MessageSquareTextIcon class="size-5" />
				</div>
				<div>
					<h2 class="font-semibold">Help shape Grademaxxing</h2>
					<p class="text-muted-foreground mt-1 text-sm leading-6">
						The support channel is not connected in this local build yet. Nothing entered here will
						be pretended to be sent.
					</p>
				</div>
			</div>
		</div>

		<div class="grid sm:grid-cols-3">
			<div class="border-border/70 p-5 sm:border-r">
				<BugIcon class="text-destructive size-5" />
				<h3 class="mt-3 font-semibold">Report a problem</h3>
				<p class="text-muted-foreground mt-1 text-sm leading-5">
					Something looks wrong or will not load.
				</p>
			</div>
			<div class="border-border/70 border-t p-5 sm:border-t-0 sm:border-r">
				<LightbulbIcon class="text-warning size-5" />
				<h3 class="mt-3 font-semibold">Suggest an idea</h3>
				<p class="text-muted-foreground mt-1 text-sm leading-5">
					A change could make schoolwork clearer.
				</p>
			</div>
			<div class="border-border/70 border-t p-5 sm:border-t-0">
				<ShieldAlertIcon class="text-primary size-5" />
				<h3 class="mt-3 font-semibold">Flag inaccurate data</h3>
				<p class="text-muted-foreground mt-1 text-sm leading-5">
					A grade or record differs from StudentVUE.
				</p>
			</div>
		</div>
	</section>
</AppPageShell>
