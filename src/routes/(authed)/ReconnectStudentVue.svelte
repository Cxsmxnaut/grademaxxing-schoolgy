<script lang="ts">
	import { acc, persistStudentAccount } from '$lib/account.svelte';
	import { loadStoredCredentials, saveStoredCredentials } from '$lib/auth/credential-vault';
	import { brand } from '$lib/brand';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { markPortalConnected, portalConnection } from '$lib/session.svelte';
	import { StudentAccount } from '$lib/synergy';
	import LinkIcon from '@lucide/svelte/icons/link';

	let open = $state(false);
	let password = $state('');
	let reconnecting = $state(false);
	let reconnectError = $state<string | undefined>();

	async function reconnect(event: SubmitEvent) {
		event.preventDefault();
		const current = acc.studentAccount;
		if (!current || reconnecting) return;
		reconnecting = true;
		reconnectError = undefined;
		const submittedPassword = password;
		const shouldRemember = (await loadStoredCredentials()) !== undefined;
		const replacement = new StudentAccount(current.domain, current.userID, submittedPassword);
		try {
			await replacement.checkLogin();
			if (shouldRemember)
				await saveStoredCredentials({
					domain: replacement.domain,
					username: replacement.userID,
					password: submittedPassword
				});
			persistStudentAccount(replacement);
			acc.studentAccount = replacement;
			password = '';
			markPortalConnected();
			open = false;
			// Reload the current route so every data loader adopts the replacement session,
			// while the account-scoped cache keeps grades visible immediately.
			location.reload();
		} catch (error) {
			reconnectError = error instanceof Error ? error.message : 'StudentVUE reconnect failed.';
			reconnecting = false;
		}
	}
</script>

{#if portalConnection.state === 'reconnect'}
	<div
		class="border-border bg-card fixed top-3 left-1/2 z-[60] flex w-[calc(100%-1.5rem)] max-w-xl -translate-x-1/2 items-center gap-3 rounded-xl border px-4 py-3 shadow-lg"
		role="status"
		data-testid="studentvue-reconnect-banner"
	>
		<LinkIcon class="text-primary size-4 shrink-0" aria-hidden="true" />
		<div class="min-w-0 flex-1">
			<p class="text-sm font-semibold">Grades are saved on this device</p>
			<p class="text-muted-foreground text-xs">Reconnect to StudentVUE to check for updates.</p>
		</div>
		<Button size="sm" onclick={() => (open = true)}>Reconnect</Button>
	</div>

	<Dialog.Root bind:open>
		<Dialog.Content class="sm:max-w-md" data-testid="studentvue-reconnect-dialog">
			<Dialog.Header>
				<Dialog.Title>Reconnect to StudentVUE</Dialog.Title>
				<Dialog.Description>
					Your district ended its session. Enter your StudentVUE password to update {brand}; it will
					be encrypted on this device if you chose to stay signed in.
				</Dialog.Description>
			</Dialog.Header>

			<form class="space-y-4" onsubmit={reconnect}>
				<div>
					<label for="reconnect-password" class="mb-1.5 block text-sm font-medium">
						StudentVUE password
					</label>
					<Input
						id="reconnect-password"
						type="password"
						bind:value={password}
						autocomplete="current-password"
						required
						autofocus
					/>
				</div>
				{#if reconnectError}
					<p class="text-destructive text-sm" role="alert">{reconnectError}</p>
				{/if}
				<Dialog.Footer>
					<Button type="submit" disabled={reconnecting || !password} aria-busy={reconnecting}>
						{reconnecting ? 'Reconnecting…' : 'Reconnect'}
					</Button>
				</Dialog.Footer>
			</form>
		</Dialog.Content>
	</Dialog.Root>
{/if}
