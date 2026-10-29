# Badgerly

Badgerly is a browser app for designing badges and placards for a laser cutter or a 3D printer. You lay out the shape, border and lettering once, then export a laser SVG or an STL. It shows each design as a 2D layout and as a 3D preview built from the same geometry as the export.

It is served at https://labs.aaronjellis.com/badgerly.

## Run it

```bash
npm install
npm run dev      # Start the Vite dev server
npm test         # Run the Vitest unit tests
npm run build    # Typecheck and build to dist
```

## Features

- **Shapes:** Start from a rectangle, rounded rectangle, pill, ellipse, chamfer, corner cut, ticket, double round, scallop, bracket, antique, or wave outline. A hug-text shape wraps a border around the lettering and fills or bridges the holes in it.
- **Borders and corner art:** Add a single, double, dashed, or corners-only border, or place corner art.
- **Text in any Google Font:** Pick from the full Google Fonts catalog in a visual picker that shows your own text in each family. Text is shaped with HarfBuzz and converted to outlines, so the laser and the printer get the same letters you see.
- **Letter spacing and pair kerning:** Adjust tracking for a whole line, or kern a single pair of letters.
- **Drag layout with snapping:** Drag text and graphics on the stage. Elements snap to the badge's center and edges and to the border's inner edge, and the arrow keys nudge a selection.
- **Laser SVG:** Export a single-material, stacked, or print-and-cut layout in millimeters. Cut, score, engrave, and print are named groups, so xTool Studio or LightBurn reads each as its own operation.
- **3D STL:** Export a plate with a chamfered or filleted edge, with emboss (raised) or deboss (sunk) lettering and graphics.
- **Multi-color split:** Split the badge into a plate and parts, with a recess and clearance for each part, and export both as STL files.
- **Units:** Work in inches (the default) or millimeters. Warnings and clamps keep a design printable.

## Exports

- **SVG** is a 1:1 file in millimeters. Cut lines are red, score lines are blue, and engraving is black. Stacked output has one piece for the backing and one for each top layer.
- **STL** is one closed solid in millimeters. The multi-color split downloads two files, the plate and the parts. Your browser may ask you to allow both downloads.

Everything runs in your browser, and nothing uploads. The only network requests are for fonts: the catalog and font files come from Fontsource, and the picker and stage previews load Google Fonts stylesheets.

## Project files

To save your work, open **Project** and click **Save as .badge**. The file holds the badge, its elements (including uploaded graphics), and your units. To load it again, click **Open**. Badgerly asks before it replaces a design that has unsaved changes.

## Credits

- Built on the shell of [Kerfuffle](https://github.com/aaronjellis/kerfuffle), the sibling box maker.
- [HarfBuzz](https://harfbuzz.github.io/) (`harfbuzzjs`) shapes the text.
- [Fontsource](https://fontsource.org/) provides the Google Fonts files and catalog.
- [Clipper2](https://github.com/AngusJohnson/Clipper2) (`clipper2-js`) does the polygon geometry.

## License

MIT. See `LICENSE`.
