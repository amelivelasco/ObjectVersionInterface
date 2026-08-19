function isSharedOutputConflict(terminals) { 
  const outputs = terminals.filter((terminal) => terminal.kind === "out" && terminal.element);

  if (outputs.length < 2) { return false; }

  const distinctInputNets = new Set(outputs.map((terminal) => terminal.element.net_in ?? "__missing__"));
  return distinctInputNets.size > 1;
}

function extractLineSegment(element) {
  return {
    a: { x: Number(element.getAttribute("x1")), y: Number(element.getAttribute("y1")) },
    b: { x: Number(element.getAttribute("x2")), y: Number(element.getAttribute("y2")) }
  };
}

function getNextPathPoint(command, tokens, state) {
  if (command === "M" || command === "L") return { x: Number(tokens[state.index++]), y: Number(tokens[state.index++]) };
  if (command === "H") return { x: Number(tokens[state.index++]), y: state.current.y };
  if (command === "V") return { x: state.current.x, y: Number(tokens[state.index++]) };
  return null;
}

function updatePathCommand(tokens, state) {
  if (!/^[MLHV]$/i.test(tokens[state.index])) return;
  state.command = tokens[state.index].toUpperCase();
  state.index++;
}

function extractPathSegments(element) {
  const segments = [];
  const tokens = element.getAttribute("d")?.match(/[MLHV]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) || [];
  const state = { index: 0, command: null, current: null };

  while (state.index < tokens.length) {
    updatePathCommand(tokens, state);
    if (!state.command) break;

    const next = getNextPathPoint(state.command, tokens, state);
    if (!next) break;

    if (state.current && state.command !== "M") segments.push({ a: { ...state.current }, b: { ...next } });
    state.current = next;
  }

  return segments;
}

function extractWireSegmentsFromElement(element) {
  const tagName = element.tagName?.toLowerCase();
  if (tagName === "line") return [extractLineSegment(element)];
  if (tagName !== "path") return [];
  return extractPathSegments(element);
}

function buildRoutingObstacleBoxes(elements, excludedIds = new Set(), padding = 10) {
  const boxes = [];
  const consumedIds = new Set();
  const halfSize = drawConfig.imageSize / 2;
  const groundImageWidth = drawConfig.imageSize / 2;
  const groundImageHeight = drawConfig.imageSize / 2;
  const groundImageOffsetX = 10;

  for (const current of elements) {
    if (
      consumedIds.has(current.id) ||
      getElementType(current) !== "JJ"
    ) {continue;}

    const resistor = elements.find((candidate) => !consumedIds.has(candidate.id) && isJJResistorPair(current, candidate));

    if (!resistor) { continue; }

    consumedIds.add(current.id);

    consumedIds.add(resistor.id);

    const ownerIds = new Set([current.id, resistor.id,]);

    const geometry = getJJPairGeometry(current, resistor, 25);

  
    boxes.push({
      left: Math.min(current.x, resistor.x) - halfSize - padding,
      right: Math.max(current.x, resistor.x) + halfSize + padding,
      top: geometry.topMiddle.y,
      bottom: geometry.bottomMiddle.y,
      ownerIds,
      isJRPair: true,
    });

    if (current.net_out === "GND!") {
      const groundX =  geometry.bottomMiddle.x;
      const groundY = geometry.bottomMiddle.y;
      const imageLeft = groundX - groundImageOffsetX;
      const imageRight = imageLeft + groundImageWidth;
      const imageTop = groundY;
      const imageBottom = imageTop + groundImageHeight;

      boxes.push({
        left: imageLeft - padding,
        right: imageRight + padding,
        top: imageTop - padding,
        bottom: imageBottom + padding,
        ownerIds,
        isGroundSymbol: true,
        isJRPairGround: true,
      });
    }
  }

  for (const element of elements) {
    if (consumedIds.has(element.id) || excludedIds.has(element.id)
    ) {
      continue;
    }

    const elementPadding = getElementType(element) === "L" ? Math.max(padding, drawConfig.wireStrokeWidth + 14 ) : padding;

    boxes.push({
      left: element.x - halfSize - elementPadding,
      right: element.x + halfSize + elementPadding,
      top: element.y - halfSize - elementPadding,
      bottom: element.y + halfSize + elementPadding,
      ownerIds: new Set([element.id,]),
    });
  }

  return boxes;
}

