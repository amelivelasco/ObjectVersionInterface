function getPinOffsetForElement(element) {
  const type = getElementType(element);

  if (type === "L") return drawConfig.inductorPinOffset + 10;
  if (type === "R") return drawConfig.imageSize / 2;

  return drawConfig.pinOffset + 10;
}

function isBiasElement(element) {
  return getElementType(element) === "IB";
}

function getLayoutInstance(element) {
  return (element.parentLayoutCell || element.layout_instance || element.layout_cell || "unassigned");
}

function isGeneratedResistor(element) {
  return getElementType(element) === "R" && 
    (element.generated_from_jj === true || Boolean(element.source_component) || Boolean(element.companion_of));
}

function isStandaloneResistor(element) {
  return getElementType(element) === "R" && !isGeneratedResistor(element);
}

function getManhattanDistance(first, second) {
  return (Math.abs(first.x - second.x) + Math.abs(first.y - second.y));
}


function getElementType(element) {
  return Array.isArray(element.type) ? element.type[0] : element.type;
}

function isJJResistorPair(jj, resistor) {
  if (!jj || !resistor) {
    return false;
  }

  return (getElementType(jj) === "JJ" && getElementType(resistor) === "R" &&
    (resistor.source_component === jj.id || resistor.companion_of === jj.id ||
      (resistor.path === jj.path &&  resistor.pid === jj.pid)
    )
  );
}

function getJJPairGeometry(jj, resistor, rise = 25, verticalGap = 70) {
  const halfSize = drawConfig.imageSize / 2;

  if (!isGroundNet(jj.net_out)) {
    const direction = Number(jj.electricalDirection ?? resistor.electricalDirection ?? 1) < 0 ? -1 : 1;
    const centerX = (jj.x + resistor.x) / 2, mainWireY = Math.min(jj.y, resistor.y);

    jj.x = resistor.x = centerX;
    jj.y = mainWireY;
    resistor.y = mainWireY + verticalGap;

    const reversed = jj.inlineReversed === true || jj.layoutReversed === true || Number(jj.electricalDirection) < 0;
    jj.forcedRotation = reversed ? 270 : 90;
    resistor.forcedRotation = reversed ? 180 : 0;
    jj.jrRotated = resistor.jrRotated = true;
    jj.jrOrientation = resistor.jrOrientation = "horizontal";
    jj.electricalDirection = resistor.electricalDirection = direction;

    const jjPinOffset = getPinOffsetForElement(jj), resistorPinOffset = getPinOffsetForElement(resistor);
    jj.inputPin = { x: jj.x - direction * jjPinOffset, y: jj.y, net: jj.net_in };
    jj.outputPin = { x: jj.x + direction * jjPinOffset, y: jj.y, net: jj.net_out };
    resistor.inputPin = { x: resistor.x - direction * resistorPinOffset, y: resistor.y, net: resistor.net_in };
    resistor.outputPin = { x: resistor.x + direction * resistorPinOffset, y: resistor.y, net: resistor.net_out };

    const jjTop = { x: jj.x - direction * halfSize, y: jj.y };
    const resistorTop = { x: resistor.x - direction * halfSize, y: resistor.y };
    const jjBottom = { x: jj.x + direction * halfSize, y: jj.y };
    const resistorBottom = { x: resistor.x + direction * halfSize, y: resistor.y };
    const inputX = centerX - direction * (halfSize + rise), outputX = centerX + direction * (halfSize + rise);
    const topAtJJ = { x: inputX, y: jj.y }, topAtResistor = { x: inputX, y: resistor.y };
    const bottomAtJJ = { x: outputX, y: jj.y }, bottomAtResistor = { x: outputX, y: resistor.y };
    const middleY = (jj.y + resistor.y) / 2;
    const topMiddle = { x: inputX, y: middleY }, bottomMiddle = { x: outputX, y: middleY };

    return {
      orientation: "horizontal", jjTop, resistorTop, jjBottom, resistorBottom, topAtJJ, topAtResistor,
      bottomAtJJ, bottomAtResistor, topMiddle, bottomMiddle,
      inputAnchors: [topMiddle, topAtJJ, topAtResistor],
      outputAnchors: [bottomMiddle, bottomAtJJ, bottomAtResistor],
    };
  }

  jj.jrRotated = resistor.jrRotated = false;
  jj.jrOrientation = resistor.jrOrientation = "vertical";

  const jjTop = { x: jj.x, y: jj.y - halfSize };
  const resistorTop = { x: resistor.x, y: resistor.y - halfSize };
  const jjBottom = { x: jj.x, y: jj.y + halfSize };
  const resistorBottom = { x: resistor.x, y: resistor.y + halfSize };
  const topY = Math.min(jjTop.y, resistorTop.y) - rise;
  const bottomY = Math.max(jjBottom.y, resistorBottom.y) + rise;
  const topAtJJ = { x: jj.x, y: topY };
  const topAtResistor = { x: resistor.x, y: topY };
  const bottomAtJJ = { x: jj.x, y: bottomY };
  const bottomAtResistor = { x: resistor.x, y: bottomY };
  const topMiddle = { x: (jj.x + resistor.x) / 2, y: topY };
  const bottomMiddle = { x: (jj.x + resistor.x) / 2, y: bottomY };

  return {
    orientation: "vertical", jjTop, resistorTop, jjBottom, resistorBottom, topAtJJ, topAtResistor,
    bottomAtJJ, bottomAtResistor, topMiddle, bottomMiddle,
    inputAnchors: [topMiddle, topAtJJ, topAtResistor],
    outputAnchors: [bottomMiddle, bottomAtJJ, bottomAtResistor],
  };
}

