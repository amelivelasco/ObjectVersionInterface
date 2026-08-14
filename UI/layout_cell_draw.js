function createElementMap(elements) {
  const elementMap = new Map();

  for (const element of elements) {
    if (element.id) {elementMap.set(element.id, element);}
    if (element.raw) {elementMap.set(element.raw, element);}
  }
  return elementMap;
}

function resolveLayoutCellElements(layoutCell, elementMap) {
  const resolved = [];
  const missing = [];

  for (const id of layoutCell.elements || []) {
    const element = elementMap.get(id);

    if (element) resolved.push(element);
    else missing.push(id);
  }

  if (missing.length) {
    console.warn(`Elements missing from "${layoutCell.layout_instance || layoutCell.layout_cell}":`, missing);
  }

  return resolved;
}

function measureLayoutCell(elements) {
  const layout = getLocalCellLayout(elements), padding = drawConfig.layoutCellPadding;

  return {
    sequentialPlan: layout.plan,
    localLayout: layout,
    columns: layout.plan.columns,
    rows: layout.plan.rows,
    contentWidth: layout.width,
    contentHeight: layout.height,
    width: layout.width + padding * 2,
    height: layout.height + padding * 2,
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

  alignClosestSharedTerminalRows(placedCells);

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
  const layout = cell.localLayout || getLocalCellLayout(cell.elements);
  const half = drawConfig.imageSize / 2;
  const padding = drawConfig.layoutCellPadding;

  const offsetX = cell.x + padding - layout.minX;
  const offsetY = cell.y + padding - layout.anchorMinY;

  const placed = [];
  let layoutOrder = 0;

  for (const item of layout.local) {
    const { element, placement, memberIndex, type } = item;

    const x = item.x + offsetX;
    const y = item.y + offsetY;

    const rowFlipped180 = placement.rowFlipped180 === true;
    const direction = rowFlipped180 ? -1 : 1;
    const pinOffset = getPinOffsetForElement(element);
    const isInductor = type === "L";

    const positionedElement = {
      ...element,
      x,
      y,
      row: placement.row,
      col: placement.centerCol ?? placement.col + memberIndex,
      direction,
      layoutOrder: layoutOrder++,

      inputPin: {
        x: isInductor
          ? x - pinOffset
          : x - direction * pinOffset,
        y,
        net: element.net_in
      },

      outputPin: {
        x: isInductor
          ? x + pinOffset
          : x + direction * pinOffset,
        y,
        net: element.net_out
      },

      placementMode: placement.placementMode || null,
      parentLayoutCell: cell.layout_instance || cell.id,
      parentLayoutCellType: cell.layout_cell,
      instancePath: cell.instance_path,

      /*
       * Crucial:
       * this flag exists ONLY on the selected row.
       */
      rowFlipped180
    };

    if (placement.placementMode === "inline-grounded-jr") {
      positionedElement.inlineGroundedJR = true;
      positionedElement.inlineJRHostNet = placement.hostNet;
      positionedElement.inlineJRHostProducerId = placement.hostProducerId;
      positionedElement.inlineJRHostConsumerId = placement.hostConsumerId;
    }

    if (placement.placementMode === "inline-jr-bias") {
      const hostWireY =
        placement.row *
        drawConfig.layoutCellElementGapY +
        offsetY;

      positionedElement.inlineJRBias = true;
      positionedElement.biasRotation = 0;
      positionedElement.biasPlacementLocked = true;
      positionedElement.biasSnappedToNet = true;
      positionedElement.biasNetSegment = null;
      positionedElement.biasFrontPin = {
        x,
        y: y + half
      };
      positionedElement.biasNetJoin = {
        x,
        y: hostWireY
      };
      positionedElement.outputPin = {
        x,
        y: hostWireY,
        net: positionedElement.net_out
      };
      positionedElement.biasTarget = placement.hostJRId;
    }

    placed.push(positionedElement);
  }

  /*
   * Inductor direction correction.
   *
   * NORMAL ROW:
   * preserve your ORIGINAL behavior.
   *
   * FLIPPED ROW:
   * inspect the nearest element to the RIGHT instead of LEFT,
   * because the complete row has been horizontally mirrored.
   *
   * This prevents any untouched row from changing orientation.
   */
  for (let i = 0; i < placed.length; i++) {
    const element = placed[i];

    if (getElementType(element) !== "L")
      continue;

    const pinOffset = getPinOffsetForElement(element);

    /*
     * ---------------------------------------------------------
     * NORMAL ROW — ORIGINAL LOGIC
     * ---------------------------------------------------------
     */
    if (!element.rowFlipped180) {
      const previous = placed
        .filter(candidate =>
          candidate !== element &&
          candidate.row === element.row &&
          candidate.x < element.x
        )
        .sort((a, b) => b.x - a.x)[0] || null;

      const reversed = Boolean(
        previous &&
        element.net_out &&
        previous.net_out === element.net_out
      );

      const direction = reversed ? -1 : 1;

      element.direction = direction;

      element.inputPin = {
        x: element.x - direction * pinOffset,
        y: element.y,
        net: element.net_in
      };

      element.outputPin = {
        x: element.x + direction * pinOffset,
        y: element.y,
        net: element.net_out
      };

      element.electricalDirection = direction;
      element.layoutReversed = reversed;

      continue;
    }

    /*
     * ---------------------------------------------------------
     * 180-FLIPPED ROW ONLY
     * ---------------------------------------------------------
     *
     * Before mirroring:
     *
     * previous ---> L
     *
     * After mirroring, that same previous element is now
     * physically to the RIGHT:
     *
     * L <--- previous
     *
     * Therefore use nearest-right instead of nearest-left
     * to reconstruct the original relation.
     */
    const originalPrevious = placed
      .filter(candidate =>
        candidate !== element &&
        candidate.row === element.row &&
        candidate.x > element.x
      )
      .sort((a, b) => a.x - b.x)[0] || null;

    const originallyReversed = Boolean(
      originalPrevious &&
      element.net_out &&
      originalPrevious.net_out === element.net_out
    );

    /*
     * Direction this inductor would have had before
     * the complete row was mirrored.
     */
    const originalDirection =
      originallyReversed ? -1 : 1;

    /*
     * The row itself is now reversed, therefore flip
     * that direction.
     */
    const direction = -originalDirection;

    element.direction = direction;

    element.inputPin = {
      x: element.x - direction * pinOffset,
      y: element.y,
      net: element.net_in
    };

    element.outputPin = {
      x: element.x + direction * pinOffset,
      y: element.y,
      net: element.net_out
    };

    element.electricalDirection = direction;
    element.layoutReversed = direction < 0;
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
  if (!placedCells.length) return;
  const boundaryPadding = 25, topMargin = 100, topName = String(window.circuitData?.name || "TOP").trim() || "TOP";
  const minX = Math.min(...placedCells.map(cell => cell.x)) - topMargin, minY = Math.min(...placedCells.map(cell => cell.y)) - topMargin;
  const maxX = Math.max(...placedCells.map(cell => cell.x + cell.width)) + topMargin, maxY = Math.max(...placedCells.map(cell => cell.y + cell.height)) + topMargin;

  function drawBoundary(cell, x, y, width, height, titleText, isTopCell) {
    const group = createSvgElement("g", { class: "layout-cell", "data-layout-cell": cell.layout_cell, "data-layout-instance": cell.layout_instance || cell.id, "data-instance-path": cell.instance_path || "" });
    const rectangle = createSvgElement("rect", { x: x - boundaryPadding, y: y - boundaryPadding + 20, width: width + boundaryPadding * 2, height: height + boundaryPadding * 2, rx: 16, ry: 16, fill: "#f8fafc", "fill-opacity": isTopCell ? "0.25" : "0.7", stroke: isTopCell ? "#0e67e4" : "#f97316", "stroke-width": isTopCell ? 2 : 3, "stroke-dasharray": "10 6", class: "layout-cell-boundary" });
    const title = createSvgElement("text", { x: x + width / 2, y: y - boundaryPadding - 10, "font-family": drawConfig.fontFamily, "font-size": "30px", "font-weight": "700", fill: "#0f172a", "text-anchor": "middle", class: "layout-cell-title", "pointer-events": "none" });
    title.textContent = titleText; group.appendChild(rectangle); group.appendChild(title); layer.appendChild(group);
  }

  drawBoundary({ layout_cell: topName, layout_instance: `__top__${topName}`, instance_path: "" }, minX, minY, maxX - minX, maxY - minY, topName, true);

  for (const cell of placedCells) {
    if (String(cell.instance_path || "").trim() === "") continue;
    const title = cell.display_name || `${cell.layout_cell} (${cell.instance_path})`;
    drawBoundary(cell, cell.x, cell.y, cell.width, cell.height, title, false);
  }
}

function autoOrientCellsTowardSharedTerminals(placed, placedCells, svg) {
  const cellMap = new Map(placedCells.map(cell => [cell.layout_instance || cell.id, cell]));
  const terminalsByCell = new Map();

  function addTerminal(element, net, point) {
    net = String(net || "").trim();
    if (!net || !point || !Number.isFinite(point.x) || !Number.isFinite(point.y) || isGroundNet(net) || net === "VDD") return;

    const cellId = getLayoutInstance(element);
    if (!cellMap.has(cellId)) return;
    if (!terminalsByCell.has(cellId)) terminalsByCell.set(cellId, new Map());

    const terminalsByNet = terminalsByCell.get(cellId);
    if (!terminalsByNet.has(net)) terminalsByNet.set(net, []);

    terminalsByNet.get(net).push({ x: point.x, y: point.y });
  }

  for (const element of placed) {
    if (element.inputNeedsLead && element.inputLeadPoint) addTerminal(element, element.net_in, element.inputLeadPoint);
    if (element.outputNeedsLead && element.outputLeadPoint) addTerminal(element, element.net_out, element.outputLeadPoint);
  }

  function transformedPoint(cellId, point, mirrored) {
    if (!mirrored) return point;
    const cell = cellMap.get(cellId);
    const centerX = cell.x + cell.width / 2;
    return { x: centerX * 2 - point.x, y: point.y };
  }

  function scorePair(firstCellId, secondCellId, firstMirrored, secondMirrored) {
    const firstNets = terminalsByCell.get(firstCellId);
    const secondNets = terminalsByCell.get(secondCellId);
    if (!firstNets || !secondNets) return { score: Infinity, shared: 0 };

    let score = 0, shared = 0;

    for (const [net, firstPoints] of firstNets) {
      const secondPoints = secondNets.get(net);
      if (!secondPoints?.length) continue;

      let bestDistance = Infinity;

      for (const firstPoint of firstPoints) {
        const transformedFirst = transformedPoint(firstCellId, firstPoint, firstMirrored);

        for (const secondPoint of secondPoints) {
          const transformedSecond = transformedPoint(secondCellId, secondPoint, secondMirrored);
          const distance = Math.abs(transformedFirst.x - transformedSecond.x) + Math.abs(transformedFirst.y - transformedSecond.y);
          bestDistance = Math.min(bestDistance, distance);
        }
      }

      if (Number.isFinite(bestDistance)) {
        score += bestDistance;
        shared++;
      }
    }

    return { score, shared };
  }

  const cellIds = [...terminalsByCell.keys()];
  const edges = [];

  for (let firstIndex = 0; firstIndex < cellIds.length; firstIndex++) {
    for (let secondIndex = firstIndex + 1; secondIndex < cellIds.length; secondIndex++) {
      const firstCellId = cellIds[firstIndex];
      const secondCellId = cellIds[secondIndex];
      const result = scorePair(firstCellId, secondCellId, false, false);

      if (!result.shared) continue;

      const firstCell = cellMap.get(firstCellId);
      const secondCell = cellMap.get(secondCellId);
      const centerDistance = Math.abs((firstCell.x + firstCell.width / 2) - (secondCell.x + secondCell.width / 2)) +
        Math.abs((firstCell.y + firstCell.height / 2) - (secondCell.y + secondCell.height / 2));

      edges.push({ firstCellId, secondCellId, shared: result.shared, centerDistance });
    }
  }

  edges.sort((first, second) => second.shared - first.shared || first.centerDistance - second.centerDistance);

  const orientations = new Map();

  function bestCombination(firstCellId, secondCellId, allowedFirst, allowedSecond) {
    let best = null;

    for (const firstMirrored of allowedFirst) {
      for (const secondMirrored of allowedSecond) {
        const result = scorePair(firstCellId, secondCellId, firstMirrored, secondMirrored);
        if (!best || result.score < best.score) best = { firstMirrored, secondMirrored, ...result };
      }
    }

    return best;
  }

  for (const edge of edges) {
    const firstKnown = orientations.has(edge.firstCellId);
    const secondKnown = orientations.has(edge.secondCellId);

    if (!firstKnown && !secondKnown) {
      const best = bestCombination(edge.firstCellId, edge.secondCellId, [false, true], [false, true]);
      orientations.set(edge.firstCellId, best.firstMirrored);
      orientations.set(edge.secondCellId, best.secondMirrored);
    } else if (firstKnown && !secondKnown) {
      const firstOrientation = orientations.get(edge.firstCellId);
      const best = bestCombination(edge.firstCellId, edge.secondCellId, [firstOrientation], [false, true]);
      orientations.set(edge.secondCellId, best.secondMirrored);
    } else if (!firstKnown && secondKnown) {
      const secondOrientation = orientations.get(edge.secondCellId);
      const best = bestCombination(edge.firstCellId, edge.secondCellId, [false, true], [secondOrientation]);
      orientations.set(edge.firstCellId, best.firstMirrored);
    }
  }

  const results = [];

  for (const [cellId, shouldMirror] of orientations) {
    const cell = cellMap.get(cellId);
    const currentlyMirrored = Boolean(cell?.rotated180);
    const changed = shouldMirror !== currentlyMirrored;

    if (changed) rotateCellInstance180(cellId, placed, placedCells, svg);

    results.push({
      cell: cellId,
      orientation: shouldMirror ? "MIRRORED" : "NORMAL",
      changed,
    });
  }

  console.table(results);
  return results;
}

function rotateCellInstance180(layoutInstance, placed, placedCells, svg) {
  const cell = placedCells.find(cell => cell.layout_instance === layoutInstance || cell.id === layoutInstance);
  if (!cell) {
    console.warn(`Cell instance not found: ${layoutInstance}`);
    return false;
  }

  const cellElements = placed.filter(element => getLayoutInstance(element) === layoutInstance);
  if (!cellElements.length) {
    console.warn(`No placed elements found for: ${layoutInstance}`);
    return false;
  }

  const centerX = cell.x + cell.width / 2;

  function mirrorGeometry(value, visited = new Set()) {
    if (!value || typeof value !== "object" || visited.has(value)) return;
    visited.add(value);

    if (Number.isFinite(value.x)) value.x = centerX * 2 - value.x;

    for (const [key, child] of Object.entries(value)) {
      if (key === "x" || key === "image" || key === "raw") continue;
      if (child && typeof child === "object") mirrorGeometry(child, visited);
    }
  }

  function keepTextReadable(wrapper) {
    const texts = [...wrapper.querySelectorAll("text")];

    for (const text of texts) {
      if (text.parentElement?.dataset?.readableMirroredText === "true") continue;

      try {
        const box = text.getBBox();
        const textCenterX = box.x + box.width / 2;
        const counterMirror = createSvgElement("g", {
          transform: `matrix(-1 0 0 1 ${textCenterX * 2} 0)`,
          "data-readable-mirrored-text": "true",
        });

        text.parentNode.insertBefore(counterMirror, text);
        counterMirror.appendChild(text);
      } catch {
        // Ignore text elements without measurable SVG geometry.
      }
    }
  }

  const columns = cellElements.map(element => element.col).filter(Number.isFinite);
  const orders = cellElements.map(element => element.layoutOrder).filter(Number.isFinite);
  const minimumColumn = columns.length ? Math.min(...columns) : 0;
  const maximumColumn = columns.length ? Math.max(...columns) : 0;
  const minimumOrder = orders.length ? Math.min(...orders) : 0;
  const maximumOrder = orders.length ? Math.max(...orders) : 0;

  for (const element of cellElements) {
    mirrorGeometry(element);

    if (Number.isFinite(element.col)) element.col = minimumColumn + maximumColumn - element.col;
    if (Number.isFinite(element.layoutOrder)) element.layoutOrder = minimumOrder + maximumOrder - element.layoutOrder;

    const direction = Number(element.direction ?? 1);
    const electricalDirection = Number(element.electricalDirection ?? direction);

    element.direction = direction < 0 ? 1 : -1;
    element.electricalDirection = electricalDirection < 0 ? 1 : -1;
    element.layoutReversed = !element.layoutReversed;
    element.cellRotated180 = !element.cellRotated180;

    if (Number.isFinite(element.forcedRotation)) element.forcedRotation = (180 - element.forcedRotation + 360) % 360;
    else element.forcedRotation = 180;

    if (Number.isFinite(element.biasRotation)) element.biasRotation = (180 - element.biasRotation + 360) % 360;
  }

  for (const layer of [...svg.children].filter(child => child.tagName?.toLowerCase() === "g")) {
    const selected = [...layer.children].filter(node => {
      if (node.classList?.contains("layout-cell")) return false;
      if (node.dataset?.cellRotation === layoutInstance) return false;

      try {
        const box = node.getBBox();
        const nodeCenterX = box.x + box.width / 2;
        const nodeCenterY = box.y + box.height / 2;

        return nodeCenterX >= cell.x && nodeCenterX <= cell.x + cell.width &&
          nodeCenterY >= cell.y && nodeCenterY <= cell.y + cell.height;
      } catch {
        return false;
      }
    });

    if (!selected.length) continue;

    const wrapper = createSvgElement("g", {
      transform: `matrix(-1 0 0 1 ${centerX * 2} 0)`,
      "data-cell-rotation": layoutInstance,
    });

    layer.insertBefore(wrapper, selected[0]);
    for (const node of selected) wrapper.appendChild(node);

    keepTextReadable(wrapper);
  }

  cell.rotated180 = !cell.rotated180;

  console.log(`[CELL MIRRORED RIGHT-TO-LEFT] ${layoutInstance}`, {
    centerX,
    components: cellElements.length,
    readableTitles: true,
  });

  return true;
}


function getLocalCellLayout(elements, existingPlan = null) {
  const plan = existingPlan || buildSequentialTerminalPlan(elements), half = drawConfig.imageSize / 2, local = [];
  const getX = col => col * drawConfig.layoutCellElementGapX, getY = row => row * drawConfig.layoutCellElementGapY;

  function getJRMembers(block) {
    const jj = block.elements.find(e => getElementType(e) === "JJ"), resistor = block.elements.find(e => getElementType(e) === "R");
    return jj && resistor && isJJResistorPair(jj, resistor) ? { jj, resistor } : null;
  }

  const ordered = [...plan.placements.values()].sort((a, b) => a.row - b.row || a.col - b.col || (a.block.originalIndex ?? Infinity) - (b.block.originalIndex ?? Infinity));

  for (const placement of ordered) {
    const jr = getJRMembers(placement.block), hostWireY = getY(placement.row);

    placement.block.elements.forEach((element, memberIndex) => {
      const type = getElementType(element);
      let x, y;

      if (placement.placementMode === "inline-grounded-jr" && jr) {
        const center = getX(placement.centerCol), spacing = placement.pairSpacing ?? 70;
        x = type === "JJ" ? center - spacing / 2 : center + spacing / 2;
        y = hostWireY + half + (placement.rise ?? 25);
      } else if (placement.placementMode === "inline-jr-bias") {
        x = getX(placement.centerCol);
        y = hostWireY - half - drawConfig.biasOutputGap;
      } else if (placement.placementMode === "above-target-bias") {
        x = getX(placement.col + memberIndex);
        y = hostWireY - half - drawConfig.biasBranchOffset;
      } else if (jr) {
        const centerCol = placement.col + (Math.max(1, placement.span) - 1) / 2, center = getX(centerCol);
        x = type === "JJ" ? center - 35 : center + 35;
        y = getY(placement.row);
      } else {
        x = getX(placement.col + memberIndex);
        y = getY(placement.row);
      }

      local.push({ element, placement, memberIndex, type, x, y });
    });
  }

  if (!local.length) return { plan, local, minX: 0, minY: 0, anchorMinY: 0, width: 0, height: 0 };

  const minX = Math.min(...local.map(p => p.x - half)), maxX = Math.max(...local.map(p => p.x + half));
  const minY = Math.min(...local.map(p => p.y - half)), maxY = Math.max(...local.map(p => p.y + half));
  const normal = local.filter(p => !isBiasElement(p.element));
  const anchorMinY = normal.length ? Math.min(...normal.map(p => p.y - half)) : minY;

  return { plan, local, minX, minY, anchorMinY, width: maxX - minX, height: Math.max(0, maxY - anchorMinY) };
}