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

function getComponentRotation(element, componentType) {
  if (Number.isFinite(element.forcedRotation)) return element.forcedRotation;
  if (componentType === "IB" && Number.isFinite(element.biasRotation)) return element.biasRotation;
  if (componentType === "R" && element.net_out === "GND!") return 90;
  if (componentType === "JJ" && element.net_out !== "GND!") return 90;
  return 0;
}

function getResistorPath(element) {
  const resistorNumber = (element.pid || "").match(/\d+/)?.[0] || "";
  const resistorBasePath = (element.path || "").split("|")[0].replace(/\/J\d+$/, "");
  return `${resistorBasePath}/R${resistorNumber}`;
}

function createComponentTitle(element, componentType) {
  const title = createSvgElement("title");
  title.textContent = [
    `cir_name=${element.cir_name || ""}`,
    `path=${componentType === "R" ? getResistorPath(element) : element.path || ""}`,
    `net_in=${element.net_in || ""}`,
    `net_out=${element.net_out || ""}`,
    `target_val=${formatComponentValue(element, "target")}`,
    `extracted_val=${formatComponentValue(element, "extracted")}`,
  ].join("\n");
  return title;
}

function drawInductorUnderlay(g, element) {
  g.appendChild(createSvgElement("line", {
    x1: element.inputPin.x,
    y1: element.y,
    x2: element.outputPin.x,
    y2: element.y,
    stroke: drawConfig.wireStroke,
    "stroke-width": drawConfig.wireStrokeWidth,
    "stroke-linecap": "round",
    class: "inductor-wire-underlay",
  }));
}

function drawStandaloneResistorLabels(g, element, options) {
  if (!isStandaloneResistor(element) || options.suppressResistorLabels) return;

  if (element.cir_name) {
    drawComponentValueText(g, element.cir_name, element.x, element.y + 15, drawConfig.nameFormat);
  }

  drawComponentValueText(g, formatComponentValue(element), element.x, element.y - 12, {
    size: drawConfig.componentValueFontSize,
    fill: "#7c2d12",
    className: "resistor-value",
  });
}

function drawBiasLabels(g, element, halfSize) {
  drawComponentValueText(g, element.cir_name, element.x, element.y - halfSize - 8, drawConfig.nameFormat);
  drawComponentValueText(g, formatComponentValue(element), element.x, element.y - 18, {
    size: drawConfig.componentValueFontSize,
    fill: "#7c2d12",
    className: "bias-value",
  });
}

function drawInductorLabels(g, element) {
  drawComponentValueText(g, formatComponentValue(element), element.x, element.y - 10, {
    size: drawConfig.componentValueFontSize,
    fill: "#7c2d12",
    className: "inductor-value",
  });

  if (element.cir_name) {
    drawComponentValueText(g, element.cir_name, element.x, element.y + 12, drawConfig.nameFormat);
  }
}

function drawComponentLabels(g, element, componentType, options, halfSize) {
  if (componentType === "R") drawStandaloneResistorLabels(g, element, options);
  else if (componentType === "IB") drawBiasLabels(g, element, halfSize);
  else if (componentType === "L") drawInductorLabels(g, element);
}

function drawComponent(layer, element, options = {}) {
  const halfSize = drawConfig.imageSize / 2;
  const componentType = getElementType(element);
  const g = createSvgElement("g", { class: `component component-${element.type}` });

  const image = createSvgElement("image", {
    href: element.image,
    x: element.x - halfSize,
    y: element.y - halfSize,
    width: drawConfig.imageSize,
    height: drawConfig.imageSize,
    class: "component-image",
  });

  const rotation = getComponentRotation(element, componentType);
  if (rotation) image.setAttribute("transform", `rotate(${rotation} ${element.x} ${element.y})`);

  g.appendChild(createComponentTitle(element, componentType));

  if (componentType === "L") drawInductorUnderlay(g, element);

  g.appendChild(image);
  drawComponentLabels(g, element, componentType, options, halfSize);

  layer.appendChild(g);

  return {
    group: g,
    image,
    center: { x: element.x, y: element.y },
    top: { x: element.x, y: element.y - halfSize },
    bottom: { x: element.x, y: element.y + halfSize },
    left: { x: element.x - halfSize, y: element.y },
    right: { x: element.x + halfSize, y: element.y },
  };
}

