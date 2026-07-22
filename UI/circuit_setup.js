const drawConfig = {
  imageSize: 44,

  marginX: 80,
  marginY: 70,

  gapX: 135,
  gapY: 105,

  pinOffset: 22,
  inductorPinOffset: 15,

  wireStroke: "#475569",
  wireStrokeWidth: 2,

  nodeRadius: 4,
  groundRadius: 6,

  nodeFill: "#ffffff",
  nodeStroke: "#1f2937",

  groundFill: "#dc2626",
  groundStroke: "#7f1d1d",

  fontFamily: "Arial, sans-serif",
  
  // Layout-cell configuration
  layoutCellMarginX: 70,
  layoutCellMarginY: 70,

  layoutCellGapX: 70,
  layoutCellGapY: 70,

  layoutCellPaddingX: 45,
  layoutCellPaddingTop: 75,
  layoutCellPaddingBottom: 40,

  layoutCellElementGapX: 105,
  layoutCellElementGapY: 115,

  layoutCellMinWidth: 320,
  layoutCellMinHeight: 230,

  // Start a new row of layout cells after this width.
  layoutCellRowWidth: 1500,


  biasBranchOffset: 45,
  biasOutputGap: 12,
  biasPlacementSpacing: 55,

  componentValueFontSize: "9px",
  inductorValueOffsetY: 9,

  jrValueFontSize: "10px",
  jrValueOffsetY: 0,
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
  const middleY = (a.y + b.y) / 2;

  return [
    `M ${a.x} ${a.y}`,
    `H ${b.x}`,
    `V ${b.y}`,
  ].join(" ");
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


