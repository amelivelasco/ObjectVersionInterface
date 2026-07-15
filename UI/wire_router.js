function createLayoutCellWireRouter(
  cell,
  options = {}
) {
  const reservedSegments = [];

  const laneStep =
    options.laneStep ??
    drawConfig.wireLaneStep ??
    12;

  const clearance =
    options.clearance ??
    drawConfig.wireClearance ??
    5;

  const bounds = {
    left:
      cell.x +
      (
        drawConfig
          .wireRouteLeftInset ?? 10
      ),

    right:
      cell.x +
      cell.width -
      (
        drawConfig
          .wireRouteRightInset ?? 10
      ),

    top:
      cell.y +
      (
        drawConfig
          .wireRouteTopInset ?? 58
      ),

    bottom:
      cell.y +
      cell.height -
      (
        drawConfig
          .wireRouteBottomInset ?? 10
      ),
  };


  const componentClearance =
  options.componentClearance ?? 8;

    const componentObstacles =
    cell.elements
        .filter(
        (element) =>
            Number.isFinite(element.x) &&
            Number.isFinite(element.y)
        )
        .map((element) => {
        const halfSize =
            drawConfig.imageSize / 2;

        return {
            id:
            element.id ||
            element.raw,

            left:
            element.x -
            halfSize -
            componentClearance,

            right:
            element.x +
            halfSize +
            componentClearance,

            top:
            element.y -
            halfSize -
            componentClearance,

            bottom:
            element.y +
            halfSize +
            componentClearance,
        };
        });

  const epsilon = 0.001;


  function segmentIntersectsRectangle(
  segment,
  rectangle
) {
  if (
    segment.orientation === "H"
  ) {
    return (
      segment.y >= rectangle.top &&
      segment.y <= rectangle.bottom &&
      segment.x2 >= rectangle.left &&
      segment.x1 <= rectangle.right
    );
  }

  return (
    segment.x >= rectangle.left &&
    segment.x <= rectangle.right &&
    segment.y2 >= rectangle.top &&
    segment.y1 <= rectangle.bottom
  );
}

function routeHitsComponent(
  segments,
  ignoredElementIds
) {
  for (const obstacle of componentObstacles) {
    /*
     * The route must be allowed to touch
     * the source and destination components.
     */
    if (
      ignoredElementIds.has(
        obstacle.id
      )
    ) {
      continue;
    }

    for (const segment of segments) {
      if (
        segmentIntersectsRectangle(
          segment,
          obstacle
        )
      ) {
        return true;
      }
    }
  }

  return false;
}

  function sameNet(
    segment1,
    segment2
  ) {
    return (
      segment1.net != null &&
      segment1.net === segment2.net
    );
  }

  function normalizeRange(
    value1,
    value2
  ) {
    return {
      min: Math.min(value1, value2),
      max: Math.max(value1, value2),
    };
  }

  function rangesOverlap(
    firstMin,
    firstMax,
    secondMin,
    secondMax,
    padding = 0
  ) {
    return (
      firstMin <=
        secondMax + padding &&
      secondMin <=
        firstMax + padding
    );
  }

  function cleanPoints(points) {
    const withoutDuplicates = [];

    for (const point of points) {
      const previous =
        withoutDuplicates[
          withoutDuplicates.length - 1
        ];

      if (
        previous &&
        Math.abs(previous.x - point.x) <
          epsilon &&
        Math.abs(previous.y - point.y) <
          epsilon
      ) {
        continue;
      }

      withoutDuplicates.push({
        x: point.x,
        y: point.y,
      });
    }

    const cleaned = [];

    for (
      let index = 0;
      index < withoutDuplicates.length;
      index++
    ) {
      const previous =
        cleaned[
          cleaned.length - 1
        ];

      const current =
        withoutDuplicates[index];

      const next =
        withoutDuplicates[index + 1];

      if (
        previous &&
        next
      ) {
        const sameVerticalLine =
          Math.abs(
            previous.x - current.x
          ) < epsilon &&
          Math.abs(
            current.x - next.x
          ) < epsilon;

        const sameHorizontalLine =
          Math.abs(
            previous.y - current.y
          ) < epsilon &&
          Math.abs(
            current.y - next.y
          ) < epsilon;

        if (
          sameVerticalLine ||
          sameHorizontalLine
        ) {
          continue;
        }
      }

      cleaned.push(current);
    }

    return cleaned;
  }

  function createSegments(
    points,
    net
  ) {
    const segments = [];

    for (
      let index = 0;
      index < points.length - 1;
      index++
    ) {
      const first = points[index];
      const second = points[index + 1];

      if (
        Math.abs(first.x - second.x) <
        epsilon
      ) {
        const range =
          normalizeRange(
            first.y,
            second.y
          );

        if (
          range.max - range.min <
          epsilon
        ) {
          continue;
        }

        segments.push({
          orientation: "V",
          x: first.x,
          y1: range.min,
          y2: range.max,
          net,
        });

        continue;
      }

      if (
        Math.abs(first.y - second.y) <
        epsilon
      ) {
        const range =
          normalizeRange(
            first.x,
            second.x
          );

        if (
          range.max - range.min <
          epsilon
        ) {
          continue;
        }

        segments.push({
          orientation: "H",
          y: first.y,
          x1: range.min,
          x2: range.max,
          net,
        });

        continue;
      }

      throw new Error(
        "Wire router received a diagonal segment."
      );
    }

    return segments;
  }

  function segmentConflicts(
    candidate,
    existing
  ) {
    /*
     * Wires carrying the same net are
     * allowed to touch, cross, or overlap.
     */
    if (
      sameNet(
        candidate,
        existing
      )
    ) {
      return false;
    }

    /*
     * Two horizontal segments.
     */
    if (
      candidate.orientation === "H" &&
      existing.orientation === "H"
    ) {
      return (
        Math.abs(
          candidate.y - existing.y
        ) < clearance &&
        rangesOverlap(
          candidate.x1,
          candidate.x2,
          existing.x1,
          existing.x2,
          clearance
        )
      );
    }

    /*
     * Two vertical segments.
     */
    if (
      candidate.orientation === "V" &&
      existing.orientation === "V"
    ) {
      return (
        Math.abs(
          candidate.x - existing.x
        ) < clearance &&
        rangesOverlap(
          candidate.y1,
          candidate.y2,
          existing.y1,
          existing.y2,
          clearance
        )
      );
    }

    /*
     * One horizontal and one vertical.
     */
    const horizontal =
      candidate.orientation === "H"
        ? candidate
        : existing;

    const vertical =
      candidate.orientation === "V"
        ? candidate
        : existing;

    return (
      vertical.x >=
        horizontal.x1 - clearance &&
      vertical.x <=
        horizontal.x2 + clearance &&
      horizontal.y >=
        vertical.y1 - clearance &&
      horizontal.y <=
        vertical.y2 + clearance
    );
  }

  function routeConflicts(
    candidateSegments
  ) {
    for (
      const candidate of
      candidateSegments
    ) {
      for (
        const existing of
        reservedSegments
      ) {
        if (
          segmentConflicts(
            candidate,
            existing
          )
        ) {
          return true;
        }
      }
    }

    return false;
  }

  function pointsInsideCell(points) {
    return points.every(
      (point) =>
        point.x >= cell.x &&
        point.x <=
          cell.x + cell.width &&
        point.y >= cell.y &&
        point.y <=
          cell.y + cell.height
    );
  }

  function reserveSegments(
    segments
  ) {
    reservedSegments.push(
      ...segments
    );
  }

  function reservePolyline(
    points,
    net
  ) {
    const cleaned =
      cleanPoints(points);

    const segments =
      createSegments(
        cleaned,
        net
      );

    reserveSegments(
      segments
    );
  }

  function createLaneValues(
    preferred,
    minimum,
    maximum,
    initialValues = []
  ) {
    const values = [
      preferred,
      ...initialValues,
    ];

    const fullDistance =
      maximum - minimum;

    for (
      let offset = laneStep;
      offset <= fullDistance;
      offset += laneStep
    ) {
      values.push(
        preferred - offset,
        preferred + offset
      );
    }

    const uniqueValues =
      [...new Set(
        values.map(
          (value) =>
            Math.round(value * 1000) /
            1000
        )
      )];

    return uniqueValues
      .filter(
        (value) =>
          value >= minimum &&
          value <= maximum
      )
      .sort(
        (first, second) =>
          Math.abs(
            first - preferred
          ) -
          Math.abs(
            second - preferred
          )
      );
  }

  function pointsToPath(points) {
    if (points.length === 0) {
      return "";
    }

    const commands = [
      `M ${points[0].x} ${points[0].y}`,
    ];

    for (
      let index = 1;
      index < points.length;
      index++
    ) {
      const previous =
        points[index - 1];

      const current =
        points[index];

      if (
        Math.abs(
          previous.x - current.x
        ) < epsilon
      ) {
        commands.push(
          `V ${current.y}`
        );
      } else {
        commands.push(
          `H ${current.x}`
        );
      }
    }

    return commands.join(" ");
  }

  function getRouteLength(
    points
  ) {
    let length = 0;

    for (
      let index = 0;
      index < points.length - 1;
      index++
    ) {
      length +=
        Math.abs(
          points[index + 1].x -
          points[index].x
        ) +
        Math.abs(
          points[index + 1].y -
          points[index].y
        );
    }

    return length;
  }

  function getLabelPoint(segments) {
  /*
   * Prefer the longest horizontal segment.
   * This gives branches a clear horizontal
   * net line to connect to.
   */
  const horizontalSegments =
    segments.filter(
      (segment) =>
        segment.orientation === "H"
    );

  const candidates =
    horizontalSegments.length > 0
      ? horizontalSegments
      : segments;

  let longest = null;
  let longestLength = -1;

  for (const segment of candidates) {
    const length =
      segment.orientation === "H"
        ? segment.x2 - segment.x1
        : segment.y2 - segment.y1;

    if (length > longestLength) {
      longestLength = length;
      longest = segment;
    }
  }

  if (!longest) {
    return null;
  }

  if (longest.orientation === "H") {
    return {
      x:
        (longest.x1 + longest.x2) / 2,
      y: longest.y,
    };
  }

  return {
    x: longest.x,
    y:
      (longest.y1 + longest.y2) / 2,
  };
}


  function createCandidate(
    points,
    net,
    type
  ) {
    const cleaned =
      cleanPoints(points);

    const segments =
      createSegments(
        cleaned,
        net
      );

    return {
      type,
      points: cleaned,
      segments,

      cost:
        getRouteLength(cleaned) +
        Math.max(
          0,
          cleaned.length - 2
        ) * 5,
    };
  }

function route(
  start,
  end,
  net,
  options = {}
) {
  const ignoredElementIds =
    new Set(
      [
        options.sourceElementId,
        options.targetElementId,
      ].filter(Boolean)
    );
    const candidates = [];

    /*
     * First try routes that use a
     * horizontal routing lane:
     *
     * start
     *   |
     *   +---------+
     *             |
     *            end
     */
    const preferredY =
      (start.y + end.y) / 2;

    const horizontalLanes =
      createLaneValues(
        preferredY,
        bounds.top,
        bounds.bottom,
        [
          start.y,
          end.y,
        ]
      );

    for (
      const laneY of
      horizontalLanes
    ) {
      candidates.push(
        createCandidate(
          [
            start,

            {
              x: start.x,
              y: laneY,
            },

            {
              x: end.x,
              y: laneY,
            },

            end,
          ],
          net,
          "horizontal-lane"
        )
      );
    }

    /*
     * Then try routes that use a
     * vertical routing lane:
     *
     * start -----+
     *            |
     *            +----- end
     */
    const preferredX =
      (start.x + end.x) / 2;

    const verticalLanes =
      createLaneValues(
        preferredX,
        bounds.left,
        bounds.right,
        [
          start.x,
          end.x,
        ]
      );

    for (
      const laneX of
      verticalLanes
    ) {
      candidates.push(
        createCandidate(
          [
            start,

            {
              x: laneX,
              y: start.y,
            },

            {
              x: laneX,
              y: end.y,
            },

            end,
          ],
          net,
          "vertical-lane"
        )
      );
    }

    /*
     * Prefer shorter routes with fewer bends.
     */
    candidates.sort(
      (first, second) =>
        first.cost -
        second.cost
    );

    for (
      const candidate of
      candidates
    ) {
      if (
        !pointsInsideCell(
            candidate.points
        )
        ) {
        continue;
        }

        if (
        routeConflicts(
            candidate.segments
        )
        ) {
        continue;
        }

        if (
        routeHitsComponent(
            candidate.segments,
            ignoredElementIds
        )
        ) {
        continue;
        }

        reserveSegments(
        candidate.segments
        );

        return {
        type:
            candidate.type,

        points:
            candidate.points,

        segments:
            candidate.segments,

        d:
            pointsToPath(
            candidate.points
            ),

        labelPoint:
            getLabelPoint(
            candidate.segments
            ),
        };
    }
}
}