function pointInsideBox(point, box) {
  const epsilon = 0.5;

  return (
    point.x > box.left + epsilon &&
    point.x < box.right - epsilon &&
    point.y > box.top + epsilon &&
    point.y < box.bottom - epsilon
  );
}

function axisAlignedSegmentHitsBox(first, second, box) {
  const epsilon = 0.5;

  if (Math.abs(first.y - second.y) < epsilon) {
    const minimumX = Math.min(first.x, second.x);
    const maximumX = Math.max(first.x, second.x);

    return (
      first.y > box.top + epsilon &&
      first.y < box.bottom - epsilon &&
      maximumX > box.left + epsilon &&
      minimumX < box.right - epsilon
    );
  }

  if (Math.abs(first.x - second.x) < epsilon) {
    const minimumY = Math.min(first.y, second.y);
    const maximumY = Math.max(first.y, second.y);

    return (
      first.x > box.left + epsilon &&
      first.x < box.right - epsilon &&
      maximumY > box.top + epsilon &&
      minimumY < box.bottom - epsilon
    );
  }

  return true;
}

function getParallelWireOverlap(first, second, horizontal, epsilon) {
  const firstFixed = horizontal ? first.a.y : first.a.x;
  const secondFixed = horizontal ? second.a.y : second.a.x;
  if (Math.abs(firstFixed - secondFixed) >= epsilon) return null;

  const firstStart = horizontal ? first.a.x : first.a.y;
  const firstEnd = horizontal ? first.b.x : first.b.y;
  const secondStart = horizontal ? second.a.x : second.a.y;
  const secondEnd = horizontal ? second.b.x : second.b.y;

  const overlap = Math.min(Math.max(firstStart, firstEnd), Math.max(secondStart, secondEnd)) -
    Math.max(Math.min(firstStart, firstEnd), Math.min(secondStart, secondEnd));

  return overlap > epsilon ? "overlap" : null;
}

function wiresCross(first, second, firstHorizontal, epsilon) {
  const horizontal = firstHorizontal ? first : second;
  const vertical = firstHorizontal ? second : first;
  const crossingX = vertical.a.x;
  const crossingY = horizontal.a.y;

  const crossesHorizontalInterior = crossingX > Math.min(horizontal.a.x, horizontal.b.x) + epsilon &&
    crossingX < Math.max(horizontal.a.x, horizontal.b.x) - epsilon;
  const crossesVerticalInterior = crossingY > Math.min(vertical.a.y, vertical.b.y) + epsilon &&
    crossingY < Math.max(vertical.a.y, vertical.b.y) - epsilon;

  return crossesHorizontalInterior && crossesVerticalInterior ? "cross" : null;
}

function getWireRelation(first, second) {
  const epsilon = 0.5;
  const firstHorizontal = Math.abs(first.a.y - first.b.y) < epsilon;
  const secondHorizontal = Math.abs(second.a.y - second.b.y) < epsilon;

  if (firstHorizontal === secondHorizontal) return getParallelWireOverlap(first, second, firstHorizontal, epsilon);
  return wiresCross(first, second, firstHorizontal, epsilon);
}

function getWirePenalty(first, second, routedSegments) {
  const candidate = { a: first, b: second, };

  let penalty = 0;

  for (const existing of routedSegments) {
    const relation = getWireRelation(candidate, existing);

    if (relation === "cross") { penalty += 1000000000; }
  }

  return penalty;
}

function uniqueSortedNumbers(values) {
  return [...new Set(values.map((value) => Number(value.toFixed(3)))
  )].sort((first, second) => first - second);
}

