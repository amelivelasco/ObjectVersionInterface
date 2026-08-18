const drawConfig = {
  imageSize: 44,

  marginX: 80,
  marginY: 70,

  gapX: 135,
  gapY: 105,

  pinOffset: 22,
  inductorPinOffset: 15,

  wireStroke: "#475569",
  wireStrokeWidth: 2,

  nodeRadius: 4,
  groundRadius: 6,

  nodeFill: "#dc2626",
  nodeStroke: "#7f1d1d",

  groundFill: "#dc2626",
  groundStroke: "#7f1d1d",

  nameFormat: { size: "11px", fill: "#0f172a", weight: "700", className: "bias-name" },

  fontFamily: "Arial, sans-serif",
  
  layoutCellMarginX: 90,
  layoutCellMarginY: 100,

  layoutCellGapX: 140,
  layoutCellGapY: 140,

  layoutCellPadding: 90,
  layoutCellElementGapX: 165,
  layoutCellElementGapY: 230,


  biasBranchOffset: 45,
  biasOutputGap: 12,
  biasPlacementSpacing: 55,

  componentValueFontSize: "9px",
  inductorValueOffsetY: 9,

  jrValueFontSize: "10px",
  jrValueOffsetY: 0,
};

function createSvg(width, height) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");

  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", "100%");
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

  svg.classList.add("circuit-svg");

  return svg;
}

function createSvgElement(name, attrs = {}) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", name);
  Object.entries(attrs).forEach(([key, value]) => {el.setAttribute(key, value); });
  return el;
}

function estimateColumns(elementCount) {
  if (elementCount <= 0) { return 1; }

  return Math.ceil(Math.sqrt(elementCount * 1.8));
}

function buildOrderedLayout(elements) {
  const count = elements.length;
  const columns = estimateColumns(count);
  const rows = Math.ceil(count / columns);

  const canvasWidth = drawConfig.marginX * 2 + Math.max(0, columns - 1) * drawConfig.gapX;
  const canvasHeight = drawConfig.marginY * 2 +  Math.max(0, rows - 1) * drawConfig.gapY;

  const placed = elements.map((element, index) => {
    const row = Math.floor(index / columns);
    const indexInRow = index % columns;

    const direction = 1;
    const col = indexInRow ;
    const x = drawConfig.marginX + col * drawConfig.gapX;
    const y = drawConfig.marginY + row * drawConfig.gapY;
    const inputPin = {
      x: x - direction * drawConfig.pinOffset,
      y,
      net: element.net_in,
    };

    const outputPin = {
      x: x + direction * drawConfig.pinOffset,
      y,
      net: element.net_out,
    };

    return {
      ...element,
      index,
      x,
      y,
      row,
      col,
      direction,
      inputPin,
      outputPin,
    };
  });

  return {
    placed,
    canvasWidth: Math.max(
      900,
      canvasWidth
    ),
    canvasHeight: Math.max(
      550,
      canvasHeight
    ),
  };
}

function orthogonalPath(a, b) {
  return [
    `M ${a.x} ${a.y}`,
    `H ${b.x}`,
    `V ${b.y}`,
  ].join(" ");
}


