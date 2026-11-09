# Maintainers

How-to for the maintainer: protecting `main`, repository settings, and cutting a release. Contributors want
[`CONTRIBUTING.md`](../CONTRIBUTING.md) instead. Nothing here runs by itself; each command is run by hand,
once, by a repository admin.

## Protect `main` with a ruleset

The ruleset below, on `main`:

- requires a pull request before merging, with **0 required approvals**. That is deliberate for a solo
  maintainer: GitHub does not let an author approve their own PR, so 1 approval would block every change. The
  PR still has to exist and its checks still have to pass. Raise `required_approving_review_count` to 1 when
  a second maintainer joins (CODEOWNERS already routes reviews to `@gabros20`);
- allows squash merges only, so a PR's conventional-commit title becomes the commit on `main`;
- requires the status checks `check` and `site` (the jobs of `.github/workflows/ci.yml`, reported by the
  GitHub Actions app, integration id 15368) to pass. Neither job has a path filter, so they report on every
  PR and never leave one waiting for a check that did not run;
- blocks force pushes (`non_fast_forward`) and deletion of `main`;
- lists **Repository admin** (`RepositoryRole`, actor id 5) as a bypass actor with `bypass_mode: always`.
  The maintainer needs that once, to force-push the squashed history before the repository is announced
  (below). Admins can also push directly in an emergency; everyone else goes through a PR.

Save the payload as `ruleset-main.json`:

```json
{
  "name": "Protect main",
  "target": "branch",
  "enforcement": "active",
  "conditions": {
    "ref_name": {
      "include": ["refs/heads/main"],
      "exclude": []
    }
  },
  "bypass_actors": [
    {
      "actor_id": 5,
      "actor_type": "RepositoryRole",
      "bypass_mode": "always"
    }
  ],
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    {
      "type": "pull_request",
      "parameters": {
        "required_approving_review_count": 0,
        "dismiss_stale_reviews_on_push": false,
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_review_thread_resolution": false,
        "allowed_merge_methods": ["squash"]
      }
    },
    {
      "type": "required_status_checks",
      "parameters": {
        "strict_required_status_checks_policy": false,
        "do_not_enforce_on_create": false,
        "required_status_checks": [
          { "context": "check", "integration_id": 15368 },
          { "context": "site", "integration_id": 15368 }
        ]
      }
    }
  ]
}
```

Create it (`POST /repos/gabros20/walkthrough-studio/rulesets`):

```sh
gh api --method POST \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  /repos/gabros20/walkthrough-studio/rulesets \
  --input ruleset-main.json
```

Check it, and find its id for later changes (`PUT /repos/gabros20/walkthrough-studio/rulesets/<id>` with
the same `--input`):

```sh
gh api /repos/gabros20/walkthrough-studio/rulesets --jq '.[] | {id, name, enforcement}'
gh api /repos/gabros20/walkthrough-studio/rules/branches/main
```

Create the ruleset after CI has run at least once on GitHub (push the workflows first), so the `check` and
`site` contexts exist and can be picked in the UI if you ever edit the ruleset there.

## Repository settings

Once, as an admin:

```sh
# Private vulnerability reporting (SECURITY.md points reporters at it; off by default)
gh api --method PUT /repos/gabros20/walkthrough-studio/private-vulnerability-reporting

# Dependabot alerts and security updates (version updates come from .github/dependabot.yml)
gh api --method PUT /repos/gabros20/walkthrough-studio/vulnerability-alerts
gh api --method PUT /repos/gabros20/walkthrough-studio/automated-security-fixes

# Squash merges only, PR title as the commit message, delete merged branches
gh repo edit gabros20/walkthrough-studio \
  --enable-squash-merge --enable-merge-commit=false --enable-rebase-merge=false \
  --delete-branch-on-merge
gh api --method PATCH /repos/gabros20/walkthrough-studio \
  -f squash_merge_commit_title=PR_TITLE -f squash_merge_commit_message=PR_BODY
```

## Squash the history before announcing (one force push)

To publish the repository with a single initial commit, as the admin (bypassing the ruleset), from a clean,
up-to-date `main`:

```sh
git switch --orphan publish
git add -A
git commit -m "feat: walkthrough-studio 0.1.0"
git push --force origin publish:main
git switch main && git reset --hard origin/main && git branch -D publish
```

Then fix the commit links in `docs/CHANGELOG.md`: its `[0.1.0]` and `[Unreleased]` links point at commit
`f94bd0f`, which no longer exists after the squash. Point them at the tag instead
(`[0.1.0]: https://github.com/gabros20/walkthrough-studio/releases/tag/v0.1.0`,
`[Unreleased]: https://github.com/gabros20/walkthrough-studio/compare/v0.1.0...HEAD`) and tag that commit
`v0.1.0`, or release what is under `[Unreleased]` as the next version as below. Anyone with an old clone must
re-clone.

## Cut a release

Versions are [semver](https://semver.org/): patch for fixes, minor for new skills, agents, tools or options,
major for a breaking change to the take contract, `storyboard.json`, a config format or a command's flags.
While the kit is `0.x`, a breaking change bumps the minor.

1. **Check the changelog.** `docs/CHANGELOG.md` `## [Unreleased]` lists everything since the last release,
   under Added, Changed, Removed, Fixed.
2. **Bump.** On an up-to-date `main`:

   ```sh
   node scripts/version.mjs 0.2.0 --dry     # what would change; writes nothing
   npm run version:set -- 0.2.0             # writes it
   npm run check
   ```

   This sets `0.2.0` in `.claude-plugin/plugin.json`, `package.json`, `recorder/package.json`,
   `film/package.json` and `.claude-plugin/marketplace.json` (when it exists and carries a version), moves
   `[Unreleased]` into `## [0.2.0] - <today>` with an empty `[Unreleased]` above it, and updates the compare
   links. It refuses (and writes nothing) when `[Unreleased]` is empty or `[0.2.0]` already exists.
   `--date YYYY-MM-DD` sets another date; `--no-changelog` sets the versions only.
3. **Merge the bump.** The script prints these:

   ```sh
   git switch -c release/v0.2.0
   git add -A && git commit -m "chore(release): v0.2.0"
   git push -u origin release/v0.2.0
   gh pr create --fill --title "chore(release): v0.2.0"
   ```

   Wait for `check` and `site`, then squash-merge.
4. **Tag the merged commit and push the tag:**

   ```sh
   git switch main && git pull --ff-only
   git tag -a v0.2.0 -m "v0.2.0"
   git push origin v0.2.0
   ```

5. **`release.yml` publishes it.** On the `v*` tag it checks that the tag matches the manifests' version,
   takes the `[0.2.0]` section of the changelog as the notes (`node scripts/version.mjs --notes v0.2.0`) and
   runs `gh release create` with the workflow's `GITHUB_TOKEN`. A tag with a hyphen (`v0.3.0-rc.1`) is
   published as a pre-release. Nothing is attached; the source archives GitHub adds are the release.

If the release job fails (for example, the tag does not match), delete the tag (`git push origin :v0.2.0`,
`git tag -d v0.2.0`), fix, and tag again. Users of the plugin get the new version when they update it from
the marketplace.
