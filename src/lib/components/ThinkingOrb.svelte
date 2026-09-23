<script lang="ts">
	import { MODE_FRAMES, paintFrame, resolvePreset, type OrbState } from 'thinking-orbs/engine';
	import { onMount } from 'svelte';

	let { state = 'breathing' }: { state?: OrbState } = $props();
	let canvas: HTMLCanvasElement;

	onMount(() => {
		const size = 20;
		const dpr = Math.min(2, window.devicePixelRatio || 1);
		const context = canvas.getContext('2d')!;

		canvas.width = Math.round(size * dpr);
		canvas.height = Math.round(size * dpr);
		const { mode, speed, opts } = resolvePreset(state, size);
		const frame = MODE_FRAMES[mode];
		const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		let animationFrame = 0;
		let running = false;
		let visible = true;

		function draw(time: number) {
			context.setTransform(dpr, 0, 0, dpr, 0, 0);
			context.clearRect(0, 0, size, size);
			paintFrame(context, frame(size, time, opts), true);
		}

		function loop() {
			draw((performance.now() / 1000) * speed);
			if (running) animationFrame = requestAnimationFrame(loop);
		}

		function start() {
			if (running || reducedMotion) return;
			running = true;
			animationFrame = requestAnimationFrame(loop);
		}

		function stop() {
			running = false;
			cancelAnimationFrame(animationFrame);
		}

		if (reducedMotion) draw(0.6);
		else draw((performance.now() / 1000) * speed);

		const observer = new IntersectionObserver(([entry]) => {
			visible = entry?.isIntersecting ?? false;
			if (visible && document.visibilityState !== 'hidden') start();
			else stop();
		});
		observer.observe(canvas);

		function handleVisibility() {
			if (document.visibilityState === 'hidden') stop();
			else if (visible) start();
		}
		document.addEventListener('visibilitychange', handleVisibility);

		return () => {
			stop();
			observer.disconnect();
			document.removeEventListener('visibilitychange', handleVisibility);
		};
	});
</script>

<canvas
	bind:this={canvas}
	class="size-5 shrink-0"
	aria-hidden="true"
	data-state={state}
	data-testid="thinking-orb"
></canvas>