function resetTerminalLeadState(placed) {
  for (const element of placed) {
    element.inputLeadPoint = null;
    element.outputLeadPoint = null;
    element.inputNeedsLead = false;
    element.outputNeedsLead = false;
  }
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
  autoOrientCellsTowardSharedTerminals(placed, placedCells, svg);


  internalWireLayer.replaceChildren();
  dotLayer.replaceChildren();
  labelLayer.replaceChildren();

  for (const element of placed) { element.inputLeadPoint = null; element.outputLeadPoint = null; element.inputNeedsLead = false; element.outputNeedsLead = false; }

  orientStandaloneResistorsGlobally(placed);
  drawTerminalStubs(internalWireLayer, labelLayer, dotLayer, placed, 25);
  drawConnectionsInsideLayoutCells(internalWireLayer, labelLayer, placed);
  snapBiasElementsToNearestNet(internalWireLayer, placed);
  drawBiasLocalConnections(internalWireLayer, labelLayer, placed);
  connectBiasStubsToInductors(internalWireLayer, labelLayer, placed);
  drawSubcircuits(placed, componentLayer, internalWireLayer, labelLayer);
  drawInterCellConnections(svg, externalWireLayer, placed, 14);
  drawBiasBasedPolaritySigns(labelLayer, placed);
  setupInterCellTerminalHighlights(svg);
  setupWireSelection(svg);
  setupPanZoom(svg, canvasWidth, canvasHeight);
  enableRightClickNavigation(svg);
}


