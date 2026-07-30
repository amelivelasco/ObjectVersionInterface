function getPinOffsetForElement(element) {
  return (getElementType(element) === "L" ? drawConfig.inductorPinOffset + 10 : drawConfig.pinOffset + 10);
}

function isBiasElement(element) {return getElementType(element) === "IB";}

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
    const centerX = (jj.x + resistor.x) / 2;
    const mainWireY = Math.min(jj.y, resistor.y);

    jj.x = centerX;
    jj.y = mainWireY;
    resistor.x = centerX;
    resistor.y = mainWireY + verticalGap;

    jj.forcedRotation = 90;
    resistor.forcedRotation = 0;
    jj.jrRotated = resistor.jrRotated = true;
    jj.jrOrientation = resistor.jrOrientation = "horizontal";

    const jjPinOffset = getPinOffsetForElement(jj);
    const resistorPinOffset = getPinOffsetForElement(resistor);

    jj.inputPin = { x: jj.x - jjPinOffset, y: jj.y, net: jj.net_in };
    jj.outputPin = { x: jj.x + jjPinOffset, y: jj.y, net: jj.net_out };
    resistor.inputPin = { x: resistor.x - resistorPinOffset, y: resistor.y, net: resistor.net_in };
    resistor.outputPin = { x: resistor.x + resistorPinOffset, y: resistor.y, net: resistor.net_out };

    const jjTop = { x: jj.x - halfSize, y: jj.y };
    const resistorTop = { x: resistor.x - halfSize, y: resistor.y };
    const jjBottom = { x: jj.x + halfSize, y: jj.y };
    const resistorBottom = { x: resistor.x + halfSize, y: resistor.y };
    const topX = Math.min(jjTop.x, resistorTop.x) - rise;
    const bottomX = Math.max(jjBottom.x, resistorBottom.x) + rise;
    const topAtJJ = { x: topX, y: jj.y };
    const topAtResistor = { x: topX, y: resistor.y };
    const bottomAtJJ = { x: bottomX, y: jj.y };
    const bottomAtResistor = { x: bottomX, y: resistor.y };
    const middleY = (jj.y + resistor.y) / 2;
    const topMiddle = { x: topX, y: middleY };
    const bottomMiddle = { x: bottomX, y: middleY };

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


function addWireLayerToRoutedSegments(wireLayer, routedSegments) {
  if (!wireLayer || !routedSegments) { return; }


  const wireElements = wireLayer.querySelectorAll("path, line, polyline");

  for (const wireElement of wireElements) {
    const net = wireElement.dataset.net || "__existing_wire__";

    const kind = wireElement.dataset.kind || "existing-wire";

    const segments = extractWireSegmentsFromElement(wireElement);

    for (const segment of segments) {
      if (!segment?.a || !segment?.b) { continue; }
      routedSegments.push({...segment, net, kind, existingWire: true,});
    }
  }
}


function normalizePolarityNet(net) {
  return String(net ?? "").trim().toUpperCase();
}

function getBiasPolarityPoint(bias) {
  const possiblePoints = [bias?.biasNetJoin, bias?.outputPin, bias,];

  for (const point of possiblePoints) {
    if (Number.isFinite(point?.x) && Number.isFinite(point?.y)) {
      return {x: point.x, y: point.y,};
    }
  }

  return null;
}

function getPolarityDistance(first, second) {
  if (!first || !second
  ) { return Infinity; }

  return (Math.abs(first.x - second.x) +
    Math.abs(first.y - second.y)
  );
}

function drawPolaritySign(labelLayer, sign, point, className = "") {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)
  ) { return; }

  drawComponentValueText(labelLayer, sign, point.x, point.y,
    { size: "15px", weight: "900", fill: sign === "+" ? "#15803d": "#b91c1c", 
      background: "#f8fafc", backgroundWidth: 3, className: [ "current-polarity-sign", className, ]
        .filter(Boolean)
        .join(" "),
    }
  );
}

