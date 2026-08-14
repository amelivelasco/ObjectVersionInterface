function getBiasPolarityPoint(bias) {
  const possiblePoints = [bias?.biasNetJoin, bias?.outputPin, bias,];

  for (const point of possiblePoints) {
    if (Number.isFinite(point?.x) && Number.isFinite(point?.y)) {
      return {x: point.x, y: point.y,};
    }
  }

  return null;
}

function normalizePolarityNet(net) {
  return String(net ?? "").trim().toUpperCase();
}

function getPolarityDistance(first, second) {
  if (!first || !second
  ) { return Infinity; }

  return (Math.abs(first.x - second.x) +
    Math.abs(first.y - second.y)
  );
}

function drawPolaritySign(labelLayer, sign, point, className = "") {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)
  ) { return; }

  drawComponentValueText(labelLayer, sign, point.x, point.y,
    { size: "15px", weight: "900", fill: sign === "+" ? "#15803d": "#b91c1c", 
      background: "#f8fafc", backgroundWidth: 3, className: [ "current-polarity-sign", className, ]
        .filter(Boolean)
        .join(" "),
    }
  );
}

function createPolarityComponent(element, options = {}) {
  const halfSize = drawConfig.imageSize / 2;
  const type = getElementType(element);

  if (type === "IB") { return null; }

  if (type === "L") {
    const inputPoint = element.inputPin || {
        x: element.x - halfSize,
        y: element.y,
      };

    const outputPoint =
      element.outputPin || {x: element.x + halfSize, y: element.y,};

    return {
      id: element.id,
      kind: "inductor",
      elements: [element,],
      center: { x:  element.x, y: element.y, },
      sideA: {name: "input", net:element.net_in, netKey: normalizePolarityNet(element.net_in), point: inputPoint,},
      sideB: { name: "output", net: element.net_out, netKey: normalizePolarityNet(element.net_out), point: outputPoint,},
    };
  }

  if (type === "R" || type === "JJ") {
    return {
      id: element.id,
      kind: type === "R" ? "resistor" : "jj",
      elements: [ element, ],
      center: { x: element.x, y: element.y,},
      sideA: {
        name: "top",
        net: element.net_in,
        netKey: normalizePolarityNet(element.net_in),
        point: {
          x: element.x,
          y: element.y -  halfSize,
        },
      },

      sideB: {
        name: "bottom",
        net: element.net_out,
        netKey: normalizePolarityNet(element.net_out),
        point: {x: element.x, y: element.y + halfSize,},
      },
    };
  }


  if (element.net_in && element.net_out) {
    const inputPoint = element.inputPin || { x: element.x - halfSize, y: element.y,};

    const outputPoint =
      element.outputPin || { x: element.x + halfSize, y: element.y, };

    return {
      id: element.id,
      kind: "generic",
      elements: [element,],
      center: { x: element.x, y: element.y, },
      sideA: {
        name: "input",
        net: element.net_in,
        netKey: normalizePolarityNet(element.net_in),
        point: inputPoint,
      },

      sideB: {
        name: "output",
        net:  element.net_out,
        netKey: normalizePolarityNet(element.net_out),
        point: outputPoint,
      },
    };
  }
  return null;
}

function buildPolarityComponents(placed) {
  const components = [];
  const consumedIds = new Set();

  for (let index = 0; index < placed.length; index++) {
    const current = placed[index];

    if (consumedIds.has( current.id) || isBiasElement(current)
    ) { continue; }

    const currentType = getElementType(current);

    if (currentType === "JJ") {
      const resistor =
        placed.find(
          (candidate) =>
            !consumedIds.has(candidate.id) && getLayoutInstance(candidate) ===
              getLayoutInstance(current) && isJJResistorPair(current, candidate)
        );

      if (resistor) {
        const geometry = getJJPairGeometry(current, resistor, 25);

        components.push({
          id: `pair:${current.id}`,
          kind: "jr-pair",
          elements: [current, resistor,],
          jj: current,
          resistor,
          geometry,
          center: { x:(current.x + resistor.x) / 2, y:(current.y + resistor.y) / 2,},
          sideA: {
            name: "top",
            net: current.net_in,
            netKey: normalizePolarityNet(current.net_in),
            point: geometry.topMiddle,
          },
          sideB: {
            name: "bottom",
            net: current.net_out,
            netKey:  normalizePolarityNet(current.net_out),
            point: geometry.bottomMiddle,
          },
        });

        consumedIds.add(current.id);
        consumedIds.add( resistor.id);

        continue;
      }
    }

    const component = createPolarityComponent(current);

    if (component) { components.push(component); }

    consumedIds.add(current.id);
  }

  return components;
}

