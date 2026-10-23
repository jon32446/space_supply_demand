import {
  MarketError, createSimulation, priceAt, quoteTrade, executeTrade, advanceDays,
  addGood, validateGood, validateMarket, validateSettings,
} from "./economy.js";

const $ = id => document.getElementById(id);
const number = value => new Intl.NumberFormat("en", { maximumFractionDigits: 0 }).format(value);
const money = value => new Intl.NumberFormat("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
let state = createSimulation();
let planetId = state.planets[0].id;
let goodId = state.goods[0].id;
let side = "buy";
let quantity = 0;

function selected() {
  const planet = state.planets.find(item => item.id === planetId);
  const good = state.goods.find(item => item.id === goodId);
  return { planet, good, market: planet.markets[goodId] };
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function notify(message, error = false) {
  $("status").textContent = message;
  $("status").classList.toggle("error", error);
}

function act(action) {
  try {
    action();
    render();
  } catch (error) {
    if (!(error instanceof MarketError)) throw error;
    notify(error.message, true);
  }
}

function choosePlanet(id) {
  planetId = id;
  quantity = 0;
  render();
}

function renderPlanets() {
  const focused = document.activeElement?.dataset.planet;
  $("planets").replaceChildren(...state.planets.map(planet => {
    const button = element("button", "planet");
    button.type = "button";
    button.dataset.planet = planet.id;
    button.setAttribute("aria-pressed", String(planet.id === planetId));
    const icon = element("span", "planet-icon");
    icon.style.setProperty("--planet-color", planet.color);
    icon.setAttribute("aria-hidden", "true");
    const text = element("span", "planet-text");
    text.append(element("strong", "", planet.name), element("span", "hint", planet.description));
    button.append(icon, text, element("span", "planet-check", planet.id === planetId ? "DOCKED" : ""));
    button.addEventListener("click", () => choosePlanet(planet.id));
    return button;
  }));
  if (focused) $("planets").querySelector(`[data-planet="${focused}"]`)?.focus({ preventScroll: true });
}

function renderMarkets() {
  const { planet } = selected();
  const focused = document.activeElement?.dataset.good;
  $("market-title").textContent = `${planet.name} market`;
  $("market-description").textContent = planet.description;
  $("market-rows").replaceChildren(...state.goods.map(good => {
    const market = planet.markets[good.id];
    const row = element("tr", good.id === goodId ? "selected" : "");
    const goodCell = element("td");
    const button = element("button", "good-button");
    button.type = "button";
    button.dataset.good = good.id;
    button.setAttribute("aria-pressed", String(good.id === goodId));
    const swatch = element("span", "good-swatch");
    swatch.style.background = good.color;
    button.append(swatch, document.createTextNode(good.name));
    button.addEventListener("click", () => {
      goodId = good.id;
      quantity = 0;
      render();
    });
    goodCell.append(button);
    const stockCell = element("td");
    const bar = element("span", "stock-bar");
    const fill = element("span", "stock-fill");
    fill.style.width = `${Math.min(100, market.stock / market.target * 100)}%`;
    fill.style.background = market.stock >= market.target ? "var(--mint)" : "var(--amber)";
    bar.append(fill);
    stockCell.append(element("span", "stock-text", `${number(market.stock)} / ${number(market.target)}`), bar);
    const net = market.production - market.consumption;
    const flowCell = element("td", net > 0 ? "positive" : net < 0 ? "negative" : "muted",
      `${net > 0 ? "+" : ""}${number(net)}`);
    const spot = priceAt(market.stock, market, good, state.settings);
    const priceCell = element("td", "price-cell");
    priceCell.append(element("strong", "", money(spot)), element("span", "", `${(spot / good.basePrice).toFixed(2)}x base`));
    row.append(goodCell, stockCell, flowCell, priceCell, element("td", "muted", number(state.player.cargo[good.id])));
    return row;
  }));
  if (focused) $("market-rows").querySelector(`[data-good="${focused}"]`)?.focus({ preventScroll: true });
}

function svgNode(tag, attributes = {}, text) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderChart(quote) {
  const { good, market } = selected();
  const svg = $("price-chart");
  const maxStock = Math.max(market.target * 2, market.stock * 1.15, quote.stockAfter * 1.15);
  const maxPrice = priceAt(0, market, good, state.settings) * 1.08;
  const left = 65, top = 16, width = 530, height = 184;
  const x = stock => left + stock / maxStock * width;
  const y = price => top + height - price / maxPrice * height;
  const spot = priceAt(market.stock, market, good, state.settings);
  svg.replaceChildren(svgNode("title", { id: "chart-description" },
    `${good.name}: price falls as stock rises. Current stock ${market.stock}, price ${money(spot)} credits. After preview: stock ${quote.stockAfter}, price ${money(quote.priceAfter)} credits.`));
  for (let step = 0; step <= 4; step++) {
    const value = maxPrice * step / 4;
    svg.append(svgNode("line", { x1: left, x2: left + width, y1: y(value), y2: y(value), stroke: "#2a3142" }));
    svg.append(svgNode("text", { x: left - 10, y: y(value) + 4, "text-anchor": "end" }, compact(value)));
    const stock = maxStock * step / 4;
    svg.append(svgNode("text", { x: x(stock), y: top + height + 19, "text-anchor": "middle" }, compact(stock)));
  }
  svg.append(
    svgNode("text", { x: left, y: 9 }, "PRICE / cr"),
    svgNode("text", { x: left + width, y: 244, "text-anchor": "end" }, "AVAILABLE STOCK"),
    svgNode("line", { x1: x(market.target), x2: x(market.target), y1: top, y2: top + height, stroke: "#626d86", "stroke-dasharray": "4 5" }),
    svgNode("line", { x1: left, x2: left + width, y1: y(good.basePrice), y2: y(good.basePrice), stroke: "#626d86", "stroke-dasharray": "4 5" }),
  );
  const points = Array.from({ length: 241 }, (_, index) => {
    const stock = maxStock * index / 240;
    return `${index ? "L" : "M"}${x(stock).toFixed(2)},${y(priceAt(stock, market, good, state.settings)).toFixed(2)}`;
  }).join(" ");
  svg.append(
    svgNode("path", { d: `${points} L${left + width},${top + height} L${left},${top + height} Z`, fill: "#b4b9ed0b" }),
    svgNode("path", { d: points, fill: "none", stroke: "#b4b9ed", "stroke-width": 2.5 }),
  );
  if (quantity) {
    svg.append(
      svgNode("line", { x1: x(quote.stockAfter), x2: x(quote.stockAfter), y1: y(quote.priceAfter), y2: top + height, stroke: "#70d9c1", "stroke-dasharray": "3 4" }),
      svgNode("circle", { cx: x(quote.stockAfter), cy: y(quote.priceAfter), r: 6, fill: "#70d9c1", stroke: "#181d29", "stroke-width": 2 }),
    );
  }
  svg.append(svgNode("circle", { cx: x(market.stock), cy: y(spot), r: 5, fill: "#b4b9ed", stroke: "#181d29", "stroke-width": 2 }));
  $("curve-title").textContent = good.name;
  $("spot-price").textContent = `${money(spot)} cr`;
}

function compact(value) {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}m`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return value < 10 && value > 0 ? value.toFixed(1) : String(Math.round(value));
}

function renderRoutes() {
  const { good } = selected();
  const focused = document.activeElement?.dataset.route;
  $("route-prices").replaceChildren(...state.planets.map(planet => {
    const market = planet.markets[goodId];
    const button = element("button", "route-price");
    button.type = "button";
    button.dataset.route = planet.id;
    button.setAttribute("aria-pressed", String(planet.id === planetId));
    button.setAttribute("aria-label", `${planet.name}, ${good.name} spot price ${money(priceAt(market.stock, market, good, state.settings))} credits. Switch planet.`);
    button.append(element("span", "", planet.name),
      element("strong", "", `${money(priceAt(market.stock, market, good, state.settings))} cr`));
    button.addEventListener("click", () => choosePlanet(planet.id));
    return button;
  }));
  if (focused) $("route-prices").querySelector(`[data-route="${focused}"]`)?.focus({ preventScroll: true });
}

function renderTrade(preserveQuantityInput = false) {
  const { good, market } = selected();
  const max = side === "buy" ? market.stock : state.player.cargo[goodId];
  quantity = Math.min(quantity, max);
  const quote = quoteTrade(market, good, state.settings, side, quantity);
  $("trade-title").textContent = `Trade ${good.name.toLowerCase()}`;
  $("side-buy").setAttribute("aria-pressed", String(side === "buy"));
  $("side-sell").setAttribute("aria-pressed", String(side === "sell"));
  $("available").textContent = side === "buy" ? `${number(max)} in market` : `${number(max)} in hold`;
  $("quantity").max = max;
  if (!preserveQuantityInput) $("quantity").value = quantity;
  $("quantity-slider").max = max;
  $("quantity-slider").value = quantity;
  $("quantity-slider").disabled = max === 0;
  $("quantity-max").textContent = `${number(max)} units`;
  $("average-price").textContent = quantity ? `${money(quote.average)} cr` : "\u2014";
  $("after-price").textContent = `${money(quote.priceAfter)} cr`;
  $("after-stock").textContent = `${number(quote.stockAfter)} units`;
  $("total-label").textContent = side === "buy" ? "TOTAL COST" : "TOTAL PROCEEDS";
  $("total-price").textContent = `${money(quote.total)} cr`;
  const affordable = side === "sell" || quote.total <= state.player.credits;
  const validQuantity = $("quantity").value !== "" && $("quantity").validity.valid;
  $("execute-trade").disabled = quantity === 0 || !affordable || !validQuantity;
  $("execute-trade").textContent = `${side === "buy" ? "Buy" : "Sell"}${quantity ? ` ${number(quantity)}` : ""} ${quantity === 1 ? "unit" : "units"}`;
  $("trade-warning").textContent = !validQuantity ? `Enter a whole quantity between 0 and ${number(max)}.`
    : !max ? (side === "buy" ? "This market is empty. Sell cargo or advance time if it produces this good." : "Your hold is empty. Buy this good at a market first.")
    : !affordable ? `Not enough credits. You need ${money(quote.total - state.player.credits)} cr more.` : "";
  renderChart(quote);
}

function renderTuning() {
  const { planet, good, market } = selected();
  $("local-label").textContent = `${planet.name} / ${good.name}`;
  for (const field of ["stock", "target", "production", "consumption"]) $(`${field}-control`).value = market[field];
  $("unmet").textContent = `${number(market.unmet)} units`;
  $("base-price-control").value = good.basePrice;
  $("good-sensitivity").value = 1 / good.responseWidth;
  $("good-sensitivity-output").textContent = `${(1 / good.responseWidth).toFixed(2)}x`;
  $("global-sensitivity").value = state.settings.sensitivity;
  $("global-sensitivity-output").textContent = `${state.settings.sensitivity.toFixed(2)}x`;
  $("offset-control").value = state.settings.offset;
  $("exponent-control").value = state.settings.exponent;
  $("effective-width").textContent = `${money(market.target * good.responseWidth / state.settings.sensitivity)} units`;
}

function render() {
  $("day").textContent = `Day ${String(state.day).padStart(2, "0")}`;
  $("credits").textContent = `${money(state.player.credits)} cr`;
  $("cargo").textContent = `${number(Object.values(state.player.cargo).reduce((sum, amount) => sum + amount, 0))} units`;
  renderPlanets();
  renderMarkets();
  renderTrade();
  renderRoutes();
  renderTuning();
}

for (const direction of ["buy", "sell"]) {
  $(`side-${direction}`).addEventListener("click", () => {
    side = direction;
    quantity = 0;
    render();
  });
}

function updateQuantity(event) {
  if (!event.target.validity.valid || event.target.value === "") {
    quantity = 0;
    renderTrade(true);
    return;
  }
  quantity = Number(event.target.value);
  renderTrade();
}
$("quantity").addEventListener("input", updateQuantity);
$("quantity-slider").addEventListener("input", updateQuantity);

$("execute-trade").addEventListener("click", () => act(() => {
  const { planet, good } = selected();
  const quote = executeTrade(state, planetId, goodId, side, quantity);
  notify(`${side === "buy" ? "Bought" : "Sold"} ${number(quantity)} ${good.name} on ${planet.name} for ${money(quote.total)} cr. Average ${money(quote.average)} cr / unit.`);
  quantity = 0;
}));

for (const [id, days] of [["advance-one", 1], ["advance-seven", 7]]) {
  $(id).addEventListener("click", () => act(() => {
    const unmet = advanceDays(state, days);
    notify(`Advanced ${days} ${days === 1 ? "day" : "days"}. ${number(unmet)} units of unmet consumption across all markets this turn.${unmet ? " Stock never goes below zero." : ""}`);
  }));
}

for (const id of ["market-form", "good-form", "curve-form"]) {
  $(id).addEventListener("submit", event => event.preventDefault());
}

$("market-form").addEventListener("change", () => act(() => {
  if (!$("market-form").reportValidity()) return;
  const { market, good, planet } = selected();
  const next = { ...market };
  for (const field of ["stock", "target", "production", "consumption"]) next[field] = Number($(`${field}-control`).value);
  validateMarket(next);
  Object.assign(market, next);
  notify(`Updated ${good.name} market on ${planet.name}.`);
}));

$("base-price-control").addEventListener("change", () => act(() => {
  if (!$("base-price-control").reportValidity()) return;
  const { good } = selected();
  const next = { ...good, basePrice: Number($("base-price-control").value) };
  validateGood(next);
  Object.assign(good, next);
  notify(`Updated ${good.name} base price on every planet.`);
}));

$("good-sensitivity").addEventListener("input", () => act(() => {
  const { good } = selected();
  good.responseWidth = 1 / Number($("good-sensitivity").value);
  notify(`Updated ${good.name} sensitivity on every planet.`);
}));

$("global-sensitivity").addEventListener("input", () => act(() => {
  state.settings.sensitivity = Number($("global-sensitivity").value);
  notify("Updated sensitivity across all markets.");
}));

$("curve-form").addEventListener("change", () => act(() => {
  if (!$("curve-form").reportValidity()) return;
  const next = { ...state.settings, offset: Number($("offset-control").value), exponent: Number($("exponent-control").value) };
  validateSettings(next);
  Object.assign(state.settings, next);
  notify("Updated the pricing curve across all markets.");
}));

$("add-good-form").addEventListener("submit", event => {
  event.preventDefault();
  act(() => {
    const form = event.target;
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    const good = addGood(state, {
      name: String(data.get("name")), basePrice: Number(data.get("basePrice")),
      responseWidth: 1 / Number(data.get("sensitivity")),
    });
    goodId = good.id;
    quantity = 0;
    form.reset();
    notify(`Added ${good.name} with seeded markets on all three planets.`);
  });
});

function reset(seed) {
  state = createSimulation(seed);
  planetId = state.planets[0].id;
  goodId = state.goods[0].id;
  side = "buy";
  quantity = 0;
  $("seed").value = seed;
  notify(`Reset universe from seed "${seed}". Credits, cargo, markets, and tuning restored.`);
  render();
}
$("seed-form").addEventListener("submit", event => {
  event.preventDefault();
  if (event.target.reportValidity()) reset($("seed").value);
});
$("random-seed").addEventListener("click", () => reset(crypto.randomUUID().slice(0, 8)));

render();
