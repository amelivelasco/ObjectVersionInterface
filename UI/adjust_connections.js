function findShortestOrthogonalRoute(start, end, obstacleBoxes, routedSegments, net = null) {
  if (start.x > end.x + 0.5) { return null; }
  const wireClearance = 10;
  const bendPenalty = 14;

  const xValues = [start.x, end.x,];
  const yValues = [start.y,end.y,];

  for (const box of obstacleBoxes) {
    xValues.push(box.left,box.right);
    yValues.push(box.top,box.bottom);
  }

  for (const segment of routedSegments) {
    if (!segment?.a ||!segment?.b) {
      continue;
    }

    const horizontal = Math.abs(segment.a.y -segment.b.y) < 0.5;

    if (horizontal) {
      yValues.push(segment.a.y - wireClearance, segment.a.y + wireClearance);
      xValues.push(segment.a.x, segment.b.x);
    } else {
      xValues.push(segment.a.x - wireClearance, segment.a.x + wireClearance);
      yValues.push(segment.a.y, segment.b.y);
    }
  }

  addParallelChannelMidpoints(routedSegments, xValues, yValues, wireClearance);

  const xs = uniqueSortedNumbers(xValues);
  const ys = uniqueSortedNumbers(yValues);

  const startX = xs.indexOf(Number(start.x.toFixed(2)));
  const startY = ys.indexOf(Number(start.y.toFixed(3)));
  const endX = xs.indexOf(Number(end.x.toFixed(3)));
  const endY = ys.indexOf(Number(end.y.toFixed(3)));

  function pointAt(xIndex, yIndex) {
    return {x: xs[xIndex], y: ys[yIndex],};
  }

  function pointAllowed(point) {
    return !obstacleBoxes.some((box) => pointInsideBox(point, box));
  }

  function segmentAllowed(first, second) {
    const hitsComponent = obstacleBoxes.some((box) => axisAlignedSegmentHitsBox(first, second, box));
    if (hitsComponent) { return false; }

    const candidate = {a: first, b: second};

    const hitsAnotherNet = routedSegments.some((existing) => {
      if (!existing?.a || !existing?.b) { return false; }
      if (existing.net && net && existing.net === net) { return false; }

      return axisAlignedSegmentsIntersect(candidate, existing) ||
        segmentsWithinClearance(candidate, existing, 3);
    });

    return !hitsAnotherNet;
  }

  function stateKey(xIndex, yIndex, direction) {
    return `${xIndex},${yIndex},${direction}`;
  }

  const queue = new RoutingMinHeap();
  const distances = new Map();
  const previous = new Map();

  const startKey = stateKey(startX,startY,"N");

  distances.set(startKey, 0);

  queue.push({
    xIndex: startX,
    yIndex: startY,
    direction: "N",
    priority:
      Math.abs(start.x - end.x) +
      Math.abs(start.y - end.y),
  });

  let goalKey = null;

  while (true) {
    const currentState = queue.pop();
    if (!currentState) {break;}
    const currentKey = stateKey(currentState.xIndex, currentState.yIndex, currentState.direction);
    const currentDistance = distances.get(currentKey);
    if (
      currentState.xIndex === endX &&
      currentState.yIndex === endY
    ) {
      goalKey = currentKey;
      break;
    }
    const neighborIndexes = [
      [currentState.xIndex - 1, currentState.yIndex, "H"],
      [currentState.xIndex + 1, currentState.yIndex, "H"],
      [currentState.xIndex, currentState.yIndex - 1, "V"],
      [currentState.xIndex, currentState.yIndex + 1, "V"],
    ];

    const currentPoint = pointAt(currentState.xIndex, currentState.yIndex);
    for (const [
      nextX,
      nextY,
      nextDirection,
    ] of neighborIndexes) {
      if (
        nextX < 0 ||
        nextY < 0 ||
        nextX >= xs.length ||
        nextY >= ys.length
      ) {
        continue;
      }
      const nextPoint = pointAt(nextX, nextY);
      if (
        !pointAllowed(nextPoint) ||
        !segmentAllowed(currentPoint, nextPoint)
      ) {
        continue;
      }
      const length =
        Math.abs(currentPoint.x - nextPoint.x) +
        Math.abs(currentPoint.y - nextPoint.y);

      const bendCost =
        currentState.direction !== "N" &&
        currentState.direction !== nextDirection
          ? bendPenalty
          : 0;

      const wireCost = getWirePenalty(currentPoint, nextPoint, routedSegments);
      const nextDistance = currentDistance + length + bendCost + wireCost;
      const nextKey = stateKey(nextX, nextY, nextDirection);

      if (nextDistance >= (distances.get(nextKey) ?? Infinity)) {continue;}

      distances.set(nextKey, nextDistance);
      previous.set(nextKey, currentKey);

      const heuristic = Math.abs(nextPoint.x - end.x) + Math.abs(nextPoint.y - end.y);

      queue.push({xIndex: nextX, yIndex: nextY, direction: nextDirection, priority: nextDistance + heuristic,});
    }
  }

  if (!goalKey) {
    console.warn(
        `No legal route found for ${net}`,
        { start, end, }
    );

    return null;
  }

  const reversed = [];
  let currentKey = goalKey;

  while (currentKey) {
    const [xIndex, yIndex] = currentKey.split(",").slice(0, 2).map(Number);
    reversed.push(pointAt(xIndex, yIndex));
    currentKey = previous.get(currentKey);
  }

  return simplifyOrthogonalPoints(
    reversed.toReversed()
  );
}

