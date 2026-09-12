<script lang="ts">
	import { brand } from '$lib/brand';
	import AuthPanelHeader from '$lib/components/auth/AuthPanelHeader.svelte';
	import { Button } from '$lib/components/ui/button';
</script>

<AuthPanelHeader />

<h1
	class="mb-[1.359375rem] text-[1.4375rem] leading-[2.15625rem] font-bold tracking-[-0.01em]"
	style="font-family: 'Space Grotesk', sans-serif"
>
	Sign up for {brand}
</h1>

<p class="mb-3 text-[0.90625rem] font-semibold text-[#e4eef8]">
	How do you want to get into StudentVUE?
</p>

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

<p class="mt-5 text-[0.875rem] leading-[1.55] text-[#8fa9c2]">
	Used {brand} before? You're already set up. Use the same StudentVUE password and get on with it to
	<a href="/login" class="font-medium text-[#4db6f5] hover:underline">log in</a>.
</p>
