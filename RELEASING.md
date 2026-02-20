# Releasing

Topiq Explorer uses [Semantic Versioning](https://semver.org/) and automated releases via GitHub Actions.

## Semantic Versioning

| Bump | When | Example |
|------|------|---------|
| **Major** | Breaking changes (new config format, removed features, incompatible API) | `1.2.0` → `2.0.0` |
| **Minor** | New features, enhancements (new panel, additional protocol support) | `1.2.0` → `1.3.0` |
| **Patch** | Bug fixes, performance improvements, dependency updates | `1.2.0` → `1.2.1` |

## Automated Release Flow

1. Work on a feature or fix in a branch off `develop`
2. Open a PR targeting `develop` (or `main` for hotfixes)
3. Add a **release label** to the PR (required for PRs to `main` — see below)
4. Merge the PR into `main`
5. The `auto-release.yml` workflow detects the merged PR and its labels
6. Version in `package.json` is bumped accordingly
7. A new commit and git tag (`vX.Y.Z`) are created and pushed
8. A draft GitHub Release is auto-created with generated release notes
9. The `release.yml` workflow triggers on the new tag, builds artifacts, uploads them to the release, and publishes it

## Controlling Version Bump with PR Labels

A release label is **required** on all PRs to `main`. The `require-release-label` workflow will block merging without one.

| PR Label | Bump Type | Example |
|----------|-----------|---------|
| `release:major` | Major | `1.2.0` → `2.0.0` |
| `release:minor` | Minor | `1.2.0` → `1.3.0` |
| `release:patch` | Patch | `1.2.0` → `1.2.1` |

**Priority:** If multiple release labels are present, `release:major` takes precedence over `release:minor`, which takes precedence over `release:patch`.

**How to add a label:** In the GitHub PR sidebar, click "Labels" and select the appropriate release label. You can also use the CLI:

```bash
gh pr edit <PR_NUMBER> --add-label "release:patch"
```

## Setup: Creating Release Labels

Run these commands once per repository to create the labels:

```bash
gh label create "release:major" --color "B60205" --description "Trigger major version bump"
gh label create "release:minor" --color "1D76DB" --description "Trigger minor version bump"
gh label create "release:patch" --color "0E8A16" --description "Trigger patch version bump"
```

## Hotfix / Patch Workflow

For urgent fixes that need to go directly to production:

1. Branch from `main`: `git checkout -b hotfix/fix-description main`
2. Make the fix and commit
3. Open a PR targeting `main`
4. Add the `release:patch` label
5. Merge — the workflow bumps the patch version automatically

## Manual Release (Fallback)

If the automated workflow fails or you need manual control:

```bash
# 1. Update version in package.json
npm version <major|minor|patch> --no-git-tag-version

# 2. Commit (the chore(release): prefix prevents the auto-release workflow from re-triggering)
git commit -am "chore(release): vX.Y.Z"

# 3. Tag and push
git tag vX.Y.Z
git push origin main --follow-tags
```

## First Stable Release

The workflow includes a one-time gate: any version starting with `0.x.x` will automatically bump to `1.0.0` regardless of PR labels. This ensures the first stable release is always `1.0.0`. After that, labels control the bump type normally.