class RoutingMinHeap {
  constructor() { this.items = [];  }

  push(item) { this.items.push(item); this.bubbleUp(this.items.length - 1); }

  pop() { if (this.items.length === 0) { return null; }

    const first = this.items[0];
    const last = this.items.pop();

    if (this.items.length > 0) {
      this.items[0] = last;
      this.bubbleDown(0);
    }

    return first;
  }

  bubbleUp(index) {
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);

      if (this.items[parent].priority <= this.items[index].priority
      ) { break; }

      [this.items[parent], this.items[index],] = [this.items[index], this.items[parent],];

      index = parent;
    }
  }

  bubbleDown(index) {
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      let smallest = index;

      if (left < this.items.length && this.items[left].priority < this.items[smallest].priority
      ) { smallest = left; }

      if (right < this.items.length && this.items[right].priority < this.items[smallest].priority
      ) { smallest = right; }

      if (smallest === index) { break; }

      [this.items[index], this.items[smallest],] = [this.items[smallest], this.items[index],];

      index = smallest;
    }
  }
}

function simplifyOrthogonalPoints(points) {
  const cleaned = [];

  for (const point of points) {
    const previous = cleaned.at(-1);

    if (previous && Math.abs(previous.x - point.x) < 0.5 && Math.abs(previous.y - point.y) < 0.5
    ) { continue; }

    cleaned.push({ ...point });
  }

  let index = 1;

  while (index < cleaned.length - 1) {
    const previous = cleaned[index - 1];
    const current = cleaned[index];
    const next = cleaned[index + 1];
    const sameX = Math.abs(previous.x - current.x) < 0.5 && Math.abs(current.x - next.x) < 0.5;
    const sameY = Math.abs(previous.y - current.y) < 0.5 && Math.abs(current.y - next.y) < 0.5;

    if (sameX || sameY) { cleaned.splice(index, 1); } else { index++; }
  }

  return cleaned;
}

function routePointsToPathData(points) {
  const cleaned = simplifyOrthogonalPoints(points);

  if (cleaned.length === 0) { return ""; }

  const commands = [`M ${cleaned[0].x} ${cleaned[0].y}`,];

  for (let index = 1; index < cleaned.length; index++) {
    const previous = cleaned[index - 1];
    const current = cleaned[index];

    if (Math.abs(previous.y - current.y) < 0.5) {
      commands.push(`H ${current.x}`);
    } else {
      commands.push(`V ${current.y}`);
    }
  }

  return commands.join(" ");
}

function routePointsToSegments(points) {
  const cleaned = simplifyOrthogonalPoints(points);
  const segments = [];

  for (let index = 0; index < cleaned.length - 1; index++
  ) { segments.push({a: cleaned[index], b: cleaned[index + 1],}); }

  return segments;
}

function getGNDObstacleBox(x, y, size = 20, padding = 5) {
  return {
    left: x - size / 2 - padding,
    right: x + size / 2 + padding,
    top: y - padding,
    bottom: y + size + padding,
    ownerIds: new Set(),
    kind: "gnd-symbol",
  };
}


function collectParallelSegments(routedSegments, epsilon) {
  const horizontalSegments = [];
  const verticalSegments = [];

  for (const segment of routedSegments) {
    if (!segment?.a || !segment?.b) continue;

    const horizontal = Math.abs(segment.a.y - segment.b.y) < epsilon;
    const vertical = Math.abs(segment.a.x - segment.b.x) < epsilon;

    if (horizontal) {
      horizontalSegments.push({ y: segment.a.y, minX: Math.min(segment.a.x, segment.b.x), maxX: Math.max(segment.a.x, segment.b.x) });
    } else if (vertical) {
      verticalSegments.push({ x: segment.a.x, minY: Math.min(segment.a.y, segment.b.y), maxY: Math.max(segment.a.y, segment.b.y) });
    }
  }

  horizontalSegments.sort((first, second) => first.y - second.y);
  verticalSegments.sort((first, second) => first.x - second.x);
  return { horizontalSegments, verticalSegments };
}

