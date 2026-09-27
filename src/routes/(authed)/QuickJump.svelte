<script lang="ts">
	import { goto } from '$app/navigation';
	import { brandName } from '$lib/brand';
	import { removeCourseType } from '$lib/grades/course-name';
	import { getActiveGradebook } from '$lib/grades/gradebook';
	import { gradebookState } from '$lib/grades/catalog.svelte';
	import * as Command from '$lib/components/ui/command';
	import BookIcon from '@lucide/svelte/icons/book';
	import CalendarCheck2Icon from '@lucide/svelte/icons/calendar-check-2';
	import FilesIcon from '@lucide/svelte/icons/files';
	import MailOpenIcon from '@lucide/svelte/icons/mail-open';
	import MessageSquareQuoteIcon from '@lucide/svelte/icons/message-square-quote';
	import UserRoundIcon from '@lucide/svelte/icons/user-round';
	import type { Component } from 'svelte';
	import { quickJumpState } from './quickJumpState.svelte';

	const pages: { title: string; url: string; icon: Component; keywords: string }[] = [
		{
			title: 'Gradebook',
			url: '/grades',
			icon: BookIcon,
			keywords: 'grades classes assignments marks'
		},
		{
			title: 'Attendance',
			url: '/attendance',
			icon: CalendarCheck2Icon,
			keywords: 'absences tardies calendar school day'
		},
		{
			title: 'Documents',
			url: '/documents',
			icon: FilesIcon,
			keywords: 'files report cards library'
		},
		{
			title: 'Mail',
			url: '/mail',
			icon: MailOpenIcon,
			keywords: 'inbox messages studentvue email'
		},
		{
			title: 'Student information',
			url: '/studentinfo',
			icon: UserRoundIcon,
			keywords: 'profile account student id schedule school'
		},
		{
			title: 'Feedback',
			url: '/feedback',
			icon: MessageSquareQuoteIcon,
			keywords: 'support contact help'
		}
	];

	function run(url: string) {
		quickJumpState.open = false;
		void goto(url);
	}

	const courses = $derived.by(() => {
		// The version read keeps this derived when the catalog swaps report periods.
		gradebookState.version;
		return getActiveGradebook()?.Courses.Course;
	});

	$effect(() => {
		const handler = (event: KeyboardEvent) => {
			if (event.key === 'k' && (event.metaKey || event.ctrlKey)) {
				event.preventDefault();
				quickJumpState.open = !quickJumpState.open;
			}
		};
		document.addEventListener('keydown', handler);
		return () => document.removeEventListener('keydown', handler);
	});
</script>

<Command.Dialog
	bind:open={quickJumpState.open}
	title="Quick jump"
	description="{brandName} pages and classes"
>
	<Command.Input placeholder="Search pages and classes…" />
	<Command.List>
		<Command.Empty>No matches found.</Command.Empty>
		<Command.Group heading="Pages">
			{#each pages as item (item.url)}
				<Command.Item value={item.title} keywords={[item.keywords]} onSelect={() => run(item.url)}>
					<item.icon />
					<span>{item.title}</span>
				</Command.Item>
			{/each}
		</Command.Group>
		{#if courses && courses.length > 0}
			<Command.Group heading="Classes">
				{#each courses as course (course._CourseID)}
					<Command.Item
						value={removeCourseType(course._CourseName)}
						keywords={[`period ${course._Period}`, course._Staff ?? '', course._Room ?? '']}
						onSelect={() => run(`/grades/${encodeURIComponent(course._CourseID)}`)}
					>
						<BookIcon />
						<span class="truncate">{removeCourseType(course._CourseName)}</span>
					</Command.Item>
				{/each}
			</Command.Group>
		{/if}
	</Command.List>
</Command.Dialog>
