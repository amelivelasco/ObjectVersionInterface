function getPinOffsetForElement(element) {
  return getElementType(element) === "L"
    ? drawConfig.inductorPinOffset
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

        candidatePoints:
          pair.geometry.inputAnchors,
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

        candidatePoints:
          pair.geometry.outputAnchors,
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
        ) {
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

    drawPath(
      wireLayer,
      bestConnection.fromPoint,
      bestConnection.toPoint,
      {
        stroke:
          drawConfig.wireStroke,
      }
    );

    if (
      !labelWasDrawn &&
      options.drawLabel !== false
    ) {
      const labelX =
        (
          bestConnection.fromPoint.x +
          bestConnection.toPoint.x
        ) / 2;

      const labelY =
        (
          bestConnection.fromPoint.y +
          bestConnection.toPoint.y
        ) / 2;

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


function drawConnectionsInsideLayoutCells(
  wireLayer,
  labelLayer,
  placed
) {
  const elementsByCell = new Map();

  for (const element of placed) {
    const layoutInstance =
      getLayoutInstance(element);

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

  for (
    const [
      layoutInstance,
      cellElements,
    ] of elementsByCell
  ) {
    const terminalsByNet =
      collectNetTerminals(
        cellElements
      );

    for (
      const [
        net,
        terminals,
      ] of terminalsByNet
    ) {
      if (terminals.length < 2) {
        continue;
      }

      drawTerminalTree(
        wireLayer,
        labelLayer,
        net,
        terminals,
        {
          drawLabel: true,
        }
      );
    }

    console.log(
      `Finished internal connections for ${layoutInstance}`
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
  placed
) {
  const terminalsByNet =
    collectNetTerminals(placed);

  for (
    const [
      net,
      terminals,
    ] of terminalsByNet
  ) {
    const terminalsByCell =
      new Map();

    for (const terminal of terminals) {
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
     * The net exists in only one cell, so its
     * connections were handled by the first pass.
     */
    if (terminalsByCell.size < 2) {
      continue;
    }

    const cellAnchors = [];

    for (
      const cellTerminals of
      terminalsByCell.values()
    ) {
      cellAnchors.push(
        chooseCellNetAnchor(
          cellTerminals
        )
      );
    }

    drawTerminalTree(
      wireLayer,
      labelLayer,
      net,
      cellAnchors,
      {
        drawLabel: true,
      }
    );
  }
}