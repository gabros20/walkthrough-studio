# 01 explore-existing-pipeline: Audit existing video pipeline

- Spawned: 2026-11-06 09:26 UTC
- Agent name: `(none)`; model: `default`; type: `Explore`
- Follow-up messages from the lead: 0

## Brief

Read-only research. I am planning to produce a polished product walkthrough video (Screen Studio style: animated cursor, zooms, captions, title cards, background music) for the app in ~/Documents/Work/Projects/kleber-content-ai. A first attempt was made on Nov 5 and lives in the `videos/` folder. I need to know exactly what exists, what worked and what was weak, and what the available tools can do. Thoroughness: very thorough. Do not modify, create or delete anything; do not start servers, browsers or recordings.

Report, with file paths:

1. **videos/ folder**: read every script (record-tour.sh, record-part2.sh, record-part3.sh, record-part4.sh), beats.log, beats2.log, and the HyperFrames project in videos/kleber-walkthrough (index.html in full, AGENTS.md/CLAUDE.md, hyperframes.json, meta.json, package.json, assets/ listing, renders/ listing, .hyperframes/ listing). Explain the pipeline end to end: how recording was driven, how timing beats were captured, how the cut/captions/titles were composed, how it was rendered. Run `ffprobe` (read-only) on videos/kleber-content-ai-walkthrough.mp4 and on the raw webm files to report duration, resolution, fps, codecs, and whether there is an audio track.
2. **History**: grep ~/Documents/Work/Projects/kleber-content-ai/.agent/PROJECT_CONTEXT.jsonl for entries mentioning walkthrough, video, hyperframes, agent-browser, record, cursor, captions (the file is JSONL with long lines — extract the relevant entries' `context` text in full). Summarise what was learned: problems hit (e.g. viewport, timing, flaky selectors, cursor not visible, slow agent runs), and decisions made.
3. **Skills**: read ~/.claude/skills/hyperframes/ (SKILL.md and any referenced files that matter: render contract, work loop, captions, cursor/overlay, audio, video-clip embedding, zoom/pan) and ~/.claude/skills/media-use/ (SKILL.md and the parts on music generation, ElevenLabs, audio mixing/ducking). Summarise the hard rules I must follow and the exact CLI commands (init, preview, lint, render, music). Also check whether a skill directory for `agent-browser` exists under ~/.claude/skills or ~/.agents/skills and summarise it.
4. **agent-browser CLI**: run `agent-browser --help` and help for subcommands related to: record (start/stop, format, fps, size), set viewport / device scale factor, mouse (move/down/up), eval / JS injection, init scripts, screenshot, wait, cookies/state save-load, headed vs headless, sessions. Report the version and the exact syntax. I specifically need to know: can it record video at 1920x1080 or higher DPI, at what fps, does the recording include a mouse cursor, and can I inject a persistent script/CSS on every page load (to draw a fake animated cursor).
5. **Other tools present**: check (`command -v` / `--version`, read-only) for ffmpeg, ffprobe, node, pnpm, npx, playwright (global or in repo node_modules), hyperframes CLI (global, or via npx in videos/kleber-walkthrough/package.json), remotion, whisper, sox. 
6. **ElevenLabs credentials**: find WHERE an ElevenLabs API key is configured without ever printing its value — check variable NAMES only in: the repo's .env* files (root, apps/web, apps/server, infra), ~/.zshrc, ~/.zshenv, ~/.zprofile, ~/.env, ~/.config/**, ~/.claude/settings.json, ~/.claude.json mcpServers env names, ~/.claude/skills/media-use config. Use commands like `grep -l` or `grep -o 'ELEVEN[A-Z_]*'` so that only names appear. Report file path + variable name only.
7. **Brand assets for title cards**: locate the Kleber logo files and the "Content AI" header lockup (SVG/PNG) in apps/web/public, apps/web/src/components/app/brand-logo.tsx, and videos/kleber-walkthrough/assets; note fonts used by the app (apps/web/src/app/layout.tsx, globals.css) and the brand colours (CSS variables).

End with a frank assessment: which parts of the existing pipeline are worth reusing as-is, which should be rebuilt, and the biggest technical risks for a higher-quality second version.
