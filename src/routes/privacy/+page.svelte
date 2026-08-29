<script lang="ts">
	import { brand } from '$lib/brand';
	import Disclaimer from '$lib/components/Disclaimer.svelte';
	import * as Card from '$lib/components/ui/card';
</script>

<svelte:head>
	<title>Privacy - {brand}</title>
</svelte:head>

<div class="flex min-h-screen flex-col items-center">
	<main class="flex grow items-center">
		<Card.Root class="m-4 max-w-xl">
			<Card.Header>
				<Card.Title>About the privacy of {brand}</Card.Title>
			</Card.Header>

			<Card.Content class="text-tertiary-foreground space-y-4">
				<p>
					{brand} is designed to keep students' information private.
				</p>

				<p>
					When a student signs in, their browser sends the credentials over HTTPS to this {brand} server.
					The server uses them to establish a session with the official StudentVUE portal. The password
					is not written to disk, included in the browser's local storage, or retained in the app session.
				</p>

				<p>
					The server keeps only the active StudentVUE session in memory for up to 12 hours and
					proxies read-only student information to the browser. Signing out deletes that session.
					Grade data used by the interface may also be cached on the student's device and can be
					cleared from Student Info.
				</p>
			</Card.Content>
		</Card.Root>
	</main>

	<Disclaimer trademark={false} />
</div>
