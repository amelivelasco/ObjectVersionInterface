const drawConfig = {
  imageSize: 44,

  marginX: 90,
  marginY: 80,

  gapX: 145,
  gapY: 115,

  pinOffset: 50,

  maxCols: 10,

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

const IGNORED_NETS_FOR_GROUPING = new Set(["GND!", "VDD"]);

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

function elementType(element) {
  return String(element.type || "").toUpperCase();
}

function getGroup(element) {
  const path = String(element.path || "");

  if (path.includes("/")) {
    return path.split("/", 1)[0];
  }

  return "TOP";
}

function usefulNets(element) {
  return [element.net_in, element.net_out].filter((net) => {
    return net && !IGNORED_NETS_FOR_GROUPING.has(net);
  });
}

function sharesUsefulNet(a, b) {
  const aNets = new Set(usefulNets(a));
  return usefulNets(b).some((net) => aNets.has(net));
}

function imageForType(type) {
  if (type === "L") {
    return "../img/ind_draw.png";
  }

  if (type === "JJ") {
    return "../img/jj_draw.png";
  }

  if (type === "IB") {
    return "../img/biais_draw.png";
  }

  return "";
}

function typeFromRawAndPid(raw, pid) {
  if (String(raw).startsWith("LI") || String(pid).startsWith("L")) {
    return "L";
  }

  if (String(raw).startsWith("Xsj") || String(pid).startsWith("J")) {
    return "JJ";
  }

  if (String(raw).startsWith("Xpc") || String(pid).startsWith("IB")) {
    return "IB";
  }

  return "UNKNOWN";
}

function parseOrderedElementLine(line, order) {
  const pattern =
    /^CircuitComponent\(raw=(.*?), path=(.*?), pid=(.*?), layout_cell=(.*?), net_in=(.*?), net_out=(.*?)\)$/;

  const match = line.trim().match(pattern);

  if (!match) {
    return null;
  }

  const raw = match[1].trim();
  const path = match[2].trim();
  const pid = match[3].trim();
  const layoutCell = match[4].trim();
  const netIn = match[5].trim();
  const netOut = match[6].trim();

  const type = typeFromRawAndPid(raw, pid);

  return {
    order,
    id: raw,
    raw,
    path,
    pid,
    layout_cell: layoutCell,
    net_in: netIn,
    net_out: netOut,
    type,
    image: imageForType(type),
  };
}

async function loadOrderedElements() {
  const response = await fetch("../ordered_elems.txt");

  if (!response.ok) {
    throw new Error("Could not load ordered_elems.txt. Make sure the file is at the same level as main.py and one folder above UI/main_page.html.");
  }

  const text = await response.text();

  return text
    .split(/\r?\n/)
    .map((line, index) => parseOrderedElementLine(line, index))
    .filter(Boolean);
}


function parseOrderedElementLine(line, order) {
  const pattern =
    /^CircuitComponent\(raw=(.*?), path=(.*?), pid=(.*?), layout_cell=(.*?), net_in=(.*?), net_out=(.*?)\)$/;

  const match = line.trim().match(pattern);

  if (!match) {
    return null;
  }

  const raw = match[1].trim();
  const path = match[2].trim();
  const pid = match[3].trim();
  const layoutCell = match[4].trim();
  const netIn = match[5].trim();
  const netOut = match[6].trim();

  const type = typeFromRawAndPid(raw, pid);

  return {
    order,
    id: raw,
    raw,
    path,
    pid,
    layout_cell: layoutCell,
    net_in: netIn,
    net_out: netOut,
    type,
    image: imageForType(type),
  };
}

async function loadOrderedElements() {
  const response = await fetch("../ordered_elems.txt");

  if (!response.ok) {
    throw new Error("Could not load ordered_elems.txt. Make sure the file is at the same level as main.py and one folder above UI/main_page.html.");
  }

  const text = await response.text();

  return text
    .split(/\r?\n/)
    .map((line, index) => parseOrderedElementLine(line, index))
    .filter(Boolean);
}

async function loadOrderedElementsFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      try {
        const text = String(reader.result || "");
        const elements = text
          .split(/\r?\n/)
          .map((line, index) => parseOrderedElementLine(line, index))
          .filter(Boolean);

        resolve(elements);
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = () => {
      reject(new Error("Could not read the selected ordered_elems.txt file."));
    };

    reader.readAsText(file);
  });
}