function setupPanZoom(svg, fullWidth, fullHeight) {
  let viewBox = {
    x: 0,
    y: 0,
    width: fullWidth,
    height: fullHeight,
  };

  let isPanning = false;
  let start = null;

  function applyViewBox() {
    svg.setAttribute(
      "viewBox",
      `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`
    );
  }

  function clientToSvgPoint(event) {
    const rect = svg.getBoundingClientRect();

    const x =
      viewBox.x +
      ((event.clientX - rect.left) / rect.width) * viewBox.width;

    const y =
      viewBox.y +
      ((event.clientY - rect.top) / rect.height) * viewBox.height;

    return { x, y };
  }

  svg.addEventListener("wheel", (event) => {
    event.preventDefault();

    const point = clientToSvgPoint(event);
    const zoomFactor = event.deltaY < 0 ? 0.88 : 1.14;

    const newWidth = viewBox.width * zoomFactor;
    const newHeight = viewBox.height * zoomFactor;

    viewBox.x = point.x - ((point.x - viewBox.x) / viewBox.width) * newWidth;
    viewBox.y = point.y - ((point.y - viewBox.y) / viewBox.height) * newHeight;
    viewBox.width = newWidth;
    viewBox.height = newHeight;

    applyViewBox();
  });

  svg.addEventListener("mousedown", (event) => {
    isPanning = true;
    svg.classList.add("is-panning");

    start = {
      clientX: event.clientX,
      clientY: event.clientY,
      viewBoxX: viewBox.x,
      viewBoxY: viewBox.y,
    };
  });

  window.addEventListener("mousemove", (event) => {
    if (!isPanning || !start) {
      return;
    }

    const rect = svg.getBoundingClientRect();

    const dx =
      ((event.clientX - start.clientX) / rect.width) * viewBox.width;

    const dy =
      ((event.clientY - start.clientY) / rect.height) * viewBox.height;

    viewBox.x = start.viewBoxX - dx;
    viewBox.y = start.viewBoxY - dy;

    applyViewBox();
  });

  window.addEventListener("mouseup", () => {
    isPanning = false;
    svg.classList.remove("is-panning");
    start = null;
  });

  applyViewBox();
}

function applyJJPairSpacing(jj, resistor, pairSpacing = 70) {
  const centerX = (jj.x + resistor.x) / 2;

  jj.x = centerX - pairSpacing / 2;
  resistor.x = centerX + pairSpacing / 2;
}

function applyJJPairSpacingToPlaced(placed, pairSpacing = 70) {
  for (let index = 0; index < placed.length - 1; index++) {
    const jj = placed[index];
    const resistor = placed[index + 1];

    if (!isJJResistorPair(jj, resistor)) {
      continue;
    }

    applyJJPairSpacing(jj, resistor, pairSpacing);
    index++;
  }
}

function enableRightClickNavigation(svg) {
  if (!svg) return;

  function getContentBBox() {
    const content = svg.querySelector(".circuit-world, .viewport, .zoom-layer, g") || svg;
    try { return content.getBBox(); } catch { return null; }
  }

  function getViewBox() {
    const vb = svg.viewBox.baseVal;
    if (vb?.width && vb?.height) return { x: vb.x, y: vb.y, width: vb.width, height: vb.height };

    const r = svg.getBoundingClientRect();
    return { x: 0, y: 0, width: r.width, height: r.height };
  }

  function screenToSvg(clientX, clientY) {
    const p = svg.createSVGPoint();
    p.x = clientX;
    p.y = clientY;
    return p.matrixTransform(svg.getScreenCTM().inverse());
  }

  function centerAt(clientX, clientY) {
    const p = screenToSvg(clientX, clientY);
    const vb = getViewBox();
    svg.setAttribute("viewBox", `${p.x - vb.width / 2} ${p.y - vb.height / 2} ${vb.width} ${vb.height}`);
  }

  function fitCircuit() {
    const box = getContentBBox();
    if (!box || !box.width || !box.height) return;

    const padding = Math.max(box.width, box.height) * 0.06;
    svg.setAttribute(
      "viewBox",
      `${box.x - padding} ${box.y - padding} ${box.width + padding * 2} ${box.height + padding * 2}`
    );
  }

  svg.addEventListener("contextmenu", e => {
    e.preventDefault();

    if (e.ctrlKey) {
      fitCircuit();        // Ctrl + right click
      return;
    }

    centerAt(e.clientX, e.clientY); // Right click
  });
}

