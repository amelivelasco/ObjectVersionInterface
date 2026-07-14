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

function drawLine(layer, a, b, options = {}) {
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

  layer.appendChild(line);
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

function drawLabel(layer, text, x, y, options = {}) {
  if (!text) {
    return;
  }

  const label = createSvgElement("text", {
    x,
    y,
    "text-anchor": options.anchor || "middle",
    "font-family": drawConfig.fontFamily,
    "font-size": options.size || "9px",
    fill: options.fill || "#334155",
  });

  label.textContent = text;
  layer.appendChild(label);
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

  if (element.direction === -1) {
    image.setAttribute(
      "transform",
      `rotate(180 ${element.x} ${element.y})`
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

  layer.appendChild(g);
}


function drawConnectionsBetweenOrderedElements(wireLayer, placed) {
  for (let i = 0; i < placed.length - 1; i++) {
    const current = placed[i];
    const next = placed[i + 1];

    if (current.net_out && current.net_out === next.net_in) {
      drawPath(wireLayer, current.outputPin, next.inputPin);
    }
  }
}

function drawCircuit(data) {
  const board = document.getElementById("drawing_board");
  board.innerHTML = "";

  if (!data || !Array.isArray(data.elements)) {
    board.textContent =
      "Circuit data is missing. Generate circuit_data.js first.";
    return;
  }

  console.table(
    data.elements.map((element, index) => ({
      index,
      path: element.path,
      type: element.type,
      net_in: element.net_in,
      net_out: element.net_out,
    }))
  );

  const {
    placed,
    canvasWidth,
    canvasHeight,
  } = buildOrderedLayout(data.elements);

  const svg = createSvg(canvasWidth, canvasHeight);
  board.appendChild(svg);

  const wireLayer = createSvgElement("g", { class: "wire-layer" });
  const dotLayer = createSvgElement("g", { class: "dot-layer" });
  const componentLayer = createSvgElement("g", { class: "component-layer" });
  const labelLayer = createSvgElement("g", { class: "label-layer" });

  svg.appendChild(wireLayer);
  svg.appendChild(dotLayer);
  svg.appendChild(componentLayer);
  svg.appendChild(labelLayer);

  drawConnectionsBetweenOrderedElements(wireLayer, placed);

  placed.forEach((element) => {
    drawComponent(componentLayer, element);
  });

  setupPanZoom(svg, canvasWidth, canvasHeight);
}

function drawHangerLine(
    layer,
    a,
    b,
    options = {}
    ) {
    const rise = options.rise ?? 25;

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
        layer,
        a,
        topLeft,
        options
    );

    // Longer horizontal line.
    drawLine(
        layer,
        topLeft,
        topRight,
        options
    );

    // Short vertical line downward.
    drawLine(
        layer,
        topRight,
        b,
        options
    );
}

function makeJJSubcircuit(componentLayer, element, wireLayer) {
    if (element.type === "JJ") {
        drawComponent(componentLayer, element)
        drawHangerLine()
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
      image: element.image,
    }))
  );

  console.log(
    [...document.scripts]
      .map((script) => script.src)
      .filter((src) => src.includes("circuit_data"))
  );

  console.log("First loaded element:", window.circuitData?.elements?.[0]);

  drawCircuit(window.circuitData);
});
