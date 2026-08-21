const ROUTING_MARGINS = [80, 160, 320];
const routingObstacleCache = new WeakMap();

function getCachedRoutingObstacles(cellElements, padding = 10) {
  let cached = routingObstacleCache.get(cellElements);

  if (cached?.padding !== padding) {
    cached = { padding, boxes: buildRoutingObstacleBoxes(cellElements, new Set(), padding) };
    routingObstacleCache.set(cellElements, cached);
  }

  return cached.boxes;
}

function getRouteObstacleBoxes(cellElements, excludedIds, padding = 10) {
  return getCachedRoutingObstacles(cellElements, padding).filter(box => {
    if (!box.ownerIds) return true;
    for (const id of excludedIds) if (box.ownerIds.has(id)) return false;
    return true;
  });
}

function collectRoutingCoordinates(obstacleBoxes, routedSegments, xValues, yValues, wireClearance) {
  for (const box of obstacleBoxes) {
    xValues.push(box.left, box.right);
    yValues.push(box.top, box.bottom);
  }

  for (const segment of routedSegments) {
    if (!segment?.a || !segment?.b) {
      continue;
    }

    const horizontal = Math.abs(segment.a.y - segment.b.y) < 0.5;

    if (horizontal) {
      yValues.push(segment.a.y - wireClearance, segment.a.y + wireClearance);
      xValues.push(segment.a.x, segment.b.x);
    } else {
      xValues.push(segment.a.x - wireClearance, segment.a.x + wireClearance);
      yValues.push(segment.a.y, segment.b.y);
    }
  }
}

function createRoutingGrid(start, end, obstacleBoxes, routedSegments, wireClearance) {
  const xValues = [start.x, end.x];
  const yValues = [start.y, end.y];

  collectRoutingCoordinates(
    obstacleBoxes,
    routedSegments,
    xValues,
    yValues,
    wireClearance
  );

  addParallelChannelMidpoints(
    routedSegments,
    xValues,
    yValues,
    wireClearance
  );

  return {
    xs: uniqueSortedNumbers(xValues),
    ys: uniqueSortedNumbers(yValues),
  };
}

function createRoutingIndexes(start, end, grid) {
  return {
    startX: grid.xs.indexOf(Number(start.x.toFixed(2))),
    startY: grid.ys.indexOf(Number(start.y.toFixed(3))),
    endX: grid.xs.indexOf(Number(end.x.toFixed(3))),
    endY: grid.ys.indexOf(Number(end.y.toFixed(3))),
  };
}

function pointAt(grid, xIndex, yIndex) {
  return {
    x: grid.xs[xIndex],
    y: grid.ys[yIndex],
  };
}

function pointAllowed(point, routingContext) {
  for (const box of routingContext.obstacleIndex.query(getPointBounds(point))) if (pointInsideBox(point, box)) return false;
  return true;
}

function segmentIntersectsOtherNet(candidate, existing, net, clearance = 10) {
  if (!existing?.a || !existing?.b || (existing.net && net && existing.net === net)) return false;
  return axisAlignedSegmentsIntersect(candidate, existing) || segmentsWithinClearance(candidate, existing, clearance);
}

function segmentAllowed(first, second, routingContext) {
  const candidate = { a: first, b: second }, bounds = getSegmentBounds(first, second, routingContext.wireClearance);

  for (const box of routingContext.obstacleIndex.query(bounds)) if (axisAlignedSegmentHitsBox(first, second, box)) return false;
  for (const existing of routingContext.segmentIndex.query(bounds)) if (segmentIntersectsOtherNet(candidate, existing, routingContext.net, routingContext.wireClearance)) return false;

  return true;
}

function stateKey(xIndex, yIndex, direction) {
  return `${xIndex},${yIndex},${direction}`;
}

function createNeighborIndexes(currentState) {
  return [
    [currentState.xIndex - 1, currentState.yIndex, "H"],
    [currentState.xIndex + 1, currentState.yIndex, "H"],
    [currentState.xIndex, currentState.yIndex - 1, "V"],
    [currentState.xIndex, currentState.yIndex + 1, "V"],
  ];
}