function setupWireSelection(svg, hitMargin = 3) {
  if (!svg) { return; }

  if (typeof svg.__wireSelectionCleanup === "function"
  ) { svg.__wireSelectionCleanup(); }

  const wires = Array.from(svg.querySelectorAll(".edge"));
  let selectedWires = new Set();

  const hitAreas = [];
  const listeners = [];

  function addTrackedListener(element, eventName, handler
  ) {
    element.addEventListener(eventName, handler);

    listeners.push({element, eventName, handler,});
  }

  function restoreWire(wire) {
    wire.setAttribute("stroke", wire.dataset.originalStroke || drawConfig.wireStroke);

    wire.setAttribute("stroke-width", wire.dataset.originalStrokeWidth || drawConfig.wireStrokeWidth);

    wire.classList.remove("is-wire-selected");
  }

  function clearCurrentSelection() {
    for (const selectedWire of selectedWires
    ) { restoreWire(selectedWire);}
    selectedWires.clear();
  }

  function selectWireChain(startingWire) {
    const connected = collectConnectedWireChain(startingWire, wires);
    selectedWires = new Set(connected);

    for (const segment of selectedWires
    ) {
      segment.setAttribute("stroke", "red");
      segment.setAttribute( "stroke-width", Number(segment.dataset.originalStrokeWidth || drawConfig.wireStrokeWidth) + 2);
      segment.classList.add("is-wire-selected");
    }
  }

  function handleWireMouseDown(event) {
    event.preventDefault();
    event.stopPropagation();
  }

  function handleWireClick(event, wire ) {
    event.preventDefault();
    event.stopPropagation();

    if (selectedWires.has(wire)
    ) {
      clearCurrentSelection();
      return;
    }

    clearCurrentSelection();
    selectWireChain(wire);
  }

  for (const wire of wires) {

    if (!wire.dataset.originalStroke
    ) {
      wire.dataset.originalStroke = wire.getAttribute("stroke") || drawConfig.wireStroke;
    }

    if (!wire.dataset.originalStrokeWidth
    ) { wire.dataset.originalStrokeWidth = wire.getAttribute("stroke-width") || drawConfig.wireStrokeWidth; }
    wire.style.cursor = "pointer";
    wire.style.pointerEvents = "stroke";

    const hitArea = wire.cloneNode(false);

    hitArea.removeAttribute("id");
    hitArea.classList.remove("edge", "is-wire-selected");
    hitArea.classList.add("wire-hit-area");
    hitArea.setAttribute("fill", "none");
    hitArea.setAttribute("stroke", "transparent");

    addNetTooltip(hitArea, wire.dataset.net);

    const visibleStrokeWidth = Number(wire.dataset.originalStrokeWidth || drawConfig.wireStrokeWidth);
    hitArea.setAttribute("stroke-width", visibleStrokeWidth + hitMargin * 2);
    hitArea.setAttribute("stroke-linecap", "round");
    hitArea.setAttribute("stroke-linejoin", "round");
    hitArea.setAttribute("pointer-events", "stroke");
    hitArea.setAttribute("aria-hidden", "true");
    hitArea.style.cursor = "pointer";

    hitArea.style.pointerEvents = "stroke";

    wire.parentNode.insertBefore(hitArea, wire.nextSibling);

    hitAreas.push(hitArea);

    const clickVisibleWire =
      (event) => handleWireClick(event, wire);

    const clickHitArea =
      (event) => handleWireClick(event, wire);

    addTrackedListener(wire, "mousedown",handleWireMouseDown);
    addTrackedListener(wire, "click", clickVisibleWire);
    addTrackedListener(hitArea, "mousedown", handleWireMouseDown);
    addTrackedListener(hitArea, "click", clickHitArea);
  }

  svg.__wireSelectionCleanup =
    function cleanupWireSelection() {
      clearCurrentSelection();
      for ( const { element, eventName, handler, } of listeners
      ) { element.removeEventListener(eventName, handler);}
      for (const hitArea of hitAreas
      ) { hitArea.remove(); }
      svg.__wireSelectionCleanup =
        null;
    };
}


