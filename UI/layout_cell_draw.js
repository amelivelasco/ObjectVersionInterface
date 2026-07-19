function createElementMap(elements) {
  const elementMap = new Map();

  for (const element of elements) {
    if (element.id) {
      elementMap.set(element.id, element);
    }

    if (element.raw) {
      elementMap.set(element.raw, element);
    }
  }

  return elementMap;
}

function resolveLayoutCellElements(
  layoutCell,
  elementMap
) {
  const resolvedElements = [];
  const missingElements = [];

  for (
    const elementId of
    layoutCell.elements || []
  ) {
    const element =
      elementMap.get(elementId);

    if (element) {
      resolvedElements.push(element);
    } else {
      missingElements.push(elementId);
    }
  }

  if (missingElements.length > 0) {
    console.warn(
      `Elements missing from layout cell "${layoutCell.layout_cell}":`,
      missingElements
    );
  }

  return resolvedElements;
}

function measureLayoutCell(elementCount) {
  const safeCount = Math.max(
    1,
    elementCount
  );

  const columns = Math.max(
    1,
    Math.ceil(
      Math.sqrt(safeCount * 1.5)
    )
  );

  const rows = Math.max(
    1,
    Math.ceil(
      safeCount / columns
    )
  );

  const contentWidth =
    drawConfig.imageSize +
    Math.max(0, columns - 1) *
      drawConfig.layoutCellElementGapX;

  const contentHeight =
    drawConfig.imageSize +
    Math.max(0, rows - 1) *
      drawConfig.layoutCellElementGapY;

  const width = Math.max(
    drawConfig.layoutCellMinWidth,
    drawConfig.layoutCellPaddingX * 2 +
      contentWidth
  );

  const height = Math.max(
    drawConfig.layoutCellMinHeight,
    drawConfig.layoutCellPaddingTop +
      contentHeight +
      drawConfig.layoutCellPaddingBottom
  );

  return {
    columns,
    rows,
    contentWidth,
    contentHeight,
    width,
    height,
  };
}
 
function buildLayoutCellLayout(data) {
  const elementMap = createElementMap(
    data.elements || []
  );

  const placedCells = [];

  let x =
    drawConfig.layoutCellMarginX;

  let y =
    drawConfig.layoutCellMarginY;

  let currentRowHeight = 0;
  let maximumRight = 0;

  const rowRightLimit =
    drawConfig.layoutCellMarginX +
    drawConfig.layoutCellRowWidth;

  for (
    const layoutCell of
    data.layout_cells || []
  ) {
    const resolvedElements =
      resolveLayoutCellElements(
        layoutCell,
        elementMap
      );

    const measurement =
      measureLayoutCell(
        resolvedElements.length
      );

    const shouldStartNewRow =
      x !==
        drawConfig.layoutCellMarginX &&
      x + measurement.width >
        rowRightLimit;

    if (shouldStartNewRow) {
      x =
        drawConfig.layoutCellMarginX;

      y +=
        currentRowHeight +
        drawConfig.layoutCellGapY;

      currentRowHeight = 0;
    }

    const layoutInstance =
      layoutCell.layout_instance ||
      layoutCell.id ||
      layoutCell.layout_cell;

    const placedCell = {
      id: layoutInstance,

      layout_instance:
        layoutInstance,

      layout_cell:
        layoutCell.layout_cell,

      instance_path:
        layoutCell.instance_path || "",

      display_name:
        layoutCell.display_name ||
        (
          layoutCell.instance_path
            ? `${layoutCell.layout_cell} (${layoutCell.instance_path})`
            : layoutCell.layout_cell
        ),

      net_in:
        layoutCell.net_in,

      net_out:
        layoutCell.net_out,

      elementIds: [
        ...(layoutCell.elements || []),
      ],

      elements:
        resolvedElements,

      x,
      y,

      ...measurement,
    };

    placedCells.push(placedCell);

    maximumRight = Math.max(
      maximumRight,
      x + measurement.width
    );

    currentRowHeight = Math.max(
      currentRowHeight,
      measurement.height
    );

    x +=
      measurement.width +
      drawConfig.layoutCellGapX;
  }

  const canvasWidth = Math.max(
    900,
    maximumRight +
      drawConfig.layoutCellMarginX
  );

  const canvasHeight = Math.max(
    550,
    y +
      currentRowHeight +
      drawConfig.layoutCellMarginY
  );

  return {
    placedCells,
    canvasWidth,
    canvasHeight,
  };
}


