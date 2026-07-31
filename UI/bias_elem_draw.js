function isBiasElement(element) {
  return getElementType(element) === "IB";
}


function findBiasTarget(bias, placed) {
  const layoutInstance = getLayoutInstance(bias);

  const candidates = placed.filter(
    (element) => element.id !== bias.id && getElementType(element) !== "R" &&
      getLayoutInstance(element) === layoutInstance &&
      (
        element.net_in === bias.net_out || ( getElementType(element) === "L" && element.net_out === bias.net_out )
      )
  );

  if (candidates.length === 0) {
    console.warn(
      `No consumer found for bias ${bias.id}`,
      { netOut: bias.net_out, layoutInstance, }
    );
    return null;
  }

  return candidates.reduce(
    (closest, candidate) => {
      const closestDistance = Math.abs(closest.x - bias.x) + Math.abs(closest.y - bias.y);
      const candidateDistance = Math.abs(candidate.x - bias.x) + Math.abs(candidate.y - bias.y);
      return candidateDistance < closestDistance ? candidate : closest;
    }
  );
}


function isBiasPositionFree(bias, centerX, centerY, placed) {
  const halfSize = drawConfig.imageSize / 2;
  const margin = 8;

  return placed.every((element) => { if (element.id === bias.id) { return true;}

    const otherHalf = drawConfig.imageSize / 2;
    return (
      centerX + halfSize + margin <= element.x - otherHalf ||
      centerX - halfSize - margin >= element.x + otherHalf ||
      centerY + halfSize + margin <= element.y - otherHalf ||
      centerY - halfSize - margin >= element.y + otherHalf
    );
  });
}

function findFreeBiasX(bias, desiredX, centerY, placed
) {
  const spacing = drawConfig.biasPlacementSpacing;
  const offsets = [0, -spacing, spacing, -spacing * 2, spacing * 2, -spacing * 3, spacing * 3,];

  for (const offset of offsets) {
    const candidateX = desiredX + offset;
    if (isBiasPositionFree(bias, candidateX, centerY, placed)
    ) { return candidateX;}
  }

  return desiredX;
}

function placeBiasElementsAboveNetOut(placed) {
  const halfSize = drawConfig.imageSize / 2;
  const gap = Math.max(6, drawConfig.biasOutputGap ?? 12);

  for (const bias of placed) {
    if (!isBiasElement(bias) || !bias.net_out) {
      continue;
    }

    /*
     * Always allow bias elements to be repositioned.
     * Do not preserve a horizontal inline placement.
     */
    bias.biasPlacementLocked = false;
    bias.biasSnappedToNet = false;
    bias.biasNetSegment = null;

    const target = findBiasTarget(bias, placed);

    if (!target) {
      continue;
    }

    const targetIsInductor = getElementType(target) === "L";
    const connectsToOutput =
      targetIsInductor &&
      target.net_out === bias.net_out;

    const targetKind = connectsToOutput ? "out" : "in";

    const rawTargetPin = connectsToOutput
      ? target.outputPin
      : target.inputPin;

    if (!rawTargetPin) {
      continue;
    }

    const targetTerminal = {
      net: bias.net_out,
      kind: targetKind,
      element: target,
      ownerId: target.id,
      layoutInstance: getLayoutInstance(target),
    };

    const targetPin = targetIsInductor
      ? getTerminalRoutingPoint(targetTerminal, rawTargetPin)
      : rawTargetPin;

    const targetDirection =
      target.electricalDirection ??
      target.direction ??
      1;

    const desiredJoinX =
      targetPin.x -
      targetDirection * drawConfig.biasBranchOffset;

    const netY = targetPin.y;

    /*
     * Leave `gap` pixels between the arrow tip and the wire.
     *
     * Bias center:
     *     netY - halfSize - gap
     *
     * Arrow tip:
     *     netY - gap
     *
     * Wire connection:
     *     netY
     */
    const biasCenterY = netY - halfSize - gap;

    const biasCenterX = findFreeBiasX(
      bias,
      desiredJoinX,
      biasCenterY,
      placed
    );

    bias.x = biasCenterX;
    bias.y = biasCenterY;

    // Force the bias arrow to point downward.
    bias.biasRotation = 0;

    // Bottom tip of the downward-pointing arrow.
    bias.biasFrontPin = {
      x: biasCenterX,
      y: biasCenterY + halfSize,
    };

    // Point located directly on the connecting wire.
    bias.biasNetJoin = {
      x: biasCenterX,
      y: netY,
    };

    bias.outputPin = {
      ...bias.biasNetJoin,
      net: bias.net_out,
    };

    bias.biasTarget = target.id;
  }
}

