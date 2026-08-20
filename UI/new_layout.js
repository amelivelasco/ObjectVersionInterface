function getPlacementBlockPrimary(block) {
  return block.elements.find((element) => getElementType(element) !== "R") || block.elements[0];
}

function getPathSpan(path) {
  return path.length ? path.reduce((total, block) => total + block.span + 1, 0) - 1 : 0;
}

function isUngroundedJRBlock(block) {
  const jj = block.elements.find(e => getElementType(e) === "JJ"), resistor = block.elements.find(e => getElementType(e) === "R");
  return Boolean(jj && resistor && isJJResistorPair(jj, resistor) && !isGroundNet(jj.net_out));
}

function orientInlineUngroundedJRContinuations(list) {
  let previous = null;
  for (const block of list) {
    if (isBiasElement(block.primary)) continue;
    if (previous && isUngroundedJRBlock(block) && previous.netOut && block.rawNetOut === previous.netOut && block.rawNetIn !== previous.netOut) {
      block.reverseForBoundary = true; block.inlineReversed = true; block.netIn = block.rawNetOut; block.netOut = block.rawNetIn;
    }
    previous = block;
  }
}

function orientSharedOutputUngroundedJRs(list) {
  const decisions = [];
  for (const block of list) {
    if (!isUngroundedJRBlock(block) || block.reverseForBoundary) continue;
    const others = list.filter(other => other !== block && !isBiasElement(other.primary));
    const normalPredecessors = others.filter(other => other.netOut === block.rawNetIn), reversedPredecessors = others.filter(other => other.netOut === block.rawNetOut);
    const normalSuccessors = others.filter(other => other.netIn === block.rawNetOut), reversedSuccessors = others.filter(other => other.netIn === block.rawNetIn);
    const normalScore = normalPredecessors.length * 4 + normalSuccessors.length, reversedScore = reversedPredecessors.length * 4 + reversedSuccessors.length;
    if (reversedPredecessors.length && reversedScore > normalScore) decisions.push({ block });
  }
  for (const { block } of decisions) {
    block.reverseForBoundary = true; block.inlineReversed = true;
    block.netIn = block.rawNetOut; block.netOut = block.rawNetIn;
  }
}

function columnRangesOverlap(a, aSpan, b, bSpan) { 
  return a <= b + bSpan - 1 && b <= a + aSpan - 1; 
}

function addToMap(map, net, block) {
  if (!net) return;
  if (!map.has(net)) map.set(net, []);
  map.get(net).push(block);
}

function isGroundedJRBlock(block) {
  const jj = block.elements.find(e => getElementType(e) === "JJ"), resistor = block.elements.find(e => getElementType(e) === "R");
  return Boolean(jj && resistor && isJJResistorPair(jj, resistor) && isGroundNet(jj.net_out));
}

function normalizeTerminalNets(value) {
  if (Array.isArray(value)) return value.map(net => String(net).trim()).filter(Boolean);
  if (value == null) return [];
  return String(value).split(",").map(net => net.trim()).filter(Boolean);
}

function createSequentialBlocks(elements, explicitInputNets, explicitOutputNets) {
  return createPlacementBlocks(elements).map(block => {
    const primary = getPlacementBlockPrimary(block), rawNetIn = primary?.net_in || null, rawNetOut = primary?.net_out || null;
    const reverseForBoundary = Boolean((rawNetIn && explicitOutputNets.has(rawNetIn) && !explicitOutputNets.has(rawNetOut)) || (rawNetOut && explicitInputNets.has(rawNetOut) && !explicitInputNets.has(rawNetIn)));
    return { ...block, primary, rawNetIn, rawNetOut, reverseForBoundary, netIn: reverseForBoundary ? rawNetOut : rawNetIn, netOut: reverseForBoundary ? rawNetIn : rawNetOut, span: Math.max(1, block.elements.length) };
  });
}

function buildSequentialNetIndexes(blocks) {
  const consumersByNet = new Map(), producersByNet = new Map();
  for (const block of blocks) {
    addToMap(producersByNet, block.netOut, block);
    if (!isBiasElement(block.primary)) addToMap(consumersByNet, block.netIn, block);
  }
  return { consumersByNet, producersByNet };
}

