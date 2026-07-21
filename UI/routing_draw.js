function getPinOffsetForElement(element) {
  return getElementType(element) === "L"
    ? drawConfig.imageSize / 2
    : drawConfig.pinOffset;
}

function isBiasElement(element) {
  return getElementType(element) === "IB";
}

function getLayoutInstance(element) {
  return (
    element.parentLayoutCell ||
    element.layout_instance ||
    element.layout_cell ||
    "unassigned"
  );
}

function isGeneratedResistor(element) {
  /*
   * JJ-to-resistor connections are already drawn
   * by drawJRpairs(), so exclude resistors from the
   * normal net-routing passes.
   */
  return getElementType(element) === "R";
}

function getManhattanDistance(first, second) {
  return (
    Math.abs(first.x - second.x) +
    Math.abs(first.y - second.y)
  );
}


function getElementType(element) {
  return Array.isArray(element.type)
    ? element.type[0]
    : element.type;
}

function isJJResistorPair(jj, resistor) {
  if (!jj || !resistor) {
    return false;
  }

  return (
    getElementType(jj) === "JJ" &&
    getElementType(resistor) === "R" &&
    (
      resistor.source_component === jj.id ||
      resistor.companion_of === jj.id ||
      (
        resistor.path === jj.path &&
        resistor.pid === jj.pid
      )
    )
  );
}

function getJJPairGeometry(
  jj,
  resistor,
  rise = 25
) {
  const halfSize =
    drawConfig.imageSize / 2;

  const jjTop = {
    x: jj.x,
    y: jj.y - halfSize,
  };

  const resistorTop = {
    x: resistor.x,
    y: resistor.y - halfSize,
  };

  const jjBottom = {
    x: jj.x,
    y: jj.y + halfSize,
  };

  const resistorBottom = {
    x: resistor.x,
    y: resistor.y + halfSize,
  };

  const topY =
    Math.min(
      jjTop.y,
      resistorTop.y
    ) - rise;

  const bottomY =
    Math.max(
      jjBottom.y,
      resistorBottom.y
    ) + rise;

  const topAtJJ = {
    x: jj.x,
    y: topY,
  };

  const topAtResistor = {
    x: resistor.x,
    y: topY,
  };

  const bottomAtJJ = {
    x: jj.x,
    y: bottomY,
  };

  const bottomAtResistor = {
    x: resistor.x,
    y: bottomY,
  };

  const topMiddle = {
    x:
      (
        jj.x +
        resistor.x
      ) / 2,
    y: topY,
  };

  const bottomMiddle = {
    x:
      (
        jj.x +
        resistor.x
      ) / 2,
    y: bottomY,
  };

  return {
    jjTop,
    resistorTop,
    jjBottom,
    resistorBottom,

    topAtJJ,
    topAtResistor,
    bottomAtJJ,
    bottomAtResistor,

    topMiddle,
    bottomMiddle,

    /*
     * Valid connection points for net_in.
     * The router chooses whichever is closest.
     */
    inputAnchors: [
      topMiddle,
      topAtJJ,
      topAtResistor,
    ],

    /*
     * Valid connection points for net_out.
     */
    outputAnchors: [
      bottomMiddle,
      bottomAtJJ,
      bottomAtResistor,
    ],
  };
}

