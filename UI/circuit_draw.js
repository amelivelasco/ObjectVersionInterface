function drawPath(layer, a, b, options = {}) {
  const path = createSvgElement("path", {
    d: options.pathData || orthogonalPath(a, b),
    fill: "none",
    stroke: options.stroke || drawConfig.wireStroke,
    "data-original-stroke": options.stroke || drawConfig.wireStroke,
    "stroke-width": options.strokeWidth || drawConfig.wireStrokeWidth,
    "data-original-stroke-width": options.strokeWidth || drawConfig.wireStrokeWidth,
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "stroke-dasharray": options.dash || "",
    "data-net": options.net || "",
    "data-kind": options.kind || "",
    class: "edge",
  });

  addNetTooltip(path, options.net);
  layer.appendChild(path);
  return path;
}

function drawLine(lineLayer, labelLayer, element, a, b, options = {}) {
  const line = createSvgElement("line", {
    x1: a.x,
    y1: a.y,
    x2: b.x,
    y2: b.y,
    stroke: options.stroke || drawConfig.wireStroke,
    "data-original-stroke": options.stroke || drawConfig.wireStroke,
    "stroke-width": options.strokeWidth || drawConfig.wireStrokeWidth,
    "data-original-stroke-width": options.strokeWidth || drawConfig.wireStrokeWidth,
    "stroke-linecap": "round",
    "data-net": options.net || "",
    "data-kind": options.kind || "",
    class: "edge",
  });

  addNetTooltip(line, options.net);
  lineLayer.appendChild(line);
  return line;
}

function drawDot(layer, point, options = {}) {
  const dot =
    createSvgElement(
      "circle",
      {
        cx: point.x,
        cy: point.y,
        r: options.radius ?? drawConfig.nodeRadius,
        fill: options.fill || drawConfig.nodeFill,
        stroke: options.stroke || drawConfig.nodeStroke,
        "stroke-width": options.strokeWidth ?? 1.5,
        class: options.className || "node-dot",
      }
    );

  if (options.net) {
    dot.dataset.net = options.net;
  }

  if (options.layoutInstance) {
    dot.dataset.layoutInstance = options.layoutInstance;
  }

  if (options.ownerId) {
    dot.dataset.ownerId = options.ownerId;
  }
  if (
    options.focusable !== false
  ) {
    dot.setAttribute("tabindex", "0");
  }
  layer.appendChild(dot);
  return dot;
}

function drawLabel(labelLayer, text, x, y, options = {}) {
  if (!text) return null;

  const label = createSvgElement("text", {
    x, y,
    "data-net": options.net || text,
    "data-layout-instance": options.layoutInstance || "",
    "text-anchor": options.anchor || "middle",
    "dominant-baseline": "middle",
    "font-family": drawConfig.fontFamily,
    "font-size": options.size || "9px",
    fill: options.fill || "#334155",
    stroke: options.background || "#ffffff",
    "stroke-width": options.backgroundWidth || 4,
    "paint-order": "stroke",
    "stroke-linejoin": "round",
    class: "net-label",
  });

  label.textContent = text;
  labelLayer.appendChild(label);
  return label;
}

function formatComponentValue(element, overrideValue) {
  const raw = overrideValue !== undefined ? overrideValue : element?.value;
  if (raw === null || raw === undefined || raw === "" || raw === -1) return "";

  const text = String(raw).trim();
  if (!text || ["none", "null"].includes(text.toLowerCase())) return "";

  const type = getElementType(element);
  const format = value => Number(Number(value).toFixed(2)).toString();

  if (type === "L") {
    if (/p(?:h)?$/i.test(text)) return `${format(text.replace(/p(?:h)?$/i, ""))} pH`;
    if (/n(?:h)?$/i.test(text)) return `${format(text.replace(/n(?:h)?$/i, ""))} nH`;
    if (/µh$/i.test(text)) return `${format(text.replace(/µh$/i, ""))} µH`;
    if (/[a-zA-Zµ]$/.test(text)) return text;

    const value = Number(text);
    if (!Number.isFinite(value)) return text;
    return `${format(Math.abs(value) < 1e-6 ? value * 1e12 : value)} pH`;
  }

  if (["R", "JJ", "IB"].includes(type)) {
    if (/u(?:a)?$/i.test(text)) return `${format(text.replace(/u(?:a)?$/i, ""))} µA`;
    if (/µa$/i.test(text)) return `${format(text.replace(/µa$/i, ""))} µA`;
    if (/ma$/i.test(text)) return `${format(text.replace(/ma$/i, ""))} mA`;
    if (/a$/i.test(text)) return `${format(text.replace(/a$/i, ""))} A`;

    const value = Number(text);
    if (!Number.isFinite(value)) return text;
    return `${format(Math.abs(value) < 1 ? value * 1e6 : value)} µA`;
  }

  const value = Number(text);
  return Number.isFinite(value) ? format(value) : text;
}