function getInductorApproachPoint(terminal, point, clearance = 18) {
  const element = terminal?.element;

  if (!element || getElementType(element) !== "L"
  ) {return {...point,};}

  let pin = null;
  let leadPoint = null;

  if (terminal.kind === "in") {
    pin = element.inputPin;
    leadPoint = element.inputLeadPoint;
  } else if (
    terminal.kind === "out"
  ) {
    pin = element.outputPin;
    leadPoint = element.outputLeadPoint;
  }

  let sideDirection = 0;
  if (pin && leadPoint && Math.abs(leadPoint.x - pin.x) > 0.5) {
    sideDirection = Math.sign(leadPoint.x - pin.x);
  }

  if (sideDirection === 0) {
    const horizontalOffset = point.x - element.x;

    if (Math.abs(horizontalOffset) > 0.5) {
      sideDirection = Math.sign(horizontalOffset);
    }
  }
  if (sideDirection === 0) {sideDirection = terminal.kind === "in" ? -1 : 1;}

  return {
    x: point.x + sideDirection * clearance,
    y: point.y,
  };
}

function buildShortestFreeRoute(fromPoint, toPoint, fromTerminal, toTerminal, cellElements, routedSegments, net) {
  let first = { terminal: fromTerminal, point: getTerminalRoutingPoint(fromTerminal, fromPoint) };
  let second = { terminal: toTerminal, point: getTerminalRoutingPoint(toTerminal, toPoint) };

  first.approach = getInductorApproachPoint(first.terminal, first.point);
  second.approach = getInductorApproachPoint(second.terminal, second.point);

  if (first.approach.x > second.approach.x) { [first, second] = [second, first]; }

  const endpointElements = [first.terminal?.element, second.terminal?.element].filter(Boolean);
  const excludedIds = new Set(endpointElements.map((element) => element.id).filter(Boolean));
  const obstacleBoxes = buildRoutingObstacleBoxes(cellElements, excludedIds, 10);

  for (const element of endpointElements) {
    if (getElementType(element) === "L") { obstacleBoxes.push(getInductorImageObstacle(element, 1)); }
  }

  let coreRoute = findShortestOrthogonalRoute(first.approach, second.approach, obstacleBoxes, routedSegments, net);

  if (!Array.isArray(coreRoute) || coreRoute.length < 2) {
    coreRoute = Math.abs(first.approach.y - second.approach.y) < 0.5
      ? [first.approach, second.approach]
      : simplifyOrthogonalPoints([first.approach, { x: second.approach.x, y: first.approach.y }, second.approach]);
  }

  return simplifyOrthogonalPoints([first.point, first.approach, ...coreRoute, second.approach, second.point]);
}

function getLongestHorizontalSegment(points) {
  return routePointsToSegments(points).filter((segment) => Math.abs(segment.a.y - segment.b.y) < 0.5).sort(
      (first, second) => Math.abs(second.b.x - second.a.x) - Math.abs(first.b.x - first.a.x))[0] || null;
}