function indexesAllowed(nextX, nextY, grid) {
  return (
    nextX >= 0 &&
    nextY >= 0 &&
    nextX < grid.xs.length &&
    nextY < grid.ys.length
  );
}

function calculateBendCost(currentDirection, nextDirection, bendPenalty) {
  return currentDirection !== "N" &&
    currentDirection !== nextDirection
    ? bendPenalty
    : 0;
}

function calculateRouteDistance(currentState, currentPoint, nextPoint, searchContext) {
  const length =
    Math.abs(currentPoint.x - nextPoint.x) +
    Math.abs(currentPoint.y - nextPoint.y);

  const bendCost = calculateBendCost(
    currentState.direction,
    searchContext.nextDirection,
    searchContext.bendPenalty
  );

  const wireCost = getWirePenalty(
    currentPoint,
    nextPoint,
    searchContext.routingContext
  );

  return searchContext.currentDistance + length + bendCost + wireCost;
}

function routeAllowed(points, routingContext) {
  for (let index = 1; index < points.length - 1; index++) if (!pointAllowed(points[index], routingContext)) return false;
  for (let index = 1; index < points.length; index++) if (!segmentAllowed(points[index - 1], points[index], routingContext)) return false;
  return true;
}

function trySimpleOrthogonalRoute(start, end, routingContext) {
  const candidates = [];

  if (Math.abs(start.x - end.x) < 0.5 || Math.abs(start.y - end.y) < 0.5) candidates.push([start, end]);
  else {
    candidates.push(
      [start, { x: end.x, y: start.y }, end],
      [start, { x: start.x, y: end.y }, end]
    );
  }

  for (const route of candidates) {
    const simplified = simplifyOrthogonalPoints(route);
    if (routeAllowed(simplified, routingContext)) return simplified;
  }

  return null;
}

function processNeighbor(currentState, neighbor, searchContext) {
  const [nextX, nextY, nextDirection] = neighbor;
  const {
    grid,
    routingContext,
    bendPenalty,
    distances,
    previous,
    queue,
    end,
  } = searchContext;

  if (!indexesAllowed(nextX, nextY, grid)) {
    return;
  }

  const currentPoint = pointAt(
    grid,
    currentState.xIndex,
    currentState.yIndex
  );

  const nextPoint = pointAt(grid, nextX, nextY);

  if (
    !pointAllowed(nextPoint, routingContext) ||
    !segmentAllowed(currentPoint, nextPoint, routingContext)
  ) {
    return;
  }

  const currentKey = stateKey(
    currentState.xIndex,
    currentState.yIndex,
    currentState.direction
  );

  const currentDistance = distances.get(currentKey);
  
  const nextDistance = calculateRouteDistance(currentState, currentPoint, nextPoint, {
    currentDistance, nextDirection, bendPenalty, routingContext
  });

  const nextKey = stateKey(nextX, nextY, nextDirection);

  if (nextDistance >= (distances.get(nextKey) ?? Infinity)) {
    return;
  }

  distances.set(nextKey, nextDistance);
  previous.set(nextKey, currentKey);

  const heuristic =
    Math.abs(nextPoint.x - end.x) +
    Math.abs(nextPoint.y - end.y);

  queue.push({
    xIndex: nextX,
    yIndex: nextY,
    direction: nextDirection,
    distance: nextDistance,
    priority: nextDistance + heuristic
  });
}

function isGoalState(currentState, indexes) {
  return (
    currentState.xIndex === indexes.endX &&
    currentState.yIndex === indexes.endY
  );
}

function searchShortestRoute(start, end, grid, indexes, routingContext, bendPenalty) {
  const queue = new RoutingMinHeap();
  const distances = new Map();
  const previous = new Map();

  const startKey = stateKey(
    indexes.startX,
    indexes.startY,
    "N"
  );

  distances.set(startKey, 0);

  queue.push({
    xIndex: indexes.startX,
    yIndex: indexes.startY,
    direction: "N",
    distance: 0,
    priority: Math.abs(start.x - end.x) + Math.abs(start.y - end.y)
  });

  while (true) {
    const currentState = queue.pop();
    if (!currentState) return { goalKey: null, previous };

    const currentKey = stateKey(currentState.xIndex, currentState.yIndex, currentState.direction);
    if (currentState.distance !== distances.get(currentKey)) continue;

    if (isGoalState(currentState, indexes)) return { goalKey: currentKey, previous };

    const neighbors = createNeighborIndexes(currentState);
    for (const neighbor of neighbors) processNeighbor(currentState, neighbor, { grid, routingContext, bendPenalty, distances, previous, queue, end });
  }
}

