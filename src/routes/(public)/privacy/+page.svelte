<script lang="ts">
	import { brand } from '$lib/brand';
	import PageMeta from '$lib/components/seo/PageMeta.svelte';
</script>

<PageMeta path="/privacy" />

<article class="privacy-page">
	<h1>
		How {brand} handles your information
	</h1>
	<p class="privacy-intro">
		{brand} keeps the convenience of a persistent sign-in without retaining your StudentVUE password on
		our servers.
	</p>

	<div class="privacy-sections">
		<section>
			<h2>Public calculators and demos</h2>
			<p>
				The public calculators run in your browser without a StudentVUE account. Their inputs are
				not sent to our analytics endpoint or added to the page URL. The demo uses fictional sample
				records. Public-use measurement counts only a known page, an action such as using a tool,
				and a broad referral category. It uses no analytics cookie or persistent visitor identifier,
				and does not collect your entered grades, credentials, full referrer URL, or school records.
				It respects browser Do Not Track and Global Privacy Control signals.
			</p>
		</section>
		<section>
			<h2>Signing in</h2>
			<p>
				Your browser sends your credentials over HTTPS to this {brand} server. The server uses them to
				establish a session with the official StudentVUE portal, then discards the password. It is never
				written to our disk, logs, or server session.
			</p>
		</section>

		<section>
			<h2>While you are signed in</h2>
			<p>
				The active StudentVUE session state is encrypted and authenticated inside a secure,
				HTTP-only app cookie. Its default 12-hour lifetime can be renewed by a successful keep-alive
				request; the district portal can expire its session sooner. The server uses it only to proxy
				read-only student information, and browser scripts cannot read it.
			</p>
		</section>

		<section>
			<h2>Local data and signing out</h2>
			<p>
				If you choose “Keep me signed in,” your district, username, and password are encrypted on
				this device. The encryption key is held in IndexedDB as a non-exportable browser key, while
				only ciphertext is stored in browser storage. Grade data used by the interface may also be
				cached on your device. Signing out clears the app cookie, saved credentials, and local
				caches on this device.
			</p>
		</section>

		<section>
			<h2>Invite-only referrals</h2>
			<p>
				Invited referrers are created privately by the administrator using their name and email.
				Visitors opening a referral link go directly to the standard StudentVUE sign-in and are
				counted only if Grademaxxing's one-way protected student key shows they are a new user. We
				do not store the referred student's name or email for referrals. Referral attribution stays
				separate from StudentVUE credentials, grades, and school records.
			</p>
		</section>
	</div>
</article>

<style>
	.privacy-page {
		max-width: 48rem;
		margin: 0 auto;
		padding: 2rem 0;
	}
	h1 {
		font-size: clamp(2rem, 5vw, 3rem);
		line-height: 1.15;
		margin-bottom: 1.25rem;
	}
	.privacy-intro {
		color: var(--muted-foreground);
		font-size: 1.1rem;
		line-height: 1.7;
		margin-bottom: 2.5rem;
	}
	.privacy-sections {
		display: grid;
		gap: 2rem;
	}
	h2 {
		font-size: 1.3rem;
		margin-bottom: 0.75rem;
	}
	section p {
		color: var(--muted-foreground);
		line-height: 1.8;
	}
</style>
