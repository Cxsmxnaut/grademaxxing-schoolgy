<script lang="ts">
	import PageMeta from '$lib/components/seo/PageMeta.svelte';
	import PublicArticle from '$lib/components/public/PublicArticle.svelte';
	import PageSection from '$lib/components/public/PageSection.svelte';
</script>

<PageMeta path="/studentvue-compatibility" />
<PublicArticle
	eyebrow="Connection requirements"
	title="StudentVUE compatibility depends on the portal."
	intro="Grademaxxing connects through a StudentVUE web portal. District configuration, sign-in requirements and grading rules can differ, so one successful connection does not prove compatibility everywhere."
	related={[
		{ href: '/demo', label: 'Use the demo without connecting' },
		{ href: '/calculators', label: 'Calculate manually without an account' },
		{ href: '/privacy', label: 'Review sign-in and storage details' }
	]}
>
	<PageSection heading="What the current connection expects">
		<p>
			The current adapter uses the PXP2 StudentVUE web portal and a district URL, username and
			StudentVUE password. It signs in through the server and reads available records. It is not a
			generic integration for every student-information system or a district-approved single sign-on
			service.
		</p>
		<p>
			Your credentials pass over HTTPS through the Grademaxxing server for the sign-in attempt. The
			server discards the password afterward; the portal session is stored in an encrypted HTTP-only
			app cookie. Optional persistent credentials are encrypted on your device. The <a
				href="/privacy">privacy page</a
			> explains the full data flow.
		</p>
	</PageSection>
	<PageSection heading="Compatibility register">
		<p>
			This is a statement of support scope, not a list of district endorsements. No independently
			verified district-by-district coverage is published here.
		</p>
		<div class="table-scroll">
			<table>
				<caption>Current evidence and limits</caption>
				<thead
					><tr
						><th scope="col">Configuration</th><th scope="col">Status</th><th scope="col"
							>What to check</th
						></tr
					></thead
				>
				<tbody>
					<tr
						><th scope="row">PXP2 portal with username/password</th><td
							>Implemented connection path; individual district not verified here</td
						><td>Correct official portal URL, accessible account and compatible portal response.</td
						></tr
					>
					<tr
						><th scope="row">Google-only or district SSO-only access</th><td
							>Direct Grademaxxing SSO handoff unavailable</td
						><td
							>A separate StudentVUE password may be required. Use official district help if one is
							unavailable.</td
						></tr
					>
					<tr
						><th scope="row">Other authentication requirements</th><td>Not verified</td><td
							>MFA, CAPTCHA, custom gateways and district restrictions may prevent the current
							sign-in flow.</td
						></tr
					>
					<tr
						><th scope="row">Other SIS products or legacy-only portals</th><td
							>Not supported by the current PXP2 adapter</td
						><td>Use public manual calculators instead.</td></tr
					>
					<tr
						><th scope="row">Local grade/GPA policy</th><td
							>Depends on available rules; GPA policy provisional</td
						><td
							>Check baseline agreement, assignment scales, grading rules and the official
							transcript policy.</td
						></tr
					>
				</tbody>
			</table>
		</div>
	</PageSection>
	<PageSection heading="If you normally sign in with Google">
		<p>
			Signing in with Google on the official district portal creates a session for that portal. It
			does not create a Grademaxxing session. Grademaxxing cannot read the district's HTTP-only
			cookies from your browser or reuse a Google assertion as permission to retrieve your school
			records.
		</p>
		<p>
			If your account has a separate StudentVUE password, use it with the official portal address.
			If it does not, follow the district's account-help or password flow. Grademaxxing cannot
			bypass a required current password, reset permission or district restriction. Edupoint's <a
				href="https://www.edupoint.com/Services/Support/For-Parents-Students"
				>parent and student support page</a
			> directs account questions to the school or district.
		</p>
	</PageSection>
	<PageSection heading="A connected portal can still produce an incomplete estimate">
		<p>
			Authentication and calculation fidelity are separate questions. A portal may provide a
			course's official mark while omitting a usable weighted scale for an assignment or exposing
			rules a local model cannot reproduce. The official mark remains authoritative. An estimate is
			useful for planning only within its stated assumptions.
		</p>
		<p>
			Check the <a href="/guides/grade-mismatches">grade mismatch guide</a> before interpreting a discrepancy
			as an error in StudentVUE. Compatibility does not imply district approval, complete record coverage
			or guaranteed future access.
		</p>
	</PageSection>
</PublicArticle>