function drawJRpairs(current, next, componentLayer, wireLayer, labelLayer) {
  const grounded = isGroundNet(current.net_out);
  const reversed = !grounded && (current.inlineReversed === true || current.layoutReversed === true || Number(current.electricalDirection) < 0);

  current.electricalDirection = next.electricalDirection = reversed ? -1 : 1;

  const geometry = getJJPairGeometry(current, next, 25);
  const layoutInstance = getLayoutInstance(current);

  if (grounded) {
    current.forcedRotation = 0;
  } else if (reversed) {
    current.forcedRotation = 270;
  } else {
    current.forcedRotation = 90;
  }
  let nextRotation = 0;
  if (grounded) {
    nextRotation = 90;
  } else if (reversed) {
    nextRotation = 180;
  }
  next.forcedRotation = nextRotation;

  drawComponent(componentLayer, current);
  drawComponent(componentLayer, next, { suppressResistorLabels: true });

  const value = formatComponentValue(current);

  if (value) {
    const centerX = (current.x + next.x) / 2;
    const centerY = (geometry.topMiddle.y + geometry.bottomMiddle.y) / 2 + drawConfig.jrValueOffsetY;

    if (current.cir_name) {
      drawComponentValueText(labelLayer, current.cir_name, centerX, centerY + 10, drawConfig.nameFormat);
    }

    drawComponentValueText(labelLayer, value, centerX, centerY - 10, {
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

function getNetKey(component, net) {
  return [getLayoutInstance(component), net,].join("|");
}

function buildNetUseCounts(placed) {
  const counts = new Map();
  for (const component of placed) {
    if (isBiasElement(component) || isGeneratedResistor(component)) continue;
    for (const net of [component.net_in, component.net_out]) {
      if (!net || isGroundNet(net)) continue;
      const key = getNetKey(component, net);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return counts;
}

function isTerminalNet(component, net, netUseCounts) {
  if (!net || isGroundNet(net)) return false;
  if (String(net).trim().toLowerCase() === "terminal") return true;
  return (netUseCounts.get(getNetKey(component, net)) ?? 0) === 1;
}

function addTerminalSegment(segmentsByNet, net, a, b, options = {}) {
  if (!net || !a || !b) return;
  if (!segmentsByNet.has(net)) segmentsByNet.set(net, []);
  segmentsByNet.get(net).push({ a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y }, net, layoutInstance: options.layoutInstance ?? null, source: options.source ?? "wire" });
}

function pointLiesOnTerminalSegment(point, segment, epsilon = 0.5) {
  const horizontal = Math.abs(segment.a.y - segment.b.y) < epsilon;
  if (horizontal) return Math.abs(point.y - segment.a.y) < epsilon && point.x >= Math.min(segment.a.x, segment.b.x) - epsilon && point.x <= Math.max(segment.a.x, segment.b.x) + epsilon;

  const vertical = Math.abs(segment.a.x - segment.b.x) < epsilon;
  if (!vertical) return false;
  return Math.abs(point.x - segment.a.x) < epsilon && point.y >= Math.min(segment.a.y, segment.b.y) - epsilon && point.y <= Math.max(segment.a.y, segment.b.y) + epsilon;
}

function closestPointOnTerminalSegment(point, segment, epsilon = 0.5) {
  if (Math.abs(segment.a.y - segment.b.y) < epsilon) {
    return { x: Math.max(Math.min(segment.a.x, segment.b.x), Math.min(Math.max(segment.a.x, segment.b.x), point.x)), y: segment.a.y };
  }

  if (Math.abs(segment.a.x - segment.b.x) < epsilon) {
    return { x: segment.a.x, y: Math.max(Math.min(segment.a.y, segment.b.y), Math.min(Math.max(segment.a.y, segment.b.y), point.y)) };
  }
  return null;
}

function collectTerminalWireSegments(wireLayer, segmentsByNet) {
  for (const child of Array.from(wireLayer.children)) {
    const net = child.dataset.net;
    const kind = child.dataset.kind || "";
    if (!net || kind.includes("terminal-stub")) continue;
    for (const segment of extractWireSegmentsFromElement(child)) addTerminalSegment(segmentsByNet, net, segment.a, segment.b, { source: "svg" });
  }
}

function collectJJTerminalSegments(placed, segmentsByNet) {
  for (let index = 0; index < placed.length - 1; index++) {
    const jj = placed[index];
    const resistor = placed[index + 1];
    if (!isJJResistorPair(jj, resistor)) continue;

    const geometry = getJJPairGeometry(jj, resistor, 25);
    const layoutInstance = getLayoutInstance(jj);
    addTerminalSegment(segmentsByNet, jj.net_in, geometry.topAtJJ, geometry.topAtResistor, { source: "jr-input-rail", layoutInstance });
    addTerminalSegment(segmentsByNet, jj.net_out, geometry.bottomAtJJ, geometry.bottomAtResistor, { source: "jr-output-rail", layoutInstance });
    index++;
  }
}

function getTerminalRepairCandidates(component, oppositePin, net, context) {
  const componentLayout = getLayoutInstance(component);
  let candidates = (context.segmentsByNet.get(net) || []).filter(segment => !segment.layoutInstance || segment.layoutInstance === componentLayout);
  const awayFromOpposite = candidates.filter(segment => !oppositePin || !pointLiesOnTerminalSegment(oppositePin, segment, context.epsilon));
  if (awayFromOpposite.length > 0) candidates = awayFromOpposite;
  return candidates;
}

function findTerminalRepairTarget(outwardPoint, candidates, epsilon) {
  let bestTarget = null;
  let bestDistance = Infinity;

  for (const segment of candidates) {
    const target = closestPointOnTerminalSegment(outwardPoint, segment, epsilon);
    if (!target) continue;
    const distance = Math.abs(outwardPoint.x - target.x) + Math.abs(outwardPoint.y - target.y);
    if (distance >= bestDistance) continue;
    bestDistance = distance;
    bestTarget = target;
  }
  return bestTarget;
}

function connectMissingTerminalSide(component, pin, oppositePin, net, side, context) {
  if (!pin || !net || isGroundNet(net) || isTerminalNet(component, net, context.netUseCounts)) return;

  const existing = context.segmentsByNet.get(net) || [];
  if (existing.some(segment => pointLiesOnTerminalSegment(pin, segment, context.epsilon))) return;

  const candidates = getTerminalRepairCandidates(component, oppositePin, net, context);
  if (!candidates.length) return;

  const direction = pin.x < component.x ? -1 : 1;
  const outwardPoint = { x: pin.x + direction * context.stubLength, y: pin.y };
  const bestTarget = findTerminalRepairTarget(outwardPoint, candidates, context.epsilon);
  if (!bestTarget) return;

  const routePoints = simplifyOrthogonalPoints([{ ...pin }, outwardPoint, { x: outwardPoint.x, y: bestTarget.y }, bestTarget]);
  if (routePoints.length < 2) return;

  drawPath(context.wireLayer, pin, bestTarget, { stroke: drawConfig.wireStroke, pathData: routePointsToPathData(routePoints), net, kind: `inductor-${side}-missing-connection` });

  const layoutInstance = getLayoutInstance(component);
  for (const segment of routePointsToSegments(routePoints)) addTerminalSegment(context.segmentsByNet, net, segment.a, segment.b, { source: "inductor-repair", layoutInstance });
}

function repairMissingTerminalSides(placed, context) {
  context.segmentsByNet = new Map();
  collectTerminalWireSegments(context.wireLayer, context.segmentsByNet);
  collectJJTerminalSegments(placed, context.segmentsByNet);

  for (const component of placed) {
    if (getElementType(component) !== "L") continue;
    connectMissingTerminalSide(component, component.inputPin, component.outputPin, component.net_in, "input", context);
    connectMissingTerminalSide(component, component.outputPin, component.inputPin, component.net_out, "output", context);
  }
}

function drawTerminalDot(component, net, stubEnd, context) {
  const layoutInstance = getLayoutInstance(component);
  const dotKey = [layoutInstance, net, stubEnd.x.toFixed(3), stubEnd.y.toFixed(3)].join("|");
  if (context.drawnDots.has(dotKey)) return;

  context.drawnDots.add(dotKey);
  drawDot(context.dotLayer, stubEnd, { radius: 5.5, fill: drawConfig.nodeFill, stroke: drawConfig.nodeStroke, className: "terminal-net-dot", net, layoutInstance, ownerId: component.id });
}

function drawTerminalNetLabel(component, pin, net, stubEnd, context) {
  const labelKey = getNetKey(component, net);
  if (context.labeledNets.has(labelKey)) return;

  context.labeledNets.add(labelKey);
  const labelX = (pin.x + stubEnd.x) / 2;
  const labelY = pin.y - 9;
  const label = drawComponentValueText(context.labelLayer, net, labelX, labelY - 15, { size: "11px", fill: "#7c2d12", className: "terminal-net-label" });
  if (!label) return;

  label.dataset.net = net;
  label.dataset.layoutInstance = getLayoutInstance(component);
  label.dataset.ownerId = component.id || "";
}

function drawTerminalStub(component, pin, net, side, context) {
  if (!pin || !net) return null;

  const direction = pin.x < component.x ? -1 : 1;
  const stubEnd = { x: pin.x + direction * context.stubLength, y: pin.y };
  drawLine(context.wireLayer, context.labelLayer, component, pin, stubEnd, { net, kind: `inductor-${side}-terminal-stub`, stroke: drawConfig.wireStroke });
  drawTerminalDot(component, net, stubEnd, context);
  drawTerminalNetLabel(component, pin, net, stubEnd, context);
  return stubEnd;
}

function drawTerminalSide(component, side, context) {
  const isInput = side === "input";
  const pin = isInput ? component.inputPin : component.outputPin;
  const net = isInput ? component.net_in : component.net_out;
  if (!isTerminalNet(component, net, context.netUseCounts)) return;

  const leadPoint = drawTerminalStub(component, pin, net, side, context);
  if (isInput) {
    component.inputLeadPoint = leadPoint;
    component.inputNeedsLead = Boolean(leadPoint);
    return;
  }

  component.outputLeadPoint = leadPoint;
  component.outputNeedsLead = Boolean(leadPoint);
}

function drawInductorTerminalStubs(placed, context) {
  for (const component of placed) {
    if (!supportsTerminalStubs(component)) continue;
    drawTerminalSide(component, "input", context);
    drawTerminalSide(component, "output", context);
  }
}

function drawTerminalStubs(wireLayer, labelLayer, dotLayer, placed, stubLength = 45, repairMissingSides = false) {
  const context = {
    wireLayer, labelLayer, dotLayer, stubLength, epsilon: 0.5,
    netUseCounts: buildNetUseCounts(placed), labeledNets: new Set(), drawnDots: new Set(), segmentsByNet: null,
  };

  if (repairMissingSides) {
    repairMissingTerminalSides(placed, context);
    return;
  }

  drawInductorTerminalStubs(placed, context);
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