function collectNetTerminals(elements) {
  const terminalsByNet = new Map();
  const elementsInPairs = new Set();
  const pairs = [];

  function addTerminal(
    net,
    terminal
  ) {
    if (!net) {
      return;
    }

    if (isGroundNet(net)) {
      return;
    }

    if (!terminalsByNet.has(net)) {
      terminalsByNet.set(
        net,
        []
      );
    }

    terminalsByNet
      .get(net)
      .push(terminal);
  }

  /*
   * First identify every JJ/resistor pair.
   */
  for (
    let index = 0;
    index < elements.length - 1;
    index++
  ) {
    const current =
      elements[index];

    const next =
      elements[index + 1];

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

    pairs.push({
      jj: current,
      resistor: next,
      geometry,
    });

    elementsInPairs.add(
      current.id
    );

    elementsInPairs.add(
      next.id
    );

    index++;
  }

  /*
   * Add one top and one bottom terminal for each
   * composite JJ/resistor pair.
   */
  for (const pair of pairs) {
    const layoutInstance =
      getLayoutInstance(
        pair.jj
      );

    addTerminal(
      pair.jj.net_in,
      {
        net:
          pair.jj.net_in,

        kind: "in",

        element:
          pair.jj,

        ownerId:
          `pair:${pair.jj.id}`,

        layoutInstance,

        candidatePoints: [
          pair.geometry.topMiddle,
        ],
      }
    );

    addTerminal(
      pair.jj.net_out,
      {
        net:
          pair.jj.net_out,

        kind: "out",

        element:
          pair.jj,

        ownerId:
          `pair:${pair.jj.id}`,

        layoutInstance,

        candidatePoints: [
          pair.geometry.bottomMiddle,
        ],
      }
    );
  }

  /*
   * Add regular element terminals.
   * Skip both members of every JJ/resistor pair.
   */
    for (const element of elements) {
        if (
            elementsInPairs.has(
            element.id
            )
        ) {
            continue;
        }

        if (
            getElementType(element) === "R"
        ) {
            continue;
        }

        /*
        * The bias connects itself through
        * drawBiasLocalConnections().
        */
        if (isBiasElement(element)) {
            continue;
        }

        const layoutInstance =
            getLayoutInstance(element);
        
        if (
          element.net_in &&
          element.inputPin 
        ){
            addTerminal(
            element.net_in,
            {
                net: element.net_in,
                kind: "in",
                point: element.inputPin,

                candidatePoints: [
                element.inputPin,
                ],

                element,
                ownerId: element.id,
                layoutInstance,
            }
            );
        }

        if (
          element.net_out &&
          element.outputPin
        ) {
            addTerminal(
            element.net_out,
            {
                net: element.net_out,
                kind: "out",
                point: element.outputPin,

                candidatePoints: [
                element.outputPin,
                ],

                element,
                ownerId: element.id,
                layoutInstance,
            }
            );
        }
    }

  return terminalsByNet;
}

function getTerminalPoints(
  terminal
) {
  if (terminal.selectedPoint) {
    return [
      terminal.selectedPoint,
    ];
  }

  if (
    Array.isArray(
      terminal.candidatePoints
    ) &&
    terminal.candidatePoints.length > 0
  ) {
    return terminal.candidatePoints;
  }

  if (terminal.point) {
    return [
      terminal.point,
    ];
  }

  return [];
}

function findBestTerminalConnection(
  firstTerminal,
  secondTerminal
) {
  let best = null;

  const firstPoints =
    getTerminalPoints(
      firstTerminal
    );

  const secondPoints =
    getTerminalPoints(
      secondTerminal
    );

  for (
    const firstPoint of
    firstPoints
  ) {
    for (
      const secondPoint of
      secondPoints
    ) {
      const distance =
        getManhattanDistance(
          firstPoint,
          secondPoint
        );

      if (
        !best ||
        distance < best.distance
      ) {
        best = {
          firstPoint,
          secondPoint,
          distance,
        };
      }
    }
  }

  return best;
}


