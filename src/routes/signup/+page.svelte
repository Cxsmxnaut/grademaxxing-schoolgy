<script lang="ts">
	import { brand } from '$lib/brand';
	import AuthPanelHeader from '$lib/components/auth/AuthPanelHeader.svelte';
	import { Button } from '$lib/components/ui/button';
</script>

<section
	class="rounded-[1.4rem] border border-[#203a51] bg-[#0d2335] p-6 shadow-2xl shadow-black/20 sm:p-10"
>
	<AuthPanelHeader backHref="/login" />
	<h1 class="text-3xl font-bold tracking-[-0.035em] sm:text-4xl">Sign up for {brand}</h1>
	<div class="mt-9">
		<h2 class="text-lg font-semibold">How do you sign in to StudentVUE?</h2>
		<div class="mt-5 grid gap-3">
			<Button
				href="/signup/google"
				class="h-14 rounded-xl bg-[#4db6f5] text-base font-bold text-[#06131f] hover:bg-[#68c4f8]"
				>With Google</Button
			>
			<Button
				href="/login"
				variant="outline"
				class="h-14 rounded-xl border-[#294258] bg-transparent text-base text-[#a3b8cb] hover:bg-white/5 hover:text-white"
				>With a password</Button
			>
		</div>
	</div>
	<p class="mt-7 text-base leading-7 text-[#91aac2]">
		If you have used GradeVUE or SynergyPlus before, you already have a password. Use that same
		password to <a href="/login" class="text-[#55baf3] underline underline-offset-2">log in</a>.
	</p>
</section>