function angleDegFromVector(dx, dy) {
  return Math.atan2(dy, dx) * 180 / Math.PI;
}

function setPinsAlongVector(element, ux, uy) {
  element.inputPin = {
    x: element.x - ux * drawConfig.pinOffset,
    y: element.y - uy * drawConfig.pinOffset,
    net: element.net_in,
  };

  element.outputPin = {
    x: element.x + ux * drawConfig.pinOffset,
    y: element.y + uy * drawConfig.pinOffset,
    net: element.net_out,
  };

  element.inputEdge = {
    x: element.x - ux * drawConfig.imageSize / 2,
    y: element.y - uy * drawConfig.imageSize / 2,
  };

  element.outputEdge = {
    x: element.x + ux * drawConfig.imageSize / 2,
    y: element.y + uy * drawConfig.imageSize / 2,
  };
}

function updateGroundPin(element) {
  if (element.net_in === "GND!" || element.net_out === "GND!") {
    element.groundPin = {
      x: element.x,
      y: element.y + drawConfig.pinOffset,
      net: "GND!",
    };
  } else {
    element.groundPin = null;
  }
}

function setElementVector(element, ux, uy) {
  setPinsAlongVector(element, ux, uy);

  const angle = angleDegFromVector(ux, uy);

  if (elementType(element) === "IB") {
    // Bias image naturally points downward.
    // Downward is 90deg, so rotate from 90deg to the desired vector.
    element.rotationDeg = angle - 90;
  } else {
    element.rotationDeg = angle;
  }

  updateGroundPin(element);
}

function cellKey(row, col) {
  return `${row}:${col}`;
}

function cellToPoint(row, col) {
  return {
    x: drawConfig.marginX + col * drawConfig.gapX,
    y: drawConfig.marginY + row * drawConfig.gapY,
  };
}

function isValidCell(row, col) {
  return row >= 0 && col >= 0 && col < drawConfig.maxCols;
}

function occupyCell(occupied, row, col) {
  occupied.add(cellKey(row, col));
}

function isCellFree(occupied, row, col) {
  return isValidCell(row, col) && !occupied.has(cellKey(row, col));
}

function placeAtCell(element, row, col, ux = 1, uy = 0) {
  const point = cellToPoint(row, col);

  element.gridRow = row;
  element.gridCol = col;
  element.x = point.x;
  element.y = point.y;

  setElementVector(element, ux, uy);
}

function renderOrderedElemsFilePicker(board, message) {
  board.innerHTML = "";

  const prompt = document.createElement("div");
  prompt.style.marginBottom = "16px";
  prompt.textContent =
    message ||
    "This page is running from file://, so the browser cannot fetch ordered_elems.txt automatically. Please select the file manually.";

  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".txt";
  input.style.display = "block";
  input.style.marginBottom = "12px";

  const hint = document.createElement("div");
  hint.style.fontSize = "0.9rem";
  hint.style.color = "#334155";
  hint.textContent =
    "Select the generated ordered_elems.txt file from the parent folder of UI.";

  input.addEventListener("change", async () => {
    const file = input.files && input.files[0];
    if (!file) {
      return;
    }

    board.textContent = `Loading ${file.name}...`;

    try {
      const elements = await loadOrderedElementsFromFile(file);
      drawCircuitFromOrderedElements(elements);
    } catch (error) {
      board.textContent = `Failed to load selected file: ${error.message}`;
    }
  });

  board.appendChild(prompt);
  board.appendChild(input);
  board.appendChild(hint);
}

