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
  const elementMap =
    createElementMap(
      data.elements || []
    );

  /*
   * Resolve and measure every cell before assigning
   * coordinates.
   */
  const measuredCells =
    (
      data.layout_cells ||
      []
    ).map(
      (layoutCell) => {
        const resolvedElements =
          resolveLayoutCellElements(
            layoutCell,
            elementMap
          );

        const measurement =
          measureLayoutCell(
            resolvedElements.length
          );

        const layoutInstance =
          layoutCell.layout_instance ||
          layoutCell.id ||
          layoutCell.layout_cell;

        return {
          id:
            layoutInstance,

          layout_instance:
            layoutInstance,

          layout_cell:
            layoutCell.layout_cell,

          instance_path:
            layoutCell.instance_path ||
            "",

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
            ...(
              layoutCell.elements ||
              []
            ),
          ],

          elements:
            resolvedElements,

          ...measurement,

          /*
           * Coordinates are assigned below.
           */
          x:
            0,

          y:
            0,
        };
      }
    );

  /*
   * Match cells whose base layout-cell name begins
   * with NDROM2.
   *
   * This matches:
   *   NDROM2
   *   NDROM2_1
   *   NDROM2-copy
   *
   * It does not use layout_instance because the
   * instances should remain distinct.
   */
  const ndromCells =
    measuredCells.filter(
      (cell) =>
        String(
          cell.layout_cell ||
          ""
        )
          .trim()
          .toUpperCase()
          .startsWith(
            "NDROM2"
          )
    );

  const otherCells =
    measuredCells.filter(
      (cell) =>
        !ndromCells.includes(
          cell
        )
    );

  /*
   * Use the requested 2-over-1 arrangement when
   * there are at least two NDROM2 instances and
   * one other layout cell.
   */
  if (
    ndromCells.length >= 2 &&
    otherCells.length >= 1
  ) {
    const leftCell =
      ndromCells[0];

    const rightCell =
      ndromCells[1];

    const bottomCell =
      otherCells[0];

    const marginX =
      drawConfig.layoutCellMarginX;

    const marginY =
      drawConfig.layoutCellMarginY;

    const gapX =
      drawConfig.layoutCellGapX;

    const gapY =
      drawConfig.layoutCellGapY;

    const topRowWidth =
      leftCell.width +
      gapX +
      rightCell.width;

    const topRowHeight =
      Math.max(
        leftCell.height,
        rightCell.height
      );

    /*
     * The overall group must be wide enough for
     * either the top row or the bottom cell.
     */
    const groupWidth =
      Math.max(
        topRowWidth,
        bottomCell.width
      );

    /*
     * Center the two-cell top row as a group.
     */
    const topRowX =
      marginX +
      (
        groupWidth -
        topRowWidth
      ) / 2;

    leftCell.x =
      topRowX;

    leftCell.y =
      marginY;

    rightCell.x =
      topRowX +
      leftCell.width +
      gapX;

    rightCell.y =
      marginY;

    /*
     * Center the third cell under the complete
     * width of the top row.
     */
    bottomCell.x =
      marginX +
      (
        groupWidth -
        bottomCell.width
      ) / 2;

    bottomCell.y =
      marginY +
      topRowHeight +
      gapY;

    const placedCells = [
      leftCell,
      rightCell,
      bottomCell,
    ];

    /*
     * Place any unexpected extra cells below the
     * requested three-cell arrangement.
     */
    const usedCells =
      new Set(
        placedCells
      );

    const extraCells =
      measuredCells.filter(
        (cell) =>
          !usedCells.has(
            cell
          )
      );

    let extraY =
      bottomCell.y +
      bottomCell.height +
      gapY;

    for (
      const extraCell of
      extraCells
    ) {
      extraCell.x =
        marginX +
        (
          groupWidth -
          extraCell.width
        ) / 2;

      extraCell.y =
        extraY;

      placedCells.push(
        extraCell
      );

      extraY +=
        extraCell.height +
        gapY;
    }

    const maximumRight =
      Math.max(
        ...placedCells.map(
          (cell) =>
            cell.x +
            cell.width
        )
      );

    const maximumBottom =
      Math.max(
        ...placedCells.map(
          (cell) =>
            cell.y +
            cell.height
        )
      );

    const canvasWidth =
      Math.max(
        900,
        maximumRight +
        marginX
      );

    const canvasHeight =
      Math.max(
        550,
        maximumBottom +
        marginY
      );

    return {
      placedCells,
      canvasWidth,
      canvasHeight,
    };
  }

  /*
   * Fallback for circuit data that does not contain
   * the expected two NDROM2 cells and one other cell.
   */
  const placedCells = [];

  let x =
    drawConfig.layoutCellMarginX;

  let y =
    drawConfig.layoutCellMarginY;

  let currentRowHeight =
    0;

  let maximumRight =
    0;

  const rowRightLimit =
    drawConfig.layoutCellMarginX +
    drawConfig.layoutCellRowWidth;

  for (
    const cell of
    measuredCells
  ) {
    const shouldStartNewRow =
      x !==
        drawConfig.layoutCellMarginX &&
      x + cell.width >
        rowRightLimit;

    if (shouldStartNewRow) {
      x =
        drawConfig.layoutCellMarginX;

      y +=
        currentRowHeight +
        drawConfig.layoutCellGapY;

      currentRowHeight =
        0;
    }

    cell.x =
      x;

    cell.y =
      y;

    placedCells.push(
      cell
    );

    maximumRight =
      Math.max(
        maximumRight,
        cell.x +
        cell.width
      );

    currentRowHeight =
      Math.max(
        currentRowHeight,
        cell.height
      );

    x +=
      cell.width +
      drawConfig.layoutCellGapX;
  }

  const canvasWidth =
    Math.max(
      900,
      maximumRight +
        drawConfig.layoutCellMarginX
    );

  const canvasHeight =
    Math.max(
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