function addHorizontalChannelForSegment(firstIndex, segments, xValues, yValues, addedMiddleY, config) {
  const first = segments[firstIndex];
  const finalNeighborIndex = Math.min(segments.length, firstIndex + config.maximumNeighbors + 1);

  for (let secondIndex = firstIndex + 1; secondIndex < finalNeighborIndex; secondIndex++) {
    const second = segments[secondIndex];
    const gap = second.y - first.y;
    if (gap > config.maximumChannelGap) break;
    if (gap < config.wireClearance * 2) continue;

    const overlapStart = Math.max(first.minX, second.minX);
    const overlapEnd = Math.min(first.maxX, second.maxX);
    if (overlapEnd - overlapStart < config.epsilon) continue;

    const middleY = Number(((first.y + second.y) / 2).toFixed(3));
    if (!addedMiddleY.has(middleY)) {
      addedMiddleY.add(middleY);
      yValues.push(middleY);
    }

    xValues.push(overlapStart, overlapEnd);
    break;
  }
}

function addHorizontalChannelMidpoints(segments, xValues, yValues, addedMiddleY, config) {
  for (let firstIndex = 0; firstIndex < segments.length; firstIndex++) {
    addHorizontalChannelForSegment(firstIndex, segments, xValues, yValues, addedMiddleY, config);
  }
}

function addVerticalChannelForSegment(firstIndex, segments, xValues, yValues, addedMiddleX, config) {
  const first = segments[firstIndex];
  const finalNeighborIndex = Math.min(segments.length, firstIndex + config.maximumNeighbors + 1);

  for (let secondIndex = firstIndex + 1; secondIndex < finalNeighborIndex; secondIndex++) {
    const second = segments[secondIndex];
    const gap = second.x - first.x;
    if (gap > config.maximumChannelGap) break;
    if (gap < config.wireClearance * 2) continue;

    const overlapStart = Math.max(first.minY, second.minY);
    const overlapEnd = Math.min(first.maxY, second.maxY);
    if (overlapEnd - overlapStart < config.epsilon) continue;

    const middleX = Number(((first.x + second.x) / 2).toFixed(3));
    if (!addedMiddleX.has(middleX)) {
      addedMiddleX.add(middleX);
      xValues.push(middleX);
    }

    yValues.push(overlapStart, overlapEnd);
    break;
  }
}

function addVerticalChannelMidpoints(segments, xValues, yValues, addedMiddleX, config) {
  for (let firstIndex = 0; firstIndex < segments.length; firstIndex++) {
    addVerticalChannelForSegment(firstIndex, segments, xValues, yValues, addedMiddleX, config);
  }
}

function addParallelChannelMidpoints(routedSegments, xValues, yValues, wireClearance) {
  const config = { epsilon: 0.5, maximumChannelGap: 80, maximumNeighbors: 6, wireClearance };
  const { horizontalSegments, verticalSegments } = collectParallelSegments(routedSegments, config.epsilon);
  const addedMiddleX = new Set();
  const addedMiddleY = new Set();

  addHorizontalChannelMidpoints(horizontalSegments, xValues, yValues, addedMiddleY, config);
  addVerticalChannelMidpoints(verticalSegments, xValues, yValues, addedMiddleX, config);
}

function getClosestInterCellPair(terminals) {
  let best = null;

  for (let i = 0; i < terminals.length; i++) {
    for (let j = i + 1; j < terminals.length; j++) {
      const first = terminals[i], second = terminals[j];
      if (first.layoutInstance === second.layoutInstance) continue;

      const distance = Math.abs(first.point.x - second.point.x) + Math.abs(first.point.y - second.point.y);
      if (!best || distance < best.distance) best = { first, second, distance };
    }
  }

  return best;
}

