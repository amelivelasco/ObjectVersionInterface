function findShortestOrthogonalRoute(
  start,
  end,
  obstacleBoxes,
  routedSegments,
  net = null
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

  function segmentAllowed(
    first,
    second
  ) {
    const hitsComponent =
      obstacleBoxes.some(
        (box) =>
          axisAlignedSegmentHitsBox(
            first,
            second,
            box
          )
      );

    if (hitsComponent) {
      return false;
    }

    const candidate = {
      a: first,
      b: second,
    };

    /*
    * Different nets may not overlap, cross,
    * or pass within 8px of one another.
    */
    const hitsAnotherNet =
      routedSegments.some(
        (existing) => {
          /*
          * The same electrical net may merge
          * with itself.
          */
          if (
            existing.net &&
            existing.net === net
          ) {
            return false;
          }

          return segmentsWithinClearance(
            candidate,
            existing,
            8
          );
        }
      );

    return !hitsAnotherNet;
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
        `No legal route found for ${net}`,
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
  routedSegments,
  net
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
      routedSegments,
      net
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


  function separateRouteFromJR(
    points,
    net,
    jrRails = [],
    jrMargin = 12
  ) {
    if (
      !Array.isArray(points) ||
      points.length < 2 ||
      jrRails.length === 0
    ) {
      return points;
    }

    const epsilon = 0.5;
    const adjusted = [];

    function pushPoint(point) {
      const previous =
        adjusted[
          adjusted.length - 1
        ];

      if (
        previous &&
        Math.abs(
          previous.x - point.x
        ) < epsilon &&
        Math.abs(
          previous.y - point.y
        ) < epsilon
      ) {
        return;
      }

      adjusted.push({
        x: point.x,
        y: point.y,
      });
    }

    pushPoint(points[0]);

    for (
      let index = 1;
      index < points.length;
      index++
    ) {
      const first =
        points[index - 1];

      const second =
        points[index];

      const horizontal =
        Math.abs(
          first.y - second.y
        ) < epsilon;

      if (!horizontal) {
        pushPoint(second);
        continue;
      }

      const segmentMinX =
        Math.min(
          first.x,
          second.x
        );

      const segmentMaxX =
        Math.max(
          first.x,
          second.x
        );

      /*
       * Find one different-net JR rail that overlaps
       * this horizontal segment and is too close.
       */
      const conflictingRail =
        jrRails.find(
          (rail) => {
            if (
              net &&
              rail.net === net
            ) {
              return false;
            }

            const overlap =
              Math.min(
                segmentMaxX,
                rail.maxX
              ) -
              Math.max(
                segmentMinX,
                rail.minX
              );

            if (
              overlap <= epsilon
            ) {
              return false;
            }

            return (
              Math.abs(
                first.y -
                rail.y
              ) < jrMargin
            );
          }
        );

      if (!conflictingRail) {
        pushPoint(second);
        continue;
      }

      /*
       * Move away from the JR subcircuit.
       *
       * Top rails move upward.
       * Bottom rails move downward.
       *
       * When already slightly above or below the
       * rail, continue moving in that direction.
       */
      let verticalDirection;

      if (
        first.y <
        conflictingRail.y -
          epsilon
      ) {
        verticalDirection = -1;
      } else if (
        first.y >
        conflictingRail.y +
          epsilon
      ) {
        verticalDirection = 1;
      } else {
        verticalDirection =
          conflictingRail.side ===
          "top"
            ? -1
            : 1;
      }

      const detourY =
        conflictingRail.y +
        verticalDirection *
          jrMargin;

      /*
       * Limit the detour to the portion that passes
       * beside the JR rail.
       */
      const detourMinX =
        Math.max(
          segmentMinX,
          conflictingRail.minX -
            jrMargin
        );

      const detourMaxX =
        Math.min(
          segmentMaxX,
          conflictingRail.maxX +
            jrMargin
        );

      const movingRight =
        second.x >= first.x;

      const entryX =
        movingRight
          ? detourMinX
          : detourMaxX;

      const exitX =
        movingRight
          ? detourMaxX
          : detourMinX;

      pushPoint({
        x: entryX,
        y: first.y,
      });

      pushPoint({
        x: entryX,
        y: detourY,
      });

      pushPoint({
        x: exitX,
        y: detourY,
      });

      pushPoint({
        x: exitX,
        y: first.y,
      });

      pushPoint(second);
    }

    return simplifyOrthogonalPoints(
      adjusted
    );
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
  
  const outputs = terminals
    .filter(
      (terminal) =>
        terminal.kind === "out"
    )
    .sort(
      (first, second) =>
        (
          first.element
            ?.layoutOrder ??
          Infinity
        ) -
        (
          second.element
            ?.layoutOrder ??
          Infinity
        )
    );

  const root =
    outputs[0] ||
    terminals[0];

  const connected = [
    root,
  ];

  const remaining =
    terminals.filter(
      (terminal) =>
        terminal !== root
    );

  let labelWasDrawn =
    false;

  while (
    remaining.length > 0
  ) {
    let bestConnection =
      null;

    for (
      const connectedTerminal
      of connected
    ) {
      for (
        let index = 0;
        index <
          remaining.length;
        index++
      ) {
        const candidate =
          remaining[index];

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
          connectedTerminal.kind ===
          candidate.kind
            ? 1000000
            : 0;

        const score =
          pointConnection.distance +
          sameKindPenalty;

        if (
          !bestConnection ||
          score <
            bestConnection.score
        ) {
          bestConnection = {
            from:
              connectedTerminal,

            to:
              candidate,

            fromPoint:
              pointConnection
                .firstPoint,

            toPoint:
              pointConnection
                .secondPoint,

            remainingIndex:
              index,

            score,
          };
        }
      }
    }

    if (!bestConnection) {
      break;
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

    if (
      !Array.isArray(
        routePoints
      ) ||
      routePoints.length < 2
    ) {
      console.warn(
        `Skipping unroutable shared connection for ${net}`,
        {
          from:
            bestConnection
              .fromPoint,

          to:
            bestConnection
              .toPoint,

          fromOwner:
            bestConnection
              .from.ownerId,

          toOwner:
            bestConnection
              .to.ownerId,
        }
      );

      remaining.splice(
        bestConnection
          .remainingIndex,
        1
      );

      continue;
    }

    /*
     * Apply JR parallel-wire separation only after
     * the router found a valid connection.
     */
    routePoints =
      separateRouteFromJR(
        routePoints,
        net,
        jrRails,
        jrMargin
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

        net,

        kind:
          "shared-net-route",
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
            size:
              "8.5px",

            fill:
              "#334155",
          }
        );

        labelWasDrawn =
          true;
      }
    }

    connected.push(
      bestConnection.to
    );

    remaining.splice(
      bestConnection
        .remainingIndex,
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
  const elementsByCell =
    new Map();

  for (const element of placed) {
    const layoutInstance =
      getLayoutInstance(
        element
      );

    if (
      !elementsByCell.has(
        layoutInstance
      )
    ) {
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
      collectNetTerminals(
        cellElements
      );

    const entries = [
      ...terminalsByNet.entries(),
    ].filter(
      ([, terminals]) =>
        terminals.length >= 2
    );

    const ordinaryEntries =
      entries
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
            getTerminalSpan(
              firstTerminals
            ) -
            getTerminalSpan(
              secondTerminals
            )
        );

    const sharedOutputEntries =
      entries
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
            getTerminalSpan(
              firstTerminals
            ) -
            getTerminalSpan(
              secondTerminals
            )
        );

    const routedSegments =
      [];

    /*
     * Horizontal JR wires that shared-output routes
     * should remain separated from.
     *
     * These are only guides for the final visual
     * adjustment. They are not added as router
     * obstacles, so they cannot disconnect anything.
     */
    const jrRails = [];

    const jrMargin = 12;

    for (
      let index = 0;
      index <
        cellElements.length - 1;
      index++
    ) {
      const current =
        cellElements[index];

      const next =
        cellElements[index + 1];

      if (
        !isJJResistorPair(
          current,
          next
        )
      ) {
        continue;
      }

      const geometry =
        getJJPairGeometry(
          current,
          next,
          25
        );

      jrRails.push(
        {
          minX:
            Math.min(
              geometry.topAtJJ.x,
              geometry
                .topAtResistor.x
            ),

          maxX:
            Math.max(
              geometry.topAtJJ.x,
              geometry
                .topAtResistor.x
            ),

          y:
            geometry.topAtJJ.y,

          net:
            current.net_in,

          side:
            "top",
        },

        {
          minX:
            Math.min(
              geometry.bottomAtJJ.x,
              geometry
                .bottomAtResistor.x
            ),

          maxX:
            Math.max(
              geometry.bottomAtJJ.x,
              geometry
                .bottomAtResistor.x
            ),

          y:
            geometry.bottomAtJJ.y,

          net:
            current.net_out,

          side:
            "bottom",
        }
      );

      /*
       * Skip the resistor member.
       */
      index++;
    }

    /*
     * Register terminal leads normally.
     */
    for (
      const element
      of cellElements
    ) {
      if (
        getElementType(element) !==
        "L"
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
          a:
            element.inputPin,

          b:
            element
              .inputLeadPoint,

          net:
            element.net_in,

          protectedInductorLead:
            true,
        });
      }

      if (
        element.outputNeedsLead &&
        element.net_out &&
        element.outputPin &&
        element.outputLeadPoint
      ) {
        routedSegments.push({
          a:
            element.outputPin,

          b:
            element
              .outputLeadPoint,

          net:
            element.net_out,

          protectedInductorLead:
            true,
        });
      }
    }

    for (
      const [
        net,
        terminals,
      ] of ordinaryEntries
    ) {
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
          jrRails,
          jrMargin,
        }
      );

      if (
        routedSegments.length ===
        routedSegmentCount
      ) {
        const newChildren =
          Array.from(
            wireLayer.children
          ).slice(
            firstNewChild
          );

        for (
          const child
          of newChildren
        ) {
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
        routedSegments,
        jrRails,
        jrMargin
      );
    }

    console.log(
      `Finished internal connections for ${layoutInstance}`,
      {
        ordinaryNets:
          ordinaryEntries.length,

        reroutedSharedOutputs:
          sharedOutputEntries.length,

        jrRails:
          jrRails.length,
      }
    );
  }
}


function segmentsWithinClearance(
  first,
  second,
  clearance = 8
) {
  const firstBox = {
    left:
      Math.min(
        first.a.x,
        first.b.x
      ) - clearance,

    right:
      Math.max(
        first.a.x,
        first.b.x
      ) + clearance,

    top:
      Math.min(
        first.a.y,
        first.b.y
      ) - clearance,

    bottom:
      Math.max(
        first.a.y,
        first.b.y
      ) + clearance,
  };

  const secondBox = {
    left:
      Math.min(
        second.a.x,
        second.b.x
      ),

    right:
      Math.max(
        second.a.x,
        second.b.x
      ),

    top:
      Math.min(
        second.a.y,
        second.b.y
      ),

    bottom:
      Math.max(
        second.a.y,
        second.b.y
      ),
  };

  return !(
    firstBox.right <
      secondBox.left ||

    firstBox.left >
      secondBox.right ||

    firstBox.bottom <
      secondBox.top ||

    firstBox.top >
      secondBox.bottom
  );
}