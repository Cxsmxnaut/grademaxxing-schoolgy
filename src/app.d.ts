// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
declare global {
	namespace App {
		interface Error {
			message: string;
			requestId?: string;
		}
		interface Locals {
			requestId: string;
			requestTiming?: import('$lib/server/request-timing').RequestTiming;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
