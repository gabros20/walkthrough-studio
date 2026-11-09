# Agent briefs from the first film

The briefs the lead (the main session) sent to each agent on the Kleber Content AI walkthrough, 6 November
2026, with every follow-up message it sent that agent afterwards. They are the source of the reusable
definitions in `agents/`; read them to see what a good brief contained and how the lead steered agents
mid-task (rulings, retake requests, holds, CPU rules, corrections).

Redactions: the session link in commit-message instructions and any personal email. Paths are kept: they
document the setup (repo, studio folder, scratchpad, the owner's screenshots). The demo user
`sam@summit-tyre.example` is fictional.

| File | Model | What the agent did | Follow-ups |
|---|---|---|---|
| `00-explore-ui-features.md` | default (Explore) | mapped the app's features, selectors and sign-in | 0 |
| `01-explore-existing-pipeline.md` | default (Explore) | audited the earlier video attempt and tooling, located ElevenLabs credentials by name only | 0 |
| `02-explore-memory-company-export.md` | default (Explore) | traced memory, company settings, export, usage limits | 0 |
| `03-plan-stress-test.md` | default (Plan) | stress-tested the recording design before approval | 0 |
| `04-studio-builder.md` | sonnet | built the studio instance, CP0, demo dealer, fictional logo; later re-synced and rebuilt | 1 |
| `05-take-operator.md` | opus | recorder, capture test, all takes, retakes, INDEX.md | 13 |
| `06-film-editor.md` | opus | film components, storyboard, drafts 1-7, final, captionless twin, re-timing | 13 |
| `07-09-frame-describer-*.md` | haiku ×3 | frame read-back of draft 4, one frame every 2 s, three ranges in parallel | 0 |
| `10-sound-designer.md` | opus | bed extension, beat grid, SFX, mix, `delivered:` guard, VO ducking | 4 |
| `11-film-critic.md` | opus | verified the describers' flags, prioritised fix list for draft 5 | 2 |
| `12-app-fixer.md` | opus | eight app fixes from the owner's notes, verified on camera, committed, pushed | 7 |
| `13-voiceover-producer.md` | opus | script fitted to windows, placement of the TTS take, fit checks after re-timing | 4 |
| `14-delivery-packager-media.md` | sonnet | masters, web encodes, clips, stills | 1 |
| `15-delivery-packager-showcase-copy.md` | opus | creative showcase, copy documents, README | 0 |

## Patterns worth copying

- Every brief starts with the goal in one paragraph, then **Where things are** (paths), what to read first,
  **Hard rules**, **What to build**, **Check before you report**, **Report back** (short, plain, failures
  stated plainly, "do not describe an unverified step as done").
- Parallel agents are told which folders the other owns.
- CPU rule while recording: "code and `--dry` runs only, until I say recording is finished".
- Rulings are numbered and say which earlier message they supersede when messages crossed.
- Truth requirements are phrased from the viewer's side: "accept only if a viewer who read the prompt sees it
  fulfilled".
- Budgets are explicit: agent turns for takes, "4 new campaigns is the hard limit", "one take, to spare the
  credits".
