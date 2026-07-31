function createElementMap(elements) {
  const elementMap = new Map();

  for (const element of elements) {
    if (element.id) {elementMap.set(element.id, element);}
    if (element.raw) {elementMap.set(element.raw, element);}
  }
  return elementMap;
}

function resolveLayoutCellElements(layoutCell, elementMap) {
  const resolvedElements = [];
  const missingElements = [];

  for (const elementId of layoutCell.elements || []) {
    const element = elementMap.get(elementId);

    if (element) { resolvedElements.push(element); } 
    else { missingElements.push(elementId); }
  }

  if (missingElements.length > 0) {
    console.warn(
      `Elements missing from layout cell "${layoutCell.layout_cell}":`, missingElements
    );
  }
  return resolvedElements;
}

function measureLayoutCell(elements) {
  const sequentialPlan = buildSequentialTerminalPlan(elements);
  const contentWidth = drawConfig.imageSize + sequentialPlan.rightTerminalColumn * drawConfig.layoutCellElementGapX;
  const contentHeight = drawConfig.imageSize + Math.max(0, sequentialPlan.rows - 1) * drawConfig.layoutCellElementGapY;
  const width = Math.max(drawConfig.layoutCellMinWidth, drawConfig.layoutCellPaddingX * 2 + contentWidth);
  const height = Math.max(drawConfig.layoutCellMinHeight, drawConfig.layoutCellPaddingTop + contentHeight + drawConfig.layoutCellPaddingBottom);

  return {
    sequentialPlan,
    columns: sequentialPlan.columns,
    rows: sequentialPlan.rows,
    contentWidth,
    contentHeight,
    width,
    height,
  };
}

function buildLayoutCellLayout(data) {
  const elementMap = createElementMap(data.elements || []);

  const measuredCells = (data.layout_cells || []).map((layoutCell) => {
    const resolvedElements = resolveLayoutCellElements(
      layoutCell,
      elementMap
    );

    const measurement = measureLayoutCell(resolvedElements);

    const layoutInstance =
      layoutCell.layout_instance ||
      layoutCell.id ||
      layoutCell.layout_cell;

    return {
      id: layoutInstance,
      layout_instance: layoutInstance,
      layout_cell: layoutCell.layout_cell,
      instance_path: layoutCell.instance_path || "",
      display_name:
        layoutCell.display_name ||
        (layoutCell.instance_path
          ? `${layoutCell.layout_cell} (${layoutCell.instance_path})`
          : layoutCell.layout_cell),
      net_in: layoutCell.net_in,
      net_out: layoutCell.net_out,
      elementIds: [...(layoutCell.elements || [])],
      elements: resolvedElements,
      ...measurement,
      x: 0,
      y: 0,
    };
  });

  const marginX = drawConfig.layoutCellMarginX;
  const marginY = drawConfig.layoutCellMarginY;
  const gapX = drawConfig.layoutCellGapX;
  const gapY = drawConfig.layoutCellGapY;

  /*
   * Converts names such as:
   *
   * "NDROM (i1)" -> "NDROM"
   * "NDROM (I2)" -> "NDROM"
   * "NDROM2   (instance_3)" -> "NDROM2"
   *
   * Comparison is case-insensitive.
   */
  function getCellNameFamily(cell) {
    return String(cell.display_name || cell.layout_cell || "")
      .replace(/\s*\([^()]*\)\s*$/, "")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase();
  }

  const cellsByFamily = new Map();

  for (const cell of measuredCells) {
    const family = getCellNameFamily(cell);

    if (!cellsByFamily.has(family)) {
      cellsByFamily.set(family, []);
    }

    cellsByFamily.get(family).push(cell);
  }

  const rows = [];
  const remainingCells = [];

  /*
   * First, create rows from cells with matching base names.
   *
   * Example:
   * NDROM (i1) and NDROM (I2) are guaranteed to share a row.
   *
   * If four matching instances exist, they become two rows.
   */
  for (const familyCells of cellsByFamily.values()) {
    let index = 0;

    while (index + 1 < familyCells.length) {
      rows.push([
        familyCells[index],
        familyCells[index + 1],
      ]);

      index += 2;
    }

    if (index < familyCells.length) {
      remainingCells.push(familyCells[index]);
    }
  }

  /*
   * Place unmatched cells two by two after the matching-name pairs.
   */
  for (let index = 0; index < remainingCells.length; index += 2) {
    rows.push(remainingCells.slice(index, index + 2));
  }

  const rowMeasurements = rows.map((rowCells) => {
    const width =
      rowCells.reduce(
        (totalWidth, cell) => totalWidth + cell.width,
        0
      ) +
      Math.max(0, rowCells.length - 1) * gapX;

    const height = Math.max(
      ...rowCells.map((cell) => cell.height),
      0
    );

    return {
      cells: rowCells,
      width,
      height,
    };
  });

  const groupWidth = Math.max(
    ...rowMeasurements.map((row) => row.width),
    0
  );

  const placedCells = [];
  let currentY = marginY;

  for (const row of rowMeasurements) {
    let currentX =
      marginX +
      (groupWidth - row.width) / 2;

    for (const cell of row.cells) {
      cell.x = currentX;
      cell.y = currentY;

      placedCells.push(cell);

      currentX += cell.width + gapX;
    }

    currentY += row.height + gapY;
  }

  const maximumRight = placedCells.length
    ? Math.max(
        ...placedCells.map((cell) => cell.x + cell.width)
      )
    : marginX;

  const maximumBottom = placedCells.length
    ? Math.max(
        ...placedCells.map((cell) => cell.y + cell.height)
      )
    : marginY;

  const canvasWidth = Math.max(
    900,
    maximumRight + marginX
  );

  const canvasHeight = Math.max(
    550,
    maximumBottom + marginY
  );

  return {
    placedCells,
    canvasWidth,
    canvasHeight,
  };
}


