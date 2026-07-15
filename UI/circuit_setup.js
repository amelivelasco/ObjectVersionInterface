const drawConfig = {
  imageSize: 44,

  marginX: 80,
  marginY: 70,

  gapX: 135,
  gapY: 105,

  pinOffset: 22,

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
  layoutCellElementGapY: 105,

  layoutCellMinWidth: 320,
  layoutCellMinHeight: 230,

  // Start a new row of layout cells after this width.
  layoutCellRowWidth: 1500,

    wireLaneStep: 12,
  wireClearance: 5,

  wireRouteLeftInset: 10,
  wireRouteRightInset: 10,
  wireRouteTopInset: 58,
  wireRouteBottomInset: 10,
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

function assignElementRowsAndColumns(
  elements,
  columns
) {
  return elements.map(
    (element, index) => {   // depends on the elements position in the list
      const row = Math.floor(
        index / columns
      );

      const indexInRow =
        index % columns;

      const direction = 1

      const column =
        direction === 1
          ? indexInRow
          : columns -
            1 -
            indexInRow;

      /*
       * Store the values directly on the
       * original circuit element.
       */
      element.row = row;
      element.column = column;
      element.direction = direction;

      console.log(
        `Element ${element.raw} placed in ` +
        `layout cell ${element.layout_cell}: ` +
        `row ${row}, column ${column}`
      );

      return element;
    }
  );
}


function assignElementPosition(
  element,
  index,
  columns
) {
  const row = Math.floor(
    index / columns
  );

  const indexInRow =
    index % columns;

  const direction = 1;

  const column =
    direction === 1
      ? indexInRow
      : columns - 1 - indexInRow;

  element.row = row;
  element.column = column;
  element.direction = direction;

  console.log(
    `Element ${element.raw} placed in ` +
    `layout cell ${element.layout_cell}: ` +
    `row ${row}, column ${column}`
  );

  return element;
}

function orthogonalPath(a, b) {
  const middleY = (a.y + b.y) / 2;

  return [
    `M ${a.x} ${a.y}`,
    `V ${middleY}`,
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



function isElementPlaced(element) {
  return (
    Number.isInteger(element.row) &&
    Number.isInteger(element.column)
  );
}

function getPositionKey(row, column) {
  return `${row}:${column}`;
}

function isInsideGrid(
  row,
  column,
  rows,
  columns
) {
  return (
    row >= 0 &&
    row < rows &&
    column >= 0 &&
    column < columns
  );
}

function isPositionFree(
  occupied,
  row,
  column,
  rows,
  columns
) {
  return (
    isInsideGrid(
      row,
      column,
      rows,
      columns
    ) &&
    !occupied.has(
      getPositionKey(row, column)
    )
  );
}

function assignPosition(
  element,
  row,
  column,
  occupied
) {
  element.row = row;
  element.column = column;
  element.direction = 1;

  occupied.add(
    getPositionKey(row, column)
  );

  console.log(
    `${element.raw} placed at ` +
    `row ${row}, column ${column}`
  );
}



function setElementsPositions(
  resolvedElements,
  rows,
  columns
) {
  const occupied = new Set();
  const connections = [];
  const connectionKeys = new Set();

  function saveConnection(
    current,
    target,
    net
  ) {
    const key =
      `${current.id}->${target.id}:${net}`;

    if (connectionKeys.has(key)) {
      return;
    }

    connectionKeys.add(key);

    connections.push({
      from: current.id,
      to: target.id,
      net,
    });
  }

  for (
    let i = 0;
    i < resolvedElements.length;
    i++
  ) {
    const current =
      resolvedElements[i];

    /*
     * Position current if it has not already
     * been positioned by another connection.
     */
    if (!isElementPlaced(current)) {
      const fallback =
        findAnyFreeSpot(
          occupied,
          rows,
          columns
        );

      if (!fallback) {
        console.error(
          `No position available for ${current.raw}`
        );

        continue;
      }

      assignPosition(
        current,
        fallback.row,
        fallback.column,
        occupied
      );
    }

    const next =
      resolvedElements[i + 1];

    let connectedElements = [];

    /*
     * First use the next ordered element
     * when current.net_out matches next.net_in.
     */
    if (
      next &&
      current.net_out &&
      current.net_out === next.net_in
    ) {
      connectedElements = [next];
    } else {
      /*
       * Otherwise search this layout cell
       * for connected branches/leaves.
       */
      connectedElements =
        findLeafConnections(
          current,
          resolvedElements
        );
    }

    for (
      const connected of
      connectedElements
    ) {
      saveConnection(
        current,
        connected,
        current.net_out
      );

      /*
       * Do not move an element that another
       * connection has already positioned.
       */
      if (isElementPlaced(connected)) {
        continue;
      }

      let position =
        findFirstFreeSpot(
          current,
          occupied,
          rows,
          columns
        );

      /*
       * If all four neighboring positions
       * are occupied, use another free cell.
       */
      if (!position) {
        position =
          findAnyFreeSpot(
            occupied,
            rows,
            columns
          );
      }

      if (!position) {
        console.error(
          `No position available for ${connected.raw}`
        );

        continue;
      }

      assignPosition(
        connected,
        position.row,
        position.column,
        occupied
      );
    }
  }

  console.table(
    resolvedElements.map(
      (element) => ({
        element: element.raw,
        layoutCell:
          element.layout_cell,
        row: element.row,
        column: element.column,
        netIn: element.net_in,
        netOut: element.net_out,
      })
    )
  );

  console.table(connections);

  return {
    elements: resolvedElements,
    connections,
  };
}

function setElementPosition(elements, currentElement, columns) {
  return elements.map(
    (element, index) => {   // depends on the elements position in the list
      if (element.raw != currentElement.raw) {return }
      const row = Math.floor(
        index / columns
      );

      const indexInRow =
        index % columns;

      const direction =
        row % 2 === 0
          ? 1
          : -1;

      const column =
        direction === 1
          ? indexInRow
          : columns -
            1 -
            indexInRow;

      /*
       * Store the values directly on the
       * original circuit element.
       */
      currentElement.row = row;
      currentElement.column = column;
      currentElement.direction = direction;

      console.log(
        `Element ${currentElement.raw} placed in ` +
        `layout cell ${currentElement.layout_cell}: ` +
        `row ${row}, column ${column}`
      );
    }
  );
}

function findFirstFreeSpot(
  current,
  occupied,
  rows,
  columns
) {
  const candidates = [
    // Prefer the right side.
    {
      row: current.row,
      column: current.column + 1,
    },

        // Finally left.
    {
      row: current.row,
      column: current.column - 1,
    },

    // Then above.
    {
      row: current.row - 1,
      column: current.column,
    },

    // Then below.
    {
      row: current.row + 1,
      column: current.column,
    },
  ];

  for (const candidate of candidates) {
    if (
      isPositionFree(
        occupied,
        candidate.row,
        candidate.column,
        rows,
        columns
      )
    ) {
      return candidate;
    }
  }

  return null;
}

function checkOccupancy(currentElem, candidateElemRow, candidateElemColumn, elements) {
  for (let elem of elements) {
    if (candidateElemColumn == elem.column && candidateElemRow == elem.row) {
      return false
    }
  }
  return true
}

function findLeafConnections(current, resolvedElements) {
  if (
    !current.net_out ||
    current.net_out === "GND!" ||
    current.net_out === "VDD"
  ) {
    return [];
  }

  return resolvedElements.filter(
    (element) => {
      if (element === current) {
        return false;
      }

      return (
        element.net_in ===
          current.net_out ||
        element.net_out ===
          current.net_out
      );
    }
  );
}


function findAnyFreeSpot(
  occupied,
  rows,
  columns
) {
  for (
    let row = 0;
    row < rows;
    row++
  ) {
    for (
      let column = 0;
      column < columns;
      column++
    ) {
      if (
        isPositionFree(
          occupied,
          row,
          column,
          rows,
          columns
        )
      ) {
        return {
          row,
          column,
        };
      }
    }
  }

  return null;
}