function createPolarityComponent(element, options = {}) {
  const halfSize = drawConfig.imageSize / 2;
  const type = getElementType(element);

  if (type === "IB") { return null; }

  if (type === "L") {
    const inputPoint = element.inputPin || {
        x: element.x - halfSize,
        y: element.y,
      };

    const outputPoint =
      element.outputPin || {x: element.x + halfSize, y: element.y,};

    return {
      id: element.id,
      kind: "inductor",
      elements: [element,],
      center: { x:  element.x, y: element.y, },
      sideA: {name: "input", net:element.net_in, netKey: normalizePolarityNet(element.net_in), point: inputPoint,},
      sideB: { name: "output", net: element.net_out, netKey: normalizePolarityNet(element.net_out), point: outputPoint,},
    };
  }

  if (type === "R" || type === "JJ") {
    return {
      id: element.id,
      kind: type === "R" ? "resistor" : "jj",
      elements: [ element, ],
      center: { x: element.x, y: element.y,},
      sideA: {
        name: "top",
        net: element.net_in,
        netKey: normalizePolarityNet(element.net_in),
        point: {
          x: element.x,
          y: element.y -  halfSize,
        },
      },

      sideB: {
        name: "bottom",
        net: element.net_out,
        netKey: normalizePolarityNet(element.net_out),
        point: {x: element.x, y: element.y + halfSize,},
      },
    };
  }


  if (element.net_in && element.net_out) {
    const inputPoint = element.inputPin || { x: element.x - halfSize, y: element.y,};

    const outputPoint =
      element.outputPin || { x: element.x + halfSize, y: element.y, };

    return {
      id: element.id,
      kind: "generic",
      elements: [element,],
      center: { x: element.x, y: element.y, },
      sideA: {
        name: "input",
        net: element.net_in,
        netKey: normalizePolarityNet(element.net_in),
        point: inputPoint,
      },

      sideB: {
        name: "output",
        net:  element.net_out,
        netKey: normalizePolarityNet(element.net_out),
        point: outputPoint,
      },
    };
  }
  return null;
}

function buildPolarityComponents(placed) {
  const components = [];
  const consumedIds = new Set();

  for (let index = 0; index < placed.length; index++) {
    const current = placed[index];

    if (consumedIds.has( current.id) || isBiasElement(current)
    ) { continue; }

    const currentType = getElementType(current);

    if (currentType === "JJ") {
      const resistor =
        placed.find(
          (candidate) =>
            !consumedIds.has(candidate.id) && getLayoutInstance(candidate) ===
              getLayoutInstance(current) && isJJResistorPair(current, candidate)
        );

      if (resistor) {
        const geometry = getJJPairGeometry(current, resistor, 25);

        components.push({
          id: `pair:${current.id}`,
          kind: "jr-pair",
          elements: [current, resistor,],
          jj: current,
          resistor,
          geometry,
          center: { x:(current.x + resistor.x) / 2, y:(current.y + resistor.y) / 2,},
          sideA: {
            name: "top",
            net: current.net_in,
            netKey: normalizePolarityNet(current.net_in),
            point: geometry.topMiddle,
          },
          sideB: {
            name: "bottom",
            net: current.net_out,
            netKey:  normalizePolarityNet(current.net_out),
            point: geometry.bottomMiddle,
          },
        });

        consumedIds.add(current.id);
        consumedIds.add( resistor.id);

        continue;
      }
    }

    const component = createPolarityComponent(current);

    if (component) { components.push(component); }

    consumedIds.add(current.id);
  }

  return components;
}

function buildPolarityNetGraph(components) {
  const graph =new Map();

  function ensureNet(net) {
    if (!net || graph.has(net)) {return;}

    graph.set(net, new Set());
  }

  function connectNets(firstNet, secondNet) {
    if (!firstNet || !secondNet) { return; }
    ensureNet(firstNet);
    ensureNet(secondNet);

    if (firstNet === secondNet) { return; }
    graph.get(firstNet).add(secondNet);
    graph.get(secondNet).add(firstNet);
  }

  for (const component of components) {
    connectNets(component.sideA.netKey, component.sideB.netKey);
  }
  return graph;
}

function calculateBiasNetDistances(sourceNet, graph) {
  const distances = new Map();

  if (!sourceNet) { return distances;}

  distances.set(sourceNet, 0);

  const queue = [sourceNet,];

  for (let queueIndex = 0; queueIndex < queue.length; queueIndex++) {
    const currentNet = queue[queueIndex];

    const currentDistance = distances.get(currentNet);

    const neighbours = graph.get(currentNet) || [];

    for (const neighbour of neighbours) {
      if (distances.has(neighbour)
      ) {continue;}

      distances.set(neighbour, currentDistance + 1);
      queue.push(neighbour);
    }
  }

  return distances;
}

function buildPolarityBiases(placed, graph) {
  return placed.filter(
      (element) =>
        isBiasElement(element) && element.net_out
    )
    .map((bias) => { const sourceNet = normalizePolarityNet(bias.net_out);

        return {element: bias, sourceNet, point: getBiasPolarityPoint(bias), distances:
            calculateBiasNetDistances(sourceNet, graph),
        };
      }
    );
}

function chooseClosestBiasForComponent(component, biases) {
  let bestBias =  null;

  for (const bias of biases) {
    const distanceA = bias.distances.has(component.sideA.netKey) ? bias.distances.get(component.sideA.netKey) : Infinity;

    const distanceB = bias.distances.has(component.sideB.netKey) ? bias.distances.get(component.sideB.netKey) : Infinity;

    const graphDistance = Math.min(distanceA, distanceB);

    if (!Number.isFinite(graphDistance)
    ) { continue; }

    const physicalDistance = getPolarityDistance(bias.point, component.center);

    if (!bestBias || graphDistance < bestBias.graphDistance ||
      (graphDistance ===  bestBias.graphDistance && physicalDistance < bestBias.physicalDistance)
    ) { bestBias = { ...bias, graphDistance, physicalDistance, distanceA, distanceB,}; }
  }


  if (!bestBias && biases.length > 0) {
    const closest = [...biases].sort(
        (first, second) => getPolarityDistance(first.point, component.center) -
          getPolarityDistance(second.point, component.center))[0];

    bestBias = {...closest, graphDistance: Infinity, physicalDistance: getPolarityDistance(closest.point, component.center),
      distanceA: Infinity, distanceB: Infinity, };
  }
  return bestBias;
}