function addNetTerminal(terminalsByNet, net, terminal) {
  if (!net || isGroundNet(net)) return;
  if (!terminalsByNet.has(net)) terminalsByNet.set(net, []);
  terminalsByNet.get(net).push(terminal);
}

function collectJJResistorPairs(elements) {
  const elementsInPairs = new Set();
  const pairs = [];

  for (let index = 0; index < elements.length - 1; index++) {
    const current = elements[index];
    const next = elements[index + 1];
    if (!isJJResistorPair(current, next)) continue;

    const geometry = getJJPairGeometry(current, next, 25);
    pairs.push({ jj: current, resistor: next, geometry });
    elementsInPairs.add(current.id);
    elementsInPairs.add(next.id);
    index++;
  }

  return { pairs, elementsInPairs };
}

function addPairTerminals(pair, terminalsByNet) {
  const layoutInstance = getLayoutInstance(pair.jj);
  const horizontal = pair.geometry.orientation === "horizontal";
  const inputPoint = horizontal ? pair.geometry.topAtJJ : pair.geometry.topMiddle;
  const outputPoint = horizontal ? pair.geometry.bottomAtJJ : pair.geometry.bottomMiddle;
  const ownerId = `pair:${pair.jj.id}`;

  addNetTerminal(terminalsByNet, pair.jj.net_in, {
    net: pair.jj.net_in, kind: "in", element: pair.jj, ownerId, layoutInstance, point: inputPoint, candidatePoints: [inputPoint]
  });

  addNetTerminal(terminalsByNet, pair.jj.net_out, {
    net: pair.jj.net_out, kind: "out", element: pair.jj, ownerId, layoutInstance, point: outputPoint, candidatePoints: [outputPoint]
  });
}

function addElementInputTerminal(element, layoutInstance, terminalsByNet) {
  if (!element.net_in || !element.inputPin) return;
  const inputRoutingPoint = getTerminalRoutingPoint({ element, kind: "in" }, element.inputPin);

  addNetTerminal(terminalsByNet, element.net_in, {
    net: element.net_in, kind: "in", point: inputRoutingPoint, candidatePoints: [inputRoutingPoint],
    element, ownerId: element.id, layoutInstance
  });
}

