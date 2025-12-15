import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { HTMLAttributes, Snippet } from "svelte/elements";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export type WithElementRef<T, U extends HTMLElement = HTMLElement> = T & {
	ref?: U | null;
};

export type WithoutChild<T> = T extends { children?: Snippet<infer U> }
	? Omit<T, "children"> & { children?: Snippet<U> }
	: T;
