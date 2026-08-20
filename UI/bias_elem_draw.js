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


    bias.biasPlacementLocked = false;
    bias.biasSnappedToNet = false;
    bias.biasNetSegment = null;

    const target = findBiasTarget(bias, placed);

    if (!target) {
      continue;
    }

    const targetIsInductor = getElementType(target) === "L";
    const connectsToOutput = targetIsInductor && target.net_out === bias.net_out;

    const targetKind = connectsToOutput ? "out" : "in";

    const rawTargetPin = connectsToOutput ? target.outputPin : target.inputPin;

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

    const targetPin = targetIsInductor ? getTerminalRoutingPoint(targetTerminal, rawTargetPin) : rawTargetPin;
    const targetDirection = target.electricalDirection ?? target.direction ?? 1;
    const desiredJoinX = targetPin.x - targetDirection * drawConfig.biasBranchOffset;
    const netY = targetPin.y;
    const biasCenterY = netY - halfSize - gap;
    const biasCenterX = findFreeBiasX(bias, desiredJoinX, biasCenterY, placed);

    bias.x = biasCenterX;
    bias.y = biasCenterY;
    bias.biasRotation = 0;
    bias.biasFrontPin = {x: biasCenterX, y: biasCenterY + halfSize,};
    bias.biasNetJoin = {x: biasCenterX, y: netY,};
    bias.outputPin = {...bias.biasNetJoin, net: bias.net_out,};
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

function getExistingRoutedSegments(wireLayer) {
  const routedSegments = [];
  for (const child of wireLayer.children) {
    const childNet = child.dataset.net;
    routedSegments.push(...extractWireSegmentsFromElement(child).map((segment) => ({ ...segment, net: childNet || "__existing_wire__" })));
  }
  return routedSegments;
}

function getBiasTargetData(bias, cellElements, layoutInstance) {
  const target = findBiasInductorTarget(bias, cellElements);
  if (!target) return null;

  const connectsToInput = target.net_in === bias.net_out;
  const rawTargetPin = connectsToInput ? target.inputPin : target.outputPin;
  if (!rawTargetPin) return null;

  const targetTerminal = {
    net: bias.net_out, kind: connectsToInput ? "in" : "out", element: target,
    ownerId: target.id, layoutInstance
  };

  return { target, targetTerminal, targetPoint: getTerminalRoutingPoint(targetTerminal, rawTargetPin) };
}

function pointsAreSame(first, second) {
  return Math.abs(first.x - second.x) < 0.5 && Math.abs(first.y - second.y) < 0.5;
}

function createBiasTerminal(bias, start, layoutInstance) {
  return {
    net: bias.net_out, kind: "out", point: start, candidatePoints: [start],
    element: bias, ownerId: bias.id, layoutInstance
  };
}

function routeBiasToInductor(bias, cellElements, wireLayer, layoutInstance) {
  const targetData = getBiasTargetData(bias, cellElements, layoutInstance);
  if (!targetData) return null;

  const { target, targetTerminal, targetPoint } = targetData;
  const start = { ...bias.biasNetJoin };
  if (pointsAreSame(start, targetPoint)) return null;

  const routedSegments = getExistingRoutedSegments(wireLayer);
  const biasTerminal = createBiasTerminal(bias, start, layoutInstance);
  const routePoints = buildShortestFreeRoute(start, targetPoint, biasTerminal, targetTerminal, cellElements, routedSegments, bias.net_out);

  if (!Array.isArray(routePoints) || routePoints.length < 2) {
    console.warn(`No legal route found for bias ${bias.id}`, { net: bias.net_out, start, targetPoint, target: target.id });
    return null;
  }

  return routePoints;
}

function drawBiasRoute(wireLayer, bias, routePoints) {
  drawPath(wireLayer, routePoints[0], routePoints.at(-1), {
    stroke: drawConfig.wireStroke, pathData: routePointsToPathData(routePoints),
    net: bias.net_out, kind: "bias-net-join"
  });
}

function connectBiasStubToInductor(bias, wireLayer, placed) {
  const layoutInstance = getLayoutInstance(bias);
  const cellElements = placed.filter((element) => getLayoutInstance(element) === layoutInstance);
  const routePoints = routeBiasToInductor(bias, cellElements, wireLayer, layoutInstance);
  if (routePoints) drawBiasRoute(wireLayer, bias, routePoints);
}

function connectBiasStubsToInductors(wireLayer, labelLayer, placed) {
  const routedSegments = getExistingRoutedSegments(wireLayer);
  const elementsByCell = groupElementsByLayoutInstance(placed);

  for (const bias of placed) {
    if (!isBiasElement(bias) || !bias.biasNetJoin || !bias.net_out || bias.biasSnappedToNet) continue;

    const layoutInstance = getLayoutInstance(bias);
    const cellElements = elementsByCell.get(layoutInstance) || [];
    const targetData = getBiasTargetData(bias, cellElements, layoutInstance);
    if (!targetData) continue;

    const start = { ...bias.biasNetJoin };
    if (pointsAreSame(start, targetData.targetPoint)) continue;

    const biasTerminal = createBiasTerminal(bias, start, layoutInstance);
    const routePoints = buildShortestFreeRoute(start, targetData.targetPoint, biasTerminal, targetData.targetTerminal, cellElements, routedSegments, bias.net_out);

    if (!Array.isArray(routePoints) || routePoints.length < 2) continue;

    drawBiasRoute(wireLayer, bias, routePoints);

    for (const segment of routePointsToSegments(routePoints)) routedSegments.push({ ...segment, net: bias.net_out });
  }
}

