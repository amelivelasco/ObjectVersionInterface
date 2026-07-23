function drawPath(
  layer,
  a,
  b,
  options = {}
) {
  const path =
    createSvgElement(
      "path",
      {
        d:
          options.pathData ||
          orthogonalPath(a, b),

        fill: "none",

        "data-original-stroke":
          options.stroke ||
          drawConfig.wireStroke,

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

        "stroke-dasharray":
          options.dash || "",

        /*
         * Required by
         * snapBiasElementsToNearestNet().
         */
        "data-net":
          options.net || "",

        "data-kind":
          options.kind || "",

        class: "edge",
      }
    );

  layer.appendChild(path);

  return path;
}

function drawLine(
  lineLayer,
  labelLayer,
  element,
  a,
  b,
  options = {}
) {
  const line =
    createSvgElement(
      "line",
      {
        x1: a.x,
        y1: a.y,

        x2: b.x,
        y2: b.y,

        stroke:
          options.stroke ||
          drawConfig.wireStroke,

        "data-original-stroke":
          options.stroke ||
          drawConfig.wireStroke,

        "stroke-width":
          options.strokeWidth ||
          drawConfig.wireStrokeWidth,

        "stroke-linecap":
          "round",

        /*
         * Required when the relevant net is
         * represented by SVG lines rather than paths.
         */
        "data-net":
          options.net || "",

        "data-kind":
          options.kind || "",

        class: "edge",
      }
    );

  lineLayer.appendChild(line);

  return line;
}

function drawDot(layer, point, options = {}) {
  const dot = createSvgElement("circle", {
    cx: point.x,
    cy: point.y,
    r: options.radius || drawConfig.nodeRadius,
    fill: options.fill || drawConfig.nodeFill,
    stroke: options.stroke || drawConfig.nodeStroke,
    "stroke-width": 1.5,
  });

  layer.appendChild(dot);
}

function drawLabel(labelLayer, text, x, y, options = {}) {
  if (!text) {
    return;
  }

  const label = createSvgElement("text", {
    x,
    y,
    "text-anchor": options.anchor || "middle",
    "dominant-baseline": "middle",
    "font-family": drawConfig.fontFamily,
    "font-size": options.size || "9px",
    fill: options.fill || "#334155",

    // White outline hides the wire behind the text.
    stroke: options.background || "#ffffff",
    "stroke-width": options.backgroundWidth || 4,
    "paint-order": "stroke",
    "stroke-linejoin": "round",

    class: "net-label",
  });

  label.textContent = text;
  labelLayer.appendChild(label);
}

function formatComponentValue(
  element
) {
  const rawValue =
    element?.value;

  if (
    rawValue === null ||
    rawValue === undefined
  ) {
    return "";
  }

  const value =
    String(rawValue).trim();

  if (
    !value ||
    value.toLowerCase() ===
      "none" ||
    value.toLowerCase() ===
      "null"
  ) {
    return "";
  }

  const componentType =
    getElementType(element);


  if (
    componentType === "L"
  ) {
    if (
      /p$/i.test(value)
    ) {
      return (
        `${value.slice(0, -1)} pH`
      );
    }

    if (
      /n$/i.test(value)
    ) {
      return (
        `${value.slice(0, -1)} nH`
      );
    }

    /*
     * The value already includes a unit.
     */
    if (
      /[a-zA-Zµ]$/.test(
        value
      )
    ) {
      return value;
    }

    return `${value} pH`;
  }

  /*
   * JJ values represent critical current.
   */
  if (
    componentType === "JJ" || componentType === "IB"
  ) {
    if (
      /u$/i.test(value)
    ) {
      return (
        `${value.slice(0, -1)} µA`
      );
    }

    if (
      /µa$/i.test(value)
    ) {
      return value;
    }

    if (
      /[a-zA-Zµ]$/.test(
        value
      )
    ) {
      return value;
    }

    return `${value} µA`;
  }

  return value;
}