function reconstructRoute(goalKey, previous, grid) {
  const reversed = [];
  let currentKey = goalKey;

  while (currentKey) {
    const [xIndex, yIndex] = currentKey
      .split(",")
      .slice(0, 2)
      .map(Number);

    reversed.push(pointAt(grid, xIndex, yIndex));
    currentKey = previous.get(currentKey);
  }

  return simplifyOrthogonalPoints(reversed.toReversed());
}

function findShortestOrthogonalRoute(start, end, obstacleBoxes, routedSegments, net = null) {
  if (start.x > end.x + 0.5) return null;

  const wireClearance = 10, bendPenalty = 14;
  const { obstacleIndex, segmentIndex } = createRoutingSpatialIndexes(obstacleBoxes, routedSegments, wireClearance);

  const routingContext = {
    obstacleBoxes,
    routedSegments,
    net,
    wireClearance,
    obstacleIndex,
    segmentIndex
  };

  const simpleRoute = trySimpleOrthogonalRoute(start, end, routingContext);
  if (simpleRoute) return simpleRoute;

  const grid = createRoutingGrid(start, end, obstacleBoxes, routedSegments, wireClearance);
  const indexes = createRoutingIndexes(start, end, grid);

  const { goalKey, previous } = searchShortestRoute(start, end, grid, indexes, routingContext, bendPenalty);

  if (!goalKey) {
    console.debug(`Preferred route not found for ${net}; caller may use a fallback`, { start, end });
    return null;
  }

  return reconstructRoute(goalKey, previous, grid);
}

function needsSideApproach(element) {
  return getElementType(element) === "L" || isStandaloneResistor(element);
}

function getComponentApproachPoint(terminal, point, clearance = 18) {
  const element = terminal?.element;
  if (!element || !needsSideApproach(element)) return { ...point };

  const pin = terminal.kind === "in" ? element.inputPin : terminal.kind === "out" ? element.outputPin : null;
  let sideDirection = pin && Number.isFinite(pin.x) ? Math.sign(pin.x - element.x) : 0;

  if (!sideDirection) {
    const horizontalOffset = point.x - element.x;
    if (Math.abs(horizontalOffset) > 0.5) sideDirection = Math.sign(horizontalOffset);
  }

  if (!sideDirection) sideDirection = terminal.kind === "in" ? -1 : 1;

  return {
    x: point.x + sideDirection * clearance,
    y: point.y
  };
}

