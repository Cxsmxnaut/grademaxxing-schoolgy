<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { LocalStorageKey } from '$lib/storage/keys';
	import { acc, loadStudentAccount, persistStudentAccount } from '$lib/account.svelte';
	import {
		clearStoredCredentials,
		loadStoredCredentials,
		saveStoredCredentials
	} from '$lib/auth/credential-vault';
	import { brand } from '$lib/brand';
	import AuthPanelHeader from '$lib/components/auth/AuthPanelHeader.svelte';
	import DistrictCombobox from '$lib/components/auth/DistrictCombobox.svelte';
	import PostLoginLoadingScreen from '$lib/components/auth/PostLoginLoadingScreen.svelte';
	import SeoHead from '$lib/components/SeoHead.svelte';
	import SessionRecoveryScreen from '$lib/components/auth/SessionRecoveryScreen.svelte';
	import * as Alert from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import {
		initializeGradebookCatalog,
		refreshGradebookAfterSessionRestore,
		resetGradebookCatalog
	} from '$lib/grades/catalog.svelte';
	import { prepareStudentAccountCaches } from '$lib/auth/account-cache';
	import { StudentAccount } from '$lib/synergy';
	import { StudentVueAuthenticationError } from '$lib/studentvue/api';
	import { resetPortalConnection } from '$lib/session.svelte';
	import AlertCircleIcon from '@lucide/svelte/icons/alert-circle';
	import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';
	import InfoIcon from '@lucide/svelte/icons/info';
	import { onMount } from 'svelte';
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
	let restoringSession = $state(false);
	let recoveryStage = $state<'saving' | 'refreshing'>('saving');
	let checkingSavedSession = $state(true);
	let loginStage = $state('Connecting to StudentVUE…');
	let interactive = $state(false);
	let rememberMe = $state(true);
	let passwordResetOpen = $state(false);
	const studentVueForgotPasswordUrl = $derived.by(() => {
		try {
			const url = new URL(domain.includes('://') ? domain : `https://${domain}`);
			if (url.protocol !== 'https:') return undefined;
			const directory = url.pathname.endsWith('/')
				? url.pathname
				: /\.[a-z\d]+$/i.test(url.pathname)
					? url.pathname.slice(0, url.pathname.lastIndexOf('/') + 1)
					: `${url.pathname}/`;
			url.pathname = `${directory}PXP2_Password_Help.aspx`;
			url.search = 'S=Y';
			url.hash = '';
			return url.toString();
		} catch {
			return undefined;
		}
	});

	onMount(() => {
		interactive = true;
		const controller = new AbortController();
		void restoreSavedSession(controller.signal).finally(() => (checkingSavedSession = false));
		const handleStorage = (event: StorageEvent) => {
			if (
				event.storageArea !== localStorage ||
				(event.key !== LocalStorageKey.token && event.key !== null) ||
				(!checkingSavedSession && !restoringSession)
			)
				return;
			controller.abort();
			resetPortalConnection();
			resetGradebookCatalog();
			resetNonGradeRecords();
			loadStudentAccount();
			if (acc.studentAccount) void goto('/grades');
		};
		window.addEventListener('storage', handleStorage);
		return () => {
			controller.abort();
			window.removeEventListener('storage', handleStorage);
		};
	});

	const sessionExpired = $derived(
		browser && page.url.searchParams.get('sessionExpired') === 'true'
	);

	const loginDescription =
		'Sign in to Grademaxxing with your existing StudentVUE account. Your password is encrypted on this device and passed directly to your district over HTTPS.';
	const jsonLd = {
		'@context': 'https://schema.org',
		'@type': 'WebPage',
		name: `Sign in to ${brand}`,
		url: 'https://grademaxxing.app/login',
		description: loginDescription
	};

	async function finishLogin(
		loginAccount: StudentAccount,
		passwordToStore?: string,
		isCurrent = () => true
	) {
		if (!isCurrent()) return false;
		resetGradebookCatalog();
		resetNonGradeRecords();
		if (!(await prepareStudentAccountCaches(loginAccount, isCurrent))) return false;
		persistStudentAccount(loginAccount);
		if (rememberMe && passwordToStore) {
			await saveStoredCredentials({
				domain: loginAccount.domain,
				username: loginAccount.userID,
				password: passwordToStore
			});
		} else if (!rememberMe) {
			await clearStoredCredentials();
		}
		acc.studentAccount = loginAccount;
		return true;
	}

	async function restoreSavedSession(signal: AbortSignal) {
		if (loggingIn || acc.studentAccount) return;
		const stored = await loadStoredCredentials();
		if (!stored || signal.aborted || localStorage.getItem(LocalStorageKey.token) !== null) return;
		const canRestore = () =>
			!signal.aborted &&
			!acc.studentAccount &&
			localStorage.getItem(LocalStorageKey.token) === null;

		loggingIn = true;
		restoringSession = true;
		recoveryStage = 'saving';
		loginError = undefined;
		const savedAccount = new StudentAccount(stored.domain, stored.username, stored.password);
		try {
			await savedAccount.checkLogin(signal);
			if (!(await finishLogin(savedAccount, undefined, canRestore))) {
				loggingIn = false;
				restoringSession = false;
				return;
			}
		} catch (error) {
			if (error instanceof StudentVueAuthenticationError && canRestore())
				await clearStoredCredentials(canRestore);
			loggingIn = false;
			restoringSession = false;
			if (signal.aborted) return;
			loginError = 'Your saved StudentVUE sign-in needs attention. Enter your password again.';
			return;
		}
		recoveryStage = 'refreshing';
		try {
			await refreshGradebookAfterSessionRestore();
		} catch {
			// Keep the restored session. The gradebook exposes saved data and retry
			// when StudentVUE cannot complete the fresh fetch.
		}
		if (!signal.aborted && acc.studentAccount === savedAccount) await goto('/grades');
	}

	async function login(event: SubmitEvent) {
		event.preventDefault();
		if (loggingIn) return;
		loggingIn = true;
		loginStage = 'Connecting to StudentVUE…';
		loginError = undefined;
		const submittedPassword = password;
		const loginAccount = new StudentAccount(domain, username, submittedPassword);

		try {
			await loginAccount.checkLogin();
		} catch {
			loggingIn = false;
			loginError = 'password-rejected';
			return;
		}

		try {
			await finishLogin(loginAccount, submittedPassword);
		} catch {
			await fetch('/api/session', { method: 'DELETE' }).catch(() => undefined);
			resetGradebookCatalog();
			resetNonGradeRecords();
			acc.studentAccount = undefined;
			loggingIn = false;
			loginError = `${brand} could not securely save this browser session. Enable site storage and try again.`;
			return;
		}

		loginStage = 'Loading your grades…';
		await initializeGradebookCatalog();
		await goto('/grades');
	}
