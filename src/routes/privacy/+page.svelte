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
		<h1
			class="mb-4 text-3xl font-bold tracking-[-0.03em]"
			style="font-family: 'Space Grotesk', sans-serif"
		>
			How {brand} handles your information
		</h1>
		<p class="mb-10 max-w-2xl text-base leading-7 text-[#8fa9c2]">
			{brand} keeps the convenience of a persistent sign-in without putting your StudentVUE password on
			our servers.
		</p>

		<div class="space-y-9 text-[0.9375rem] leading-7 text-[#8fa9c2]">
			<section>
				<h2 class="mb-2 text-lg font-semibold text-[#e4eef8]">Signing in</h2>
				<p>
					Your browser sends your credentials over HTTPS to this {brand} server. The server uses them
					to establish a session with the official StudentVUE portal, then discards the password. It is
					never written to our disk, logs, or server session.
				</p>
			</section>

			<section>
				<h2 class="mb-2 text-lg font-semibold text-[#e4eef8]">While you are signed in</h2>
				<p>
					The active StudentVUE session state is encrypted and authenticated inside a secure,
					HTTP-only app cookie for up to 12 hours. The server uses it only to proxy read-only
					student information, and browser scripts cannot read it.
				</p>
			</section>

			<section>
				<h2 class="mb-2 text-lg font-semibold text-[#e4eef8]">Local data and signing out</h2>
				<p>
					If you choose “Keep me signed in,” your district, username, and password are encrypted on
					this device. The encryption key is held in IndexedDB as a non-exportable browser key,
					while only ciphertext is stored in browser storage. Grade data used by the interface may
					also be cached on your device. Signing out deletes the active server session, saved
					credentials, and local caches.
				</p>
			</section>

			<section>
				<h2 class="mb-2 text-lg font-semibold text-[#e4eef8]">Invite-only referrals</h2>
				<p>
					Invited referrers are created privately by the administrator using their name and email.
					Visitors opening a referral link go directly to the standard StudentVUE sign-in and are
					counted only if Grademaxxing's one-way protected student key shows they are a new user. We
					do not store the referred student's name or email for referrals. Referral attribution
					stays separate from StudentVUE credentials, grades, and school records.
				</p>
			</section>
		</div>
	</article>
</AuthShell>