function placeElementsInsideLayoutCell(cell) {
  const plan = buildSequentialTerminalPlan(cell.elements);
  const halfSize = drawConfig.imageSize / 2;
  const contentWidth = drawConfig.imageSize + Math.max(0, plan.columns - 1) * drawConfig.layoutCellElementGapX;
  const contentStartX = cell.x + (cell.width - contentWidth) / 2;
  const contentStartY = cell.y + drawConfig.layoutCellPaddingTop;

  function getX(column) {
    return contentStartX + halfSize + column * drawConfig.layoutCellElementGapX;
  }

  function getY(row) {
    return contentStartY + halfSize + row * drawConfig.layoutCellElementGapY;
  }

  function getJRMembers(block) {
    const jj = block.elements.find((element) => getElementType(element) === "JJ");
    const resistor = block.elements.find((element) => getElementType(element) === "R");

    if (!jj || !resistor || !isJJResistorPair(jj, resistor)) { return null; }
    return { jj, resistor };
  }

  const orderedPlacements = [...plan.placements.values()].sort(
    (first, second) =>
      first.row - second.row ||
      first.col - second.col ||
      (first.block.originalIndex ?? Infinity) - (second.block.originalIndex ?? Infinity)
  );

  const placed = [];
  let layoutOrder = 0;

  for (const placement of orderedPlacements) {
    const jrMembers = getJRMembers(placement.block);
    const hostWireY = getY(placement.row);

    for (let memberIndex = 0; memberIndex < placement.block.elements.length; memberIndex++) {
      const element = placement.block.elements[memberIndex];
      const componentType = getElementType(element);

      let x;
      let y;

      if (placement.placementMode === "inline-grounded-jr" && jrMembers) {
        const pairCenterX = getX(placement.centerCol);
        const pairSpacing = placement.pairSpacing ?? 70;
        const rise = placement.rise ?? 25;

        y = hostWireY + halfSize + rise;
        x = componentType === "JJ" ? pairCenterX - pairSpacing / 2 : pairCenterX + pairSpacing / 2;
      } else if (placement.placementMode === "inline-jr-bias") {
        x = getX(placement.centerCol);
        y = hostWireY - halfSize - drawConfig.biasOutputGap;
      } else if (jrMembers) {
        const pairCenterColumn = placement.col + (Math.max(1, placement.span) - 1) / 2;
        const pairCenterX = getX(pairCenterColumn);
        const pairSpacing = 70;

        x = componentType === "JJ" ? pairCenterX - pairSpacing / 2 : pairCenterX + pairSpacing / 2;
        y = getY(placement.row);
      } else {
        x = getX(placement.col + memberIndex);
        y = getY(placement.row);
      }

      const direction = 1;
      const pinOffset = getPinOffsetForElement(element);
      const isInductor = componentType === "L";

      const inputPin = {
        x: isInductor ? x - pinOffset : x - direction * pinOffset,
        y,
        net: element.net_in,
      };

      const outputPin = {
        x: isInductor ? x + pinOffset : x + direction * pinOffset,
        y,
        net: element.net_out,
      };

      const positionedElement = {
        ...element,
        x,
        y,
        row: placement.row,
        col: placement.centerCol ?? placement.col + memberIndex,
        direction,
        layoutOrder: layoutOrder++,
        inputPin,
        outputPin,
        placementMode: placement.placementMode || null,
        parentLayoutCell: cell.layout_instance || cell.id,
        parentLayoutCellType: cell.layout_cell,
        instancePath: cell.instance_path,
      };

      if (placement.placementMode === "inline-grounded-jr") {
        positionedElement.inlineGroundedJR = true;
        positionedElement.inlineJRHostNet = placement.hostNet;
        positionedElement.inlineJRHostProducerId = placement.hostProducerId;
        positionedElement.inlineJRHostConsumerId = placement.hostConsumerId;
      }

      if (placement.placementMode === "inline-jr-bias") {
        positionedElement.inlineJRBias = true;
        positionedElement.biasRotation = 0;
        positionedElement.biasPlacementLocked = true;
        positionedElement.biasSnappedToNet = true;
        positionedElement.biasNetSegment = null;
        positionedElement.biasFrontPin = { x, y: y + halfSize };
        positionedElement.biasNetJoin = { x, y: hostWireY };
        positionedElement.outputPin = { x, y: hostWireY, net: positionedElement.net_out };
        positionedElement.biasTarget = placement.hostJRId;
      }

      placed.push(positionedElement);
    }
  }

  const requiredOrientation = new Map();

  function requireOrientation(element, orientation, sharedNet) {
    const existing = requiredOrientation.get(element);

    if (existing && existing.orientation !== orientation) {
      console.warn(`Conflicting inductor orientation for ${element.id}`, {
        firstNet: existing.sharedNet,
        secondNet: sharedNet,
      });

      return;
    }

    requiredOrientation.set(element, { orientation, sharedNet });
  }

  for (let firstIndex = 0; firstIndex < placed.length; firstIndex++) {
    const first = placed[firstIndex];
    if (getElementType(first) !== "L") { continue; }

    for (let secondIndex = firstIndex + 1; secondIndex < placed.length; secondIndex++) {
      const second = placed[secondIndex];
      if (getElementType(second) !== "L") { continue; }

      const sameRow = first.row === second.row;
      const neighboringColumns = Math.abs(first.col - second.col) === 1;

      if (!sameRow || !neighboringColumns) { continue; }

      const left = first.x < second.x ? first : second;
      const right = first.x < second.x ? second : first;

      let sharedNet = null;

      if (left.net_out && left.net_out === right.net_in) {
        sharedNet = left.net_out;
      } else if (left.net_in && left.net_in === right.net_out) {
        sharedNet = left.net_in;
      } else {
        sharedNet = [left.net_in, left.net_out].find(
          (net) => net && (net === right.net_in || net === right.net_out)
        ) || null;
      }

      if (!sharedNet) { continue; }

      const leftSharedTerminal = left.net_in === sharedNet ? "input" : "output";
      const rightSharedTerminal = right.net_in === sharedNet ? "input" : "output";

      requireOrientation(left, leftSharedTerminal === "input" ? -1 : 1, sharedNet);
      requireOrientation(right, rightSharedTerminal === "input" ? 1 : -1, sharedNet);
    }
  }

  for (const element of placed) {
    if (getElementType(element) !== "L") { continue; }

    const requirement = requiredOrientation.get(element);
    const electricalDirection = requirement?.orientation ?? 1;
    const pinOffset = getPinOffsetForElement(element);

    element.inputPin = {
      x: element.x - electricalDirection * pinOffset,
      y: element.y,
      net: element.net_in,
    };

    element.outputPin = {
      x: element.x + electricalDirection * pinOffset,
      y: element.y,
      net: element.net_out,
    };

    element.electricalDirection = electricalDirection;
  }

  return placed;
}

