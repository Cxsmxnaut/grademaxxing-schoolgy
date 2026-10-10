<script lang="ts">
	import PageMeta from '$lib/components/seo/PageMeta.svelte';
	import PublicArticle from '$lib/components/public/PublicArticle.svelte';
	import PageSection from '$lib/components/public/PageSection.svelte';
</script>

<PageMeta path="/about" />
<PublicArticle
	eyebrow="About Grademaxxing"
	title="Make sense of your grades before your next assignment."
	intro="Grademaxxing is an independent, read-only companion for StudentVUE. It brings course records and planning tools together while keeping official marks separate from calculations."
	related={[
		{
			href: '/demo',
			label: 'Explore the fictional demo',
			detail: 'Try assignment planning without an account.'
		},
		{ href: '/studentvue-compatibility', label: 'Check connection requirements' },
		{ href: '/privacy', label: 'Read the data-handling details' }
	]}
>
	<PageSection heading="What the app does">
		<p>
			When a supported StudentVUE portal is connected, Grademaxxing reads course grades and
			assignment details. You can inspect the gradebook, model a future assignment, replace a score
			in a scenario, and estimate what you would need to reach a target. The connected app also
			presents StudentVUE records such as attendance, schedules, calendar events, documents and
			messages where available.
		</p>
		<p>
			<strong>A scenario changes only the calculation you see.</strong> Grademaxxing does not submit grades,
			turn in work, send messages or change school records. The mark published in StudentVUE remains the
			official mark.
		</p>
		<p>
			The <a href="/calculators">public calculators</a> work without signing in. They use numbers
			you enter manually. The <a href="/demo">demo</a> uses fictional records; it never loads a student's
			account.
		</p>
	</PageSection>
	<PageSection heading="How a StudentVUE connection works">
		<p>
			Your browser sends a district portal URL, username and password over HTTPS to the Grademaxxing
			server. The server signs in to the district portal and discards the password after that
			attempt. The resulting portal session is encrypted inside an HTTP-only application cookie.
			This is a server-assisted connection.
		</p>
		<p>
			If you choose “Keep me signed in,” credentials are saved as encrypted data on your device with
			a non-exportable browser encryption key. Grade details may also be cached locally to make the
			app faster. Signing out clears the app session, saved credentials and local caches. Read the <a
				href="/privacy">privacy page</a
			> before connecting, especially on a shared device.
		</p>
	</PageSection>
	<PageSection heading="What a calculation can establish">
		<p>
			A points-based calculation can reproduce a course grade only when the relevant points and
			inclusion rules are known. Category weights, dropped scores, rounding, special assignment
			scales and teacher-managed rules can affect the result. If a local calculation disagrees with
			StudentVUE, use the official StudentVUE mark and treat the projection as an estimate.
		</p>
		<p>
			GPA in the connected app currently uses a <strong>provisional policy</strong>. It is planning
			information, not a transcript GPA or a verified district calculation. The public
			<a href="/calculators/gpa">GPA calculator</a> lets you enter grade points and credits explicitly.
		</p>
	</PageSection>
	<PageSection heading="Independent software, with source attribution">
		<p>
			Grademaxxing is not affiliated with or endorsed by Edupoint, the maker of StudentVUE, or any
			school district. A portal accepting a connection does not establish school approval or
			guarantee support for every configuration.
		</p>
		<p>
			The application derives from GradeCompass and preserves its AGPL-3.0 license and attribution.
			Calculation explanations and fictional public examples describe Grademaxxing's own current
			behavior. The <a href="/methodology/grade-calculations">methodology</a> explains the models and
			their limits.
		</p>
	</PageSection>
</PublicArticle>
