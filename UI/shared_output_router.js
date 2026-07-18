function isSharedOutputConflict(terminals) {
  const outputs = terminals.filter(
    (terminal) =>
      terminal.kind === "out" &&
      terminal.element
  );

  if (outputs.length < 2) {
    return false;
  }

  const distinctInputNets = new Set(
    outputs.map(
      (terminal) =>
        terminal.element.net_in ?? "__missing__"
    )
  );

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

  if (element.tagName?.toLowerCase() !== "path") {
    return segments;
  }

  const tokens =
    element
      .getAttribute("d")
      ?.match(/[MLHV]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) || [];

  let index = 0;
  let command = null;
  let current = null;

  while (index < tokens.length) {
    if (/^[MLHV]$/i.test(tokens[index])) {
      command = tokens[index].toUpperCase();
      index++;
    }

    if (!command) {
      break;
    }

    let next = null;

    if (command === "M" || command === "L") {
      next = {
        x: Number(tokens[index++]),
        y: Number(tokens[index++]),
      };
    } else if (command === "H") {
      next = {
        x: Number(tokens[index++]),
        y: current.y,
      };
    } else if (command === "V") {
      next = {
        x: current.x,
        y: Number(tokens[index++]),
      };
    }

    if (!next) {
      break;
    }

    if (current && command !== "M") {
      segments.push({
        a: { ...current },
        b: { ...next },
      });
    }

    current = next;
  }

  return segments;
}

