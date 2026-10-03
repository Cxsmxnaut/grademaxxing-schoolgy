<script lang="ts">
	import PostLoginLoadingScreen from './PostLoginLoadingScreen.svelte';

	let { stage = 'saving' }: { stage?: 'saving' | 'refreshing' } = $props();
</script>

<div data-testid="session-recovery-loading">
	<PostLoginLoadingScreen
		message={stage === 'saving' ? 'Saving your session…' : 'Refreshing your grades…'}
		recoveryStage={stage}
	/>
</div>
