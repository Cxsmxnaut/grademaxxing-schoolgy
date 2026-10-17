<script lang="ts">
	import MaxChatWindow, { type ChatMessageView, type ChatRole } from './MaxChatWindow.svelte';
	import { buildMaxStudentContext } from './max-context';

	interface StreamFrame {
		t?: unknown;
		done?: unknown;
		text?: unknown;
		provider?: unknown;
		model?: unknown;
		error?: unknown;
	}

	const disclaimer =
		'max can make mistakes — double-check the math. · sends your question and a course/grade summary to its AI providers — never your name, ID, or photo.';

	let messages = $state<ChatMessageView[]>([]);
	let busy = $state(false);
	let modelLabel = $state('max · mesh');
	let nextId = 1;

	function withMessage(role: ChatRole, text: string): ChatMessageView {
		return { id: nextId++, role, text };
	}

	async function askMax(userQuery: string) {
		if (busy) return;
		busy = true;

		// The engine is stateless: the caller owns history and sends the recent
		// turns with each question (last 3 exchanges, matching MAX_HISTORY_TURNS).
		const history = messages
			.filter((message) => message.role === 'user' || message.role === 'max')
			.slice(-6)
			.map((message) => ({ role: message.role, text: message.text }));
		messages = [...messages, withMessage('user', userQuery)];

		let reply: ChatMessageView | undefined;
		let raw = '';
		try {
			const response = await fetch('/api/max', {
				method: 'POST',
				headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
				body: JSON.stringify({
					studentDataContext: buildMaxStudentContext(),
					userQuery,
					history,
					stream: true
				})
			});

			const contentType = response.headers.get('content-type') ?? '';
			if (!response.ok || !contentType.includes('text/event-stream')) {
				const data = (await response.json().catch(() => ({}))) as { error?: unknown };
				throw new Error(
					typeof data.error === 'string' && data.error !== ''
						? data.error
						: `request failed (${response.status})`
				);
			}
			if (!response.body) throw new Error('no response stream');

			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let buffer = '';
			let final: StreamFrame | null = null;
			let failure: Error | null = null;

			for (;;) {
				const { done, value } = await reader.read();
				if (done) break;
				buffer += decoder.decode(value, { stream: true });
				let newline: number;
				while ((newline = buffer.indexOf('\n')) !== -1) {
					const line = buffer.slice(0, newline).trim();
					buffer = buffer.slice(newline + 1);
					if (!line.startsWith('data:')) continue;
					let frame: StreamFrame;
					try {
						frame = JSON.parse(line.slice(5)) as StreamFrame;
					} catch {
						continue; // malformed frame — skip
					}
					if (typeof frame.t === 'string' && frame.t !== '') {
						raw += frame.t;
						if (reply) messages = [...messages.slice(0, -1), { ...reply, text: raw }];
						else {
							reply = withMessage('max', raw);
							messages = [...messages, reply];
						}
						reply = messages[messages.length - 1];
					} else if (frame.done) {
						final = frame;
					} else if (typeof frame.error === 'string' && frame.error !== '') {
						failure = new Error(frame.error);
					}
				}
			}

			if (failure) throw failure;
			const text = typeof final?.text === 'string' && final.text !== '' ? final.text : raw;
			if (!text) throw new Error('empty response');
			if (reply) messages = [...messages.slice(0, -1), { ...reply, text }];
			else messages = [...messages, withMessage('max', text)];
			if (typeof final?.provider === 'string' && final.provider !== '')
				modelLabel = `${final.provider} · ${typeof final.model === 'string' && final.model !== '' ? final.model : 'mesh'}`;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			messages = [...messages, withMessage('error', message || "max didn't answer — try again.")];
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>Max AI · Grademaxxing</title></svelte:head>

<!-- The tab is the Max UI itself: the chat window fills the whole content
     area edge to edge (viewport minus the mobile top/bottom bars). -->
<div class="h-[calc(100svh-6.84375rem)] w-full overflow-hidden md:h-svh" data-testid="max-ai-panel">
	<MaxChatWindow {messages} {busy} {modelLabel} {disclaimer} onSend={(text) => void askMax(text)} />
</div>
