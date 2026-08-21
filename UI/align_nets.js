function groupTerminalsByNet(terminals) {
  const byNet = new Map();
  for (const terminal of terminals) {
    if (!byNet.has(terminal.net)) byNet.set(terminal.net, []);
    byNet.get(terminal.net).push(terminal);
  }
  return byNet;
}

function findBestSharedRowMatch(net, leftCandidates, rightCandidates, leftPlan) {
  let best = null;

  for (const left of leftCandidates) {
    for (const right of rightCandidates) {
      const leftDistanceFromFacingEdge = Math.max(0, leftPlan.rightTerminalColumn - left.col);
      const rightDistanceFromFacingEdge = Math.max(0, right.col);
      const horizontalScore = leftDistanceFromFacingEdge + rightDistanceFromFacingEdge;

      if (!best || horizontalScore < best.horizontalScore) best = { net, left, right, targetRow: left.row, horizontalScore };
    }
  }

  return best;
}

function collectSharedRowMatches(leftPlan, rightPlan) {
  const leftTerms = [...leftPlan.inputTerminals, ...leftPlan.outputTerminals];
  const rightTerms = [...rightPlan.inputTerminals, ...rightPlan.outputTerminals];
  const leftByNet = groupTerminalsByNet(leftTerms);
  const rightByNet = groupTerminalsByNet(rightTerms);
  const shared = [];

  for (const [net, leftCandidates] of leftByNet) {
    const rightCandidates = rightByNet.get(net);
    if (!rightCandidates?.length) continue;

    const best = findBestSharedRowMatch(net, leftCandidates, rightCandidates, leftPlan);
    if (best) shared.push(best);
  }

  shared.sort((a, b) => a.horizontalScore - b.horizontalScore || a.targetRow - b.targetRow);
  return shared;
}

function getRightTerminalOnRow(rightPlan, row) {
  return [...rightPlan.inputTerminals, ...rightPlan.outputTerminals].find((terminal) => terminal.row === row) || null;
}

function swapRightPlanRows(rightPlan, a, b) {
  if (a === b) return;

  const swap = (row) => {
    if (row === a) return b;
    if (row === b) return a;
    return row;
  };

  for (const placement of rightPlan.placements.values()) {
    placement.row = swap(placement.row);
    if (Number.isFinite(placement.mergeTargetRow)) placement.mergeTargetRow = swap(placement.mergeTargetRow);
  }

  for (const terminal of rightPlan.inputTerminals) terminal.row = swap(terminal.row);
  for (const terminal of rightPlan.outputTerminals) terminal.row = swap(terminal.row);
}

function alignSharedRowItem(item, rightPlan, lockedRows) {
  const rightTerminal = [...rightPlan.inputTerminals, ...rightPlan.outputTerminals].find((terminal) => terminal.net === item.net);

  if (!rightTerminal || rightTerminal.row === item.targetRow) {
    lockedRows.add(item.targetRow);
    return;
  }

  if (lockedRows.has(item.targetRow)) return;

  const oldRow = rightTerminal.row;
  swapRightPlanRows(rightPlan, oldRow, item.targetRow);
  lockedRows.add(item.targetRow);
}

function updateRightPlanRowCount(rightPlan) {
  const allRows = [...rightPlan.placements.values()].map((placement) => placement.row)
    .concat(rightPlan.inputTerminals.map((terminal) => terminal.row), rightPlan.outputTerminals.map((terminal) => terminal.row));

  rightPlan.rows = allRows.length ? Math.max(...allRows) + 1 : 0;
}

function alignRightPlanRowsToLeft(leftPlan, rightPlan) {
  const shared = collectSharedRowMatches(leftPlan, rightPlan);
  const lockedRows = new Set();

  for (const item of shared) alignSharedRowItem(item, rightPlan, lockedRows);

  updateRightPlanRowCount(rightPlan);
  return shared.length > 0;
}


function getCellId(cell) {
  return cell.layout_instance || cell.id;
}

