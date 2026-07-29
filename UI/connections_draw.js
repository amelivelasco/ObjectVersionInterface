function getElementType(element) {
  return Array.isArray(element.type) ? element.type[0] : element.type;
}

function isJJResistorPair(first, second) {
  if (!first || !second) { return false; }

  return (
    getElementType(first) === "JJ" && getElementType(second) === "R" &&
    ( second.source_component === first.id || second.companion_of === first.id ||
      ( second.path === first.path && second.pid === first.pid )
    )
  );
}

function createPlacementBlocks(elements) {
  const blocks = [];

  for (let index = 0; index < elements.length; index++) {
    const current = elements[index];
    const next = elements[index + 1];

    if (isJJResistorPair(current, next)) {
      blocks.push({ id: `pair:${current.id}`, elements: [current, next], originalIndex: index,
      });

      index++;
      continue;
    }

    blocks.push({id: `element:${current.id}`, elements: [current], originalIndex: index, });
  }

  return blocks;
}

function getBlockTerminals(block) {
  const inputs = new Set();
  const outputs = new Set();

  const primaryElements =
    block.elements.filter((element) => getElementType(element) !== "R");

  const relevantElements =
    primaryElements.length > 0 ? primaryElements : block.elements;

  for (const element of relevantElements) {

    if (isBiasElement(element)) {
      if (element.net_out) {
        outputs.add(element.net_out);
      }
      continue;
    }

    if (element.net_in) {
      inputs.add(element.net_in);
    }

    if (element.net_out) {
      outputs.add(element.net_out);
    }
  }

  return {inputs, outputs, all: new Set([...inputs, ...outputs,]),};
}


function buildBlockConnections(blocks) {
  const terminalsByBlock = new Map();
  const blocksByNet = new Map();

  for (const block of blocks) {
    const terminals = getBlockTerminals(block);

    terminalsByBlock.set(block.id, terminals);

    for (const net of terminals.all) {
      if (!blocksByNet.has(net)) { blocksByNet.set(net, []); }

      blocksByNet.get(net).push(block);
    }
  }

  const edgeMap = new Map();

  function addEdge(first, second, weight) {
    const sortedIds = [first.id, second.id,].sort();

    const key = sortedIds.join("|");

    if (!edgeMap.has(key)) { edgeMap.set(key, {firstId: sortedIds[0], secondId: sortedIds[1], weight: 0,}); }

    edgeMap.get(key).weight += weight;
  }

  for (const [net, connectedBlocks] of blocksByNet) {
    const uniqueBlocks = [...new Map(connectedBlocks.map((block) => [block.id, block])).values(),];

    if (uniqueBlocks.length < 2) { continue; }

    const fanoutWeight = 1 / Math.max(1, uniqueBlocks.length - 1);

    for (let firstIndex = 0; firstIndex < uniqueBlocks.length; firstIndex++) {
      for (let secondIndex = firstIndex + 1; secondIndex < uniqueBlocks.length; secondIndex++) {
        const first = uniqueBlocks[firstIndex];
        const second = uniqueBlocks[secondIndex];
        const firstTerminals = terminalsByBlock.get(first.id);
        const secondTerminals = terminalsByBlock.get(second.id);

        const directConnection = ( firstTerminals.outputs.has(net) && secondTerminals.inputs.has(net) ) ||
          ( secondTerminals.outputs.has(net) && firstTerminals.inputs.has(net) );

        const weight = fanoutWeight * ( directConnection ? 8 : 2 );
        addEdge(first, second, weight);
      }
    }
  }

  return [...edgeMap.values()];
}


function slotToGridPosition(slotIndex, columns) {
  const row = Math.floor(slotIndex / columns);
  const indexInRow = slotIndex % columns;
  const direction = row % 2 === 0 ? 1 : -1;
  const column = direction === 1 ? indexInRow : columns - 1 - indexInRow;
  return {row, column, };
}

function getBlockGridPositions(orderedBlocks, columns) {
  const positions = new Map();
  let slotIndex = 0;
  for (const block of orderedBlocks) {
    const memberPositions = [];

    for (let memberIndex = 0; memberIndex < block.elements.length; memberIndex++
    ) {
      memberPositions.push(slotToGridPosition(slotIndex + memberIndex,columns) );
    }

    const averageColumn = memberPositions.reduce((sum, position) => sum + position.column, 0) / memberPositions.length;

    const averageRow = memberPositions.reduce((sum, position) => sum + position.row, 0) / memberPositions.length;

    positions.set(block.id, { column: averageColumn, row: averageRow, startSlot: slotIndex,
      endSlot: slotIndex + block.elements.length - 1, });

    slotIndex += block.elements.length;
  }

  return positions;
}

