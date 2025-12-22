export const translations = {
  da: {
    // Site
    siteTitle: 'Juleflet.dk',
    siteDescription: 'Velkommen til min hjemmeside med skabeloner til julefletning! Design dine egne mønstre, print dem ud, og god fornøjelse med julefletningen!',

    // Categories
    categoryKlassiske: 'Klassiske',
    categoryStjerner: 'Stjerner',
    categoryFigurer: 'Figurer',
    categoryMoenstre: 'Mønstre',
    categoryHjerter: 'Hjerter',
    categoryMine: 'Mine Hjerter',

    // Gallery
    createNewHeart: 'Lav Nyt Hjerte',
    printSelected: 'Hent Skabeloner',
    generating: 'Genererer...',
    loadingHearts: 'Indlæser hjerter...',
    noHeartsYet: 'Ingen hjertedesigns endnu!',
    clickCreateNew: 'Klik "Lav Nyt Hjerte" for at designe dit første hjerte.',
    pdfLayout: 'PDF Layout',
    layoutSmall: 'Små (16 per side)',
    layoutMedium: 'Mellem (9 per side)',
    layoutLarge: 'Store (4 per side)',
    select: 'Vælg',
    selected: '✓ Valgt',
    details: 'Detaljer',
    private: 'Privat',
    delete: 'Slet',
    deleteHeartTitle: 'Slet hjerte?',
    deleteHeartPrompt: 'Er du sikker på at du vil slette dette hjerte? Dette kan ikke fortrydes.',
    selectHeartsFirst: 'Vælg hjerter først',

    // Heart detail
    backToGallery: '← Tilbage til Galleri',
    loadingTemplate: 'Indlæser skabelon...',
    heartNotFound: 'Hjertedesign ikke fundet',
    failedToLoad: 'Kunne ikke indlæse hjertedesign',
    by: 'af',
    publisher: 'Udgiver',
    source: 'Kilde',
    date: 'Dato',
    gridSize: 'Gitterstørrelse',
    difficulty: 'Sværhedsgrad',
    difficultyEasy: 'Let',
    difficultyMedium: 'Mellem',
    difficultyHard: 'Svær',
    difficultyExpert: 'Ekspert',
    symmetry: 'Symmetri',
    symmetricCurves: 'Symmetriske kurver',
    symmetricLobes: 'Symmetriske lapper',
    mirrorSymmetry: 'Spejlsymmetri',
    noSymmetry: 'Ingen symmetri',
    classic: 'Klassisk',
    downloadPdfTemplate: 'Download PDF Skabelon',
    openInEditor: 'Rediger',
    share: 'Del',
    copied: 'Kopieret!',
    failed: 'Fejl',
    template: 'Skabelon',
    templateLeft: 'Skabelon (Venstre)',
    templateRight: 'Skabelon (Højre)',
    photo: 'Foto',
    howToMake: 'Sådan gør du',
    instructions: [
      'Print skabelonen i 100% størrelse på A4 papir',
      'Klip hver halvdel ud langs de solide ydre linjer',
      'Fold hvert stykke på midten langs den stiplede linje',
      'Klip langs de buede linjer for at lave striberne',
      'Flet de to halvdele sammen, skiftevis over og under'
    ],

    // Editor
    editHeart: 'Rediger Hjerte',
    createNewHeartTitle: 'Lav Nyt Hjerte',
    heartDetails: 'Hjerte Detaljer',
    name: 'Navn',
    author: 'Forfatter',
    yourName: 'Dit navn',
    description: 'Beskrivelse',
    optionalDescription: 'Valgfri beskrivelse...',
    actions: 'Handlinger',
    saveChanges: 'Gem Ændringer',
    showInGallery: 'Vis i Galleri',
    download: 'Download',
    import: 'Importer',
    cancel: 'Annuller',
    yes: 'Ja',
    no: 'Nej',
    myHeart: 'Mit Hjerte',
    copy: '(Kopi)',
    importedHeart: 'Importeret Hjerte',
    invalidHeartFile: 'Ugyldig hjertedesign fil',
    saveBeforeLeavePrompt: 'Gem dine ændringer før du forlader siden?',

    // Editor help
    helpOpenAriaLabel: 'Hjælp',
    helpCloseAriaLabel: 'Luk',
    helpTitle: 'Sådan designer du flettede papirhjerter',
    helpSectionWhatAreTitle: 'Hvad er flettede papirhjerter?',
    helpSectionWhatAreText:
      'Flettede papirhjerter (dansk: <em>julehjerter</em>) er en traditionel skandinavisk juledekoration. To papirhalvdele flettes sammen til en hjerteformet kurv, der kan fyldes med godter eller pynt.',
    helpSectionBasicStructureTitle: 'Grundstruktur',
    helpSectionBasicStructureText:
      'Hvert hjerte består af to <strong>lapper</strong> (venstre og højre), som flettes sammen i midten. Kurverne du ser, er <strong>grænserne</strong> mellem papirstrimler. Træk i kurverne for at ændre formen, eller træk fra kanterne for at tilføje nye strimler.',
    helpSectionEditingCurvesTitle: 'Redigering af kurver',
    helpSectionEditingCurvesBullets: [
      '<strong>Klik på en kurve</strong> for at vælge den og se dens kontrolpunkter',
      '<strong>Træk i ankerpunkter</strong> (diamanter) for at flytte kurvens endepunkter',
      '<strong>Træk i kontrolhåndtag</strong> (cirkler) for at justere kurvens form',
      '<strong>Brug værktøjslinjen</strong> til venstre for at tilføje/slette noder eller ændre nodetyper'
    ],
    helpSectionSymmetryTitle: 'Symmetrimuligheder',
    helpSectionSymmetryIntro: 'Brug symmetripanelet til højre for at håndhæve begrænsninger:',
    helpSectionSymmetryBullets: [
      '<strong>Inden i kurve:</strong> Gør hver kurve symmetrisk omkring sit midtpunkt',
      '<strong>Inden i lap:</strong> Spejler kurver inden for hver lap',
      '<strong>Mellem lapper:</strong> Gør begge lapper identiske (kræver samme gitterstørrelse)'
    ],
    helpSectionSymmetryNote: '<em>Sym</em> = spejlsymmetri, <em>Anti</em> = punktsymmetri (180° rotation)',
    helpSectionRequirementsTitle: 'Krav for hjerter der kan foldes',
    helpSectionRequirementsIntro: 'For at et hjertedesign kan foldes fysisk af papir:',
    helpSectionRequirementsBullets: [
      '<strong>Ingen selvkryds:</strong> Kurver i samme lap må ikke krydse hinanden',
      '<strong>Korrekt fletning:</strong> Striber skal skiftevis ligge over/under ved hvert kryds',
      '<strong>Bløde kurver:</strong> Skarpe knæk kan være svære at folde pænt',
      '<strong>Rimelig kompleksitet:</strong> Flere strimler = sværere at flette i hånden'
    ],
    helpSectionTipsTitle: 'Tips til gode designs',
    helpSectionTipsBullets: [
      'Start med et simpelt gitter (3×3) og eksperimentér',
      'Brug symmetri til at skabe afbalancerede, pæne mønstre',
      'Hold kurverne bløde – undgå stramme zigzag-mønstre',
      'Test dit design ved at downloade PDF\'en og prøve at folde det!'
    ],

    // Footer
    lobeColors: 'Lobe farver',
    leftColor: 'Venstre farve',
    rightColor: 'Højre farve',
    suggestHeart: 'Foreslå hjerte',
    didntFindHeart: 'Har du et yndlingsjulehjerte vi mangler i galleriet?',
    madeBy: '©',

    // Error page
    errorTitle: 'Ups! Noget gik galt',
    errorNotFound: 'Siden blev ikke fundet',
    errorGeneric: 'Der opstod en fejl',
    errorBackHome: 'Tilbage til forsiden'
  },
  en: {
    // Site
    siteTitle: 'Juleflet',
    siteDescription: 'Welcome to my website for woven Christmas heart templates! Design your own patterns, print them out, and enjoy weaving!',

    // Categories
    categoryKlassiske: 'Classic',
    categoryStjerner: 'Stars',
    categoryFigurer: 'Figures',
    categoryMoenstre: 'Patterns',
    categoryHjerter: 'Hearts',
    categoryMine: 'My Hearts',

    // Gallery
    createNewHeart: 'Create New Heart',
    printSelected: 'Print Selected',
    generating: 'Generating...',
    loadingHearts: 'Loading hearts...',
    noHeartsYet: 'No heart designs yet!',
    clickCreateNew: 'Click "Create New Heart" to design your first heart.',
    pdfLayout: 'PDF Layout',
    layoutSmall: 'Small (16 per page)',
    layoutMedium: 'Medium (9 per page)',
    layoutLarge: 'Large (4 per page)',
    select: 'Select',
    selected: '✓ Selected',
    details: 'Details',
    private: 'Private',
    delete: 'Delete',
    deleteHeartTitle: 'Delete heart?',
    deleteHeartPrompt: 'Are you sure you want to delete this heart? This cannot be undone.',
    selectHeartsFirst: 'Select hearts first',

    // Heart detail
    backToGallery: '← Back to Gallery',
    loadingTemplate: 'Loading template...',
    heartNotFound: 'Heart design not found',
    failedToLoad: 'Failed to load heart design',
    by: 'by',
    publisher: 'Publisher',
    source: 'Source',
    date: 'Date',
    gridSize: 'Grid Size',
    difficulty: 'Difficulty',
    difficultyEasy: 'Easy',
    difficultyMedium: 'Medium',
    difficultyHard: 'Hard',
    difficultyExpert: 'Expert',
    symmetry: 'Symmetry',
    symmetricCurves: 'Symmetric curves',
    symmetricLobes: 'Symmetric lobes',
    mirrorSymmetry: 'Mirror symmetry',
    noSymmetry: 'No symmetry',
    classic: 'Classic',
    downloadPdfTemplate: 'Download PDF Template',
    openInEditor: 'Open in Editor',
    share: 'Share',
    copied: 'Copied!',
    failed: 'Failed',
    template: 'Template',
    templateLeft: 'Template (Left)',
    templateRight: 'Template (Right)',
    photo: 'Photo',
    howToMake: 'How to Make',
    instructions: [
      'Print the template at 100% scale on A4 paper',
      'Cut out each half along the solid outer lines',
      'Fold each piece in half along the dashed line',
      'Cut along the curved lines to create the strips',
      'Weave the two halves together, alternating over and under'
    ],

    // Editor
    editHeart: 'Edit Heart',
    createNewHeartTitle: 'Create New Heart',
    heartDetails: 'Heart Details',
    name: 'Name',
    author: 'Author',
    yourName: 'Your name',
    description: 'Description',
    optionalDescription: 'Optional description...',
    actions: 'Actions',
    saveChanges: 'Save Changes',
    showInGallery: 'Show in Gallery',
    download: 'Download',
    import: 'Import',
    cancel: 'Cancel',
    yes: 'Yes',
    no: 'No',
    myHeart: 'My Heart',
    copy: '(Copy)',
    importedHeart: 'Imported Heart',
    invalidHeartFile: 'Invalid heart design file',
    saveBeforeLeavePrompt: 'Save your changes before leaving this page?',

    // Editor help
    helpOpenAriaLabel: 'Help',
    helpCloseAriaLabel: 'Close',
    helpTitle: 'How to Design Paper Hearts',
    helpSectionWhatAreTitle: 'What are Woven Paper Hearts?',
    helpSectionWhatAreText:
      'Woven paper hearts (Danish: <em>julehjerter</em>) are a traditional Scandinavian craft. Two paper pieces are woven together to create a heart-shaped basket that can hold treats or decorations.',
    helpSectionBasicStructureTitle: 'Basic Structure',
    helpSectionBasicStructureText:
      'Each heart consists of two <strong>lobes</strong> (left and right) that interweave in the center. The curves you see are the <strong>boundaries</strong> between paper strips. Drag curves to reshape them, or drag from the edges to add new strips.',
    helpSectionEditingCurvesTitle: 'Editing Curves',
    helpSectionEditingCurvesBullets: [
      '<strong>Click a curve</strong> to select it and see its control points',
      '<strong>Drag anchor points</strong> (diamonds) to move curve endpoints',
      '<strong>Drag control handles</strong> (circles) to adjust curve shape',
      '<strong>Use the toolbar</strong> on the left to add/delete nodes or change node types'
    ],
    helpSectionSymmetryTitle: 'Symmetry Options',
    helpSectionSymmetryIntro: 'Use the symmetry panel on the right to enforce constraints:',
    helpSectionSymmetryBullets: [
      '<strong>Within curve:</strong> Makes each curve symmetric around its center',
      '<strong>Within lobe:</strong> Mirrors curves within each lobe',
      '<strong>Between lobes:</strong> Makes both lobes identical (requires equal grid size)'
    ],
    helpSectionSymmetryNote: '<em>Sym</em> = mirror symmetry, <em>Anti</em> = point symmetry (180° rotation)',
    helpSectionRequirementsTitle: 'Requirements for Foldable Hearts',
    helpSectionRequirementsIntro: 'For a heart design to be physically foldable from paper:',
    helpSectionRequirementsBullets: [
      '<strong>No self-intersections:</strong> Curves within the same lobe must not cross each other',
      '<strong>Proper weaving:</strong> Strips must alternate over/under at each crossing',
      '<strong>Smooth curves:</strong> Sharp angles can be difficult to fold cleanly',
      '<strong>Reasonable complexity:</strong> More strips = harder to weave by hand'
    ],
    helpSectionTipsTitle: 'Tips for Good Designs',
    helpSectionTipsBullets: [
      'Start with a simple grid (3x3) and experiment',
      'Use symmetry to create balanced, pleasing patterns',
      'Keep curves smooth - avoid tight zigzags',
      'Test your design by downloading the PDF and trying to fold it!'
    ],

    // Footer
    lobeColors: 'Lobe colors',
    leftColor: 'Left color',
    rightColor: 'Right color',
    suggestHeart: 'Suggest heart',
    didntFindHeart: "Didn't find the heart you were looking for?",
    madeBy: '©',

    // Error page
    errorTitle: 'Oops! Something went wrong',
    errorNotFound: 'Page not found',
    errorGeneric: 'An error occurred',
    errorBackHome: 'Back to home'
  }
} as const;

export type Language = keyof typeof translations;
export type TranslationKey = keyof typeof translations.en;
