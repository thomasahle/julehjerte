// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		interface PageState {
			/** An open overlay's own history entry; see utils/overlayHistory.ts. */
			overlay?: string;
		}
		// interface Platform {}
	}

	// Google Analytics
	interface Window {
		dataLayer: unknown[];
		gtag: (...args: unknown[]) => void;
	}
}

declare module '*?raw' {
	const content: string;
	export default content;
}

export {};