function drawComponentValueText(parent, text, x, y, options = {}) {
  if (!text) { return null;}

  const valueText =
    createSvgElement(
      "text",
      {
        x,
        y,
        "text-anchor": "middle",
        "dominant-baseline": "middle",
        "font-family": drawConfig.fontFamily,
        "font-size": options.size || drawConfig .componentValueFontSize,
        "font-weight": options.weight || "700",
        fill: options.fill || "#334155",
        stroke: options.background || "#f8fafc",
        "stroke-width": options.backgroundWidth ?? 3,
        "paint-order": "stroke",
        "stroke-linejoin": "round",
        class: options.className || "component-value",
        "pointer-events":"none",
      }
    );

  valueText.textContent = text;
  parent.appendChild(valueText);
  return valueText;
}

function drawComponent(layer, element, jjval = -1) {
  const halfSize = drawConfig.imageSize / 2;
  const g = createSvgElement("g", { class: `component component-${element.type}`,});

  const image = createSvgElement("image", {
    href: element.image,
    x: element.x - halfSize,
    y: element.y - halfSize,
    width: drawConfig.imageSize,
    height: drawConfig.imageSize,
    class: "component-image",
  });

  const componentType = getElementType(element);
  let rotation = 0;

  if (componentType === "R" && element.net_out === "GND!") rotation = 90;
  if (componentType === "JJ" && element.net_out !== "GND!") rotation = 90;
  if (componentType === "IB" && Number.isFinite(element.biasRotation)) rotation = element.biasRotation;
  if (Number.isFinite(element.forcedRotation)) rotation = element.forcedRotation;

  if (rotation) image.setAttribute("transform", `rotate(${rotation} ${element.x} ${element.y})`);

  const title = createSvgElement("title");
  const isResistor = componentType === "R";
  const resistorNumber = (element.pid || "").match(/\d+/)?.[0] || "";
  const resistorPath = `${(element.path || "").split("|")[0]}|R${(element.pid || "").match(/\d+/)?.[0] || ""}`;

  title.textContent = [
    `type=${element.type?.[0] || ""}`,
    `pid=${isResistor ? `R${resistorNumber}` : element.pid || ""}`,
    `path=${isResistor ? resistorPath: element.path || ""}`,
    `net_in=${element.net_in || ""}`,
    `net_out=${element.net_out || ""}`,
    `value=${formatComponentValue(element, isResistor ? jjval : undefined)}`,
  ].join("\n");

  g.appendChild(title);

  if (componentType === "L") {
    const baseline =
      createSvgElement("line", {
        x1: element.inputPin.x,
        y1: element.y,
        x2: element.outputPin.x,
        y2: element.y,
        stroke: drawConfig.wireStroke,
        "stroke-width": drawConfig.wireStrokeWidth,
        "stroke-linecap": "round",
        class: "inductor-wire-underlay",
      });

    g.appendChild(baseline);
  }

  g.appendChild(image);

  if (componentType === "IB") {
    drawComponentValueText(g, formatComponentValue(element), element.x, element.y - 10,
      {
        size: drawConfig.componentValueFontSize,
        fill: "#7c2d12",
        className:"inductor-value",
      }
    );
  }

  if (
    componentType === "L"
  ) {
    drawComponentValueText(g, formatComponentValue(element), element.x, element.y - 10,
      {
        size: drawConfig.componentValueFontSize,
        fill: "#7c2d12",
        className: "inductor-value",
      }
    );

    if (element.path) {
      drawComponentValueText(g, element.path, element.x, element.y + 12,
        {
          size: drawConfig.componentValueFontSize,
          fill: "#7c2d12",
          className: "component-path",
        }
      );
    }
  }

  layer.appendChild(g);
  return {
    group: g,
    image,
    center: {x: element.x, y: element.y,},
    top: {x: element.x, y: element.y - halfSize,},
    bottom: {x: element.x, y: element.y + halfSize,},
    left: {x: element.x - halfSize, y: element.y,},
    right: {x: element.x + halfSize, y: element.y,},
  };
}