function drawBiasLocalConnections(wireLayer, labelLayer, placed) {
  for (const bias of placed) {
    if (!isBiasElement(bias)) { continue; }

    if (!bias.biasFrontPin || !bias.biasNetJoin
    ) { continue; }

    if (bias.biasNetSegment?.synthetic) {
      drawLine(
        wireLayer,
        labelLayer,
        bias,
        bias.biasNetSegment.a,
        bias.biasNetSegment.b,
        { net: bias.net_out, kind: "bias-net-host", stroke: drawConfig.wireStroke, }
      );
    }

    drawLine(
      wireLayer,
      labelLayer,
      bias,
      bias.biasFrontPin,
      bias.biasNetJoin,
      { net: bias.net_out, kind: "bias-output-stub", stroke: drawConfig.wireStroke,}
    );
  }
}


function findBiasInductorTarget(bias, placed) {
  const layoutInstance = getLayoutInstance(bias);
  const candidates =
    placed.filter((element) => {
      if ( element.id === bias.id || getElementType(element) !== "L" ||
        getLayoutInstance(element) !== layoutInstance
      ) {
        return false;
      }

      return (
        element.net_in === bias.net_out || element.net_out === bias.net_out
      );
    });

  if (candidates.length === 0) { return null;}

  candidates.sort(
    (first, second) => {
      const firstPriority = first.net_in === bias.net_out ? 0 : 1;
      const secondPriority = second.net_in === bias.net_out ? 0 : 1;
      if ( firstPriority !== secondPriority
      ) {
        return ( firstPriority - secondPriority );
      }
      const firstPin = first.net_in === bias.net_out ? first.inputPin : first.outputPin;
      const secondPin = second.net_in === bias.net_out ? second.inputPin : second.outputPin;
      const firstDistance = Math.abs(firstPin.x - bias.biasNetJoin.x) + Math.abs(firstPin.y - bias.biasNetJoin.y);
      const secondDistance = Math.abs(secondPin.x - bias.biasNetJoin.x) + Math.abs(econdPin.y - bias.biasNetJoin.y);
      return (firstDistance - secondDistance);
    }
  );

  return candidates[0];
}

function connectBiasStubsToInductors(wireLayer, labelLayer, placed) {
  for (const bias of placed) {
    if (!isBiasElement(bias) || !bias.biasNetJoin || !bias.net_out
    ) { continue; }

    if (bias.biasSnappedToNet) { continue;}

    const layoutInstance = getLayoutInstance(bias);

    const cellElements =
      placed.filter((element) => getLayoutInstance(element) === layoutInstance);

    const target = findBiasInductorTarget(bias, cellElements);

    if (!target) {continue;}
    const connectsToInput = target.net_in === bias.net_out;
    const targetKind = connectsToInput ? "in" : "out";
    const rawTargetPin = connectsToInput ? target.inputPin : target.outputPin;
    if (!rawTargetPin) { continue; }
    const targetTerminal = {
      net: bias.net_out,
      kind: targetKind,
      element: target,
      ownerId: target.id,
      layoutInstance,
    };

    const targetPoint = getTerminalRoutingPoint(targetTerminal, rawTargetPin);

    const start = {...bias.biasNetJoin,};

    if (Math.abs(start.x - targetPoint.x) < 0.5 && Math.abs(start.y - targetPoint.y) < 0.5
    ) { continue; }

    const routedSegments = [];

    for (const child of wireLayer.children
    ) {
      const childNet = child.dataset.net
      routedSegments.push(...extractWireSegmentsFromElement(child).map(
          (segment) => ({ ...segment, net: childNet ||  "__existing_wire__",})
        )
      );
    }

    const biasTerminal = { net: bias.net_out, kind: "out", point: start, candidatePoints: [start,], element: bias, ownerId: bias.id, layoutInstance, };

    const routePoints =
      buildShortestFreeRoute(start, targetPoint, biasTerminal, targetTerminal, cellElements, routedSegments, bias.net_out);

    if (!Array.isArray(routePoints) || routePoints.length < 2
    ) {
      console.warn(
        `No legal route found for bias ${bias.id}`,
        { net: bias.net_out, start, targetPoint, target: target.id, }
      );
      continue;
    }

    drawPath(wireLayer, routePoints[0],routePoints.at(-1),
      {
        stroke: drawConfig.wireStroke,
        pathData: routePointsToPathData(routePoints),
        net: bias.net_out,
        kind: "bias-net-join",
      }
    );
  }
}

