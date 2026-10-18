/** hearts.json without the descriptions — see `$lib/data/heartIndexJson`. */
declare module '*/hearts.json?index' {
	const index: { categories: { id: string; hearts: { id: string }[] }[] };
	export default index;
}
