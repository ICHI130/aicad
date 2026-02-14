# AutoCAD parity research notes (Web / YouTube)

This document captures externally researched reference behaviors to align AI CAD interactions with common AutoCAD user expectations.

## Sources reviewed
- Autodesk Help (AutoCAD 2025) command references and object snap behavior pages.
- Autodesk Help pages for CIRCLE, POLYLINE, TRIM, and DIM workflows.
- YouTube practical tutorials focused on beginner-to-intermediate drafting workflows (search keywords: `AutoCAD object snap tutorial`, `AutoCAD polyline trim workflow`, `AutoCAD dimensions basics`).

## Extracted expectations for implementation
1. **Circle command**
   - Typical baseline flow is center-point then radius (via second click or numeric radius).
   - Dynamic visual preview before commit is expected.

2. **Object snaps**
   - Endpoint and Midpoint are baseline defaults.
   - Intersection snap is heavily used in trim/extend workflows.
   - Snap marker and snap-type feedback improve confidence.

3. **Polyline**
   - Enter/right-click usually confirms current chain.
   - Closing via direct first-point snap or explicit close action (`C`) is expected.

4. **Dimensioning**
   - Two measured points + offset placement interaction is standard.
   - Horizontal/vertical first is acceptable as an MVP.

## AI integration implications
- LLM output should be treated as *commands*, not direct execution payloads.
- Command payloads should include versioning and validation (shape whitelist, finite-number checks).
- Non-JSON conversational responses must remain visible to users and not mutate drawings.
