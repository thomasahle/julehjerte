/**
 * The paragraph the detail page prints under each gallery heart's name.
 *
 * It lives here rather than in `heart-meta.json` for two reasons: that file is
 * regenerated from the SVGs by `scripts/generate-heart-data.mjs` and carries one
 * single-language `description` per heart, and these texts are written by hand in
 * both site languages. The detail route resolves the visitor's language in its
 * `load` (see `src/routes/[[lang=lang]]/hjerte/[id]/+page.ts`), so the paragraph
 * is in the prerendered HTML of both `/hjerte/<id>/` and `/en/hjerte/<id>/`.
 *
 * They are *not* translation keys: `translations.ts` holds the site's interface
 * strings, and its dead-key test would have to grow a special case for 38 keys no
 * call site names directly. `heartDescriptions.test.ts` guards this file instead.
 *
 * House style, because the owner will read every one of them: two to four plain
 * sentences saying what the woven pattern shows, how many strips each half has
 * and whether they are cut straight or curved, whether one template covers both
 * halves, and the difficulty with one practical tip. Facts only — the name,
 * author, grid, difficulty and symmetry in `heart-meta.json` and what the design
 * itself shows. No history or authorship that is not already recorded there.
 *
 * Hearts a visitor drew or received by link are not in this map; they keep
 * whatever description their maker typed into the editor.
 */
import type { Language } from '$lib/i18n';

/** The same paragraph in both site languages. */
export type HeartDescription = Record<Language, string>;

