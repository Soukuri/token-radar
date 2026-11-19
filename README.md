# token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Soukuri/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Soukuri/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar ranks pre-token DeFi protocols by implied value — what a token would be worth if the protocol's record stayed as it is — and shows how to farm each one. The model is built only from the snapshot's own figures: each protocol's TVL, its 7-day TVL growth, and how long it has run with no token, priced by the market's own FDV/TVL multiple for its category (the median market-cap-to-TVL of the live-token protocols in that category). Protocols whose token already trades are set aside in a separate live view with their market caps. The board covers all 40 watchlist protocols plus every other rankable pre-token protocol below the watchlist floor, 226 rows in all, each with a seven-step farm plan with real costs and times. The dashboard is a static page with a sortable, filterable board, a detail page per protocol, and a live-token view — no network, no framework.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=xvx3ahvr&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
