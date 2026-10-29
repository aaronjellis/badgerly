# Badgerly design

Badgerly is a browser tool that makes badges, placards, and nameplates for a laser cutter or a 3D printer. You set a size and shape, add text in any Google Font, add an inset border and graphics, and export a file that goes straight into xTool Studio or a slicer with no cleanup.

The name is Badgerly. The app icon and favicon are a badger face: a simple flat mark drawn as SVG in the app's accent and ink colors, with the two white face stripes doing the recognizing. The same mark sits beside the wordmark in the app bar, replacing Kerfuffle's lucide icon there.

## Intent

Making a 4 by 2 inch placard today means opening licensed design software, finding a font, drawing the shape, adding strokes, unioning the letters so their strokes don't collide, exporting, importing into xTool Studio, and prepping the cut file. xTool Studio's own unions are awkward, and its offset border around text leaves holes inside letters. For 3D printing it means CAD software with few fonts, poor SVG import, and chamfers and fillets that fail without saying why.

Badgerly does the geometry that makes those steps hard: unions, offsets, inset strokes, extrusions, and edge treatments. The person only decides what the badge looks like.

## Goals

- A badge from blank to exported file in a couple of minutes, in a browser, with no account and no install.
- Exports that need no cleanup: layered SVG for the laser with one group per operation and per material, and STL for the slicer with no visible stepping on curves.
- Text in any Google Font, chosen from a picker that shows every family in its own face.
- The same UI language as Kerfuffle, so the two feel like siblings.

## Non-goals

- A general vector editor. There is no path editing, no boolean tool, no pen.
- Raster tracing. A PNG stays a picture.
- Batch badges from a name list. One badge per project in this version.
- Accounts, cloud storage, or sharing. Projects save as local files.
- A PDF or DXF export. SVG covers the laser; this can be added later as Kerfuffle did.
- An xTool `.xcs` project export. Kerfuffle's exporter is reverse-engineered and fragile; it can be ported later behind a flag.

## Anti-goals

These would make Badgerly a failure even if everything else worked.

- A die-cut border with holes inside letters, or any export that needs a union fixed by hand.
- Visible stepping on curved edges in a sliced STL.
- A chamfer or fillet that fails, or silently produces a different edge than asked for.
- Letter strokes that collide or overlap in the laser file.
- A tool that feels like CAD: technical, modal, with a hundred controls.

## How it gets made

These are my calls, made to match Kerfuffle unless noted.

- **Stack.** Vite, React 18, TypeScript, Vitest. `lucide-react` icons. `three` for the 3D preview. `harfbuzzjs` (HarfBuzz as WebAssembly) for text shaping and glyph outlines and `clipper2-js` for unions, offsets, and clipping. No other UI libraries. The Vite config carries Kerfuffle's HarfBuzz settings (`target: 'es2022'`, the `optimizeDeps` exclusion).
- **Look.** Copy Kerfuffle's `tokens.css`, `app.css`, `controls.css`, `phone.css`, and its `Field`, `Segmented`, `Switch`, `NumberField`, `Section`, `Inspector`, `AppBar`, `ExportMenu`, and `ProjectMenu` components as a starting point. Change the accent hue so the two apps are siblings, not clones. The 2D stage stays dark as in Kerfuffle.
- **Font pipeline.** Ported from Kerfuffle's in-progress text outline work: `hbFont.ts` (HarfBuzz shaping, so kerning, ligatures, and the contextual joins of script fonts come out as the browser draws them), `fontSource.ts` (each family's real weights and styles and its TTF files from Fontsource, which needs no API key), `textOutline.ts` (glyph outlines laid out per line, flattened to a tolerance, unioned non-zero with Clipper2, simplified), and `textPlacement.ts`. The family list comes from the Fontsource list API filtered to Google families with a Latin subset, giving every family with its category, weights, and styles. Preview rendering uses the Google Fonts CSS API. Kerfuffle's TTF test fixtures keep the tests offline. The port copies the files rather than depending on Kerfuffle, since the two repos deploy on their own.
- **Geometry.** Everything is computed in millimeters as polygon sets in Clipper2 integer space at 1/1000 mm. Shapes are generated analytically and flattened to a curve tolerance; the preview uses a coarse tolerance and exports use a fine one (0.01 mm). Offsets use round joins so inset strokes stay concentric with rounded corners. Text and SVG graphics become polygon sets through the same pipeline, so every element can be unioned, offset, and clipped the same way.
- **3D construction.** The model is prismatic (2.5D). The builder constructs every mesh from polygon sets and caps rather than from 3D booleans: the plate is an extrusion of the outline, the edge treatment is a loft between successive inset rings, and emboss and deboss are walls and caps on polygons unioned into or subtracted from the top cap in 2D. This avoids a CSG library and makes every export watertight by construction. STL is binary.
- **Repo and hosting.** Its own GitHub repository, as Kerfuffle is, served at `labs.aaronjellis.com/badgerly` through a labs wrapper folder in the `aaronjellis.com` repo that checks it out as a submodule. The app ships the same `analytics.js` and feedback-widget tags Kerfuffle does, labeled for this app. In scope: the local git repository (initialized with this document), the GitHub remote `aaronjellis/badgerly` created with `gh`, and the labs wrapper folder made from the labs `_template` and `new-project.sh` with `labs.json` marked `draft` until the person removes it. The first deploy is the person's call.
- **Units.** A millimeter and inch toggle in the app bar as in Kerfuffle. The default is inches, since badge sizes are usually spoken in inches. The choice is remembered.
- **Project file.** A `.badge` JSON file with every setting and the uploaded graphics embedded as data URLs, with New, Open, and Save in a Project menu as in Kerfuffle.

