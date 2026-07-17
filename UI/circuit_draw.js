function drawPath(layer, a, b, options = {}) {
  const path = createSvgElement("path", {
    d: orthogonalPath(a, b),
    fill: "none",
    stroke: options.stroke || drawConfig.wireStroke,
    "stroke-width": options.strokeWidth || drawConfig.wireStrokeWidth,
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "stroke-dasharray": options.dash || "",
    class: "edge",
  });

  layer.appendChild(path);
}

function drawLine(lineLayer, labelLayer, element, a, b, options = {}) {
  const line = createSvgElement("line", {
    x1: a.x,
    y1: a.y,
    x2: b.x,
    y2: b.y,
    stroke: options.stroke || drawConfig.wireStroke,
    "stroke-width": options.strokeWidth || drawConfig.wireStrokeWidth,
    "stroke-linecap": "round",
    class: "edge",
  });

  lineLayer.appendChild(line);
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

function drawComponent(layer, element) {
  const g = createSvgElement("g", {
    class: `component component-${element.type}`,
  });

  const image = createSvgElement("image", {
    href: element.image,
    x: element.x - drawConfig.imageSize / 2,
    y: element.y - drawConfig.imageSize / 2,
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
  title.textContent = [
    element.raw || element.id,
    `type=${element.type}`,
    `pid=${element.pid || ""}`,
    `path=${element.path || ""}`,
    `net_in=${element.net_in || ""}`,
    `net_out=${element.net_out || ""}`,
  ].join("\n");

  g.appendChild(title);
  g.appendChild(image);

  const halfSize = drawConfig.imageSize / 2;

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


// function drawConnectionsBetweenOrderedElements(
//   wireLayer,
//   labelLayer,
//   placed
// ) {
//   for (let i = 0; i < placed.length - 1; i++) {
//     const current = placed[i];
//     const next = placed[i + 1];

//     if (
//       current.net_out &&
//       current.net_out === next.net_in
//     ) {
//       const a = current.outputPin;
//       const b = next.inputPin;

//       drawPath(
//         wireLayer,
//         a,
//         b
//       );

//       const middleY = (a.y + b.y) / 2;

//       // Center of the long horizontal wire.
//       const labelX = (a.x + b.x) / 2;
//       const labelY = middleY;

//       drawLabel(
//         labelLayer,
//         current.net_out,
//         labelX,
//         labelY,
//         {
//           size: "8.5px",
//           fill:
//             current.net_out === "GND!"
//               ? "#dc2626"
//               : "#334155",
//         }
//       );
//     }
//   }
// }


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

  // const {
  //   placed,
  //   canvasWidth,
  //   canvasHeight,
  // } = buildOrderedLayout(data.elements);

  const placed =
    buildPlacedElements(
      data,
      placedCells
    );

  prepareBiasElements(
    placed
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

  console.table(
    placed.map(
      (element, index) => ({
        index,

        id:
          element.id,

        layoutCell:
          element.parentLayoutCell,

        x:
          element.x,

        y:
          element.y,

        direction:
          element.direction,

        netIn:
          element.net_in,

        netOut:
          element.net_out,
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

  prepareBiasElements(
    placed
  );

  drawLayoutCellBoundaries(layoutCellLayer, placedCells);

  /*
  * Pass 1: complete all connections inside
  * each distinct layout-cell instance.
  */
  drawConnectionsInsideLayoutCells(
    internalWireLayer,
    labelLayer,
    placed
  );

  // /*
  // * Pass 2: connect nets that cross from one
  // * layout-cell instance into another.
  // */
  // drawConnectionsBetweenLayoutCells(
  //   externalWireLayer,
  //   labelLayer,
  //   placed
  // );

  drawBiasSupplyStubs(
    internalWireLayer,
    labelLayer,
    placed
  );

  drawSubcircuits(placed, componentLayer, internalWireLayer, labelLayer)

  setupPanZoom(svg, canvasWidth, canvasHeight);
}

function drawHangerLine(
    lineLayer,
    labelLayer,
    element, 
    a,
    b,
    options = {}
    ) {
    const rise = options.rise ?? 25;
    const margin = options.margin ?? 0;

    const topLeft = {
        x: a.x,
        y: a.y - rise,
    };

    const topRight = {
        x: b.x,
        y: a.y - rise,
    };

    // Short vertical line upward.
    drawLine(
        lineLayer,
        labelLayer,
        element,
        a,
        topLeft,
        options
    );

    // Longer horizontal line.
    drawLine(
        lineLayer,
        labelLayer,
        element,
        topLeft,
        topRight,
        options
    );

    // Short vertical line downward.
    drawLine(
        lineLayer,
        labelLayer,
        element,
        topRight,
        b,
        options
    );

    const labelX = (topLeft.x + topRight.x) / 2;
    const labelY = topLeft.y;

    drawLabel(
      labelLayer,
      options.label,
      labelX,
      labelY,
      {
        size: "8.5px",
        fill: options.labelFill || "#334155",
      }
    );


    const minX = Math.min(
      a.x,
      b.x,
      topLeft.x,
      topRight.x
    );

    const maxX = Math.max(
      a.x,
      b.x,
      topLeft.x,
      topRight.x
    );

    const minY = Math.min(
      a.y,
      b.y,
      topLeft.y,
      topRight.y
    );

    const maxY = Math.max(
      a.y,
      b.y,
      topLeft.y,
      topRight.y
    );

    return {
      left: minX - margin,
      right: maxX + margin,

      // Reserved space outside the hanger.
      top: minY - margin,
      bottom: maxY + margin,

      hangerY: topLeft.y,
      margin,
    };
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

  /*
   * Top input hanger.
   */
  drawLine(
    wireLayer,
    labelLayer,
    current,
    geometry.jjTop,
    geometry.topAtJJ
  );

  drawLine(
    wireLayer,
    labelLayer,
    current,
    geometry.topAtJJ,
    geometry.topAtResistor
  );

  drawLine(
    wireLayer,
    labelLayer,
    current,
    geometry.topAtResistor,
    geometry.resistorTop
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

  /*
   * Bottom output hanger.
   */
  drawLine(
    wireLayer,
    labelLayer,
    current,
    geometry.jjBottom,
    geometry.bottomAtJJ
  );

  drawLine(
    wireLayer,
    labelLayer,
    current,
    geometry.bottomAtJJ,
    geometry.bottomAtResistor
  );

  drawLine(
    wireLayer,
    labelLayer,
    current,
    geometry.bottomAtResistor,
    geometry.resistorBottom
  );

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

  console.table(
    window.circuitData.elements.map((element, index) => ({
      index,
      id: element.id,
      raw: element.raw,
      path: element.path,
      pid: element.pid,
      layout_cell: element.layout_cell,
      type: element.type,
      net_in: element.net_in,
      net_out: element.net_out,
      image: element.image
    }))
  );
  drawCircuit(window.circuitData);
});
