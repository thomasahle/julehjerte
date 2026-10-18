import type { PageServerLoad } from './$types';
import { designStartArt } from '$lib/server/designStart';

export const load: PageServerLoad = async () => ({ art: await designStartArt() });