function addInterCellTerminal(element, net, point, side, context) {
  net = String(net || "").trim();
  if (!net || !point || !Number.isFinite(point.x) || !Number.isFinite(point.y) || isGroundNet(net) || net === "VDD") return;

  const layoutInstance = getLayoutInstance(element);
  const key = `${layoutInstance}|${net}|${point.x.toFixed(3)}|${point.y.toFixed(3)}`;
  if (context.terminalKeys.has(key)) return;

  context.terminalKeys.add(key);
  if (!context.terminalsByNet.has(net)) context.terminalsByNet.set(net, []);
  context.terminalsByNet.get(net).push({ net, layoutInstance, ownerId: element.id || element.raw || "", side, point: { x: point.x, y: point.y } });
}

function collectInterCellTerminals(placed) {
  const context = { terminalsByNet: new Map(), terminalKeys: new Set() };

  for (const element of placed) {
    if (element.inputNeedsLead && element.inputLeadPoint) addInterCellTerminal(element, element.net_in, element.inputLeadPoint, "input", context);
    if (element.outputNeedsLead && element.outputLeadPoint) addInterCellTerminal(element, element.net_out, element.outputLeadPoint, "output", context);
  }

  return context.terminalsByNet;
}

function buildInterCellComponentBoxes(placed, halfSize) {
  return placed.map((element) => ({
    left: element.x - halfSize - 4, right: element.x + halfSize + 4,
    top: element.y - halfSize - 4, bottom: element.y + halfSize + 4,
    ownerId: element.id || element.raw || ""
  }));
}

function transformInterCellRenderedPoint(edge, point, svg, externalWireLayer) {
  const edgeMatrix = edge.getScreenCTM();
  const layerMatrix = externalWireLayer.getScreenCTM();
  if (!edgeMatrix || !layerMatrix) return null;

  const svgPoint = svg.createSVGPoint();
  svgPoint.x = point.x;
  svgPoint.y = point.y;
  const transformed = svgPoint.matrixTransform(edgeMatrix).matrixTransform(layerMatrix.inverse());
  return { x: transformed.x, y: transformed.y };
}

function collectInterCellRoutedSegments(svg, externalWireLayer) {
  const routedSegments = [];

  for (const edge of svg.querySelectorAll(".edge[data-net]")) {
    const net = String(edge.dataset.net || "").trim();

    for (const segment of extractWireSegmentsFromElement(edge)) {
      const a = transformInterCellRenderedPoint(edge, segment.a, svg, externalWireLayer);
      const b = transformInterCellRenderedPoint(edge, segment.b, svg, externalWireLayer);
      if (a && b) routedSegments.push({ a, b, net, kind: edge.dataset.kind || "" });
    }
  }

  return routedSegments;
}

function uniqueSortedInterCellValues(values) {
  return [...new Set(values.filter(Number.isFinite).map((value) => Number(value.toFixed(3))))].sort((a, b) => a - b);
}

function pointInsideInterCellObstacle(point, context) {
  return context.componentBoxes.some((box) =>
    point.x > box.left + context.epsilon && point.x < box.right - context.epsilon &&
    point.y > box.top + context.epsilon && point.y < box.bottom - context.epsilon);
}

function interCellSegmentHitsObstacle(first, second, context) {
  return context.componentBoxes.some((box) => axisAlignedSegmentHitsBox(first, second, box));
}

function interCellSegmentHitsAnotherNet(first, second, net, gap, context) {
  const candidate = { a: first, b: second };

  return context.routedSegments.some((existing) => {
    if (!existing?.a || !existing?.b || existing.net === net) return false;
    return axisAlignedSegmentsIntersect(candidate, existing) || segmentsWithinClearance(candidate, existing, gap);
  });
}

function addInterCellObstacleCoordinates(xValues, yValues, gap, context) {
  for (const box of context.componentBoxes) {
    xValues.push(box.left - gap, box.right + gap);
    yValues.push(box.top - gap, box.bottom + gap);
  }
}