function drawComponentValueText(
  parent,
  text,
  x,
  y,
  options = {}
) {
  if (!text) {
    return null;
  }

  const valueText =
    createSvgElement(
      "text",
      {
        x,
        y,

        "text-anchor":
          "middle",

        "dominant-baseline":
          "middle",

        "font-family":
          drawConfig.fontFamily,

        "font-size":
          options.size ||
          drawConfig
            .componentValueFontSize,

        "font-weight":
          options.weight ||
          "700",

        fill:
          options.fill ||
          "#334155",

        /*
         * Small background outline keeps the value
         * readable when a wire passes behind it.
         */
        stroke:
          options.background ||
          "#f8fafc",

        "stroke-width":
          options.backgroundWidth ??
          3,

        "paint-order":
          "stroke",

        "stroke-linejoin":
          "round",

        class:
          options.className ||
          "component-value",

        "pointer-events":
          "none",
      }
    );

  valueText.textContent =
    text;

  parent.appendChild(
    valueText
  );

  return valueText;
}

function drawComponent(layer, element) {
  const halfSize =
    drawConfig.imageSize / 2;

  const g = createSvgElement("g", {
    class: `component component-${element.type}`,
  });

  const image = createSvgElement("image", {
    href: element.image,
    x: element.x - halfSize,
    y: element.y - halfSize,
    width: drawConfig.imageSize,
    height: drawConfig.imageSize,
    class: "component-image",
  });

  const componentType =
    getElementType(element);

  if (componentType === "R") {
    image.setAttribute(
      "transform",
      `rotate(90 ${element.x} ${element.y})`
    );
  }

  if (
    componentType === "IB" &&
    Number.isFinite(
      element.biasRotation
    )
  ) {
    image.setAttribute(
      "transform",
      `rotate(
        ${element.biasRotation}
        ${element.x}
        ${element.y}
      )`
    );
  }

  const title = createSvgElement("title");

  if (element.type[0].toLowerCase() === "r") {
    title.textContent = [
    `type=${element.type}`,
    `pid=${"R" + (element.pid || "").match(/\d+/)?.[0] || ""}`,
    `path=${(element.path || "").split("/")[0]}/R${(element.pid || "").match(/\d+/)?.[0] || ""}`,
    `net_in=${element.net_in || ""}`,
    `net_out=${element.net_out || ""}`,
    `value=${(100.0).toFixed(1)}`,
  ].join("\n");
  }

  else {
    title.textContent = [
      `type=${element.type}`,
      `pid=${element.pid || ""}`,
      `path=${element.path || ""}`,
      `net_in=${element.net_in || ""}`,
      `net_out=${element.net_out || ""}`,
      `value=${element.value || ""}`,
    ].join("\n");
  }

  g.appendChild(title);

  if (componentType === "L") {
    const baseline =
      createSvgElement("line", {
        x1: element.inputPin.x,
        y1: element.y,

        x2: element.outputPin.x,
        y2: element.y,

        stroke:
          drawConfig.wireStroke,

        "stroke-width":
          drawConfig.wireStrokeWidth,

        "stroke-linecap":
          "round",

        class:
          "inductor-wire-underlay",
      });

    /*
    * Append the line first so the red inductor
    * image is rendered over it.
    */
    g.appendChild(baseline);
  }


  g.appendChild(image);

  if (componentType === "IB") {
    drawComponentValueText(
      g,
      formatComponentValue(
        element
      ),
      element.x,
      element.y - 10,
      {
        size:
          drawConfig
            .componentValueFontSize,

        fill:
          "#7c2d12",

        className:
          "inductor-value",
      }
    );
  }

  if (
    componentType === "L"
  ) {
    drawComponentValueText(
      g,
      formatComponentValue(
        element
      ),
      element.x,
      element.y - 10,
      {
        size:
          drawConfig
            .componentValueFontSize,

        fill:
          "#7c2d12",

        className:
          "inductor-value",
      }
    );

    if (element.path) {
      drawComponentValueText(
        g,
        element.path,
        element.x,
        element.y + 12,      // below the image
        {
          size:
            drawConfig
              .componentValueFontSize,

          fill:
            "#7c2d12",
          className: "component-path",
        }
      );
    }
  }

  layer.appendChild(g);
  return {
    group: g,
    image,
    center: {
      x: element.x,
      y: element.y,
    },
    top: {
      x: element.x,
      y: element.y - halfSize,
    },
    bottom: {
      x: element.x,
      y: element.y + halfSize,
    },
    left: {
      x: element.x - halfSize,
      y: element.y,
    },
    right: {
      x: element.x + halfSize,
      y: element.y,
    },
  };
}

