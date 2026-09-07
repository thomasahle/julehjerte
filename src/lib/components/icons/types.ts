import type { SVGAttributes } from 'svelte/elements';

/** Props shared by every stroke icon in this directory. */
export type IconProps = SVGAttributes<SVGSVGElement> & {
	/** Width and height in px. 18 inside .btn, 24 for the gallery steps. */
	size?: number;
	class?: string;
};