function addElementOutputTerminal(element, layoutInstance, terminalsByNet) {
  if (!element.net_out || !element.outputPin) return;
  const outputRoutingPoint = getTerminalRoutingPoint({ element, kind: "out" }, element.outputPin);

  addNetTerminal(terminalsByNet, element.net_out, {
    net: element.net_out, kind: "out", point: outputRoutingPoint, candidatePoints: [outputRoutingPoint],
    element, ownerId: element.id, layoutInstance
  });
}

function shouldSkipNetTerminalElement(element, elementsInPairs) {
  return elementsInPairs.has(element.id) || isBiasElement(element);
}

function addRegularElementTerminals(element, elementsInPairs, terminalsByNet) {
  if (shouldSkipNetTerminalElement(element, elementsInPairs)) return;

  const layoutInstance = getLayoutInstance(element);
  addElementInputTerminal(element, layoutInstance, terminalsByNet);
  addElementOutputTerminal(element, layoutInstance, terminalsByNet);
}

function collectNetTerminals(elements) {
  const terminalsByNet = new Map();
  const { pairs, elementsInPairs } = collectJJResistorPairs(elements);

  for (const pair of pairs) addPairTerminals(pair, terminalsByNet);
  for (const element of elements) addRegularElementTerminals(element, elementsInPairs, terminalsByNet);

  return terminalsByNet;
}

function getTerminalPoints(terminal) {
  if (terminal.selectedPoint) {
    return [terminal.selectedPoint,];
  }

  if (Array.isArray(terminal.candidatePoints) && terminal.candidatePoints.length > 0) {
    return terminal.candidatePoints;
  }

  if (terminal.point) { return [terminal.point,];}

  return [];
}

function findBestTerminalConnection(firstTerminal, secondTerminal) {
  let best = null;

  const firstPoints = getTerminalPoints(firstTerminal);

  const secondPoints = getTerminalPoints(secondTerminal);

  for (const firstPoint of firstPoints
  ) {
    for (const secondPoint of secondPoints
    ) {
      const distance = getManhattanDistance(firstPoint, secondPoint);

      if (!best || distance < best.distance
      ) {
        best = {firstPoint, secondPoint, distance,};
      }
    }
  }

  return best;
}


function findBestTreeConnection(connected, remaining) {
  let bestConnection = null;

  for (const connectedTerminal of connected) {
    for (let index = 0; index < remaining.length; index++) {
      const candidate = remaining[index];
      if (candidate.ownerId === connectedTerminal.ownerId) continue;

      const pointConnection = findBestTerminalConnection(connectedTerminal, candidate);
      if (!pointConnection) continue;

      if (!bestConnection || pointConnection.distance < bestConnection.distance) {
        bestConnection = {
          from: connectedTerminal, to: candidate, fromPoint: pointConnection.firstPoint, toPoint: pointConnection.secondPoint,
          remainingIndex: index, distance: pointConnection.distance
        };
      }
    }
  }

  return bestConnection;
}

function setSelectedTreePoints(connection) {
  if (!connection.from.selectedPoint) connection.from.selectedPoint = connection.fromPoint;
  if (!connection.to.selectedPoint) connection.to.selectedPoint = connection.toPoint;
}

function getTerminalApproachData(terminal, point) {
  const element = terminal.element;
  const isInductor = element && getElementType(element) === "L";
  let sideDirection = 0;
  if (isInductor) {
    sideDirection = point.x < element.x ? -1 : 1;
  }
  const clearance = 18;

  return {
    isInductor,
    approachPoint: { x: isInductor ? point.x + sideDirection * clearance : point.x, y: point.y }
  };
}

function canBuildFreeTerminalRoute(options) {
  return Array.isArray(options.cellElements) && typeof buildShortestFreeRoute === "function" && typeof routePointsToPathData === "function";
}