function drawTerminalTree(
  wireLayer,
  labelLayer,
  net,
  terminals,
  options = {}
) {
  if (
    !Array.isArray(terminals) ||
    terminals.length < 2
  ) {
    return;
  }

  const rootIndex =
    terminals.findIndex(
      (terminal) =>
        terminal.kind === "out"
    );

  const root =
    rootIndex >= 0
      ? terminals[rootIndex]
      : terminals[0];

  const connected = [root];

  const remaining =
    terminals.filter(
      (terminal) =>
        terminal !== root
    );

  let labelWasDrawn = false;

  while (remaining.length > 0) {
    let bestConnection = null;

    for (
      const connectedTerminal of
      connected
    ) {
      for (
        let index = 0;
        index < remaining.length;
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

        if (
          !bestConnection ||
          pointConnection.distance <
            bestConnection.distance
        ) {
          bestConnection = {
            from:
              connectedTerminal,

            to:
              candidate,

            fromPoint:
              pointConnection.firstPoint,

            toPoint:
              pointConnection.secondPoint,

            remainingIndex:
              index,

            distance:
              pointConnection.distance,
          };
        }
      }
    }

    if (!bestConnection) {
      break;
    }

    /*
     * Once a composite terminal chooses one of its
     * anchors, reuse that anchor for later branches.
     */
    if (
      !bestConnection.from
        .selectedPoint
    ) {
      bestConnection.from
        .selectedPoint =
          bestConnection.fromPoint;
    }

    if (
      !bestConnection.to
        .selectedPoint
    ) {
      bestConnection.to
        .selectedPoint =
          bestConnection.toPoint;
    }

    const fromTerminal =
      bestConnection.from;

    const toTerminal =
      bestConnection.to;

    const fromElement =
      fromTerminal.element;

    const toElement =
      toTerminal.element;

    const fromPoint =
      bestConnection.fromPoint;

    const toPoint =
      bestConnection.toPoint;

    const fromIsInductor =
      fromElement &&
      getElementType(
        fromElement
      ) === "L";

    const toIsInductor =
      toElement &&
      getElementType(
        toElement
      ) === "L";

    const clearance = 18;

    const fromSideDirection =
      fromIsInductor
        ? (
            fromPoint.x <
            fromElement.x
              ? -1
              : 1
          )
        : 0;

    const toSideDirection =
      toIsInductor
        ? (
            toPoint.x <
            toElement.x
              ? -1
              : 1
          )
        : 0;

    const fromApproachPoint = {
      x:
        fromIsInductor
          ? fromPoint.x +
            fromSideDirection *
              clearance
          : fromPoint.x,

      y:
        fromPoint.y,
    };

    const toApproachPoint = {
      x:
        toIsInductor
          ? toPoint.x +
            toSideDirection *
              clearance
          : toPoint.x,

      y:
        toPoint.y,
    };

    let routePoints = null;
    let pathData;

    /*
     * Use the existing obstacle-aware router whenever
     * the caller supplies the elements in this cell.
     * This makes ordinary nets avoid every component
     * image instead of only protecting shared outputs.
     */
    if (
      Array.isArray(
        options.cellElements
      ) &&
      typeof buildShortestFreeRoute ===
        "function" &&
      typeof routePointsToPathData ===
        "function"
    ) {
      routePoints =
        buildShortestFreeRoute(
          fromPoint,
          toPoint,
          fromTerminal,
          toTerminal,
          options.cellElements,
          Array.isArray(
            options.routedSegments
          )
            ? options.routedSegments
            : [],
          net
        );

      /*
      * The router returns null when it cannot find
      * a legal obstacle-free route.
      */
      if (
        !Array.isArray(routePoints) ||
        routePoints.length < 2
      ) {
        console.warn(
          `Skipping unroutable connection for ${net}`,
          {
            from:
              fromPoint,

            to:
              toPoint,

            fromOwner:
              fromTerminal.ownerId,

            toOwner:
              toTerminal.ownerId,
          }
        );

        /*
        * Remove this target so the while loop does not
        * attempt the exact same failed connection forever.
        */
        remaining.splice(
          bestConnection.remainingIndex,
          1
        );

        continue;
      }

      /*
      * Apply the same JR-wire separation to ordinary
      * nets as is applied to shared-output nets.
      */
      routePoints =
        separateRouteFromJR(
          routePoints,
          net,
          options.jrRails || [],
          options.jrMargin ?? 12
        );

      pathData =
        routePointsToPathData(
          routePoints
        );
        
    } else if (
      fromIsInductor ||
      toIsInductor
    ) {
      /*
       * Preserve the original inductor-safe fallback
       * for callers outside the layout-cell router.
       */
      pathData = [
        `M ${fromPoint.x} ${fromPoint.y}`,

        fromIsInductor
          ? `H ${fromApproachPoint.x}`
          : "",

        `H ${toApproachPoint.x}`,
        `V ${toApproachPoint.y}`,

        toIsInductor
          ? `H ${toPoint.x}`
          : "",
      ]
        .filter(Boolean)
        .join(" ");
    }

    drawPath(
      wireLayer,
      fromPoint,
      toPoint,
      {
        stroke:
          drawConfig.wireStroke,

        pathData,

        net,

        kind:
          "net-route",
      }
    );

    if (
      routePoints &&
      Array.isArray(
        options.routedSegments
      ) &&
      typeof routePointsToSegments ===
        "function"
    ) {
      options.routedSegments.push(
        ...routePointsToSegments(
          routePoints
        ).map(
          (segment) => ({
            ...segment,
            net,
          })
        )
      );
    }

    if (
      !labelWasDrawn &&
      options.drawLabel !== false
    ) {
      let labelX;
      let labelY;

      if (
        routePoints &&
        typeof getLongestHorizontalSegment ===
          "function"
      ) {
        const labelSegment =
          getLongestHorizontalSegment(
            routePoints
          );

        if (labelSegment) {
          labelX =
            (
              labelSegment.a.x +
              labelSegment.b.x
            ) / 2;

          labelY =
            labelSegment.a.y;
        }
      }

      if (
        !Number.isFinite(labelX) ||
        !Number.isFinite(labelY)
      ) {
        const labelSegmentEndX =
          fromIsInductor
            ? fromApproachPoint.x
            : toApproachPoint.x;

        labelX =
          (
            fromPoint.x +
            labelSegmentEndX
          ) / 2;

        labelY =
          fromPoint.y;
      }

      drawLabel(
        labelLayer,
        net,
        labelX,
        labelY,
        {
          size: "8.5px",
          fill: "#334155",
        }
      );

      labelWasDrawn = true;
    }

    connected.push(
      bestConnection.to
    );

    remaining.splice(
      bestConnection.remainingIndex,
      1
    );
  }
}