function placeElementsInsideLayoutCell(
  cell
) {
  const orderedElements =
    optimizeElementOrderByConnectivity(
      cell.elements,
      cell.columns
    );

  const contentStartX =
    cell.x +
    (
      cell.width -
      cell.contentWidth
    ) / 2;

  const contentStartY =
    cell.y +
    drawConfig.layoutCellPaddingTop;

    const placed =
      orderedElements.map(
      (element, index) => {
        const row = Math.floor(
          index / cell.columns
        );

        const indexInRow =
          index % cell.columns;

        const direction =
          row % 2 === 0
            ? 1
            : -1;

        const column =
          direction === 1
            ? indexInRow
            : cell.columns -
              1 -
              indexInRow;

        const x =
          contentStartX +
          drawConfig.imageSize / 2 +
          column *
            drawConfig.layoutCellElementGapX;

        const y =
          contentStartY +
          drawConfig.imageSize / 2 +
          row *
            drawConfig.layoutCellElementGapY;

        const pinOffset =
          getPinOffsetForElement(element);

        const isInductor =
          getElementType(element) === "L";

        /*
        * Inductors must keep a fixed electrical orientation:
        * net_in on the left side, net_out on the right side.
        *
        * Other components may still follow the snake row direction.
        */
        const inputPin = {
          x:
            isInductor
              ? x - pinOffset
              : x - direction * pinOffset,

          y,
          net: element.net_in,
        };

        const outputPin = {
          x:
            isInductor
              ? x + pinOffset
              : x + direction * pinOffset,

          y,
          net: element.net_out,
        };
      return {
        ...element,

        x,
        y,

        row,
        col: column,
        direction,

        layoutOrder: index,

        inputPin,
        outputPin,

        parentLayoutCell:
          cell.layout_instance ||
          cell.id,

        parentLayoutCellType:
          cell.layout_cell,

        instancePath:
          cell.instance_path,
      };
    }
  );

  /*
 * orientation = 1:
 *   input is left, output is right.
 *
 * orientation = -1:
 *   input is right, output is left.
 */
const requiredOrientation =
  new Map();

function requireOrientation(
  element,
  orientation,
  sharedNet
) {
  const existing =
    requiredOrientation.get(
      element
    );

  /*
   * A middle inductor may be checked against
   * both its left and right neighbors.
   */
  if (
    existing &&
    existing.orientation !==
      orientation
  ) {
    console.warn(
      `Conflicting inductor orientation for ${element.id}`,
      {
        firstNet:
          existing.sharedNet,

        secondNet:
          sharedNet,
      }
    );

    return;
  }

  requiredOrientation.set(
    element,
    {
      orientation,
      sharedNet,
    }
  );
}

/*
 * Inspect physically adjacent inductors,
 * rather than relying on their order in the
 * snake traversal.
 */
for (
  let firstIndex = 0;
  firstIndex < placed.length;
  firstIndex++
) {
  const first =
    placed[firstIndex];

  if (
    getElementType(first) !== "L"
  ) {
    continue;
  }

  for (
    let secondIndex =
      firstIndex + 1;
    secondIndex <
      placed.length;
    secondIndex++
  ) {
    const second =
      placed[secondIndex];

    if (
      getElementType(second) !== "L"
    ) {
      continue;
    }

    const sameRow =
      first.row === second.row;

    const neighboringColumns =
      Math.abs(
        first.col -
        second.col
      ) === 1;

    if (
      !sameRow ||
      !neighboringColumns
    ) {
      continue;
    }

    const left =
      first.x < second.x
        ? first
        : second;

    const right =
      first.x < second.x
        ? second
        : first;

    /*
     * Prefer an output-to-input connection,
     * because that is the normal serial
     * inductor relationship.
     */
    let sharedNet = null;

    if (
      left.net_out &&
      left.net_out ===
        right.net_in
    ) {
      sharedNet =
        left.net_out;
    } else if (
      left.net_in &&
      left.net_in ===
        right.net_out
    ) {
      sharedNet =
        left.net_in;
    } else {
      sharedNet =
        [
          left.net_in,
          left.net_out,
        ].find(
          (net) =>
            net &&
            (
              net === right.net_in ||
              net === right.net_out
            )
        ) || null;
    }

    if (!sharedNet) {
      continue;
    }

    const leftSharedTerminal =
      left.net_in === sharedNet
        ? "input"
        : "output";

    const rightSharedTerminal =
      right.net_in === sharedNet
        ? "input"
        : "output";

    /*
     * The left inductor's shared terminal
     * must face right.
     */
    requireOrientation(
      left,

      leftSharedTerminal === "input"
        ? -1
        : 1,

      sharedNet
    );

    /*
     * The right inductor's shared terminal
     * must face left.
     */
    requireOrientation(
      right,

      rightSharedTerminal === "input"
        ? 1
        : -1,

      sharedNet
    );
  }
}

/*
 * Apply only the required inductor flips.
 * All other elements and the snake positions
 * remain unchanged.
 */
for (const element of placed) {
  if (
    getElementType(element) !== "L"
  ) {
    continue;
  }

  const requirement =
    requiredOrientation.get(
      element
    );

    /*
    * Default orientation remains:
    * input left, output right.
    */
    const electricalDirection =
      requirement?.orientation ??
      1;

    const pinOffset =
      getPinOffsetForElement(
        element
      );

    element.inputPin = {
      x:
        element.x -
        electricalDirection *
          pinOffset,

      y:
        element.y,

      net:
        element.net_in,
    };

    element.outputPin = {
      x:
        element.x +
        electricalDirection *
          pinOffset,

      y:
        element.y,

      net:
        element.net_out,
    };

    /*
    * Preserve the snake direction separately.
    * This value represents only the inductor's
    * electrical orientation.
    */
    element.electricalDirection =
      electricalDirection;
  }

  return placed;
}


