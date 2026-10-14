# Growth Mode Asset Library

## Current delivery

Transparent **SVG icons** in `public/assets/growth/icons/`: `flag-start`, `flag-finish`, `trophy`, `paw`, `leaf`, `book`, `star`, `heart`, `check`, `milestone-node`, `sparkle`, and `pin`.

Each icon uses a 48×48 viewBox, transparent background, and a restrained palette coordinated with the growth dashboard (green, warm yellow, indigo-blue, coral, lilac). The files are individually editable and do not depend on fonts or external images.

## Additional vector assets

Seven further transparent SVGs have been added: `paths/growth-route.svg`, `decorations/{grass,tree,cloud,paw-trail}.svg`, and `cards/{companion-card,goal-card}.svg`. These are lightweight, standalone vectors and can be used as visual building blocks. The growth route is a static illustration; its progress nodes must be rendered dynamically by application code for real calendar dates.

## Important status

The illustrated cats and detailed seasonal landscapes in the generated concept sheets **have not passed production quality assurance**. The sheets have printed labels, checkerboard patterns baked into pixels, and overlapping content. Cropping or deleting near-white pixels would not reliably produce clean, transparent assets. **Do not deploy the concept sheets or automatically cropped sprites as production art.**

Those illustrations require separate redraw / alpha-matte inspection at full resolution before publishing. The GitHub branch currently contains 19 standalone SVG component assets, not the complete illustrated PNG collection. No application code has been modified.

## Integration

Reference as `/assets/growth/icons/flag-start.svg` (and similarly for other icons) in a web app serving `public/` statically. Do not hardcode paths into existing app screens until the integration is tested.

## Acceptance checklist for remaining art

- Clean alpha channel with no checkerboard or solid background pixels
- No adjacent sprites, text labels, or cut-off limbs
- Correct original mascot proportions and consistent outline widths
- Legible at actual rendered size and on light/dark surfaces
- Optimized file sizes and documented asset names
- Visual review and build checks before merging

## QA boundary

These SVGs have been checked structurally for standalone viewBox, valid SVG markup and no embedded bitmap or external resources, but **have not been visually regression-tested in the running app**. They are candidates for production integration, not a completed release. The cat artwork still needs consistent redraw and human review before it can be described as production-ready.

## Mascot and seasonal vector additions

Eight mascot SVGs in `characters/` use a shared cat body and face geometry: `cat-walk`, `cat-flag`, `cat-read`, `cat-cheer`, `cat-sleep`, `cat-love`, `cat-study`, `cat-celebrate`. These are new simplified vector redraws, **not pixel-faithful replicas** of the concept artwork. Four seasonal SVGs in `seasons/` are `spring`, `summer`, `autumn`, `winter` (800x320 viewBox). Seasonal compositions use the same landscape geometry with palette variations, not four detailed hand-painted illustrations.

**Review required before release:** visually inspect each rendered SVG, verify character silhouette and prop overlaps, contrast and accessibility, mobile rendering, and actual UI screenshots. No runtime build or visual regression test was executed as part of this asset-only commit.
