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

  for (const bias of placed) {
    if (!isBiasElement(bias)) { continue; }

    if (bias.inlineJRBias || bias.biasPlacementLocked) { continue; }

    const target = findBiasTarget(bias, placed);
    if (!target) { continue; }

    bias.biasPlacementLocked = false;
    bias.biasSnappedToNet = false;
    bias.biasNetSegment = null;

    const targetIsInductor = getElementType(target) === "L";
    const connectsToOutput = targetIsInductor && target.net_out === bias.net_out;
    const targetKind = connectsToOutput ? "out" : "in";
    const rawTargetPin = connectsToOutput ? target.outputPin : target.inputPin;

    if (!rawTargetPin) { continue; }

    const targetTerminal = {
      net: bias.net_out,
      kind: targetKind,
      element: target,
      ownerId: target.id,
    };

    const targetPin = targetIsInductor
      ? getTerminalRoutingPoint(targetTerminal, rawTargetPin)
      : rawTargetPin;

    const targetDirection = target.electricalDirection ?? target.direction ?? 1;
    const desiredJoinX = targetPin.x - targetDirection * drawConfig.biasBranchOffset;
    const netY = targetPin.y;
    const biasCenterY = netY - halfSize - drawConfig.biasOutputGap;
    const biasCenterX = findFreeBiasX(bias, desiredJoinX, biasCenterY, placed);

    bias.x = biasCenterX;
    bias.y = biasCenterY;
    bias.biasRotation = 0;
    bias.biasFrontPin = { x: biasCenterX, y: biasCenterY + halfSize };
    bias.biasNetJoin = { x: biasCenterX, y: netY };
    bias.outputPin = { ...bias.biasNetJoin, net: bias.net_out };
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
  const gap = drawConfig.biasOutputGap;
  for (const bias of placed) {
    if (!isBiasElement(bias) || !bias.net_out
    ) { continue; }

    if (bias.biasPlacementLocked) { continue; }

    const originalX = bias.x;
    const originalY = bias.y;

    const layoutInstance = getLayoutInstance(bias);
    const cellElements = placed.filter((element) => getLayoutInstance(element) === layoutInstance);

    const jrObstacleBoxes =
      buildRoutingObstacleBoxes(cellElements, new Set([bias.id,]), 8).filter((box) => box.isJRPair);

    let best = null;

    for (const child of wireLayer.children) {
      const childNet = child.dataset.net;
      const childKind = child.dataset.kind;
      if (
        childNet !== bias.net_out ||
        String(childKind || "").startsWith("bias-")
      ) { continue; }

      const segments = extractWireSegmentsFromElement(child);

      for (const segment of segments) {
        const horizontal = Math.abs(segment.a.y - segment.b.y) < 0.5;
        const vertical = Math.abs(segment.a.x - segment.b.x) < 0.5;
        let joinPoint = null;

        if (horizontal) {
          const minimumX = Math.min(segment.a.x, segment.b.x);
          const maximumX = Math.max(segment.a.x, segment.b.x );

          joinPoint = {
            x: Math.max(minimumX, Math.min(originalX, maximumX)),
            y: segment.a.y,
          };
        } else if (vertical) {
          const minimumY =  Math.min(segment.a.y, segment.b.y);

          const maximumY = Math.max(segment.a.y, segment.b.y);

          joinPoint = {
            x: segment.a.x,
            y: Math.max(minimumY, Math.min(originalY, maximumY)),
          };
        }

        if (!joinPoint) { continue; }
        const candidates = [];
        if (horizontal) {
          candidates.push(
            {
              x: joinPoint.x,
              y: joinPoint.y - halfSize - gap,
              rotation: 0,
              frontPin: {
                x: joinPoint.x,
                y: joinPoint.y - gap,
              },
              joinPoint,
            },

            {
              x: joinPoint.x,
              y: joinPoint.y + halfSize + gap,
              rotation: 180,
              frontPin: {
                x: joinPoint.x,
                y: joinPoint.y + gap,
              },
              joinPoint,
            }
          );
        } else if (vertical) {
          candidates.push(
            {
              x: joinPoint.x - halfSize - gap,
              y: joinPoint.y,
              rotation: -90,
              frontPin: { 
                x: joinPoint.x - gap,
                y: joinPoint.y,
              },
              joinPoint,
            },

            {
              x: joinPoint.x + halfSize + gap,
              y: joinPoint.y,
              rotation: 90,
              frontPin: {
                x: joinPoint.x + gap,
                y: joinPoint.y,
              },
              joinPoint,
            }
          );
        }

        for (const candidate of candidates) {
          const halfSize = drawConfig.imageSize / 2;

          const overlapsJRPair =
            jrObstacleBoxes.some(
              (box) => !(candidate.x +  halfSize <=  box.left || candidate.x - halfSize >= box.right ||
                  candidate.y + halfSize <= box.top || candidate.y - halfSize >= box.bottom )
            );


          const stubCrossesJRPair =
            jrObstacleBoxes.some(
              (box) => axisAlignedSegmentHitsBox(candidate.frontPin, joinPoint, box)
            );

          if (overlapsJRPair || stubCrossesJRPair
          ) { continue; }
          const isFree = isBiasPositionFree(bias, candidate.x, candidate.y, placed);
          const movement = Math.abs(originalX - candidate.x) + Math.abs(originalY - candidate.y );
          const score = movement + (isFree ? 0 : 1000000);

          if (!best ||  score < best.score
          ) { best = {...candidate, score,};
          }
        }
      }
    }

    if (!best) {
      bias.biasSnappedToNet = false;
      continue;
    }

    bias.x = best.x;
    bias.y = best.y;
    bias.biasRotation = best.rotation;
    bias.biasFrontPin = {...best.frontPin,};
    bias.biasNetJoin = {...best.joinPoint,};
    bias.outputPin = {...best.joinPoint, net: bias.net_out,};
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