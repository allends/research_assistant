# CLI Reference

Binary: `ra` (alias: `research-assistant`)

## Global Options

| Flag | Description |
|------|-------------|
| `-v, --verbose` | Enable verbose logging |
| `-V, --version` | Print version |
| `-h, --help` | Print help |

## Commands

### `ra init <vault-path>`

Initialize research-assistant for an Obsidian vault. The vault path must contain a `.obsidian` directory. Writes config to `~/.research-assistant/config.json`.

### `ra search <query>`

Search the vault using hybrid search.

| Option | Default | Description |
|--------|---------|-------------|
| `-m, --mode <mode>` | `hybrid` | `keyword`, `semantic`, or `hybrid` |
| `-n, --limit <number>` | `10` | Max results |
| `--min-score <number>` | — | Minimum score threshold |
| `--json` | `false` | Output as JSON |

### `ra index`

Re-index and embed vault documents.

| Option | Description |
|--------|-------------|
| `--update` | Incremental update only |
| `--status` | Show index status |

## Environment

| Variable | Effect |
|----------|--------|
| `RA_DEV` | Set to `1` or `true` to use `test-vault/` as the vault path and skip config file requirement |

## Config

Stored at `~/.research-assistant/config.json`. Created by `ra init`.