function buildFreeTerminalRoute(connection, options, net) {
  let routePoints = buildShortestFreeRoute(
    connection.fromPoint, connection.toPoint, connection.from, connection.to,
    options.cellElements, Array.isArray(options.routedSegments) ? options.routedSegments : [], net
  );

  if (!Array.isArray(routePoints) || routePoints.length < 2) return null;
  routePoints = separateRouteFromJR(routePoints, net, options.jrRails || [], options.jrMargin ?? 12);
  return { routePoints, pathData: routePointsToPathData(routePoints) };
}

function buildInductorTerminalPath(connection, fromData, toData) {
  const { fromPoint, toPoint } = connection;
  return [
    `M ${fromPoint.x} ${fromPoint.y}`,
    fromData.isInductor ? `H ${fromData.approachPoint.x}` : "",
    `H ${toData.approachPoint.x}`,
    `V ${toData.approachPoint.y}`,
    toData.isInductor ? `H ${toPoint.x}` : ""
  ].filter(Boolean).join(" ");
}

function getTerminalRouteData(connection, options, net, fromData, toData) {
  if (canBuildFreeTerminalRoute(options)) return buildFreeTerminalRoute(connection, options, net);

  const pathData = fromData.isInductor || toData.isInductor ? buildInductorTerminalPath(connection, fromData, toData) : undefined;
  return { routePoints: null, pathData };
}

function warnUnroutableTerminalConnection(net, connection) {
  console.warn(`Skipping unroutable connection for ${net}`, {
    from: connection.fromPoint, to: connection.toPoint,
    fromOwner: connection.from.ownerId, toOwner: connection.to.ownerId
  });
}

function storeTerminalRouteSegments(routePoints, options, net) {
  if (!routePoints || !Array.isArray(options.routedSegments) || typeof routePointsToSegments !== "function") return;
  options.routedSegments.push(...routePointsToSegments(routePoints).map((segment) => ({ ...segment, net })));
}

function getTreeLabelPosition(routePoints, connection, fromData, toData) {
  let labelX;
  let labelY;

  if (routePoints && typeof getLongestHorizontalSegment === "function") {
    const labelSegment = getLongestHorizontalSegment(routePoints);
    if (labelSegment) {
      labelX = (labelSegment.a.x + labelSegment.b.x) / 2;
      labelY = labelSegment.a.y;
    }
  }

  if (!Number.isFinite(labelX) || !Number.isFinite(labelY)) {
    const labelSegmentEndX = fromData.isInductor ? fromData.approachPoint.x : toData.approachPoint.x;
    labelX = (connection.fromPoint.x + labelSegmentEndX) / 2;
    labelY = connection.fromPoint.y;
  }

  return { labelX, labelY };
}

function drawTreeLabel(labelLayer, net, routePoints, connection, fromData, toData) {
  const { labelX, labelY } = getTreeLabelPosition(routePoints, connection, fromData, toData);
  drawLabel(labelLayer, net, labelX, labelY, { size: "8.5px", fill: "#334155" });
}

function drawTreeConnection(wireLayer, labelLayer, net, connection, options, labelWasDrawn) {
  setSelectedTreePoints(connection);

  const fromData = getTerminalApproachData(connection.from, connection.fromPoint);
  const toData = getTerminalApproachData(connection.to, connection.toPoint);
  const routeData = getTerminalRouteData(connection, options, net, fromData, toData);

  if (!routeData && canBuildFreeTerminalRoute(options)) {
    warnUnroutableTerminalConnection(net, connection);
    return { drawn: false, labelWasDrawn };
  }

  const routePoints = routeData?.routePoints ?? null;
  const pathData = routeData?.pathData;
  const drawnFromPoint = routePoints?.[0] ?? connection.fromPoint;
  const drawnToPoint = routePoints?.[routePoints.length - 1] ?? connection.toPoint;

  drawPath(wireLayer, drawnFromPoint, drawnToPoint, { stroke: drawConfig.wireStroke, pathData, net, kind: "net-route" });
  storeTerminalRouteSegments(routePoints, options, net);

  if (!labelWasDrawn && options.drawLabel !== false) {
    drawTreeLabel(labelLayer, net, routePoints, connection, fromData, toData);
    labelWasDrawn = true;
  }

  return { drawn: true, labelWasDrawn };
}