function addInterCellSegmentCoordinates(xValues, yValues, gap, context) {
  for (const segment of context.routedSegments) {
    const horizontal = Math.abs(segment.a.y - segment.b.y) <= context.epsilon;

    if (horizontal) {
      xValues.push(segment.a.x, segment.b.x, segment.a.x - gap, segment.b.x + gap);
      yValues.push(segment.a.y - gap, segment.a.y + gap);
    } else {
      xValues.push(segment.a.x - gap, segment.a.x + gap);
      yValues.push(segment.a.y, segment.b.y, segment.a.y - gap, segment.b.y + gap);
    }
  }
}

function buildInterCellRouteGrid(start, end, gap, context) {
  const xValues = [start.x, end.x];
  const yValues = [start.y, end.y];

  addInterCellObstacleCoordinates(xValues, yValues, gap, context);
  addInterCellSegmentCoordinates(xValues, yValues, gap, context);

  const allX = [...xValues];
  const allY = [...yValues];
  const minimumX = Math.min(...allX) - gap * 4;
  const maximumX = Math.max(...allX) + gap * 4;
  const minimumY = Math.min(...allY) - gap * 4;
  const maximumY = Math.max(...allY) + gap * 4;

  xValues.push(minimumX, maximumX);
  yValues.push(minimumY, maximumY);
  return { xs: uniqueSortedInterCellValues(xValues), ys: uniqueSortedInterCellValues(yValues) };
}

function findInterCellGridIndex(values, target) {
  return values.findIndex((value) => Math.abs(value - target) <= 0.001);
}

function getInterCellRouteIndexes(start, end, grid) {
  return {
    startX: findInterCellGridIndex(grid.xs, start.x), startY: findInterCellGridIndex(grid.ys, start.y),
    endX: findInterCellGridIndex(grid.xs, end.x), endY: findInterCellGridIndex(grid.ys, end.y)
  };
}

function interCellRouteIndexesValid(indexes) {
  return indexes.startX >= 0 && indexes.startY >= 0 && indexes.endX >= 0 && indexes.endY >= 0;
}

function interCellPointAt(grid, xIndex, yIndex) {
  return { x: grid.xs[xIndex], y: grid.ys[yIndex] };
}

function interCellStateKey(xIndex, yIndex, direction) {
  return `${xIndex},${yIndex},${direction}`;
}

function interCellSegmentAllowed(first, second, routeContext) {
  if (interCellSegmentHitsObstacle(first, second, routeContext.routingContext)) return false;
  if (interCellSegmentHitsAnotherNet(first, second, routeContext.net, routeContext.gap, routeContext.routingContext)) return false;
  return true;
}

function getInterCellNeighbors(current) {
  return [
    [current.xIndex - 1, current.yIndex, "H"], [current.xIndex + 1, current.yIndex, "H"],
    [current.xIndex, current.yIndex - 1, "V"], [current.xIndex, current.yIndex + 1, "V"]
  ];
}

function interCellNeighborInBounds(nextX, nextY, grid) {
  return nextX >= 0 && nextY >= 0 && nextX < grid.xs.length && nextY < grid.ys.length;
}

function processInterCellRouteNeighbor(current, neighbor, currentKey, currentDistance, context) {
  const [nextX, nextY, nextDirection] = neighbor;
  if (!interCellNeighborInBounds(nextX, nextY, context.grid)) return;

  const nextPoint = interCellPointAt(context.grid, nextX, nextY);
  const isEndpoint = nextX === context.indexes.endX && nextY === context.indexes.endY;
  if ((!isEndpoint && pointInsideInterCellObstacle(nextPoint, context.routingContext)) ||
    !interCellSegmentAllowed(context.currentPoint, nextPoint, context)) return;

  const length = Math.abs(context.currentPoint.x - nextPoint.x) + Math.abs(context.currentPoint.y - nextPoint.y);
  const bendPenalty = current.direction !== "N" && current.direction !== nextDirection ? 18 : 0;
  const nextDistance = currentDistance + length + bendPenalty;
  const nextKey = interCellStateKey(nextX, nextY, nextDirection);
  if (nextDistance >= (context.distances.get(nextKey) ?? Infinity)) return;

  context.distances.set(nextKey, nextDistance);
  context.previous.set(nextKey, currentKey);

  const heuristic = Math.abs(nextPoint.x - context.end.x) + Math.abs(nextPoint.y - context.end.y);
  context.queue.push({ xIndex: nextX, yIndex: nextY, direction: nextDirection, priority: nextDistance + heuristic });
}

