# Orbital Market Lab

A small space-trading sandbox for experimenting with supply, demand, and prices.
Built with vanilla JavaScript, HTML, and CSS, with no runtime dependencies.

## Run

Use Node.js 22 or newer:

```sh
npm start
```

Open [localhost:3000](http://localhost:3000). No `npm install` is needed.
To use another port, run `PORT=3001 npm start`.

## Experiment

- Select a planet and commodity, then use the quantity slider to preview a trade.
  Buying raises local prices; selling lowers them.
- Carry goods between planets to take advantage of price differences. Travel is
  instant and free.
- Adjust local stock, target stock, production, and consumption. Tune base prices
  and sensitivity per good, or change the pricing curve globally.
- Advance one or seven days to apply production followed by consumption.
- Add custom goods or reset from a seed to reproduce a starting universe.

The sandbox starts with three planets, five goods, and 25,000 credits.
Reloading clears your changes. A seeded reset also clears cargo, custom goods,
and tuning.

## Pricing model

Prices depend on stock relative to a market's target: at target stock, the price
equals the good's base price. An arctangent curve produces a bounded supply
factor, which feeds a normalized inverse-power price curve.

Sensitivity scales with market size, so the same percentage shortage has the
same effect in otherwise equivalent markets. Higher sensitivity means sharper
price changes. Trades price each unit at its inventory midpoint, rather than
charging the starting price for an entire shipment.

There are no automatic traders or hidden replenishment. Production and
consumption are fixed until edited; prices alone do not correct a global shortage
or surplus. Stock never goes below zero, and unmet consumption is tracked.

## GitHub Pages

In the repository's **Settings > Pages**, set **Build and deployment > Source**
to **GitHub Actions**. GitHub Actions must be enabled and allowed to use the
official `actions/*` actions.

Pushing to `master` runs the tests and deploys only the four browser files.
You can also run **Deploy to GitHub Pages** manually from the Actions tab.
No custom secrets or build step are needed.

The site will be at <https://jon32446.github.io/space_supply_demand/>.

## Tests

```sh
npm test
```

The market engine lives in `economy.js`; the browser interface is in `app.js`.
