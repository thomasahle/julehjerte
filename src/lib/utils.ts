import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Snippet } from "svelte";
import type { HTMLAttributes } from "svelte/elements";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
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