function calculatePlacementCost(orderedBlocks, connections, columns) {
  const positions = getBlockGridPositions(orderedBlocks, columns);
  let cost = 0;
  for (const connection of connections) {
    const first = positions.get(connection.firstId);
    const second = positions.get(connection.secondId);

    if (!first || !second) { continue; }

    const horizontalDistance = Math.abs(first.column - second.column);
    const verticalDistance = Math.abs(first.row - second.row);

    const horizontalWeight = 1;
    const verticalWeight = 1.15;

    cost += connection.weight *
      ( horizontalDistance * horizontalWeight + verticalDistance * verticalWeight  );
  }


  for (const block of orderedBlocks) {
    if (block.elements.length < 2) {
      continue;
    }

    const position = positions.get(block.id);
    const startRow = Math.floor(position.startSlot / columns);

    const endRow = Math.floor(position.endSlot / columns);

    if (startRow !== endRow) { cost += 100000; }
  }

  orderedBlocks.forEach(
    (block, index) => {
      cost +=  Math.abs(index - block.originalIndex) * 0.5;
    }
  );

  return cost;
}


function optimizeElementOrderByConnectivity( elements, columns) {
  const blocks = createPlacementBlocks(elements);

  if (blocks.length <= 2) { return [...elements];}

  const connections = buildBlockConnections(blocks);

  const degree = new Map(blocks.map((block) => [block.id, 0]));

  for (const connection of connections) {
    degree.set(connection.firstId, degree.get(connection.firstId) + connection.weight);

    degree.set(connection.secondId, degree.get(connection.secondId) + connection.weight);
  }

  const startBlock = [...blocks].sort(
    (first, second) =>
      degree.get(second.id) - degree.get(first.id) || first.originalIndex - second.originalIndex)[0];

  let orderedBlocks = [startBlock];
  const remaining = blocks.filter((block) => block !== startBlock);

  while (remaining.length > 0) {
    let selectedIndex = 0;
    let selectedStrength = -1;

    const placedIds = new Set(
      orderedBlocks.map((block) => block.id)
    );

    for (let index = 0; index < remaining.length; index++
    ) {
      const candidate = remaining[index];
      let strength = 0;

      for (const connection of connections) {
        const touchesCandidate = connection.firstId === candidate.id || connection.secondId === candidate.id;

        if (!touchesCandidate) { continue; }

        const otherId = connection.firstId === candidate.id ? connection.secondId : connection.firstId;

        if (placedIds.has(otherId)) { strength += connection.weight; }
      }

      if ( strength > selectedStrength ) {
        selectedStrength = strength;
        selectedIndex = index;
      }
    }

    const [selectedBlock] =
      remaining.splice(selectedIndex, 1);

    let bestOrder = null;
    let bestCost = Infinity;

    for (let insertionIndex = 0; insertionIndex <= orderedBlocks.length; insertionIndex++
    ) {
      const candidateOrder = [ ...orderedBlocks.slice(0, insertionIndex), selectedBlock,
        ...orderedBlocks.slice(insertionIndex),];

      const candidateCost = calculatePlacementCost(candidateOrder, connections, columns);

      if (candidateCost < bestCost) {
        bestCost = candidateCost;
        bestOrder = candidateOrder;
      }
    }

    orderedBlocks = bestOrder;
  }

  const maximumPasses = 5;
  for (let pass = 0; pass < maximumPasses; pass++
  ) {
    let changed = false;
    for (let blockIndex = 0; blockIndex < orderedBlocks.length; blockIndex++
    ) {
      const currentCost = calculatePlacementCost(orderedBlocks, connections, columns);
      const block = orderedBlocks[blockIndex];
      const withoutBlock = orderedBlocks.filter((_, index) => index !== blockIndex);
      let bestOrder =orderedBlocks;
      let bestCost = currentCost;

      for (let insertionIndex = 0; insertionIndex <= withoutBlock.length; insertionIndex++) {
        const candidateOrder = [
          ...withoutBlock.slice(0, insertionIndex),
          block,
          ...withoutBlock.slice(insertionIndex),
        ];

        const candidateCost = calculatePlacementCost(candidateOrder, connections, columns);

        if (candidateCost + 0.01 < bestCost
        ) {
          bestCost = candidateCost;
          bestOrder = candidateOrder;
        }
      }

      if (bestOrder !== orderedBlocks) {
        orderedBlocks = bestOrder;
        changed = true;
      }
    }

    if (!changed) { break; }
  }

  return orderedBlocks.flatMap(
    (block) => block.elements
  );
}