function separateRouteFromJR(points, net, jrRails = [], jrMargin = 12) {
  if (!Array.isArray(points) || points.length < 2 || jrRails.length === 0
  ) {  return points; }

  const epsilon = 0.5;
  const adjusted = [];

  function pushPoint(point) {
    const previous = adjusted.at(-1);
    if (previous && Math.abs(previous.x - point.x) < epsilon &&
      Math.abs(previous.y - point.y) < epsilon
    ) { return; }

    adjusted.push({ x: point.x, y: point.y,});
  }

  pushPoint(points[0]);

  for (let index = 1; index < points.length; index++
  ) {
    const first = points[index - 1];
    const second = points[index];

    const isEndpointSegment = index === 1 || index === points.length - 1;

    if (isEndpointSegment) {
      pushPoint(second);
      continue;
    }

    const horizontal = Math.abs(first.y - second.y) < epsilon;

    if (!horizontal) {
      pushPoint(second);
      continue;
    }

    const segmentMinX = Math.min(first.x, second.x);
    const segmentMaxX = Math.max(first.x, second.x);

    const conflictingRail =
      jrRails.find((rail) => {
        if (net && rail.net === net) {return false;}

        const overlap = Math.min(segmentMaxX, rail.maxX) - Math.max(segmentMinX, rail.minX);
        if (overlap <= epsilon) { return false;}
        return (Math.abs(first.y - rail.y) < jrMargin);
      }
    );

    if (!conflictingRail) {
      pushPoint(second);
      continue;
    }

    let verticalDirection;

    if (first.y < conflictingRail.y - epsilon) {
      verticalDirection = -1;
    } else if ( first.y > conflictingRail.y + epsilon) {
      verticalDirection = 1;
    } else {verticalDirection = conflictingRail.side === "top" ? -1: 1;
    }

    const detourY = conflictingRail.y + verticalDirection * jrMargin;
    const detourMinX = Math.max(segmentMinX, conflictingRail.minX - jrMargin);
    const detourMaxX = Math.min(segmentMaxX, conflictingRail.maxX + jrMargin);
    const movingRight = second.x >= first.x;
    const entryX = movingRight ? detourMinX : detourMaxX;
    const exitX = movingRight ? detourMaxX : detourMinX;

    pushPoint({x: entryX, y: first.y,});
    pushPoint({x: entryX, y: detourY,});
    pushPoint({x: exitX,y: detourY,});
    pushPoint({x: exitX, y: first.y,});
    pushPoint(second);
  }

  return simplifyOrthogonalPoints(adjusted);
}