function getOutwardSignPoint(componentCenter, terminalPoint, offset = 10) {
  const dx = terminalPoint.x - componentCenter.x;
  const dy = terminalPoint.y - componentCenter.y;

  if (Math.abs(dx) >= Math.abs(dy)) {
    return {
      x: terminalPoint.x + (dx < 0 ? -offset : offset),
      y: terminalPoint.y,
    };
  }

  return {
    x: terminalPoint.x,
    y: terminalPoint.y + (dy < 0 ? -offset : offset ),
  };
}

function drawPolarityForComponent(labelLayer, component, positiveSide) {
  if (!labelLayer || !component?.sideA || !component?.sideB) return;

  if (component.kind === "jr-pair") {
    const sideAIsGround = isGroundNet(component.sideA.net), sideBIsGround = isGroundNet(component.sideB.net);
    if (sideAIsGround && !sideBIsGround) positiveSide = component.sideB;
    else if (sideBIsGround && !sideAIsGround) positiveSide = component.sideA;
  }

  if (!positiveSide) return;

  const negativeSide = positiveSide === component.sideA ? component.sideB : component.sideA;

  if (component.kind === "jr-pair") {
    const { jj, resistor, geometry } = component;
    const halfSize = drawConfig.imageSize / 2, offset = 9;
    const sideASign = positiveSide === component.sideA ? "+" : "−";
    const sideBSign = positiveSide === component.sideA ? "−" : "+";
    const horizontal = geometry?.orientation === "horizontal" || jj.jrRotated || resistor.jrRotated;

    if (horizontal) {
      const sideAOnLeft = component.sideA.point.x <= component.sideB.point.x;
      const leftSign = sideAOnLeft ? sideASign : sideBSign;
      const rightSign = sideAOnLeft ? sideBSign : sideASign;

      drawPolaritySign(labelLayer, leftSign, { x: jj.x - halfSize - offset, y: jj.y }, "jj-polarity-left");
      drawPolaritySign(labelLayer, rightSign, { x: jj.x + halfSize + offset, y: jj.y }, "jj-polarity-right");
      drawPolaritySign(labelLayer, leftSign, { x: resistor.x - halfSize - offset, y: resistor.y }, "resistor-polarity-left");
      drawPolaritySign(labelLayer, rightSign, { x: resistor.x + halfSize + offset, y: resistor.y }, "resistor-polarity-right");
    } else {
      const sideAOnTop = component.sideA.point.y <= component.sideB.point.y;
      const topSign = sideAOnTop ? sideASign : sideBSign;
      const bottomSign = sideAOnTop ? sideBSign : sideASign;

      drawPolaritySign(labelLayer, topSign, { x: jj.x, y: jj.y - halfSize - offset }, "jj-polarity-top");
      drawPolaritySign(labelLayer, bottomSign, { x: jj.x, y: jj.y + halfSize + offset }, "jj-polarity-bottom");
      drawPolaritySign(labelLayer, topSign, { x: resistor.x, y: resistor.y - halfSize - offset }, "resistor-polarity-top");
      drawPolaritySign(labelLayer, bottomSign, { x: resistor.x, y: resistor.y + halfSize + offset }, "resistor-polarity-bottom");
    }

    return;
  }

  drawPolaritySign(labelLayer, "+", getOutwardSignPoint(component.center, positiveSide.point, 10), `${component.kind}-polarity-positive`);
  drawPolaritySign(labelLayer, "−", getOutwardSignPoint(component.center, negativeSide.point, 10), `${component.kind}-polarity-negative`);
}

function drawBiasBasedPolaritySigns(labelLayer, placed) {
  if (!labelLayer || !Array.isArray(placed)) {
    return;
  }

  labelLayer.querySelectorAll(".current-polarity-sign").forEach((sign) => sign.remove());

  const components = buildPolarityComponents(placed);

  for (const component of components) {
    if (!component.sideA.netKey || !component.sideB.netKey) {
      continue;
    }

    drawPolarityForComponent(labelLayer, component, component.sideA);
  }
}