export const HEART_DESCRIPTIONS: Record<string, HeartDescription> = {
	// Klassiske
	'classic-3x3': {
		da: 'Det traditionelle danske julehjerte. Tre lige striber i hver halvdel giver et 3 × 3-felt med skiftevis røde og hvide firkanter, og halvdelene er spejlvendte, så én skabelon dækker begge. Klippene er helt lige, og hjertet er det letteste i galleriet. Flet den nederste stribe helt igennem, før du begynder på den næste.',
		en: 'The traditional Danish woven heart. Three straight strips in each half weave into a 3 × 3 field of alternating red and white squares, and the halves mirror each other, so one template covers both. The cuts are perfectly straight, and this is the easiest heart in the gallery. Weave the bottom strip all the way through before starting the next one.'
	},
	ramme: {
		da: 'En ramme af røde buer omkring et åbent midterfelt. De fem striber i hver halvdel er klippet i bløde buer i stedet for lige linjer, og det er dem, der gør rammen let skæv. Halvdelene er spejlvendte, så én skabelon er nok. Sværhedsgraden er mellem; klip hver bue i ét træk, så kanten bliver jævn.',
		en: 'A frame of red arcs around an open middle. The five strips in each half are cut as soft curves rather than straight lines, and that is what leaves the frame slightly lopsided. The halves mirror each other, so one template is enough. Medium difficulty: cut each curve in a single stroke to keep the edge even.'
	},
	gaver: {
		da: 'Fire større røde felter mellem smalle bånd, så mønsteret læses som fire små gaver med snor omkring. Alle seks striber i hver halvdel er lige, så klipningen er enkel, men antallet af striber gør flettingen langsommere. Halvdelene er spejlvendte, og én skabelon dækker begge. Hold øje med over-under-rytmen stribe for stribe; en enkelt fejl forskyder hele mønsteret.',
		en: 'Four larger red fields between narrow bands, so the pattern reads as four small parcels tied with string. All six strips in each half are straight, which keeps the cutting simple, but the number of strips makes the weaving slower. The halves mirror each other, and one template covers both. Watch the over-under rhythm strip by strip; a single mistake shifts the whole pattern.'
	},
	jul: {
		da: 'Det danske ord JUL skrevet med hvide bogstaver hen over et rødt 5 × 5-felt. Bogstaverne kræver, at de to halvdele klippes forskelligt, så hjertet har to skabeloner, en til hver side. Fem striber i hver halvdel, men med mange små knæk undervejs, og det er dem, der gør hjertet svært. Gerth Stølting Brodal har flere hjerter med tekst på brodal.dk.',
		en: 'The Danish word JUL, meaning Christmas, spelled in white across a red 5 × 5 field. The lettering means the two halves are cut differently, so the heart comes with two templates, one per side. Five strips in each half, but with a great many short turns along the way, and those are what make it hard. Gerth Stølting Brodal has more lettered hearts at brodal.dk.'
	},

	// Stjerner
	stjerne: {
		da: 'En ottetakket hvid stjerne midt i et rødt felt. Der er kun tre striber i hver halvdel, men hver stribe knækker frem og tilbage for at danne takkerne, så klippene er lige og alligevel spidse. Halvdelene er spejlvendte, og én skabelon dækker begge. Klip de spidse hjørner med en lille saks, så takkerne ikke bliver runde.',
		en: 'An eight-pointed white star in the middle of a red field. There are only three strips in each half, but every strip zigzags to form the points, so the cuts stay straight and still come out sharp. The halves mirror each other, and one template covers both. Cut the sharp corners with small scissors so the points do not end up rounded.'
	},
	'stjerne-ramme': {
		da: 'En firtakket stjerne i midten, omgivet af en bred ramme af smalle tern. Ni striber i hver halvdel er det højeste antal i galleriet, og halvdelen af klippene er lette buer. Halvdelene er spejlvendte, så der er kun én skabelon. Striberne bliver smalle ved rammen, så brug fast papir og en skarp saks.',
		en: 'A four-pointed star in the middle, surrounded by a wide border of narrow checks. Nine strips in each half is the highest count in the gallery, and half of the cuts are gentle curves. The halves mirror each other, so there is only one template. The strips get narrow towards the border, so use firm paper and sharp scissors.'
	},
	'5star': {
		da: 'Omridset af en femtakket stjerne, tegnet som en tynd rød streg på hvid bund. Fem striber i hver halvdel, og alle klip er lige, men stjernens spidser giver omkring halvtreds knæk at følge. Halvdelene er spejlvendte, så én skabelon dækker begge. Sværhedsgraden ligger i klipningen: de tynde stregstykker knækker let i tyndt papir.',
		en: 'The outline of a five-pointed star drawn as a thin red line on white. Five strips in each half, and every cut is straight, but the points of the star add some fifty turns to follow. The halves mirror each other, so one template covers both. The difficulty is all in the cutting: the thin parts of the outline tear easily in thin paper.'
	},
	'simple-5star': {
		da: 'En massiv hvid femtakket stjerne på rød bund. Tre striber i hver halvdel og lige klip hele vejen gør det til en af de letteste skabeloner i galleriet. Halvdelene er spejlvendte, og én skabelon dækker begge. De brede felter tilgiver små unøjagtigheder i klippet.',
		en: 'A solid white five-pointed star on a red ground. Three strips in each half and straight cuts throughout make this one of the easiest templates in the gallery. The halves mirror each other, and one template covers both. The wide fields forgive small inaccuracies in the cutting.'
	},
	sun: {
		da: 'To yin-yang-figurer, der sammen danner en sol i rotation. Fire striber i hver halvdel, og halvdelen af klippene er buer, som giver figurernes runde kanter. Begge halvdele klippes efter samme skabelon. Mønsteret drejer om midten i stedet for at være spejlvendt, så kontroller hver stribe mod skabelonen, mens du fletter.',
		en: 'Two yin-yang figures that together make a turning sun. Four strips in each half, and half of the cuts are curves, which is where the rounded edges come from. Both halves are cut from the same template. The pattern turns about the centre rather than mirroring, so check each strip against the template as you weave.'
	},
	explosion: {
		da: 'Røde kiler, der stråler ud fra et lille ternet felt i midten. Fem striber i hver halvdel, alle klippet som lige linjer, der bare ikke er parallelle; det er hældningen, der giver strålerne. Halvdelene er spejlvendte, og én skabelon dækker begge. Trods de fem striber er hjertet let, for der er ikke et eneste knæk at ramme.',
		en: 'Red wedges radiating from a small checked field at the centre. Five strips in each half, all cut as straight lines that simply are not parallel; the taper is what makes the rays. The halves mirror each other, and one template covers both. Despite the five strips the heart is easy, because there is not a single corner to hit.'
	},
	nihon: {
		da: 'En stor rød skive midt i det hvide felt, med tre kiler ud mod kanten; navnet er det japanske ord for Japan. Kun tre striber i hver halvdel, og skiven kommer af en enkelt bue på hver af de midterste striber. Halvdelene er spejlvendte, og én skabelon dækker begge. Hjertet er let, men buen skal klippes i ét træk, hvis cirklen skal blive rund.',
		en: 'A large red disc in the middle of the white field, with three wedges reaching towards the edge; the name is the Japanese word for Japan. Only three strips in each half, and the disc comes from a single curve on each of the middle strips. The halves mirror each other, and one template covers both. The heart is easy, but cut the curve in one stroke if the circle is to stay round.'
	},
	'davidsstjerne-circ': {
		da: 'En davidsstjerne tegnet med tynde streger inde i en cirkel og omgivet af et felt af små tern. Otte striber i hver halvdel og godt halvandet hundrede knæk i klippet gør den til en af de sværeste i galleriet. Halvdelene er spejlvendte, så der er kun én skabelon. Brug fast papir og tag den tid, det tager; de tynde streger tåler ikke en saks, der glider.',
		en: 'A Star of David drawn in thin lines inside a circle and surrounded by a field of small checks. Eight strips in each half and more than a hundred and fifty turns in the cutting make this one of the hardest in the gallery. The halves mirror each other, so there is only one template. Use firm paper and take the time it needs; the thin lines do not survive a slipping pair of scissors.'
	},
	david4: {
		da: 'Den samme davidsstjerne i en mindre udgave, med fire striber i hver halvdel i stedet for otte. Alle klip er lige, men stjernens trekanter giver mange skarpe hjørner at følge. Halvdelene er spejlvendte, og én skabelon dækker begge. Sværhedsgraden er mellem, og hjertet er en rimelig opvarmning til den store davidsstjerne.',
		en: 'The same Star of David in a smaller version, with four strips in each half instead of eight. All the cuts are straight, but the triangles of the star add plenty of sharp corners to follow. The halves mirror each other, and one template covers both. It is rated medium and makes a reasonable warm-up for the larger Star of David.'
	},
	khatam: {
		da: 'Et khatam-motiv gentaget som små møller ud over hele fladen; khatam er den ottetakkede stjerne, der er udbredt i islamisk kunst og arkitektur. Seks striber i hver halvdel, alle klip lige, men med næsten to hundrede knæk fordelt på striberne. Halvdelene er ikke ens, så hjertet har to skabeloner. Det er en ekspertopgave; hold skabelonen fast, og klip de mange små hjørner ét ad gangen.',
		en: 'A khatam motif repeated as small pinwheels across the whole field; khatam is the eight-pointed star prominent in Islamic art and architecture. Six strips in each half, every cut straight, but with close to two hundred turns spread over the strips. The halves are not alike, so the heart comes with two templates. This is an expert job; hold the template down firmly and cut the many small corners one at a time.'
	},

	// Mønstre
	circle: {
		da: 'En bred rød ring om et tomt midterfelt, brudt af fire åbninger, med buer der løber videre ud mod kanten. Fem striber i hver halvdel, og godt halvdelen af klippene er buer, som tilsammen former ringen. Halvdelene er spejlvendte, og én skabelon dækker begge. En ring afslører enhver skæv bue, så klip langsomt og drej papiret i stedet for saksen.',
		en: 'A wide red ring around an empty middle, broken by four openings, with arcs running on towards the edge. Five strips in each half, and a good half of the cuts are curves that together form the ring. The halves mirror each other, and one template covers both. A ring shows up every uneven curve, so cut slowly and turn the paper rather than the scissors.'
	},
	balls: {
		da: 'Hvide cirkler i skiftende størrelser fordelt over den røde flade. Syv striber i hver halvdel, og næsten halvdelen af klippene er buer, fordi hver prik skæres ud af to nabostriber. Halvdelene er spejlvendte, så der er kun én skabelon. Det er en ekspertskabelon: prikkerne gør striberne smalle mellem hullerne, så papiret skal være fast.',
		en: 'White circles in varying sizes spread across the red ground. Seven strips in each half, and nearly half the cuts are curves, because each dot is carved out of two neighbouring strips. The halves mirror each other, so there is only one template. This is an expert template: the dots leave the strips narrow between the holes, so the paper needs to be firm.'
	},
	kogle: {
		da: 'Rækker af bølgede skæl, som på en grankogle. Næsten alle klip er buer, hvilket er usædvanligt; seks striber i hver halvdel, og kun de yderste kanter er lige. Halvdelene er spejlvendte, og én skabelon dækker begge. Bølgerne skal ramme hinanden, for at skællene lukker, så klip alle striber i samme retning, mens hånden holder den samme kurve.',
		en: 'Rows of wavy scales, as on a pine cone. Almost every cut here is a curve, which is unusual; six strips in each half, and only the outer edges are straight. The halves mirror each other, and one template covers both. The waves have to meet for the scales to close, so cut every strip in the same direction while your hand keeps the same curve.'
	},
	plus: {
		da: 'Fire røde plusser omkring et enkelt hvidt plus i midten. Kun tre striber i hver halvdel, men hver stribe knækker ind og ud for at tegne korsarmene, så der er godt tredive hjørner at klippe. Begge halvdele klippes efter samme skabelon. De rette vinkler skal se rette ud; brug en skarp saks, og klip helt ind i hvert hjørne.',
		en: 'Four red crosses around a single white one in the middle. Only three strips in each half, but every strip steps in and out to draw the arms, which adds some thirty corners to cut. Both halves are cut from the same template. The right angles have to look right, so use sharp scissors and cut all the way into each corner.'
	},
	plus3: {
		da: 'Det samme korsmotiv gentaget over hele fladen, så røde og hvide plusser griber ind i hinanden. Fem striber i hver halvdel og lige klip hele vejen, men knap halvtreds hjørner at følge. Begge halvdele klippes efter samme skabelon. Mønsteret går kun op, hvis over-under-rytmen holder hele vejen, så tæl efter for hver stribe, du fletter.',
		en: 'The same cross motif repeated across the whole field, so red and white crosses interlock. Five strips in each half and straight cuts throughout, but close to fifty corners to follow. Both halves are cut from the same template. The pattern only comes out right if the over-under rhythm holds all the way, so count again after every strip you weave.'
	},
	'amy-weave-1': {
		da: 'Et åbent felt i midten, rammet ind af brede bånd og rækker af små tern. Halvdelene har hvert sit antal striber, otte og syv, og bredden veksler fra stribe til stribe; klippene er lige på nær et par bløde buer. Fordi de to sider ikke er ens, hører der en skabelon til hver. Der er ingen knæk at ramme, så klipningen er ligetil, og det er flettingen, der tager tid.',
		en: 'An open field in the middle, framed by wide bands and rows of small checks. The two halves carry different strip counts, eight and seven, and the widths change from strip to strip; the cuts are straight apart from a couple of soft curves. Because the sides are not alike, each gets its own template. There are no corners to hit, so the cutting is straightforward and it is the weaving that takes the time.'
	},
	'amy-weave-2': {
		da: 'En ramme af blokke i aftagende størrelse omkring et tomt midterfelt. Otte striber i hver halvdel, alle klippet som lige linjer i skiftende bredde, og halvdelene er spejlvendte, så én skabelon dækker begge. Klipningen er nem, men otte striber giver en lang fletning, så sæt god tid af.',
		en: 'A frame of blocks in decreasing size around an empty middle. Eight strips in each half, all cut as straight lines of changing width, and the halves mirror each other, so one template covers both. The cutting is easy, but eight strips make for a long weave, so set aside the time.'
	},
	'amy-rosette': {
		da: 'En rosette: fire hvide kronblade i midten, omgivet af røde felter med runde kanter. Fem striber i hver halvdel, og de fleste klip er buer, som giver bladene deres form. Halvdelene er spejlvendte, og én skabelon dækker begge. Buerne er dybe, så klip dem med en spids saks, og undgå at trække i papiret undervejs.',
		en: 'A rosette: four white petals at the centre, surrounded by red fields with rounded edges. Five strips in each half, and most of the cuts are curves, which is what gives the petals their shape. The halves mirror each other, and one template covers both. The curves run deep, so cut them with pointed scissors and avoid pulling on the paper.'
	},
	'amy-pattern': {
		da: 'Klokkeformer i hvidt og rødt, sat sammen om en firdelt midte og rammet ind af små tern. Syv striber i hver halvdel, og næsten alle klip er buer. Halvdelene er spejlvendte, så der er kun én skabelon. Sværhedsgraden er svær; de smalle buede felter er lettere at klippe, hvis papiret er glat og ikke for tykt.',
		en: 'Bell shapes in white and red, gathered around a four-part centre and framed by small checks. Seven strips in each half, and nearly every cut is a curve. The halves mirror each other, so there is only one template. It is rated hard; the narrow curved fields are easier to cut if the paper is smooth and not too thick.'
	},
	'amy-flowering': {
		da: 'En blomst med spidse kronblade, der folder sig ud fra midten i fire retninger. Syv striber i hver halvdel, og de fleste klip er lange buer uden et eneste knæk. Halvdelene er spejlvendte, og én skabelon dækker begge. Buerne løber næsten fra kant til kant, så klip dem i ét træk; en afbrudt bue kan ses tydeligt i det færdige hjerte.',
		en: 'A flower with pointed petals opening from the centre in four directions. Seven strips in each half, and most of the cuts are long curves without a single corner. The halves mirror each other, and one template covers both. The curves run almost from edge to edge, so cut each in one stroke; a broken curve is easy to spot in the finished heart.'
	},
	'amy-pinecone': {
		da: 'Et gitter af små ruder, der drejer rundt om et åbent, rundt midterfelt. Syv striber i hver halvdel, klippet som lange, jævne buer uden et eneste knæk. Halvdelene er spejlvendte, så der er kun én skabelon. Buerne er enkle at klippe, men gitteret gør striberne smalle på tværs af midten, så brug fast papir.',
		en: 'A lattice of small diamonds turning around an open, round field at the centre. Seven strips in each half, cut as long even curves without a single corner. The halves mirror each other, so there is only one template. The curves are simple to cut, but the lattice leaves the strips narrow across the middle, so use firm paper.'
	},
	alhambra: {
		da: 'Et mønster inspireret af flisemønstrene i Alhambra: røde og hvide møllefigurer, der griber ind i hinanden over hele fladen. Seks striber i hver halvdel, alle klip lige, men med mange skarpe hjørner. Halvdelene er spejlvendte, og én skabelon dækker begge. Hjørnerne har det med at hænge fast under flettingen, så hjertet er ikke det første, man skal give sig i kast med.',
		en: 'A pattern inspired by the tilings of the Alhambra: red and white pinwheel figures interlocking across the whole field. Six strips in each half, every cut straight, but with a lot of sharp corners. The halves mirror each other, and one template covers both. The corners tend to snag while weaving, so this should not be your first braiding project.'
	},
	squares: {
		da: 'To store røde firkanter med et hvidt hul i midten, sat over for to små røde ruder. Kun to striber i hver halvdel, det laveste antal i galleriet, men hver stribe knækker mange gange for at tegne kvadraterne. Halvdelene er ikke ens, så der hører en skabelon til hver side. Klipningen går hurtigt; det er flettingen, der kræver koncentration, fordi de brede striber skal krydses i den rigtige rækkefølge.',
		en: 'Two large red squares with a white hole in the middle, set against two small red diamonds. Only two strips in each half, the lowest count in the gallery, but each strip turns many times to draw the squares. The halves are not alike, so each side has its own template. The cutting goes quickly; it is the weaving that takes concentration, because the wide strips have to cross in the right order.'
	},

	// Figurer
	juletrae: {
		da: 'Et rødt grantræ med stamme i et hvidt felt, rammet ind af diagonale bånd og små ruder. Fire striber i hver halvdel, og næsten alle klip er lige; grenspidserne er de eneste steder, hvor saksen skal vende. Halvdelene er spejlvendte, og én skabelon dækker begge. Grenspidserne er de smalleste steder i hjertet, og en saks med skarp spids gør dem lettere at ramme.',
		en: 'A red fir tree with a trunk in a white field, framed by diagonal bands and small diamonds. Four strips in each half, and nearly every cut is straight; the branch tips are the only places where the scissors have to turn. The halves mirror each other, and one template covers both. Those tips are the narrowest parts of the heart, and sharp-pointed scissors make them much easier to hit.'
	},
	flower: {
		da: 'En blomst med seks spidse kronblade omkring en lille stjerneformet kerne. Fire striber i hver halvdel, og omkring halvdelen af klippene er buer, der former bladenes sider. Halvdelene er spejlvendte, og én skabelon dækker begge. Kronbladene mødes i en spids; klip de to buer, der danner hver spids, i samme arbejdsgang, så de mødes præcist.',
		en: 'A flower with six pointed petals around a small star-shaped core. Four strips in each half, and about half the cuts are curves that shape the sides of the petals. The halves mirror each other, and one template covers both. The petals meet at a point, so cut the two curves that form each point in one go and they will meet cleanly.'
	},
	venus: {
		da: 'Venus-tegnet, cirklen med korset under, tegnet med tynde streger inde i en rund ramme og omgivet af små tern. Syv striber i hver halvdel, og en tredjedel af klippene er buer. Halvdelene er spejlvendte, så der er kun én skabelon. Symbolets streger er smalle i forhold til stribebredden, og det er dem, der gør hjertet til en ekspertopgave; brug fast papir, så de ikke rives over under flettingen.',
		en: 'The sign of Venus, a circle with a cross beneath it, drawn in thin lines inside a round frame and surrounded by small checks. Seven strips in each half, and a third of the cuts are curves. The halves mirror each other, so there is only one template. The lines of the symbol are narrow next to the strip width, and they are what makes this an expert heart; use firm paper so they do not tear while weaving.'
	},
	angel: {
		da: 'Et klassisk englemotiv: en hvid engel med udbredte vinger på rød bund. Kun tre striber i hver halvdel, men tre fjerdedele af klippene er buer, der former vinger, kjole og hoved. Halvdelene er spejlvendte, og én skabelon dækker begge. De få brede striber gør flettingen hurtig; det er buerne omkring hovedet, der kræver den roligste hånd.',
		en: 'A classic angel motif: a white angel with spread wings on a red ground. Only three strips in each half, but three quarters of the cuts are curves that shape the wings, the gown and the head. The halves mirror each other, and one template covers both. Few, wide strips make the weaving quick; it is the curves around the head that need the steadiest hand.'
	},
	snowflake: {
		da: 'Et hvidt snefnug med afrundede arme omkring en lille rød kerne. Fire striber i hver halvdel, og to tredjedele af klippene er buer, som giver armene deres runde ender. Halvdelene er spejlvendte, og én skabelon dækker begge. Armene ender i smalle tappe, der let bøjer, så et lidt kraftigere papir holder formen bedre.',
		en: 'A white snowflake with rounded arms around a small red core. Four strips in each half, and two thirds of the cuts are curves, which is what rounds off the ends of the arms. The halves mirror each other, and one template covers both. The arms end in narrow tabs that bend easily, so slightly heavier paper holds the shape better.'
	},
	santa: {
		da: 'En julemand i fuld figur med hue og skæg, tegnet i rødt inde i en rund ramme og omgivet af tern. Figuren er den mest detaljerede i galleriet: fem striber i hver halvdel, men over to hundrede kurvestykker at klippe efter, og to tredjedele af dem er buer. Halvdelene er forskellige, så hjertet har to skabeloner. Det kræver god præcision ved klip, og en saks med kort blad giver bedst kontrol over detaljerne.',
		en: 'A full-length Father Christmas with hat and beard, drawn in red inside a round frame and surrounded by checks. The figure is the most detailed in the gallery: five strips in each half, but over two hundred curve sections to cut along, two thirds of them true curves. The halves differ, so the heart comes with two templates. It needs real precision in the cutting, and short-bladed scissors give the best control over the detail.'
	},

	// Hjerter
	'triple-heart': {
		da: 'Et stort stribet hjerte tegnet inde i selve julehjertet, med et lille hvidt hjerte i bunden af det. Seks striber i hver halvdel; godt en tredjedel af klippene er buer, som danner hjerternes rundinger, og resten er lige. Halvdelene er spejlvendte, og én skabelon dækker begge. Det er buerne øverst, der afgør, om de to indre hjerter bliver symmetriske.',
		en: 'A large striped heart drawn inside the woven heart itself, with a small white heart at the foot of it. Six strips in each half; a good third of the cuts are curves that form the rounded tops, and the rest are straight. The halves mirror each other, and one template covers both. It is the curves at the top that decide whether the two inner hearts come out symmetrical.'
	},
	h4h2: {
		da: 'En variation af det klassiske mor-og-barn-hjerte, hvor et lille hjerte ligger inde i et større, tegnet i grove, trinvise felter. Fire striber i hver halvdel; de fleste klip er lige, og kun hjerternes rundinger kræver buer. De to halvdele er ikke ens, så der hører en skabelon til hver side. Sværhedsgraden er mellem, og de brede striber gør det let at se, om over-under-rytmen holder.',
		en: 'A variation on the classic mother-and-child heart, with a small heart sitting inside a larger one, drawn in coarse stepped fields. Four strips in each half; most of the cuts are straight, and only the rounded tops call for curves. The two halves are not alike, so each side has its own template. It is rated medium, and the wide strips make it easy to see whether the over-under rhythm is holding.'
	},
	'nemt-hjerte': {
		da: 'Et lille rødt hjerte midt i et 3 × 3-felt af skiftevis røde og hvide firkanter. Tre striber i hver halvdel, og kun to af klippene er buer; resten er lige linjer. Halvdelene er spejlvendte, og én skabelon dækker begge. Det er en af de letteste skabeloner i galleriet og velegnet, hvis det er første gang, du fletter.',
		en: 'A small red heart in the middle of a 3 × 3 field of alternating red and white squares. Three strips in each half, and only two of the cuts are curves; the rest are straight lines. The halves mirror each other, and one template covers both. It is one of the easiest templates in the gallery and a good place to start if you have not woven one before.'
	},
	lilje1: {
		da: 'Spejderliljen tegnet i rødt på hvid bund, med brede røde bånd på kryds bag den. Fem striber i hver halvdel, og knap halvdelen af klippene er buer, som former de tre blade. Halvdelene er spejlvendte, og én skabelon dækker begge. Bladene er smalle, hvor de mødes; klip buerne i lange, ubrudte træk, så kanten ikke bliver takket.',
		en: 'The scout lily drawn in red on white, with wide red bands crossing behind it. Five strips in each half, and just under half the cuts are curves that shape the three leaves. The halves mirror each other, and one template covers both. The leaves are narrow where they meet, so cut the curves in long unbroken strokes and the edge will not come out jagged.'
	},
	lilje2: {
		da: 'En større udgave af spejderliljen med flere detaljer i bladene og et felt af tern omkring. Syv striber i hver halvdel, og to femtedele af klippene er buer. Halvdelene er spejlvendte, så der er kun én skabelon. Sværhedsgraden er ekspert: mange af felterne er smallere end en stribe, og de tåler ikke, at papiret trækkes skævt under klipningen.',
		en: 'A larger version of the scout lily with more detail in the leaves and a field of checks around it. Seven strips in each half, and two fifths of the cuts are curves. The halves mirror each other, so there is only one template. It is rated expert: many of the fields are narrower than a strip, and they will not survive the paper being pulled out of shape while you cut.'
	}
};

/** The written paragraph for a gallery heart, or `null` for any other heart. */
export function heartDescription(id: string, lang: Language): string | null {
	return HEART_DESCRIPTIONS[id]?.[lang] ?? null;
}
