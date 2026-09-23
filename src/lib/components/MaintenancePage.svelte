<script lang="ts">
	import Clock3Icon from '@lucide/svelte/icons/clock-3';
	import ConstructionIcon from '@lucide/svelte/icons/construction';
	import { brand } from '$lib/brand';
</script>

<svelte:head>
	<title>We’re rebuilding {brand}</title>
	<meta
		name="description"
		content="Grademaxxing is currently being rebuilt. Please check back in a few days."
	/>
</svelte:head>

<main class="maintenance-root" aria-labelledby="maintenance-title">
	<div class="maintenance-card">
		<div class="maintenance-brand" aria-label={brand}>
			<img src="/grademaxxing-logo.png" width="40" height="40" alt="" />
			<span>Grade<span class="maintenance-accent">maxxing</span> <small>(Beta)</small></span>
		</div>

		<div class="maintenance-icon" aria-hidden="true">
			<ConstructionIcon size={28} strokeWidth={1.7} />
		</div>

		<p class="maintenance-eyebrow">Temporarily offline</p>
		<h1 id="maintenance-title">We’re rebuilding the app.</h1>
		<p class="maintenance-copy">
			We’re currently rebuilding {brand}. Please wait a few days while we finish the work.
		</p>

		<div class="maintenance-note">
			<Clock3Icon size={18} aria-hidden="true" />
			<span>Please check back soon. We’ll be ready for you.</span>
		</div>
	</div>

	<p class="maintenance-footer">Thanks for your patience.</p>
</main>

<style>
	.maintenance-root {
		min-height: 100svh;
		display: grid;
		place-items: center;
		padding: 2rem 1.25rem;
		background:
			radial-gradient(
				circle at 50% 0%,
				color-mix(in srgb, var(--primary) 13%, transparent),
				transparent 34rem
			),
			var(--background);
		color: var(--foreground);
		font-family: 'Instrument Sans', sans-serif;
	}

	.maintenance-card {
		width: min(100%, 34rem);
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: clamp(2rem, 7vw, 4.25rem) clamp(1.5rem, 7vw, 4rem);
		border: 1px solid var(--border);
		border-radius: 1.5rem;
		background: color-mix(in srgb, var(--card) 92%, transparent);
		box-shadow: 0 1.5rem 4rem color-mix(in srgb, var(--foreground) 9%, transparent);
		text-align: center;
	}

	.maintenance-brand {
		display: inline-flex;
		align-items: center;
		gap: 0.7rem;
		margin-bottom: 3.5rem;
		font-family: 'Space Grotesk', sans-serif;
		font-size: 1.05rem;
		font-weight: 700;
		letter-spacing: -0.02em;
	}

	.maintenance-brand img {
		border-radius: 0.65rem;
	}

	.maintenance-brand small {
		color: var(--muted-foreground);
		font-family: 'IBM Plex Mono', monospace;
		font-size: 0.58em;
		font-weight: 600;
		letter-spacing: 0.03em;
	}

	.maintenance-accent {
		color: var(--primary);
	}

	.maintenance-icon {
		display: grid;
		place-items: center;
		width: 4.25rem;
		height: 4.25rem;
		margin-bottom: 1.5rem;
		border: 1px solid color-mix(in srgb, var(--primary) 25%, var(--border));
		border-radius: 1.25rem;
		background: var(--accent);
		color: var(--primary);
	}

	.maintenance-eyebrow {
		margin: 0 0 0.8rem;
		color: var(--primary);
		font-family: 'IBM Plex Mono', monospace;
		font-size: 0.7rem;
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	h1 {
		margin: 0;
		font-family: 'Space Grotesk', sans-serif;
		font-size: clamp(2rem, 7vw, 3rem);
		line-height: 1.05;
		letter-spacing: -0.05em;
	}

	.maintenance-copy {
		max-width: 27rem;
		margin: 1.25rem 0 0;
		color: var(--muted-foreground);
		font-size: 1rem;
		line-height: 1.65;
	}

	.maintenance-note {
		display: inline-flex;
		align-items: center;
		gap: 0.55rem;
		margin-top: 2rem;
		padding: 0.7rem 0.9rem;
		border-radius: 0.75rem;
		background: var(--secondary);
		color: var(--secondary-foreground);
		font-size: 0.82rem;
		line-height: 1.4;
		text-align: left;
	}

	.maintenance-note :global(svg) {
		flex: 0 0 auto;
		color: var(--primary);
	}

	.maintenance-footer {
		margin: 1.25rem 0 0;
		color: var(--muted-foreground);
		font-size: 0.78rem;
	}
</style>
