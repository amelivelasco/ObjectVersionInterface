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
    console.warn(
        `No legal route found for ${currentNet}`,
        {
        start,
        end,
        }
    );

    return null;
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
    if (
        !Array.isArray(coreRoute) ||
        coreRoute.length < 2
        ) {
        return null;
        }

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
        routedSegments,
        net
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

    for (const element of cellElements) {
        if (
            getElementType(element) !== "L"
        ) {
            continue;
        }

        if (
        element.inputNeedsLead &&
        element.net_in &&
        element.inputPin &&
        element.inputLeadPoint
        ) {
            routedSegments.push({
            a: element.inputPin,
            b: element.inputLeadPoint,
            net: element.net_in,
            protectedInductorLead: true,
            });
        }

        if (
        element.outputNeedsLead &&
        element.net_out &&
        element.outputPin &&
        element.outputLeadPoint
        ) {
            routedSegments.push({
            a: element.outputPin,
            b: element.outputLeadPoint,
            net: element.net_out,
            protectedInductorLead: true,
            });
        }
    }
    for (const [net, terminals] of ordinaryEntries) {
      const firstNewChild =
        wireLayer.children.length;

      const routedSegmentCount =
        routedSegments.length;

      drawTerminalTree(
        wireLayer,
        labelLayer,
        net,
        terminals,
        {
          drawLabel: true,
          cellElements,
          routedSegments,
        }
      );
      if (
        routedSegments.length ===
        routedSegmentCount
      ) {
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
    }

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