# Facts and figures

Every fact below was checked in the app's code or in the recording on 6 November 2026. The source is given after each one, as a file path in the project repository (`kleber-content-ai`) with line numbers, or as the recording log. If you reuse a fact, keep its wording close; if something here no longer matches the app, the code wins.

## What one request produces

- **Three options per request.** A new campaign always has exactly three options. (`packages/core/src/contracts.ts:1098-1101`, `ComposeCampaignInput`: `options … .length(3)`)
- **Each option is a full post:** images, a headline, a button label, post text and hashtags, per platform. (`packages/core/src/creative/kit.ts:18-45`, `copyText`; the recorded kit's `copy.txt`)
- **Download:** one zip per option with one folder per platform at exact pixel sizes, plus `copy.txt` with the text to paste. Files are named `kleber_<option-name>_<format>`. (`packages/core/src/creative/kit.ts:1`, `:83`; `packages/core/src/creative/signing.ts:85-99`). In the film the dealer downloads `kleber_the-tyre-itself.zip` with 7 images and `copy.txt` (recording log, take 9).

## Platforms and formats: 6 platforms, 18 formats

Source: `packages/core/src/contracts.ts:393-410` (platforms) and `:464-652` (formats). The code notes the sizes are as of November 2026 and should be re-checked against each platform's ad specifications before a pilot (`contracts.ts:463`).

| Platform | Format | Pixels | File | Upload cap checked by the app |
|---|---|---|---|---|
| Instagram | Feed post 1:1 | 1080 × 1080 | JPG | |
| Instagram | Feed post 4:5 | 1080 × 1350 | JPG | |
| Instagram | Story / Reel cover 9:16 | 1080 × 1920 | JPG | |
| Facebook | Feed post 1:1 | 1080 × 1080 | JPG | |
| Facebook | Feed post 4:5 | 1080 × 1350 | JPG | |
| Facebook | Link / landscape 1.91:1 | 1200 × 628 | JPG | |
| Facebook | Story 9:16 | 1080 × 1920 | JPG | |
| TikTok | Photo post 9:16 | 1080 × 1920 | JPG | |
| LinkedIn | Single image 1.91:1 | 1200 × 627 | JPG | |
| LinkedIn | Single image 1:1 | 1080 × 1080 | JPG | |
| Display ads | Responsive landscape 1.91:1 | 1200 × 628 | JPG | 5.12 MB |
| Display ads | Responsive square 1:1 | 1200 × 1200 | JPG | 5.12 MB |
| Display ads | Medium rectangle | 300 × 250 | PNG | 150 KB |
| Display ads | Leaderboard | 728 × 90 | PNG | 150 KB |
| Display ads | Skyscraper | 160 × 600 | PNG | 150 KB |
| Display ads | Mobile banner | 320 × 50 | PNG | 150 KB |
| Newsletter | Email hero 2:1 | 1200 × 600 | JPG | 300 KB |
| Newsletter | Email banner 4:1 | 1200 × 300 | JPG | 200 KB |

- A new campaign starts with the platform the dealer picks; more platforms are added from a menu. **Adding a platform makes no AI call:** the new sizes are laid out and rendered straight away. (`apps/web/src/app/api/campaigns/[id]/platforms/route.ts:9-12`, "deterministic, no model call"; `apps/web/src/components/app/add-platform-menu.tsx:21`)
- Each format is laid out again for its shape, not cropped from one master image. (`packages/core/src/creative/adapt.ts`, one layout per format; `packages/core/src/creative/service.ts:719`, the per-format loop)

## Languages

- **The app's interface speaks 8 languages:** English, Français, Deutsch, Italiano, Español, Nederlands, Polski, Magyar. (`apps/web/src/i18n/config.ts:6-15` and `:22-31`; message files in `apps/web/messages/`)
- **The interface language and the campaign language are separate.** Post text follows the dealer's market and the request, not the menu language. (`apps/web/src/i18n/config.ts:1-4`) In the film the dealer asks for one option in German and the words on the image and the post text both change (recording log, take 5: headline "Zeit für Winterreifen", button "Termin vereinbaren").
- The assistant is told to write natively in the campaign language, not to translate from English. (`packages/core/src/prompts/agent-system.ts:44`)

## How the brand rules are kept

- **Pictures come only from Kleber's brand hub.** The assistant builds options "only from approved assets in the Kleber media hub" (`packages/core/src/prompts/agent-system.ts:2`), and the renderer will only download images from the hub's image server (`packages/core/src/creative/render.ts:16`, `:24-33`, allow-list `media.ffycdn.net`). The app does not generate pictures.
- **The assistant does not draw the image.** It chooses a hub photo and fills in a checked design form (layout, colours, text, logo choice). The app's own renderer turns that into images, so type, logos and spacing follow fixed rules. (`packages/core/src/contracts.ts`, `CreativeDesign` and the layout recipes at `:701-705`; `packages/core/src/creative/render.ts`)
- **Colours are limited to an allow-list:** the brand palette from the hub's style guide plus the main photo's own dominant colours. Any other colour is replaced by the nearest allowed one. (`packages/core/src/creative/palette.ts:1-4`, `:82`; `packages/core/src/creative/service.ts:653-657`, check `color_not_allowed`). When the style guide colours are not loaded, the fallback palette is black, white and Kleber red `#FD000D` (`palette.ts:21-25`).
- **One Kleber logo, never doubled.** If the photo already carries a logo, the app leaves the overlaid Kleber logo out. (`packages/core/src/creative/adapt.ts:926-927`, check `double_branding`)
- **Content rules:** no invented prices, discounts, deadlines, awards, test results, tyre-label values or safety promises; prices, offers and dates only when the dealer gives them; product facts only from the hub; no other brands' logos and no people who are not in the hub. (`packages/core/src/prompts/agent-system.ts:21`)
- **The app cannot publish.** The assistant can only read the hub and save drafts; the dealer downloads or copies the result. (`packages/core/src/prompts/agent-system.ts:55`)

## What is checked before an image is shown

**1. Fixed checks on every image, every time** (no AI involved). Many are fixed automatically before the dealer sees anything.

| Check | What it catches | Source |
|---|---|---|
| `head_cut` | the crop cuts through a person's head | `packages/core/src/creative/checks.ts:124` |
| `element_cut` | the crop cuts part of a key element | `checks.ts:145` |
| `subject_covered` | text or the logo would cover a face | `checks.ts:162` |
| `text_overflow` | the headline needs more lines than the format allows, or the button label does not fit | `checks.ts:171`, `:206`; `adapt.ts:196-335` |
| `low_contrast` | headline, text line or button label below 4.5:1 contrast | `checks.ts:21` (`MIN_CONTRAST = 4.5`), `:177-199` |
| `unsafe_zone` | text or logo outside the platform's safe area (where app buttons sit) | `checks.ts:223` |
| `crop_infeasible` | the photo cannot be cropped well to this shape | `adapt.ts:773`, `:1068` |
| `double_branding` | the photo already carries a logo or text | `adapt.ts:843`, `:927` |
| `color_not_allowed` | a colour outside the allowed palette (replaced) | `service.ts:654` |
| `file_too_large` | the file is over the platform's upload cap | `packages/core/src/creative/render.ts:316` |

**2. An AI review of each option the assistant makes.** A vision model looks at one square, one 9:16 and one 1.91:1 image of the option and answers six pass/fail questions (`packages/core/src/creative/review.ts:256-278`; criteria at `packages/core/src/contracts.ts:924-931`, rubric at `review.ts:63-68`):

- `people_intact`: no face or head is cut or covered;
- `brand_elements_intact`: headline, button and logos are fully visible and readable;
- `text_legible`: headline and button are complete and easy to read;
- `single_logo`: no two overlaid brand marks compete;
- `product_visible`: the tyre named in the request is clearly visible;
- `finished_ad`: it reads as a deliberate ad, with no large empty areas or overlaps.

The reviewer also types out the headline and button as it reads them from the picture; if that does not match the intended words, the image fails (`review.ts:201`, `:223-237`).

**3. The assistant keeps working until options pass.** After each step the app reminds the assistant of any option that is not rendered or did not pass. It allows up to three renders per option per request (the first check plus two layout fixes), with a hard limit of four. (`apps/web/src/lib/agent/review-gate.ts:9-23`; `apps/web/src/lib/agent/work-limits.ts:13-16`)

Edits the dealer makes by hand are re-rendered with the fixed checks only, without the AI review and without an AI call. (`apps/web/src/app/api/campaigns/[id]/options/[optionId]/render/route.ts:11-14`)

## Saved notes (the assistant's memory)

- The assistant saves a short note when the dealer states a lasting preference or a fact about the business. (`packages/core/src/memory/user-memory.ts:1-11`; tool `remember` in `apps/web/src/lib/agent/tools.ts:241`)
- Notes are of three kinds: `preference`, `business` and `avoid`, each with a priority. (`packages/core/src/memory/format.ts:4`, `:17`, `:43`)
- **All saved notes are added to every new request**, before the assistant does anything, and it applies them as defaults without asking again. A request in the current conversation always wins for that post. (`packages/core/src/memory/user-memory.ts:2-5`, `:248-262`; `apps/web/src/app/api/chat/route.ts:113-121`)
- **The dealer can see and delete every note in Settings**, one by one or all at once. (`apps/web/messages/en.json:509-518`; `user-memory.ts:10-11`)
- When the notes outgrow a size budget, they are condensed into fewer notes. (`user-memory.ts:5-7`)
- In the film: "From now on, always end our posts with 'Free seasonal tyre storage for every customer.' And we're closed on Sundays." became two notes (a preference and a business fact), and all three options of the next campaign end with the sign-off line. (Recording log, takes 6 and 8)

## The dealer's brand kit

Set once in Settings and applied to new work (`packages/core/src/contracts.ts:725-730`, with choices at `:668-673` and `:701-705`):

- **Style:** ink (near-black), paper (warm off-white), signal (Kleber red) or snow (white).
- **Button shape:** pill, rounded, square, slant or outline.
- **Logo lockup:** logos side by side, or on a joined bar with a divider.
- **Logo order:** Kleber first or dealer first.

In the film the dealer chooses signal, pill, bar and dealer first (recording log, take 7).

## The recording

- The walkthrough film is 3 minutes 2 seconds (182.0 s), 1920 × 1080 at 60 frames per second. (Measured with ffprobe on both films.)
- It shows real footage of the app, recorded on 6 November 2026. Waits for the assistant are shortened and labelled "Time-lapse" with the speed-up; the chat line "Worked for N s" shows the true time. Recorded times: first campaign 56 s, redesign 34 s, German translation 27 s, saving the rule 6 s, second campaign 118 s. (Recording log `takes/INDEX.md`, "Worked for" lines; film edit list `videos/walkthrough-v2/film/edl.json`)

## AI models (defaults in the code)

The assistant runs on Claude Sonnet 5.5; image description and the image review run on Claude Haiku 5.5 by default. A deployment can configure other models. (`packages/core/src/models.ts:55-58`, `:249-258`)
