import test from "node:test";
import assert from "node:assert/strict";
import {
  createSimulation, priceAt, quoteTrade, executeTrade, advanceDays, addGood,
  validateGood, validateMarket, validateSettings, MarketError,
} from "../economy.js";

function fixture() {
  const state = createSimulation();
  const good = state.goods[0];
  const planet = state.planets[0];
  const market = planet.markets[good.id];
  Object.assign(market, { stock: 100, target: 100, production: 10, consumption: 10 });
  return { state, good, planet, market };
}

test("markets are deterministic, varied, and reset independently", () => {
  assert.deepEqual(createSimulation("abc"), createSimulation("abc"));
  assert.notDeepEqual(createSimulation("abc").planets, createSimulation("xyz").planets);
  const original = createSimulation("abc");
  const fresh = createSimulation("abc");
  original.goods[0].basePrice = 1;
  assert.notEqual(original.goods[0].basePrice, fresh.goods[0].basePrice);
  for (const planet of fresh.planets) for (const market of Object.values(planet.markets)) validateMarket(market);
});

test("prices decrease with stock, equal base at target, and scale by market size", () => {
  const { state, good, market } = fixture();
  assert.equal(priceAt(100, market, good, state.settings), good.basePrice);
  let previous = Infinity;
  for (let stock = 0; stock <= 1000; stock++) {
    const price = priceAt(stock, market, good, state.settings);
    assert(price > 0 && price < previous);
    previous = price;
  }
  assert.equal(
    priceAt(75, market, good, state.settings),
    priceAt(750, { ...market, target: 1000 }, good, state.settings),
  );
  const gentle = priceAt(75, market, { ...good, responseWidth: 1.5 }, state.settings);
  const sharp = priceAt(75, market, { ...good, responseWidth: 0.3 }, state.settings);
  assert(sharp > gentle);
  assert(priceAt(75, market, good, { ...state.settings, sensitivity: 2 }) > priceAt(75, market, good, state.settings));
});

test("bulk quotes are reversible and split invariant, with no empty-stock purchases", () => {
  const { state, good, market } = fixture();
  const full = quoteTrade(market, good, state.settings, "buy", 30);
  const first = quoteTrade(market, good, state.settings, "buy", 10);
  const second = quoteTrade({ ...market, stock: 90 }, good, state.settings, "buy", 20);
  const reverse = quoteTrade({ ...market, stock: 70 }, good, state.settings, "sell", 30);
  assert(Math.abs(full.total - first.total - second.total) < 1e-8);
  assert(Math.abs(full.total - reverse.total) < 1e-8);
  assert(full.total > good.basePrice * 30);
  assert.throws(() => quoteTrade(market, good, state.settings, "buy", 101), MarketError);
  assert.throws(() => quoteTrade(market, good, state.settings, "buy", 0.5), MarketError);
});

test("trades conserve cargo and credits; rejected trades do not mutate state", () => {
  const { state, planet, good, market } = fixture();
  const before = structuredClone(state);
  assert.throws(() => executeTrade(state, planet.id, good.id, "sell", 1), MarketError);
  assert.deepEqual(state, before);
  state.player.credits = 1;
  const broke = structuredClone(state);
  assert.throws(() => executeTrade(state, planet.id, good.id, "buy", 1), MarketError);
  assert.deepEqual(state, broke);
  state.player.credits = 25000;
  executeTrade(state, planet.id, good.id, "buy", 10);
  assert.equal(market.stock, 90);
  assert.equal(state.player.cargo[good.id], 10);
  executeTrade(state, planet.id, good.id, "sell", 10);
  assert.equal(market.stock, 100);
  assert.equal(state.player.cargo[good.id], 0);
  assert(Math.abs(state.player.credits - 25000) < 1e-8);
  assert.throws(() => executeTrade(state, planet.id, good.id, "buy", 0), MarketError);
});

test("cargo travels between planets and sale changes only the destination market", () => {
  const { state, planet, good } = fixture();
  const destination = state.planets[1];
  const destinationStock = destination.markets[good.id].stock;
  executeTrade(state, planet.id, good.id, "buy", 2);
  executeTrade(state, destination.id, good.id, "sell", 2);
  assert.equal(planet.markets[good.id].stock, 98);
  assert.equal(destination.markets[good.id].stock, destinationStock + 2);
  assert.equal(state.player.cargo[good.id], 0);
});

test("time respects daily production, stock floors, unmet needs, and batch equivalence", () => {
  const { state, market } = fixture();
  Object.assign(market, { stock: 5, production: 2, consumption: 10 });
  const daily = structuredClone(state);
  advanceDays(state, 7);
  for (let day = 0; day < 7; day++) advanceDays(daily);
  assert.deepEqual(state, daily);
  assert.equal(market.stock, 0);
  assert.equal(market.unmet, 51);
  assert.equal(state.day, 7);
  assert.throws(() => advanceDays(state, -1), MarketError);
});

test("adding goods initializes every planet and cargo without replacing existing markets", () => {
  const state = createSimulation();
  const original = structuredClone(state.planets[0].markets);
  const good = addGood(state, { name: "Water", basePrice: 3, responseWidth: 1.2 });
  assert.equal(state.player.cargo[good.id], 0);
  for (const planet of state.planets) validateMarket(planet.markets[good.id]);
  for (const [id, market] of Object.entries(original)) assert.deepEqual(state.planets[0].markets[id], market);
  assert.throws(() => addGood(state, { name: " water ", basePrice: 3, responseWidth: 1 }), MarketError);
});

test("tuning rejects invalid curve parameters, goods, and market quantities", () => {
  const { state, market, good } = fixture();
  for (const offset of [0, 1, NaN, Infinity]) {
    assert.throws(() => validateSettings({ ...state.settings, offset }), MarketError);
  }
  assert.throws(() => validateSettings({ ...state.settings, sensitivity: 0 }), MarketError);
  assert.throws(() => validateGood({ ...good, basePrice: -1 }), MarketError);
  assert.throws(() => validateGood({ ...good, responseWidth: 0 }), MarketError);
  assert.throws(() => validateMarket({ ...market, target: 0 }), MarketError);
  assert.throws(() => validateMarket({ ...market, production: 0.5 }), MarketError);
});