## What the person sees

The frame is Kerfuffle's: an app bar on top, a stage on the left, and an inspector on the right. On a phone the inspector becomes a sheet, as in Kerfuffle.

**App bar.** The wordmark and Project menu; a segmented control for what the badge is made for: **3D print** or **Laser**; the unit toggle; and Export.

**Stage.** A 2D drawing of the badge, 1:1 aspect, with the elements drawn in place. Elements are dragged here. In the 3D print mode a toggle shows a 3D preview of the plate with its relief, lit, orbitable, built from the same geometry as the STL. In laser modes the stage can show the layout as it exports: the backing and each top layer side by side, colored by operation (cut, score, engrave, print) using Kerfuffle's stage colors.

**Inspector.** Numbered steps, each a collapsible section, in this order:

1. **Shape and size.** Width, height, and the shape. Shape-specific controls appear under it: corner radius, chamfer size, cutout radius, scallop size, or the depth of a bracket or wave. One more choice is **Border around the lettering**: no background shape; the badge outline is the union of all elements offset outward by a width you set, with every enclosed hole dropped so counters never become holes. When the offset leaves more than one island (two lines of text far apart, or a graphic away from the text), the islands are bridged by a morphological close: offset outward by a bridging distance and back inward by the same, with the distance found by doubling from the border width until the result is one piece, capped at the badge's shorter dimension. The stage shows the result, and the inspector warns if the cap is hit and the badge is still in pieces. The shape stays a single clean outline, which is the point of this option.
2. **Border.** An inset stroke: off, single, double, dashed, or corner art. Inset distance from the edge, line width, the gap between double lines, dash length and gap, corner motif and its size. In 3D print mode the border is a relief like any element: emboss or deboss with its own height, and it must sit within the flat area inside the edge treatment (the inset distance is clamped to at least the edge treatment's size). In the multi-color split, an embossed border becomes drop-in parts like the lettering; a dashed border means many small parts, and the inspector says so.
3. **Text and graphics.** The element list with Add text and Upload graphic. The selected element's controls: text, font (opens the picker), weight and style, size, letter spacing, line height, alignment, rotation, position, and the element's role in the current mode.
4. **Layers** (laser, stacked only) or **Relief** (3D print only). Described under the modes.
5. **Export.** The format choices and their options.

A settings search above the steps filters controls by name, as in Kerfuffle.

### The font picker

A full-height panel over the inspector (a sheet on a phone). Rendering a family in the picker uses the CSS API; the TTF for shaping is fetched only once a family is chosen. It lists every Google family, each tile showing the family name set in that face above a sample line in that face. The sample is the selected text element's first line, so you see your own words. Category chips (sans, serif, display, handwriting, monospace), a search box, and a **Recent** row at the top. Tiles load their fonts as they scroll into view, in batches, so the list opens at once and never blocks. Clicking a tile applies the family and keeps the panel open; a Done button or clicking outside closes it. After a family is chosen, the weight and style chips show only what that family has.

### Elements and dragging

Text and graphics are free elements on the badge. Dragging moves them; handles on the selection scale them, with proportions kept. While dragging, guides appear for the badge's horizontal and vertical center lines, the inset stroke's inner edge, the badge's edges, and other elements' edges and centers, and the element snaps to them within a few screen pixels. The snap box is the element's ink bounds (the merged outline's bounding box), not the font's line box, so caps align by their visible top and bottom. Arrow keys nudge by 0.1 mm (0.01 in), with Shift for ten times that. The inspector shows the position and size for typing exact values. Snap to center buttons as in Kerfuffle's artwork section are also present.

