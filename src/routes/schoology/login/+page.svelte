<script lang="ts">
	import { page } from '$app/state';
	import { matchesSchoologyDistrict, type SchoologyDistrictChoice } from '$lib/schoology/districts';

	let { data } = $props<{ data: { districts: SchoologyDistrictChoice[] } }>();
	let districtId = $state('');
	let query = $state('');
	let busy = $state(false);
	let failure = $state('');
	const districts = $derived(
		data.districts.filter((district: SchoologyDistrictChoice) =>
			matchesSchoologyDistrict(district, query)
		)
	);
	const selectedDistrict = $derived(
		data.districts.find((district: SchoologyDistrictChoice) => district.id === districtId)
	);

	function searchDistricts() {
		districtId = '';
		failure = '';
	}

	const errorCopy = $derived(
		page.url.searchParams.get('error') === 'expired'
			? 'The sign-in request expired. Start again.'
			: page.url.searchParams.get('error') === 'callback'
				? 'Schoology could not complete authorization. Check district app approval and try again.'
				: ''
	);

	async function connect(event: SubmitEvent) {
		event.preventDefault();
		if (!selectedDistrict?.canConnect || busy) return;
		busy = true;
		failure = '';
		try {
			const response = await fetch('/api/schoology/auth/start', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ districtId })
			});
			const result = await response.json();
			if (!response.ok) throw new Error(result.message ?? 'Could not begin Schoology sign-in.');
			window.location.assign(result.authorizationUrl);
		} catch (cause) {
			failure = cause instanceof Error ? cause.message : 'Could not begin Schoology sign-in.';
			busy = false;
		}
	}

	async function openDemo() {
		if (busy) return;
		busy = true;
		failure = '';
		try {
			const response = await fetch('/api/schoology/demo', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: '{}'
			});
			if (!response.ok) throw new Error('The fictional demo could not start.');
			window.location.assign('/schoology');
		} catch (cause) {
			failure = cause instanceof Error ? cause.message : 'The fictional demo could not start.';
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>Schoology edition · Grademaxxing</title>
	<meta name="description" content="Explore grades with the Grademaxxing Schoology edition." />
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<main class="bg-background text-foreground min-h-svh px-4 py-10 sm:px-6">
	<div class="mx-auto flex min-h-[calc(100svh-5rem)] max-w-5xl items-center justify-center">
		<section
			class="border-border/70 bg-card/70 w-full max-w-xl rounded-2xl border p-6 shadow-xl sm:p-9"
		>
			<a href="/" class="text-muted-foreground hover:text-foreground text-sm">← Grademaxxing</a>
			<p class="text-primary mt-8 font-mono text-xs tracking-[0.18em] uppercase">
				Schoology edition
			</p>
			<h1 class="font-heading mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
				Connect your school
			</h1>
			<p class="text-muted-foreground mt-3 leading-7">
				Find your district by name or Schoology address. When grade access is available, connect
				through its official Schoology authorization page.
			</p>

			{#if errorCopy || failure}
				<p
					role="alert"
					class="border-destructive/40 bg-destructive/10 mt-5 rounded-lg border px-4 py-3 text-sm"
				>
					{failure || errorCopy}
				</p>
			{/if}

			<form class="mt-7 space-y-4" onsubmit={connect}>
				<label class="block text-sm font-medium" for="district-search">Schoology district</label>
				<input
					id="district-search"
					type="search"
					bind:value={query}
					oninput={searchDistricts}
					disabled={busy}
					placeholder="Search district, state, or domain"
					autocomplete="off"
					aria-describedby="district-count"
					class="border-input bg-background focus-visible:ring-ring h-12 w-full rounded-md border px-3 text-sm outline-none focus-visible:ring-2"
				/>
				<p id="district-count" role="status" class="text-muted-foreground text-xs">
					{districts.length}
					{districts.length === 1 ? 'district' : 'districts'} found
				</p>
				<fieldset class="border-border max-h-60 overflow-y-auto rounded-md border">
					<legend class="sr-only">Choose your district</legend>
					{#each districts as district (district.id)}
						<label
							class="border-border hover:bg-muted has-checked:bg-muted flex cursor-pointer items-center gap-3 border-b px-3 py-3 last:border-b-0"
						>
							<input
								type="radio"
								name="schoology-district"
								value={district.id}
								bind:group={districtId}
								disabled={busy}
								class="accent-primary h-4 w-4 shrink-0"
							/>
							<span class="min-w-0 flex-1">
								<span class="block text-sm font-medium">{district.name}</span>
								<span class="text-muted-foreground mt-1 block text-xs break-all"
									>{district.region ? `${district.region} · ` : ''}{new URL(district.schoolUrl)
										.hostname}</span
								>
								{#if district.canConnect}<span class="text-primary mt-1 block text-xs"
										>Grade connection available</span
									>{/if}
							</span>
						</label>
					{:else}
						<p class="text-muted-foreground px-4 py-5 text-sm">
							No matching districts. Try a shorter name or the Schoology domain.
						</p>
					{/each}
				</fieldset>
				{#if selectedDistrict}
					<div class="bg-muted/50 rounded-md px-4 py-3 text-sm" aria-live="polite">
						<p class="font-medium">{selectedDistrict.name}</p>
						{#if selectedDistrict.canConnect}
							<p class="text-muted-foreground mt-1">
								You'll enter your password only on your district's official sign-in page.
							</p>
						{:else}
							<p class="text-muted-foreground mt-1">
								Grade connection is not enabled for this district yet. You can still visit its
								official Schoology site.
							</p>
						{/if}
						<a
							href={selectedDistrict.schoolUrl}
							target="_blank"
							rel="noopener noreferrer"
							class="text-primary mt-2 inline-block underline underline-offset-4"
							>Open district Schoology ↗</a
						>
					</div>
				{/if}
				<button
					type="submit"
					disabled={!selectedDistrict?.canConnect || busy}
					class="bg-primary text-primary-foreground h-12 w-full rounded-md px-4 font-semibold transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
				>
					{busy ? 'Opening Schoology…' : 'Continue to Schoology'}
				</button>
				<p class="text-muted-foreground text-xs leading-5">
					Can't find your district? <a
						href="https://app.schoology.com/login"
						target="_blank"
						rel="noopener noreferrer"
						class="text-primary underline underline-offset-4">Use Schoology's school finder ↗</a
					>
				</p>
			</form>

			<div class="text-muted-foreground my-7 flex items-center gap-3 text-xs">
				<span class="bg-border h-px flex-1"></span><span>OR</span><span
					class="bg-border h-px flex-1"
				></span>
			</div>
			<button
				type="button"
				onclick={openDemo}
				disabled={busy}
				class="border-border bg-background hover:bg-muted h-12 w-full rounded-md border px-4 font-medium transition disabled:opacity-50"
			>
				Open fictional-data demo
			</button>
			<p class="text-muted-foreground mt-3 text-center text-xs leading-5">
				Demo records are invented. The demo makes no Schoology network requests and needs no account
				or secrets.
			</p>

			<div class="border-border text-muted-foreground mt-8 border-t pt-5 text-xs leading-5">
				<p>
					Schoology API access and app approval vary by district and account role. Approval does not
					grant permissions the account does not already have.
				</p>
				<p class="mt-2">
					Grademaxxing is an independent read-only project and is not affiliated with or endorsed by
					Schoology or PowerSchool.
				</p>
			</div>
		</section>
	</div>
</main>
