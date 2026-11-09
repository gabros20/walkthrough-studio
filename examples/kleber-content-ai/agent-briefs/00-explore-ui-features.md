# 00 explore-ui-features: Map UI features and selectors

- Spawned: 2026-11-06 09:26 UTC
- Agent name: `(none)`; model: `default`; type: `Explore`
- Follow-up messages from the lead: 0

## Brief

Read-only research in ~/Documents/Work/Projects/kleber-content-ai (pnpm monorepo; web app in apps/web, Next.js 16 + React Aria + next-intl). I am planning a scripted browser recording (a product walkthrough video) and need an accurate map of every user-facing feature and how to drive it with browser automation. Thoroughness: very thorough. Do not modify anything.

Report, with file paths and line numbers:

1. **Routes and screens**: every page under apps/web/src/app (/, /c/[id], /company, /rate, /sign-in, /sign-in/enroll) — what each shows and how a user gets there (which menu/button).
2. **Sign-in in local dev**: how a dealer/partner is picked (partner-picker.tsx, app-entry.tsx, api/auth), which dealers exist in seed data, whether a password/token is needed, and what cookie/session results.
3. **The main flow in components/app/kleber-app.tsx, composer.tsx, campaign-preview.tsx, option-gallery.tsx, format-chips.tsx, post-mockup.tsx, preview-frames.tsx, preview-pager.tsx, option-copy.tsx, copy-editor.tsx, quick-actions.tsx, question-panel.tsx, messages.tsx**: step by step what the user sees from typing a prompt to having three options; how options/versions are switched; how post types/formats per platform are switched (list ALL platforms and ALL formats with their ids, labels and pixel sizes — there should be ~18 formats over 6 platforms; find the authoritative list, likely in packages/core/src/contracts.ts or packages/core/src/creative/*); how inline copy editing works; what quick actions exist; what the question panel is.
4. **Add platform** (add-platform-menu.tsx): how it is opened, what it lists, what happens after picking (model-free?), how long it takes.
5. **Export** (export-sheet.tsx and api routes for creatives/campaigns): what the export sheet offers (single image download, copy text, kit.zip?), exact button labels.
6. **Language**: language-select.tsx, i18n/config.ts, i18n/actions.ts — how UI language is switched (where the control lives), the 8 locales, and separately how the *campaign/content* language is chosen or changed (is there a control, or does the agent follow the prompt language / a note?). 
7. **Header and branding**: app-header.tsx, brand-logo.tsx, profile-menu.tsx, usage-meter.tsx — the exact logo + "Content AI" lockup markup (SVG source/file path, fonts, colors) used in the header, and what the profile menu contains.
8. **Theme**: is there dark/light mode (theme-provider.tsx) and how is it toggled?
9. **Accessible names / selectors**: for each control above give the English label from apps/web/messages/en.json (key and value) or aria-label, role, and any data-testid, so automation can target them by role+name. Note controls that have no accessible name.
10. **Dev/mocks**: dev-model-picker.tsx, lib/agent/mock-model.ts, lib/core/mock/client.ts, api/dev/model — what the mock model does, how it is enabled, and whether a full demo flow can run deterministically without calling the real LLM. Which port does the web app and the server run on in dev (check package.json scripts, next config, .env.example, README)?
11. **Responsive**: at 1920x1080 and 1440x900 what is the layout (chat left, preview right?), and is there a mobile layout worth showing.

Finish with a compact "automation cheat sheet": ordered list of user actions for a full demo (sign in → prompt → options → switch formats → reprompt → add platform → switch language → company page → export) with the selector for each.