function getBiasJRObstacles(bias, placed, layoutInstance) {
  const cellElements = placed.filter((element) => getLayoutInstance(element) === layoutInstance);
  return buildRoutingObstacleBoxes(cellElements, new Set([bias.id]), 8).filter((box) => box.isJRPair);
}

function getBiasCandidateOffsets(spacing) {
  return [0, -spacing, spacing, -spacing * 2, spacing * 2, -spacing * 3, spacing * 3];
}

function biasCandidateHitsJR(candidateX, candidateY, frontPin, joinPoint, halfSize, jrObstacleBoxes) {
  const overlapsJRPair = jrObstacleBoxes.some((box) => !(candidateX + halfSize <= box.left || candidateX - halfSize >= box.right ||
    candidateY + halfSize <= box.top || candidateY - halfSize >= box.bottom));
  const stubCrossesJRPair = jrObstacleBoxes.some((box) => axisAlignedSegmentHitsBox(frontPin, joinPoint, box));
  return overlapsJRPair || stubCrossesJRPair;
}

function createBiasSnapCandidate(candidateX, netY, context) {
  const candidateY = netY - context.halfSize - context.gap;
  const frontPin = { x: candidateX, y: netY - context.gap };
  const joinPoint = { x: candidateX, y: netY };

  if (biasCandidateHitsJR(candidateX, candidateY, frontPin, joinPoint, context.halfSize, context.jrObstacleBoxes)) return null;
  if (!isBiasPositionFree(context.bias, candidateX, candidateY, context.placed)) return null;

  const movement = Math.abs(context.originalX - candidateX) + Math.abs(context.originalY - candidateY);
  return { x: candidateX, y: candidateY, rotation: 0, frontPin, joinPoint, score: movement };
}

function findBestBiasPositionOnSegment(segment, currentBest, context) {
  if (Math.abs(segment.a.y - segment.b.y) >= 0.5) return currentBest;

  const minimumX = Math.min(segment.a.x, segment.b.x);
  const maximumX = Math.max(segment.a.x, segment.b.x);
  const netY = segment.a.y;
  const projectedX = Math.max(minimumX, Math.min(context.originalX, maximumX));
  const testedPositions = new Set();
  let best = currentBest;

  for (const offset of context.offsets) {
    const candidateX = Math.max(minimumX, Math.min(projectedX + offset, maximumX));
    const positionKey = candidateX.toFixed(3);
    if (testedPositions.has(positionKey)) continue;

    testedPositions.add(positionKey);
    const candidate = createBiasSnapCandidate(candidateX, netY, context);
    if (candidate && (!best || candidate.score < best.score)) best = candidate;
  }

  return best;
}

function findBestBiasSnapPosition(wireLayer, context) {
  let best = null;

  for (const child of wireLayer.children) {
    const childNet = child.dataset.net;
    const childKind = child.dataset.kind || "";
    if (childNet !== context.bias.net_out || childKind.startsWith("bias-")) continue;

    for (const segment of extractWireSegmentsFromElement(child)) {
      best = findBestBiasPositionOnSegment(segment, best, context);
    }
  }

  return best;
}

function resetUnsnappedBias(bias) {
  bias.biasRotation = 0;
  bias.biasSnappedToNet = false;
}

function applyBiasSnapPosition(bias, best) {
  bias.x = best.x;
  bias.y = best.y;
  bias.biasRotation = 0;
  bias.biasFrontPin = { ...best.frontPin };
  bias.biasNetJoin = { ...best.joinPoint };
  bias.outputPin = { ...best.joinPoint, net: bias.net_out };
  bias.biasNetSegment = null;
  bias.biasSnappedToNet = true;
  bias.biasPlacementLocked = true;
}

function snapSingleBiasElement(bias, wireLayer, placed, config) {
  bias.biasPlacementLocked = false;

  const layoutInstance = getLayoutInstance(bias);
  const context = {
    bias, placed, halfSize: config.halfSize, gap: config.gap, offsets: config.offsets,
    originalX: bias.x, originalY: bias.y, jrObstacleBoxes: getBiasJRObstacles(bias, placed, layoutInstance)
  };

  const best = findBestBiasSnapPosition(wireLayer, context);
  if (!best) {
    resetUnsnappedBias(bias);
    return;
  }

  applyBiasSnapPosition(bias, best);
}

function snapBiasElementsToNearestNet(wireLayer, placed) {
  const halfSize = drawConfig.imageSize / 2;
  const gap = Math.max(6, drawConfig.biasOutputGap ?? 12);
  const spacing = drawConfig.biasPlacementSpacing || 35;
  const config = { halfSize, gap, offsets: getBiasCandidateOffsets(spacing) };

  for (const bias of placed) {
    if (!isBiasElement(bias) || !bias.net_out) continue;
    snapSingleBiasElement(bias, wireLayer, placed, config);
  }
}