function collectSequentialInputNets(context) {
  const result = [], seen = new Set();
  const add = net => { if (!seen.has(net) && !context.explicitOutputNets.has(net)) { seen.add(net); result.push(net); } };

  for (const block of context.blocks) {
    if (isBiasElement(block.primary) || !block.netIn || isPowerNet(block.netIn) || context.explicitOutputNets.has(block.netIn)) continue;
    if (context.explicitInputNets.has(block.netIn) || !(context.producersByNet.get(block.netIn) || []).length) add(block.netIn);
  }

  for (const net of context.explicitInputNets) add(net);

  const firstIndexByNet = new Map();
  for (const block of context.blocks) for (const net of [block.netIn, block.netOut]) if (net && !firstIndexByNet.has(net)) firstIndexByNet.set(net, block.originalIndex ?? Infinity);
  return result.sort((a, b) => (firstIndexByNet.get(a) ?? Infinity) - (firstIndexByNet.get(b) ?? Infinity));
}

function isSequentialOutputNet(net, context) {
  if (!net || isPowerNet(net)) return false;
  if (context.explicitOutputNets.has(net)) return true;
  if (context.explicitInputNets.has(net)) return false;
  return !(context.consumersByNet.get(net) || []).length;
}

function getBoundaryTerminalForPath(path, context) {
  if (!path?.length) return null;
  const first = path[0], last = path.at(-1);

  for (const net of context.inputTerminalNets) {
    if (first.rawNetIn === net) return { net, side: "left", direction: 1, block: first };
    if (first.rawNetOut === net) return { net, side: "left", direction: -1, block: first };
  }

  if (isSequentialOutputNet(last.rawNetOut, context)) return { net: last.rawNetOut, side: "right", direction: 1, block: last };
  if (isSequentialOutputNet(last.rawNetIn, context)) return { net: last.rawNetIn, side: "right", direction: -1, block: last };
  return null;
}

function walkSequentialPaths(block, path, visited, paths, context, maximumPaths) {
  if (paths.length >= maximumPaths) return;
  const currentPath = [...path, block], nextVisited = new Set(visited); nextVisited.add(block.id);
  const successors = (context.consumersByNet.get(block.netOut) || []).filter(candidate => !isBiasElement(candidate.primary) && !nextVisited.has(candidate.id));

  if (!successors.length) { paths.push(currentPath); return; }
  for (const successor of successors) walkSequentialPaths(successor, currentPath, nextVisited, paths, context, maximumPaths);
}

function enumeratePathsFromNet(startNet, context, maximumPaths = 512) {
  const paths = [];
  for (const block of context.consumersByNet.get(startNet) || []) if (!isBiasElement(block.primary)) walkSequentialPaths(block, [], new Set(), paths, context, maximumPaths);
  return paths.sort((a, b) => getPathSpan(b) - getPathSpan(a) || a[0].originalIndex - b[0].originalIndex);
}

function getPlacementRightColumn(placement) {
  return placement.col + placement.span - 1;
}

function getNextPrincipalRow(context) {
  let maximum = -1;
  for (const placement of context.placements.values()) maximum = Math.max(maximum, placement.row);
  return maximum + 1;
}

function shiftColumnsFrom(startColumn, amount, context) {
  if (amount <= 0) return;

  for (const placement of context.placements.values()) {
    if (placement.col < startColumn) continue;
    placement.col += amount;
    if (Number.isFinite(placement.centerCol)) placement.centerCol += amount;
  }

  for (const terminal of context.inputTerminalMap.values()) if (terminal.col >= startColumn) terminal.col += amount;
  for (const terminal of context.outputTerminalMap.values()) if (terminal.col >= startColumn) terminal.col += amount;
}

function isColumnRangeFree(row, startColumn, span, context) {
  for (const placement of context.placements.values()) if (placement.row === row && placement.occupiesGrid !== false && columnRangesOverlap(startColumn, span, placement.col, placement.span)) return false;
  for (const terminal of context.inputTerminalMap.values()) if (terminal.row === row && columnRangesOverlap(startColumn, span, terminal.col, 1)) return false;
  return true;
}