function drawCircuit(data) {
  const board = document.getElementById("drawing_board");
  board.innerHTML = "";

  if (!data || !Array.isArray(data.elements)) {
    board.textContent =
      "Circuit data is missing. Generate circuit_data.js first.";
    return;
  }

  if (
    !Array.isArray(
      data.layout_cells
    )
  ) {
    board.textContent =
      "Layout-cell data is missing from circuit_data.js.";

    return;
  }

  const {
    placedCells,
    canvasWidth,
    canvasHeight,
  } = buildLayoutCellLayout(data);

  const placed =
    buildPlacedElements(
      data,
      placedCells
    );


  console.table(
    placedCells.map(
      (cell) => ({
        layoutCell:
          cell.layout_cell,

        elements:
          cell.elements.length,

        x:
          cell.x,

        y:
          cell.y,

        width:
          cell.width,

        height:
          cell.height,

        rows:
          cell.rows,

        columns:
          cell.columns,
      })
    )
  );

  const svg = createSvg(canvasWidth, canvasHeight);
  board.appendChild(svg);
  const layoutCellLayer =createSvgElement("g",{class:"layout-cell-layer"});
  const internalWireLayer =
    createSvgElement(
      "g",
      {
        class:
          "internal-wire-layer",
      }
    );

  const externalWireLayer =
    createSvgElement(
      "g",
      {
        class:
          "external-wire-layer",
      }
    );
  const dotLayer = createSvgElement("g", { class: "dot-layer" });
  const componentLayer = createSvgElement("g", { class: "component-layer" });
  const labelLayer = createSvgElement("g", { class: "label-layer" });

  svg.appendChild(layoutCellLayer);
  svg.appendChild(
    internalWireLayer
  );

  svg.appendChild(
    externalWireLayer
  );
  svg.appendChild(dotLayer);
  svg.appendChild(componentLayer);
  svg.appendChild(labelLayer);

  placeBiasElementsAboveNetOut(
    placed
  );

  drawLayoutCellBoundaries(layoutCellLayer, placedCells);

  drawTerminalStubs(
    internalWireLayer,
    labelLayer,
    dotLayer,
    placed,
    15
  );

  drawConnectionsInsideLayoutCells(
    internalWireLayer,
    labelLayer,
    placed
  );

  snapBiasElementsToNearestNet(
    internalWireLayer,
    placed
  );

  drawBiasLocalConnections(
    internalWireLayer,
    labelLayer,
    placed
  );

  connectBiasStubsToInductors(
    internalWireLayer,
    labelLayer,
    placed
  );

  drawSubcircuits(placed, componentLayer, internalWireLayer, labelLayer)

  drawConnectionsBetweenLayoutCells(
    externalWireLayer,
    labelLayer,
    placed,
    [
      internalWireLayer,
    ]
  );

  drawTerminalStubs(
    internalWireLayer,
    labelLayer,
    dotLayer,
    placed,
    10,
    true
  );

  setupWireSelection(svg);

  setupPanZoom(svg, canvasWidth, canvasHeight);
}

