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

  console.log("")

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
  console.log(
    "NEW buildLayoutCellLayout VERSION IS RUNNING"
  );
  const elementMap =
    createElementMap(
      data.elements || []
    );

  const placedCells = [];

  let x =
    drawConfig.layoutCellMarginX;

  let y =
    drawConfig.layoutCellMarginY;

  let currentRowHeight = 0;
  let maximumRight = 0;

  /*
   * These track the row and column of
   * each large layout-cell rectangle.
   */
  let layoutCellRow = 0;
  let layoutCellColumn = 0;

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

    /*
     * Assign row and column to every
     * element inside this layout cell.
     */
    // const positionedElements =
    //   assignElementRowsAndColumns(
    //     resolvedElements,
    //     measurement.columns
    //   );

    // const positionedElements = setElementsPositions(data, resolvedElements, measurement.columns)

    const placement =
      setElementsPositions(
        resolvedElements,
        measurement.rows,
        measurement.columns
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

      layoutCellRow++;
      layoutCellColumn = 0;
    }

    const placedCell = {
      id:
        layoutCell.id ||
        layoutCell.layout_cell,

      layout_cell:
        layoutCell.layout_cell,

      net_in:
        layoutCell.net_in,

      net_out:
        layoutCell.net_out,

      elementIds: [
        ...(layoutCell.elements || []),
      ],

      elements:
        placement.elements,

      connections:
        placement.connections,

      /*
       * Position of the large layout-cell
       * rectangle in the overall canvas.
       */
      layoutCellRow,
      layoutCellColumn,

      x,
      y,

      /*
       * Adds:
       * columns,
       * rows,
       * contentWidth,
       * contentHeight,
       * width,
       * height.
       */
      ...measurement,
    };

    placedCells.push(
      placedCell
    );

    console.log(
      `Layout cell ${placedCell.layout_cell} ` +
      `placed at layout row ${layoutCellRow}, ` +
      `layout column ${layoutCellColumn}`
    );

    console.table(
      placedCell.elements.map(
        (element) => ({
          id:
            element.id,

          raw:
            element.raw,

          layoutCell:
            placedCell.layout_cell,

          row:
            element.row,

          column:
            element.column,

          direction:
            element.direction === 1
              ? "left-to-right"
              : "right-to-left",
        })
      )
    );

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

    layoutCellColumn++;
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
  const contentStartX =
    cell.x +
    (
      cell.width -
      cell.contentWidth
    ) / 2;

  const contentStartY =
    cell.y +
    drawConfig.layoutCellPaddingTop;

  return cell.elements.map(
    (element) => {
      const row =
        element.row;

      const column =
        element.column;

      const direction =
        element.direction ?? 1;

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

      element.x = x;
      element.y = y;

      element.inputPin = {
        x:
          x -
          direction *
            drawConfig.pinOffset,

        y,
        net:
          element.net_in,
      };

      element.outputPin = {
        x:
          x +
          direction *
            drawConfig.pinOffset,

        y,
        net:
          element.net_out,
      };

      element.parentLayoutCell =
        cell.layout_cell;

      return element;
    }
  );
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
      cell.layout_cell;

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


