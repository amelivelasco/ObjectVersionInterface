function alignRightPlanRowsToLeft(leftPlan, rightPlan) {
  const leftTerms = [...leftPlan.inputTerminals, ...leftPlan.outputTerminals], rightTerms = [...rightPlan.inputTerminals, ...rightPlan.outputTerminals];
  const leftByNet = new Map(), rightByNet = new Map();

  for (const t of leftTerms) { if (!leftByNet.has(t.net)) leftByNet.set(t.net, []); leftByNet.get(t.net).push(t); }
  for (const t of rightTerms) { if (!rightByNet.has(t.net)) rightByNet.set(t.net, []); rightByNet.get(t.net).push(t); }

  const shared = [];

  for (const [net, leftCandidates] of leftByNet) {
    const rightCandidates = rightByNet.get(net);
    if (!rightCandidates?.length) continue;

    let best = null;

    for (const left of leftCandidates) {
      for (const right of rightCandidates) {
        const leftDistanceFromFacingEdge = Math.max(0, leftPlan.rightTerminalColumn - left.col);
        const rightDistanceFromFacingEdge = Math.max(0, right.col);
        const horizontalScore = leftDistanceFromFacingEdge + rightDistanceFromFacingEdge;

        if (!best || horizontalScore < best.horizontalScore) best = { net, left, right, targetRow: left.row, horizontalScore };
      }
    }

    if (best) shared.push(best);
  }

  shared.sort((a, b) => a.horizontalScore - b.horizontalScore || a.targetRow - b.targetRow);

  const lockedRows = new Set();

  function getRightTerminalOnRow(row) {
    return [...rightPlan.inputTerminals, ...rightPlan.outputTerminals].find(t => t.row === row) || null;
  }

  function swapRows(a, b) {
    if (a === b) return;

    const swap = row => row === a ? b : row === b ? a : row;

    for (const placement of rightPlan.placements.values()) {
      placement.row = swap(placement.row);
      if (Number.isFinite(placement.mergeTargetRow)) placement.mergeTargetRow = swap(placement.mergeTargetRow);
    }

    for (const terminal of rightPlan.inputTerminals) terminal.row = swap(terminal.row);
    for (const terminal of rightPlan.outputTerminals) terminal.row = swap(terminal.row);
  }

  for (const item of shared) {
    const rightTerminal = [...rightPlan.inputTerminals, ...rightPlan.outputTerminals].find(t => t.net === item.net);
    if (!rightTerminal || rightTerminal.row === item.targetRow) { lockedRows.add(item.targetRow); continue; }

    const occupyingTerminal = getRightTerminalOnRow(item.targetRow);

    if (lockedRows.has(item.targetRow)) continue;

    console.log("[ALIGN PRIORITY]", {
      net: item.net,
      score: item.horizontalScore,
      fromRow: rightTerminal.row,
      toRow: item.targetRow,
      displaced: occupyingTerminal?.net || null
    });

    const oldRow = rightTerminal.row;
    swapRows(oldRow, item.targetRow);
    lockedRows.add(item.targetRow);
  }

  const allRows = [...rightPlan.placements.values()].map(p => p.row).concat(rightPlan.inputTerminals.map(t => t.row), rightPlan.outputTerminals.map(t => t.row));
  rightPlan.rows = allRows.length ? Math.max(...allRows) + 1 : 0;

  return shared.length > 0;
}