function buildShortestFreeRoute(fromPoint, toPoint, fromTerminal, toTerminal, cellElements, routedSegments, net) {
  let first = { terminal: fromTerminal, point: getTerminalRoutingPoint(fromTerminal, fromPoint) };
  let second = { terminal: toTerminal, point: getTerminalRoutingPoint(toTerminal, toPoint) };

  first.approach = getComponentApproachPoint(first.terminal, first.point);
  second.approach = getComponentApproachPoint(second.terminal, second.point);

  if (first.approach.x > second.approach.x) { [first, second] = [second, first]; }

  const endpointElements = [first.terminal?.element, second.terminal?.element].filter(Boolean);
  const excludedIds = new Set(endpointElements.map((element) => element.id).filter(Boolean));
  const obstacleBoxes = getRouteObstacleBoxes(cellElements, excludedIds, 10);

  for (const element of endpointElements) {
    if (!needsSideApproach(element)) continue;

    obstacleBoxes.push({
      left: element.x - drawConfig.imageSize / 2 - 1,
      right: element.x + drawConfig.imageSize / 2 + 1,
      top: element.y - drawConfig.imageSize / 2 - 1,
      bottom: element.y + drawConfig.imageSize / 2 + 1,
      ownerIds: new Set([element.id]),
      kind: isStandaloneResistor(element) ? "endpoint-resistor" : "endpoint-inductor"
    });
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


function pushUniqueRoutePoint(adjusted, point, epsilon) {
  const previous = adjusted.at(-1);
  if (previous && Math.abs(previous.x - point.x) < epsilon && Math.abs(previous.y - point.y) < epsilon) return;
  adjusted.push({ x: point.x, y: point.y });
}

function findConflictingJRRail(first, second, jrRails, net, jrMargin, epsilon) {
  const segmentMinX = Math.min(first.x, second.x);
  const segmentMaxX = Math.max(first.x, second.x);

  return jrRails.find((rail) => {
    if (net && rail.net === net) return false;
    const overlap = Math.min(segmentMaxX, rail.maxX) - Math.max(segmentMinX, rail.minX);
    return overlap > epsilon && Math.abs(first.y - rail.y) < jrMargin;
  });
}

function getJRVerticalDirection(firstY, rail, epsilon) {
  if (firstY < rail.y - epsilon) return -1;
  if (firstY > rail.y + epsilon) return 1;
  return rail.side === "top" ? -1 : 1;
}

function addJRDetour(adjusted, first, second, rail, jrMargin, epsilon) {
  const segmentMinX = Math.min(first.x, second.x);
  const segmentMaxX = Math.max(first.x, second.x);
  const verticalDirection = getJRVerticalDirection(first.y, rail, epsilon);
  const detourY = rail.y + verticalDirection * jrMargin;
  const detourMinX = Math.max(segmentMinX, rail.minX - jrMargin);
  const detourMaxX = Math.min(segmentMaxX, rail.maxX + jrMargin);
  const movingRight = second.x >= first.x;
  const entryX = movingRight ? detourMinX : detourMaxX;
  const exitX = movingRight ? detourMaxX : detourMinX;

  pushUniqueRoutePoint(adjusted, { x: entryX, y: first.y }, epsilon);
  pushUniqueRoutePoint(adjusted, { x: entryX, y: detourY }, epsilon);
  pushUniqueRoutePoint(adjusted, { x: exitX, y: detourY }, epsilon);
  pushUniqueRoutePoint(adjusted, { x: exitX, y: first.y }, epsilon);
  pushUniqueRoutePoint(adjusted, second, epsilon);
}

function separateRouteFromJR(points, net, jrRails = [], jrMargin = 12) {
  if (!Array.isArray(points) || points.length < 2 || jrRails.length === 0) return points;

  const epsilon = 0.5;
  const adjusted = [];
  pushUniqueRoutePoint(adjusted, points[0], epsilon);

  for (let index = 1; index < points.length; index++) {
    const first = points[index - 1];
    const second = points[index];
    const isEndpointSegment = index === 1 || index === points.length - 1;
    const horizontal = Math.abs(first.y - second.y) < epsilon;

    if (isEndpointSegment || !horizontal) {
      pushUniqueRoutePoint(adjusted, second, epsilon);
      continue;
    }

    const conflictingRail = findConflictingJRRail(first, second, jrRails, net, jrMargin, epsilon);

    if (!conflictingRail) {
      pushUniqueRoutePoint(adjusted, second, epsilon);
      continue;
    }

    addJRDetour(adjusted, first, second, conflictingRail, jrMargin, epsilon);
  }

  return simplifyOrthogonalPoints(adjusted);
}
function railAlreadyAdded(rail, segments) {
  return segments.some((segment) => segment.ownerId === rail.ownerId && Math.abs(segment.a.y - rail.y) < 0.5 &&
    Math.abs(Math.min(segment.a.x, segment.b.x) - rail.minX) < 0.5 && Math.abs(Math.max(segment.a.x, segment.b.x) - rail.maxX) < 0.5);
}

function addOwnerRailsToConnectedNet(ownerId, context) {
  if (!ownerId) return;
  const { jrRails, net, connectedNetSegments } = context;

  for (const rail of jrRails) {
    if (rail.ownerId !== ownerId || rail.net !== net || railAlreadyAdded(rail, connectedNetSegments)) continue;
    connectedNetSegments.push({ a: { x: rail.minX, y: rail.y }, b: { x: rail.maxX, y: rail.y }, net, ownerId: rail.ownerId, isJRRail: true });
  }
}

function closestPointOnSegment(point, segment) {
  const epsilon = 0.5;
  const horizontal = Math.abs(segment.a.y - segment.b.y) < epsilon;

  if (horizontal) {
    const minimumX = Math.min(segment.a.x, segment.b.x);
    const maximumX = Math.max(segment.a.x, segment.b.x);
    return { x: Math.max(minimumX, Math.min(maximumX, point.x)), y: segment.a.y };
  }

  const vertical = Math.abs(segment.a.x - segment.b.x) < epsilon;
  if (!vertical) return null;

  const minimumY = Math.min(segment.a.y, segment.b.y);
  const maximumY = Math.max(segment.a.y, segment.b.y);
  return { x: segment.a.x, y: Math.max(minimumY, Math.min(maximumY, point.y)) };
}

function findClosestPointOnConnectedNet(destination, connectedNetSegments) {
  let best = null;

  connectedNetSegments.forEach((segment, segmentIndex) => {
    const point = closestPointOnSegment(destination, segment);
    if (!point) return;

    const distance = getManhattanDistance(point, destination);
    if (!best || distance < best.distance) best = { point, distance, segmentIndex };
  });

  return best;
}

function findTerminalConnection(candidate, index, connected, currentBest) {
  let bestConnection = currentBest;

  for (const connectedTerminal of connected) {
    if (candidate.ownerId === connectedTerminal.ownerId) continue;

    const pointConnection = findBestTerminalConnection(connectedTerminal, candidate);
    if (!pointConnection) continue;

    const sameKindPenalty = connectedTerminal.kind === candidate.kind ? 1000000 : 0;
    const score = pointConnection.distance + sameKindPenalty;

    if (!bestConnection || score < bestConnection.score) {
      bestConnection = {
        from: connectedTerminal, to: candidate, fromPoint: pointConnection.firstPoint, toPoint: pointConnection.secondPoint,
        remainingIndex: index, score, startsFromExistingNet: false
      };
    }
  }

  return bestConnection;
}

function createExistingNetConnection(candidate, destinationPoint, existingConnection, index, net) {
  const sourcePoint = { ...existingConnection.point };

  return {
    from: {
      net, kind: "existing-net", ownerId: `existing-net:${net}:${existingConnection.segmentIndex}`, element: null,
      point: sourcePoint, candidatePoints: [sourcePoint], selectedPoint: sourcePoint
    },
    to: candidate, fromPoint: sourcePoint, toPoint: destinationPoint, remainingIndex: index,
    score: existingConnection.distance, startsFromExistingNet: true
  };
}

function findExistingNetConnection(candidate, index, currentBest, context) {
  let bestConnection = currentBest;

  for (const destinationPoint of getTerminalPoints(candidate)) {
    const existingConnection = findClosestPointOnConnectedNet(destinationPoint, context.connectedNetSegments);
    if (!existingConnection) continue;
    if (bestConnection && existingConnection.distance >= bestConnection.score) continue;

    bestConnection = createExistingNetConnection(candidate, destinationPoint, existingConnection, index, context.net);
  }

  return bestConnection;
}

function findBestSharedConnection(context) {
  let bestConnection = null;

  for (let index = 0; index < context.remaining.length; index++) {
    const candidate = context.remaining[index];
    bestConnection = findTerminalConnection(candidate, index, context.connected, bestConnection);
    bestConnection = findExistingNetConnection(candidate, index, bestConnection, context);
  }

  return bestConnection;
}

function removeSharedCandidate(connection, context) {
  context.remaining.splice(connection.remainingIndex, 1);
}

function connectSharedCandidate(connection, context) {
  context.connected.push(connection.to);
  addOwnerRailsToConnectedNet(connection.to.ownerId, context);
  removeSharedCandidate(connection, context);
}

function drawSharedNetLabel(routePoints, context) {
  if (context.labelWasDrawn) return;

  const labelSegment = getLongestHorizontalSegment(routePoints);
  if (!labelSegment) return;

  drawLabel(context.labelLayer, context.net, (labelSegment.a.x + labelSegment.b.x) / 2, labelSegment.a.y, { size: "8.5px", fill: "#334155" });
  context.labelWasDrawn = true;
}

function getSharedRoute(connection, context) {
  return buildShortestFreeRoute(connection.fromPoint, connection.toPoint, connection.from, connection.to,
    context.cellElements, context.routedSegments, context.net);
}

function warnUnroutableSharedConnection(connection, context) {
  console.warn(`Skipping unroutable shared connection for ${context.net}`, {
    from: connection.fromPoint, to: connection.toPoint, fromOwner: connection.from.ownerId, toOwner: connection.to.ownerId
  });
}

function drawAndStoreSharedRoute(routePoints, context) {
  drawPath(context.wireLayer, routePoints[0], routePoints[routePoints.length - 1], {
    stroke: drawConfig.wireStroke, pathData: routePointsToPathData(routePoints), net: context.net, kind: "shared-net-route"
  });

  const taggedSegments = routePointsToSegments(routePoints).map((segment) => ({ ...segment, net: context.net }));
  context.routedSegments.push(...taggedSegments);
  context.connectedNetSegments.push(...taggedSegments);
  drawSharedNetLabel(routePoints, context);
}

function processSharedConnection(connection, context) {
  if (connection.startsFromExistingNet && connection.score < 0.5) {
    connectSharedCandidate(connection, context);
    return;
  }

  const routePoints = getSharedRoute(connection, context);

  if (!Array.isArray(routePoints) || routePoints.length < 2) {
    warnUnroutableSharedConnection(connection, context);
    removeSharedCandidate(connection, context);
    return;
  }

  drawAndStoreSharedRoute(routePoints, context);
  connectSharedCandidate(connection, context);
}

function drawSharedOutputNet(wireLayer, labelLayer, net, terminals, cellElements, routedSegments, jrRails = []) {
  const outputs = terminals.filter((terminal) => terminal.kind === "out")
    .sort((first, second) => (first.element?.layoutOrder ?? Infinity) - (second.element?.layoutOrder ?? Infinity));

  const root = outputs[0] || terminals[0];
  const context = {
    wireLayer, labelLayer, net, cellElements, routedSegments, jrRails,
    connected: [root], remaining: terminals.filter((terminal) => terminal !== root),
    connectedNetSegments: [], labelWasDrawn: false
  };

  addOwnerRailsToConnectedNet(root.ownerId, context);

  while (context.remaining.length > 0) {
    const bestConnection = findBestSharedConnection(context);
    if (!bestConnection) break;
    processSharedConnection(bestConnection, context);
  }
}

function getTerminalSpan(terminals) {
  const points = terminals.flatMap((terminal) => getTerminalPoints(terminal));
  if (points.length === 0) {return 0;}

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);

  return (Math.max(...xs) - Math.min(...xs) + Math.max(...ys) - Math.min(...ys));
}

function groupElementsByLayoutInstance(placed) {
  const elementsByCell = new Map();

  for (const element of placed) {
    const layoutInstance = getLayoutInstance(element);
    if (!elementsByCell.has(layoutInstance)) elementsByCell.set(layoutInstance, []);
    elementsByCell.get(layoutInstance).push(element);
  }

  return elementsByCell;
}

function getSortedConnectionEntries(cellElements) {
  const terminalsByNet = collectNetTerminals(cellElements);
  const entries = [...terminalsByNet.entries()].filter(([, terminals]) => terminals.length >= 2);
  const sortBySpan = ([, first], [, second]) => getTerminalSpan(first) - getTerminalSpan(second);

  return {
    ordinaryEntries: entries.filter(([, terminals]) => !isSharedOutputConflict(terminals)).sort(sortBySpan),
    sharedOutputEntries: entries.filter(([, terminals]) => isSharedOutputConflict(terminals)).sort(sortBySpan)
  };
}

function createJRPairRails(current, geometry) {
  return [
    {
      minX: Math.min(geometry.topAtJJ.x, geometry.topAtResistor.x), maxX: Math.max(geometry.topAtJJ.x, geometry.topAtResistor.x),
      y: geometry.topAtJJ.y, net: current.net_in, side: "top", ownerId: `pair:${current.id}`
    },
    {
      minX: Math.min(geometry.bottomAtJJ.x, geometry.bottomAtResistor.x), maxX: Math.max(geometry.bottomAtJJ.x, geometry.bottomAtResistor.x),
      y: geometry.bottomAtJJ.y, net: current.net_out, side: "bottom", ownerId: `pair:${current.id}`
    }
  ];
}

function collectJRRails(cellElements) {
  const jrRails = [];

  for (let index = 0; index < cellElements.length - 1; index++) {
    const current = cellElements[index];
    const next = cellElements[index + 1];

    if (!isJJResistorPair(current, next)) continue;

    const geometry = getJJPairGeometry(current, next, 25);
    jrRails.push(...createJRPairRails(current, geometry));
    index++;
  }

  return jrRails;
}

function addInductorLeadSegments(cellElements, routedSegments) {
  for (const element of cellElements) {
    if (!needsSideApproach(element)) continue;

    if (element.inputNeedsLead && element.net_in && element.inputPin && element.inputLeadPoint) {
      routedSegments.push({ a: element.inputPin, b: element.inputLeadPoint, net: element.net_in, protectedInductorLead: true });
    }

    if (element.outputNeedsLead && element.net_out && element.outputPin && element.outputLeadPoint) {
      routedSegments.push({ a: element.outputPin, b: element.outputLeadPoint, net: element.net_out, protectedInductorLead: true });
    }
  }
}

function addJRRailSegments(jrRails, routedSegments) {
  for (const rail of jrRails) {
    routedSegments.push({
      a: { x: rail.minX, y: rail.y }, b: { x: rail.maxX, y: rail.y }, net: rail.net,
      kind: "jr-rail-obstacle", ownerId: rail.ownerId, isJRRail: true
    });
  }
}

function storeNewWireSegments(wireLayer, firstNewChild, routedSegments, net) {
  const newChildren = Array.from(wireLayer.children).slice(firstNewChild);

  for (const child of newChildren) {
    routedSegments.push(...extractWireSegmentsFromElement(child).map((segment) => ({ ...segment, net })));
  }
}

function drawOrdinaryConnection(net, terminals, context) {
  const { wireLayer, labelLayer, cellElements, routedSegments, jrRails, jrMargin } = context;
  const firstNewChild = wireLayer.children.length;
  const routedSegmentCount = routedSegments.length;

  drawTerminalTree(wireLayer, labelLayer, net, terminals, { drawLabel: true, cellElements, routedSegments, jrRails, jrMargin });

  if (routedSegments.length === routedSegmentCount) storeNewWireSegments(wireLayer, firstNewChild, routedSegments, net);
}

function drawOrdinaryConnections(entries, context) {
  for (const [net, terminals] of entries) drawOrdinaryConnection(net, terminals, context);
}

function drawSharedConnections(entries, context) {
  const { wireLayer, labelLayer, cellElements, routedSegments, jrRails } = context;

  for (const [net, terminals] of entries) {
    drawSharedOutputNet(wireLayer, labelLayer, net, terminals, cellElements, routedSegments, jrRails);
  }
}

function drawLayoutCellConnections(layoutInstance, cellElements, wireLayer, labelLayer) {
  const { ordinaryEntries, sharedOutputEntries } = getSortedConnectionEntries(cellElements);
  const routedSegments = [];
  const jrRails = collectJRRails(cellElements);
  const jrMargin = 12;

  addInductorLeadSegments(cellElements, routedSegments);
  addJRRailSegments(jrRails, routedSegments);

  const context = { wireLayer, labelLayer, cellElements, routedSegments, jrRails, jrMargin };

  drawOrdinaryConnections(ordinaryEntries, context);
  drawSharedConnections(sharedOutputEntries, context);

  console.log(`Finished internal connections for ${layoutInstance}`, {
    ordinaryNets: ordinaryEntries.length,
    reroutedSharedOutputs: sharedOutputEntries.length,
    jrRails: jrRails.length
  });
}

function drawConnectionsInsideLayoutCells(wireLayer, labelLayer, placed) {
  const elementsByCell = groupElementsByLayoutInstance(placed);

  for (const [layoutInstance, cellElements] of elementsByCell) {
    drawLayoutCellConnections(layoutInstance, cellElements, wireLayer, labelLayer);
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