function setupWireSelection(svg) {
  svg.querySelectorAll(".edge").forEach((wire) => {
    wire.addEventListener("click", (event) => {
      event.stopPropagation();

      clearSelectedWires(svg);

      const connected =
        collectConnectedWireChain(
          wire,
          svg.querySelectorAll(".edge")
        );

      connected.forEach((segment) => {
        segment.setAttribute(
          "stroke",
          "red"
        );

        segment.setAttribute(
          "stroke-width",
          Number(drawConfig.wireStrokeWidth) + 2
        );
      });
    });
  });
}


function clearSelectedWires(svg) {
  svg.querySelectorAll(".edge").forEach((wire) => {
    wire.setAttribute(
      "stroke",
        wire.dataset.originalStroke
    );

    wire.setAttribute(
      "stroke-width",
      drawConfig.wireStrokeWidth
    );
  });
}


function collectConnectedWireChain(
  startWire,
  allWires
) {
  const visited = new Set();
  const result = [];

  const queue = [
    startWire
  ];

  const startNet =
    startWire.getAttribute(
      "data-net"
    );

  while (queue.length > 0) {
    const current =
      queue.shift();

    if (visited.has(current)) {
      continue;
    }

    visited.add(current);
    result.push(current);

    const currentSegments =
      extractWireSegmentsFromElement(
        current
      );

    for (const other of allWires) {
      if (
        visited.has(other)
      ) {
        continue;
      }

      /*
       * Only follow the same net.
       */
      if (
        other.getAttribute("data-net") !==
        startNet
      ) {
        continue;
      }

      const otherSegments =
        extractWireSegmentsFromElement(
          other
        );

      if (
        wiresTouch(
          currentSegments,
          otherSegments
        )
      ) {
        queue.push(other);
      }
    }
  }

  return result;
}


function wiresTouch(
  firstSegments,
  secondSegments
) {
  const epsilon = 0.5;

  for (const first of firstSegments) {
    for (const second of secondSegments) {

      const points = [
        first.a,
        first.b,
      ];

      const otherPoints = [
        second.a,
        second.b,
      ];

      for (const p of points) {
        for (const q of otherPoints) {
          if (
            Math.abs(p.x - q.x) < epsilon &&
            Math.abs(p.y - q.y) < epsilon
          ) {
            return true;
          }
        }
      }
    }
  }

  return false;
}