function buildPlacementLookup(plan) {
  const placementByElement = new Map();

  for (const placement of plan.placements.values()) {
    placement.block.elements.forEach((element, memberIndex) => {
      const info = { placement, memberIndex };
      placementByElement.set(element, info);
      if (element.id) placementByElement.set(element.id, info);
      if (element.raw) placementByElement.set(element.raw, info);
    });
  }

  return placementByElement;
}

function countCellNets(cell) {
  const counts = new Map();

  for (const element of cell.elements) {
    if (isBiasElement(element) || isGeneratedResistor(element)) continue;

    for (const rawNet of [element.net_in, element.net_out]) {
      const net = String(rawNet || "").trim();
      if (!net || isGroundNet(net)) continue;
      counts.set(net, (counts.get(net) || 0) + 1);
    }
  }

  return counts;
}

function addCellTerminal(result, element, kind, rawNet, info, cell, counts) {
  const net = String(rawNet || "").trim();
  if (!net || isGroundNet(net)) return;
  if ((counts.get(net) || 0) !== 1 && net.toLowerCase() !== "terminal") return;
  if (result.some((terminal) => terminal.net === net)) return;

  result.push({
    net, kind, row: info.placement.row, cell, element, placement: info.placement, memberIndex: info.memberIndex
  });
}

function getCellTerminals(cell) {
  const placementByElement = buildPlacementLookup(cell.sequentialPlan);
  const counts = countCellNets(cell);
  const result = [];

  for (const element of cell.elements) {
    if (isBiasElement(element) || isGeneratedResistor(element)) continue;

    const info = placementByElement.get(element) || placementByElement.get(element.id) || placementByElement.get(element.raw);
    if (!info) continue;

    addCellTerminal(result, element, "in", element.net_in, info, cell, counts);
    addCellTerminal(result, element, "out", element.net_out, info, cell, counts);
  }

  return result;
}

function collectTerminalMaps(placedCells) {
  const terminalsByNet = new Map();
  const terminalsByCell = new Map();

  for (const cell of placedCells) {
    const terminals = getCellTerminals(cell);
    terminalsByCell.set(getCellId(cell), terminals);

    for (const terminal of terminals) {
      if (!terminalsByNet.has(terminal.net)) terminalsByNet.set(terminal.net, []);
      terminalsByNet.get(terminal.net).push(terminal);
    }
  }

  return { terminalsByNet, terminalsByCell };
}

function getTerminalPairCandidate(net, first, second) {
  let left = first;
  let right = second;
  if (getCellId(left.cell) === getCellId(right.cell)) return null;

  const leftCenter = left.cell.x + left.cell.width / 2;
  const rightCenter = right.cell.x + right.cell.width / 2;
  if (leftCenter > rightCenter) [left, right] = [right, left];

  const verticalOverlap = Math.min(left.cell.y + left.cell.height, right.cell.y + right.cell.height) - Math.max(left.cell.y, right.cell.y);
  if (verticalOverlap <= 0) return null;

  const horizontalGap = Math.max(0, right.cell.x - (left.cell.x + left.cell.width));
  return { net, left, right, horizontalGap, centerDistance: Math.abs(rightCenter - leftCenter) };
}

function buildAlignmentCandidates(terminalsByNet) {
  const candidates = [];

  for (const [net, terminals] of terminalsByNet) {
    for (let i = 0; i < terminals.length; i++) {
      for (let j = i + 1; j < terminals.length; j++) {
        const candidate = getTerminalPairCandidate(net, terminals[i], terminals[j]);
        if (candidate) candidates.push(candidate);
      }
    }
  }

  candidates.sort((a, b) => a.horizontalGap - b.horizontalGap || a.centerDistance - b.centerDistance);
  return candidates;
}

function getCellLocks(cell, locks) {
  const id = getCellId(cell);
  if (!locks.has(id)) locks.set(id, new Map());
  return locks.get(id);
}

