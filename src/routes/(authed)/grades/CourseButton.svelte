<script lang="ts">
	import Clock3Icon from '@lucide/svelte/icons/clock-3';
	import MapPinIcon from '@lucide/svelte/icons/map-pin';
	import UserRoundIcon from '@lucide/svelte/icons/user-round';

	interface Props {
		courseId: string;
		name: string;
		period: string;
		room: string;
		teacher: string;
		unseenAssignmentsCount: number;
		grade?: { letter: string; percentage: number };
	}

	const { courseId, name, period, room, teacher, unseenAssignmentsCount, grade }: Props = $props();

	function gradeColor(percentage: number) {
		if (percentage > 100) return 'var(--grade-extra)';
		if (percentage >= 90) return 'var(--grade-strong)';
		if (percentage >= 80) return 'var(--grade-watch)';
		return 'var(--grade-risk)';
	}

	const gradeColorValue = $derived(grade ? gradeColor(grade.percentage) : 'var(--grade-neutral)');
	const gradeText = $derived(
		grade
			? `${grade.percentage.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`
			: 'Not graded'
	);
</script>

<a
	href="/grades/{encodeURIComponent(courseId)}"
	class="course-card group focus-visible:ring-ring"
	style:--course-grade-color={gradeColorValue}
>
	<div class="course-grade-ring" aria-hidden="true">{grade?.letter ?? '—'}</div>
	<span class="sr-only">{grade?.letter ?? 'Not graded'}</span>
	{#if grade}
		<span
			class="sr-only"
			role="progressbar"
			aria-label={`${name} grade`}
			aria-valuemin="0"
			aria-valuemax="100"
			aria-valuenow={Number(Math.min(Math.max(grade.percentage, 0), 100).toFixed(1))}
			aria-valuetext={`${gradeText} (${grade.letter})`}
		></span>
	{/if}

	<div class="course-information">
		<div class="course-title-row">
			<h3>{name}</h3>
			{#if unseenAssignmentsCount > 0}
				<span class="new-assignments">{unseenAssignmentsCount} new</span>
			{/if}
		</div>
		{#if teacher}
			<p class="course-teacher"><UserRoundIcon aria-hidden="true" />{teacher}</p>
		{/if}
		<div class="course-metadata">
			<span><Clock3Icon aria-hidden="true" />Period {period}</span>
			{#if room}<span><MapPinIcon aria-hidden="true" />{room}</span>{/if}
		</div>
	</div>

	<div class="course-score">
		{#if grade}
			<strong>{gradeText}</strong>
			<span>{grade.letter} grade</span>
		{:else}
			<span class="course-ungraded">Not graded</span>
		{/if}
	</div>
</a>

<style>
	.course-card {
		display: grid;
		grid-template-columns: 4.25rem minmax(0, 1fr) auto;
		align-items: center;
		gap: 0.875rem;
		min-height: 9.25rem;
		padding: 1rem;
		border: 1px solid var(--border);
		border-radius: 1.25rem;
		background:
			linear-gradient(
				145deg,
				color-mix(in oklab, var(--course-grade-color) 7%, transparent),
				transparent 56%
			),
			var(--card);
		box-shadow:
			0 1px 2px rgb(0 0 0 / 12%),
			0 8px 24px rgb(0 0 0 / 8%);
		text-decoration: none;
		transition:
			border-color 160ms ease,
			transform 160ms ease,
			box-shadow 160ms ease;
	}

	.course-card:hover {
		transform: translateY(-2px);
		border-color: color-mix(in oklab, var(--course-grade-color) 48%, var(--border));
		box-shadow: 0 8px 26px rgb(0 0 0 / 15%);
	}

	.course-card:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: 3px;
	}

	.course-grade-ring {
		display: grid;
		width: 4.125rem;
		aspect-ratio: 1;
		place-items: center;
		border: 4px solid color-mix(in oklab, var(--course-grade-color) 85%, transparent);
		border-radius: 50%;
		background: color-mix(in oklab, var(--course-grade-color) 7%, var(--card));
		color: var(--course-grade-color);
		font-family: var(--font-heading);
		font-size: 1.5rem;
		font-weight: 700;
		letter-spacing: -0.04em;
	}

	.course-information {
		min-width: 0;
	}

	.course-title-row {
		display: flex;
		min-width: 0;
		align-items: center;
		gap: 0.5rem;
	}

	.course-title-row h3 {
		min-width: 0;
		overflow: hidden;
		font-family: var(--font-heading);
		font-size: 1rem;
		font-weight: 700;
		letter-spacing: -0.02em;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.new-assignments {
		flex: 0 0 auto;
		border-radius: 999px;
		background: color-mix(in oklab, var(--primary) 14%, transparent);
		padding: 0.2rem 0.5rem;
		color: var(--primary);
		font-size: 0.625rem;
		font-weight: 700;
	}

	.course-teacher,
	.course-metadata {
		display: flex;
		min-width: 0;
		align-items: center;
		gap: 0.4rem;
		color: var(--muted-foreground);
		font-size: 0.75rem;
		line-height: 1.35;
	}

	.course-teacher {
		margin-top: 0.45rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.course-teacher :global(svg),
	.course-metadata :global(svg) {
		width: 0.875rem;
		height: 0.875rem;
		flex: 0 0 auto;
	}

	.course-metadata {
		flex-wrap: wrap;
		margin-top: 0.45rem;
		gap: 0.4rem 0.75rem;
	}

	.course-metadata span {
		display: inline-flex;
		min-width: 0;
		align-items: center;
		gap: 0.3rem;
	}

	.course-score {
		display: flex;
		min-width: 3.75rem;
		flex-direction: column;
		align-items: flex-end;
		gap: 0.2rem;
		text-align: right;
	}

	.course-score strong {
		color: var(--course-grade-color);
		font-family: var(--font-technical);
		font-size: clamp(1rem, 1.45vw, 1.45rem);
		font-weight: 700;
		line-height: 1.1;
		white-space: nowrap;
	}

	.course-score > span {
		color: var(--muted-foreground);
		font-size: 0.6875rem;
		white-space: nowrap;
	}

	.course-score .course-ungraded {
		max-width: 4.5rem;
		white-space: normal;
	}

	@media (max-width: 32rem) {
		.course-card {
			grid-template-columns: 3.5rem minmax(0, 1fr) auto;
			gap: 0.625rem;
			min-height: 7.5rem;
			padding: 0.75rem;
			border-radius: 1rem;
		}

		.course-grade-ring {
			width: 3.5rem;
			border-width: 3px;
			font-size: 1.25rem;
		}

		.course-title-row h3 {
			font-size: 0.875rem;
		}

		.course-score {
			min-width: 3.25rem;
		}

		.course-score strong {
			font-size: 0.9375rem;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.course-card {
			transition: none;
		}
	}
</style>
