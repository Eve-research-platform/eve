# Eve v54 redesign implementation

## Source direction

This build follows the supplied Eve Redesign and Eve design handoff, using the recommended **1a Plum rail** as the workspace shell and collapsing that rail for study work.

## Tokens

The v54 implementation is centralised in `eve-v54-theme.css`. Important role colours:

- `--eve-ink: #241a41`
- `--eve-plum-900: #3a2668`
- `--eve-plum-800: #4f3490`
- `--eve-plum-700: #6544b4`
- `--eve-plum-500: #7c5cd0`
- `--eve-plum-400: #9a7fdc`
- `--eve-plum-300: #c1abee`
- `--eve-plum-250: #d3c6f3`
- `--eve-plum-200: #e7dffa`
- `--eve-plum-100: #f3effc`
- `--eve-ground: #f7f5fb`
- `--eve-desk: #efeaf7`
- `--eve-sage: #7a8a5e`
- `--eve-sage-100: #e4ead6`

## Type and shape

- Display: Caprasimo, 400.
- Interface/body: Figtree, 400/600/700.
- Primary cards: 30px radius.
- Inset rows: 20–24px radius.
- Buttons, chips, filters, inputs, toggles and progress tracks: pill radius.
- Primary button shadow and selected-block shadow use only the handoff values.

## Responsive behaviour

Desktop uses the plum rail. Under 900px the rail disappears and a plum five-item mobile navigation bar is fixed above the safe bottom edge. Builder fixed heights are explicitly removed at mobile widths so vertical study-builder scrolling remains document-based.

## Functional boundary

v54 is a visual/product-composition redesign, not a data migration. The v53.9 APIs, encrypted storage model, Google Drive/SharePoint connectors, Microsoft 365 email, Participant Panel, recordings, Navigation Task, Highlighter, collaboration, AI and Archive behaviour remain intact.