function buildPlacedElements(
  data,
  placedCells
) {
  const positionById = new Map();

  for (const cell of placedCells) {
    const cellElements =
      placeElementsInsideLayoutCell(
        cell
      );

    for (
      const element of
      cellElements
    ) {
      positionById.set(
        element.id,
        element
      );

      if (element.raw) {
        positionById.set(
          element.raw,
          element
        );
      }
    }
  }

  const placed = [];

  for (
    const originalElement of
    data.elements || []
  ) {
    const positionedElement =
      positionById.get(
        originalElement.id
      ) ||
      positionById.get(
        originalElement.raw
      );

    if (!positionedElement) {
      console.warn(
        "Element was not assigned to a layout cell:",
        originalElement
      );

      continue;
    }

    placed.push(
      positionedElement
    );
  }

  return placed;
}

function drawLayoutCellBoundaries(
  layer,
  placedCells
) {
  for (
    const cell of placedCells
  ) {
    const group = createSvgElement(
      "g",
      {
        class: "layout-cell",

        "data-layout-cell":
          cell.layout_cell,

        "data-layout-instance":
          cell.layout_instance ||
          cell.id,

        "data-instance-path":
          cell.instance_path || "",
      }
    );

    const rectangle =
      createSvgElement(
        "rect",
        {
          x: cell.x,
          y: cell.y,

          width: cell.width,
          height: cell.height,

          rx: 16,
          ry: 16,

          fill: "#f8fafc",
          "fill-opacity": "0.7",

          stroke: "#64748b",
          "stroke-width": 2,

          "stroke-dasharray":
            "10 6",

          class:
            "layout-cell-boundary",
        }
      );

    const title =
      createSvgElement(
        "text",
        {
          x: cell.x + 18,
          y: cell.y + 27,

          "font-family":
            drawConfig.fontFamily,

          "font-size": "16px",
          "font-weight": "700",

          fill: "#0f172a",

          class:
            "layout-cell-title",

          "pointer-events":
            "none",
        }
      );

    title.textContent =
      cell.display_name ||
      (
        cell.instance_path
          ? `${cell.layout_cell} (${cell.instance_path})`
          : cell.layout_cell
      );

    const details =
      createSvgElement(
        "text",
        {
          x: cell.x + 18,
          y: cell.y + 48,

          "font-family":
            drawConfig.fontFamily,

          "font-size": "11px",

          fill: "#475569",

          class:
            "layout-cell-details",

          "pointer-events":
            "none",
        }
      );

    details.textContent =
      `${cell.net_in ?? "none"} → ` +
      `${cell.net_out ?? "none"} | ` +
      `${cell.elements.length} elements`;

    group.appendChild(
      rectangle
    );

    group.appendChild(
      title
    );

    group.appendChild(
      details
    );

    layer.appendChild(group);
  }
}