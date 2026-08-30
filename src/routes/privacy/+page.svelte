<script lang="ts">
	import { brand } from '$lib/brand';
	import AuthPanelHeader from '$lib/components/auth/AuthPanelHeader.svelte';
	import AuthShell from '$lib/components/auth/AuthShell.svelte';
</script>

<svelte:head>
	<title>Privacy - {brand}</title>
</svelte:head>

<AuthShell promo={false}>
	<article class="w-full max-w-[46rem] py-2 text-[#e4eef8] sm:py-8">
		<AuthPanelHeader />
		<p class="mb-2 text-xs font-bold tracking-[0.14em] text-[#4db6f5] uppercase">Privacy</p>
		<h1 class="mb-4 text-3xl font-bold tracking-[-0.03em] sm:text-4xl">
			How {brand} handles your information
		</h1>
		<p class="mb-10 max-w-2xl text-base leading-7 text-[#8fa9c2]">
			{brand} is designed to show private school records without retaining your StudentVUE password.
		</p>

		<div class="space-y-9 text-[0.9375rem] leading-7 text-[#8fa9c2]">
			<section>
				<h2 class="mb-2 text-lg font-semibold text-[#e4eef8]">Signing in</h2>
				<p>
					Your browser sends your credentials over HTTPS to this {brand} server. The server uses them
					to establish a session with the official StudentVUE portal. Your password is not written to
					disk, added to browser storage, or retained in the app session.
				</p>
			</section>

			<section>
				<h2 class="mb-2 text-lg font-semibold text-[#e4eef8]">While you are signed in</h2>
				<p>
					The server keeps only the active StudentVUE session in memory for up to 12 hours and
					proxies read-only student information to your browser.
				</p>
			</section>

			<section>
				<h2 class="mb-2 text-lg font-semibold text-[#e4eef8]">Local data and signing out</h2>
				<p>
					Grade data used by the interface may be cached on your device and can be cleared from
					Student Info. Signing out deletes the active server session.
				</p>
			</section>
		</div>
	</article>
</AuthShell>
