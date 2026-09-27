<script lang="ts">
	import { MODE_FRAMES, paintFrame, resolvePreset, type OrbState } from 'thinking-orbs/engine';
	import { onMount } from 'svelte';

	let { state = 'breathing', size = 36 }: { state?: OrbState; size?: 36 | 64 } = $props();
	let canvas: HTMLCanvasElement;

	onMount(() => {
		const presetSize = size === 64 ? 64 : 32;
		const dpr = Math.min(2, window.devicePixelRatio || 1);
		const context = canvas.getContext('2d')!;

		canvas.width = Math.round(size * dpr);
		canvas.height = Math.round(size * dpr);
		const { mode, speed, opts } = resolvePreset(state, presetSize);
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
	class="shrink-0"
	style:width={`${size}px`}
	style:height={`${size}px`}
	aria-hidden="true"
	data-state={state}
	data-testid="thinking-orb"
></canvas>
