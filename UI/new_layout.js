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
  

  

  const blocks = createPlacementBlocks(elements).map(block => {
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
  
  function isUngroundedJRBlock(block) {
    const jj = block.elements.find(element => getElementType(element) === "JJ");
    const resistor = block.elements.find(element => getElementType(element) === "R");
    return Boolean(jj && resistor && isJJResistorPair(jj, resistor) && !isGroundNet(jj.net_out));
  }

  function orientSharedOutputUngroundedJRs(blocks) {
    const decisions = [];

    for (const block of blocks) {
      if (!isUngroundedJRBlock(block) || block.reverseForBoundary) continue;

      const others = blocks.filter(other => other !== block && !isBiasElement(other.primary));
      const normalPredecessors = others.filter(other => other.netOut === block.rawNetIn);
      const reversedPredecessors = others.filter(other => other.netOut === block.rawNetOut);
      const normalSuccessors = others.filter(other => other.netIn === block.rawNetOut);
      const reversedSuccessors = others.filter(other => other.netIn === block.rawNetIn);

      const normalScore = normalPredecessors.length * 4 + normalSuccessors.length;
      const reversedScore = reversedPredecessors.length * 4 + reversedSuccessors.length;

      if (reversedPredecessors.length && reversedScore > normalScore) {
        decisions.push({
          block,
          predecessor: reversedPredecessors[0],
          normalScore,
          reversedScore,
        });
      }
    }

    for (const { block, predecessor, normalScore, reversedScore } of decisions) {
      block.reverseForBoundary = true;
      block.inlineReversed = true;
      block.netIn = block.rawNetOut;
      block.netOut = block.rawNetIn;

    }
  }

  function orientInlineUngroundedJRContinuations(blocks) {
    let previous = null;

    for (const block of blocks) {
      if (isBiasElement(block.primary)) continue;

      if (previous && isUngroundedJRBlock(block) && previous.netOut && block.rawNetOut === previous.netOut && block.rawNetIn !== previous.netOut) {
        block.reverseForBoundary = true;
        block.netIn = block.rawNetOut;
        block.netOut = block.rawNetIn;
        block.inlineReversed = true;
      }

      previous = block;
    }
  }

  orientSharedOutputUngroundedJRs(blocks);

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


  const firstIndexByNet = new Map();

  for (const block of blocks) {
    for (const net of [block.netIn, block.netOut]) {
      if (net && !firstIndexByNet.has(net)) {
        firstIndexByNet.set(net, block.originalIndex ?? Infinity);
      }
    }
  }

  inputTerminalNets.sort((first, second) =>
    (firstIndexByNet.get(first) ?? Infinity) -
    (firstIndexByNet.get(second) ?? Infinity)
  );

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

  function tryPlaceInlineUngroundedJRPath(path, principalPath) {
    const unplacedBlocks = path.filter(block => !placements.has(block.id));
    if (unplacedBlocks.length !== 1 || !isUngroundedJRBlock(unplacedBlocks[0])) return false;

    const jrBlock = unplacedBlocks[0], jrIndex = path.indexOf(jrBlock);
    const producer = [...path.slice(0, jrIndex)].reverse().find(block => placements.has(block.id) && block.netOut === jrBlock.netIn);
    if (!producer) return false;

    const producerPlacement = placements.get(producer.id), row = producerPlacement.row;
    let startColumn = getPlacementRightColumn(producerPlacement) + 2;
    const successor = [...path.slice(jrIndex + 1), ...principalPath].find(block => placements.has(block.id) && block.netIn === jrBlock.netOut);
    let successorPlacement = successor ? placements.get(successor.id) : null;

    if (successorPlacement?.row === row) {
      const requiredSuccessorColumn = startColumn + jrBlock.span + 1;
      if (successorPlacement.col < requiredSuccessorColumn) {
        shiftColumnsFrom(successorPlacement.col, requiredSuccessorColumn - successorPlacement.col);
        successorPlacement = placements.get(successor.id);
      }
    }

    if (!isColumnRangeFree(row, startColumn, jrBlock.span)) {
      shiftColumnsFrom(startColumn, jrBlock.span + 1);
      startColumn = getPlacementRightColumn(placements.get(producer.id)) + 2;
    }

    const placement = {
      block: jrBlock, row, col: startColumn, span: jrBlock.span, occupiesGrid: true,
      placementMode: "inline-ungrounded-jr", hostProducerId: producer.id,
      hostConsumerId: successor?.id || null,
    };

    if (successorPlacement) {
      placement.mergeTargetId = successor.id;
      placement.mergeTargetRow = successorPlacement.row;
      placement.mergeNet = jrBlock.netOut;
    }

    placements.set(jrBlock.id, placement);
    return true;
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
      const reversed = block.inlineReversed === true || block.reverseForBoundary === true;

      for (const element of block.elements) {
        element.electricalDirection = reversed ? -1 : 1;
        element.layoutReversed = reversed;
        element.inlineReversed = block.inlineReversed === true;
      }

      placements.set(block.id, {
        block,
        row,
        col: column,
        span: block.span,
        occupiesGrid: true,
        inlineReversed: block.inlineReversed === true,
      });

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
      let predecessor = segmentStart > 0 ? path[segmentStart - 1] : null;
      const successor = segmentEnd < path.length ? path[segmentEnd] : null;
      let predecessorPlacement = predecessor ? placements.get(predecessor.id) : null;
      let successorPlacement = successor ? placements.get(successor.id) : null;

      /*
      * A skipped branch may later be processed as a new remaining path.
      * Recover its already placed producer so it stays on the producer's row.
      */
      if (!predecessorPlacement && segment.length > 0) {
        const firstBlock = segment[0];

        /*
        * First preference:
        * the new block shares net_out with an already placed block.
        *
        * Example:
        * previous component net_out = I6|net35
        * I6|L3 net_out             = I6|net35
        *
        * Place I6|L3 on that component's row and reverse its pins.
        */
        const sharedOutputPredecessors = blocks
          .filter(candidate =>
            candidate.id !== firstBlock.id &&
            placements.has(candidate.id) &&
            !isBiasElement(candidate.primary) &&
            firstBlock.rawNetOut &&
            (
              candidate.rawNetOut === firstBlock.rawNetOut ||
              candidate.netOut === firstBlock.rawNetOut
            )
          )
          .sort((first, second) =>
            Math.abs(
              (first.originalIndex ?? 0) -
              (firstBlock.originalIndex ?? 0)
            ) -
            Math.abs(
              (second.originalIndex ?? 0) -
              (firstBlock.originalIndex ?? 0)
            )
          );

        if (sharedOutputPredecessors.length > 0) {
          predecessor = sharedOutputPredecessors[0];
          predecessorPlacement = placements.get(predecessor.id);

          // Force output left and input right.
          firstBlock.inlineReversed = true;
        } else {
          /*
          * Normal fallback:
          * find an already placed producer of the input net.
          */
          const placedProducers = (producersByNet.get(firstBlock.netIn) || [])
            .filter(candidate =>
              candidate.id !== firstBlock.id &&
              placements.has(candidate.id) &&
              !isBiasElement(candidate.primary)
            )
            .sort((first, second) =>
              Math.abs(
                (first.originalIndex ?? 0) -
                (firstBlock.originalIndex ?? 0)
              ) -
              Math.abs(
                (second.originalIndex ?? 0) -
                (firstBlock.originalIndex ?? 0)
              )
            );

          if (placedProducers.length > 0) {
            predecessor = placedProducers[0];
            predecessorPlacement = placements.get(predecessor.id);

          }
        }
      }
      const inputTerminal = inputTerminalNet ? inputTerminalMap.get(inputTerminalNet) : null;
      const segmentSpan = getPathSpan(segment);

      if (fixedRow === null) {
        const continuesThroughUngroundedJR = Boolean(predecessorPlacement && segment.some(isUngroundedJRBlock));

        fixedRow = continuesThroughUngroundedJR
          ? predecessorPlacement.row
          : principalPath
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

      const firstUnplacedIndex = branchPath.findIndex(
        block => !placements.has(block.id)
      );

      if (firstUnplacedIndex > 0) {
        console.log("Skipping branch from an existing chain", {
          inputNet,
          predecessor: branchPath[firstUnplacedIndex - 1]?.primary?.id,
          firstUnplaced: branchPath[firstUnplacedIndex]?.primary?.id,
          path: branchPath.map(block => block.primary?.id),
        });

        continue;
      }

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
      const targetPlacement = placements.get(target.id);

      placements.set(biasBlock.id, {
        block: biasBlock, row: targetPlacement.row, col: targetPlacement.col, span: biasBlock.span, occupiesGrid: false,
        placementMode: "above-target-bias", hostNet: biasBlock.netOut, hostTargetId: target.id,
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

  function forceTerminalRowOrder(firstNet, secondNet) {
    const getTerminal = net => inputTerminalMap.get(net) || outputTerminalMap.get(net);
    const first = getTerminal(firstNet), second = getTerminal(secondNet);
    if (!first || !second || first.row <= second.row) return;

    const firstRow = first.row, secondRow = second.row;
    const swapRow = row => row === firstRow ? secondRow : row === secondRow ? firstRow : row;

    for (const placement of placements.values()) {
      placement.row = swapRow(placement.row);
      if (Number.isFinite(placement.mergeTargetRow)) placement.mergeTargetRow = swapRow(placement.mergeTargetRow);
    }

    for (const terminal of inputTerminalMap.values()) terminal.row = swapRow(terminal.row);
    for (const terminal of outputTerminalMap.values()) terminal.row = swapRow(terminal.row);

    console.log(`[ROWS SWAPPED] ${firstNet} is now above ${secondNet}`, {
      [firstNet]: secondRow,
      [secondNet]: firstRow,
    });
  }

  forceTerminalRowOrder("Sel1", "Sel2");

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

  /*
   * Everything below happens AFTER the row swapping is finished.
   */

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

  /*
   * This is the ONLY function allowed to mark a row as flipped.
   *
   * It touches ONLY placements whose placement.row === row.
   * It does NOT touch electricalDirection.
   * It does NOT touch layoutReversed.
   * It does NOT touch elements from another row.
   */
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

  /*
   * Re-evaluate the final aligned connections.
   *
   * We only test rows belonging to the RIGHT-hand cell because those
   * terminals should face toward the LEFT-hand cell.
   */
  const rowTests = new Map();

  for (const { net, left, right } of candidates) {
    /*
     * Because swapRows modifies terminal.row too, these are now
     * the FINAL row numbers.
     */
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

    /*
     * Distance of the terminal from the LEFT side of this row.
     *
     * Normal:
     *
     * |----- terminal ----------------|
     * ^ distance
     *
     * Flipped:
     *
     * |---------------- terminal -----|
     *                   distance ^
     */
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

    /*
     * Strict condition:
     * do not modify the row unless the flipped orientation
     * is actually better.
     */
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

  /*
   * Rebuild geometry after all row decisions.
   */
  for (const cell of changedCells) {
    cell.localLayout =
      getLocalCellLayout(cell.elements, cell.sequentialPlan);
  }

  console.table(debug);
}