function makeTreeConnection(from, to) {
  if (from.ownerId === to.ownerId) return null;
  const points = findBestTerminalConnection(from, to);
  return points ? { from, to, fromPoint: points.firstPoint, toPoint: points.secondPoint, distance: points.distance } : null;
}

function initializeTreeConnections(root, remaining) {
  const best = new Map();
  for (const terminal of remaining) {
    const connection = makeTreeConnection(root, terminal);
    if (connection) best.set(terminal, connection);
  }
  return best;
}

function updateTreeConnections(newTerminal, remaining, best) {
  for (const terminal of remaining) {
    const candidate = makeTreeConnection(newTerminal, terminal);
    if (candidate && (!best.get(terminal) || candidate.distance < best.get(terminal).distance)) best.set(terminal, candidate);
  }
}

function getClosestCachedTreeConnection(best) {
  let selected = null;
  for (const connection of best.values()) if (!selected || connection.distance < selected.distance) selected = connection;
  return selected;
}

function drawTerminalTree(wireLayer, labelLayer, net, terminals, options = {}) {
  if (!Array.isArray(terminals) || terminals.length < 2) return;

  const root = terminals.find(terminal => terminal.kind === "out") || terminals[0];
  const remaining = new Set(terminals.filter(terminal => terminal !== root));
  const best = initializeTreeConnections(root, remaining);
  let labelWasDrawn = false;

  while (remaining.size) {
    const connection = getClosestCachedTreeConnection(best);
    if (!connection) break;

    const result = drawTreeConnection(wireLayer, labelLayer, net, connection, options, labelWasDrawn);
    labelWasDrawn = result.labelWasDrawn;
    remaining.delete(connection.to);
    best.delete(connection.to);

    if (result.drawn) updateTreeConnections(connection.to, remaining, best);
  }
}