function runInterCellRouteSearch(start, end, grid, indexes, net, gap, routingContext) {
  const queue = new RoutingMinHeap();
  const distances = new Map();
  const previous = new Map();
  const startKey = interCellStateKey(indexes.startX, indexes.startY, "N");

  distances.set(startKey, 0);
  queue.push({
    xIndex: indexes.startX, yIndex: indexes.startY, direction: "N",
    priority: Math.abs(start.x - end.x) + Math.abs(start.y - end.y)
  });

  while (true) {
    const current = queue.pop();
    if (!current) return { goalKey: null, previous };

    const currentKey = interCellStateKey(current.xIndex, current.yIndex, current.direction);
    const currentDistance = distances.get(currentKey);
    if (!Number.isFinite(currentDistance)) continue;
    if (current.xIndex === indexes.endX && current.yIndex === indexes.endY) return { goalKey: currentKey, previous };

    const currentPoint = interCellPointAt(grid, current.xIndex, current.yIndex);
    const context = { grid, indexes, net, gap, routingContext, distances, previous, queue, end, currentPoint };

    for (const neighbor of getInterCellNeighbors(current)) processInterCellRouteNeighbor(current, neighbor, currentKey, currentDistance, context);
  }
}

function reconstructInterCellRoute(goalKey, previous, grid) {
  const reversedPoints = [];
  let currentKey = goalKey;

  while (currentKey) {
    const [xIndex, yIndex] = currentKey.split(",").map(Number);
    reversedPoints.push(interCellPointAt(grid, xIndex, yIndex));
    currentKey = previous.get(currentKey);
  }

  reversedPoints.reverse();
  return simplifyOrthogonalPoints(reversedPoints);
}

function findInterCellRoute(start, end, net, gap, routingContext) {
  const grid = buildInterCellRouteGrid(start, end, gap, routingContext);
  const indexes = getInterCellRouteIndexes(start, end, grid);
  if (!interCellRouteIndexesValid(indexes)) return null;

  const { goalKey, previous } = runInterCellRouteSearch(start, end, grid, indexes, net, gap, routingContext);
  return goalKey ? reconstructInterCellRoute(goalKey, previous, grid) : null;
}

function compareInterCellNetEntries(first, second) {
  const firstPair = getClosestInterCellPair(first[1]);
  const secondPair = getClosestInterCellPair(second[1]);
  const firstDistance = firstPair?.distance ?? Infinity;
  const secondDistance = secondPair?.distance ?? Infinity;
  if (firstDistance !== secondDistance) return firstDistance - secondDistance;

  const firstY = Math.min(...first[1].map((terminal) => terminal.point.y));
  const secondY = Math.min(...second[1].map((terminal) => terminal.point.y));
  return firstY - secondY;
}

function groupInterCellTerminalsByCell(terminals) {
  const terminalsByCell = new Map();

  for (const terminal of terminals) {
    if (!terminalsByCell.has(terminal.layoutInstance)) terminalsByCell.set(terminal.layoutInstance, []);
    terminalsByCell.get(terminal.layoutInstance).push(terminal);
  }

  return terminalsByCell;
}

function initializeInterCellConnectionGroups(terminals, terminalsByCell) {
  const remainingCells = [...terminalsByCell.entries()];
  const closestPair = getClosestInterCellPair(terminals);
  const seedCell = closestPair?.first.layoutInstance;
  let seedIndex = remainingCells.findIndex(([cell]) => cell === seedCell);
  if (seedIndex < 0) seedIndex = 0;

  return { connectedCells: [remainingCells.splice(seedIndex, 1)[0]], remainingCells };
}