function choosePositiveComponentSide(component, bias) {
  if (!bias) { return null; }
  if (bias.distanceA < bias.distanceB) {return component.sideA;}
  if (bias.distanceB < bias.distanceA) { return component.sideB; }


  const sideAIsBiasNet = component.sideA.netKey === bias.sourceNet;

  const sideBIsBiasNet = component.sideB.netKey === bias.sourceNet;

  if (sideAIsBiasNet && !sideBIsBiasNet
  ) { return component.sideA;}

  if (sideBIsBiasNet && !sideAIsBiasNet ) { return component.sideB; }

  const physicalA = getPolarityDistance(bias.point, component.sideA.point);

  const physicalB = getPolarityDistance(bias.point, component.sideB.point);

  if (physicalB < physicalA) {
    return component.sideB;
  }

  return component.sideA;
}

function getOutwardSignPoint(componentCenter, terminalPoint, offset = 10) {
  const dx = terminalPoint.x - componentCenter.x;
  const dy = terminalPoint.y - componentCenter.y;

  if (Math.abs(dx) >= Math.abs(dy)) {
    return {
      x: terminalPoint.x + (dx < 0 ? -offset : offset),
      y: terminalPoint.y,
    };
  }

  return {
    x: terminalPoint.x,
    y: terminalPoint.y + (dy < 0 ? -offset : offset ),
  };
}

function drawPolarityForComponent(labelLayer, component, positiveSide) {
  if (!labelLayer || !component?.sideA || !component?.sideB) { return; }

  if (component.kind === "jr-pair") {
    const sideAIsGround = isGroundNet(component.sideA.net), sideBIsGround = isGroundNet(component.sideB.net);
    if (sideAIsGround && !sideBIsGround) { positiveSide = component.sideB; }
    else if (sideBIsGround && !sideAIsGround) { positiveSide = component.sideA; }
  }

  if (!positiveSide) { return; }

  const negativeSide = positiveSide === component.sideA ? component.sideB : component.sideA;

  if (component.kind === "jr-pair") {
    const { jj, resistor, geometry } = component;
    const halfSize = drawConfig.imageSize / 2, offset = 9;
    const sideAIsPositive = positiveSide === component.sideA;
    const sideASign = sideAIsPositive ? "+" : "−", sideBSign = sideAIsPositive ? "−" : "+";
    const horizontal = geometry?.orientation === "horizontal" || jj.jrRotated || resistor.jrRotated;

    if (horizontal) {
      drawPolaritySign(labelLayer, sideASign, { x: jj.x - halfSize - offset, y: jj.y }, "jj-polarity-left");
      drawPolaritySign(labelLayer, sideBSign, { x: jj.x + halfSize + offset, y: jj.y }, "jj-polarity-right");
      drawPolaritySign(labelLayer, sideASign, { x: resistor.x - halfSize - offset, y: resistor.y }, "resistor-polarity-left");
      drawPolaritySign(labelLayer, sideBSign, { x: resistor.x + halfSize + offset, y: resistor.y }, "resistor-polarity-right");
    } else {
      drawPolaritySign(labelLayer, sideASign, { x: jj.x, y: jj.y - halfSize - offset }, "jj-polarity-top");
      drawPolaritySign(labelLayer, sideBSign, { x: jj.x, y: jj.y + halfSize + offset }, "jj-polarity-bottom");
      drawPolaritySign(labelLayer, sideASign, { x: resistor.x, y: resistor.y - halfSize - offset }, "resistor-polarity-top");
      drawPolaritySign(labelLayer, sideBSign, { x: resistor.x, y: resistor.y + halfSize + offset }, "resistor-polarity-bottom");
    }

    return;
  }

  drawPolaritySign(labelLayer, "+", getOutwardSignPoint(component.center, positiveSide.point, 10), `${component.kind}-polarity-positive`);
  drawPolaritySign(labelLayer, "−", getOutwardSignPoint(component.center, negativeSide.point, 10), `${component.kind}-polarity-negative`);
}

function drawBiasBasedPolaritySigns(labelLayer, placed) {
  if (!labelLayer || !Array.isArray(placed)) {
    return;
  }

  labelLayer.querySelectorAll(".current-polarity-sign").forEach((sign) => sign.remove());

  const components = buildPolarityComponents(placed);

  for (const component of components) {
    if (!component.sideA.netKey || !component.sideB.netKey) {
      continue;
    }

    drawPolarityForComponent(labelLayer, component, component.sideA);
  }
}