function rowBlocked(cell, row, net, locks) {
  const locked = getCellLocks(cell, locks).get(row);
  return locked && [...locked].some((lockedNet) => lockedNet !== net);
}

function lockRow(cell, row, net, locks) {
  const cellLocks = getCellLocks(cell, locks);
  if (!cellLocks.has(row)) cellLocks.set(row, new Set());
  cellLocks.get(row).add(net);
}

function swapRowValue(row, firstRow, secondRow) {
  if (row === firstRow) return secondRow;
  if (row === secondRow) return firstRow;
  return row;
}

function swapPlanRows(cell, firstRow, secondRow) {
  const plan = cell.sequentialPlan;

  for (const placement of plan.placements.values()) {
    placement.row = swapRowValue(placement.row, firstRow, secondRow);
    if (Number.isFinite(placement.mergeTargetRow)) placement.mergeTargetRow = swapRowValue(placement.mergeTargetRow, firstRow, secondRow);
  }

  for (const terminal of plan.inputTerminals) terminal.row = swapRowValue(terminal.row, firstRow, secondRow);
  for (const terminal of plan.outputTerminals) terminal.row = swapRowValue(terminal.row, firstRow, secondRow);
}

function swapTerminalRows(cell, firstRow, secondRow, terminalsByCell) {
  for (const terminal of terminalsByCell.get(getCellId(cell)) || []) {
    terminal.row = swapRowValue(terminal.row, firstRow, secondRow);
  }
}

function swapLockRows(cell, firstRow, secondRow, locks) {
  const cellLocks = getCellLocks(cell, locks);
  const firstLock = cellLocks.get(firstRow);
  const secondLock = cellLocks.get(secondRow);

  if (firstLock) cellLocks.set(secondRow, firstLock);
  else cellLocks.delete(secondRow);

  if (secondLock) cellLocks.set(firstRow, secondLock);
  else cellLocks.delete(firstRow);
}

function swapRows(cell, firstRow, secondRow, context) {
  if (firstRow === secondRow) return;

  swapPlanRows(cell, firstRow, secondRow);
  swapTerminalRows(cell, firstRow, secondRow, context.terminalsByCell);
  swapLockRows(cell, firstRow, secondRow, context.locks);
  context.changedCells.add(cell);
}

function recordAlignedCandidate(candidate, context) {
  const { net, left, right, horizontalGap } = candidate;
  lockRow(left.cell, left.row, net, context.locks);
  lockRow(right.cell, right.row, net, context.locks);
  context.debug.push({ net, gap: horizontalGap, action: "ALREADY ALIGNED", row: left.row });
}

function tryMoveRight(candidate, context) {
  const { net, left, right, horizontalGap } = candidate;
  const leftRow = left.row;
  const rightRow = right.row;

  const canMove = !rowBlocked(right.cell, rightRow, net, context.locks) && !rowBlocked(right.cell, leftRow, net, context.locks);
  if (!canMove) return false;

  swapRows(right.cell, rightRow, leftRow, context);
  lockRow(left.cell, leftRow, net, context.locks);
  lockRow(right.cell, leftRow, net, context.locks);
  context.debug.push({ net, gap: horizontalGap, action: "SWAP RIGHT", from: rightRow, to: leftRow });
  return true;
}

function tryMoveLeft(candidate, context) {
  const { net, left, right, horizontalGap } = candidate;
  const leftRow = left.row;
  const rightRow = right.row;

  const canMove = !rowBlocked(left.cell, leftRow, net, context.locks) && !rowBlocked(left.cell, rightRow, net, context.locks);
  if (!canMove) return false;

  swapRows(left.cell, leftRow, rightRow, context);
  lockRow(left.cell, rightRow, net, context.locks);
  lockRow(right.cell, rightRow, net, context.locks);
  context.debug.push({ net, gap: horizontalGap, action: "SWAP LEFT", from: leftRow, to: rightRow });
  return true;
}