function drawSharedOutputNet(
  wireLayer,
  labelLayer,
  net,
  terminals,
  cellElements,
  routedSegments,
  jrRails = [],
  jrMargin = 12
) {
  const outputs = terminals.filter((terminal) => terminal.kind === "out")
      .sort((first, second) => (first.element ?.layoutOrder ?? Infinity) -
          (second.element ?.layoutOrder ?? Infinity));

  const root = outputs[0] || terminals[0];
  const connected = [root,];

  const remaining = terminals.filter((terminal) => terminal !== root);
  let labelWasDrawn = false;

  const connectedNetSegments = [];
  
  function addOwnerRailsToConnectedNet(ownerId) {
    if (!ownerId) { return; }

    for (const rail of jrRails) {
      if (rail.ownerId !== ownerId || rail.net !== net
      ) { continue; }

      const alreadyAdded = connectedNetSegments.some(
          (segment) => segment.ownerId === rail.ownerId &&
            Math.abs(segment.a.y - rail.y) < 0.5 &&
            Math.abs(Math.min(segment.a.x, segment.b.x) - rail.minX) < 0.5 &&
            Math.abs(Math.max(segment.a.x, segment.b.x) - rail.maxX) < 0.5
        );

      if (alreadyAdded) {continue;}

      connectedNetSegments.push({
        a: { x: rail.minX, y: rail.y,},
        b: {x: rail.maxX, y: rail.y,},
        net,
        ownerId: rail.ownerId,
        isJRRail: true,
      });
    }
  }

  addOwnerRailsToConnectedNet(root.ownerId);

  function closestPointOnSegment(point, segment) {
    const epsilon = 0.5;

    const horizontal = Math.abs(segment.a.y - segment.b.y) < epsilon;
    if (horizontal) { const minimumX = Math.min(segment.a.x, segment.b.x);
      const maximumX = Math.max(segment.a.x, segment.b.x);
      return { x: Math.max(minimumX, Math.min(maximumX, point.x)), y: segment.a.y,};
    }

    const vertical =
      Math.abs(segment.a.x - segment.b.x) < epsilon;

    if (vertical) { const minimumY = Math.min(segment.a.y, segment.b.y);

      const maximumY = Math.max(segment.a.y, segment.b.y);

      return {x: segment.a.x, y: Math.max(minimumY, Math.min(maximumY, point.y)),};
    }

    return null;
  }

  function findClosestPointOnConnectedNet(destination) {
    let best = null;
    connectedNetSegments.forEach((segment, segmentIndex) => {
        const point = closestPointOnSegment(destination, segment);
        if (!point) {return;}
        const distance = getManhattanDistance(point, destination);

        if (!best || distance < best.distance
        ) { best = { point, distance, segmentIndex, };
        }
      }
    );

    return best;
  }

  while (remaining.length > 0) {
    let bestConnection = null;

    for (let index = 0; index < remaining.length; index++) {
      const candidate = remaining[index];
      for (const connectedTerminal of connected
      ) {
        if (candidate.ownerId === connectedTerminal.ownerId
        ) { continue; }

        const pointConnection = findBestTerminalConnection(connectedTerminal, candidate);

        if (!pointConnection) {continue;}

        const sameKindPenalty = connectedTerminal.kind === candidate.kind ? 1000000 : 0;

        const score = pointConnection.distance + sameKindPenalty;

        if (!bestConnection || score < bestConnection.score
        ) { bestConnection = { from: connectedTerminal, to: candidate, fromPoint: pointConnection.firstPoint,
            toPoint: pointConnection.secondPoint, remainingIndex: index, score, startsFromExistingNet: false,
          };
        }
      }

      for (const destinationPoint of getTerminalPoints(candidate)) {
        const existingConnection = findClosestPointOnConnectedNet(destinationPoint);

        if (!existingConnection) {continue;}

        if (bestConnection && existingConnection.distance >= bestConnection.score) {continue;}

        const sourcePoint = {...existingConnection.point,};

        bestConnection = {
          from: {
            net,
            kind: "existing-net",
            ownerId:`existing-net:${net}:${existingConnection.segmentIndex}`,
            element: null,
            point: sourcePoint,
            candidatePoints: [sourcePoint,],
            selectedPoint: sourcePoint,
          },

          to: candidate,
          fromPoint: sourcePoint,
          toPoint: destinationPoint,
          remainingIndex: index,
          score: existingConnection.distance,
          startsFromExistingNet: true,
        };
      }
    }

    if (!bestConnection) { break; }
    if (bestConnection.startsFromExistingNet && bestConnection.score < 0.5
    ) {
      connected.push(bestConnection.to);
      addOwnerRailsToConnectedNet(bestConnection.to.ownerId);
      remaining.splice(bestConnection.remainingIndex, 1);
      continue;
    }

    let routePoints =
      buildShortestFreeRoute(
        bestConnection.fromPoint,
        bestConnection.toPoint,
        bestConnection.from,
        bestConnection.to,
        cellElements,
        routedSegments,
        net
      );

    if (!Array.isArray(routePoints) || routePoints.length < 2) {
      console.warn(`Skipping unroutable shared connection for ${net}`,
        {
          from: bestConnection.fromPoint,
          to: bestConnection.toPoint,
          fromOwner: bestConnection.from.ownerId,
          toOwner:bestConnection.to.ownerId,
        }
      );
      remaining.splice(bestConnection.remainingIndex, 1);
      continue;
    }


    drawPath(wireLayer, routePoints[0], routePoints[routePoints.length - 1],
      {
        stroke: drawConfig.wireStroke,
        pathData: routePointsToPathData(routePoints),
        net,
        kind:"shared-net-route",
      }
    );

    const taggedSegments = routePointsToSegments(routePoints).map(
        (segment) => ({...segment, net,}));

    routedSegments.push(...taggedSegments);

    connectedNetSegments.push(...taggedSegments);

    if (!labelWasDrawn) {
      const labelSegment = getLongestHorizontalSegment(routePoints);

      if (labelSegment) {
        drawLabel(
          labelLayer,
          net,
          (labelSegment.a.x + labelSegment.b.x) / 2, labelSegment.a.y, { size:"8.5px", fill:"#334155", }
        );
        labelWasDrawn = true;
      }
    }
    connected.push(bestConnection.to);
    addOwnerRailsToConnectedNet(bestConnection.to.ownerId);
    remaining.splice(bestConnection.remainingIndex, 1);
  }
}

function getTerminalSpan(terminals) {
  const points = terminals.flatMap((terminal) => getTerminalPoints(terminal));
  if (points.length === 0) {return 0;}

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);

  return (Math.max(...xs) - Math.min(...xs) + Math.max(...ys) - Math.min(...ys));
}