function buildRoutingObstacleBoxes(
  elements,
  excludedIds = new Set(),
  padding = 10
) {
  const boxes = [];
  const consumedIds = new Set();
  const halfSize = drawConfig.imageSize / 2;

  for (const current of elements) {
    if (
      consumedIds.has(current.id) ||
      getElementType(current) !== "JJ"
    ) {
      continue;
    }

    const resistor = elements.find(
      (candidate) =>
        !consumedIds.has(candidate.id) &&
        isJJResistorPair(current, candidate)
    );

    if (!resistor) {
      continue;
    }

    consumedIds.add(current.id);
    consumedIds.add(resistor.id);

    const ownerIds = new Set([
      current.id,
      resistor.id,
    ]);

    if (
      [...ownerIds].some(
        (id) => excludedIds.has(id)
      )
    ) {
      continue;
    }

    const geometry = getJJPairGeometry(
      current,
      resistor,
      25
    );

    boxes.push({
      left:
        Math.min(current.x, resistor.x) -
        halfSize -
        padding,
      right:
        Math.max(current.x, resistor.x) +
        halfSize +
        padding,
      top:
        geometry.topMiddle.y - padding,
      bottom:
        geometry.bottomMiddle.y + padding,
      ownerIds,
    });
  }

  for (const element of elements) {
    if (
      consumedIds.has(element.id) ||
      excludedIds.has(element.id)
    ) {
      continue;
    }

    boxes.push({
      left:
        element.x -
        halfSize -
        padding,
      right:
        element.x +
        halfSize +
        padding,
      top:
        element.y -
        halfSize -
        padding,
      bottom:
        element.y +
        halfSize +
        padding,
      ownerIds: new Set([
        element.id,
      ]),
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

function axisAlignedSegmentHitsBox(
  first,
  second,
  box
) {
  const epsilon = 0.5;

  if (
    Math.abs(first.y - second.y) < epsilon
  ) {
    const minimumX = Math.min(first.x, second.x);
    const maximumX = Math.max(first.x, second.x);

    return (
      first.y > box.top + epsilon &&
      first.y < box.bottom - epsilon &&
      maximumX > box.left + epsilon &&
      minimumX < box.right - epsilon
    );
  }

  if (
    Math.abs(first.x - second.x) < epsilon
  ) {
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

  const firstHorizontal =
    Math.abs(first.a.y - first.b.y) < epsilon;
  const secondHorizontal =
    Math.abs(second.a.y - second.b.y) < epsilon;

  if (firstHorizontal && secondHorizontal) {
    if (
      Math.abs(first.a.y - second.a.y) >= epsilon
    ) {
      return null;
    }

    const overlap =
      Math.min(
        Math.max(first.a.x, first.b.x),
        Math.max(second.a.x, second.b.x)
      ) -
      Math.max(
        Math.min(first.a.x, first.b.x),
        Math.min(second.a.x, second.b.x)
      );

    return overlap > epsilon
      ? "overlap"
      : null;
  }

  if (!firstHorizontal && !secondHorizontal) {
    if (
      Math.abs(first.a.x - second.a.x) >= epsilon
    ) {
      return null;
    }

    const overlap =
      Math.min(
        Math.max(first.a.y, first.b.y),
        Math.max(second.a.y, second.b.y)
      ) -
      Math.max(
        Math.min(first.a.y, first.b.y),
        Math.min(second.a.y, second.b.y)
      );

    return overlap > epsilon
      ? "overlap"
      : null;
  }

  const horizontal = firstHorizontal
    ? first
    : second;
  const vertical = firstHorizontal
    ? second
    : first;

  const crossingX = vertical.a.x;
  const crossingY = horizontal.a.y;

  const crossesHorizontalInterior =
    crossingX >
      Math.min(horizontal.a.x, horizontal.b.x) +
        epsilon &&
    crossingX <
      Math.max(horizontal.a.x, horizontal.b.x) -
        epsilon;

  const crossesVerticalInterior =
    crossingY >
      Math.min(vertical.a.y, vertical.b.y) +
        epsilon &&
    crossingY <
      Math.max(vertical.a.y, vertical.b.y) -
        epsilon;

  return (
    crossesHorizontalInterior &&
    crossesVerticalInterior
  )
    ? "cross"
    : null;
}

function getWirePenalty(
  first,
  second,
  routedSegments
) {
  const candidate = {
    a: first,
    b: second,
  };

  let penalty = 0;

  for (const existing of routedSegments) {
    const relation = getWireRelation(
      candidate,
      existing
    );

    if (relation === "overlap") {
      penalty += 1000000000000;
    } else if (relation === "cross") {
      penalty += 1000000000;
    }
  }

  return penalty;
}

function uniqueSortedNumbers(values) {
  return [...new Set(
    values.map(
      (value) => Number(value.toFixed(3))
    )
  )].sort(
    (first, second) => first - second
  );
}

class RoutingMinHeap {
  constructor() {
    this.items = [];
  }

  push(item) {
    this.items.push(item);
    this.bubbleUp(this.items.length - 1);
  }

  pop() {
    if (this.items.length === 0) {
      return null;
    }

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

      if (
        this.items[parent].priority <=
        this.items[index].priority
      ) {
        break;
      }

      [
        this.items[parent],
        this.items[index],
      ] = [
        this.items[index],
        this.items[parent],
      ];

      index = parent;
    }
  }

  bubbleDown(index) {
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      let smallest = index;

      if (
        left < this.items.length &&
        this.items[left].priority <
          this.items[smallest].priority
      ) {
        smallest = left;
      }

      if (
        right < this.items.length &&
        this.items[right].priority <
          this.items[smallest].priority
      ) {
        smallest = right;
      }

      if (smallest === index) {
        break;
      }

      [
        this.items[index],
        this.items[smallest],
      ] = [
        this.items[smallest],
        this.items[index],
      ];

      index = smallest;
    }
  }
}

function simplifyOrthogonalPoints(points) {
  const cleaned = [];

  for (const point of points) {
    const previous = cleaned[cleaned.length - 1];

    if (
      previous &&
      Math.abs(previous.x - point.x) < 0.5 &&
      Math.abs(previous.y - point.y) < 0.5
    ) {
      continue;
    }

    cleaned.push({ ...point });
  }

  let index = 1;

  while (index < cleaned.length - 1) {
    const previous = cleaned[index - 1];
    const current = cleaned[index];
    const next = cleaned[index + 1];

    const sameX =
      Math.abs(previous.x - current.x) < 0.5 &&
      Math.abs(current.x - next.x) < 0.5;

    const sameY =
      Math.abs(previous.y - current.y) < 0.5 &&
      Math.abs(current.y - next.y) < 0.5;

    if (sameX || sameY) {
      cleaned.splice(index, 1);
    } else {
      index++;
    }
  }

  return cleaned;
}

function routePointsToPathData(points) {
  const cleaned = simplifyOrthogonalPoints(points);

  if (cleaned.length === 0) {
    return "";
  }

  const commands = [
    `M ${cleaned[0].x} ${cleaned[0].y}`,
  ];

  for (
    let index = 1;
    index < cleaned.length;
    index++
  ) {
    const previous = cleaned[index - 1];
    const current = cleaned[index];

    if (
      Math.abs(previous.y - current.y) < 0.5
    ) {
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

  for (
    let index = 0;
    index < cleaned.length - 1;
    index++
  ) {
    segments.push({
      a: cleaned[index],
      b: cleaned[index + 1],
    });
  }

  return segments;
}

function findShortestOrthogonalRoute(
  start,
  end,
  obstacleBoxes,
  routedSegments
) {
  const wireClearance = 10;
  const bendPenalty = 14;

  const xValues = [start.x, end.x];
  const yValues = [start.y, end.y];

  for (const box of obstacleBoxes) {
    xValues.push(box.left, box.right);
    yValues.push(box.top, box.bottom);
  }

  for (const segment of routedSegments) {
    const horizontal =
      Math.abs(segment.a.y - segment.b.y) < 0.5;

    if (horizontal) {
      yValues.push(
        segment.a.y - wireClearance,
        segment.a.y + wireClearance
      );
    } else {
      xValues.push(
        segment.a.x - wireClearance,
        segment.a.x + wireClearance
      );
    }
  }

  const xs = uniqueSortedNumbers(xValues);
  const ys = uniqueSortedNumbers(yValues);

  const startX = xs.indexOf(Number(start.x.toFixed(3)));
  const startY = ys.indexOf(Number(start.y.toFixed(3)));
  const endX = xs.indexOf(Number(end.x.toFixed(3)));
  const endY = ys.indexOf(Number(end.y.toFixed(3)));

  function pointAt(xIndex, yIndex) {
    return {
      x: xs[xIndex],
      y: ys[yIndex],
    };
  }

  function pointAllowed(point) {
    return !obstacleBoxes.some(
      (box) => pointInsideBox(point, box)
    );
  }

  function segmentAllowed(first, second) {
    return !obstacleBoxes.some(
      (box) =>
        axisAlignedSegmentHitsBox(
          first,
          second,
          box
        )
    );
  }

  function stateKey(xIndex, yIndex, direction) {
    return `${xIndex},${yIndex},${direction}`;
  }

  const queue = new RoutingMinHeap();
  const distances = new Map();
  const previous = new Map();

  const startKey = stateKey(
    startX,
    startY,
    "N"
  );

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

    if (!currentState) {
      break;
    }

    const currentKey = stateKey(
      currentState.xIndex,
      currentState.yIndex,
      currentState.direction
    );

    const currentDistance =
      distances.get(currentKey);

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

    const currentPoint = pointAt(
      currentState.xIndex,
      currentState.yIndex
    );

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

      const wireCost = getWirePenalty(
        currentPoint,
        nextPoint,
        routedSegments
      );

      const nextDistance =
        currentDistance +
        length +
        bendCost +
        wireCost;

      const nextKey = stateKey(
        nextX,
        nextY,
        nextDirection
      );

      if (
        nextDistance >=
        (distances.get(nextKey) ?? Infinity)
      ) {
        continue;
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
        priority:
          nextDistance + heuristic,
      });
    }
  }

  if (!goalKey) {
    return simplifyOrthogonalPoints([
      start,
      {
        x: end.x,
        y: start.y,
      },
      end,
    ]);
  }

  const reversed = [];
  let currentKey = goalKey;

  while (currentKey) {
    const [xIndex, yIndex] =
      currentKey
        .split(",")
        .slice(0, 2)
        .map(Number);

    reversed.push(
      pointAt(xIndex, yIndex)
    );

    currentKey = previous.get(currentKey);
  }

  return simplifyOrthogonalPoints(
    reversed.reverse()
  );
}

function getInductorApproachPoint(
  terminal,
  point,
  clearance = 18
) {
  const element = terminal.element;

  if (
    !element ||
    getElementType(element) !== "L"
  ) {
    return { ...point };
  }

  const sideDirection =
    point.x < element.x
      ? -1
      : 1;

  return {
    x:
      point.x +
      sideDirection * clearance,
    y: point.y,
  };
}

function buildShortestFreeRoute(
  fromPoint,
  toPoint,
  fromTerminal,
  toTerminal,
  cellElements,
  routedSegments
) {
  const fromApproach =
    getInductorApproachPoint(
      fromTerminal,
      fromPoint
    );

  const toApproach =
    getInductorApproachPoint(
      toTerminal,
      toPoint
    );

  const excludedIds = new Set(
    [
      fromTerminal.element?.id,
      toTerminal.element?.id,
    ].filter(Boolean)
  );

  const obstacleBoxes =
    buildRoutingObstacleBoxes(
      cellElements,
      excludedIds,
      10
    );

  const coreRoute =
    findShortestOrthogonalRoute(
      fromApproach,
      toApproach,
      obstacleBoxes,
      routedSegments
    );

  return simplifyOrthogonalPoints([
    fromPoint,
    fromApproach,
    ...coreRoute,
    toApproach,
    toPoint,
  ]);
}

function getLongestHorizontalSegment(points) {
  return routePointsToSegments(points)
    .filter(
      (segment) =>
        Math.abs(
          segment.a.y - segment.b.y
        ) < 0.5
    )
    .sort(
      (first, second) =>
        Math.abs(second.b.x - second.a.x) -
        Math.abs(first.b.x - first.a.x)
    )[0] || null;
}

function drawSharedOutputNet(
  wireLayer,
  labelLayer,
  net,
  terminals,
  cellElements,
  routedSegments
) {
  const outputs = terminals
    .filter(
      (terminal) =>
        terminal.kind === "out"
    )
    .sort(
      (first, second) =>
        (first.element?.layoutOrder ?? Infinity) -
        (second.element?.layoutOrder ?? Infinity)
    );

  const root = outputs[0] || terminals[0];
  const connected = [root];
  const remaining = terminals.filter(
    (terminal) => terminal !== root
  );

  let labelWasDrawn = false;

  while (remaining.length > 0) {
    let bestConnection = null;

    for (const connectedTerminal of connected) {
      for (
        let index = 0;
        index < remaining.length;
        index++
      ) {
        const candidate = remaining[index];

        if (
          candidate.ownerId ===
          connectedTerminal.ownerId
        ) {
          continue;
        }

        const pointConnection =
          findBestTerminalConnection(
            connectedTerminal,
            candidate
          );

        if (!pointConnection) {
          continue;
        }

        const sameKindPenalty =
          connectedTerminal.kind === candidate.kind
            ? 1000000
            : 0;

        const score =
          pointConnection.distance +
          sameKindPenalty;

        if (
          !bestConnection ||
          score < bestConnection.score
        ) {
          bestConnection = {
            from: connectedTerminal,
            to: candidate,
            fromPoint:
              pointConnection.firstPoint,
            toPoint:
              pointConnection.secondPoint,
            remainingIndex: index,
            score,
          };
        }
      }
    }

    if (!bestConnection) {
      break;
    }

    const routePoints =
      buildShortestFreeRoute(
        bestConnection.fromPoint,
        bestConnection.toPoint,
        bestConnection.from,
        bestConnection.to,
        cellElements,
        routedSegments
      );

    drawPath(
      wireLayer,
      bestConnection.fromPoint,
      bestConnection.toPoint,
      {
        stroke:
          drawConfig.wireStroke,
        pathData:
          routePointsToPathData(
            routePoints
          ),
      }
    );

    const newSegments =
      routePointsToSegments(
        routePoints
      );

    routedSegments.push(
      ...newSegments.map(
        (segment) => ({
          ...segment,
          net,
        })
      )
    );

    if (!labelWasDrawn) {
      const labelSegment =
        getLongestHorizontalSegment(
          routePoints
        );

      if (labelSegment) {
        drawLabel(
          labelLayer,
          net,
          (
            labelSegment.a.x +
            labelSegment.b.x
          ) / 2,
          labelSegment.a.y,
          {
            size: "8.5px",
            fill: "#334155",
          }
        );

        labelWasDrawn = true;
      }
    }

    connected.push(bestConnection.to);
    remaining.splice(
      bestConnection.remainingIndex,
      1
    );
  }
}
function getTerminalSpan(terminals) {
  const points = terminals.flatMap(
    (terminal) =>
      getTerminalPoints(terminal)
  );

  if (points.length === 0) {
    return 0;
  }

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);

  return (
    Math.max(...xs) - Math.min(...xs) +
    Math.max(...ys) - Math.min(...ys)
  );
}

function drawConnectionsInsideLayoutCells(
  wireLayer,
  labelLayer,
  placed
) {
  const elementsByCell = new Map();

  for (const element of placed) {
    const layoutInstance =
      getLayoutInstance(element);

    if (!elementsByCell.has(layoutInstance)) {
      elementsByCell.set(
        layoutInstance,
        []
      );
    }

    elementsByCell
      .get(layoutInstance)
      .push(element);
  }

  for (const [
    layoutInstance,
    cellElements,
  ] of elementsByCell) {
    const terminalsByNet =
      collectNetTerminals(cellElements);

    const entries = [
      ...terminalsByNet.entries(),
    ].filter(
      ([, terminals]) =>
        terminals.length >= 2
    );

    const ordinaryEntries = entries
      .filter(
        ([, terminals]) =>
          !isSharedOutputConflict(
            terminals
          )
      )
      .sort(
        (
          [, firstTerminals],
          [, secondTerminals]
        ) =>
          getTerminalSpan(firstTerminals) -
          getTerminalSpan(secondTerminals)
      );

    const sharedOutputEntries = entries
      .filter(
        ([, terminals]) =>
          isSharedOutputConflict(
            terminals
          )
      )
      .sort(
        (
          [, firstTerminals],
          [, secondTerminals]
        ) =>
          getTerminalSpan(firstTerminals) -
          getTerminalSpan(secondTerminals)
      );

    const routedSegments = [];

    /*
     * Draw ordinary nets first. Their SVG paths
     * become obstacles for the special reroutes.
     */
    for (const [net, terminals] of ordinaryEntries) {
      const firstNewChild =
        wireLayer.children.length;

      drawTerminalTree(
        wireLayer,
        labelLayer,
        net,
        terminals,
        {
          drawLabel: true,
        }
      );

      const newChildren = Array.from(
        wireLayer.children
      ).slice(firstNewChild);

      for (const child of newChildren) {
        routedSegments.push(
          ...extractWireSegmentsFromElement(
            child
          ).map(
            (segment) => ({
              ...segment,
              net,
            })
          )
        );
      }
    }

    /*
     * Nets with two or more outputs and different
     * input nets are routed last through the shortest
     * free orthogonal path.
     */
    for (const [
      net,
      terminals,
    ] of sharedOutputEntries) {
      drawSharedOutputNet(
        wireLayer,
        labelLayer,
        net,
        terminals,
        cellElements,
        routedSegments
      );
    }

    console.log(
      `Finished internal connections for ${layoutInstance}`,
      {
        ordinaryNets:
          ordinaryEntries.length,
        reroutedSharedOutputs:
          sharedOutputEntries.length,
      }
    );
  }
}