function chooseCellNetAnchor(terminals) {
  return (
    terminals.find((terminal) => terminal.kind === "out") || terminals[0]
  );
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

function getRoutingBounds(start, end, margin) {
  return {
    left: Math.min(start.x, end.x) - margin, right: Math.max(start.x, end.x) + margin,
    top: Math.min(start.y, end.y) - margin, bottom: Math.max(start.y, end.y) + margin
  };
}

function boxTouchesBounds(box, bounds) {
  return !(box.right < bounds.left || box.left > bounds.right || box.bottom < bounds.top || box.top > bounds.bottom);
}

function segmentTouchesBounds(segment, bounds) {
  const box = getSegmentBounds(segment.a, segment.b);
  return boxTouchesBounds(box, bounds);
}

function createLocalRoutingData(start, end, obstacleBoxes, routedSegments, margin) {
  const bounds = getRoutingBounds(start, end, margin);
  return {
    bounds,
    obstacleBoxes: obstacleBoxes.filter(box => boxTouchesBounds(box, bounds)),
    routedSegments: routedSegments.filter(segment => segment?.a && segment?.b && segmentTouchesBounds(segment, bounds))
  };
}

function createRoutingGrid(start, end, obstacleBoxes, routedSegments, wireClearance, bounds = null) {
  const xValues = [start.x, end.x], yValues = [start.y, end.y];

  collectRoutingCoordinates(obstacleBoxes, routedSegments, xValues, yValues, wireClearance);
  addParallelChannelMidpoints(routedSegments, xValues, yValues, wireClearance);

  if (bounds) {
    xValues.push(bounds.left, bounds.right);
    yValues.push(bounds.top, bounds.bottom);
  }

  return { xs: uniqueSortedNumbers(xValues), ys: uniqueSortedNumbers(yValues) };
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

class RoutingSpatialHash {
  constructor(cellSize = 100) { this.cellSize = cellSize; this.buckets = new Map(); }

  key(x, y) { return `${x},${y}`; }

  getRange(bounds) {
    return {
      minX: Math.floor(bounds.left / this.cellSize), maxX: Math.floor(bounds.right / this.cellSize),
      minY: Math.floor(bounds.top / this.cellSize), maxY: Math.floor(bounds.bottom / this.cellSize)
    };
  }

  insert(item, bounds) {
    const range = this.getRange(bounds);

    for (let x = range.minX; x <= range.maxX; x++) {
      for (let y = range.minY; y <= range.maxY; y++) {
        const key = this.key(x, y);
        if (!this.buckets.has(key)) this.buckets.set(key, []);
        this.buckets.get(key).push(item);
      }
    }
  }

  query(bounds) {
    const range = this.getRange(bounds), result = new Set();

    for (let x = range.minX; x <= range.maxX; x++) {
      for (let y = range.minY; y <= range.maxY; y++) {
        const bucket = this.buckets.get(this.key(x, y));
        if (bucket) for (const item of bucket) result.add(item);
      }
    }

    return result;
  }
}

function getSegmentBounds(first, second, padding = 0) {
  return {
    left: Math.min(first.x, second.x) - padding, right: Math.max(first.x, second.x) + padding,
    top: Math.min(first.y, second.y) - padding, bottom: Math.max(first.y, second.y) + padding
  };
}

function getPointBounds(point, padding = 0.01) {
  return { left: point.x - padding, right: point.x + padding, top: point.y - padding, bottom: point.y + padding };
}

function createRoutingSpatialIndexes(obstacleBoxes, routedSegments, wireClearance) {
  const obstacleIndex = new RoutingSpatialHash(100), segmentIndex = new RoutingSpatialHash(100);

  for (const box of obstacleBoxes) obstacleIndex.insert(box, box);

  for (const segment of routedSegments) {
    if (!segment?.a || !segment?.b) continue;
    segmentIndex.insert(segment, getSegmentBounds(segment.a, segment.b, wireClearance));
  }

  return { obstacleIndex, segmentIndex };
}

function orientStandaloneResistorsByInstance(placed) {
  const elementsByInstance = new Map();

  for (const element of placed) {
    const instance = getLayoutInstance(element);

    if (!elementsByInstance.has(instance)) {
      elementsByInstance.set(instance, []);
    }

    elementsByInstance.get(instance).push(element);
  }

  for (const instanceElements of elementsByInstance.values()) {
    orientStandaloneResistorsGlobally(instanceElements);
  }
}


function scoreGlobalResistorDirection(resistor, direction, placed) {
  let score = 0;
  let connections = 0;

  for (const neighbor of placed) {
    if (neighbor === resistor) continue;

    const sharedNets = getSharedConnectionNets(resistor, neighbor)
      .filter(net => !isPowerNet(net));

    if (!sharedNets.length) continue;

    const dx = neighbor.x - resistor.x;
    if (Math.abs(dx) < 0.5) continue;

    // Neighbor can be on EITHER side.
    const neighborSide = dx > 0 ? 1 : -1;

    const distance =
      Math.abs(neighbor.x - resistor.x) +
      Math.abs(neighbor.y - resistor.y);

    const weight = 1 / Math.max(1, distance);

    for (const net of sharedNets) {
      const resistorNetSide =
        getNetSideForDirection(resistor, net, direction);

      if (!resistorNetSide) continue;

      if (resistorNetSide === neighborSide) {
        score += weight;
      } else {
        score -= weight;
      }

      connections++;
    }
  }

  return { score, connections };
}

function orientStandaloneResistorsGlobally(placed) {
  for (const resistor of placed) {
    if (!isStandaloneResistor(resistor)) continue;

    const forward = scoreGlobalResistorDirection(resistor, 1, placed);
    const reversed = scoreGlobalResistorDirection(resistor, -1, placed);

    if (!forward.connections && !reversed.connections) continue;
    if (Math.abs(forward.score - reversed.score) < 0.000001) continue;

    setLineComponentDirection(
      resistor,
      reversed.score > forward.score ? -1 : 1
    );
  }
}
