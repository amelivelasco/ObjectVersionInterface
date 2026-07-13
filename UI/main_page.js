const drawConfig = {
  imageSize: 44,

  marginX: 80,
  marginY: 70,

  gapX: 135,
  gapY: 105,

  pinOffset: 48,

  wireStroke: "#475569",
  wireStrokeWidth: 2,

  nodeRadius: 4,
  groundRadius: 6,

  nodeFill: "#ffffff",
  nodeStroke: "#1f2937",

  groundFill: "#dc2626",
  groundStroke: "#7f1d1d",

  fontFamily: "Arial, sans-serif",
};

function createSvg(width, height) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");

  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", "100%");
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

  svg.classList.add("circuit-svg");

  return svg;
}

function createSvgElement(name, attrs = {}) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", name);

  Object.entries(attrs).forEach(([key, value]) => {
    el.setAttribute(key, value);
  });

  return el;
}

function estimateColumns(elementCount) {
  if (elementCount <= 0) {
    return 1;
  }

  return Math.ceil(Math.sqrt(elementCount * 1.8));
}

function buildOrderedLayout(elements) {
  const count = elements.length;
  const columns = estimateColumns(count);
  const rows = Math.ceil(count / columns);

  const canvasWidth =
    drawConfig.marginX * 2 +
    Math.max(0, columns - 1) * drawConfig.gapX;

  const canvasHeight =
    drawConfig.marginY * 2 +
    Math.max(0, rows - 1) * drawConfig.gapY;

  const placed = elements.map((element, index) => {
    const row = Math.floor(index / columns);
    const indexInRow = index % columns;

    /*
     * Even rows run left-to-right.
     * Odd rows run right-to-left.
     */
    const direction =
      row % 2 === 0 ? 1 : -1;

    const col =
      direction === 1
        ? indexInRow
        : columns - 1 - indexInRow;

    const x =
      drawConfig.marginX +
      col * drawConfig.gapX;

    const y =
      drawConfig.marginY +
      row * drawConfig.gapY;

    const inputPin = {
      x:
        x -
        direction * drawConfig.pinOffset,
      y,
      net: element.net_in,
    };

    const outputPin = {
      x:
        x +
        direction * drawConfig.pinOffset,
      y,
      net: element.net_out,
    };

    return {
      ...element,
      index,
      x,
      y,
      row,
      col,
      direction,
      inputPin,
      outputPin,
    };
  });

  console.table(
    placed.map((element) => ({
      index: element.index,
      path: element.path,
      row: element.row,
      visualColumn: element.col,
      direction:
        element.direction === 1
          ? "left-to-right"
          : "right-to-left",
      x: element.x,
      y: element.y,
    }))
  );

  return {
    placed,
    canvasWidth: Math.max(
      900,
      canvasWidth
    ),
    canvasHeight: Math.max(
      550,
      canvasHeight
    ),
  };
}

function orthogonalPath(a, b) {
  const dx = Math.abs(b.x - a.x);
  const dy = Math.abs(b.y - a.y);

  if (dx >= dy) {
    const midX = (a.x + b.x) / 2;
    return `M ${a.x} ${a.y} L ${midX} ${a.y} L ${midX} ${b.y} L ${b.x} ${b.y}`;
  }

  const midY = (a.y + b.y) / 2;
  return `M ${a.x} ${a.y} L ${a.x} ${midY} L ${b.x} ${midY} L ${b.x} ${b.y}`;
}

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

// function drawElementLocalWires(wireLayer, dotLayer, labelLayer, element) {
//   const imageInputEdge = {
//     x: element.x - element.direction * (drawConfig.imageSize / 2),
//     y: element.y,
//   };

//   const imageOutputEdge = {
//     x: element.x + element.direction * (drawConfig.imageSize / 2),
//     y: element.y,
//   };

//   drawLine(wireLayer, element.inputPin, imageInputEdge);

//   if (element.net_out === "GND!") {
//     drawLine(wireLayer, element.outputPin, imageInputEdge);
//   } else {
//       drawLine(wireLayer, imageOutputEdge, element.outputPin);
//   }

//   drawLabel(
//     labelLayer,
//     element.net_in,
//     element.inputPin.x,
//     element.inputPin.y - 10,
//     {
//       size: "8.5px",
//     }
//   );

//   drawLabel(
//     labelLayer,
//     element.net_out,
//     element.outputPin.x,
//     element.outputPin.y + 16,
//     {
//       size: "8.5px",
//       fill: element.net_out === "GND!" ? "#dc2626" : "#334155",
//     }
//   );
// }


function drawConnectionsBetweenOrderedElements(wireLayer, placed) {
  for (let i = 0; i < placed.length - 1; i++) {
    const current = placed[i];
    const next = placed[i + 1];

    if (current.net_out && current.net_out === next.net_in) {
      drawPath(wireLayer, current.outputPin, next.inputPin);
    }
  }
}

function setupPanZoom(svg, fullWidth, fullHeight) {
  let viewBox = {
    x: 0,
    y: 0,
    width: fullWidth,
    height: fullHeight,
  };

  let isPanning = false;
  let start = null;

  function applyViewBox() {
    svg.setAttribute(
      "viewBox",
      `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`
    );
  }

  function clientToSvgPoint(event) {
    const rect = svg.getBoundingClientRect();

    const x =
      viewBox.x +
      ((event.clientX - rect.left) / rect.width) * viewBox.width;

    const y =
      viewBox.y +
      ((event.clientY - rect.top) / rect.height) * viewBox.height;

    return { x, y };
  }

  svg.addEventListener("wheel", (event) => {
    event.preventDefault();

    const point = clientToSvgPoint(event);
    const zoomFactor = event.deltaY < 0 ? 0.88 : 1.14;

    const newWidth = viewBox.width * zoomFactor;
    const newHeight = viewBox.height * zoomFactor;

    viewBox.x = point.x - ((point.x - viewBox.x) / viewBox.width) * newWidth;
    viewBox.y = point.y - ((point.y - viewBox.y) / viewBox.height) * newHeight;
    viewBox.width = newWidth;
    viewBox.height = newHeight;

    applyViewBox();
  });

  svg.addEventListener("mousedown", (event) => {
    isPanning = true;
    svg.classList.add("is-panning");

    start = {
      clientX: event.clientX,
      clientY: event.clientY,
      viewBoxX: viewBox.x,
      viewBoxY: viewBox.y,
    };
  });

  window.addEventListener("mousemove", (event) => {
    if (!isPanning || !start) {
      return;
    }

    const rect = svg.getBoundingClientRect();

    const dx =
      ((event.clientX - start.clientX) / rect.width) * viewBox.width;

    const dy =
      ((event.clientY - start.clientY) / rect.height) * viewBox.height;

    viewBox.x = start.viewBoxX - dx;
    viewBox.y = start.viewBoxY - dy;

    applyViewBox();
  });

  window.addEventListener("mouseup", () => {
    isPanning = false;
    svg.classList.remove("is-panning");
    start = null;
  });

  svg.addEventListener("dblclick", () => {
    viewBox = {
      x: 0,
      y: 0,
      width: fullWidth,
      height: fullHeight,
    };

    applyViewBox();
  });

  applyViewBox();
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