function candidateCellsAround(anchor, element) {
  const anchorRow = anchor.gridRow;
  const anchorCol = anchor.gridCol;

  const anchorDirection = anchor.direction || 1;

  const sameNet = sharesUsefulNet(anchor, element);

  const biasToJJ =
    elementType(element) === "IB" &&
    elementType(anchor) === "JJ" &&
    element.net_out === anchor.net_in;

  const jjToBias =
    elementType(element) === "JJ" &&
    elementType(anchor) === "IB" &&
    anchor.net_out === element.net_in;

  if (biasToJJ) {
    return [
      { row: anchorRow - 1, col: anchorCol, ux: 0, uy: 1 },
      { row: anchorRow, col: anchorCol - 1, ux: 1, uy: 0 },
      { row: anchorRow, col: anchorCol + 1, ux: -1, uy: 0 },
      { row: anchorRow + 1, col: anchorCol, ux: 0, uy: -1 },
    ];
  }

  if (jjToBias) {
    return [
      { row: anchorRow + 1, col: anchorCol, ux: 0, uy: -1 },
      { row: anchorRow, col: anchorCol + 1, ux: -1, uy: 0 },
      { row: anchorRow, col: anchorCol - 1, ux: 1, uy: 0 },
      { row: anchorRow - 1, col: anchorCol, ux: 0, uy: 1 },
    ];
  }

  if (sameNet) {
    return [
      { row: anchorRow, col: anchorCol + anchorDirection, ux: anchorDirection, uy: 0 },
      { row: anchorRow + 1, col: anchorCol, ux: 0, uy: 1 },
      { row: anchorRow - 1, col: anchorCol, ux: 0, uy: -1 },
      { row: anchorRow, col: anchorCol - anchorDirection, ux: -anchorDirection, uy: 0 },
    ];
  }

  return [
    { row: anchorRow, col: anchorCol + anchorDirection, ux: anchorDirection, uy: 0 },
    { row: anchorRow + 1, col: anchorCol, ux: 0, uy: 1 },
    { row: anchorRow, col: anchorCol - anchorDirection, ux: -anchorDirection, uy: 0 },
    { row: anchorRow - 1, col: anchorCol, ux: 0, uy: -1 },
  ];
}

function findFreeCellNearAnchor(anchor, element, occupied) {
  const firstChoices = candidateCellsAround(anchor, element);

  for (const choice of firstChoices) {
    if (isCellFree(occupied, choice.row, choice.col)) {
      return choice;
    }
  }

  for (let radius = 2; radius <= 8; radius++) {
    const candidates = [
      { row: anchor.gridRow, col: anchor.gridCol + radius, ux: 1, uy: 0 },
      { row: anchor.gridRow + radius, col: anchor.gridCol, ux: 0, uy: 1 },
      { row: anchor.gridRow, col: anchor.gridCol - radius, ux: -1, uy: 0 },
      { row: anchor.gridRow - radius, col: anchor.gridCol, ux: 0, uy: -1 },
    ];

    for (const candidate of candidates) {
      if (isCellFree(occupied, candidate.row, candidate.col)) {
        return candidate;
      }
    }
  }

  return null;
}

function snakeCell(index) {
  const row = Math.floor(index / drawConfig.maxCols);
  const indexInRow = index % drawConfig.maxCols;
  const direction = row % 2 === 0 ? 1 : -1;

  const col =
    direction === 1
      ? indexInRow
      : drawConfig.maxCols - 1 - indexInRow;

  return {
    row,
    col,
    ux: direction,
    uy: 0,
    direction,
  };
}

function findNextSnakeCell(occupied, startIndex) {
  let index = startIndex;

  while (index < startIndex + 1000) {
    const candidate = snakeCell(index);

    if (isCellFree(occupied, candidate.row, candidate.col)) {
      return candidate;
    }

    index++;
  }

  return snakeCell(startIndex);
}


function scoreAnchorForElement(anchor, element, previous) {
  let score = 0;

  if (previous && anchor === previous) {
    score += 20;
  }

  if (
    previous &&
    anchor === previous &&
    previous.net_out &&
    previous.net_out === element.net_in &&
    !IGNORED_NETS_FOR_GROUPING.has(previous.net_out)
  ) {
    score += 2000;
  }

  if (
    anchor.net_out &&
    anchor.net_out === element.net_in &&
    !IGNORED_NETS_FOR_GROUPING.has(anchor.net_out)
  ) {
    score += 1200;
  }

  if (
    anchor.net_in &&
    anchor.net_in === element.net_out &&
    !IGNORED_NETS_FOR_GROUPING.has(anchor.net_in)
  ) {
    score += 900;
  }

  if (sharesUsefulNet(anchor, element)) {
    score += 600;
  }

  if (getGroup(anchor) === getGroup(element)) {
    score += 80;
  }

  if (
    elementType(anchor) === "IB" &&
    elementType(element) === "JJ" &&
    anchor.net_out === element.net_in
  ) {
    score += 1800;
  }

  if (
    elementType(anchor) === "JJ" &&
    elementType(element) === "IB" &&
    element.net_out === anchor.net_in
  ) {
    score += 1800;
  }

  score -= Math.abs(anchor.index - element.index) * 0.01;

  return score;
}

