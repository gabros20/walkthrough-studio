# ElevenLabs: music and voice

*Mode: how-to. Generating the music take and the voiceover take, by connector or API key. Paths: `$P` is the film's project folder, `$KIT` the kit. What happens to the files next: `sound/README.md`, `voiceover/README.md`.*

How the first film's music bed and voiceover were generated, and how to do the same without the connector.
The lead makes every generation call itself, one call per asset. Sub-agents cannot reach the claude.ai
connector, and each call costs credits. The sound designer and the voiceover producer work only with the
downloaded files.

## Rules

- **One call per asset.** Each call charges credits: about 2,925 per music take and about 1,377 for a
  27-line speech take on the first film. Never re-call "to compare" without the owner's go-ahead.
- **"Free generations are busy right now"** means the call did not start and nothing was charged. Do not
  call again in the same turn. Retry on a later turn, using a timer or the next user message. Never re-call
  blindly after an error you have not read.
- **Download at once.** Result URLs are signed and expire.
- **Plan for short music.** Asked for 195 s, the music model returned 135.7 s and 43.2 s. The sound
  designer extends the bed by bar-aligned loops; do not regenerate (`docs/LESSONS.md` S2).
- **Prompts without artist names.** The model may refuse them. Describe genre, tempo, instruments and the
  energy curve instead.
- **Licence.** Free-tier output may not be licensed for commercial or public use. The owner confirms the
  terms of the plan before publishing, and the package README carries this as an open check.
- **Secrets.** Never print the API key. Name the variable only (`ELEVENLABS_API_KEY`).

## Connector route (claude.ai ElevenLabs MCP connector)

Tool names are those of the connector. Which models exist varies by workspace, so check them first.

### Music

1. `creative_create_flow`, once per film. Keep the `flow_id`.
2. `creative_get_flow_node_types`. Confirm a music model exists; the first film used `eleven_music_v2_5`.
3. `creative_add_flow_node` with that music model, on the flow.
4. `creative_update_node` with the prompt and `duration_seconds` = film length + 2 s.
   - Use `creative_get_model_schema` for the exact parameter names if unsure.
   - Example prompt: "Downtempo organic electronica, 96 BPM, warm electric piano chords, soft mallet and
     kalimba plucks, round sub bass, brushed broken beat, airy pads. Calm and optimistic. Sparse first 8 s,
     groove enters gently, small lift late, soft resolved ending. Instrumental, no vocals, no drops."
5. `creative_run_flow_nodes`.
6. `creative_get_flow_run_status`, every `poll_after_seconds` until `all_completed`. If `has_failures`,
   read the error before doing anything else.
7. Download the result URL at once, then measure its real length (it may be short):
   ```bash
   curl -L -o $P/music-take1.mp3 "<result url>"
   ffprobe -v error -show_entries format=duration -of csv=p=0 $P/music-take1.mp3
   ```
   Then write `$P/music.json` beside it (template: `$KIT/sound/music.example.json`; its `"file"` is
   relative to it).

### Speech (voiceover)

1. `creative_list_voices`. Pick a voice matching the owner's direction and say which one you picked. The
   first film used "Emily E.", a warm British female voice. Voice ids come only from this tool or the
   owner, never from memory.
2. `creative_generate_speech` with that `voice_id`, model `eleven_v4`, and `text` = the whole `script.txt`:
   one paragraph per line, blank lines between them, one take. Leave the number of generations at its
   default.
3. Poll `creative_get_flow_run_status` the same way. If several generations come back, take the first and
   keep the others' ids in your notes.
4. Download at once:
   ```bash
   curl -L -o $P/voiceover/vo-take1.mp3 "<result url>"
   ```
   Then hand the path to the voiceover producer for transcription and placement (skill `voiceover`).

## API-key route (no connector)

Verify against the current docs before relying on these. They were checked against the ElevenLabs API
reference on 9 November 2026 (`POST /v1/music`, `POST /v1/text-to-speech/{voice_id}`, `GET /v2/voices`,
header `xi-api-key`). The music endpoint's default model was `music_v1`, which is marked deprecated, so pass
a current music model id from the models page.

Keep the key in your environment (`ELEVENLABS_API_KEY`), never in a file in the repo.

```bash
# list voices (search by name)
curl -s "https://api.elevenlabs.io/v2/voices?search=emily&page_size=20" \
  -H "xi-api-key: $ELEVENLABS_API_KEY" | python3 -I -m json.tool | head -60

# music: returns audio bytes; length 3,000-600,000 ms
curl -s -X POST "https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128" \
  -H "xi-api-key: $ELEVENLABS_API_KEY" -H "Content-Type: application/json" \
  -d '{"prompt": "<music direction>", "music_length_ms": 197000, "force_instrumental": true, "model_id": "<current music model>"}' \
  -o $P/music-take1.mp3

# speech: returns audio bytes
curl -s -X POST "https://api.elevenlabs.io/v1/text-to-speech/<voice_id>?output_format=mp3_44100_128" \
  -H "xi-api-key: $ELEVENLABS_API_KEY" -H "Content-Type: application/json" \
  -d "$(python3 -I -c 'import json,sys; print(json.dumps({"text": open(sys.argv[1]).read(), "model_id": "eleven_v4"}))' $P/voiceover/script.txt)" \
  -o $P/voiceover/vo-take1.mp3
```

Check each response before using it. A JSON error body saved as `.mp3` is a common failure; confirm with
`file $P/voiceover/vo-take1.mp3` or `ffprobe`. Long scripts may exceed the per-request character limit
of the chosen model; if so, split at paragraph boundaries and keep the takes in order.