Text is multi-line. A text element has family, weight, style, size (the cap height in the chosen unit, so a number means a visible height), letter spacing, line height, alignment, and rotation. Letter spacing applies to the whole element. On top of it, any single pair can be kerned: clicking between two letters on the stage (or stepping through pairs with the keyboard while the text is selected) shows a gap handle, and dragging it or pressing the arrow keys moves everything after that pair. Pair adjustments are stored per text element in em units, so they survive a size change, and a Reset kerning button clears them. The font's own kerning stays on underneath. The text is unioned per line as Kerfuffle's text outline does, so overlapping letters and script joins become one clean shape.

Graphics are SVG or PNG. An SVG becomes polygon sets (its filled paths unioned; strokes are not converted in this version, and the person is told when an SVG has only strokes). A PNG stays a picture and is only available for engrave and print roles.

Corner art ships with a small set of built-in motifs in a deco and geometric style (a fan, a stepped corner, a bracket, a plain L, a curl, a dot cluster) drawn as SVG and scaled to the size you set; one motif is mirrored into each corner and the border line runs between them with a small gap. You can also upload a corner SVG.

## The modes

### Laser

A second segmented control at the top of the inspector chooses the laser variant: **Single material**, **Stacked**, or **Print and cut**.

**Single material.** One sheet. The badge outline is a cut. Each element has a role: **Engrave** (a filled shape), **Score** (an outline), or **Cut out** (subtracted from the badge; the person is warned when a cut-out leaves a floating island such as the inside of an O). The inset stroke is a score for single and dashed styles, or an engrave when it has a width or is doubled; corner art engraves. Export is one SVG with groups named `cut`, `score`, and `engrave` in Kerfuffle's three colors.

**Stacked.** A backing and one or more top layers, each with a material name and thickness, listed in the Layers step. The backing is the badge shape. Each element is assigned to a layer. Top layer elements are cut pieces of that layer's material, glued onto the backing. The export is one SVG with one group per layer, laid out side by side with a gap so each group can be dragged onto its own sheet in the laser software: the backing group holds its cut outline, its inset stroke as a score, and a score outline of every top piece where it lands, so glue-up is position-by-score. Each top layer group holds only its cuts. Elements left on the backing itself engrave or score as in single material.

**Print and cut.** Single material plus an optional color print pass, for the xTool M2 print and cut. Each graphic or text element can be toggled **Print in color**; those elements go into a `print` group with their fill colors and are left out of the engrave group. Everything else behaves as single material. The group structure matches Kerfuffle's xTool Studio print and cut preset. This is an option for the occasional badge, not the main path.

Every laser SVG is 1:1 in millimeters with a `viewBox` in millimeters, each piece in its own named group, and paths as polylines at the export tolerance.

### 3D print

The badge is a plate. The Relief step has:

- Plate thickness.
- Edge treatment on the top edge: none, chamfer, or fillet, with a size. The builder makes the fillet a smooth loft, not a stack of slabs (see "3D construction"). The treatment is clamped so it can never exceed what the shape allows, and the control says so when it is clamped rather than failing.
- A relief per element: **Emboss** (raised) or **Deboss** (recessed), with a height or depth. Elements must sit within the flat area inside the edge treatment; the stage shows the flat area's edge as a guide and warns when an element crosses it.
- **Multi-color split**, off by default. On, the export is two STLs: the plate with a recess shaped like every embossed element, and the embossed elements themselves as a flat set of parts sized to drop into the recess. Recess depth and the fit clearance are settings, defaulting to 0.6 mm and 0.1 mm. The clearance is applied by offsetting the recess outward, so the parts keep the lettering's true shape.

The 3D preview on the stage is built from the same meshes as the STL. Warnings appear in the inspector for features thinner than a common nozzle (under 0.5 mm) and for embossed parts with no base contact.

STL exports are binary, in millimeters, with the plate lying flat on the bed, and are watertight.

## Export step

- **Laser:** one SVG per project in every laser variant; in stacked mode its layers are separate named groups side by side. A hint under the button says which group is which, as Kerfuffle does.
- **3D print:** one STL, or two when the split is on.
- Export file names come from the project name.

## Preview and export resolution

The stage renders at a coarse curve tolerance for speed. Exports flatten at 0.01 mm. The fillet loft uses enough rings that no facet steps by more than 0.02 mm. The builder should verify this in a slicer on a 2 mm fillet.

## What is left to the builder

- The polygon zipper that lofts between offset rings, and the fallback when an offset changes the ring count.
- The earcut or equivalent used to cap polygons with holes.
- How the family list is cached between visits.
- The exact set of shapes' secondary parameters and their default values; the defaults should give a good-looking badge without touching them.
- The corner motif drawings.
- The test plan. Geometry functions get unit tests with the WOFF fixtures; the die-cut border test asserts that the result has no holes; the STL test asserts the mesh is closed.

## Open questions

Any question only the person can answer, found by the builder check, is listed here with the answer once given.
