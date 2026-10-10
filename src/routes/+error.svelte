<script lang="ts">
	import { page } from '$app/state';
	import { brand } from '$lib/brand';
</script>

<svelte:head>
	<title>{page.status} {page.error?.message} - {brand}</title>
</svelte:head>

<div class="error-page">
	<main aria-labelledby="error-title" class="error-card">
		<a class="brand-link" href="/" aria-label={`${brand} home`}>
			<img src="/brand-mark-48.webp" width="24" height="24" alt="" />
			<span>{brand}</span>
		</a>
		<p class="error-status">Error {page.status}</p>
		<h1 id="error-title">This page failed to show up.</h1>
		<p class="error-message">
			{page.error?.message ?? 'An unexpected problem interrupted this page.'}
		</p>
		<a class="return-home" href="/">Return home</a>
	</main>
</div>

<style>
	.error-page {
		display: grid;
		place-items: center;
		min-height: 100svh;
		padding: 1.5rem 1rem;
		background: var(--canvas-background);
	}
	.error-card {
		width: min(100%, 25rem);
		padding: 2.25rem;
		border: 1px solid var(--border);
		border-radius: var(--corner-2xl);
		background: var(--card);
		color: var(--card-foreground);
		box-shadow: 0 8px 24px rgb(0 0 0 / 24%);
	}
	.brand-link {
		display: inline-flex;
		align-items: center;
		gap: 0.6rem;
		margin-bottom: 1.6rem;
		font-family: var(--font-heading);
		font-size: 1.18rem;
		font-weight: 600;
		color: var(--foreground);
		text-decoration: none;
	}
	.brand-link img {
		width: 24px;
		height: 24px;
		flex: none;
	}
	.error-status {
		margin-bottom: 0.5rem;
		color: var(--primary);
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}
	h1 {
		font-size: 1.4375rem;
		line-height: 1.5;
		font-weight: 600;
		letter-spacing: -0.01em;
	}
	.error-message {
		margin-top: 0.75rem;
		color: var(--muted-foreground);
		line-height: 1.65;
		overflow-wrap: anywhere;
	}
	.return-home {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 3rem;
		margin-top: 1.5rem;
		padding: 0.6rem 1rem;
		border-radius: var(--corner-sm);
		background: var(--primary);
		color: var(--primary-foreground);
		font-weight: 600;
		text-decoration: none;
	}
	.return-home:hover {
		filter: brightness(1.1);
	}
	a:focus-visible {
		outline: 2px solid var(--focus);
		outline-offset: 4px;
		border-radius: var(--corner-xs);
	}
	@media (max-width: 400px) {
		.error-card {
			padding: 1.5rem;
		}
	}
</style>