function placeBlockSequence(sequence, row, startColumn, context) {
  let column = startColumn;

  for (const block of sequence) {
    const forcedDirection = Number.isFinite(block.forcedTerminalDirection) ? block.forcedTerminalDirection : null;
    const reversed = forcedDirection !== null ? forcedDirection < 0 : block.inlineReversed === true || block.reverseForBoundary === true;
    const direction = forcedDirection ?? (reversed ? -1 : 1);

    for (const element of block.elements) {
      element.electricalDirection = direction; element.layoutReversed = reversed;
      element.inlineReversed = block.inlineReversed === true; element.terminalDirectionForced = forcedDirection !== null;
    }

    context.placements.set(block.id, { block, row, col: column, span: block.span, occupiesGrid: true, inlineReversed: block.inlineReversed === true, terminalDirectionForced: forcedDirection !== null, terminalForcedDirection: forcedDirection });
    column += block.span + 1;
  }

  return column;
}

function ensureOutputTerminal(net, row, context) {
  if (!isSequentialOutputNet(net, context) || context.outputTerminalMap.has(net)) return;
  context.outputTerminalMap.set(net, { net, row, col: 0 });
}

function forceInputTerminalDirection(block, net) {
  if (block.rawNetIn === net) { block.forcedTerminalDirection = 1; return; }
  if (block.rawNetOut === net) { block.forcedTerminalDirection = -1; return; }

  console.warn("❌ [TERMINAL DOES NOT MATCH FIRST BLOCK RAW NETS]", {
    terminal: net, block: block.primary?.id, rawIn: block.rawNetIn, rawOut: block.rawNetOut, netIn: block.netIn, netOut: block.netOut
  });
}

function prepareInputTerminal(block, net, context) {
  forceInputTerminalDirection(block, net);
  if (!context.inputTerminalMap.has(net)) context.inputTerminalMap.set(net, { net, row: getNextPrincipalRow(context), col: 0 });
}

function blockOriginalDistance(first, second) {
  return Math.abs((first.originalIndex ?? 0) - (second.originalIndex ?? 0));
}

function findSharedOutputPredecessor(firstBlock, context) {
  if (!firstBlock.rawNetOut) return null;

  return context.blocks
    .filter(candidate => candidate.id !== firstBlock.id && context.placements.has(candidate.id) && !isBiasElement(candidate.primary) &&
      (candidate.rawNetOut === firstBlock.rawNetOut || candidate.netOut === firstBlock.rawNetOut))
    .sort((a, b) => blockOriginalDistance(a, firstBlock) - blockOriginalDistance(b, firstBlock))[0] || null;
}

function findPlacedProducer(firstBlock, context) {
  return (context.producersByNet.get(firstBlock.netIn) || [])
    .filter(candidate => candidate.id !== firstBlock.id && context.placements.has(candidate.id) && !isBiasElement(candidate.primary))
    .sort((a, b) => blockOriginalDistance(a, firstBlock) - blockOriginalDistance(b, firstBlock))[0] || null;
}

function resolveSegmentPredecessor(firstBlock, predecessor, predecessorPlacement, startsAtTerminal, context) {
  if (predecessorPlacement || startsAtTerminal) return { predecessor, predecessorPlacement };

  const shared = findSharedOutputPredecessor(firstBlock, context);
  if (shared) {
    firstBlock.inlineReversed = true;
    return { predecessor: shared, predecessorPlacement: context.placements.get(shared.id) };
  }

  const producer = findPlacedProducer(firstBlock, context);
  return producer ? { predecessor: producer, predecessorPlacement: context.placements.get(producer.id) } : { predecessor, predecessorPlacement };
}

function chooseSegmentRow(segment, predecessorPlacement, inputTerminal, startsAtTerminal, principalPath, context) {
  if (startsAtTerminal) return inputTerminal?.row ?? getNextPrincipalRow(context);
  if (predecessorPlacement && segment.some(isUngroundedJRBlock)) return predecessorPlacement.row;
  if (principalPath) return predecessorPlacement?.row ?? inputTerminal?.row ?? getNextPrincipalRow(context);
  return getNextPrincipalRow(context);
}

function findNextUnplacedSegment(path, startIndex, context) {
  let index = startIndex;
  while (index < path.length && context.placements.has(path[index].id)) index++;
  if (index >= path.length) return null;

  const segmentStart = index;
  while (index < path.length && !context.placements.has(path[index].id)) index++;

  return { segmentStart, segmentEnd: index, segment: path.slice(segmentStart, index), nextIndex: index };
}