function findBestAnchor(element, placed, previous) {
  let bestAnchor = null;
  let bestScore = 0;

  placed.forEach((anchor) => {
    const score = scoreAnchorForElement(anchor, element, previous);

    if (score > bestScore) {
      bestScore = score;
      bestAnchor = anchor;
    }
  });

  return bestAnchor;
}


function buildProgressiveLayout(elements) {
  const orderedElements = [...elements].sort((a, b) => {
    return (a.order ?? 0) - (b.order ?? 0);
  });

  const placed = [];
  const occupied = new Set();

  let fallbackIndex = 0;

  orderedElements.forEach((element, index) => {
    const placedElement = {
      ...element,
      index,
      direction: 1,
      rotationDeg: 0,
      inputPin: null,
      outputPin: null,
      inputEdge: null,
      outputEdge: null,
      groundPin: null,
    };

    const previous = placed.length > 0 ? placed[placed.length - 1] : null;
    const anchor = findBestAnchor(placedElement, placed, previous);

    let targetCell = null;

    if (anchor) {
      targetCell = findFreeCellNearAnchor(anchor, placedElement, occupied);
    }

    if (!targetCell) {
      targetCell = findNextSnakeCell(occupied, fallbackIndex);
    }

    placeAtCell(
      placedElement,
      targetCell.row,
      targetCell.col,
      targetCell.ux,
      targetCell.uy
    );

    placedElement.direction = targetCell.ux === 0 ? 1 : targetCell.ux;

    occupyCell(occupied, targetCell.row, targetCell.col);
    placed.push(placedElement);

    fallbackIndex++;
  });

  const maxX = Math.max(
    ...placed.map((element) => element.x + drawConfig.pinOffset + drawConfig.imageSize)
  );

  const maxY = Math.max(
    ...placed.map((element) => element.y + drawConfig.pinOffset + drawConfig.imageSize)
  );

  return {
    placed,
    canvasWidth: Math.max(900, maxX + drawConfig.marginX),
    canvasHeight: Math.max(550, maxY + drawConfig.marginY),
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
    "font-size": options.size || "8px",
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

  if (element.rotationDeg) {
    image.setAttribute(
      "transform",
      `rotate(${element.rotationDeg} ${element.x} ${element.y})`
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

function drawElementLocalWires(wireLayer, dotLayer, labelLayer, element) {
  drawLine(wireLayer, element.inputPin, element.inputEdge);
  drawLine(wireLayer, element.outputEdge, element.outputPin);

  drawDot(dotLayer, element.inputPin);

  if (element.net_out === "GND!") {
    drawDot(dotLayer, element.outputPin, {
      radius: drawConfig.groundRadius,
      fill: drawConfig.groundFill,
      stroke: drawConfig.groundStroke,
    });
  } else {
    drawDot(dotLayer, element.outputPin);
  }

  drawLabel(labelLayer, element.net_in, element.inputPin.x, element.inputPin.y - 10);
  drawLabel(
    labelLayer,
    element.net_out,
    element.outputPin.x,
    element.outputPin.y + 16,
    {
      fill: element.net_out === "GND!" ? "#dc2626" : "#334155",
    }
  );
}

function drawNetConnections(wireLayer, dotLayer, labelLayer, placed) {
  const pinsByNet = new Map();

  function addPin(net, pin, element) {
    if (!net || net === "GND!" || net === "VDD") {
      return;
    }

    if (!pinsByNet.has(net)) {
      pinsByNet.set(net, []);
    }

    pinsByNet.get(net).push({
      x: pin.x,
      y: pin.y,
      net,
      element,
    });
  }

  placed.forEach((element) => {
    addPin(element.net_in, element.inputPin, element);
    addPin(element.net_out, element.outputPin, element);
  });

  pinsByNet.forEach((pins, net) => {
    if (pins.length < 2) {
      return;
    }

    const hub = {
      x: pins.reduce((sum, pin) => sum + pin.x, 0) / pins.length,
      y: pins.reduce((sum, pin) => sum + pin.y, 0) / pins.length,
    };

    pins.forEach((pin) => {
      drawPath(wireLayer, pin, hub, {
        stroke: "#2563eb",
        strokeWidth: 1.7,
      });
    });

    drawDot(dotLayer, hub, {
      radius: 4.5,
      fill: "#dbeafe",
      stroke: "#1d4ed8",
    });

    drawLabel(labelLayer, net, hub.x + 8, hub.y - 8, {
      anchor: "start",
      size: "7.5px",
      fill: "#1d4ed8",
    });
  });
}

function setupPanZoom(svg, fullWidth, fullHeight) {
  let viewBox = {
    x: 0,
    y: 0,
    width: fullWidth,
    height: fullHeight,
  };

  let isPanning = false;
  let lastPoint = null;

  function applyViewBox() {
    svg.setAttribute(
      "viewBox",
      `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`
    );
  }

  function getSvgPoint(event) {
    const point = svg.createSVGPoint();

    point.x = event.clientX;
    point.y = event.clientY;

    return point.matrixTransform(svg.getScreenCTM().inverse());
  }

  svg.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();

      const mousePoint = getSvgPoint(event);

      const zoomFactor = event.deltaY < 0 ? 0.9 : 1.1;

      const newWidth = viewBox.width * zoomFactor;
      const newHeight = viewBox.height * zoomFactor;

      viewBox.x =
        mousePoint.x - ((mousePoint.x - viewBox.x) / viewBox.width) * newWidth;

      viewBox.y =
        mousePoint.y - ((mousePoint.y - viewBox.y) / viewBox.height) * newHeight;

      viewBox.width = newWidth;
      viewBox.height = newHeight;

      applyViewBox();
    },
    { passive: false }
  );

  svg.addEventListener("pointerdown", (event) => {
    event.preventDefault();

    isPanning = true;
    lastPoint = getSvgPoint(event);

    svg.setPointerCapture(event.pointerId);
    svg.classList.add("is-panning");
  });

  svg.addEventListener("pointermove", (event) => {
    if (!isPanning || !lastPoint) {
      return;
    }

    event.preventDefault();

    const currentPoint = getSvgPoint(event);

    const dx = currentPoint.x - lastPoint.x;
    const dy = currentPoint.y - lastPoint.y;

    viewBox.x -= dx;
    viewBox.y -= dy;

    applyViewBox();
  });

  svg.addEventListener("pointerup", (event) => {
    isPanning = false;
    lastPoint = null;

    svg.releasePointerCapture(event.pointerId);
    svg.classList.remove("is-panning");
  });

  svg.addEventListener("pointercancel", () => {
    isPanning = false;
    lastPoint = null;
    svg.classList.remove("is-panning");
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

function drawCircuitFromOrderedElements(elements) {
  const board = document.getElementById("drawing_board");
  board.innerHTML = "";

  const { placed, canvasWidth, canvasHeight } = buildProgressiveLayout(elements);

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

  placed.forEach((element) => {
    drawElementLocalWires(wireLayer, dotLayer, labelLayer, element);
  });

  drawNetConnections(wireLayer, dotLayer, labelLayer, placed);

  placed.forEach((element) => {
    drawComponent(componentLayer, element);
  });

  setupPanZoom(svg, canvasWidth, canvasHeight);
}

window.addEventListener("DOMContentLoaded", async () => {
  const board = document.getElementById("drawing_board");

  try {
    const elements = await loadOrderedElements();

    if (elements.length === 0) {
      board.textContent = "ordered_elems was loaded, but no CircuitComponent lines were parsed.";
      return;
    }

    drawCircuitFromOrderedElements(elements);
  } catch (error) {
    console.error(error);

    if (window.location.protocol === "file:") {
      renderOrderedElemsFilePicker(
        board,
        "Could not fetch ordered_elems.txt from the file:// page. Please select the file manually."
      );
      return;
    }

    board.textContent =
      "Could not load ordered_elems. If you opened the HTML with file://, use a local server instead.";
  }
});