</script>

<SeoHead title="Log In - {brand}" description={loginDescription} {jsonLd} />

{#if checkingSavedSession || restoringSession}
	<SessionRecoveryScreen stage={recoveryStage} />
{:else if loggingIn}
	<PostLoginLoadingScreen message={loginStage} />
{:else}
	{#if loginError}
		<div
			in:fly={{ y: -50, duration: 200 }}
			class="fixed top-0 left-0 z-50 flex w-full justify-center p-4"
		>
			<Alert.Root variant="destructive" class="w-fit max-w-[calc(100vw-2rem)]">
				<AlertCircleIcon />
				<Alert.Title>That password was wrong.</Alert.Title>
				<Alert.Description>Reset it below, then try again.</Alert.Description>
			</Alert.Root>
		</div>
	{:else if sessionExpired}
		<div class="fixed top-0 left-0 z-50 flex w-full justify-center p-4">
			<Alert.Root class="w-fit max-w-[calc(100vw-2rem)]">
				<InfoIcon />
				<Alert.Title>The old StudentVUE session expired</Alert.Title>
				<Alert.Description>One more sign-in and we can move on.</Alert.Description>
			</Alert.Root>
		</div>
	{/if}

	<div class="login-stage">
		<div class="login-frame">
			<aside class="login-story" aria-label="Grademaxxing introduction">
				<img src="/login-dunes.jpg" alt="" />
				<div class="story-shade" aria-hidden="true"></div>
				<div class="story-top">
					<div class="story-brand">
						<img src="/grademaxxing-growth-mark.png" alt="" />
						<span>{brand}</span>
					</div>
					<a href="/">Back to website <ArrowRightIcon class="size-4" aria-hidden="true" /></a>
				</div>
				<div class="story-bottom">
					<h2>Your grades are complicated enough.</h2>
					<p>See the school day more clearly.</p>
				</div>
			</aside>
			<main class="login-pane">
				<form onsubmit={login} class="login-form">
					<div class="mobile-auth-header"><AuthPanelHeader /></div>
					<p class="login-eyebrow">STUDENTVUE SIGN IN</p>

					<h1
						class="font-heading text-foreground text-[clamp(1.85rem,3vw,2.75rem)] leading-[1.12] font-semibold tracking-[-0.04em]"
					>
						Sign in to {brand}
					</h1>
					<p class="login-lede">Continue with your school’s StudentVUE account.</p>

					<div class="login-fields mt-8 space-y-5">
						<DistrictCombobox
							value={domain}
							onselect={(district) => (domain = `https://${district.domain}`)}
							onvalueinput={(value) => (domain = value)}
							disabled={!interactive}
						/>

						<div>
							<label
								for="username"
								class="text-muted-foreground mb-1.5 block text-[0.78125rem] leading-[1.172rem] font-semibold"
							>
								StudentVUE email
							</label>
							<Input
								id="username"
								type="text"
								bind:value={username}
								autocomplete="username"
								class="border-input bg-secondary text-foreground focus-visible:border-primary focus-visible:outline-primary h-12 rounded-md px-4 text-sm shadow-none focus-visible:ring-0 focus-visible:outline-2 focus-visible:outline-offset-2"
								disabled={!interactive}
								required
							/>
						</div>

						<div>
							<label
								for="password"
								class="text-muted-foreground mb-1.5 block text-[0.78125rem] leading-[1.172rem] font-semibold"
							>
								StudentVUE password
							</label>
							<Input
								id="password"
								type="password"
								bind:value={password}
								autocomplete="current-password"
								class="border-input bg-secondary text-foreground focus-visible:border-primary focus-visible:outline-primary h-12 rounded-md px-4 text-sm shadow-none focus-visible:ring-0 focus-visible:outline-2 focus-visible:outline-offset-2"
								disabled={!interactive}
								required
							/>
							{#if studentVueForgotPasswordUrl}
								<button
									type="button"
									onclick={() => (passwordResetOpen = true)}
									disabled={!interactive}
									class="text-link mt-2 inline-block text-[0.78125rem] font-medium hover:underline hover:brightness-110"
								>
									Forgot password?
								</button>
							{/if}
						</div>

						<label
							class="text-muted-foreground flex items-start gap-2 text-[0.78125rem] leading-[1.172rem]"
						>
							<input
								type="checkbox"
								bind:checked={rememberMe}
								class="accent-primary mt-0.5 size-4"
							/>
							<span>
								Keep me signed in on this device
								<span class="text-tertiary-foreground block text-xs"
									>Your password is encrypted locally and sent only over HTTPS when reconnecting.</span
								>
							</span>
						</label>

						<Button
							type="submit"
							class="border-primary bg-primary text-primary-foreground mt-2 h-12 w-full rounded-md border text-[0.90625rem] font-semibold shadow-none transition-none hover:brightness-[1.08]"
							disabled={!interactive || loggingIn}
						>
							{loggingIn ? 'Logging in…' : 'Log in'}
						</Button>
					</div>

					<div class="login-legal text-muted-foreground mt-7 text-center text-xs leading-relaxed">
						<p>
							Your password is encrypted on this device and passed directly to your district when {brand}
							reconnects. We never store it on our servers.
						</p>
						<p class="mt-2.5">{brand} is independent and is not affiliated with Edupoint.</p>
						<p class="text-tertiary-foreground mt-[0.875rem] text-xs leading-[1.125rem]">
							<a href="/privacy" class="text-link hover:brightness-110">Privacy</a><span
								aria-hidden="true"
							>
								·
							</span><a href="/glossary" class="text-link hover:brightness-110">Glossary</a>
						</p>
					</div>
				</form>
			</main>
		</div>
	</div>

	{#if studentVueForgotPasswordUrl}
		<Dialog.Root bind:open={passwordResetOpen}>
			<Dialog.Content
				class="border-border bg-card text-card-foreground shadow-2xl shadow-black/50 sm:max-w-md"
			>
				<Dialog.Header>
					<Dialog.Title>Before you go, check All Mail</Dialog.Title>
					<Dialog.Description class="text-muted-foreground">
						Make sure to click <strong>All Mail</strong> in your school email. The reset message may not
						appear in the main inbox.
					</Dialog.Description>
				</Dialog.Header>
				<Dialog.Footer>
					<Button
						variant="outline"
						class="border-input text-foreground hover:border-primary hover:text-foreground bg-transparent hover:bg-transparent"
						onclick={() => (passwordResetOpen = false)}>Not now</Button
					>
					<Button
						href={studentVueForgotPasswordUrl}
						target="_blank"
						rel="noopener noreferrer"
						class="bg-primary text-primary-foreground hover:brightness-110"
						onclick={() => (passwordResetOpen = false)}
					>
						Open StudentVUE password help
					</Button>
				</Dialog.Footer>
			</Dialog.Content>
		</Dialog.Root>
	{/if}
{/if}

<style>
	/* Hallmark · pre-emit critique: P5 H5 E5 S5 R5 V4 · macrostructure: framed split sign-in · palette: Grademaxxing blue */
	.login-stage {
		display: grid;
		min-height: 100dvh;
		place-items: center;
		background: color-mix(in srgb, var(--background) 76%, var(--primary));
		padding: clamp(1rem, 3.5vw, 3.5rem);
	}
	.login-frame {
		display: grid;
		grid-template-columns: minmax(0, 1.04fr) minmax(0, 0.96fr);
		gap: clamp(1rem, 2vw, 1.5rem);
		width: min(100%, 78rem);
		min-height: 43rem;
		border: 1px solid var(--border);
		border-radius: var(--corner-2xl);
		background: var(--card);
		padding: 1rem;
		box-shadow: 0 2rem 4.5rem color-mix(in srgb, var(--surface-sunken) 46%, transparent);
	}
	.login-story {
		position: relative;
		min-width: 0;
		min-height: 41rem;
		overflow: hidden;
		border-radius: var(--corner-lg);
		color: var(--foreground);
	}
	.login-story > img {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
		object-position: center 56%;
	}
	.story-shade {
		position: absolute;
		inset: 0;
		background: linear-gradient(
			180deg,
			color-mix(in srgb, var(--surface-sunken) 38%, transparent),
			transparent 35%,
			color-mix(in srgb, var(--surface-sunken) 78%, transparent)
		);
	}
	.story-top,
	.story-bottom {
		position: absolute;
		right: clamp(1.5rem, 3vw, 2.5rem);
		left: clamp(1.5rem, 3vw, 2.5rem);
	}
	.story-top {
		top: 1.5rem;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}
	.story-brand {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		font-family: var(--font-heading);
		font-size: 1.25rem;
		font-weight: 700;
		white-space: nowrap;
	}
	.story-brand img {
		width: 2rem;
		height: 2rem;
	}
	.story-top a {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		border: 1px solid color-mix(in srgb, var(--foreground) 28%, transparent);
		border-radius: 999px;
		background: color-mix(in srgb, var(--surface-sunken) 48%, transparent);
		padding: 0.45rem 0.75rem;
		font-size: 0.75rem;
		font-weight: 600;
		white-space: nowrap;
		backdrop-filter: blur(10px);
	}
	.story-top a:hover {
		background: color-mix(in srgb, var(--surface-sunken) 72%, transparent);
	}
	.story-top a:focus-visible {
		outline: 2px solid var(--primary);
		outline-offset: 3px;
	}
	.story-bottom {
		bottom: 2.5rem;
	}
	.story-bottom h2 {
		max-width: 24rem;
		margin: 0;
		font-family: var(--font-heading);
		font-size: clamp(1.85rem, 3vw, 2.65rem);
		font-weight: 600;
		line-height: 1.13;
		letter-spacing: -0.04em;
		text-wrap: balance;
	}
	.story-bottom p {
		margin: 0.75rem 0 0;
		color: var(--muted-foreground);
		font-size: 0.875rem;
	}
	.login-pane {
		display: grid;
		min-width: 0;
		place-items: center;
		padding: clamp(1.5rem, 4.25vw, 4rem);
	}
	.login-form {
		width: min(100%, 28.5rem);
	}
	.mobile-auth-header {
		display: none;
	}
	.login-eyebrow {
		margin: 0 0 1rem;
		color: var(--primary);
		font-family: var(--font-technical);
		font-size: 0.6875rem;
		font-weight: 600;
		letter-spacing: 0.17em;
	}
	.login-lede {
		margin: 0.75rem 0 0;
		color: var(--muted-foreground);
		font-size: 0.875rem;
		line-height: 1.5;
	}
	.login-legal p {
		margin: 0;
	}
	@media (max-height: 53.125rem) and (min-width: 64.0625rem) {
		.login-stage {
			padding-block: 1rem;
		}
		.login-frame,
		.login-story {
			min-height: 0;
		}
		.login-pane {
			padding-block: 1.5rem;
		}
		.login-fields {
			margin-top: 1.5rem;
			row-gap: 1rem;
		}
		.login-legal {
			margin-top: 1rem;
		}
	}
	@media (max-width: 64rem) {
		.login-frame {
			grid-template-columns: minmax(0, 1fr);
			width: min(100%, 34rem);
			min-height: 0;
			gap: 0;
			padding: 0;
		}
		.login-story {
			display: none;
		}
		.login-pane {
			padding: 2.5rem;
		}
		.mobile-auth-header {
			display: block;
		}
	}
	@media (max-width: 40rem) {
		.login-stage {
			place-items: start center;
			background: var(--background);
			padding: 0;
		}
		.login-frame {
			border: 0;
			border-radius: 0;
			background: transparent;
			box-shadow: none;
		}
		.login-pane {
			padding: 1.5rem 1rem 2rem;
		}
	}
</style>