function buildInterCellCandidates(connectedCells, remainingCells) {
  const candidates = [];

  for (const [, connectedTerminals] of connectedCells) {
    for (let cellIndex = 0; cellIndex < remainingCells.length; cellIndex++) {
      const [, destinationTerminals] = remainingCells[cellIndex];

      for (const first of connectedTerminals) {
        for (const second of destinationTerminals) {
          candidates.push({
            first, second, cellIndex,
            distance: Math.abs(first.point.x - second.point.x) + Math.abs(first.point.y - second.point.y)
          });
        }
      }
    }
  }

  candidates.sort((first, second) => first.distance - second.distance);
  return candidates;
}

function selectInterCellConnection(candidates, net, clearance, routingContext) {
  for (const candidate of candidates) {
    const route = findInterCellRoute(candidate.first.point, candidate.second.point, net, clearance, routingContext) ||
      findInterCellRoute(candidate.first.point, candidate.second.point, net, Math.max(5, clearance / 2), routingContext);

    if (route?.length >= 2) return { ...candidate, route };
  }

  return null;
}

function storeInterCellRouteSegments(route, net, routedSegments) {
  for (const segment of routePointsToSegments(route)) {
    routedSegments.push({
      a: { ...segment.a }, b: { ...segment.b }, net, kind: "inter-cell-terminal-connection"
    });
  }
}

function drawSelectedInterCellConnection(selected, net, context) {
  drawPath(context.externalWireLayer, selected.route[0], selected.route.at(-1), {
    pathData: routePointsToPathData(selected.route), net, kind: "inter-cell-terminal-connection",
    stroke: drawConfig.wireStroke, strokeWidth: drawConfig.wireStrokeWidth
  });

  storeInterCellRouteSegments(selected.route, net, context.routedSegments);
}

function reportMissingInterCellRoute(net, connectedCells, remainingCells) {
  console.error(`[NO LEGAL INTER-CELL ROUTE] ${net}`, {
    connectedCells: connectedCells.map(([cell]) => cell),
    remainingCells: remainingCells.map(([cell]) => cell)
  });
}

function connectInterCellNet(net, terminals, context) {
  const terminalsByCell = groupInterCellTerminalsByCell(terminals);
  if (terminalsByCell.size < 2) return null;

  const { connectedCells, remainingCells } = initializeInterCellConnectionGroups(terminals, terminalsByCell);
  let connectionCount = 0;

  while (remainingCells.length) {
    const candidates = buildInterCellCandidates(connectedCells, remainingCells);
    const selected = selectInterCellConnection(candidates, net, context.clearance, context.routingContext);

    if (!selected) {
      reportMissingInterCellRoute(net, connectedCells, remainingCells);
      break;
    }

    drawSelectedInterCellConnection(selected, net, context);
    connectedCells.push(remainingCells.splice(selected.cellIndex, 1)[0]);
    connectionCount++;

    console.log(`[INTER-CELL CONNECTION DRAWN] ${net}`, {
      fromCell: selected.first.layoutInstance, toCell: selected.second.layoutInstance, route: selected.route
    });
  }

  return { net, cells: [...terminalsByCell.keys()], connections: connectionCount };
}

function drawInterCellConnections(svg, externalWireLayer, placed, clearance = 14) {
  const epsilon = 0.5;
  const halfSize = drawConfig.imageSize / 2;
  const terminalsByNet = collectInterCellTerminals(placed);
  const componentBoxes = buildInterCellComponentBoxes(placed, halfSize);
  const routedSegments = collectInterCellRoutedSegments(svg, externalWireLayer);
  const routingContext = { epsilon, componentBoxes, routedSegments };
  const netEntries = [...terminalsByNet.entries()].sort(compareInterCellNetEntries);
  const context = { externalWireLayer, routedSegments, routingContext, clearance };
  const report = [];

  for (const [net, terminals] of netEntries) {
    const result = connectInterCellNet(net, terminals, context);
    if (result) report.push(result);
  }

  console.table(report);
  return report;
}