function makeRoomForSuccessor(row, startColumn, segmentSpan, successor, successorPlacement, context) {
  if (successorPlacement?.row !== row) return successorPlacement;

  const required = startColumn + segmentSpan + 1;
  if (successorPlacement.col >= required) return successorPlacement;

  shiftColumnsFrom(successorPlacement.col, required - successorPlacement.col, context);
  return context.placements.get(successor.id);
}

function makeSegmentColumnFree(row, startColumn, segmentSpan, context) {
  if (isColumnRangeFree(row, startColumn, segmentSpan, context)) return;
  console.warn("[COLUMN NOT FREE]", { row, startColumn, segmentSpan });
  shiftColumnsFrom(startColumn, segmentSpan + 1, context);
}

function finalizePlacedSegment(segment, segmentEnd, pathLength, row, successor, successorPlacement, context) {
  const lastBlock = segment.at(-1), lastPlacement = context.placements.get(lastBlock.id);

  if (successorPlacement) {
    lastPlacement.mergeTargetId = successor.id; lastPlacement.mergeTargetRow = successorPlacement.row; lastPlacement.mergeNet = lastBlock.netOut;
    lastPlacement.placementMode = successorPlacement.row === row ? "straight-chain-continuation" : "cross-row-merge";
  } else if (segmentEnd === pathLength) {
    ensureOutputTerminal(lastBlock.netOut, row, context);
  }
}

function finalizePathTerminals(path, inputTerminalNet, placedAnySegment, context) {
  const firstPlacement = context.placements.get(path[0].id), lastPlacement = context.placements.get(path.at(-1).id);
  if (!placedAnySegment && firstPlacement && inputTerminalNet) context.inputTerminalMap.set(inputTerminalNet, { net: inputTerminalNet, row: firstPlacement.row, col: 0 });
  if (lastPlacement && !lastPlacement.mergeTargetId) ensureOutputTerminal(path.at(-1).netOut, lastPlacement.row, context);
}

function getPathSegmentState(path, info, inputTerminalNet, context) {
  const { segmentStart, segmentEnd, segment } = info;
  let predecessor = segmentStart > 0 ? path[segmentStart - 1] : null;
  const successor = segmentEnd < path.length ? path[segmentEnd] : null;
  let predecessorPlacement = predecessor ? context.placements.get(predecessor.id) : null;
  const successorPlacement = successor ? context.placements.get(successor.id) : null;
  const firstBlock = segment[0], startsAtTerminal = Boolean(segmentStart === 0 && inputTerminalNet && !predecessorPlacement);

  if (startsAtTerminal) prepareInputTerminal(firstBlock, inputTerminalNet, context);
  ({ predecessor, predecessorPlacement } = resolveSegmentPredecessor(firstBlock, predecessor, predecessorPlacement, startsAtTerminal, context));

  return { segmentStart, segmentEnd, segment, predecessor, predecessorPlacement, successor, successorPlacement, firstBlock, startsAtTerminal };
}

function resolvePathSegmentRow(state, inputTerminalNet, principalPath, fixedRow, context) {
  if (fixedRow !== null) return fixedRow;
  const inputTerminal = inputTerminalNet ? context.inputTerminalMap.get(inputTerminalNet) : null;
  return chooseSegmentRow(state.segment, state.predecessorPlacement, inputTerminal, state.startsAtTerminal, principalPath, context);
}

function setInputTerminalRow(inputTerminalNet, row, context) {
  context.inputTerminalMap.set(inputTerminalNet, { net: inputTerminalNet, row, col: 0 });
}

function placeCurrentPathSegment(path, state, inputTerminalNet, principalPath, fixedRow, context) {
  const row = resolvePathSegmentRow(state, inputTerminalNet, principalPath, fixedRow, context);
  if (state.startsAtTerminal) setInputTerminalRow(inputTerminalNet, row, context);

  const segmentSpan = getPathSpan(state.segment);
  const startColumn = state.startsAtTerminal || !state.predecessorPlacement ? 1 : getPlacementRightColumn(state.predecessorPlacement) + 2;
  const successorPlacement = makeRoomForSuccessor(row, startColumn, segmentSpan, state.successor, state.successorPlacement, context);

  makeSegmentColumnFree(row, startColumn, segmentSpan, context);
  placeBlockSequence(state.segment, row, startColumn, context);
  if (state.startsAtTerminal) setInputTerminalRow(inputTerminalNet, row, context);

  finalizePlacedSegment(state.segment, state.segmentEnd, path.length, row, state.successor, successorPlacement, context);
  return row;
}

