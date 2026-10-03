<script lang="ts">
	import { acc, persistStudentAccount } from '$lib/account.svelte';
	import { prepareStudentAccountCaches } from '$lib/auth/account-cache';
	import { clearStoredCredentials, saveStoredCredentials } from '$lib/auth/credential-vault';
	import { brand } from '$lib/brand';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { refreshGradebookAfterSessionRestore } from '$lib/grades/catalog.svelte';
	import {
		beginSessionRecovery,
		finishSessionRecovery,
		getSessionRecoverySignal,
		isSessionRecoveryCurrent,
		markPortalConnected,
		markPortalOffline,
		markSessionRecoveryRefreshing,
		portalConnection
	} from '$lib/session.svelte';
	import { LocalStorageKey } from '$lib/storage/keys';
	import { StudentAccount } from '$lib/synergy';
	import LinkIcon from '@lucide/svelte/icons/link';
	import { resetNonGradeRecords } from './resetNonGradeRecords.svelte';
	let { onGradebookUnavailable }: { onGradebookUnavailable?: () => void } = $props();

	let open = $state(false);
	let password = $state('');
	let rememberMe = $state(true);
	let reconnecting = $state(false);
	let reconnectError = $state<string | undefined>();

	async function reconnect(event: SubmitEvent) {
		event.preventDefault();
		const current = acc.studentAccount;
		if (!current || reconnecting) return;
		reconnecting = true;
		reconnectError = undefined;
		const submittedPassword = password;
		const replacement = new StudentAccount(current.domain, current.userID, submittedPassword);
		const recovery = beginSessionRecovery();
		const storedToken = () => {
			try {
				return localStorage.getItem(LocalStorageKey.token);
			} catch {
				return undefined;
			}
		};
		const originalToken = storedToken();
		const canReconnect = () =>
			isSessionRecoveryCurrent(recovery) &&
			acc.studentAccount === current &&
			storedToken() === originalToken;
		try {
			await replacement.checkLogin(getSessionRecoverySignal(recovery));
			if (!canReconnect()) return;
			if (!(await prepareStudentAccountCaches(replacement, canReconnect))) return;
			if (rememberMe) {
				await saveStoredCredentials(
					{
						domain: replacement.domain,
						username: replacement.userID,
						password: submittedPassword
					},
					canReconnect
				);
			} else {
				await clearStoredCredentials(canReconnect);
			}
			if (!canReconnect()) return;
			persistStudentAccount(replacement);
			acc.studentAccount = replacement;
			resetNonGradeRecords();
			password = '';
			rememberMe = true;
			markPortalConnected();
			open = false;
			markSessionRecoveryRefreshing(recovery);
			try {
				if (
					(await refreshGradebookAfterSessionRestore(replacement)) &&
					acc.studentAccount === replacement &&
					isSessionRecoveryCurrent(recovery)
				)
					markPortalConnected();
			} catch {
				// Authentication succeeded. Keep the renewed session and saved grades;
				// the gradebook exposes a retry if its complete fresh read fails.
				if (acc.studentAccount === replacement && isSessionRecoveryCurrent(recovery)) {
					markPortalOffline();
					onGradebookUnavailable?.();
				}
			}
		} catch (error) {
			if (canReconnect())
				reconnectError = error instanceof Error ? error.message : 'StudentVUE reconnect failed.';
		} finally {
			finishSessionRecovery(recovery);
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
			<p class="text-sm font-semibold">Your saved grades are still here.</p>
			<p class="text-muted-foreground text-xs">
				StudentVUE needs one more handshake to check for updates.
			</p>
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
				<label class="text-muted-foreground flex items-start gap-2 text-xs">
					<input type="checkbox" bind:checked={rememberMe} class="accent-primary mt-0.5 size-4" />
					<span>
						Keep me signed in on this device
						<span class="block text-[0.6875rem]">
							Your password is encrypted locally for automatic reconnects.
						</span>
					</span>
				</label>
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
