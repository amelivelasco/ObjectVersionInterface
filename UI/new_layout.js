function getPlacementBlockPrimary(block) {
  return block.elements.find((element) => getElementType(element) !== "R") || block.elements[0];
}

function getPathSpan(path) {
  return path.length ? path.reduce((total, block) => total + block.span + 1, 0) - 1 : 0;
}

function buildSequentialTerminalPlan(elements, terminalInfo = {}) {
  const normalizeNets = (value) => Array.isArray(value)
    ? value.map((net) => String(net).trim()).filter(Boolean)
    : value == null ? [] : String(value).split(",").map((net) => net.trim()).filter(Boolean);

  const explicitInputNets = new Set(normalizeNets(terminalInfo.net_in));
  const explicitOutputNets = new Set(normalizeNets(terminalInfo.net_out));

  const blocks = createPlacementBlocks(elements).map((block) => {
    const primary = getPlacementBlockPrimary(block), rawNetIn = primary?.net_in || null, rawNetOut = primary?.net_out || null;
    const reverseForBoundary = Boolean(
      (rawNetIn && explicitOutputNets.has(rawNetIn) && !explicitOutputNets.has(rawNetOut)) ||
      (rawNetOut && explicitInputNets.has(rawNetOut) && !explicitInputNets.has(rawNetIn))
    );

    return {
      ...block, primary, rawNetIn, rawNetOut, reverseForBoundary,
      netIn: reverseForBoundary ? rawNetOut : rawNetIn,
      netOut: reverseForBoundary ? rawNetIn : rawNetOut,
      span: Math.max(1, block.elements.length),
    };
  });

  const consumersByNet = new Map(), producersByNet = new Map();

  function addToMap(map, net, block) {
    if (!net) { return; }
    if (!map.has(net)) { map.set(net, []); }
    map.get(net).push(block);
  }

  for (const block of blocks) {
    addToMap(producersByNet, block.netOut, block);
    if (!isBiasElement(block.primary)) { addToMap(consumersByNet, block.netIn, block); }
  }

  const inputTerminalNets = [], seenInputTerminals = new Set();

  for (const block of blocks) {
    if (isBiasElement(block.primary) || !block.netIn || isPowerNet(block.netIn) || explicitOutputNets.has(block.netIn)) { continue; }
    const producers = producersByNet.get(block.netIn) || [];

    if ((explicitInputNets.has(block.netIn) || producers.length === 0) && !seenInputTerminals.has(block.netIn)) {
      seenInputTerminals.add(block.netIn);
      inputTerminalNets.push(block.netIn);
    }
  }

  for (const net of explicitInputNets) {
    if (!seenInputTerminals.has(net) && !explicitOutputNets.has(net)) {
      seenInputTerminals.add(net);
      inputTerminalNets.push(net);
    }
  }

  function isOutputTerminalNet(net) {
    if (!net || isPowerNet(net)) { return false; }
    if (explicitOutputNets.has(net)) { return true; }
    if (explicitInputNets.has(net)) { return false; }
    return (consumersByNet.get(net) || []).length === 0;
  }

  function enumeratePathsFromNet(startNet, maximumPaths = 512) {
    const paths = [];

    function walk(block, path, visited) {
      if (paths.length >= maximumPaths) { return; }

      const currentPath = [...path, block], nextVisited = new Set(visited);
      nextVisited.add(block.id);

      const successors = (consumersByNet.get(block.netOut) || []).filter(
        (candidate) => !isBiasElement(candidate.primary) && !nextVisited.has(candidate.id)
      );

      if (!successors.length) {
        paths.push(currentPath);
        return;
      }

      let continued = false;
      for (const successor of successors) {
        continued = true;
        walk(successor, currentPath, nextVisited);
      }

      if (!continued) { paths.push(currentPath); }
    }

    for (const block of consumersByNet.get(startNet) || []) {
      if (!isBiasElement(block.primary)) { walk(block, [], new Set()); }
    }

    return paths.sort((first, second) =>
      getPathSpan(second) - getPathSpan(first) || first[0].originalIndex - second[0].originalIndex
    );
  }

  const placements = new Map(), inputTerminalMap = new Map(), outputTerminalMap = new Map();

  function isGroundedJRBlock(block) {
    const jj = block.elements.find((element) => getElementType(element) === "JJ");
    const resistor = block.elements.find((element) => getElementType(element) === "R");
    return Boolean(jj && resistor && isJJResistorPair(jj, resistor) && isGroundNet(jj.net_out));
  }

  function getPlacementRightColumn(placement) {
    return placement.col + placement.span - 1;
  }

  function tryPlaceInlineGroundedJRPath(path, principalPath) {
    const unplacedBlocks = path.filter((block) => !placements.has(block.id));
    if (unplacedBlocks.length !== 1 || !isGroundedJRBlock(unplacedBlocks[0])) { return false; }

    const jrBlock = unplacedBlocks[0], jrPathIndex = path.indexOf(jrBlock);
    const producer = [...path.slice(0, jrPathIndex)].reverse().find(
      (block) => placements.has(block.id) && block.netOut === jrBlock.netIn
    );

    if (!producer) { return false; }

    const producerIndex = principalPath.findIndex((block) => block.id === producer.id);
    if (producerIndex < 0 || producerIndex >= principalPath.length - 1) { return false; }

    const consumer = principalPath[producerIndex + 1];
    if (!consumer || !placements.has(consumer.id) || consumer.netIn !== jrBlock.netIn) { return false; }

    const producerPlacement = placements.get(producer.id), consumerPlacement = placements.get(consumer.id);
    if (producerPlacement.row !== consumerPlacement.row) { return false; }

    const centerCol = (getPlacementRightColumn(producerPlacement) + consumerPlacement.col) / 2;

    placements.set(jrBlock.id, {
      block: jrBlock, row: producerPlacement.row, col: centerCol, centerCol, span: 1, occupiesGrid: false,
      placementMode: "inline-grounded-jr", hostNet: jrBlock.netIn, hostProducerId: producer.id,
      hostConsumerId: consumer.id, pairSpacing: 70, rise: 25,
    });

    return true;
  }

  function getMaximumRow() {
    let maximumRow = -1;
    for (const placement of placements.values()) { maximumRow = Math.max(maximumRow, placement.row); }
    return maximumRow;
  }

  function getNextPrincipalRow() {
    const maximumRow = getMaximumRow();
    return maximumRow < 0 ? 0 : maximumRow + 1;
  }

  function shiftRowsFrom(startRow) {
    for (const placement of placements.values()) { if (placement.row >= startRow) { placement.row++; } }
    for (const terminal of inputTerminalMap.values()) { if (terminal.row >= startRow) { terminal.row++; } }
    for (const terminal of outputTerminalMap.values()) { if (terminal.row >= startRow) { terminal.row++; } }
  }

  function shiftColumnsFrom(startColumn, amount) {
    if (amount <= 0) { return; }

    for (const placement of placements.values()) {
      if (placement.col < startColumn) { continue; }
      placement.col += amount;
      if (Number.isFinite(placement.centerCol)) { placement.centerCol += amount; }
    }

    for (const terminal of inputTerminalMap.values()) { if (terminal.col >= startColumn) { terminal.col += amount; } }
    for (const terminal of outputTerminalMap.values()) { if (terminal.col >= startColumn) { terminal.col += amount; } }
  }

  function columnRangesOverlap(firstStart, firstSpan, secondStart, secondSpan) {
    const firstEnd = firstStart + firstSpan - 1, secondEnd = secondStart + secondSpan - 1;
    return firstStart <= secondEnd && secondStart <= firstEnd;
  }

  function isColumnRangeFree(row, startColumn, span) {
    for (const placement of placements.values()) {
      if (placement.row === row && placement.occupiesGrid !== false &&
        columnRangesOverlap(startColumn, span, placement.col, placement.span)) { return false; }
    }

    for (const terminal of inputTerminalMap.values()) {
      if (terminal.row === row && columnRangesOverlap(startColumn, span, terminal.col, 1)) { return false; }
    }

    return true;
  }

  function placeBlockSequence(sequence, row, startColumn) {
    let column = startColumn;

    for (const block of sequence) {
      placements.set(block.id, { block, row, col: column, span: block.span, occupiesGrid: true });
      column += block.span + 1;
    }

    return column;
  }

  function ensureInputTerminal(net, row) {
    if (!net || explicitOutputNets.has(net) || inputTerminalMap.has(net)) { return; }
    inputTerminalMap.set(net, { net, row, col: 0 });
  }

  function ensureOutputTerminal(net, row) {
    if (!isOutputTerminalNet(net) || outputTerminalMap.has(net)) { return; }
    outputTerminalMap.set(net, { net, row, col: 0 });
  }

  function placePathSegments(path, inputTerminalNet = null, principalPath = false) {
    if (!Array.isArray(path) || !path.length) { return; }

    let index = 0, placedAnySegment = false, fixedRow = null;

    while (index < path.length) {
      while (index < path.length && placements.has(path[index].id)) { index++; }
      if (index >= path.length) { break; }

      const segmentStart = index;
      while (index < path.length && !placements.has(path[index].id)) { index++; }

      const segmentEnd = index, segment = path.slice(segmentStart, segmentEnd);
      const predecessor = segmentStart > 0 ? path[segmentStart - 1] : null;
      const successor = segmentEnd < path.length ? path[segmentEnd] : null;
      const predecessorPlacement = predecessor ? placements.get(predecessor.id) : null;
      let successorPlacement = successor ? placements.get(successor.id) : null;
      const inputTerminal = inputTerminalNet ? inputTerminalMap.get(inputTerminalNet) : null;
      const segmentSpan = getPathSpan(segment);

      if (fixedRow === null) {
        fixedRow = principalPath
          ? predecessorPlacement?.row ?? inputTerminal?.row ?? getNextPrincipalRow()
          : getNextPrincipalRow();
      }

      const row = fixedRow;
      const startColumn = predecessorPlacement ? getPlacementRightColumn(predecessorPlacement) + 2 : 1;

      if (successorPlacement?.row === row) {
        const requiredSuccessorColumn = startColumn + segmentSpan + 1;

        if (successorPlacement.col < requiredSuccessorColumn) {
          shiftColumnsFrom(successorPlacement.col, requiredSuccessorColumn - successorPlacement.col);
          successorPlacement = placements.get(successor.id);
        }
      }

      if (!isColumnRangeFree(row, startColumn, segmentSpan)) { shiftColumnsFrom(startColumn, segmentSpan + 1); }

      placeBlockSequence(segment, row, startColumn);
      placedAnySegment = true;

      if (segmentStart === 0 && inputTerminalNet) { ensureInputTerminal(inputTerminalNet, row); }

      const lastBlock = segment.at(-1), lastPlacement = placements.get(lastBlock.id);

      if (successorPlacement) {
        lastPlacement.mergeTargetId = successor.id;
        lastPlacement.mergeTargetRow = successorPlacement.row;
        lastPlacement.mergeNet = lastBlock.netOut;
        lastPlacement.placementMode = successorPlacement.row === row ? "straight-chain-continuation" : "cross-row-merge";
      } else if (segmentEnd === path.length) {
        ensureOutputTerminal(lastBlock.netOut, row);
      }
    }

    const firstPlacement = placements.get(path[0].id), lastPlacement = placements.get(path.at(-1).id);

    if (!placedAnySegment && firstPlacement && inputTerminalNet) { ensureInputTerminal(inputTerminalNet, firstPlacement.row); }
    if (lastPlacement && !lastPlacement.mergeTargetId) { ensureOutputTerminal(path.at(-1).netOut, lastPlacement.row); }
  }

  for (const inputNet of inputTerminalNets) {
    const paths = enumeratePathsFromNet(inputNet);
    if (!paths.length) { continue; }

    const principalPath = paths.reduce((best, candidate) => {
      const bestLength = best.filter((block) => !isGroundedJRBlock(block)).length;
      const candidateLength = candidate.filter((block) => !isGroundedJRBlock(block)).length;
      return candidateLength > bestLength ? candidate : best;
    }, paths[0]);

    placePathSegments(principalPath, inputNet, true);

    for (const branchPath of paths) {
      if (branchPath === principalPath) { continue; }
      if (tryPlaceInlineGroundedJRPath(branchPath, principalPath)) { continue; }
      placePathSegments(branchPath, inputNet, false);
    }
  }

  const claimedInlineJRIds = new Set();

  for (const biasBlock of blocks.filter((block) => isBiasElement(block.primary))) {
    if (placements.has(biasBlock.id)) { continue; }

    const inlineJRPlacement = [...placements.values()]
      .filter((placement) =>
        placement.placementMode === "inline-grounded-jr" &&
        placement.hostNet === biasBlock.netOut &&
        !claimedInlineJRIds.has(placement.block.id)
      )
      .sort((first, second) =>
        Math.abs((first.block.originalIndex ?? 0) - (biasBlock.originalIndex ?? 0)) -
        Math.abs((second.block.originalIndex ?? 0) - (biasBlock.originalIndex ?? 0))
      )[0];

    if (inlineJRPlacement) {
      claimedInlineJRIds.add(inlineJRPlacement.block.id);

      placements.set(biasBlock.id, {
        block: biasBlock, row: inlineJRPlacement.row, col: inlineJRPlacement.centerCol,
        centerCol: inlineJRPlacement.centerCol, span: 1, occupiesGrid: false,
        placementMode: "inline-jr-bias", hostNet: biasBlock.netOut, hostJRId: inlineJRPlacement.block.id,
      });

      continue;
    }

    const target = blocks
      .filter((block) =>
        placements.has(block.id) &&
        !isBiasElement(block.primary) &&
        (block.netIn === biasBlock.netOut || block.netOut === biasBlock.netOut)
      )
      .sort((first, second) => placements.get(first.id).col - placements.get(second.id).col)[0];

    if (target) {
      const targetPlacement = placements.get(target.id), row = targetPlacement.row;
      shiftRowsFrom(row);
      const shiftedTarget = placements.get(target.id);

      placements.set(biasBlock.id, {
        block: biasBlock, row, col: shiftedTarget.col, span: biasBlock.span, occupiesGrid: true,
      });
    }
  }

  function longestRemainingPath(startBlock, visiting = new Set()) {
    if (visiting.has(startBlock.id)) { return []; }

    const nextVisiting = new Set(visiting);
    nextVisiting.add(startBlock.id);
    let bestContinuation = [];

    for (const successor of consumersByNet.get(startBlock.netOut) || []) {
      if (placements.has(successor.id) || isBiasElement(successor.primary) || nextVisiting.has(successor.id)) { continue; }

      const candidate = longestRemainingPath(successor, nextVisiting);
      if (getPathSpan(candidate) > getPathSpan(bestContinuation)) { bestContinuation = candidate; }
    }

    return [startBlock, ...bestContinuation];
  }

  while (true) {
    const remainingBlock = blocks.find((block) => !placements.has(block.id) && !isBiasElement(block.primary));
    if (!remainingBlock) { break; }

    const path = longestRemainingPath(remainingBlock);
    const possibleInputTerminal =
      remainingBlock.netIn &&
      !isPowerNet(remainingBlock.netIn) &&
      !explicitOutputNets.has(remainingBlock.netIn) &&
      (explicitInputNets.has(remainingBlock.netIn) || (producersByNet.get(remainingBlock.netIn) || []).length === 0)
        ? remainingBlock.netIn : null;

    placePathSegments(path, possibleInputTerminal, true);
  }

  for (const block of blocks) {
    if (placements.has(block.id)) { continue; }
    const row = getNextPrincipalRow();
    placements.set(block.id, { block, row, col: 1, span: block.span, occupiesGrid: true });
  }

  for (const net of explicitInputNets) {
    inputTerminalMap.delete(net);
    outputTerminalMap.delete(net);

    const block = blocks.find((candidate) => candidate.netIn === net);
    const placement = block ? placements.get(block.id) : null;
    if (placement) { inputTerminalMap.set(net, { net, row: placement.row, col: 0 }); }
  }

  for (const net of explicitOutputNets) {
    inputTerminalMap.delete(net);
    outputTerminalMap.delete(net);

    const block = blocks.find((candidate) => candidate.netOut === net);
    const placement = block ? placements.get(block.id) : null;
    if (placement) { outputTerminalMap.set(net, { net, row: placement.row, col: 0 }); }
  }

  let minimumColumn = 1;
  for (const placement of placements.values()) { minimumColumn = Math.min(minimumColumn, placement.col); }

  const columnShift = minimumColumn < 1 ? 1 - minimumColumn : 0;

  if (columnShift > 0) {
    for (const placement of placements.values()) {
      placement.col += columnShift;
      if (Number.isFinite(placement.centerCol)) { placement.centerCol += columnShift; }
    }
  }

  let maximumComponentColumn = 1;

  for (const placement of placements.values()) {
    maximumComponentColumn = Math.max(maximumComponentColumn, placement.col + Math.max(1, placement.span) - 1);
  }

  const rightTerminalColumn = Math.ceil(maximumComponentColumn) + 2;
  for (const terminal of outputTerminalMap.values()) { terminal.col = rightTerminalColumn; }

  let maximumRow = 0;

  for (const placement of placements.values()) { maximumRow = Math.max(maximumRow, placement.row); }
  for (const terminal of inputTerminalMap.values()) { maximumRow = Math.max(maximumRow, terminal.row); }
  for (const terminal of outputTerminalMap.values()) { maximumRow = Math.max(maximumRow, terminal.row); }

  return {
    placements,
    inputTerminals: [...inputTerminalMap.values()],
    outputTerminals: [...outputTerminalMap.values()],
    rightTerminalColumn,
    columns: rightTerminalColumn + 1,
    rows: maximumRow + 1,
  };
}