function drawJRpairs(
  current,
  next,
  componentLayer,
  wireLayer,
  labelLayer
) {
  drawComponent(
    componentLayer,
    current
  );

  drawComponent(
    componentLayer,
    next
  );

  const geometry =
    getJJPairGeometry(
      current,
      next,
      25
    );

  const jrValue =
    formatComponentValue(
      current
    );

  if (jrValue) {
    const jrCenterX =
      (
        current.x +
        next.x
      ) / 2;

    const jrCenterY =
      (
        geometry.topMiddle.y +
        geometry.bottomMiddle.y
      ) / 2 +
      drawConfig.jrValueOffsetY;

    drawComponentValueText(
      labelLayer,
      current.path,
      current.x,
      current.y,
      {
        size:
          drawConfig
            .componentValueFontSize,

        fill:
          "#7c2d12",

        className:
          "jj-pathname",
      }
    );
    const res_path = `${(current.path || "").split("/")[0]}/R${(current.pid || "").match(/\d+/)?.[0] || ""}`;

    drawComponentValueText(
      labelLayer,
      res_path,
      next.x,
      next.y,
      {
        size:
          drawConfig
            .componentValueFontSize,

        fill:
          "#7c2d12",

        className:
          "jj-pathname",
      }
    );

    drawComponentValueText(
      labelLayer,
      jrValue,
      jrCenterX,
      jrCenterY,
      {
        size:
          drawConfig
            .jrValueFontSize,

        weight:
          "700",

        fill:
          "#7c2d12",

        background:
          "#f8fafc",

        backgroundWidth:
          4,

        className:
          "jr-jj-value",
      }
    );
  }


  drawLine(
    wireLayer,
    labelLayer,
    current,
    geometry.jjTop,
    geometry.topAtJJ,
    {
      net:
        current.net_in,

      kind:
        "jr-input",
    }
  );

  drawLine(
    wireLayer,
    labelLayer,
    current,
    geometry.topAtJJ,
    geometry.topAtResistor,
    {
      net: current.net_in,
      kind: "jr-internal",
    }
  );

  drawLine(
    wireLayer,
    labelLayer,
    current,
    geometry.topAtResistor,
    geometry.resistorTop,
    {
      net: current.net_out,
      kind: "jr-internal",
    }
  );

  drawLabel(
    labelLayer,
    current.net_in,
    geometry.topMiddle.x,
    geometry.topMiddle.y,
    {
      size: "8.5px",
      fill: "#334155",
    }
  );


  drawLine(
    wireLayer,
    labelLayer,
    current,
    geometry.jjBottom,
    geometry.bottomAtJJ,
  );

  drawLine(
    wireLayer,
    labelLayer,
    current,
    geometry.bottomAtJJ,
    geometry.bottomAtResistor,
    {
      net: current.net_out,
      kind: "jr-internal",
    }
  );

  drawLine(
    wireLayer,
    labelLayer,
    current,
    geometry.bottomAtResistor,
    geometry.resistorBottom,
    {
      net: current.net_out,
      kind: "jr-internal",
    }
  );


  if (current.net_out === "GND!") {

    drawGNDStub(
      wireLayer,
      labelLayer,
      current,
      componentLayer,
      geometry.bottomMiddle.x,
      geometry.bottomMiddle.y,
    );
  }

  drawLabel(
    labelLayer,
    current.net_out,
    geometry.bottomMiddle.x,
    geometry.bottomMiddle.y,
    {
      size: "8.5px",
      fill: "#334155",
    }
  );
}

function drawGNDStub(
  wireLayer,
  labelLayer,
  current,
  componentLayer,
  x,
  y
) {
  const stubLength = 10;

  const stubEnd = {
    x: x,
    y: y + stubLength,
  };

  drawLine(
    wireLayer,
    labelLayer,
    current,
    {
      x,
      y,
    },
    stubEnd,
    {
      net: "GND!",
      kind: "gnd-stub",
      stroke: drawConfig.nodeStroke,
    }
  );

  const img_ref = "../img/gnd_draw.png"
  const image = createSvgElement("image", {
    href: img_ref,
    x: x - 10,
    y: y,
    width: drawConfig.imageSize/2,
    height: drawConfig.imageSize/2,
    class: "component-image",
  });

  const g = createSvgElement("g", {
    class: `component component-gnd`,
  });

  

  g.appendChild(image)

  componentLayer.appendChild(g);

  return stubEnd;
}


function drawSubcircuits(placed, componentLayer, wireLayer, labelLayer) {
  for (let i = 0; i < placed.length; i++) {
    const current = placed[i];
    const next = placed[i + 1];

    const currentType = Array.isArray(current.type)
      ? current.type[0]
      : current.type;

    const nextType =
      next && Array.isArray(next.type)
        ? next.type[0]
        : next?.type;

    const isJJResistorPair =
        currentType === "JJ" &&
        nextType === "R" &&
        (
          next.source_component === current.id ||
          (
            next.path === current.path &&
            next.pid === current.pid
          )
        );

    if (isJJResistorPair) {
        drawJRpairs(current, next, componentLayer, wireLayer, labelLayer)
        i++;
        continue;
    }
    drawComponent(componentLayer, current);
  }
}

