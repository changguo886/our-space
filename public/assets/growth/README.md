# Growth Mode Asset Library

## Current delivery

Production-oriented, transparent **SVG icons** in `public/assets/growth/icons/`: `flag-start`, `flag-finish`, `trophy`, `paw`, `leaf`, `book`, `star`, `heart`, `check`, `milestone-node`, `sparkle`, and `pin`.

Each icon uses a 48×48 viewBox, transparent background, and a restrained palette coordinated with the growth dashboard (green, warm yellow, indigo-blue, coral, lilac). The files are individually editable and do not depend on fonts or external images.

## Important status

The illustrated cats, decorative landscapes, and winding paths in the generated concept sheets **have not passed production quality assurance**. The sheets have printed labels, checkerboard patterns baked into pixels, and overlapping content. Cropping or deleting near-white pixels would not reliably produce clean, transparent assets. **Do not deploy the concept sheets or automatically cropped sprites as production art.**

Those illustrations require separate redraw / alpha-matte inspection at full resolution before publishing. The GitHub branch currently contains the approved-style SVG component subset, not the complete illustrated PNG collection. No application code has been modified.

## Integration

Reference as `/assets/growth/icons/flag-start.svg` (and similarly for other icons) in a web app serving `public/` statically. Do not hardcode paths into existing app screens until the integration is tested.

## Acceptance checklist for remaining art

- Clean alpha channel with no checkerboard or solid background pixels
- No adjacent sprites, text labels, or cut-off limbs
- Correct original mascot proportions and consistent outline widths
- Legible at actual rendered size and on light/dark surfaces
- Optimized file sizes and documented asset names
- Visual review and build checks before merging
