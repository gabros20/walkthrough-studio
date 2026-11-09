# Security policy

## Reporting a vulnerability

Report it privately through GitHub's private vulnerability reporting:
[open a draft security advisory](https://github.com/gabros20/walkthrough-studio/security/advisories/new)
(the repository's **Security** tab, then **Report a vulnerability**). Please do not open a public issue, pull
request or discussion for it.

Include what is affected (file, script, skill or agent), how to reproduce it, and what an attacker could do
with it. You will get a first answer within a week. Once a fix is released, the advisory is published with
credit to you unless you prefer otherwise.

## Supported versions

Only the latest release and `main` get security fixes.

## What is in scope

- The scripts in this repo (`recorder/`, `film/`, `sound/`, `voiceover/`, `delivery/`, `studio/`, `scripts/`)
  and the plugin's skills and agents, for example: command injection through config or storyboard values,
  path traversal in project folders, saved browser logins (`storageState`) or API keys leaking into takes,
  logs, renders or delivery packages.
- The website in `site/`.

Out of scope: vulnerabilities in the apps or websites you record, in HyperFrames, Playwright, ElevenLabs or
Claude Code themselves (report those to their maintainers), and anything that needs an attacker who can
already edit your local files.

## Handling secrets

The kit never needs secrets in the repo. Saved browser logins and `.env` files are ignored by `.gitignore`;
if you find one committed, or a key in a take, render or package, report it the same way.