function buildPlacedElements(data, placedCells) {
  const positionById = new Map();

  for (const cell of placedCells) {
    const cellElements = placeElementsInsideLayoutCell(cell);

    for (const element of cellElements) {
      positionById.set(element.id, element);
      if (element.raw) { positionById.set(element.raw, element);}
    }
  }

  const placed = [];

  for (const originalElement of data.elements || []) {
    const positionedElement = positionById.get(originalElement.id) || positionById.get(originalElement.raw);

    if (!positionedElement) {
      console.warn(
        "Element was not assigned to a layout cell:",
        originalElement
      );
      continue;
    }

    placed.push(positionedElement);
  }

  return placed;
}

function drawLayoutCellBoundaries(layer, placedCells) {
  for (const cell of placedCells) {
    const group = createSvgElement("g",
      {
        class: "layout-cell",
        "data-layout-cell": cell.layout_cell,
        "data-layout-instance": cell.layout_instance || cell.id,
        "data-instance-path": cell.instance_path || "",
      }
    );

    const boundaryPadding = 25;

    const rectangle =
      createSvgElement(
        "rect",
        {
          x: cell.x - boundaryPadding,
          y: cell.y - boundaryPadding,
          width: cell.width + boundaryPadding * 2,
          height: cell.height + boundaryPadding * 2,
          rx: 16,
          ry: 16,
          fill: "#f8fafc",
          "fill-opacity": "0.7",
          stroke: "#64748b",
          "stroke-width": 2,
          "stroke-dasharray": "10 6",
          class: "layout-cell-boundary",
        }
      );

    const title =
      createSvgElement(
        "text",
        {
          x: cell.x + cell.width / 2,
          y: cell.y + 20,
          "font-family": drawConfig.fontFamily,
          "font-size": "16px",
          "font-weight": "700",
          fill: "#0f172a",
          "text-anchor": "middle",
          class: "layout-cell-title",
          "pointer-events": "none",
        }
      );

    title.textContent = cell.display_name || ( cell.instance_path ? `${cell.layout_cell} (${cell.instance_path})` : cell.layout_cell );

    group.appendChild(rectangle);
    group.appendChild(title);
    layer.appendChild(group);
  }
}