function alignCandidateRows(candidate, context) {
  if (candidate.left.row === candidate.right.row) {
    recordAlignedCandidate(candidate, context);
    return;
  }

  if (tryMoveRight(candidate, context)) return;
  if (tryMoveLeft(candidate, context)) return;

  context.debug.push({
    net: candidate.net, gap: candidate.horizontalGap, action: "BLOCKED",
    leftRow: candidate.left.row, rightRow: candidate.right.row
  });
}

function getRowBounds(cell, row) {
  const placements = [...cell.sequentialPlan.placements.values()].filter((placement) => placement.row === row && Number.isFinite(placement.col));
  if (!placements.length) return null;

  const occupied = placements.filter((placement) => placement.occupiesGrid !== false);
  const used = occupied.length ? occupied : placements;

  return {
    min: Math.min(...used.map((placement) => placement.col)),
    max: Math.max(...used.map((placement) => placement.col + Math.max(1, placement.span || 1) - 1))
  };
}

function getTerminalColumn(terminal) {
  const placement = terminal.placement;
  if (!placement) return null;
  if (Number.isFinite(placement.centerCol)) return placement.centerCol;
  return placement.col + (terminal.memberIndex || 0);
}

function flipOnlyThisRow(cell, row, changedCells) {
  const bounds = getRowBounds(cell, row);
  if (!bounds) return false;

  const rowPlacements = [...cell.sequentialPlan.placements.values()].filter((placement) => placement.row === row);
  if (!rowPlacements.length) return false;

  for (const placement of rowPlacements) {
    const span = Math.max(1, placement.span || 1);
    const oldCol = placement.col;
    const oldCenterCol = placement.centerCol;

    placement.col = bounds.min + bounds.max - (oldCol + span - 1);
    if (Number.isFinite(oldCenterCol)) placement.centerCol = bounds.min + bounds.max - oldCenterCol;
    placement.rowFlipped180 = true;
  }

  changedCells.add(cell);
  return true;
}

function addRowFlipTest(candidate, rowTests) {
  const { net, left, right } = candidate;
  if (left.row !== right.row) return;

  const row = right.row;
  const bounds = getRowBounds(right.cell, row);
  const column = getTerminalColumn(right);
  if (!bounds || !Number.isFinite(column)) return;

  const key = `${getCellId(right.cell)}|${row}`;
  if (!rowTests.has(key)) rowTests.set(key, { cell: right.cell, row, normalScore: 0, flippedScore: 0, nets: [] });

  const test = rowTests.get(key);
  test.normalScore += column - bounds.min;
  test.flippedScore += bounds.max - column;
  test.nets.push(net);
}

function processRowFlipTest(test, context) {
  console.log("[ROW FLIP TEST]", {
    cell: getCellId(test.cell), row: test.row, nets: test.nets, normal: test.normalScore, flipped: test.flippedScore
  });

  if (test.flippedScore + 0.25 >= test.normalScore) return;

  flipOnlyThisRow(test.cell, test.row, context.changedCells);
  context.debug.push({
    cell: getCellId(test.cell), row: test.row, nets: test.nets.join(", "), action: "FLIP THIS ROW ONLY",
    normal: test.normalScore, flipped: test.flippedScore
  });
}

function rebuildChangedCellLayouts(changedCells) {
  for (const cell of changedCells) cell.localLayout = getLocalCellLayout(cell.elements, cell.sequentialPlan);
}

function alignClosestSharedTerminalRows(placedCells) {
  const { terminalsByNet, terminalsByCell } = collectTerminalMaps(placedCells);
  const candidates = buildAlignmentCandidates(terminalsByNet);
  const context = { terminalsByCell, locks: new Map(), changedCells: new Set(), debug: [] };

  for (const candidate of candidates) alignCandidateRows(candidate, context);

  const rowTests = new Map();
  for (const candidate of candidates) addRowFlipTest(candidate, rowTests);
  for (const test of rowTests.values()) processRowFlipTest(test, context);

  rebuildChangedCellLayouts(context.changedCells);
  console.table(context.debug);
}