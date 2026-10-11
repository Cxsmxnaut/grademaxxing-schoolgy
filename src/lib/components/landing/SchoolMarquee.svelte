<script lang="ts">
	import { landingSchools } from '$lib/data/landing-schools';
	import { onMount } from 'svelte';
	import Marquee from 'svelte-fast-marquee';

	let reducedMotion = $state(true);

	onMount(() => {
		const preference = matchMedia('(prefers-reduced-motion: reduce)');
		const update = () => (reducedMotion = preference.matches);
		update();
		preference.addEventListener('change', update);
		return () => preference.removeEventListener('change', update);
	});
</script>

<section class="landing-schools" aria-label="Schools">
	<ol class="sr-only">
		{#each landingSchools as school (school.logo)}
			<li>{school.name}, {school.city}</li>
		{/each}
	</ol>
	<div
		class:landing-schools-static={reducedMotion}
		class="landing-schools-track"
		aria-hidden="true"
	>
		{#snippet logos()}
			{#each landingSchools as school (school.logo)}
				<div class="landing-school">
					<img src="/landing/schools/{school.logo}" alt="" width="240" height="80" />
				</div>
			{/each}
		{/snippet}
		{#if reducedMotion}
			{@render logos()}
		{:else}
			<Marquee speed={32} pauseOnHover autoFill gap="3rem">
				{@render logos()}
			</Marquee>
		{/if}
	</div>
</section>

<style>
	.landing-schools {
		padding: 44px 0 24px;
	}
	.landing-schools-track {
		mask-image: linear-gradient(to right, transparent, black 6%, black 94%, transparent);
	}
	.landing-school {
		display: flex;
		flex: 0 0 240px;
		align-items: center;
		width: 240px;
		justify-content: center;
	}
	.landing-school img {
		width: 100%;
		height: 80px;
		object-fit: contain;
	}
	.landing-schools-static {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 32px;
		padding: 0 24px;
		mask-image: none;
	}
	@media (max-width: 480px) {
		.landing-school {
			flex-basis: 220px;
			width: 220px;
		}
	}
</style>
