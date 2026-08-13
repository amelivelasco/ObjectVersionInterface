function getPinOffsetForElement(element) {
  return (getElementType(element) === "L" ? drawConfig.inductorPinOffset + 10 : drawConfig.pinOffset + 10);
}

function isBiasElement(element) {
  return getElementType(element) === "IB";
}

function getLayoutInstance(element) {
  return (element.parentLayoutCell || element.layout_instance || element.layout_cell || "unassigned");
}

function isGeneratedResistor(element) {
  return getElementType(element) === "R";
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

function collectNetTerminals(elements) {
  const terminalsByNet = new Map();
  const elementsInPairs = new Set();
  const pairs = [];

  function addTerminal(net, terminal) {
    if (!net) { return; }

    if (isGroundNet(net)) { return; }

    if (!terminalsByNet.has(net)) {
      terminalsByNet.set(net, [] );
    }

    terminalsByNet.get(net).push(terminal);
  }

  for (let index = 0; index < elements.length - 1; index++) {
    const current = elements[index];
    const next = elements[index + 1];

    if (!isJJResistorPair(current, next)
    ) { continue; }

    const geometry = getJJPairGeometry(current, next, 25);
    pairs.push({jj: current, resistor: next, geometry,});
    elementsInPairs.add(current.id);
    elementsInPairs.add(next.id);

    index++;
  }

    for (const pair of pairs) {
      const layoutInstance = getLayoutInstance(pair.jj);
      const horizontal = pair.geometry.orientation === "horizontal";
      const inputPoint = horizontal ? pair.geometry.topAtJJ : pair.geometry.topMiddle;
      const outputPoint = horizontal ? pair.geometry.bottomAtJJ : pair.geometry.bottomMiddle;

      addTerminal(pair.jj.net_in, {
        net: pair.jj.net_in, kind: "in", element: pair.jj, ownerId: `pair:${pair.jj.id}`,
        layoutInstance, point: inputPoint, candidatePoints: [inputPoint],
      });

      addTerminal(pair.jj.net_out, {
        net: pair.jj.net_out, kind: "out", element: pair.jj, ownerId: `pair:${pair.jj.id}`,
        layoutInstance, point: outputPoint, candidatePoints: [outputPoint],
      });
    }


    for (const element of elements) {
        if (elementsInPairs.has(element.id)
        ) {continue;}

        if (getElementType(element) === "R") { continue; }
        if (isBiasElement(element)) {continue;}

        const layoutInstance = getLayoutInstance(element);
        
        if (element.net_in && element.inputPin
        ) {
          const inputRoutingPoint = getTerminalRoutingPoint({element, kind: "in", }, element.inputPin);

          addTerminal(
            element.net_in,
            {net: element.net_in, kind: "in", point: inputRoutingPoint, candidatePoints: [inputRoutingPoint,],
              element, ownerId: element.id, layoutInstance,
            }
          );
        }

        if (element.net_out && element.outputPin
        ) {
          const outputRoutingPoint = getTerminalRoutingPoint({element, kind: "out", }, element.outputPin);

          addTerminal(element.net_out,
            {net: element.net_out, kind: "out", point: outputRoutingPoint, candidatePoints: [outputRoutingPoint,], 
              element, ownerId: element.id, layoutInstance,}
          );
        }
    }

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


function drawTerminalTree(wireLayer, labelLayer, net, terminals, options = {}) {
  if (!Array.isArray(terminals) || terminals.length < 2) { return; }

  const rootIndex = terminals.findIndex((terminal) => terminal.kind === "out");

  const root = rootIndex >= 0 ? terminals[rootIndex] : terminals[0];
  const connected = [root];
  const remaining = terminals.filter((terminal) => terminal !== root);
  let labelWasDrawn = false;

  while (remaining.length > 0) {
    let bestConnection = null;

    for (const connectedTerminal of connected) {
      for (let index = 0; index < remaining.length; index++
      ) {
        const candidate = remaining[index];

        if (candidate.ownerId === connectedTerminal.ownerId
        ) { continue; }

        const pointConnection = findBestTerminalConnection(connectedTerminal, candidate);

        if (!pointConnection) { continue; }

        if (!bestConnection || pointConnection.distance < bestConnection.distance) {
          bestConnection = {
            from: connectedTerminal,
            to: candidate,
            fromPoint: pointConnection.firstPoint,
            toPoint: pointConnection.secondPoint,
            remainingIndex: index,
            distance: pointConnection.distance,
          };
        }
      }
    }

    if (!bestConnection) { break; }

    if (!bestConnection.from.selectedPoint) {
      bestConnection.from.selectedPoint = bestConnection.fromPoint;
    }

    if (!bestConnection.to.selectedPoint
    ) { bestConnection.to.selectedPoint = bestConnection.toPoint; }

    const fromTerminal = bestConnection.from;
    const toTerminal = bestConnection.to;
    const fromElement = fromTerminal.element;
    const toElement = toTerminal.element;
    const fromPoint = bestConnection.fromPoint;
    const toPoint = bestConnection.toPoint;
    const fromIsInductor = fromElement && getElementType(fromElement) === "L";

    const toIsInductor = toElement && getElementType(toElement) === "L";
    const clearance = 18;
    const fromSideDirection = fromIsInductor ? (fromPoint.x < fromElement.x ? -1 : 1) : 0;

    const toSideDirection = toIsInductor ? (toPoint.x < toElement.x ? -1 : 1): 0;

    const fromApproachPoint = {
      x: fromIsInductor ? fromPoint.x + fromSideDirection * clearance : fromPoint.x,
      y: fromPoint.y,
    };

    const toApproachPoint = {
      x: toIsInductor ? toPoint.x + toSideDirection * clearance : toPoint.x,
      y: toPoint.y,
    };

    let routePoints = null;
    let pathData;

    if (Array.isArray(options.cellElements) && typeof buildShortestFreeRoute === "function" &&
      typeof routePointsToPathData === "function"
    ) {
      routePoints = buildShortestFreeRoute(fromPoint, toPoint, fromTerminal, toTerminal,
                      options.cellElements, Array.isArray(options.routedSegments) ? options.routedSegments : [],net);

      if (!Array.isArray(routePoints) || routePoints.length < 2
      ) {
        console.warn(
          `Skipping unroutable connection for ${net}`,
          { from: fromPoint, to: toPoint, fromOwner: fromTerminal.ownerId, toOwner: toTerminal.ownerId,}
        );

        remaining.splice(bestConnection.remainingIndex, 1);
        continue;
      }

      routePoints = separateRouteFromJR(routePoints, net, options.jrRails || [], options.jrMargin ?? 12);

      pathData = routePointsToPathData(routePoints );
        
    } else if (fromIsInductor || toIsInductor) {

      pathData = [`M ${fromPoint.x} ${fromPoint.y}`, fromIsInductor ? `H ${fromApproachPoint.x}`: "",
        `H ${toApproachPoint.x}`, `V ${toApproachPoint.y}`, toIsInductor ? `H ${toPoint.x}` : "",]
        .filter(Boolean)
        .join(" ");
    }

    const drawnFromPoint = routePoints?.[0] ?? fromPoint;

    const drawnToPoint = routePoints?.[routePoints.length - 1] ?? toPoint;

    drawPath(wireLayer, drawnFromPoint, drawnToPoint,
      { stroke: drawConfig.wireStroke, pathData, net, kind: "net-route", }
    );

    if (routePoints && Array.isArray(options.routedSegments) &&
      typeof routePointsToSegments === "function"
    ) {
      options.routedSegments.push(...routePointsToSegments(routePoints).map(
          (segment) => ({...segment, net,})
        )
      );
    }

    if (!labelWasDrawn && options.drawLabel !== false
    ) {
      let labelX;
      let labelY;

      if (routePoints && typeof getLongestHorizontalSegment === "function"
      ) {
        const labelSegment = getLongestHorizontalSegment(routePoints);

        if (labelSegment) {
          labelX = (labelSegment.a.x + labelSegment.b.x) / 2;
          labelY = labelSegment.a.y;
        }
      }

      if (!Number.isFinite(labelX) || !Number.isFinite(labelY)
      ) {
        const labelSegmentEndX = fromIsInductor ? fromApproachPoint.x : toApproachPoint.x;
        labelX = (fromPoint.x + labelSegmentEndX) / 2;
        labelY = fromPoint.y;
      }

      drawLabel(labelLayer, net, labelX, labelY,{ size: "8.5px",fill: "#334155",});
      labelWasDrawn = true;
    }

    connected.push(bestConnection.to);
    remaining.splice(bestConnection.remainingIndex, 1);
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