function alignClosestSharedTerminalRows(placedCells) {
  const terminalsByNet = new Map(), terminalsByCell = new Map(), locks = new Map(), changedCells = new Set();
  const cellId = cell => cell.layout_instance || cell.id;

  function getCellTerminals(cell) {
    const plan = cell.sequentialPlan, placementByElement = new Map(), counts = new Map(), result = [];

    for (const placement of plan.placements.values()) {
      placement.block.elements.forEach((element, memberIndex) => {
        const info = { placement, memberIndex };
        placementByElement.set(element, info);
        if (element.id) placementByElement.set(element.id, info);
        if (element.raw) placementByElement.set(element.raw, info);
      });
    }

    for (const element of cell.elements) {
      if (isBiasElement(element) || getElementType(element) === "R") continue;

      for (const rawNet of [element.net_in, element.net_out]) {
        const net = String(rawNet || "").trim();
        if (!net || isGroundNet(net)) continue;
        counts.set(net, (counts.get(net) || 0) + 1);
      }
    }

    for (const element of cell.elements) {
      if (isBiasElement(element) || getElementType(element) === "R") continue;

      const info = placementByElement.get(element) || placementByElement.get(element.id) || placementByElement.get(element.raw);
      if (!info) continue;

      for (const [kind, rawNet] of [["in", element.net_in], ["out", element.net_out]]) {
        const net = String(rawNet || "").trim();
        if (!net || isGroundNet(net)) continue;
        if ((counts.get(net) || 0) !== 1 && net.toLowerCase() !== "terminal") continue;

        if (!result.some(t => t.net === net))
          result.push({ net, kind, row: info.placement.row, cell, element, placement: info.placement, memberIndex: info.memberIndex });
      }
    }

    return result;
  }

  for (const cell of placedCells) {
    const terminals = getCellTerminals(cell);
    terminalsByCell.set(cellId(cell), terminals);

    for (const terminal of terminals) {
      if (!terminalsByNet.has(terminal.net)) terminalsByNet.set(terminal.net, []);
      terminalsByNet.get(terminal.net).push(terminal);
    }
  }

  const candidates = [];

  for (const [net, terminals] of terminalsByNet) {
    for (let i = 0; i < terminals.length; i++) {
      for (let j = i + 1; j < terminals.length; j++) {
        let left = terminals[i], right = terminals[j];
        if (cellId(left.cell) === cellId(right.cell)) continue;

        const leftCenter = left.cell.x + left.cell.width / 2;
        const rightCenter = right.cell.x + right.cell.width / 2;

        if (leftCenter > rightCenter) [left, right] = [right, left];

        const verticalOverlap =
          Math.min(left.cell.y + left.cell.height, right.cell.y + right.cell.height) -
          Math.max(left.cell.y, right.cell.y);

        if (verticalOverlap <= 0) continue;

        const horizontalGap = Math.max(0, right.cell.x - (left.cell.x + left.cell.width));

        candidates.push({
          net,
          left,
          right,
          horizontalGap,
          centerDistance: Math.abs(rightCenter - leftCenter)
        });
      }
    }
  }

  candidates.sort((a, b) =>
    a.horizontalGap - b.horizontalGap ||
    a.centerDistance - b.centerDistance
  );

  function getLocks(cell) {
    const id = cellId(cell);
    if (!locks.has(id)) locks.set(id, new Map());
    return locks.get(id);
  }

  function rowBlocked(cell, row, net) {
    const locked = getLocks(cell).get(row);
    return locked && [...locked].some(lockedNet => lockedNet !== net);
  }

  function lockRow(cell, row, net) {
    const cellLocks = getLocks(cell);
    if (!cellLocks.has(row)) cellLocks.set(row, new Set());
    cellLocks.get(row).add(net);
  }

  function swapRows(cell, firstRow, secondRow) {
    if (firstRow === secondRow) return;

    const swap = row => row === firstRow ? secondRow : row === secondRow ? firstRow : row;
    const plan = cell.sequentialPlan;

    for (const placement of plan.placements.values()) {
      placement.row = swap(placement.row);

      if (Number.isFinite(placement.mergeTargetRow))
        placement.mergeTargetRow = swap(placement.mergeTargetRow);
    }

    for (const terminal of plan.inputTerminals)
      terminal.row = swap(terminal.row);

    for (const terminal of plan.outputTerminals)
      terminal.row = swap(terminal.row);

    for (const terminal of terminalsByCell.get(cellId(cell)) || [])
      terminal.row = swap(terminal.row);

    const cellLocks = getLocks(cell);
    const firstLock = cellLocks.get(firstRow);
    const secondLock = cellLocks.get(secondRow);

    if (firstLock) cellLocks.set(secondRow, firstLock);
    else cellLocks.delete(secondRow);

    if (secondLock) cellLocks.set(firstRow, secondLock);
    else cellLocks.delete(firstRow);

    changedCells.add(cell);
  }

  /*
   * First do ONLY the original row swaps.
   */
  const debug = [];

  for (const { net, left, right, horizontalGap } of candidates) {
    const leftRow = left.row;
    const rightRow = right.row;

    if (leftRow === rightRow) {
      lockRow(left.cell, leftRow, net);
      lockRow(right.cell, rightRow, net);

      debug.push({
        net,
        gap: horizontalGap,
        action: "ALREADY ALIGNED",
        row: leftRow
      });

      continue;
    }

    const canMoveRight =
      !rowBlocked(right.cell, rightRow, net) &&
      !rowBlocked(right.cell, leftRow, net);

    const canMoveLeft =
      !rowBlocked(left.cell, leftRow, net) &&
      !rowBlocked(left.cell, rightRow, net);

    if (canMoveRight) {
      swapRows(right.cell, rightRow, leftRow);

      lockRow(left.cell, leftRow, net);
      lockRow(right.cell, leftRow, net);

      debug.push({
        net,
        gap: horizontalGap,
        action: "SWAP RIGHT",
        from: rightRow,
        to: leftRow
      });

    } else if (canMoveLeft) {
      swapRows(left.cell, leftRow, rightRow);

      lockRow(left.cell, rightRow, net);
      lockRow(right.cell, rightRow, net);

      debug.push({
        net,
        gap: horizontalGap,
        action: "SWAP LEFT",
        from: leftRow,
        to: rightRow
      });

    } else {
      debug.push({
        net,
        gap: horizontalGap,
        action: "BLOCKED",
        leftRow,
        rightRow
      });
    }
  }

  function getRowBounds(cell, row) {
    const placements = [...cell.sequentialPlan.placements.values()]
      .filter(p => p.row === row && Number.isFinite(p.col));

    if (!placements.length) return null;

    const occupied = placements.filter(p => p.occupiesGrid !== false);
    const used = occupied.length ? occupied : placements;

    return {
      min: Math.min(...used.map(p => p.col)),
      max: Math.max(...used.map(p =>
        p.col + Math.max(1, p.span || 1) - 1
      ))
    };
  }

  function getTerminalColumn(terminal) {
    const placement = terminal.placement;
    if (!placement) return null;

    if (Number.isFinite(placement.centerCol))
      return placement.centerCol;

    return placement.col + (terminal.memberIndex || 0);
  }

  function flipOnlyThisRow(cell, row) {
    const bounds = getRowBounds(cell, row);
    if (!bounds) return false;

    const rowPlacements = [...cell.sequentialPlan.placements.values()]
      .filter(placement => placement.row === row);

    if (!rowPlacements.length) return false;

    for (const placement of rowPlacements) {
      const span = Math.max(1, placement.span || 1);
      const oldCol = placement.col;
      const oldCenterCol = placement.centerCol;

      placement.col =
        bounds.min + bounds.max -
        (oldCol + span - 1);

      if (Number.isFinite(oldCenterCol))
        placement.centerCol =
          bounds.min + bounds.max - oldCenterCol;

      placement.rowFlipped180 = true;
    }

    changedCells.add(cell);
    return true;
  }

  const rowTests = new Map();

  for (const { net, left, right } of candidates) {
    if (left.row !== right.row) continue;

    const row = right.row;
    const bounds = getRowBounds(right.cell, row);
    const column = getTerminalColumn(right);

    if (!bounds || !Number.isFinite(column)) continue;

    const key = `${cellId(right.cell)}|${row}`;

    if (!rowTests.has(key)) {
      rowTests.set(key, {
        cell: right.cell,
        row,
        normalScore: 0,
        flippedScore: 0,
        nets: []
      });
    }

    const test = rowTests.get(key);
    test.normalScore += column - bounds.min;
    test.flippedScore += bounds.max - column;
    test.nets.push(net);
  }

  for (const test of rowTests.values()) {
    console.log("[ROW FLIP TEST]", {
      cell: cellId(test.cell),
      row: test.row,
      nets: test.nets,
      normal: test.normalScore,
      flipped: test.flippedScore
    });

    if (test.flippedScore + 0.25 >= test.normalScore)
      continue;

    flipOnlyThisRow(test.cell, test.row);

    debug.push({
      cell: cellId(test.cell),
      row: test.row,
      nets: test.nets.join(", "),
      action: "FLIP THIS ROW ONLY",
      normal: test.normalScore,
      flipped: test.flippedScore
    });
  }

  for (const cell of changedCells) {
    cell.localLayout =
      getLocalCellLayout(cell.elements, cell.sequentialPlan);
  }

  console.table(debug);
}