function placePathSegments(path, inputTerminalNet, principalPath, context) {
  if (!Array.isArray(path) || !path.length) return;

  let index = 0, placedAnySegment = false, fixedRow = null;

  while (index < path.length) {
    const info = findNextUnplacedSegment(path, index, context);
    if (!info) break;

    index = info.nextIndex;
    const state = getPathSegmentState(path, info, inputTerminalNet, context);
    fixedRow = placeCurrentPathSegment(path, state, inputTerminalNet, principalPath, fixedRow, context);
    placedAnySegment = true;
  }

  finalizePathTerminals(path, inputTerminalNet, placedAnySegment, context);
}

function tryPlaceInlineGroundedJRPath(path, principalPath, context) {
  const unplaced = path.filter(block => !context.placements.has(block.id));
  if (unplaced.length !== 1 || !isGroundedJRBlock(unplaced[0])) return false;

  const jrBlock = unplaced[0], jrIndex = path.indexOf(jrBlock);
  let producer = null;
  for (let index = jrIndex - 1; index >= 0; index--) {
    const block = path[index];
    if (context.placements.has(block.id) && block.netOut === jrBlock.netIn) {
      producer = block;
      break;
    }
  }
  if (!producer) return false;

  const producerIndex = principalPath.findIndex(block => block.id === producer.id);
  if (producerIndex < 0 || producerIndex >= principalPath.length - 1) return false;

  const consumer = principalPath[producerIndex + 1];
  if (!consumer || !context.placements.has(consumer.id) || consumer.netIn !== jrBlock.netIn) return false;

  const pp = context.placements.get(producer.id), cp = context.placements.get(consumer.id);
  if (pp.row !== cp.row) return false;

  const centerCol = (getPlacementRightColumn(pp) + cp.col) / 2;
  context.placements.set(jrBlock.id, { block: jrBlock, row: pp.row, col: centerCol, centerCol, span: 1, occupiesGrid: false, placementMode: "inline-grounded-jr", hostNet: jrBlock.netIn, hostProducerId: producer.id, hostConsumerId: consumer.id, pairSpacing: 70, rise: 25 });
  return true;
}

function getPrincipalPath(paths) {
  const score = path => path.reduce((count, block) => count + !isGroundedJRBlock(block), 0);
  return paths.reduce((best, candidate) => score(candidate) > score(best) ? candidate : best, paths[0]);
}

function placeInputTerminalPaths(context) {
  for (const inputNet of context.inputTerminalNets) {
    const paths = enumeratePathsFromNet(inputNet, context);
    if (!paths.length) continue;

    const principalPath = getPrincipalPath(paths);
    placePathSegments(principalPath, inputNet, true, context);

    for (const branchPath of paths) {
      if (branchPath === principalPath || tryPlaceInlineGroundedJRPath(branchPath, principalPath, context)) continue;
      if (branchPath.findIndex(block => !context.placements.has(block.id)) > 0) continue;
      placePathSegments(branchPath, inputNet, false, context);
    }
  }
}

function longestRemainingPath(startBlock, context, visiting = new Set()) {
  if (visiting.has(startBlock.id)) return [];

  const nextVisited = new Set(visiting); nextVisited.add(startBlock.id);
  let best = [];

  for (const successor of context.consumersByNet.get(startBlock.netOut) || []) {
    if (context.placements.has(successor.id) || isBiasElement(successor.primary) || nextVisited.has(successor.id)) continue;
    const candidate = longestRemainingPath(successor, context, nextVisited);
    if (getPathSpan(candidate) > getPathSpan(best)) best = candidate;
  }

  return [startBlock, ...best];
}

function placeLeftBoundaryPath(path, boundary, context) {
  boundary.block.forcedTerminalDirection = boundary.direction;
  context.inputTerminalMap.set(boundary.net, { net: boundary.net, row: getNextPrincipalRow(context), col: 0 });
  console.log("[NEW LEFT TERMINAL ROW]", { terminal: boundary.net, block: boundary.block.primary?.id, direction: boundary.direction });
  placePathSegments(path, boundary.net, true, context);
}

