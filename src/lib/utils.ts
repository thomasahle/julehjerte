import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Snippet } from "svelte";
import type { HTMLAttributes } from "svelte/elements";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

/**
 * Sanitize user input by removing HTML tags using the browser's DOM parser.
 * Returns plain text content only.
 */
export function sanitizeHtml(text: string): string {
	if (!text) return '';
	const doc = new DOMParser().parseFromString(text, 'text/html');
	return doc.body.textContent?.trim() || '';
}

export type WithElementRef<T, U extends HTMLElement = HTMLElement> = T & {
	ref?: U | null;
};

export type WithoutChild<T> = T extends { children?: Snippet<infer U> }
	? Omit<T, "children"> & { children?: Snippet<U> }
	: T;

export type WithoutChildrenOrChild<T> = T extends { children?: Snippet<infer U> }
	? Omit<T, "children"> & { children?: Snippet<U> }
	: T extends { child?: Snippet<infer U> }
		? Omit<T, "child"> & { child?: Snippet<U> }
		: T;