function drawTerminalStubs(
  wireLayer,
  labelLayer,
  dotLayer,
  placed,
  stubLength = 45,
  repairMissingSides = false
) {
  const netUseCounts =
    new Map();

  const labeledNets =
    new Set();

  const drawnDots =
    new Set();

  function getNetKey(
    component,
    net
  ) {
    return [
      getLayoutInstance(component),
      net,
    ].join("|");
  }

  /*
   * Count net usage inside each layout cell.
   */
  for (const component of placed) {
    if (
      isBiasElement(component) ||
      getElementType(component) === "R"
    ) {
      continue;
    }

    for (const net of [
      component.net_in,
      component.net_out,
    ]) {
      if (
        !net ||
        isGroundNet(net)
      ) {
        continue;
      }

      const key =
        getNetKey(
          component,
          net
        );

      netUseCounts.set(
        key,
        (
          netUseCounts.get(key) ??
          0
        ) + 1
      );
    }
  }

  function isTerminalNet(
    component,
    net
  ) {
    if (
      !net ||
      isGroundNet(net)
    ) {
      return false;
    }

    if (
      String(net)
        .trim()
        .toLowerCase() ===
      "terminal"
    ) {
      return true;
    }

    const key =
      getNetKey(
        component,
        net
      );

    return (
      netUseCounts.get(key) ??
      0
    ) === 1;
  }

  if (repairMissingSides) {
    const epsilon = 0.5;

    const segmentsByNet =
      new Map();

    function addSegment(
      net,
      a,
      b,
      options = {}
    ) {
      if (
        !net ||
        !a ||
        !b
      ) {
        return;
      }

      if (
        !segmentsByNet.has(net)
      ) {
        segmentsByNet.set(
          net,
          []
        );
      }

      segmentsByNet
        .get(net)
        .push({
          a: {
            x: a.x,
            y: a.y,
          },

          b: {
            x: b.x,
            y: b.y,
          },

          net,

          layoutInstance:
            options.layoutInstance ??
            null,

          source:
            options.source ??
            "wire",
        });
    }

    function pointLiesOnSegment(
      point,
      segment
    ) {
      const horizontal =
        Math.abs(
          segment.a.y -
          segment.b.y
        ) < epsilon;

      if (horizontal) {
        return (
          Math.abs(
            point.y -
            segment.a.y
          ) < epsilon &&
          point.x >=
            Math.min(
              segment.a.x,
              segment.b.x
            ) - epsilon &&
          point.x <=
            Math.max(
              segment.a.x,
              segment.b.x
            ) + epsilon
        );
      }

      const vertical =
        Math.abs(
          segment.a.x -
          segment.b.x
        ) < epsilon;

      if (vertical) {
        return (
          Math.abs(
            point.x -
            segment.a.x
          ) < epsilon &&
          point.y >=
            Math.min(
              segment.a.y,
              segment.b.y
            ) - epsilon &&
          point.y <=
            Math.max(
              segment.a.y,
              segment.b.y
            ) + epsilon
        );
      }

      return false;
    }

    function closestPointOnSegment(
      point,
      segment
    ) {
      const horizontal =
        Math.abs(
          segment.a.y -
          segment.b.y
        ) < epsilon;

      if (horizontal) {
        return {
          x:
            Math.max(
              Math.min(
                segment.a.x,
                segment.b.x
              ),

              Math.min(
                Math.max(
                  segment.a.x,
                  segment.b.x
                ),
                point.x
              )
            ),

          y:
            segment.a.y,
        };
      }

      const vertical =
        Math.abs(
          segment.a.x -
          segment.b.x
        ) < epsilon;

      if (vertical) {
        return {
          x:
            segment.a.x,

          y:
            Math.max(
              Math.min(
                segment.a.y,
                segment.b.y
              ),

              Math.min(
                Math.max(
                  segment.a.y,
                  segment.b.y
                ),
                point.y
              )
            ),
        };
      }

      return null;
    }

    /*
     * Collect all already-drawn SVG wires.
     */
    for (
      const child of
      Array.from(
        wireLayer.children
      )
    ) {
      const net =
        child.getAttribute(
          "data-net"
        );

      const kind =
        child.getAttribute(
          "data-kind"
        ) || "";

      if (!net) {
        continue;
      }

      if (
        kind.includes(
          "terminal-stub"
        )
      ) {
        continue;
      }

      const segments =
        extractWireSegmentsFromElement(
          child
        );

      for (const segment of segments) {
        addSegment(
          net,
          segment.a,
          segment.b,
          {
            source:
              "svg",
          }
        );
      }
    }

    for (
      let index = 0;
      index <
        placed.length - 1;
      index++
    ) {
      const jj =
        placed[index];

      const resistor =
        placed[index + 1];

      if (
        !isJJResistorPair(
          jj,
          resistor
        )
      ) {
        continue;
      }

      const geometry =
        getJJPairGeometry(
          jj,
          resistor,
          25
        );

      const layoutInstance =
        getLayoutInstance(jj);

      addSegment(
        jj.net_in,
        geometry.topAtJJ,
        geometry.topAtResistor,
        {
          source:
            "jr-input-rail",

          layoutInstance,
        }
      );

      addSegment(
        jj.net_out,
        geometry.bottomAtJJ,
        geometry.bottomAtResistor,
        {
          source:
            "jr-output-rail",

          layoutInstance,
        }
      );

      index++;
    }

    function sideAlreadyConnected(
      pin,
      net
    ) {
      const segments =
        segmentsByNet.get(net) ||
        [];

      return segments.some(
        (segment) =>
          pointLiesOnSegment(
            pin,
            segment
          )
      );
    }

    function connectMissingSide(
      component,
      pin,
      oppositePin,
      net,
      side
    ) {
      if (
        !pin ||
        !net ||
        isGroundNet(net)
      ) {
        return;
      }


      if (
        isTerminalNet(
          component,
          net
        )
      ) {
        return;
      }


      if (
        sideAlreadyConnected(
          pin,
          net
        )
      ) {
        return;
      }

      const componentLayout =
        getLayoutInstance(
          component
        );

      const allSegments =
        segmentsByNet.get(net) ||
        [];

      let candidates =
        allSegments.filter(
          (segment) =>
            !segment.layoutInstance ||
            segment.layoutInstance ===
              componentLayout
        );

      const segmentsAwayFromOppositePin =
        candidates.filter(
          (segment) =>
            !oppositePin ||
            !pointLiesOnSegment(
              oppositePin,
              segment
            )
        );

      if (
        segmentsAwayFromOppositePin.length >
        0
      ) {
        candidates =
          segmentsAwayFromOppositePin;
      }

      if (
        candidates.length === 0
      ) {
        return;
      }

      const direction =
        pin.x < component.x
          ? -1
          : 1;

      const outwardPoint = {
        x:
          pin.x +
          direction *
            stubLength,

        y:
          pin.y,
      };

      let bestTarget =
        null;

      let bestDistance =
        Infinity;

      for (
        const segment of
        candidates
      ) {
        const target =
          closestPointOnSegment(
            outwardPoint,
            segment
          );

        if (!target) {
          continue;
        }

        const distance =
          Math.abs(
            outwardPoint.x -
            target.x
          ) +
          Math.abs(
            outwardPoint.y -
            target.y
          );

        if (
          distance <
          bestDistance
        ) {
          bestDistance =
            distance;

          bestTarget =
            target;
        }
      }

      if (!bestTarget) {
        return;
      }

      const routePoints =
        simplifyOrthogonalPoints([
          {
            ...pin,
          },

          outwardPoint,

          {
            x:
              outwardPoint.x,

            y:
              bestTarget.y,
          },

          bestTarget,
        ]);

      if (
        routePoints.length < 2
      ) {
        return;
      }

      drawPath(
        wireLayer,
        pin,
        bestTarget,
        {
          stroke:
            drawConfig.wireStroke,

          pathData:
            routePointsToPathData(
              routePoints
            ),

          net,

          kind:
            `inductor-${side}-missing-connection`,
        }
      );

      for (
        const segment of
        routePointsToSegments(
          routePoints
        )
      ) {
        addSegment(
          net,
          segment.a,
          segment.b,
          {
            source:
              "inductor-repair",

            layoutInstance:
              componentLayout,
          }
        );
      }
    }

    for (
      const component of
      placed
    ) {
      if (
        getElementType(component) !==
        "L"
      ) {
        continue;
      }

      /*
       * The exact input pin must touch net_in.
       */
      connectMissingSide(
        component,
        component.inputPin,
        component.outputPin,
        component.net_in,
        "input"
      );

      /*
       * The exact output pin must touch net_out.
       */
      connectMissingSide(
        component,
        component.outputPin,
        component.inputPin,
        component.net_out,
        "output"
      );
    }

    return;
  }

  /*
   * FIRST PASS:
   * Your existing open terminal-net stubs.
   */
  function drawStub(
    component,
    pin,
    net,
    side
  ) {
    if (
      !pin ||
      !net
    ) {
      return null;
    }

    const direction =
      pin.x < component.x
        ? -1
        : 1;

    const stubEnd = {
      x:
        pin.x +
        direction *
          stubLength,

      y:
        pin.y,
    };

    drawLine(
      wireLayer,
      labelLayer,
      component,
      pin,
      stubEnd,
      {
        net,

        kind:
          `inductor-${side}-terminal-stub`,

        stroke:
          drawConfig.wireStroke,
      }
    );

    const dotKey = [
      getLayoutInstance(component),
      net,
      stubEnd.x.toFixed(3),
      stubEnd.y.toFixed(3),
    ].join("|");

    if (
      !drawnDots.has(
        dotKey
      )
    ) {
      drawnDots.add(
        dotKey
      );

      drawDot(
        dotLayer,
        stubEnd,
        {
          radius:
            5.5,

          fill:
            drawConfig.nodeFill,

          stroke:
            drawConfig.nodeStroke,
        }
      );
    }

    const labelKey =
      getNetKey(
        component,
        net
      );

    if (
      !labeledNets.has(
        labelKey
      )
    ) {
      labeledNets.add(
        labelKey
      );

      const labelX =
        (
          pin.x +
          stubEnd.x
        ) / 2;

      const labelY =
        pin.y - 9;

      drawComponentValueText(
        labelLayer,
        net,
        labelX,
        labelY - 15,
        {
          size:
            drawConfig
              .componentValueFontSize + 15,

          fill:
            "#7c2d12",

          className:
            "inductor-value",
        }
      );
      

      
    }

    return stubEnd;
  }

  for (const component of placed) {
    if (
      getElementType(component) !==
      "L"
    ) {
      continue;
    }

    if (
      isTerminalNet(
        component,
        component.net_in
      )
    ) {
      component.inputLeadPoint =
        drawStub(
          component,
          component.inputPin,
          component.net_in,
          "input"
        );

      component.inputNeedsLead =
        Boolean(
          component.inputLeadPoint
        );
    }

    if (
      isTerminalNet(
        component,
        component.net_out
      )
    ) {
      component.outputLeadPoint =
        drawStub(
          component,
          component.outputPin,
          component.net_out,
          "output"
        );

      component.outputNeedsLead =
        Boolean(
          component.outputLeadPoint
        );
    }
  }
}

window.addEventListener("DOMContentLoaded", () => {
  const board = document.getElementById("drawing_board");

  if (
    !window.circuitData ||
    !Array.isArray(window.circuitData.elements)
  ) {
    board.textContent =
      "Circuit data is missing. Generate circuit_data.js first.";
    return;
  }

  drawCircuit(window.circuitData);
});
