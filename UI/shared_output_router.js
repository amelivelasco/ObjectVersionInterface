function isSharedOutputConflict(terminals) { 
  const outputs = terminals.filter((terminal) => terminal.kind === "out" && terminal.element);

  if (outputs.length < 2) { return false; }

  const distinctInputNets = new Set(outputs.map((terminal) => terminal.element.net_in ?? "__missing__"));
  return distinctInputNets.size > 1;
}

function extractWireSegmentsFromElement(element) {
  const segments = [];

  if (element.tagName?.toLowerCase() === "line") {
    segments.push({
      a: {
        x: Number(element.getAttribute("x1")),
        y: Number(element.getAttribute("y1")),
      },
      b: {
        x: Number(element.getAttribute("x2")),
        y: Number(element.getAttribute("y2")),
      },
    });

    return segments;
  }

  if (element.tagName?.toLowerCase() !== "path") { return segments; }

  const tokens = element.getAttribute("d")?.match(/[MLHV]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) || [];

  let index = 0;
  let command = null;
  let current = null;

  while (index < tokens.length) {
    if (/^[MLHV]$/i.test(tokens[index])) {
      command = tokens[index].toUpperCase();
      index++;
    }

    if (!command) { break; }

    let next = null;

    if (command === "M" || command === "L") {
      next = { x: Number(tokens[index++]), y: Number(tokens[index++]), };
    } else if (command === "H") {
      next = { x: Number(tokens[index++]), y: current.y,
      };
    } else if (command === "V") {
      next = {  x: current.x, y: Number(tokens[index++]),
      };
    }

    if (!next) { break; }

    if (current && command !== "M") {
      segments.push({a: { ...current }, b: { ...next },});
    }

    current = next;
  }

  return segments;
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

  for (
    const element of
    elements
  ) {
    if (
      consumedIds.has(
        element.id
      ) ||
      excludedIds.has(
        element.id
      )
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

function getWireRelation(first, second) {
  const epsilon = 0.5;

  const firstHorizontal = Math.abs(first.a.y - first.b.y) < epsilon;
  const secondHorizontal = Math.abs(second.a.y - second.b.y) < epsilon;

  if (firstHorizontal && secondHorizontal) {
    if (Math.abs(first.a.y - second.a.y) >= epsilon
    ) { return null; }

    const overlap =
      Math.min(Math.max(first.a.x, first.b.x), Math.max(second.a.x, second.b.x)) - Math.max(
        Math.min(first.a.x, first.b.x), Math.min(second.a.x, second.b.x)
      );

    return overlap > epsilon ? "overlap" : null;
  }

  if (!firstHorizontal && !secondHorizontal) {
    if (Math.abs(first.a.x - second.a.x) >= epsilon) {
      return null;
    }

    const overlap =
      Math.min(Math.max(first.a.y, first.b.y), Math.max(second.a.y, second.b.y)) -
      Math.max(Math.min(first.a.y, first.b.y), Math.min(second.a.y, second.b.y));

    return overlap > epsilon ? "overlap" : null;
  }

  const horizontal = firstHorizontal ? first : second;
  const vertical = firstHorizontal ? second : first;

  const crossingX = vertical.a.x;
  const crossingY = horizontal.a.y;

  const crossesHorizontalInterior =
    crossingX > Math.min(horizontal.a.x, horizontal.b.x) + epsilon &&
    crossingX < Math.max(horizontal.a.x, horizontal.b.x) - epsilon;

  const crossesVerticalInterior =
    crossingY > Math.min(vertical.a.y, vertical.b.y) + epsilon &&
    crossingY < Math.max(vertical.a.y, vertical.b.y) - epsilon;

  return (crossesHorizontalInterior && crossesVerticalInterior) ? "cross" : null;
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


function getInductorCenterBarrier(element, verticalPadding = 4,  barrierHalfWidth = 3
) {
  const halfSize = drawConfig.imageSize / 2;

  return {
    left: element.x - barrierHalfWidth,
    right: element.x + barrierHalfWidth,
    top: element.y - halfSize - verticalPadding,
    bottom: element.y + halfSize + verticalPadding,
    ownerId: element.id,
    kind: "inductor-center-barrier",
  };
}


function addParallelChannelMidpoints(routedSegments, xValues, yValues, wireClearance) {
  const epsilon = 0.5;
  const maximumChannelGap = 80;
  const maximumNeighbors = 6;
  const horizontalSegments = [];
  const verticalSegments = [];

  for (const segment of routedSegments) {
    if (!segment?.a || !segment?.b) { continue; }
    const horizontal = Math.abs(segment.a.y - segment.b.y ) < epsilon;
    const vertical = Math.abs(segment.a.x - segment.b.x) < epsilon;

    if (horizontal) {
      horizontalSegments.push({
        y: segment.a.y,
        minX: Math.min(segment.a.x, segment.b.x),
        maxX: Math.max(segment.a.x, segment.b.x),
      });
    } else if (vertical) {
      verticalSegments.push({
        x: segment.a.x,
        minY: Math.min(segment.a.y, segment.b.y),
        maxY: Math.max(segment.a.y, segment.b.y),
      });
    }
  }

  horizontalSegments.sort((first, second) => first.y - second.y);
  verticalSegments.sort((first, second) => first.x - second.x);

  const addedMiddleX = new Set();
  const addedMiddleY = new Set();

  for (let firstIndex = 0; firstIndex < horizontalSegments.length; firstIndex++ ) {
    const first = horizontalSegments[firstIndex];

    const finalNeighborIndex = Math.min(horizontalSegments.length, firstIndex + maximumNeighbors + 1);

    for (let secondIndex = firstIndex + 1; secondIndex < finalNeighborIndex; secondIndex++
    ) {
      const second = horizontalSegments[secondIndex];
      const gap = second.y - first.y;
      if (gap > maximumChannelGap) { break; }

      if (gap < wireClearance * 2) {continue;}
      const overlapStart = Math.max(first.minX, second.minX);
      const overlapEnd = Math.min(first.maxX, second.maxX);
      if (overlapEnd - overlapStart < epsilon
      ) { continue; }

      const middleY = Number(((first.y + second.y  ) / 2).toFixed(3));

      if (!addedMiddleY.has(middleY)
      ) {addedMiddleY.add(middleY);
        yValues.push( middleY);
      }
      xValues.push(overlapStart, overlapEnd);

      break;
    }
  }

  for (let firstIndex = 0; firstIndex < verticalSegments.length; firstIndex++ ) {
    const first = verticalSegments[firstIndex];
    const finalNeighborIndex = Math.min(verticalSegments.length, firstIndex + maximumNeighbors + 1 );

    for (let secondIndex = firstIndex + 1; secondIndex < finalNeighborIndex; secondIndex++) {
      const second = verticalSegments[secondIndex];
      const gap = second.x - first.x;

      if (gap > maximumChannelGap
      ) { break; }

      if (gap < wireClearance * 2) { continue; }

      const overlapStart = Math.max(first.minY, second.minY);
      const overlapEnd = Math.min(first.maxY, second.maxY);

      if (overlapEnd - overlapStart <epsilon
      ) { continue; }

      const middleX = Number(((first.x + second.x) / 2).toFixed(3));

      if (!addedMiddleX.has( middleX)
      ) {addedMiddleX.add(middleX);
        xValues.push(middleX);
      }

      yValues.push(overlapStart, overlapEnd);

      break;
    }
  }
}

function isTerminalNode(node) {

  const hasOnlyJRInternalEdges =
    node.edges.length > 0 &&
    node.edges.every((edge) => edge.kind === "jr-internal");

  if (hasOnlyJRInternalEdges) { return false; }

  return node.edges.length === 1;
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