function isGroundNet(net) {
  const normalized = String(net || "").trim().toUpperCase().replace(/!+$/, "");

  return (
    normalized === "GND" ||
    normalized === "GROUND" ||
    normalized === "VSS" ||
    normalized === "0"
  );
}


function getTerminalRoutingPoint(terminal, fallbackPoint
) {
  const element = terminal?.element;

  if (!element || getElementType(element) !== "L"
  ) {
    return {...fallbackPoint,};
  }

  let candidatePoint = fallbackPoint;

  if (terminal.kind === "in") {
    candidatePoint = element.inputLeadPoint || element.inputPin || fallbackPoint;
  } else if (terminal.kind === "out") {
    candidatePoint = element.outputLeadPoint || element.outputPin || fallbackPoint; }

  let sideDirection = 0;

  if (candidatePoint && Number.isFinite(candidatePoint.x) &&
    Math.abs(candidatePoint.x - element.x) > 0.5
  ) {
    sideDirection = Math.sign(candidatePoint.x - element.x);
  }

  if (sideDirection === 0) {
    const elementDirection = Number(element.electricalDirection ?? element.direction ?? 1);

    const normalizedDirection = elementDirection < 0 ? -1 : 1;

    sideDirection = terminal.kind === "in" ? -normalizedDirection : normalizedDirection;
  }

  const minimumSideOffset = drawConfig.imageSize / 2 + 1;

  const candidateOffset = candidatePoint && Number.isFinite(candidatePoint.x)
      ? Math.abs(candidatePoint.x - element.x) : 0;

  const sideOffset = Math.max(minimumSideOffset, candidateOffset);

  return {
    x: element.x + sideDirection * sideOffset,
    y: Number.isFinite(candidatePoint?.y) ? candidatePoint.y : element.y,
  };
}


function getInductorImageObstacle(element, margin = 3) {
  const halfSize = drawConfig.imageSize / 2 + margin;

  return {
    left: element.x - halfSize,
    right: element.x + halfSize,
    top: element.y - halfSize,
    bottom: element.y + halfSize,
    elementId: element.id,
    isInductor: true,
  };
}

function axisAlignedSegmentsIntersect(first, second, epsilon = 0.5) {
  const firstHorizontal = Math.abs(first.a.y - first.b.y) < epsilon;
  const secondHorizontal = Math.abs(second.a.y - second.b.y) < epsilon;

  const firstMinX = Math.min(first.a.x, first.b.x);
  const firstMaxX = Math.max(first.a.x, first.b.x);
  const firstMinY = Math.min(first.a.y, first.b.y);
  const firstMaxY = Math.max(first.a.y, first.b.y);

  const secondMinX = Math.min(second.a.x, second.b.x);
  const secondMaxX = Math.max(second.a.x, second.b.x);
  const secondMinY = Math.min(second.a.y, second.b.y);
  const secondMaxY = Math.max(second.a.y, second.b.y);

  if (firstHorizontal && secondHorizontal) {
    return Math.abs(first.a.y - second.a.y) < epsilon &&
      firstMaxX >= secondMinX - epsilon && secondMaxX >= firstMinX - epsilon;
  }

  if (!firstHorizontal && !secondHorizontal) {
    return Math.abs(first.a.x - second.a.x) < epsilon &&
      firstMaxY >= secondMinY - epsilon && secondMaxY >= firstMinY - epsilon;
  }

  const horizontal = firstHorizontal ? first : second;
  const vertical = firstHorizontal ? second : first;

  return vertical.a.x >= Math.min(horizontal.a.x, horizontal.b.x) - epsilon &&
    vertical.a.x <= Math.max(horizontal.a.x, horizontal.b.x) + epsilon &&
    horizontal.a.y >= Math.min(vertical.a.y, vertical.b.y) - epsilon &&
    horizontal.a.y <= Math.max(vertical.a.y, vertical.b.y) + epsilon;
}