# Contributing to Topiq Explorer

Thanks for your interest in contributing! This guide will help you get started.

## Getting Started

### Prerequisites

- Node.js 20+
- Yarn

### Setup

```bash
# Fork and clone the repository
git clone https://github.com/<your-username>/topiq-explorer.git
cd topiq-explorer

# Install dependencies
yarn install

# Start the development server
yarn electron:dev
```

## Branching Model

| Branch | Purpose |
|--------|---------|
| `main` | Production releases — auto-release workflow runs here |
| `develop` | Integration branch for features |
| `feature/*` | New features and enhancements |
| `hotfix/*` | Urgent fixes branched from `main` |

## Submitting a Pull Request

1. Create a branch from `develop` for features, or from `main` for hotfixes
2. Make your changes and commit with clear, descriptive messages
3. Open a PR targeting the appropriate base branch:
   - **Features / enhancements** → target `develop`
   - **Hotfixes** → target `main`
4. Add a release label (required for PRs to `main`) — see [RELEASING.md](RELEASING.md)
5. Fill out the PR template and ensure the checklist is complete

### Release Labels (Required for PRs to `main`)

When your PR targets `main`, you **must** add a release label to control the version bump:

- `release:major` — breaking changes
- `release:minor` — new features, enhancements
- `release:patch` — bug fixes

See [RELEASING.md](RELEASING.md) for full details.

## Code Style

- **TypeScript** — strict mode, prefer explicit types at module boundaries
- **React** — functional components with hooks
- **Zustand** — for state management (stores in `src/stores/`)
- **Tailwind CSS** — utility-first styling, avoid custom CSS where possible
- **Radix UI** — for accessible primitive components

## Useful Links

- [RELEASING.md](RELEASING.md) — release process and version bumping