function drawCircuit(data) {
  const board = document.getElementById("drawing_board");
  board.innerHTML = "";

  if (!data || !Array.isArray(data.elements)) {
    board.textContent = "Circuit data is missing. Generate circuit_data.js first.";
    return;
  }

  if (!Array.isArray(data.layout_cells)
  ) {
    board.textContent = "Layout-cell data is missing from circuit_data.js.";
    return;
  }
  const {placedCells, canvasWidth, canvasHeight,} = buildLayoutCellLayout(data);
  const placed = buildPlacedElements(data, placedCells);

  applyJJPairSpacingToPlaced(placed, 70); 

  const svg = createSvg(canvasWidth, canvasHeight);
  board.appendChild(svg);
  const layoutCellLayer =createSvgElement("g",{class:"layout-cell-layer"});
  const internalWireLayer = createSvgElement("g",{class: "internal-wire-layer",});

  const externalWireLayer = createSvgElement("g", {class:"external-wire-layer",});
  const dotLayer = createSvgElement("g", { class: "dot-layer" });
  const componentLayer = createSvgElement("g", { class: "component-layer" });
  const labelLayer = createSvgElement("g", { class: "label-layer" });

  svg.appendChild(layoutCellLayer);
  svg.appendChild(internalWireLayer);

  svg.appendChild(externalWireLayer);
  svg.appendChild(dotLayer);
  svg.appendChild(componentLayer);
  svg.appendChild(labelLayer);

  placeBiasElementsAboveNetOut(placed);
  drawLayoutCellBoundaries(layoutCellLayer, placedCells);
  drawTerminalStubs(internalWireLayer, labelLayer, dotLayer, placed, 25);
  drawConnectionsInsideLayoutCells(internalWireLayer, labelLayer, placed);
  snapBiasElementsToNearestNet(internalWireLayer, placed);
  drawBiasLocalConnections(internalWireLayer, labelLayer, placed);
  connectBiasStubsToInductors(internalWireLayer, labelLayer, placed);
  drawSubcircuits(placed, componentLayer, internalWireLayer, labelLayer)
  // rotateCellInstance180(
  //   "I0::NDROM2",
  //   placed,
  //   placedCells,
  //   svg
  // );
  autoOrientCellsTowardSharedTerminals(placed, placedCells, svg);
  drawInterCellConnections(svg, externalWireLayer, placed, 14);
  drawBiasBasedPolaritySigns(labelLayer, placed );
  setupInterCellTerminalHighlights(svg);
  setupWireSelection(svg);
  setupPanZoom(svg, canvasWidth, canvasHeight);
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

function collectConnectedWireChain(startWire, allWires) {
  const visited = new Set();
  const result = [];

  const queue = [startWire];

  const startNet = startWire.dataset.net;

  while (queue.length > 0) {
    const current = queue.shift();

    if (visited.has(current)) { continue; }

    visited.add(current);
    result.push(current);

    const currentSegments = extractWireSegmentsFromElement(current);

    for (const other of allWires) {
      if (visited.has(other)) { continue; }

      if ( other.dataset.net !== startNet ) { continue; }

      const otherSegments = extractWireSegmentsFromElement(other);

      if (wiresTouch(currentSegments, otherSegments)
      ) { queue.push(other); }
    }
  }

  return result;
}


function wiresTouch(firstSegments, secondSegments) {
  const epsilon = 0.75;
  const between = (value, first, second) =>
    value >= Math.min(first, second) - epsilon &&
    value <= Math.max(first, second) + epsilon;

  function segmentsTouch(first, second) {
    const firstHorizontal = Math.abs(first.a.y - first.b.y) <= epsilon;
    const firstVertical = Math.abs(first.a.x - first.b.x) <= epsilon;
    const secondHorizontal = Math.abs(second.a.y - second.b.y) <= epsilon;
    const secondVertical = Math.abs(second.a.x - second.b.x) <= epsilon;

    if (firstHorizontal && secondHorizontal) {
      return Math.abs(first.a.y - second.a.y) <= epsilon &&
        Math.max(Math.min(first.a.x, first.b.x), Math.min(second.a.x, second.b.x)) <=
        Math.min(Math.max(first.a.x, first.b.x), Math.max(second.a.x, second.b.x)) + epsilon;
    }

    if (firstVertical && secondVertical) {
      return Math.abs(first.a.x - second.a.x) <= epsilon &&
        Math.max(Math.min(first.a.y, first.b.y), Math.min(second.a.y, second.b.y)) <=
        Math.min(Math.max(first.a.y, first.b.y), Math.max(second.a.y, second.b.y)) + epsilon;
    }

    if (firstHorizontal && secondVertical) {
      return between(second.a.x, first.a.x, first.b.x) &&
        between(first.a.y, second.a.y, second.b.y);
    }

    if (firstVertical && secondHorizontal) {
      return between(first.a.x, second.a.x, second.b.x) &&
        between(second.a.y, first.a.y, first.b.y);
    }

    return false;
  }

  for (const first of firstSegments) {
    for (const second of secondSegments) {
      if (segmentsTouch(first, second)) return true;
    }
  }

  return false;
}

function addNetTooltip(element, net) {
  net = String(net || "").trim();
  if (!net) return;

  const title = createSvgElement("title");
  title.textContent = net;
  element.appendChild(title);
}

function drawJRpairs(current, next, componentLayer, wireLayer, labelLayer) {
  const grounded = isGroundNet(current.net_out);
  const reversed = !grounded && (current.inlineReversed === true || current.layoutReversed === true || Number(current.electricalDirection) < 0);

  current.electricalDirection = next.electricalDirection = reversed ? -1 : 1;

  const geometry = getJJPairGeometry(current, next, 25);
  const layoutInstance = getLayoutInstance(current);

  current.forcedRotation = grounded ? 0 : reversed ? 270 : 90;
  next.forcedRotation = grounded ? 90 : reversed ? 180 : 0;

  drawComponent(componentLayer, current);
  drawComponent(componentLayer, next, current.value);

  const value = formatComponentValue(current);

  if (value) {
    const centerX = (current.x + next.x) / 2;
    const centerY = (geometry.topMiddle.y + geometry.bottomMiddle.y) / 2 + drawConfig.jrValueOffsetY;
    const resistorPath = `${(current.path || "").split("|")[0]}|R${(current.pid || "").match(/\d+/)?.[0] || ""}`;

    drawComponentValueText(labelLayer, current.path, current.x, current.y, {
      size: drawConfig.componentValueFontSize, fill: "#7c2d12", className: "jj-pathname",
    });

    drawComponentValueText(labelLayer, resistorPath, next.x, next.y, {
      size: drawConfig.componentValueFontSize, fill: "#7c2d12", className: "jj-pathname",
    });

    drawComponentValueText(labelLayer, value, centerX, centerY, {
      size: drawConfig.jrValueFontSize, weight: "700", fill: "#7c2d12",
      background: "#f8fafc", backgroundWidth: 4, className: "jr-jj-value",
    });
  }

  drawLine(wireLayer, labelLayer, current, geometry.jjTop, geometry.topAtJJ, {
    net: current.net_in, layoutInstance, kind: "jr-input",
  });

  drawLine(wireLayer, labelLayer, current, geometry.topAtJJ, geometry.topAtResistor, {
    net: current.net_in, layoutInstance, kind: "jr-input",
  });

  drawLine(wireLayer, labelLayer, current, geometry.topAtResistor, geometry.resistorTop, {
    net: current.net_in, layoutInstance, kind: "jr-input",
  });

  drawLabel(labelLayer, current.net_in, geometry.topMiddle.x, geometry.topMiddle.y, {
    net: current.net_in, layoutInstance, size: "8.5px", fill: "#334155",
  });

  drawLine(wireLayer, labelLayer, current, geometry.jjBottom, geometry.bottomAtJJ, {
    net: current.net_out, layoutInstance, kind: "jr-output",
  });

  drawLine(wireLayer, labelLayer, current, geometry.bottomAtJJ, geometry.bottomAtResistor, {
    net: current.net_out, layoutInstance, kind: "jr-output",
  });

  drawLine(wireLayer, labelLayer, current, geometry.bottomAtResistor, geometry.resistorBottom, {
    net: current.net_out, layoutInstance, kind: "jr-output",
  });

  if (grounded) {
    drawGNDStub(wireLayer, labelLayer, current, componentLayer, geometry.bottomMiddle.x, geometry.bottomMiddle.y);
  }

  drawLabel(labelLayer, current.net_out, geometry.bottomMiddle.x, geometry.bottomMiddle.y, {
    net: current.net_out, layoutInstance, size: "8.5px", fill: "#334155",
  });
}

function drawGNDStub( wireLayer, labelLayer, current, componentLayer, x, y) {
  const stubLength = 20;
  const stubEnd = { x: x, y: y + stubLength, };

  drawLine(wireLayer, labelLayer, current, { x, y, }, stubEnd,
    { net: "GND!", kind: "gnd-stub", stroke: drawConfig.nodeStroke,}
  );

  const img_ref = "../img/gnd_draw.png"
  const image = createSvgElement("image", {
    href: img_ref,
    x: x - 10,
    y: y + 10,
    width: drawConfig.imageSize/2,
    height: drawConfig.imageSize/2,
    class: "component-image",
  });

  const g = createSvgElement("g", { class: `component component-gnd`, });
  g.appendChild(image)
  componentLayer.appendChild(g);
  return stubEnd;
}


function drawSubcircuits(placed, componentLayer, wireLayer, labelLayer) {
  for (let i = 0; i < placed.length; i++) {
    const current = placed[i];
    const next = placed[i + 1];

    const currentType = Array.isArray(current.type) ? current.type[0] : current.type;
    const nextType = next && Array.isArray(next.type) ? next.type[0] : next?.type;
    const isJJResistorPair = currentType === "JJ" && nextType === "R" &&
        ( 
          next.source_component === current.id ||
          ( next.path === current.path && next.pid === current.pid )
        );

    if (isJJResistorPair) {
        drawJRpairs(current, next, componentLayer, wireLayer, labelLayer)
        i++;
        continue;
    }
    drawComponent(componentLayer, current);
  }
}

function drawTerminalStubs(wireLayer, labelLayer, dotLayer, placed, stubLength = 45, repairMissingSides = false
) {
  const netUseCounts = new Map();
  const labeledNets = new Set();
  const drawnDots = new Set();

  function getNetKey(component, net) {
    return [getLayoutInstance(component), net,].join("|");
  }


  for (const component of placed) {
    if (isBiasElement(component) || getElementType(component) === "R"
    ) { continue; }

    for (const net of [component.net_in, component.net_out,]) {
      if (!net || isGroundNet(net)) { continue; }
      const key = getNetKey(component, net);
      netUseCounts.set(key,(netUseCounts.get(key) ?? 0) + 1);
    }
  }

  function isTerminalNet(component, net) {
    if (!net || isGroundNet(net)) { return false;}
    if (String(net).trim().toLowerCase() === "terminal") { return true; }

    const key = getNetKey(component, net);

    return (netUseCounts.get(key) ?? 0) === 1;
  }

  if (repairMissingSides) {
    const epsilon = 0.5;
    const segmentsByNet = new Map();

    function addSegment(net, a, b, options = {}
    ) {
      if (!net || !a || !b
      ) { return; }

      if ( !segmentsByNet.has(net) ) {
        segmentsByNet.set(net, []);
      }

      segmentsByNet.get(net).push({a: { x: a.x, y: a.y, }, b: { x: b.x, y: b.y, },
          net, layoutInstance:options.layoutInstance ?? null, source: options.source ?? "wire",
        });
    }

    function pointLiesOnSegment(point, segment) {
      const horizontal = Math.abs(segment.a.y - segment.b.y) < epsilon;
      if (horizontal) {
        return ( Math.abs(point.y - segment.a.y) < epsilon &&
          point.x >= Math.min(segment.a.x, segment.b.x) - epsilon &&
          point.x <=  Math.max(segment.a.x, segment.b.x) + epsilon
        );
      }

      const vertical = Math.abs(segment.a.x - segment.b.x) < epsilon;

      if (vertical) {
        return (
          Math.abs(point.x - segment.a.x) < epsilon &&
          point.y >= Math.min(segment.a.y, segment.b.y) - epsilon &&
          point.y <= Math.max(segment.a.y, segment.b.y) + epsilon
        );
      }
      return false;
    }

    function closestPointOnSegment(point, segment) {
      const horizontal = Math.abs(segment.a.y - segment.b.y) < epsilon;

      if (horizontal) {
        return {
          x: Math.max(Math.min(segment.a.x, segment.b.x),
              Math.min(Math.max(segment.a.x, segment.b.x),point.x)
            ),
          y: segment.a.y,
        };
      }

      const vertical = Math.abs(segment.a.x - segment.b.x) < epsilon;
      if (vertical) {
        return {
          x: segment.a.x,
          y: Math.max(Math.min(segment.a.y, segment.b.y),
              Math.min(Math.max(segment.a.y, segment.b.y),
                point.y
              )
            ),
        };
      }
      return null;
    }

    for (const child of Array.from(wireLayer.children)
    ) {
      const net = child.dataset.net;
      const kind = child.dataset.kind || "";
      if (!net) { continue; }
      if (kind.includes("terminal-stub")) { continue; }
      const segments = extractWireSegmentsFromElement(child);
      for (const segment of segments) {
        addSegment(net, segment.a, segment.b, { source: "svg", });
      }
    }

    for (let index = 0; index < placed.length - 1; index++) {
      const jj = placed[index];
      const resistor = placed[index + 1];
      if (!isJJResistorPair(jj, resistor)
      ) { continue; }

      const geometry = getJJPairGeometry(jj, resistor, 25);
      const layoutInstance = getLayoutInstance(jj);
      addSegment(jj.net_in, geometry.topAtJJ, geometry.topAtResistor,
        { source: "jr-input-rail", layoutInstance, }
      );
      addSegment(jj.net_out, geometry.bottomAtJJ, geometry.bottomAtResistor,
        { source: "jr-output-rail", layoutInstance, }
      );
      index++;
    }

    function sideAlreadyConnected(pin, net) {
      const segments = segmentsByNet.get(net) || [];
      return segments.some((segment) => pointLiesOnSegment(pin, segment));
    }

    function connectMissingSide(component, pin, oppositePin, net, side) {
      if (!pin || !net || isGroundNet(net)
      ) { return; }
      if ( sTerminalNet(component, net)) { return; }
      if (sideAlreadyConnected(pin, net)) { return; }

      const componentLayout = getLayoutInstance(component);
      const allSegments = segmentsByNet.get(net) || [];
      let candidates = allSegments.filter((segment) => !segment.layoutInstance || segment.layoutInstance === componentLayout);
      const segmentsAwayFromOppositePin = candidates.filter((segment) =>!oppositePin || !pointLiesOnSegment(oppositePin, segment));

      if (segmentsAwayFromOppositePin.length > 0) { candidates = segmentsAwayFromOppositePin; }

      if (candidates.length === 0) {return;}

      const direction = pin.x < component.x ? -1 : 1;
      const outwardPoint = { x: pin.x + direction * stubLength, y: pin.y,};
      let bestTarget = null;
      let bestDistance = Infinity;

      for (const segment of candidates) {
        const target = closestPointOnSegment(outwardPoint, segment);

        if (!target) { continue; }
        const distance = Math.abs(outwardPoint.x - target.x) + Math.abs(outwardPoint.y - target.y);

        if (distance < bestDistance) {
          bestDistance = distance;
          bestTarget = target;
        }
      }

      if (!bestTarget) { return; }

      const routePoints = simplifyOrthogonalPoints([{...pin,}, outwardPoint, { x: outwardPoint.x, y: bestTarget.y,}, bestTarget,]);

      if (routePoints.length < 2) { return; }

      drawPath(wireLayer, pin, bestTarget,
        { stroke: drawConfig.wireStroke, pathData: routePointsToPathData(routePoints), net, kind:`inductor-${side}-missing-connection`,}
      );

      for (const segment of routePointsToSegments(routePoints)) {
        addSegment(net, segment.a, segment.b, { source: "inductor-repair", layoutInstance: componentLayout,});
      }
    }

    for (const component of placed) {
      if (getElementType(component) !== "L"
      ) { continue; }
      connectMissingSide(component, component.inputPin, component.outputPin, component.net_in, "input");
      connectMissingSide(component, component.outputPin, component.inputPin, component.net_out, "output");
    }

    return;
  }


  function drawStub(component, pin, net, side) {
    if (!pin || !net) { return null; }

    const direction = pin.x < component.x ? -1 : 1;
    const stubEnd = {x: pin.x + direction * stubLength, y: pin.y,};

    drawLine(wireLayer, labelLayer, component, pin,stubEnd,
      { net, kind: `inductor-${side}-terminal-stub`, stroke: drawConfig.wireStroke, }
    );

    const dotKey = [ getLayoutInstance(component), net, stubEnd.x.toFixed(3), stubEnd.y.toFixed(3),].join("|");

    if (!drawnDots.has( dotKey)
    ) {
      drawnDots.add(dotKey);
      drawDot(dotLayer,stubEnd,
        {
          radius: 5.5,
          fill: drawConfig.nodeFill,
          stroke: drawConfig.nodeStroke,
          className: "terminal-net-dot",
          net,
          layoutInstance: getLayoutInstance(component),
          ownerId: component.id,
        }
      );
    }
    const labelKey = getNetKey(component, net);

    if (!labeledNets.has(labelKey)
    ) {
      labeledNets.add(labelKey);
      const labelX = (pin.x + stubEnd.x) / 2;
      const labelY = pin.y - 9;

      const terminalLabel =
        drawComponentValueText(labelLayer, net, labelX, labelY - 15,
          { size: "11px", fill: "#7c2d12", className: "terminal-net-label", }
        );
      if (terminalLabel) {
        terminalLabel.dataset.net = net;
        terminalLabel.dataset.layoutInstance = getLayoutInstance(component);
        terminalLabel.dataset.ownerId = component.id || "";
      }
    }
    return stubEnd;
  }

  for (const component of placed) {
    if ( getElementType(component) !== "L" ) { continue;}

    if ( isTerminalNet(component, component.net_in) ) {
      component.inputLeadPoint = drawStub(component, component.inputPin, component.net_in, "input");
      component.inputNeedsLead = Boolean(component.inputLeadPoint);
    }

    if (isTerminalNet(component, component.net_out)) {
      component.outputLeadPoint = drawStub(component, component.outputPin, component.net_out, "output");
      component.outputNeedsLead = Boolean(component.outputLeadPoint);
    }
  }
}

window.addEventListener("DOMContentLoaded", () => {
  const board = document.getElementById("drawing_board");
  if (!window.circuitData || !Array.isArray(window.circuitData.elements)
  ) {
    board.textContent = "Circuit data is missing. Generate circuit_data.js first.";
    return;
  }
  drawCircuit(window.circuitData);
});
