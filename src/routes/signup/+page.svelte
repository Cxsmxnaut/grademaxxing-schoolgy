<script lang="ts">
	import { brand } from '$lib/brand';
	import AuthPanelHeader from '$lib/components/auth/AuthPanelHeader.svelte';
	import { Button } from '$lib/components/ui/button';
</script>

<AuthPanelHeader />

<h1 class="mb-7 text-[1.75rem] leading-tight font-bold tracking-[-0.025em]">
	Sign up for {brand}
</h1>

<p class="mb-4 text-sm font-semibold text-[#e4eef8]">How do you sign in to StudentVUE?</p>

<div class="space-y-3">
	<Button
		href="/signup/google"
		size="lg"
		class="h-12 w-full rounded-lg bg-[#4db6f5] font-semibold text-[#081522] hover:bg-[#6fc4f7]"
	>
		With Google
	</Button>
	<Button
		href="/login"
		variant="outline"
		size="lg"
		class="h-12 w-full rounded-lg border-[rgba(228,238,248,0.16)] bg-transparent font-semibold text-[#8fa9c2] hover:border-[#4db6f5] hover:bg-transparent hover:text-[#e4eef8]"
	>
		With a password
	</Button>
</div>

<p class="mt-7 text-sm leading-6 text-[#8fa9c2]">
	If you have used {brand} before, you are already set up. Just use the same StudentVUE password to
	<a href="/login" class="font-medium text-[#4db6f5] hover:underline">log in</a>.
</p>