function placeRightBoundaryPath(path, boundary, context) {
  boundary.block.forcedTerminalDirection = boundary.direction;
  console.log("[NEW RIGHT TERMINAL ROW]", { terminal: boundary.net, block: boundary.block.primary?.id, direction: boundary.direction });

  placePathSegments(path, null, true, context);
  const placement = context.placements.get(boundary.block.id);
  if (!placement) return;

  placement.outputTerminalRow = true; placement.outputTerminalNet = boundary.net;
  placement.terminalForcedDirection = boundary.direction; placement.terminalDirectionForced = true;
  context.outputTerminalMap.set(boundary.net, { net: boundary.net, row: placement.row, col: 0 });
}

function getPossibleRemainingInputNet(block, context) {
  const net = block.netIn;
  if (!net || isPowerNet(net) || context.explicitOutputNets.has(net)) return null;
  return context.explicitInputNets.has(net) || !(context.producersByNet.get(net) || []).length ? net : null;
}

function placeRemainingPaths(context) {
  while (true) {
    const remainingBlock = context.blocks.find(block => !context.placements.has(block.id) && !isBiasElement(block.primary));
    if (!remainingBlock) return;

    const path = longestRemainingPath(remainingBlock, context), boundary = getBoundaryTerminalForPath(path, context);

    if (boundary?.side === "left") { placeLeftBoundaryPath(path, boundary, context); continue; }
    if (boundary?.side === "right") { placeRightBoundaryPath(path, boundary, context); continue; }

    placePathSegments(path, getPossibleRemainingInputNet(remainingBlock, context), true, context);
  }
}

function findBestGroundedJRHost(jrBlock, context) {
  const hostNet = jrBlock.netIn;
  const producers = context.blocks.filter(block => block.id !== jrBlock.id && !isBiasElement(block.primary) && context.placements.has(block.id) && block.netOut === hostNet);
  const consumers = context.blocks.filter(block => block.id !== jrBlock.id && !isBiasElement(block.primary) && context.placements.has(block.id) && block.netIn === hostNet);
  let best = null;

  for (const producer of producers) {
    const pp = context.placements.get(producer.id);
    for (const consumer of consumers) {
      const cp = context.placements.get(consumer.id);
      if (pp.row !== cp.row) continue;
      const distance = Math.abs(cp.col - getPlacementRightColumn(pp));
      if (!best || distance < best.distance) best = { producer, consumer, pp, cp, distance };
    }
  }

  return best;
}

function forceGroundedJRsInlineOnExistingChains(context) {
  for (const jrBlock of context.blocks) {
    if (!isGroundedJRBlock(jrBlock)) continue;

    const best = findBestGroundedJRHost(jrBlock, context);
    if (!best) { console.warn("[JR INLINE SKIPPED]", { jr: jrBlock.primary?.id, hostNet: jrBlock.netIn }); continue; }

    const centerCol = (getPlacementRightColumn(best.pp) + best.cp.col) / 2;
    context.placements.set(jrBlock.id, { block: jrBlock, row: best.pp.row, col: centerCol, centerCol, span: 1, occupiesGrid: false, placementMode: "inline-grounded-jr", hostNet: jrBlock.netIn, hostProducerId: best.producer.id, hostConsumerId: best.consumer.id, pairSpacing: 70, rise: 25 });
  }
}

function findInlineJRForBias(biasBlock, claimedIds, context) {
  return [...context.placements.values()]
    .filter(p => p.placementMode === "inline-grounded-jr" && p.hostNet === biasBlock.netOut && !claimedIds.has(p.block.id))
    .sort((a, b) => blockOriginalDistance(a.block, biasBlock) - blockOriginalDistance(b.block, biasBlock))[0] || null;
}

function findBiasTargetBlock(biasBlock, context) {
  return context.blocks
    .filter(block => context.placements.has(block.id) && !isBiasElement(block.primary) && (block.netIn === biasBlock.netOut || block.netOut === biasBlock.netOut))
    .sort((a, b) => context.placements.get(a.id).col - context.placements.get(b.id).col)[0] || null;
}

