# Terminal Miner

This folder contains a separate terminal miner so you do not need to open the browser UI.

## Files

- `terminal-miner/config.json`: your miner settings (wallet, pool/proxy, algo, threads)
- `terminal-miner/cli.cjs`: CLI entry point
- `terminal-miner/core.cjs`: stratum + worker control
- `terminal-miner/worker-bridge.cjs`: runs the browser worker in Node worker threads
- `terminal-miner/algorithms.cjs`: supported algo list and aliases

## Configure Wallet And Pool

Edit `terminal-miner/config.json`.

Example:

```json
{
    "host": "wss://ratty-adoree-ananta512-4abadf1a.koyeb.app/c3RyYXR1bS1ldS5ycGxhbnQueHl6OjcwMjI=",
    "port": 7022,
    "user": "BbDqruSg7LdJfXsxJQD9j3phupdBdLihVe",
    "pass": "x",
    "threads": 1,
    "algo": "cwm_power2B",
    "clientVersion": "webminer/1.0",
    "proxy": "",
    "statsIntervalMs": 1000
}
```

Field meaning:

- `host`: either a full websocket proxy URL (`wss://...`) or a raw pool host (like `stratum-eu.rplant.xyz`)
- `port`: pool port (used when `host` is a raw host)
- `user`: wallet / wallet.worker login
- `pass`: pool password (usually `x`)
- `threads`: number of CPU threads
- `algo`: algorithm value from the supported list below
- `clientVersion`: value sent in `mining.subscribe` (default `webminer/1.0`)
- `proxy`: websocket proxy base URL (only needed when `host` is not already a full `ws/wss` URL)
- `statsIntervalMs`: terminal refresh interval

Config aliases also supported:

- `wallet` or `worker` can be used instead of `user`
- `password` can be used instead of `pass`
- `workers` can be used instead of `threads`
- `algorithm` can be used instead of `algo`
- `version` can be used instead of `clientVersion`

## Run

From project root:

```bash
npm run mine
```

From project root with explicit paths:

```bash
node terminal-miner/cli.cjs --config terminal-miner/config.json
```

From inside `terminal-miner` folder:

```bash
node cli.cjs --config config.json
```

List supported algorithms:

```bash
npm run mine:list-algos
```

Or from inside `terminal-miner`:

```bash
node cli.cjs --list-algos
```

## Supported Algo Values

- `cwm_minotaurx`
- `cwm_yespower`
- `cwm_yespowerR16`
- `cwm_yespowerSUGAR`
- `cwm_yespowerADVC`
- `cwm_ghostrider`
- `cwm_power2B`
- `cwm_yescrypt`
- `cwm_yescryptR8`
- `cwm_yescryptR16`
- `cwm_yescryptR32`

## Live Output

CLI shows one live line:

`Status | Hashrate | Accepted | Rejected`

Press `Ctrl+C` to stop.
