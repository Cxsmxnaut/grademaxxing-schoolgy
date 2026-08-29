<script lang="ts">
	import { brand } from '$lib/brand';
	import AuthPanelHeader from '$lib/components/auth/AuthPanelHeader.svelte';
	import { Button } from '$lib/components/ui/button';
	const passwordHelp = 'https://ca-pleas-psv.edupoint.com/PXP2_Password_Help.aspx';
</script>

<section
	class="rounded-[1.4rem] border border-[#203a51] bg-[#0d2335] p-6 shadow-2xl shadow-black/20 sm:p-10"
>
	<AuthPanelHeader backHref="/signup" />
	<h1 class="text-3xl font-bold tracking-[-0.035em] sm:text-4xl">Sign up for {brand}</h1>
	<div class="mt-8 space-y-6 text-base leading-7 text-[#91aac2]">
		<p>
			{brand} cannot use Sign in with Google to connect directly. Create a StudentVUE password that {brand}
			can use instead. Google sign-in will still work normally inside StudentVUE.
		</p>
		<Button
			href={passwordHelp}
			target="_blank"
			rel="noopener noreferrer"
			class="h-14 w-full rounded-xl bg-[#4db6f5] text-base font-bold text-[#06131f] hover:bg-[#68c4f8]"
			>Set your StudentVUE password</Button
		>
		<p>
			Already used GradeVUE or SynergyPlus? You can use that same password to <a
				href="/login"
				class="text-[#55baf3] underline underline-offset-2">log in to {brand}</a
			>.
		</p>
		<p>
			StudentVUE should email you a password setup link. It may take a few minutes. Once the
			password is ready, <a href="/login" class="text-[#55baf3] underline underline-offset-2"
				>log in</a
			>.
		</p>
	</div>
</section>
