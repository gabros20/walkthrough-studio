# Facts and figures

Every fact below was checked in the app's code or in the recording on 6 November 2026. The source is given after each one: `(source: <file in the app>)` stands for the file and line numbers in the app's repository (fill in the real path when you reuse this template), and recording facts point to the recording log. If you reuse a fact, keep its wording close; if something here no longer matches the app, the code wins.

## What one request produces

- **Three options per request.** A new campaign always has exactly three options. (source: <file in the app>, the campaign input contract: exactly three options)
- **Each option is a full post:** images, a headline, a button label, post text and hashtags, per platform. (source: <file in the app>; the recorded kit's `copy.txt`)
- **Download:** one zip per option with one folder per platform at exact pixel sizes, plus `copy.txt` with the text to paste. Files are named `brightpost_<option-name>_<format>`. (source: <file in the app>). In the film the shop owner downloads `brightpost_the-bike-itself.zip` with 7 images and `copy.txt` (recording log, take 9).

## Platforms and formats: 6 platforms, 18 formats

Source: <file in the app> (platforms and formats). The code notes the sizes are as of November 2026 and should be re-checked against each platform's ad specifications before a pilot.

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

- A new campaign starts with the platform the shop owner picks; more platforms are added from a menu. **Adding a platform makes no AI call:** the new sizes are laid out and rendered straight away. (source: <file in the app>, "deterministic, no model call")
- Each format is laid out again for its shape, not cropped from one master image. (source: <file in the app>, one layout per format and the per-format loop)

## Languages

- **The app's interface speaks 8 languages:** English, Français, Deutsch, Italiano, Español, Nederlands, Polski, Magyar. (source: <file in the app>, the language config and message files)
- **The interface language and the campaign language are separate.** Post text follows the shop's market and the request, not the menu language. (source: <file in the app>) In the film the shop owner asks for one option in German and the words on the image and the post text both change (recording log, take 5: headline "Bereit für den ersten Frost", button "Termin vereinbaren").
- The assistant is told to write natively in the campaign language, not to translate from English. (source: <file in the app>, the assistant's system prompt)

## How the brand rules are kept

- **Pictures come only from the brand hub.** The assistant builds options "only from approved assets in the brand hub" (source: <file in the app>, the assistant's system prompt), and the renderer will only download images from the hub's own image server, an allow-list of one host (source: <file in the app>). The app does not generate pictures.
- **The assistant does not draw the image.** It chooses a hub photo and fills in a checked design form (layout, colours, text, logo choice). The app's own renderer turns that into images, so type, logos and spacing follow fixed rules. (source: <file in the app>, the design contract and layout recipes, and the renderer)
- **Colours are limited to an allow-list:** the brand palette from the hub's style guide plus the main photo's own dominant colours. Any other colour is replaced by the nearest allowed one. (source: <file in the app>, check `color_not_allowed`). When the style guide colours are not loaded, the fallback palette is black, white and Brightpost teal `#0E7C86` (source: <file in the app>).
- **One Brightpost logo, never doubled.** If the photo already carries a logo, the app leaves the overlaid Brightpost logo out. (source: <file in the app>, check `double_branding`)
- **Content rules:** no invented prices, discounts, deadlines, awards, test results, product spec values or safety promises; prices, offers and dates only when the shop gives them; product facts only from the hub; no other brands' logos and no people who are not in the hub. (source: <file in the app>, the assistant's system prompt)
- **The app cannot publish.** The assistant can only read the hub and save drafts; the shop owner downloads or copies the result. (source: <file in the app>, the assistant's system prompt)

## What is checked before an image is shown

**1. Fixed checks on every image, every time** (no AI involved). Many are fixed automatically before the shop owner sees anything.

| Check | What it catches | Source |
|---|---|---|
| `head_cut` | the crop cuts through a person's head | <file in the app> |
| `element_cut` | the crop cuts part of a key element | <file in the app> |
| `subject_covered` | text or the logo would cover a face | <file in the app> |
| `text_overflow` | the headline needs more lines than the format allows, or the button label does not fit | <file in the app> |
| `low_contrast` | headline, text line or button label below 4.5:1 contrast | <file in the app> (`MIN_CONTRAST = 4.5`) |
| `unsafe_zone` | text or logo outside the platform's safe area (where app buttons sit) | <file in the app> |
| `crop_infeasible` | the photo cannot be cropped well to this shape | <file in the app> |
| `double_branding` | the photo already carries a logo or text | <file in the app> |
| `color_not_allowed` | a colour outside the allowed palette (replaced) | <file in the app> |
| `file_too_large` | the file is over the platform's upload cap | <file in the app> |

**2. An AI review of each option the assistant makes.** A vision model looks at one square, one 9:16 and one 1.91:1 image of the option and answers six pass/fail questions (source: <file in the app>, the review criteria and rubric):

- `people_intact`: no face or head is cut or covered;
- `brand_elements_intact`: headline, button and logos are fully visible and readable;
- `text_legible`: headline and button are complete and easy to read;
- `single_logo`: no two overlaid brand marks compete;
- `product_visible`: the bike named in the request is clearly visible;
- `finished_ad`: it reads as a deliberate ad, with no large empty areas or overlaps.

The reviewer also types out the headline and button as it reads them from the picture; if that does not match the intended words, the image fails (source: <file in the app>).

**3. The assistant keeps working until options pass.** After each step the app reminds the assistant of any option that is not rendered or did not pass. It allows up to three renders per option per request (the first check plus two layout fixes), with a hard limit of four. (source: <file in the app>, the review gate and work limits)

Edits the shop owner makes by hand are re-rendered with the fixed checks only, without the AI review and without an AI call. (source: <file in the app>)

## Saved notes (the assistant's memory)

- The assistant saves a short note when the shop owner states a lasting preference or a fact about the business. (source: <file in the app>, the memory module and the `remember` tool)
- Notes are of three kinds: `preference`, `business` and `avoid`, each with a priority. (source: <file in the app>)
- **All saved notes are added to every new request**, before the assistant does anything, and it applies them as defaults without asking again. A request in the current conversation always wins for that post. (source: <file in the app>, the memory module and the chat route)
- **The shop owner can see and delete every note in Settings**, one by one or all at once. (source: <file in the app>, the Settings strings and the memory module)
- When the notes outgrow a size budget, they are condensed into fewer notes. (source: <file in the app>)
- In the film: "From now on, always end our posts with 'Free safety check for every customer.' And we're closed on Sundays." became two notes (a preference and a business fact), and all three options of the next campaign end with the sign-off line. (Recording log, takes 6 and 8)

## The shop's brand kit

Set once in Settings and applied to new work (source: <file in the app>, the brand-kit contract and its choices):

- **Style:** ink (near-black), paper (warm off-white), signal (Brightpost teal) or white.
- **Button shape:** pill, rounded, square, slant or outline.
- **Logo lockup:** logos side by side, or on a joined bar with a divider.
- **Logo order:** Brightpost first or shop first.

In the film the shop owner chooses signal, pill, bar and shop first (recording log, take 7).

## The recording

- The walkthrough film is 3 minutes 2 seconds (182.0 s), 1920 × 1080 at 60 frames per second. (Measured with ffprobe on both films.)
- It shows real footage of the app, recorded on 6 November 2026. Waits for the assistant are shortened and labelled "Time-lapse" with the speed-up; the chat line "Worked for N s" shows the true time. Recorded times: first campaign 56 s, redesign 34 s, German translation 27 s, saving the rule 6 s, second campaign 118 s. (Recording log `takes/INDEX.md`, "Worked for" lines; film edit list `videos/walkthrough-v2/film/edl.json`)

## AI models (defaults in the code)

The assistant runs on Claude Sonnet 5.5; image description and the image review run on Claude Haiku 5.5 by default. A deployment can configure other models. (source: <file in the app>)