function chooseCellNetAnchor(
  terminals
) {
  return (
    terminals.find(
      (terminal) =>
        terminal.kind === "out"
    ) ||
    terminals[0]
  );
}

function drawConnectionsBetweenLayoutCells(
  wireLayer,
  labelLayer,
  placed,
  obstacleWireLayers = []
) {
  const terminalsByNet =
    collectNetTerminals(
      placed
    );

  const entries = [];

  /*
   * Find nets that appear in at least two different
   * layout-cell instances.
   */
  for (
    const [
      net,
      terminals,
    ] of terminalsByNet
  ) {
    const terminalsByCell =
      new Map();

    for (
      const terminal of
      terminals
    ) {
      const layoutInstance =
        terminal.layoutInstance;

      if (
        !terminalsByCell.has(
          layoutInstance
        )
      ) {
        terminalsByCell.set(
          layoutInstance,
          []
        );
      }

      terminalsByCell
        .get(layoutInstance)
        .push(terminal);
    }

    /*
     * This net exists only inside one cell.
     */
    if (
      terminalsByCell.size < 2
    ) {
      continue;
    }

    /*
     * Use one representative terminal from each
     * layout-cell instance.
     */
    const cellAnchors = [];

    for (
      const cellTerminals of
      terminalsByCell.values()
    ) {
      const anchor =
        chooseCellNetAnchor(
          cellTerminals
        );

      if (anchor) {
        cellAnchors.push(
          anchor
        );
      }
    }

    if (
      cellAnchors.length < 2
    ) {
      continue;
    }

    entries.push([
      net,
      cellAnchors,
    ]);
  }

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

  /*
   * Existing internal wires and previously drawn
   * inter-cell wires become routing obstacles.
   */
  const routedSegments = [];

  const strokeWidth =
    Number(
      drawConfig.wireStrokeWidth
    ) || 2;

  routedSegments.segmentConflictChecker =
    interCellSegmentsConflict;

  /*
  * Lane beside an existing parallel wire.
  */
  routedSegments.tightParallelLaneSpacing =
    strokeWidth + 0.5;

  /*
  * Coordinates just beyond wire endpoints.
  * This is what allows the yellow vertical section
  * to turn around the end of horizontal wires.
  */
  routedSegments.endpointTurnSpacing =
    strokeWidth + 1;

  /*
  * Add one route around the outside of the complete
  * local routing graph.
  */
  routedSegments.outsideChannelMargin =
    20;

  for (
    const obstacleLayer of
    obstacleWireLayers
  ) {
    addWireLayerToRoutedSegments(
      obstacleLayer,
      routedSegments
    );
  }

  addWireLayerToRoutedSegments(
    wireLayer,
    routedSegments
  );

  /*
   * Build the same JR guides used by the internal
   * layout-cell router.
   */
  const jrRails = [];

  const jrMargin = 12;

  for (
    let index = 0;
    index <
      placed.length - 1;
    index++
  ) {
    const current =
      placed[index];

    const next =
      placed[index + 1];

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
            geometry.topAtResistor.x
          ),

        maxX:
          Math.max(
            geometry.topAtJJ.x,
            geometry.topAtResistor.x
          ),

        y:
          geometry.topAtJJ.y,

        net:
          current.net_in,

        side:
          "top",

        ownerId:
          `pair:${current.id}`,
      },

      {
        minX:
          Math.min(
            geometry.bottomAtJJ.x,
            geometry.bottomAtResistor.x
          ),

        maxX:
          Math.max(
            geometry.bottomAtJJ.x,
            geometry.bottomAtResistor.x
          ),

        y:
          geometry.bottomAtJJ.y,

        net:
          current.net_out,

        side:
          "bottom",

        ownerId:
          `pair:${current.id}`,
      }
    );

    /*
     * Skip the generated resistor.
     */
    index++;
  }

  /*
   * Register the same protected inductor leads used
   * by the internal router.
   */
  for (
    const element of
    placed
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
          element.inputLeadPoint,

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
          element.outputLeadPoint,

        net:
          element.net_out,

        protectedInductorLead:
          true,
      });
    }
  }

  /*
   * Route ordinary inter-cell nets using exactly the
   * same obstacle-aware router as internal nets.
   */
  for (
    const [
      net,
      cellAnchors,
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
      cellAnchors,
      {
        drawLabel:
          true,

        /*
         * This is the key difference:
         *
         * Every circuit component is an obstacle,
         * but the individual layout-cell boundary is
         * not a routing limit.
         *
         * The route may therefore leave one cell,
         * travel through free space, and enter another.
         */
        cellElements:
          placed,

        routedSegments,

        jrRails,

        jrMargin,
      }
    );

    /*
     * Fallback in case drawTerminalTree() drew the
     * path without registering its route segments.
     */
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
        const child of
        newChildren
      ) {
        const childNet =
          child.getAttribute(
            "data-net"
          ) ||
          net;

        routedSegments.push(
          ...extractWireSegmentsFromElement(
            child
          ).map(
            (segment) => ({
              ...segment,

              net:
                childNet,
            })
          )
        );
      }
    }
  }

  /*
   * Route shared-output inter-cell nets using the
   * same shared-output router as internal nets.
   */
  for (
    const [
      net,
      cellAnchors,
    ] of sharedOutputEntries
  ) {
    const firstNewChild =
      wireLayer.children.length;

    const routedSegmentCount =
      routedSegments.length;

    drawSharedOutputNet(
      wireLayer,
      labelLayer,
      net,
      cellAnchors,

      /*
       * All elements across all cells are obstacles.
       */
      placed,

      routedSegments,
      jrRails,
      jrMargin
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
        const child of
        newChildren
      ) {
        const childNet =
          child.getAttribute(
            "data-net"
          ) ||
          net;

        routedSegments.push(
          ...extractWireSegmentsFromElement(
            child
          ).map(
            (segment) => ({
              ...segment,

              net:
                childNet,
            })
          )
        );
      }
    }
  }

  console.log(
    "Finished inter-cell connections",
    {
      ordinaryNets:
        ordinaryEntries.length,

      sharedOutputNets:
        sharedOutputEntries.length,

      routedSegments:
        routedSegments.length,
    }
  );
}


function addWireLayerToRoutedSegments(
  wireLayer,
  routedSegments
) {
  if (
    !wireLayer ||
    !routedSegments
  ) {
    return;
  }

  /*
   * Read every existing SVG wire in the layer.
   */
  const wireElements =
    wireLayer.querySelectorAll(
      "path, line, polyline"
    );

  for (
    const wireElement of
    wireElements
  ) {
    const net =
      wireElement.getAttribute(
        "data-net"
      ) ||
      "__existing_wire__";

    const kind =
      wireElement.getAttribute(
        "data-kind"
      ) ||
      "existing-wire";

    const segments =
      extractWireSegmentsFromElement(
        wireElement
      );

    for (
      const segment of
      segments
    ) {
      if (
        !segment?.a ||
        !segment?.b
      ) {
        continue;
      }

      routedSegments.push({
        ...segment,
        net,
        kind,
        existingWire:
          true,
      });
    }
  }
}