function drawConnectionsInsideLayoutCells(wireLayer, labelLayer, placed) {
  const elementsByCell = new Map();
  for (const element of placed) {
    const layoutInstance = getLayoutInstance(element);

    if (!elementsByCell.has(layoutInstance)
    ) {
      elementsByCell.set(layoutInstance, []);
    }

    elementsByCell.get(layoutInstance).push(element);
  }

  for (const [layoutInstance, cellElements,] of elementsByCell) {
    const terminalsByNet = collectNetTerminals(cellElements);

    const entries = [...terminalsByNet.entries(),].filter(
      ([, terminals]) => terminals.length >= 2);

    const ordinaryEntries = entries.filter(([, terminals]) => !isSharedOutputConflict(terminals))
        .sort(
          ([, firstTerminals],[, secondTerminals]) =>
            getTerminalSpan(firstTerminals) -  getTerminalSpan(secondTerminals)
        );

    const sharedOutputEntries = entries.filter(([, terminals]) => isSharedOutputConflict(terminals))
        .sort(([, firstTerminals], [, secondTerminals]) =>
            getTerminalSpan(firstTerminals) - getTerminalSpan(secondTerminals)
        );

    const routedSegments = [];
    const jrRails = [];
    const jrMargin = 12;
    for (let index = 0; index < cellElements.length - 1; index++) {
      const current = cellElements[index];
      const next = cellElements[index + 1];

      if (!isJJResistorPair(current, next)
      ) { continue; }

      const geometry = getJJPairGeometry(current, next, 25);

      jrRails.push(
        { 
          minX: Math.min(geometry.topAtJJ.x, geometry.topAtResistor.x),
          maxX: Math.max(geometry.topAtJJ.x, geometry.topAtResistor.x),
          y: geometry.topAtJJ.y,
          net: current.net_in,
          side: "top",
          ownerId: `pair:${current.id}`,
        },

        {
          minX: Math.min(geometry.bottomAtJJ.x, geometry.bottomAtResistor.x),
          maxX: Math.max(geometry.bottomAtJJ.x, geometry.bottomAtResistor.x),
          y: geometry.bottomAtJJ.y,
          net: current.net_out,
          side: "bottom",
          ownerId: `pair:${current.id}`,
        }
      );

      index++;
    }

    for (const element of cellElements
    ) {
      if (getElementType(element) !== "L"
      ) { continue; }

      if (element.inputNeedsLead && element.net_in && element.inputPin && element.inputLeadPoint
      ) {
        routedSegments.push({
          a: element.inputPin,
          b: element.inputLeadPoint,
          net:element.net_in,
          protectedInductorLead: true,
        });
      }

      if (element.outputNeedsLead && element.net_out && element.outputPin && element.outputLeadPoint
      ) {
        routedSegments.push({
          a: element.outputPin,
          b: element.outputLeadPoint,
          net: element.net_out,
          protectedInductorLead: true,
        });
      }
    }
    for (const rail of jrRails) {
      routedSegments.push({
        a: { x: rail.minX, y: rail.y,},
        b: { x: rail.maxX, y: rail.y,},
        net: rail.net,
        kind: "jr-rail-obstacle",
        ownerId: rail.ownerId,
        isJRRail: true,
      });
    }

    for (const [net, terminals,] of ordinaryEntries
    ) {
      const firstNewChild = wireLayer.children.length;
      const routedSegmentCount = routedSegments.length;

      drawTerminalTree(wireLayer, labelLayer, net, terminals,
        { drawLabel: true, cellElements, routedSegments, jrRails, jrMargin,}
      );

      if (routedSegments.length === routedSegmentCount
      ) {
        const newChildren = Array.from(wireLayer.children).slice(firstNewChild);

        for (const child of newChildren
        ) {
          routedSegments.push(...extractWireSegmentsFromElement(child).map(
              (segment) => ({...segment, net,})
            )
          );
        }
      }
    }

    for (const [net, terminals,] of sharedOutputEntries) {
      drawSharedOutputNet(wireLayer, labelLayer, net, terminals, cellElements, routedSegments, jrRails, jrMargin);
    }

    console.log(
      `Finished internal connections for ${layoutInstance}`,
      {
        ordinaryNets: ordinaryEntries.length,
        reroutedSharedOutputs: sharedOutputEntries.length,
        jrRails: jrRails.length,
      }
    );
  }
}


function segmentsWithinClearance( first, second, clearance = 8) {
  const firstBox = { 
    left: Math.min(first.a.x, first.b.x) - clearance,
    right: Math.max(first.a.x, first.b.x) + clearance,
    top: Math.min(first.a.y, first.b.y) - clearance,
    bottom: Math.max(first.a.y, first.b.y) + clearance,
  };

  const secondBox = {
    left: Math.min(second.a.x, second.b.x),
    right: Math.max(second.a.x, second.b.x),
    top: Math.min(second.a.y, second.b.y),
    bottom: Math.max(second.a.y, second.b.y),
  };

  return !( firstBox.right < secondBox.left || firstBox.left > secondBox.right || firstBox.bottom <
      secondBox.top || firstBox.top > secondBox.bottom
  );
}