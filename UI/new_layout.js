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

function buildSequentialTerminalPlan(elements, terminalInfo = {}) {
  const normalizeNets = value => {
    if (Array.isArray(value)) return value.map(net => String(net).trim()).filter(Boolean);
    if (value == null) return [];
    return String(value).split(",").map(net => net.trim()).filter(Boolean);
  };
  const explicitInputNets = new Set(normalizeNets(terminalInfo.net_in)), explicitOutputNets = new Set(normalizeNets(terminalInfo.net_out));

  const blocks = createPlacementBlocks(elements).map(block => {
    const primary = getPlacementBlockPrimary(block), rawNetIn = primary?.net_in || null, rawNetOut = primary?.net_out || null;
    const reverseForBoundary = Boolean((rawNetIn && explicitOutputNets.has(rawNetIn) && !explicitOutputNets.has(rawNetOut)) || (rawNetOut && explicitInputNets.has(rawNetOut) && !explicitInputNets.has(rawNetIn)));
    return { ...block, primary, rawNetIn, rawNetOut, reverseForBoundary, netIn: reverseForBoundary ? rawNetOut : rawNetIn, netOut: reverseForBoundary ? rawNetIn : rawNetOut, span: Math.max(1, block.elements.length) };
  });

  function getBoundaryTerminalForPath(path) {
    if (!path?.length) return null;

    const first = path[0], last = path.at(-1);

    for (const net of inputTerminalNets) {
      if (first.rawNetIn === net) return { net, side: "left", direction: 1, block: first };
      if (first.rawNetOut === net) return { net, side: "left", direction: -1, block: first };
    }

    if (isOutputTerminalNet(last.rawNetOut)) return { net: last.rawNetOut, side: "right", direction: 1, block: last };
    if (isOutputTerminalNet(last.rawNetIn)) return { net: last.rawNetIn, side: "right", direction: -1, block: last };

    return null;
  }

  orientSharedOutputUngroundedJRs(blocks);

  const consumersByNet = new Map(), producersByNet = new Map();

  for (const block of blocks) {
    addToMap(producersByNet, block.netOut, block);
    if (!isBiasElement(block.primary)) addToMap(consumersByNet, block.netIn, block);
  }

  const inputTerminalNets = [], seenInputTerminals = new Set();

  for (const block of blocks) {
    if (isBiasElement(block.primary) || !block.netIn || isPowerNet(block.netIn) || explicitOutputNets.has(block.netIn)) continue;
    const producers = producersByNet.get(block.netIn) || [];
    if ((explicitInputNets.has(block.netIn) || producers.length === 0) && !seenInputTerminals.has(block.netIn)) {
      seenInputTerminals.add(block.netIn); inputTerminalNets.push(block.netIn);
    }
  }

  for (const net of explicitInputNets) {
    if (!seenInputTerminals.has(net) && !explicitOutputNets.has(net)) {
      seenInputTerminals.add(net); inputTerminalNets.push(net);
    }
  }

  const firstIndexByNet = new Map();
  for (const block of blocks) for (const net of [block.netIn, block.netOut]) if (net && !firstIndexByNet.has(net)) firstIndexByNet.set(net, block.originalIndex ?? Infinity);
  inputTerminalNets.sort((a, b) => (firstIndexByNet.get(a) ?? Infinity) - (firstIndexByNet.get(b) ?? Infinity));

  function isOutputTerminalNet(net) {
    if (!net || isPowerNet(net)) return false;
    if (explicitOutputNets.has(net)) return true;
    if (explicitInputNets.has(net)) return false;
    return (consumersByNet.get(net) || []).length === 0;
  }

  function enumeratePathsFromNet(startNet, maximumPaths = 512) {
    const paths = [];
    function walk(block, path, visited) {
      if (paths.length >= maximumPaths) return;
      const currentPath = [...path, block], nextVisited = new Set(visited); nextVisited.add(block.id);
      const successors = (consumersByNet.get(block.netOut) || []).filter(candidate => !isBiasElement(candidate.primary) && !nextVisited.has(candidate.id));
      if (!successors.length) { paths.push(currentPath); return; }
      for (const successor of successors) walk(successor, currentPath, nextVisited);
    }
    for (const block of consumersByNet.get(startNet) || []) if (!isBiasElement(block.primary)) walk(block, [], new Set());
    return paths.sort((a, b) => getPathSpan(b) - getPathSpan(a) || a[0].originalIndex - b[0].originalIndex);
  }

  const placements = new Map(), inputTerminalMap = new Map(), outputTerminalMap = new Map();

  const getPlacementRightColumn = placement => placement.col + placement.span - 1;

  function tryPlaceInlineUngroundedJRPath(path, principalPath) {
    const unplaced = path.filter(block => !placements.has(block.id));
    if (unplaced.length !== 1 || !isUngroundedJRBlock(unplaced[0])) return false;

    const jrBlock = unplaced[0], jrIndex = path.indexOf(jrBlock);
    const producer = [...path.slice(0, jrIndex)].reverse().find(block => placements.has(block.id) && block.netOut === jrBlock.netIn);
    if (!producer) return false;

    const producerPlacement = placements.get(producer.id), row = producerPlacement.row;
    let startColumn = getPlacementRightColumn(producerPlacement) + 2;
    const successor = [...path.slice(jrIndex + 1), ...principalPath].find(block => placements.has(block.id) && block.netIn === jrBlock.netOut);
    let successorPlacement = successor ? placements.get(successor.id) : null;

    if (successorPlacement?.row === row) {
      const required = startColumn + jrBlock.span + 1;
      if (successorPlacement.col < required) { shiftColumnsFrom(successorPlacement.col, required - successorPlacement.col); successorPlacement = placements.get(successor.id); }
    }

    if (!isColumnRangeFree(row, startColumn, jrBlock.span)) { shiftColumnsFrom(startColumn, jrBlock.span + 1); startColumn = getPlacementRightColumn(placements.get(producer.id)) + 2; }

    const placement = { block: jrBlock, row, col: startColumn, span: jrBlock.span, occupiesGrid: true, placementMode: "inline-ungrounded-jr", hostProducerId: producer.id, hostConsumerId: successor?.id || null };
    if (successorPlacement) { placement.mergeTargetId = successor.id; placement.mergeTargetRow = successorPlacement.row; placement.mergeNet = jrBlock.netOut; }
    placements.set(jrBlock.id, placement);
    return true;
  }

  function tryPlaceInlineGroundedJRPath(path, principalPath) {
    const unplaced = path.filter(block => !placements.has(block.id));
    if (unplaced.length !== 1 || !isGroundedJRBlock(unplaced[0])) return false;

    const jrBlock = unplaced[0], jrIndex = path.indexOf(jrBlock);
    const producer = [...path.slice(0, jrIndex)].reverse().find(block => placements.has(block.id) && block.netOut === jrBlock.netIn);
    if (!producer) return false;

    const producerIndex = principalPath.findIndex(block => block.id === producer.id);
    if (producerIndex < 0 || producerIndex >= principalPath.length - 1) return false;

    const consumer = principalPath[producerIndex + 1];
    if (!consumer || !placements.has(consumer.id) || consumer.netIn !== jrBlock.netIn) return false;

    const pp = placements.get(producer.id), cp = placements.get(consumer.id);
    if (pp.row !== cp.row) return false;

    const centerCol = (getPlacementRightColumn(pp) + cp.col) / 2;
    placements.set(jrBlock.id, { block: jrBlock, row: pp.row, col: centerCol, centerCol, span: 1, occupiesGrid: false, placementMode: "inline-grounded-jr", hostNet: jrBlock.netIn, hostProducerId: producer.id, hostConsumerId: consumer.id, pairSpacing: 70, rise: 25 });
    return true;
  }

  function forceGroundedJRsInlineOnExistingChains() {
    for (const jrBlock of blocks) {
      if (!isGroundedJRBlock(jrBlock)) continue;

      const hostNet = jrBlock.netIn;
      const producers = blocks.filter(block => block.id !== jrBlock.id && !isBiasElement(block.primary) && placements.has(block.id) && block.netOut === hostNet);
      const consumers = blocks.filter(block => block.id !== jrBlock.id && !isBiasElement(block.primary) && placements.has(block.id) && block.netIn === hostNet);

      console.log("[JR INLINE CHECK]", { jr: jrBlock.primary?.id, hostNet, producers: producers.map(b => b.primary?.id), consumers: consumers.map(b => b.primary?.id) });

      let best = null;
      for (const producer of producers) {
        const pp = placements.get(producer.id);
        for (const consumer of consumers) {
          const cp = placements.get(consumer.id);
          if (pp.row !== cp.row) continue;
          const distance = Math.abs(cp.col - getPlacementRightColumn(pp));
          if (!best || distance < best.distance) best = { producer, consumer, pp, cp, distance };
        }
      }

      if (!best) { console.warn("[JR INLINE SKIPPED]", { jr: jrBlock.primary?.id, hostNet }); continue; }

      const centerCol = (getPlacementRightColumn(best.pp) + best.cp.col) / 2;
      placements.set(jrBlock.id, { block: jrBlock, row: best.pp.row, col: centerCol, centerCol, span: 1, occupiesGrid: false, placementMode: "inline-grounded-jr", hostNet, hostProducerId: best.producer.id, hostConsumerId: best.consumer.id, pairSpacing: 70, rise: 25 });

      console.log("[JR INLINE]", { jr: jrBlock.primary?.id, hostNet, producer: best.producer.primary?.id, consumer: best.consumer.primary?.id, row: best.pp.row, centerCol });
    }
  }

  function getMaximumRow() {
    let max = -1;
    for (const placement of placements.values()) max = Math.max(max, placement.row);
    return max;
  }

  const getNextPrincipalRow = () => { const max = getMaximumRow(); return max < 0 ? 0 : max + 1; };

  function shiftColumnsFrom(startColumn, amount) {
    if (amount <= 0) return;
    for (const placement of placements.values()) {
      if (placement.col < startColumn) continue;
      placement.col += amount;
      if (Number.isFinite(placement.centerCol)) placement.centerCol += amount;
    }
    for (const terminal of inputTerminalMap.values()) if (terminal.col >= startColumn) terminal.col += amount;
    for (const terminal of outputTerminalMap.values()) if (terminal.col >= startColumn) terminal.col += amount;
  }

  function isColumnRangeFree(row, startColumn, span) {
    for (const p of placements.values()) if (p.row === row && p.occupiesGrid !== false && columnRangesOverlap(startColumn, span, p.col, p.span)) return false;
    for (const t of inputTerminalMap.values()) if (t.row === row && columnRangesOverlap(startColumn, span, t.col, 1)) return false;
    return true;
  }

  function placeBlockSequence(sequence, row, startColumn) {
    let column = startColumn;

    for (const block of sequence) {
      const forcedDirection = Number.isFinite(block.forcedTerminalDirection) ? block.forcedTerminalDirection : null;
      const reversed = forcedDirection !== null ? forcedDirection < 0 : block.inlineReversed === true || block.reverseForBoundary === true;
      const direction = forcedDirection ?? (reversed ? -1 : 1);

      console.log("[PLACE BLOCK]", {
        block: block.primary?.id,
        row,
        col: column,
        rawIn: block.rawNetIn,
        rawOut: block.rawNetOut,
        netIn: block.netIn,
        netOut: block.netOut,
        forcedDirection,
        reversed,
        direction
      });

      for (const element of block.elements) {
        element.electricalDirection = direction;
        element.layoutReversed = reversed;
        element.inlineReversed = block.inlineReversed === true;
        element.terminalDirectionForced = forcedDirection !== null;
      }

      placements.set(block.id, {
        block, row, col: column, span: block.span, occupiesGrid: true,
        inlineReversed: block.inlineReversed === true,
        terminalDirectionForced: forcedDirection !== null,
        terminalForcedDirection: forcedDirection
      });

      column += block.span + 1;
    }

    return column;
  }

  function ensureInputTerminal(net, row) {
    if (!net || explicitOutputNets.has(net) || inputTerminalMap.has(net)) return;
    inputTerminalMap.set(net, { net, row, col: 0 });
  }

  function ensureOutputTerminal(net, row) {
    if (!isOutputTerminalNet(net) || outputTerminalMap.has(net)) return;
    outputTerminalMap.set(net, { net, row, col: 0 });
  }

  function placePathSegments(path, inputTerminalNet = null, principalPath = false) {
    if (!Array.isArray(path) || !path.length) return;

    console.group(`[PATH] terminal=${inputTerminalNet || "NONE"} principal=${principalPath}`);
    console.log("[PATH BLOCKS]", path.map(b => ({ id: b.primary?.id, rawIn: b.rawNetIn, rawOut: b.rawNetOut, netIn: b.netIn, netOut: b.netOut, alreadyPlaced: placements.has(b.id) })));

    let index = 0, placedAnySegment = false, fixedRow = null;

    while (index < path.length) {
      while (index < path.length && placements.has(path[index].id)) index++;
      if (index >= path.length) break;

      const segmentStart = index;
      while (index < path.length && !placements.has(path[index].id)) index++;

      const segmentEnd = index, segment = path.slice(segmentStart, segmentEnd);
      let predecessor = segmentStart > 0 ? path[segmentStart - 1] : null;
      const successor = segmentEnd < path.length ? path[segmentEnd] : null;
      let predecessorPlacement = predecessor ? placements.get(predecessor.id) : null;
      let successorPlacement = successor ? placements.get(successor.id) : null;

      const firstBlock = segment[0];
      const startsAtTerminal = Boolean(segmentStart === 0 && inputTerminalNet && !predecessorPlacement);

      console.log("[SEGMENT START]", {
        inputTerminalNet,
        segmentStart,
        segmentEnd,
        startsAtTerminal,
        firstBlock: firstBlock?.primary?.id,
        firstRawIn: firstBlock?.rawNetIn,
        firstRawOut: firstBlock?.rawNetOut,
        firstNetIn: firstBlock?.netIn,
        firstNetOut: firstBlock?.netOut,
        predecessor: predecessor?.primary?.id || null,
        predecessorPlaced: Boolean(predecessorPlacement)
      });

      if (startsAtTerminal) {
        if (firstBlock.rawNetIn === inputTerminalNet) {
          firstBlock.forcedTerminalDirection = 1;
          console.log("✅ [TERMINAL FACES LEFT - NORMAL]", { terminal: inputTerminalNet, block: firstBlock.primary?.id, direction: 1 });
        } else if (firstBlock.rawNetOut === inputTerminalNet) {
          firstBlock.forcedTerminalDirection = -1;
          console.log("✅ [TERMINAL FACES LEFT - ROTATED 180]", { terminal: inputTerminalNet, block: firstBlock.primary?.id, direction: -1 });
        } else {
          console.warn("❌ [TERMINAL DOES NOT MATCH FIRST BLOCK RAW NETS]", {
            terminal: inputTerminalNet,
            block: firstBlock.primary?.id,
            rawIn: firstBlock.rawNetIn,
            rawOut: firstBlock.rawNetOut,
            netIn: firstBlock.netIn,
            netOut: firstBlock.netOut
          });
        }

        if (!inputTerminalMap.has(inputTerminalNet)) {
          const proposedRow = getNextPrincipalRow();
          inputTerminalMap.set(inputTerminalNet, { net: inputTerminalNet, row: proposedRow, col: 0 });
          console.log("[TERMINAL CREATED]", { terminal: inputTerminalNet, row: proposedRow, col: 0 });
        }
      }

      if (!predecessorPlacement && !startsAtTerminal && segment.length) {
        const sharedOutputPredecessors = blocks.filter(candidate => candidate.id !== firstBlock.id && placements.has(candidate.id) && !isBiasElement(candidate.primary) && firstBlock.rawNetOut && (candidate.rawNetOut === firstBlock.rawNetOut || candidate.netOut === firstBlock.rawNetOut))
          .sort((a, b) => Math.abs((a.originalIndex ?? 0) - (firstBlock.originalIndex ?? 0)) - Math.abs((b.originalIndex ?? 0) - (firstBlock.originalIndex ?? 0)));

        if (sharedOutputPredecessors.length) {
          predecessor = sharedOutputPredecessors[0];
          predecessorPlacement = placements.get(predecessor.id);
          firstBlock.inlineReversed = true;
          console.log("[RECOVERED SHARED-OUTPUT PREDECESSOR]", { first: firstBlock.primary?.id, predecessor: predecessor.primary?.id });
        } else {
          const placedProducers = (producersByNet.get(firstBlock.netIn) || []).filter(candidate => candidate.id !== firstBlock.id && placements.has(candidate.id) && !isBiasElement(candidate.primary))
            .sort((a, b) => Math.abs((a.originalIndex ?? 0) - (firstBlock.originalIndex ?? 0)) - Math.abs((b.originalIndex ?? 0) - (firstBlock.originalIndex ?? 0)));

          if (placedProducers.length) {
            predecessor = placedProducers[0];
            predecessorPlacement = placements.get(predecessor.id);
            console.log("[RECOVERED NORMAL PREDECESSOR]", { first: firstBlock.primary?.id, predecessor: predecessor.primary?.id });
          }
        }
      }

      const inputTerminal = inputTerminalNet ? inputTerminalMap.get(inputTerminalNet) : null;
      const segmentSpan = getPathSpan(segment);

      if (fixedRow === null) {
        const continuesThroughUngroundedJR = Boolean(predecessorPlacement && segment.some(isUngroundedJRBlock));

        fixedRow = startsAtTerminal
          ? inputTerminal?.row ?? getNextPrincipalRow()
          : continuesThroughUngroundedJR
            ? predecessorPlacement.row
            : principalPath
              ? predecessorPlacement?.row ?? inputTerminal?.row ?? getNextPrincipalRow()
              : getNextPrincipalRow();

        if (startsAtTerminal) inputTerminalMap.set(inputTerminalNet, { net: inputTerminalNet, row: fixedRow, col: 0 });

        console.log("[ROW CHOSEN]", {
          terminal: inputTerminalNet,
          row: fixedRow,
          startsAtTerminal,
          terminalRecord: inputTerminalNet ? inputTerminalMap.get(inputTerminalNet) : null
        });
      }

      const row = fixedRow;
      const startColumn = startsAtTerminal ? 1 : predecessorPlacement ? getPlacementRightColumn(predecessorPlacement) + 2 : 1;

      console.log("[SEGMENT POSITION]", {
        terminal: inputTerminalNet,
        row,
        startColumn,
        startsAtTerminal,
        blocks: segment.map(b => b.primary?.id)
      });

      if (successorPlacement?.row === row) {
        const required = startColumn + segmentSpan + 1;
        if (successorPlacement.col < required) {
          console.log("[SHIFTING SUCCESSOR]", { successor: successor.primary?.id, oldCol: successorPlacement.col, required });
          shiftColumnsFrom(successorPlacement.col, required - successorPlacement.col);
          successorPlacement = placements.get(successor.id);
        }
      }

      if (!isColumnRangeFree(row, startColumn, segmentSpan)) {
        console.warn("[COLUMN NOT FREE]", { row, startColumn, segmentSpan });
        shiftColumnsFrom(startColumn, segmentSpan + 1);
      }

      placeBlockSequence(segment, row, startColumn);
      placedAnySegment = true;

      if (startsAtTerminal) inputTerminalMap.set(inputTerminalNet, { net: inputTerminalNet, row, col: 0 });

      const lastBlock = segment.at(-1), lastPlacement = placements.get(lastBlock.id);

      if (successorPlacement) {
        lastPlacement.mergeTargetId = successor.id;
        lastPlacement.mergeTargetRow = successorPlacement.row;
        lastPlacement.mergeNet = lastBlock.netOut;
        lastPlacement.placementMode = successorPlacement.row === row ? "straight-chain-continuation" : "cross-row-merge";
      } else if (segmentEnd === path.length) ensureOutputTerminal(lastBlock.netOut, row);
    }

    const firstPlacement = placements.get(path[0].id), lastPlacement = placements.get(path.at(-1).id);

    if (!placedAnySegment && firstPlacement && inputTerminalNet) inputTerminalMap.set(inputTerminalNet, { net: inputTerminalNet, row: firstPlacement.row, col: 0 });
    if (lastPlacement && !lastPlacement.mergeTargetId) ensureOutputTerminal(path.at(-1).netOut, lastPlacement.row);

    console.log("[PATH RESULT]", {
      terminal: inputTerminalNet,
      terminalRecord: inputTerminalNet ? inputTerminalMap.get(inputTerminalNet) : null,
      placements: path.map(b => ({ block: b.primary?.id, placement: placements.get(b.id), forcedDirection: b.forcedTerminalDirection }))
    });

    console.groupEnd();
  }
  for (const inputNet of inputTerminalNets) {
    const paths = enumeratePathsFromNet(inputNet);

    console.log("[TERMINAL PATHS]", {
      terminal: inputNet,
      paths: paths.map(path => path.map(b => ({
        id: b.primary?.id,
        rawIn: b.rawNetIn,
        rawOut: b.rawNetOut,
        netIn: b.netIn,
        netOut: b.netOut
      })))
    });
    if (!paths.length) continue;

    const principalPath = paths.reduce((best, candidate) => candidate.filter(block => !isGroundedJRBlock(block)).length > best.filter(block => !isGroundedJRBlock(block)).length ? candidate : best, paths[0]);
    placePathSegments(principalPath, inputNet, true);

    for (const branchPath of paths) {
      if (branchPath === principalPath) continue;
      if (tryPlaceInlineGroundedJRPath(branchPath, principalPath)) continue;

      const firstUnplacedIndex = branchPath.findIndex(block => !placements.has(block.id));
      if (firstUnplacedIndex > 0) continue;

      placePathSegments(branchPath, inputNet, false);
    }
  }

  function longestRemainingPath(startBlock, visiting = new Set()) {
    if (visiting.has(startBlock.id)) return [];
    const next = new Set(visiting); next.add(startBlock.id);
    let best = [];

    for (const successor of consumersByNet.get(startBlock.netOut) || []) {
      if (placements.has(successor.id) || isBiasElement(successor.primary) || next.has(successor.id)) continue;
      const candidate = longestRemainingPath(successor, next);
      if (getPathSpan(candidate) > getPathSpan(best)) best = candidate;
    }

    return [startBlock, ...best];
  }

  while (true) {
    const remainingBlock = blocks.find(block => !placements.has(block.id) && !isBiasElement(block.primary));
    if (!remainingBlock) break;

    const path = longestRemainingPath(remainingBlock), boundary = getBoundaryTerminalForPath(path);

    console.log("[REMAINING PATH BOUNDARY CHECK]", {
      path: path.map(b => b.primary?.id),
      first: path[0]?.primary?.id,
      last: path.at(-1)?.primary?.id,
      firstRawIn: path[0]?.rawNetIn,
      firstRawOut: path[0]?.rawNetOut,
      lastRawIn: path.at(-1)?.rawNetIn,
      lastRawOut: path.at(-1)?.rawNetOut,
      boundary
    });

    if (boundary?.side === "left") {
      boundary.block.forcedTerminalDirection = boundary.direction;
      inputTerminalMap.set(boundary.net, { net: boundary.net, row: getNextPrincipalRow(), col: 0 });

      console.log("✅ [NEW LEFT TERMINAL ROW]", { terminal: boundary.net, block: boundary.block.primary?.id, direction: boundary.direction });

      placePathSegments(path, boundary.net, true);
      continue;
    }

    if (boundary?.side === "right") {
      boundary.block.forcedTerminalDirection = boundary.direction;

      console.log("✅ [NEW RIGHT TERMINAL ROW]", {
        terminal: boundary.net,
        block: boundary.block.primary?.id,
        direction: boundary.direction
      });

      placePathSegments(path, null, true);

      const terminalPlacement = placements.get(boundary.block.id);
      if (terminalPlacement) {
        terminalPlacement.outputTerminalRow = true;
        terminalPlacement.outputTerminalNet = boundary.net;
        terminalPlacement.terminalForcedDirection = boundary.direction;
        terminalPlacement.terminalDirectionForced = true;
        outputTerminalMap.set(boundary.net, { net: boundary.net, row: terminalPlacement.row, col: 0 });
      }

      continue;
    }

    const possibleInputTerminal =
      remainingBlock.netIn &&
      !isPowerNet(remainingBlock.netIn) &&
      !explicitOutputNets.has(remainingBlock.netIn) &&
      (explicitInputNets.has(remainingBlock.netIn) || (producersByNet.get(remainingBlock.netIn) || []).length === 0)
        ? remainingBlock.netIn : null;

    placePathSegments(path, possibleInputTerminal, true);
  }

  forceGroundedJRsInlineOnExistingChains();

  const claimedInlineJRIds = new Set();

  for (const biasBlock of blocks.filter(block => isBiasElement(block.primary))) {
    if (placements.has(biasBlock.id)) placements.delete(biasBlock.id);

    const inlineJRPlacement = [...placements.values()]
      .filter(p => p.placementMode === "inline-grounded-jr" && p.hostNet === biasBlock.netOut && !claimedInlineJRIds.has(p.block.id))
      .sort((a, b) => Math.abs((a.block.originalIndex ?? 0) - (biasBlock.originalIndex ?? 0)) - Math.abs((b.block.originalIndex ?? 0) - (biasBlock.originalIndex ?? 0)))[0];

    if (inlineJRPlacement) {
      claimedInlineJRIds.add(inlineJRPlacement.block.id);
      placements.set(biasBlock.id, { block: biasBlock, row: inlineJRPlacement.row, col: inlineJRPlacement.centerCol, centerCol: inlineJRPlacement.centerCol, span: 1, occupiesGrid: false, placementMode: "inline-jr-bias", hostNet: biasBlock.netOut, hostJRId: inlineJRPlacement.block.id });
      continue;
    }

    const target = blocks.filter(block => placements.has(block.id) && !isBiasElement(block.primary) && (block.netIn === biasBlock.netOut || block.netOut === biasBlock.netOut))
      .sort((a, b) => placements.get(a.id).col - placements.get(b.id).col)[0];

    if (target) {
      const p = placements.get(target.id);
      placements.set(biasBlock.id, { block: biasBlock, row: p.row, col: p.col, span: biasBlock.span, occupiesGrid: false, placementMode: "above-target-bias", hostNet: biasBlock.netOut, hostTargetId: target.id });
    }
  }

  for (const block of blocks) {
    if (placements.has(block.id)) continue;
    placements.set(block.id, { block, row: getNextPrincipalRow(), col: 1, span: block.span, occupiesGrid: true });
  }

  for (const net of explicitInputNets) {
    inputTerminalMap.delete(net); outputTerminalMap.delete(net);
    const block = blocks.find(candidate => candidate.netIn === net), placement = block ? placements.get(block.id) : null;
    if (placement) inputTerminalMap.set(net, { net, row: placement.row, col: 0 });
  }

  for (const net of explicitOutputNets) {
    inputTerminalMap.delete(net); outputTerminalMap.delete(net);
    const block = blocks.find(candidate => candidate.netOut === net), placement = block ? placements.get(block.id) : null;
    if (placement) outputTerminalMap.set(net, { net, row: placement.row, col: 0 });
  }

  let minimumColumn = 1;
  for (const p of placements.values()) minimumColumn = Math.min(minimumColumn, p.col);

  const columnShift = minimumColumn < 1 ? 1 - minimumColumn : 0;
  if (columnShift > 0) for (const p of placements.values()) { p.col += columnShift; if (Number.isFinite(p.centerCol)) p.centerCol += columnShift; }

  let maximumComponentColumn = 1;
  for (const p of placements.values()) maximumComponentColumn = Math.max(maximumComponentColumn, p.col + Math.max(1, p.span) - 1);

  const rightTerminalColumn = Math.ceil(maximumComponentColumn) + 2;

  for (const terminal of outputTerminalMap.values()) terminal.col = rightTerminalColumn;

  let maximumRow = 0;
  for (const p of placements.values()) maximumRow = Math.max(maximumRow, p.row);
  for (const t of inputTerminalMap.values()) maximumRow = Math.max(maximumRow, t.row);
  for (const t of outputTerminalMap.values()) maximumRow = Math.max(maximumRow, t.row);

  return { placements, inputTerminals: [...inputTerminalMap.values()], outputTerminals: [...outputTerminalMap.values()], rightTerminalColumn, columns: rightTerminalColumn + 1, rows: maximumRow + 1 };
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