<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { LocalStorageKey } from '$lib';
	import { acc, loadStudentAccount } from '$lib/account.svelte';
	import { brand } from '$lib/brand';
	import Disclaimer from '$lib/components/Disclaimer.svelte';
	import LoadingBanner from '$lib/components/LoadingBanner.svelte';
	import * as Alert from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import { resetGradebookCatalog } from '$lib/grades/catalog.svelte';
	import { seenAssignmentIDs } from '$lib/grades/seenAssignments.svelte';
	import { StudentAccount } from '$lib/synergy';
	import AlertCircleIcon from '@lucide/svelte/icons/alert-circle';
	import InfoIcon from '@lucide/svelte/icons/info';
	import LogInIcon from '@lucide/svelte/icons/log-in';
	import { fly } from 'svelte/transition';
	import { resetNonGradeRecords } from '../(authed)/resetNonGradeRecords.svelte';

	const pleasantonDomain = 'https://ca-pleas-psv.edupoint.com';

	if (browser && localStorage.getItem(LocalStorageKey.token) !== null) {
		if (!acc.studentAccount) loadStudentAccount();
		void goto('/grades');
	}

	let username = $state('');
	let password = $state('');
	let domain = $state(pleasantonDomain);
	let loginError = $state<string | undefined>();
	let loggingIn = $state(false);

	const sessionExpired = $derived(
		browser && page.url.searchParams.get('sessionExpired') === 'true'
	);

	async function gradebookOwnerFingerprint(user: string, district: string) {
		const identity = `${district.trim().toLowerCase()}\n${user.trim().toLowerCase()}`;
		const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(identity));
		return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(
			''
		);
	}

	async function login(event: SubmitEvent) {
		event.preventDefault();
		if (loggingIn) return;
		loggingIn = true;
		loginError = undefined;
		const loginAccount = new StudentAccount(domain, username, password);

		try {
			await loginAccount.checkLogin();
		} catch (error) {
			loggingIn = false;
			loginError = error instanceof Error ? error.message : String(error);
			return;
		}

		try {
			resetGradebookCatalog();
			resetNonGradeRecords();
			const ownerFingerprint = await gradebookOwnerFingerprint(
				loginAccount.userID,
				loginAccount.domain
			);
			let sameStudent = localStorage.getItem(LocalStorageKey.gradebookOwner) === ownerFingerprint;
			const previousToken = localStorage.getItem(LocalStorageKey.token);
			if (!sameStudent && previousToken !== null) {
				try {
					const previous = JSON.parse(previousToken) as { username?: unknown; domain?: unknown };
					sameStudent =
						typeof previous.username === 'string' &&
						typeof previous.domain === 'string' &&
						previous.username.toLowerCase() === loginAccount.userID.toLowerCase() &&
						previous.domain.toLowerCase() === loginAccount.domain.toLowerCase();
				} catch {
					/* Invalid identity metadata never authorizes cache reuse. */
				}
			}

			if (!sameStudent) {
				seenAssignmentIDs.clear();
				for (const key of [
					LocalStorageKey.gradebook,
					LocalStorageKey.seenAssignmentIDs,
					LocalStorageKey.attendance,
					LocalStorageKey.documents,
					LocalStorageKey.mailData,
					LocalStorageKey.studentInfo
				])
					localStorage.removeItem(key);
			}
			localStorage.setItem(LocalStorageKey.gradebookOwner, ownerFingerprint);
			localStorage.setItem(
				LocalStorageKey.token,
				JSON.stringify({
					username: loginAccount.userID,
					domain: loginAccount.domain,
					sessionId: loginAccount.sessionId
				})
			);
			acc.studentAccount = loginAccount;
		} catch {
			await fetch('/api/session', { method: 'DELETE' }).catch(() => undefined);
			resetGradebookCatalog();
			resetNonGradeRecords();
			acc.studentAccount = undefined;
			loggingIn = false;
			loginError =
				'Grademaxxing could not securely save this browser session. Enable site storage and try again.';
			return;
		}

		loggingIn = false;
		void goto('/grades');
	}
</script>

<svelte:head>
	<title>Log In - {brand}</title>
</svelte:head>

{#if loggingIn}
	<LoadingBanner>Logging you in...</LoadingBanner>
{/if}

{#if loginError}
	<div
		in:fly={{ y: -50, duration: 200 }}
		class="fixed top-0 left-0 z-50 flex w-full justify-center p-4"
	>
		<Alert.Root variant="destructive" class="w-fit max-w-[calc(100vw-2rem)]">
			<AlertCircleIcon />
			<Alert.Title>Couldn't log in</Alert.Title>
			<Alert.Description>{loginError}</Alert.Description>
		</Alert.Root>
	</div>
{:else if sessionExpired}
	<div class="fixed top-0 left-0 z-50 flex w-full justify-center p-4">
		<Alert.Root class="w-fit max-w-[calc(100vw-2rem)]">
			<InfoIcon />
			<Alert.Title>Your StudentVUE session expired</Alert.Title>
			<Alert.Description>Sign in again to reconnect and refresh your school data.</Alert.Description
			>
		</Alert.Root>
	</div>
{/if}

<div class="flex min-h-screen flex-col">
	<main class="flex grow items-center justify-center">
		<form onsubmit={login} class="m-4 flex w-full max-w-sm flex-col gap-4">
			<div class="mb-8 flex flex-col items-center gap-2">
				<img src="/favicon.svg" class="h-8 w-8" alt={brand} />
				<h1 class="text-xl font-bold">Log in to {brand}</h1>
				<Field.Description>
					Never used {brand} before? <a href="/signup">Sign up</a>
				</Field.Description>
			</div>

			<Field.Group>
				<Field.Field>
					<Field.Label for="username">StudentVUE Username</Field.Label>
					<Input
						id="username"
						type="text"
						bind:value={username}
						placeholder="student@school.net"
						autocomplete="username"
						required
					/>
				</Field.Field>

				<Field.Field>
					<Field.Label for="password">StudentVUE Password</Field.Label>
					<Input
						id="password"
						type="password"
						bind:value={password}
						autocomplete="current-password"
						required
					/>
					<Field.Description>
						Your password is sent over encrypted HTTPS, used only to open StudentVUE, and never
						stored.
					</Field.Description>
				</Field.Field>

				<Field.Field>
					<Field.Label for="domain">StudentVUE Domain</Field.Label>
					<Input
						id="domain"
						type="text"
						aria-label="StudentVUE Domain"
						placeholder="your-district-psv.edupoint.com"
						autocapitalize="off"
						autocorrect="off"
						bind:value={domain}
						required
					/>
				</Field.Field>

				<Field.Field orientation="horizontal" class="items-center">
					<Checkbox name="disclaimer" id="disclaimer" required />
					<Field.Label for="disclaimer" class="text-tertiary-foreground text-xs">
						I understand that {brand} is an independent, unofficial tool and is not affiliated with or
						endorsed by Edupoint Educational Systems LLC.
					</Field.Label>
				</Field.Field>

				<Field.Field>
					<Button type="submit" class="w-full" disabled={loggingIn}>
						<LogInIcon class="h-4 w-4" />
						{loggingIn ? 'Logging in…' : 'Log in'}
					</Button>
				</Field.Field>
			</Field.Group>
		</form>
	</main>

	<Disclaimer />
</div>