function setupInterCellTerminalHighlights(svg) {
  if (!svg) return;

  const triggers = [...svg.querySelectorAll(".terminal-net-dot[data-net]")];
  const netElements = [...svg.querySelectorAll("[data-net]")].filter(element => element.dataset.net);
  const original = new Map();
  let activeNet = null;

  for (const element of netElements) {
    original.set(element, {
      stroke: element.getAttribute("stroke"),
      strokeWidth: element.getAttribute("stroke-width"),
      fill: element.getAttribute("fill"),
      radius: element.getAttribute("r"),
      fontSize: element.getAttribute("font-size"),
      fontWeight: element.getAttribute("font-weight"),
      filter: element.style.filter,
    });
  }

  function restore(element) {
    const values = original.get(element);
    if (!values) return;

    const attributes = {
      stroke: values.stroke,
      "stroke-width": values.strokeWidth,
      fill: values.fill,
      r: values.radius,
      "font-size": values.fontSize,
      "font-weight": values.fontWeight,
    };

    for (const [name, value] of Object.entries(attributes)) {
      if (value === null) element.removeAttribute(name);
      else element.setAttribute(name, value);
    }

    element.style.filter = values.filter || "";
    element.classList.remove("is-net-highlighted");
  }

  function clearHighlight() {
    for (const element of netElements) restore(element);
    activeNet = null;
  }

  function highlightNet(net) {
    for (const element of netElements) restore(element);

    activeNet = net;

    for (const element of netElements) {
      if (String(element.dataset.net).trim() !== net) continue;

      const tag = element.tagName.toLowerCase();
      element.classList.add("is-net-highlighted");

      if (tag === "line" || tag === "path") {
        const width = Number(original.get(element)?.strokeWidth || drawConfig.wireStrokeWidth);
        element.setAttribute("stroke", "#ef4444");
        element.setAttribute("stroke-width", width + 2);
        element.style.filter = "drop-shadow(0 0 2px rgba(239, 68, 68, 0.75))";
      } else if (tag === "circle") {
        element.setAttribute("r", "8");
        element.setAttribute("fill", "#facc15");
        element.setAttribute("stroke", "#ef4444");
        element.setAttribute("stroke-width", "3");
      } else if (tag === "text") {
        element.setAttribute("fill", "#dc2626");
        element.setAttribute("font-weight", "800");
      }
    }
  }

  for (const trigger of triggers) {
    trigger.style.cursor = "pointer";

    trigger.addEventListener("mousedown", event => {
      event.preventDefault();
      event.stopPropagation();
    });

    trigger.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();

      const net = String(trigger.dataset.net).trim();

      if (activeNet === net) clearHighlight();
      else highlightNet(net);
    });
  }

  svg.addEventListener("click", clearHighlight);
}

function formatComponentValue(element, source = "display") {
  const isValid = value => value !== null && value !== undefined && value !== "" && value !== -1 && !["none", "null", "undefined"].includes(String(value).trim().toLowerCase());

  let raw;

  if (source === "target") {
    raw = element?.target_value;
  } else if (source === "extracted") {
    raw = element?.extracted_value;
    if (!isValid(raw)) return "None";
  } else {
    raw = isValid(element?.extracted_value) ? element.extracted_value : element?.target_value;
  }

  if (!isValid(raw)) return "";

  const text = String(raw).trim();
  const type = getElementType(element);
  const format = value => Number(Number(value).toFixed(2)).toString();

  if (type === "L") {
    if (/p(?:h)?$/i.test(text)) return `${format(text.replace(/p(?:h)?$/i, ""))} pH`;
    if (/n(?:h)?$/i.test(text)) return `${format(text.replace(/n(?:h)?$/i, ""))} nH`;
    if (/µh$/i.test(text)) return `${format(text.replace(/µh$/i, ""))} µH`;

    const value = Number(text);
    return Number.isFinite(value) ? `${format(Math.abs(value) < 1e-6 ? value * 1e12 : value)} pH` : text;
  }

  if (type === "R") {
    if (/k(?:ohm|Ω)?$/i.test(text)) return `${format(text.replace(/k(?:ohm|Ω)?$/i, ""))} kΩ`;
    if (/(?:ohm|Ω)$/i.test(text)) return `${format(text.replace(/(?:ohm|Ω)$/i, ""))} Ω`;

    const value = Number(text);
    return Number.isFinite(value) ? `${format(value)} Ω` : text;
  }

  if (["JJ", "IB"].includes(type)) {
    if (/u(?:a)?$/i.test(text)) return `${format(text.replace(/u(?:a)?$/i, ""))} µA`;
    if (/µa$/i.test(text)) return `${format(text.replace(/µa$/i, ""))} µA`;
    if (/ma$/i.test(text)) return `${format(text.replace(/ma$/i, ""))} mA`;
    if (/a$/i.test(text)) return `${format(text.replace(/a$/i, ""))} A`;

    const value = Number(text);
    return Number.isFinite(value) ? `${format(Math.abs(value) < 1 ? value * 1e6 : value)} µA` : text;
  }

  const value = Number(text);
  return Number.isFinite(value) ? format(value) : text;
}