function createLayoutCellRouters(
  placedCells
) {
  const routers = new Map();

  for (const cell of placedCells) {
    routers.set(
      cell.layout_cell,
      createLayoutCellWireRouter(
        cell
      )
    );
  }

  return routers;
}


function drawRoutedPath(
  wireLayer,
  start,
  end,
  net,
  router,
  options = {}
) {
  const route =
    router.route(
      start,
      end,
      net,
      {
        sourceElementId:
          options.sourceElement
            ?.id ||
          options.sourceElement
            ?.raw,

        targetElementId:
          options.targetElement
            ?.id ||
          options.targetElement
            ?.raw,
      }
    );

  if (!route) {
    console.warn(
      `No unobstructed route found for net "${net}".`
    );

    return null;
  }

  const path =
    createSvgElement(
      "path",
      {
        d: route.d,
        fill: "none",

        stroke:
          options.stroke ||
          drawConfig.wireStroke,

        "stroke-width":
          options.strokeWidth ||
          drawConfig.wireStrokeWidth,

        "stroke-linecap":
          "round",

        "stroke-linejoin":
          "round",

        class: "edge",
      }
    );

  wireLayer.appendChild(path);

  return route;
}


function getElementPinForNet(
  element,
  net,
  preferOutput = false
) {
  if (
    preferOutput &&
    element.net_out === net
  ) {
    return element.outputPin;
  }

  if (
    !preferOutput &&
    element.net_in === net
  ) {
    return element.inputPin;
  }

  if (
    element.net_out === net
  ) {
    return element.outputPin;
  }

  if (
    element.net_in === net
  ) {
    return element.inputPin;
  }

  return null;
}


function addConnectedElement(
  netEntry,
  element
) {
  if (!element) {
    return;
  }

  const elementId =
    element.id || element.raw;

  if (elementId) {
    netEntry.connectedElementIds.add(
      elementId
    );
  }
}

function isElementConnectedToNet(
  netEntry,
  element
) {
  const elementId =
    element?.id || element?.raw;

  return (
    elementId &&
    netEntry.connectedElementIds.has(
      elementId
    )
  );
}


function drawBranchToNetJunction(
  wireLayer,
  element,
  net,
  junctionPoint,
  router
) {
  const elementPin =
    getElementPinForNet(
      element,
      net,
      false
    );

  if (!elementPin) {
    console.warn(
      `No pin for net "${net}" on ${element.id}`,
      element
    );

    return null;
  }

  return drawRoutedPath(
    wireLayer,
    elementPin,
    junctionPoint,
    net,
    router,
    {
      /*
       * The branch may leave this component,
       * but every other component remains
       * an obstacle.
       */
      sourceElement:
        element,

      targetElement:
        null,
    }
  );
}