function snapBiasElementsToNearestNet(wireLayer, placed) {
  const halfSize = drawConfig.imageSize / 2;
  const gap = Math.max(6, drawConfig.biasOutputGap ?? 12);
  const spacing = drawConfig.biasPlacementSpacing || 35;

  for (const bias of placed) {
    if (!isBiasElement(bias) || !bias.net_out) {
      continue;
    }

    /*
     * Reconsider every bias, including biases that previously had
     * an inline or locked placement.
     */
    bias.biasPlacementLocked = false;

    const originalX = bias.x;
    const originalY = bias.y;
    const layoutInstance = getLayoutInstance(bias);

    const cellElements = placed.filter(
      (element) =>
        getLayoutInstance(element) === layoutInstance
    );

    const jrObstacleBoxes = buildRoutingObstacleBoxes(
      cellElements,
      new Set([bias.id]),
      8
    ).filter((box) => box.isJRPair);

    let best = null;

    for (const child of wireLayer.children) {
      const childNet = child.dataset.net;
      const childKind = child.dataset.kind || "";

      if (
        childNet !== bias.net_out ||
        childKind.startsWith("bias-")
      ) {
        continue;
      }

      const segments = extractWireSegmentsFromElement(child);

      for (const segment of segments) {
        /*
         * Bias elements must come down onto a horizontal wire.
         * Ignore vertical segments.
         */
        const horizontal =
          Math.abs(segment.a.y - segment.b.y) < 0.5;

        if (!horizontal) {
          continue;
        }

        const minimumX = Math.min(
          segment.a.x,
          segment.b.x
        );

        const maximumX = Math.max(
          segment.a.x,
          segment.b.x
        );

        const netY = segment.a.y;

        const projectedX = Math.max(
          minimumX,
          Math.min(originalX, maximumX)
        );

        const offsets = [
          0,
          -spacing,
          spacing,
          -spacing * 2,
          spacing * 2,
          -spacing * 3,
          spacing * 3,
        ];

        const testedPositions = new Set();

        for (const offset of offsets) {
          const candidateX = Math.max(
            minimumX,
            Math.min(projectedX + offset, maximumX)
          );

          const positionKey = candidateX.toFixed(3);

          if (testedPositions.has(positionKey)) {
            continue;
          }

          testedPositions.add(positionKey);

          /*
           * Position the bias above the net while preserving a
           * vertical gap for the connecting line.
           */
          const candidateY =
            netY -
            halfSize -
            gap;

          const frontPin = {
            x: candidateX,
            y: netY - gap,
          };

          const joinPoint = {
            x: candidateX,
            y: netY,
          };

          const overlapsJRPair = jrObstacleBoxes.some(
            (box) =>
              !(
                candidateX + halfSize <= box.left ||
                candidateX - halfSize >= box.right ||
                candidateY + halfSize <= box.top ||
                candidateY - halfSize >= box.bottom
              )
          );

          const stubCrossesJRPair = jrObstacleBoxes.some(
            (box) =>
              axisAlignedSegmentHitsBox(
                frontPin,
                joinPoint,
                box
              )
          );

          if (overlapsJRPair || stubCrossesJRPair) {
            continue;
          }

          const isFree = isBiasPositionFree(
            bias,
            candidateX,
            candidateY,
            placed
          );

          if (!isFree) {
            continue;
          }

          const movement =
            Math.abs(originalX - candidateX) +
            Math.abs(originalY - candidateY);

          if (!best || movement < best.score) {
            best = {
              x: candidateX,
              y: candidateY,
              rotation: 0,
              frontPin,
              joinPoint,
              score: movement,
            };
          }
        }
      }
    }

    /*
     * The preliminary placement from
     * placeBiasElementsAboveNetOut() remains valid when no matching
     * horizontal SVG wire was found.
     */
    if (!best) {
      bias.biasRotation = 0;
      bias.biasSnappedToNet = false;
      continue;
    }

    bias.x = best.x;
    bias.y = best.y;

    // Downward arrow.
    bias.biasRotation = 0;

    // Arrow tip above the wire.
    bias.biasFrontPin = {
      ...best.frontPin,
    };

    // Connection point on the wire.
    bias.biasNetJoin = {
      ...best.joinPoint,
    };

    bias.outputPin = {
      ...best.joinPoint,
      net: bias.net_out,
    };

    bias.biasNetSegment = null;
    bias.biasSnappedToNet = true;
    bias.biasPlacementLocked = true;
  }
}


