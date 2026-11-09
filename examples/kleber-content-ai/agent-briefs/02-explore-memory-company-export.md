# 02 explore-memory-company-export: Trace memory, company, export

- Spawned: 2026-11-06 09:26 UTC
- Agent name: `(none)`; model: `default`; type: `Explore`
- Follow-up messages from the lead: 0

## Brief

Read-only research in ~/Documents/Work/Projects/kleber-content-ai (pnpm monorepo: packages/core, apps/server (Hono), apps/web (Next.js 16)). I am planning a scripted product walkthrough video and must demonstrate these features truthfully on screen: company profile + brand kit, agent memory (saved and injected into the agent), reprompting to change a design, adding a platform, content language, and export. I need to know precisely how each works and what appears in the UI. Thoroughness: very thorough. Do not modify anything, do not start servers.

Report with file paths and line numbers:

1. **Agent memory (ADR-013)**: read digital-product/architecture/adr/013-*.md, apps/server/src/memory-http.ts, apps/web/src/app/api/memory/**, apps/web/src/app/company/memory-list.tsx, and the relevant parts of packages/core (search for "memory", "observation", "observer") and apps/web/src/lib/agent/* and apps/web/src/app/api/chat/route.ts. Explain: WHEN a memory is created (a tool the agent calls? a background observer after the turn? thresholds?), what triggers it in practice (what kind of user message reliably produces a saved memory), where memories are stored, how they are injected into later prompts, what the user sees in the chat when a memory is saved (any chip/toast/tool indicator?), and what the memory list on /company shows and allows (edit/delete/add?).
2. **Company page**: apps/web/src/app/company/page.tsx, brand-kit-form.tsx, logo-form.tsx, name-field.tsx, chat-history.tsx, plus api/company/**, api/me/** — every section and field, what the brand kit contains (colours? fonts? tone? logo?), how the dealer logo is used in creatives (co-brand lockup), what "chat history" and api/me/export do (GDPR export/delete?).
3. **Chat history (ADR-014)**: single ongoing chat per person — what happens on reload, is there a "new campaign"/clear action, how older campaigns are reopened (/c/[id]?).
4. **Reprompt / redesign loop**: how a follow-up message changes a design (tools in apps/web/src/lib/agent/tools.ts and packages/core/src/tools.ts: render_creatives, revise, search, etc.), what the user sees while the agent works (tool step indicators, streaming text, review status), typical number of steps and rough duration of a first generation and of a follow-up edit (look at evals in apps/web/evals, run-campaign.mjs, any logs/timings in docs, README, digital-product/quality or digital-product/ai). What style presets / layouts / recipes exist (packages/core/src/creative/*: list preset names and layout names) so I can pick visually distinct re-prompts, e.g. "make it a type poster", "use the gradient layout", "change the button".
5. **Campaign content language**: how the language of the generated copy is determined and changed (packages/core/src/prompts/agent-system.ts, apps/web/src/lib/agent/instructions.ts, "language notes"); can the user ask "now in German" and get the same campaign translated; does switching UI locale affect content language.
6. **Export**: packages/core kit.zip creation and the routes that serve it; exactly what the zip contains (file naming, copy.txt format), single-image download, copy-to-clipboard of post text.
7. **Usage limits**: packages/core usage + .env.example — daily limits (messages, tokens, reviews) that could block a recording session, the `usage:reset` script, and what the usage meter shows.
8. **Models and cost**: packages/core/src/models.ts and .env.example — which models run by default, required env vars to run the live agent locally (names only, never values; also report which of these names are actually present in the repo's .env files without printing values), and whether Frontify snapshot data and PGlite data are already present locally (data/ folder sizes, counts) so the app can run now.
9. **Demo themes that work well**: README.md and apps/web/evals/campaign-cases.json — which prompts are known to produce good results from hub content (winter switch, football LOSC/Hoffenheim, all-season…), and which fail. List 5 candidate demo prompts with expected output.
10. **Rate page** (/rate, api/ratings/**): what it is for, and whether it is a dealer-facing feature worth showing or an internal tool.
11. **MCP front door**: apps/server MCP endpoint — what a dealer would do to use it from Claude/ChatGPT (for possibly one closing mention in the video).

End with a list of anything that looks unfinished, broken or risky to show on camera (TODOs, feature flags, dev-only UI such as dev-model-picker that should be hidden while recording, and how to hide it).