function placeBiasBlocks(context) {
  const claimedInlineJRIds = new Set();

  for (const biasBlock of context.blocks.filter(block => isBiasElement(block.primary))) {
    context.placements.delete(biasBlock.id);

    const inlineJR = findInlineJRForBias(biasBlock, claimedInlineJRIds, context);
    if (inlineJR) {
      claimedInlineJRIds.add(inlineJR.block.id);
      context.placements.set(biasBlock.id, { block: biasBlock, row: inlineJR.row, col: inlineJR.centerCol, centerCol: inlineJR.centerCol, span: 1, occupiesGrid: false, placementMode: "inline-jr-bias", hostNet: biasBlock.netOut, hostJRId: inlineJR.block.id });
      continue;
    }

    const target = findBiasTargetBlock(biasBlock, context);
    if (!target) continue;

    const placement = context.placements.get(target.id);
    context.placements.set(biasBlock.id, { block: biasBlock, row: placement.row, col: placement.col, span: biasBlock.span, occupiesGrid: false, placementMode: "above-target-bias", hostNet: biasBlock.netOut, hostTargetId: target.id });
  }
}

function placeUnassignedBlocks(context) {
  for (const block of context.blocks) {
    if (context.placements.has(block.id)) continue;
    context.placements.set(block.id, { block, row: getNextPrincipalRow(context), col: 1, span: block.span, occupiesGrid: true });
  }
}

function syncExplicitTerminal(net, isInput, context) {
  context.inputTerminalMap.delete(net); context.outputTerminalMap.delete(net);
  const block = context.blocks.find(candidate => isInput ? candidate.netIn === net : candidate.netOut === net);
  const placement = block ? context.placements.get(block.id) : null;
  if (!placement) return;

  const terminal = { net, row: placement.row, col: 0 };
  (isInput ? context.inputTerminalMap : context.outputTerminalMap).set(net, terminal);
}

function syncExplicitTerminals(context) {
  for (const net of context.explicitInputNets) syncExplicitTerminal(net, true, context);
  for (const net of context.explicitOutputNets) syncExplicitTerminal(net, false, context);
}

function normalizePlacementColumns(context) {
  let minimumColumn = 1;
  for (const placement of context.placements.values()) minimumColumn = Math.min(minimumColumn, placement.col);

  const shift = minimumColumn < 1 ? 1 - minimumColumn : 0;
  if (!shift) return;

  for (const placement of context.placements.values()) {
    placement.col += shift;
    if (Number.isFinite(placement.centerCol)) placement.centerCol += shift;
  }
}

function finalizeSequentialPlan(context) {
  normalizePlacementColumns(context);

  let maximumComponentColumn = 1, maximumRow = 0;
  for (const p of context.placements.values()) { maximumComponentColumn = Math.max(maximumComponentColumn, p.col + Math.max(1, p.span) - 1); maximumRow = Math.max(maximumRow, p.row); }

  const rightTerminalColumn = Math.ceil(maximumComponentColumn) + 2;
  for (const terminal of context.outputTerminalMap.values()) terminal.col = rightTerminalColumn;
  for (const terminal of context.inputTerminalMap.values()) maximumRow = Math.max(maximumRow, terminal.row);
  for (const terminal of context.outputTerminalMap.values()) maximumRow = Math.max(maximumRow, terminal.row);

  return {
    placements: context.placements,
    inputTerminals: [...context.inputTerminalMap.values()],
    outputTerminals: [...context.outputTerminalMap.values()],
    rightTerminalColumn,
    columns: rightTerminalColumn + 1,
    rows: maximumRow + 1
  };
}

function buildSequentialTerminalPlan(elements, terminalInfo = {}) {
  const explicitInputNets = new Set(normalizeTerminalNets(terminalInfo.net_in)), explicitOutputNets = new Set(normalizeTerminalNets(terminalInfo.net_out));
  const blocks = createSequentialBlocks(elements, explicitInputNets, explicitOutputNets);
  orientSharedOutputUngroundedJRs(blocks);

  const { consumersByNet, producersByNet } = buildSequentialNetIndexes(blocks);
  const context = {
    blocks, explicitInputNets, explicitOutputNets, consumersByNet, producersByNet,
    placements: new Map(), inputTerminalMap: new Map(), outputTerminalMap: new Map(), inputTerminalNets: []
  };

  context.inputTerminalNets = collectSequentialInputNets(context);
  placeInputTerminalPaths(context);
  placeRemainingPaths(context);
  forceGroundedJRsInlineOnExistingChains(context);
  placeBiasBlocks(context);
  placeUnassignedBlocks(context);
  syncExplicitTerminals(context);

  return finalizeSequentialPlan(context);
}