function getPlacementBlockPrimary(block) {
  return block.elements.find((element) => getElementType(element) !== "R") || block.elements[0];
}

function getChainSpan(chain) {
  return chain.reduce((total, block) => total + block.span, 0);
}

function buildLongestDirectedChains(elements) {
  const blocks = createPlacementBlocks(elements).map((block) => {
    const primary = getPlacementBlockPrimary(block);

    return {
      ...block,
      primary,
      netIn: primary?.net_in || null,
      netOut: primary?.net_out || null,
      span: block.elements.length,
    };
  });

  const blockById = new Map(blocks.map((block) => [block.id, block]));
  const successors = new Map(blocks.map((block) => [block.id, []]));
  const predecessors = new Map(blocks.map((block) => [block.id, []]));

  for (const producer of blocks) {
    if (!producer.netOut || isPowerNet(producer.netOut)) { continue; }

    for (const consumer of blocks) {
      if (producer === consumer || producer.netOut !== consumer.netIn) { continue; }

      successors.get(producer.id).push(consumer);
      predecessors.get(consumer.id).push(producer);
    }
  }

  const remaining = new Set(blocks.map((block) => block.id));
  const chains = [];

  function longestPathFrom(block, visiting = new Set(), memo = new Map()) {
    if (!remaining.has(block.id) || visiting.has(block.id)) { return []; }
    if (memo.has(block.id)) { return memo.get(block.id); }

    const nextVisiting = new Set(visiting);
    nextVisiting.add(block.id);

    let bestContinuation = [];

    for (const successor of successors.get(block.id) || []) {
      if (!remaining.has(successor.id)) { continue; }

      const candidate = longestPathFrom(successor, nextVisiting, memo);

      if (getChainSpan(candidate) > getChainSpan(bestContinuation)) {
        bestContinuation = candidate;
      }
    }

    const result = [block, ...bestContinuation];
    memo.set(block.id, result);
    return result;
  }

  while (remaining.size > 0) {
    const remainingBlocks = [...remaining].map((id) => blockById.get(id));

    const roots = remainingBlocks.filter((block) =>
      (predecessors.get(block.id) || []).every((predecessor) => !remaining.has(predecessor.id))
    );

    const startingBlocks = roots.length > 0 ? roots : remainingBlocks;
    const memo = new Map();
    let longestChain = [];

    for (const block of startingBlocks) {
      const candidate = longestPathFrom(block, new Set(), memo);

      if (
        getChainSpan(candidate) > getChainSpan(longestChain) ||
        (
          getChainSpan(candidate) === getChainSpan(longestChain) &&
          candidate[0]?.originalIndex < longestChain[0]?.originalIndex
        )
      ) {
        longestChain = candidate;
      }
    }

    if (longestChain.length === 0) {
      longestChain = [remainingBlocks[0]];
    }

    chains.push(longestChain);

    for (const block of longestChain) {
      remaining.delete(block.id);
    }
  }

  return chains;
}