<script lang="ts">
	interface Props {
		color: string;
		rankName?: string;
		size?: number;
		label?: string;
	}

	const { color, rankName, size = 48, label = 'GPA rank emblem' }: Props = $props();

	function getRankEmblemSource(name: string | undefined) {
		if (!name) return undefined;
		if (name.startsWith('Bronze')) return '/ranks/bronze.png';
		if (name.startsWith('Silver')) return '/ranks/silver.png';
		if (name.startsWith('Gold')) return '/ranks/gold.png';
		if (name.startsWith('Platinum')) return '/ranks/platinum.png';
		if (name.startsWith('Diamond')) return '/ranks/diamond.png';
		if (name === 'Elite') return '/ranks/elite.png';
		if (name === 'Champion') return '/ranks/champion.png';
		if (name === 'Unreal') return '/ranks/unreal.png';
		return undefined;
	}

	const emblemSource = $derived(getRankEmblemSource(rankName));
</script>

<span
	class="rank-emblem"
	style:--rank-color={color}
	style:width={`${size}px`}
	style:height={`${size}px`}
	role="img"
	aria-label={label}
>
	{#if emblemSource}
		<img src={emblemSource} alt="" />
	{:else}
		<svg viewBox="0 0 64 64" aria-hidden="true">
		<path
			class="aura"
			d="M32 3 39 9 48 8 51 17 59 21 56 31 61 39 52 45 50 55 40 54 32 61 24 54 14 55 12 45 3 39 8 31 5 21 13 17 16 8 25 9Z"
		/>

		<g class="wing wing-left">
			<path class="feather feather-back" d="M24 18 12 13l2 10-8 1 8 8-8 4 13 5 8-13Z" />
			<path class="feather feather-mid" d="M23 24 10 21l6 8-8 4 11 4-4 7 13-5 2-13Z" />
			<path class="feather feather-front" d="M24 30 12 33l9 4-5 7 12-5 4-9Z" />
		</g>
		<g class="wing wing-right">
			<path class="feather feather-back" d="m40 18 12-5-2 10 8 1-8 8 8 4-13 5-8-13Z" />
			<path class="feather feather-mid" d="m41 24 13-3-6 8 8 4-11 4 4 7-13-5-2-13Z" />
			<path class="feather feather-front" d="m40 30 12 3-9 4 5 7-12-5-4-9Z" />
		</g>

		<path class="crown" d="m20 17 6-8 6 7 6-7 6 8-4 6H24Z" />
		<path class="crown-cut" d="m26 16 2-3 4 5 4-5 2 3-2 4h-8Z" />

		<path class="shield" d="m32 15 16 7-2 19c-1 8-7 14-14 18-7-4-13-10-14-18l-2-19Z" />
		<path
			class="shield-inner"
			d="m32 20 11 5-1.5 14.5c-.7 5.7-4.7 10.5-9.5 13.8-4.8-3.3-8.8-8.1-9.5-13.8L21 25Z"
		/>
		<path class="shield-ridge" d="M32 20v33.3M21 25l11 7 11-7M22.5 39.5 32 32l9.5 7.5" />

		<path class="gem-frame" d="m32 23 9 9-9 17-9-17Z" />
		<path class="gem-facet gem-left" d="m32 23-9 9 9 3Z" />
		<path class="gem-facet gem-right" d="m32 23 9 9-9 3Z" />
		<path class="gem-facet gem-bottom-left" d="m23 32 9 3v14Z" />
		<path class="gem-facet gem-bottom-right" d="m41 32-9 3v14Z" />
		<path class="gem-glint" d="m29 25 3-2 2 2-2 2Z" />

		<path class="chevron" d="m18 45 8 8M46 45l-8 8" />
		</svg>
	{/if}
</span>

<style>
	.rank-emblem {
		display: inline-grid;
		place-items: center;
		flex: none;
		color: var(--rank-color);
		filter: drop-shadow(0 1px 1px rgb(0 0 0 / 55%))
			drop-shadow(0 0 7px color-mix(in oklab, var(--rank-color) 54%, transparent));
	}

	svg {
		width: 100%;
		height: 100%;
		overflow: visible;
	}

	img {
		width: 100%;
		height: 100%;
		object-fit: contain;
	}

	.aura {
		fill: color-mix(in oklab, var(--rank-color) 13%, transparent);
		stroke: none;
	}

	.wing {
		stroke: color-mix(in oklab, var(--rank-color) 60%, white 40%);
		stroke-width: 0.85;
		stroke-linejoin: round;
	}

	.feather-back {
		fill: color-mix(in oklab, var(--rank-color) 52%, #07121e 48%);
	}

	.feather-mid {
		fill: color-mix(in oklab, var(--rank-color) 68%, #0b1928 32%);
	}

	.feather-front {
		fill: color-mix(in oklab, var(--rank-color) 72%, white 28%);
	}

	.crown {
		fill: color-mix(in oklab, var(--rank-color) 68%, #07121e 32%);
		stroke: color-mix(in oklab, var(--rank-color) 48%, white 52%);
		stroke-width: 1;
		stroke-linejoin: round;
	}

	.crown-cut {
		fill: color-mix(in oklab, var(--rank-color) 42%, white 58%);
		opacity: 0.76;
	}

	.shield {
		fill: color-mix(in oklab, var(--rank-color) 52%, #07121e 48%);
		stroke: color-mix(in oklab, var(--rank-color) 42%, white 58%);
		stroke-width: 1.7;
		stroke-linejoin: round;
	}

	.shield-inner {
		fill: color-mix(in oklab, var(--rank-color) 68%, #0b1928 32%);
		stroke: color-mix(in oklab, var(--rank-color) 60%, white 40%);
		stroke-width: 0.85;
	}

	.shield-ridge {
		fill: none;
		stroke: color-mix(in oklab, var(--rank-color) 34%, white 66%);
		stroke-width: 0.65;
		opacity: 0.62;
	}

	.gem-frame {
		fill: color-mix(in oklab, var(--rank-color) 76%, #07121e 24%);
		stroke: color-mix(in oklab, var(--rank-color) 30%, white 70%);
		stroke-width: 1.1;
		stroke-linejoin: round;
	}

	.gem-facet {
		stroke: color-mix(in oklab, var(--rank-color) 55%, white 45%);
		stroke-width: 0.35;
	}

	.gem-left {
		fill: color-mix(in oklab, var(--rank-color) 46%, white 54%);
	}

	.gem-right {
		fill: color-mix(in oklab, var(--rank-color) 84%, #07121e 16%);
	}

	.gem-bottom-left {
		fill: color-mix(in oklab, var(--rank-color) 72%, white 28%);
	}

	.gem-bottom-right {
		fill: color-mix(in oklab, var(--rank-color) 62%, #07121e 38%);
	}

	.gem-glint {
		fill: white;
		opacity: 0.86;
	}

	.chevron {
		fill: none;
		stroke: color-mix(in oklab, var(--rank-color) 44%, white 56%);
		stroke-width: 1.2;
		stroke-linecap: round;
	}
</style>
