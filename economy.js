export class MarketError extends Error {}

export const DEFAULT_GOODS = [
  { id: "platinum", name: "Platinum", basePrice: 250, responseWidth: 0.7, target: 80, color: "#b4b9ed" },
  { id: "medicine", name: "Medicine", basePrice: 90, responseWidth: 0.6, target: 140, color: "#70d9c1" },
  { id: "diamonds", name: "Diamonds", basePrice: 700, responseWidth: 0.3, target: 40, color: "#edc17e" },
  { id: "copper", name: "Copper", basePrice: 12, responseWidth: 1.5, target: 400, color: "#e5a08c" },
  { id: "food", name: "Food", basePrice: 4, responseWidth: 1.2, target: 600, color: "#afd17e" },
];

function requireValue(condition, message) {
  if (!condition) throw new MarketError(message);
}

function positive(value, name) {
  requireValue(Number.isFinite(value) && value > 0, `${name} must be greater than zero.`);
}

function units(value, name) {
  requireValue(Number.isSafeInteger(value) && value >= 0, `${name} must be a non-negative whole number.`);
}

export function validateSettings(settings) {
  positive(settings.sensitivity, "Global sensitivity");
  requireValue(Number.isFinite(settings.offset) && settings.offset > 1, "Curve offset must be greater than 1.");
  positive(settings.exponent, "Curve exponent");
}

export function validateGood(good) {
  requireValue(typeof good.name === "string" && good.name.trim().length > 0, "Enter a name for the good.");
  positive(good.basePrice, "Base price");
  positive(good.responseWidth, "Response width");
}

export function validateMarket(market) {
  units(market.stock, "Stock");
  units(market.target, "Target stock");
  positive(market.target, "Target stock");
  units(market.production, "Production");
  units(market.consumption, "Consumption");
}

export function priceAt(stock, market, good, settings) {
  requireValue(Number.isFinite(stock) && stock >= 0, "Stock cannot be negative.");
  const width = market.target * good.responseWidth / settings.sensitivity;
  const factor = Math.atan((stock - market.target) / width) / (Math.PI / 2);
  const price = good.basePrice * (settings.offset / (settings.offset + factor)) ** settings.exponent;
  requireValue(Number.isFinite(price) && price > 0, "These settings produce an invalid price.");
  return price;
}

export function quoteTrade(market, good, settings, side, quantity) {
  units(quantity, "Trade quantity");
  requireValue(side === "buy" || side === "sell", "Choose buy or sell.");
  const direction = side === "buy" ? -1 : 1;
  const stockAfter = market.stock + direction * quantity;
  units(stockAfter, "Resulting stock");
  let total = 0;
  for (let i = 0; i < quantity; i++) {
    total += priceAt(market.stock + direction * (i + 0.5), market, good, settings);
  }
  requireValue(Number.isFinite(total), "Trade value is too large.");
  return {
    quantity, total, stockAfter,
    average: quantity ? total / quantity : 0,
    priceAfter: priceAt(stockAfter, market, good, settings),
  };
}

function seededRandom(seed) {
  let value = 2166136261;
  for (const character of String(seed)) value = Math.imul(value ^ character.charCodeAt(0), 16777619);
  return () => {
    value = (value + 0x6d2b79f5) | 0;
    let result = Math.imul(value ^ (value >>> 15), 1 | value);
    result ^= result + Math.imul(result ^ (result >>> 7), 61 | result);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function generateMarket(random, good) {
  const target = Math.max(1, Math.round(good.target * (0.6 + random() * 0.8)));
  const role = random();
  const demand = Math.max(1, Math.round(target * (0.02 + random() * 0.05)));
  const production = role < 0.4 ? demand + Math.max(1, Math.round(demand * random()))
    : role > 0.6 ? Math.floor(demand * random()) : demand;
  return {
    stock: Math.round(target * (0.2 + random() * 1.8)),
    target, production, consumption: demand, unmet: 0,
  };
}

export function createSimulation(seed = "first-contact") {
  const random = seededRandom(seed);
  const goods = DEFAULT_GOODS.map(good => ({ ...good }));
  const planets = [
    { id: "vesper", name: "Vesper", description: "Mining frontier", symbol: "V", color: "#b4b9ed" },
    { id: "pelagos", name: "Pelagos", description: "Ocean settlement", symbol: "P", color: "#70d9c1" },
    { id: "ember", name: "Ember", description: "Industrial colony", symbol: "E", color: "#edc17e" },
  ].map(planet => ({
    ...planet,
    markets: Object.fromEntries(goods.map(good => [good.id, generateMarket(random, good)])),
  }));
  return {
    seed: String(seed), day: 0, goods, planets,
    settings: { sensitivity: 1, offset: 1.28, exponent: 2 },
    player: { credits: 25000, cargo: Object.fromEntries(goods.map(good => [good.id, 0])) },
  };
}

export function executeTrade(state, planetId, goodId, side, quantity) {
  const planet = state.planets.find(item => item.id === planetId);
  const good = state.goods.find(item => item.id === goodId);
  requireValue(Boolean(planet && good), "Unknown planet or good.");
  positive(quantity, "Trade quantity");
  const market = planet.markets[goodId];
  const quote = quoteTrade(market, good, state.settings, side, quantity);
  const cargo = state.player.cargo[goodId];
  if (side === "buy") {
    requireValue(quote.total <= state.player.credits, "Not enough credits for this purchase.");
    units(cargo + quantity, "Resulting cargo");
  } else {
    requireValue(quantity <= cargo, "Not enough cargo for this sale.");
  }
  const credits = state.player.credits + (side === "buy" ? -quote.total : quote.total);
  requireValue(Number.isFinite(credits), "Resulting balance is too large.");
  market.stock = quote.stockAfter;
  state.player.credits = credits;
  state.player.cargo[goodId] += side === "buy" ? quantity : -quantity;
  return quote;
}

export function advanceDays(state, days = 1) {
  units(days, "Days");
  units(state.day + days, "Resulting day");
  // Preflight the largest possible stock and unmet-demand counters before mutation.
  for (const planet of state.planets) {
    for (const market of Object.values(planet.markets)) {
      units(market.stock + market.production * days, "Resulting stock");
      units(market.unmet + market.consumption * days, "Unmet demand");
    }
  }
  let unmet = 0;
  for (let day = 0; day < days; day++) {
    for (const planet of state.planets) {
      for (const market of Object.values(planet.markets)) {
        const available = market.stock + market.production;
        const missing = Math.max(0, market.consumption - available);
        market.stock = Math.max(0, available - market.consumption);
        market.unmet += missing;
        unmet += missing;
      }
    }
    state.day++;
  }
  return unmet;
}

export function addGood(state, details) {
  validateGood(details);
  requireValue(!state.goods.some(good => good.name.toLowerCase() === details.name.trim().toLowerCase()),
    "A good with that name already exists.");
  let index = state.goods.length + 1;
  while (state.goods.some(good => good.id === `custom-${index}`)) index++;
  const good = {
    id: `custom-${index}`, name: details.name.trim(), basePrice: details.basePrice,
    responseWidth: details.responseWidth, target: 100, color: "#99baff",
  };
  const random = seededRandom(`${state.seed}:${good.id}`);
  state.goods.push(good);
  for (const planet of state.planets) planet.markets[good.id] = generateMarket(random, good);
  state.player.cargo[good.id] = 0;
  return good;
}
