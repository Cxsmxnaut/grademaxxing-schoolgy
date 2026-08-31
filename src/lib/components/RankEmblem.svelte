<script lang="ts">
	interface Props {
		color: string;
		size?: number;
		label?: string;
	}

	const { color, size = 48, label = 'GPA rank emblem' }: Props = $props();
</script>

<span
	class="rank-emblem"
	style:--rank-color={color}
	style:width={`${size}px`}
	style:height={`${size}px`}
	role="img"
	aria-label={label}
>
	<svg viewBox="0 0 64 64" aria-hidden="true">
		<path class="wing wing-left" d="M22 15 7 23l7 9-4 10 15 11 7-9V24Z" />
		<path class="wing wing-right" d="m42 15 15 8-7 9 4 10-15 11-7-9V24Z" />
		<path class="shield" d="m32 7 17 8v15c0 12-7 21-17 27-10-6-17-15-17-27V15Z" />
		<path class="shield-line" d="m32 13 11 5v12c0 8-4 15-11 20-7-5-11-12-11-20V18Z" />
		<path class="gem" d="m32 18 9 8-9 17-9-17Z" />
		<path class="shine" d="m32 18 3 8-3 17-3-17Z" />
	</svg>
</span>

<style>
	.rank-emblem {
		display: inline-grid;
		place-items: center;
		flex: none;
		color: var(--rank-color);
		filter: drop-shadow(0 0 10px color-mix(in oklab, var(--rank-color) 40%, transparent));
	}

	svg {
		width: 100%;
		height: 100%;
		overflow: visible;
	}

	.wing {
		fill: color-mix(in oklab, var(--rank-color) 38%, transparent);
		stroke: color-mix(in oklab, var(--rank-color) 72%, white 28%);
		stroke-width: 1.5;
	}

	.shield {
		fill: color-mix(in oklab, var(--rank-color) 68%, #091522 32%);
		stroke: color-mix(in oklab, var(--rank-color) 72%, white 28%);
		stroke-width: 2;
	}

	.shield-line {
		fill: none;
		stroke: color-mix(in oklab, var(--rank-color) 46%, white 54%);
		stroke-width: 1.25;
	}

	.gem {
		fill: color-mix(in oklab, var(--rank-color) 78%, white 22%);
		stroke: color-mix(in oklab, var(--rank-color) 45%, white 55%);
		stroke-width: 1.25;
	}

	.shine {
		fill: color-mix(in oklab, var(--rank-color) 15%, white 85%);
		opacity: 0.72;
	}
</style>
