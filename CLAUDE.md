# Kinglet

## Every new feature also updates the landing page (apps/web)

Not only the text (README, sections, pricing, FAQ): the animations too.

- The hero demo (`apps/web/src/demo/`: `AppWindow.tsx`, `scenes.ts`, `Saltmint.tsx`) mirrors the app's UI: a new tool tab, panel, check family or menu shows up there, and a feature worth showing gets its own scene (script in `scenes.ts`, tab and caption in `components/Hero.tsx`).
- The Device lab tiles (`components/LabTiles.tsx`) and the section cards (`components/Sections.tsx`) animate what the feature does.
- The landing page must pass Kinglet's own checks (`apps/web/landing.test.ts`): mock-ups describe placeholder text, fake e-mails and the like without writing them.
- Check the result in a browser at desktop and phone widths (no horizontal scroll).
