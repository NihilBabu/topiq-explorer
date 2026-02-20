# Topiq Explorer

A cross-platform desktop application for exploring and managing Apache Kafka clusters.

## Features

- **Connection Management** - Save and manage multiple Kafka cluster connections with SSL/SASL support
- **Topic Browser** - View, create, and manage topics with partition details
- **Message Viewer** - Browse messages with filtering, search, and multiple format support (JSON, Avro, Protobuf)
- **Consumer Groups** - Monitor consumer group status, lag, and member assignments
- **Schema Registry** - Integrate with Confluent Schema Registry for Avro/Protobuf deserialization

## Tech Stack

- **Electron** - Cross-platform desktop framework
- **React** - UI framework
- **TypeScript** - Type-safe JavaScript
- **KafkaJS** - Apache Kafka client for Node.js
- **Vite** - Fast build tooling
- **Tailwind CSS** - Utility-first CSS framework
- **Zustand** - Lightweight state management
- **Radix UI** - Accessible component primitives

## Screenshots

<!-- TODO: Add screenshots -->

## Installation

### Download

Download the latest release for your platform from the [Releases](https://github.com/NihilBabu/topiq-explorer/releases) page.

#### macOS
- **DMG**: Download `Topiq Explorer-x.x.x.dmg` and drag to Applications
- **ZIP**: Download `Topiq Explorer-x.x.x-mac.zip` for portable use

> **Note**: The app is not code-signed. If you see "Topiq Explorer is damaged and can't be opened", run:
> ```bash
> xattr -cr "/Applications/Topiq Explorer.app"
> ```
> Or right-click the app → Open → Open (bypasses Gatekeeper).

#### Windows
- **Installer**: Download `Topiq Explorer-Setup-x.x.x.exe` for standard installation
- **Portable**: Download `Topiq Explorer-x.x.x.exe` for portable use

## Development

### Prerequisites

- Node.js 20+
- Yarn

### Setup

```bash
# Clone the repository
git clone https://github.com/NihilBabu/topiq-explorer.git
cd topiq-explorer

# Install dependencies
yarn install

# Start development server
yarn electron:dev
```

### Build Commands

```bash
# Build for current platform
yarn build

# Build for macOS
yarn package:mac

# Build for Windows
yarn package:win

# Build for Linux
yarn package:linux
```

Build artifacts are output to the `release/` directory.

## Project Structure

```
├── src/
│   ├── components/     # React components
│   ├── hooks/          # Custom React hooks
│   ├── lib/            # Utility functions
│   ├── stores/         # Zustand state stores
│   └── types/          # TypeScript type definitions
├── electron/           # Electron main process
├── build/              # Build resources (icons)
└── release/            # Build output
```

## License

- see [LICENSE](LICENSE) for details.
