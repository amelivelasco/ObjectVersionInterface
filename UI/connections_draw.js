function getElementType(element) {
  return Array.isArray(element.type)
    ? element.type[0]
    : element.type;
}

function isJJResistorPair(first, second) {
  if (!first || !second) {
    return false;
  }

  return (
    getElementType(first) === "JJ" &&
    getElementType(second) === "R" &&
    (
      second.source_component === first.id ||
      second.companion_of === first.id ||
      (
        second.path === first.path &&
        second.pid === first.pid
      )
    )
  );
}

/*
 * A JJ and its generated resistor must move together.
 * Every other element becomes a one-element block.
 */
function createPlacementBlocks(elements) {
  const blocks = [];

  for (let index = 0; index < elements.length; index++) {
    const current = elements[index];
    const next = elements[index + 1];

    if (isJJResistorPair(current, next)) {
      blocks.push({
        id: `pair:${current.id}`,
        elements: [current, next],
        originalIndex: index,
      });

      index++;
      continue;
    }

    blocks.push({
      id: `element:${current.id}`,
      elements: [current],
      originalIndex: index,
    });
  }

  return blocks;
}

function getBlockTerminals(block) {
  const inputs = new Set();
  const outputs = new Set();

  /*
   * The resistor duplicates the JJ nets, so exclude it
   * when calculating connectivity.
   */
  const primaryElements =
    block.elements.filter(
      (element) =>
        getElementType(element) !== "R"
    );

  const relevantElements =
    primaryElements.length > 0
      ? primaryElements
      : block.elements;

  for (const element of relevantElements) {
    if (element.net_in) {
      inputs.add(element.net_in);
    }

    if (element.net_out) {
      outputs.add(element.net_out);
    }
  }

  return {
    inputs,
    outputs,
    all: new Set([
      ...inputs,
      ...outputs,
    ]),
  };
}


function buildBlockConnections(blocks) {
  const terminalsByBlock = new Map();
  const blocksByNet = new Map();

  for (const block of blocks) {
    const terminals =
      getBlockTerminals(block);

    terminalsByBlock.set(
      block.id,
      terminals
    );

    for (const net of terminals.all) {
      if (!blocksByNet.has(net)) {
        blocksByNet.set(net, []);
      }

      blocksByNet
        .get(net)
        .push(block);
    }
  }

  const edgeMap = new Map();

  function addEdge(first, second, weight) {
    const sortedIds = [
      first.id,
      second.id,
    ].sort();

    const key = sortedIds.join("|");

    if (!edgeMap.has(key)) {
      edgeMap.set(key, {
        firstId: sortedIds[0],
        secondId: sortedIds[1],
        weight: 0,
      });
    }

    edgeMap.get(key).weight += weight;
  }

  for (const [net, connectedBlocks] of blocksByNet) {
    const uniqueBlocks = [
      ...new Map(
        connectedBlocks.map(
          (block) => [block.id, block]
        )
      ).values(),
    ];

    if (uniqueBlocks.length < 2) {
      continue;
    }

    /*
     * A two-block net gets weight 1.
     * A twenty-block net gets a much weaker weight.
     */
    const fanoutWeight =
      1 /
      Math.max(
        1,
        uniqueBlocks.length - 1
      );

    for (
      let firstIndex = 0;
      firstIndex < uniqueBlocks.length;
      firstIndex++
    ) {
      for (
        let secondIndex = firstIndex + 1;
        secondIndex < uniqueBlocks.length;
        secondIndex++
      ) {
        const first =
          uniqueBlocks[firstIndex];

        const second =
          uniqueBlocks[secondIndex];

        const firstTerminals =
          terminalsByBlock.get(first.id);

        const secondTerminals =
          terminalsByBlock.get(second.id);

        const directConnection =
          (
            firstTerminals.outputs.has(net) &&
            secondTerminals.inputs.has(net)
          ) ||
          (
            secondTerminals.outputs.has(net) &&
            firstTerminals.inputs.has(net)
          );

        /*
         * Producer-to-consumer connections attract
         * more strongly than merely sharing a net.
         */
        const weight =
          fanoutWeight *
          (
            directConnection
              ? 8
              : 2
          );

        addEdge(
          first,
          second,
          weight
        );
      }
    }
  }

  return [...edgeMap.values()];
}


function slotToGridPosition(
  slotIndex,
  columns
) {
  const row = Math.floor(
    slotIndex / columns
  );

  const indexInRow =
    slotIndex % columns;

  const direction =
    row % 2 === 0
      ? 1
      : -1;

  const column =
    direction === 1
      ? indexInRow
      : columns - 1 - indexInRow;

  return {
    row,
    column,
  };
}

function getBlockGridPositions(
  orderedBlocks,
  columns
) {
  const positions = new Map();

  let slotIndex = 0;

  for (const block of orderedBlocks) {
    const memberPositions = [];

    for (
      let memberIndex = 0;
      memberIndex < block.elements.length;
      memberIndex++
    ) {
      memberPositions.push(
        slotToGridPosition(
          slotIndex + memberIndex,
          columns
        )
      );
    }

    const averageColumn =
      memberPositions.reduce(
        (sum, position) =>
          sum + position.column,
        0
      ) / memberPositions.length;

    const averageRow =
      memberPositions.reduce(
        (sum, position) =>
          sum + position.row,
        0
      ) / memberPositions.length;

    positions.set(block.id, {
      column: averageColumn,
      row: averageRow,
      startSlot: slotIndex,
      endSlot:
        slotIndex +
        block.elements.length -
        1,
    });

    slotIndex += block.elements.length;
  }

  return positions;
}

function calculatePlacementCost(
  orderedBlocks,
  connections,
  columns
) {
  const positions =
    getBlockGridPositions(
      orderedBlocks,
      columns
    );

  let cost = 0;

  for (const connection of connections) {
    const first =
      positions.get(
        connection.firstId
      );

    const second =
      positions.get(
        connection.secondId
      );

    /*
     * During incremental insertion, one endpoint may
     * not have been inserted yet.
     */
    if (!first || !second) {
      continue;
    }

    const horizontalDistance =
      Math.abs(
        first.column -
        second.column
      ) *
      drawConfig.layoutCellElementGapX;

    const verticalDistance =
      Math.abs(
        first.row -
        second.row
      ) *
      drawConfig.layoutCellElementGapY;

    cost +=
      connection.weight *
      (
        horizontalDistance +
        verticalDistance
      );
  }

  /*
   * Strongly discourage splitting a JJ/resistor pair
   * across two rows.
   */
  for (const block of orderedBlocks) {
    if (block.elements.length < 2) {
      continue;
    }

    const position =
      positions.get(block.id);

    const startRow =
      Math.floor(
        position.startSlot / columns
      );

    const endRow =
      Math.floor(
        position.endSlot / columns
      );

    if (startRow !== endRow) {
      cost += 100000;
    }
  }

  /*
   * Small stability cost. This prevents the entire cell
   * from changing unnecessarily for one weak connection.
   */
  orderedBlocks.forEach(
    (block, index) => {
      cost +=
        Math.abs(
          index -
          block.originalIndex
        ) * 0.5;
    }
  );

  return cost;
}


function optimizeElementOrderByConnectivity(
  elements,
  columns
) {
  const blocks =
    createPlacementBlocks(elements);

  if (blocks.length <= 2) {
    return [...elements];
  }

  const connections =
    buildBlockConnections(blocks);

  const degree = new Map(
    blocks.map(
      (block) => [block.id, 0]
    )
  );

  for (const connection of connections) {
    degree.set(
      connection.firstId,
      degree.get(connection.firstId) +
        connection.weight
    );

    degree.set(
      connection.secondId,
      degree.get(connection.secondId) +
        connection.weight
    );
  }

  /*
   * Begin with the most connected block.
   */
  const startBlock = [...blocks].sort(
    (first, second) =>
      degree.get(second.id) -
        degree.get(first.id) ||
      first.originalIndex -
        second.originalIndex
  )[0];

  let orderedBlocks = [startBlock];

  const remaining = blocks.filter(
    (block) =>
      block !== startBlock
  );

  /*
   * Add the block most connected to the blocks already
   * positioned. Test every insertion point and keep the
   * one that gives the shortest total connection cost.
   */
  while (remaining.length > 0) {
    let selectedIndex = 0;
    let selectedStrength = -1;

    const placedIds = new Set(
      orderedBlocks.map(
        (block) => block.id
      )
    );

    for (
      let index = 0;
      index < remaining.length;
      index++
    ) {
      const candidate =
        remaining[index];

      let strength = 0;

      for (const connection of connections) {
        const touchesCandidate =
          connection.firstId === candidate.id ||
          connection.secondId === candidate.id;

        if (!touchesCandidate) {
          continue;
        }

        const otherId =
          connection.firstId === candidate.id
            ? connection.secondId
            : connection.firstId;

        if (placedIds.has(otherId)) {
          strength += connection.weight;
        }
      }

      if (
        strength > selectedStrength
      ) {
        selectedStrength = strength;
        selectedIndex = index;
      }
    }

    const [selectedBlock] =
      remaining.splice(
        selectedIndex,
        1
      );

    let bestOrder = null;
    let bestCost = Infinity;

    for (
      let insertionIndex = 0;
      insertionIndex <= orderedBlocks.length;
      insertionIndex++
    ) {
      const candidateOrder = [
        ...orderedBlocks.slice(
          0,
          insertionIndex
        ),

        selectedBlock,

        ...orderedBlocks.slice(
          insertionIndex
        ),
      ];

      const candidateCost =
        calculatePlacementCost(
          candidateOrder,
          connections,
          columns
        );

      if (candidateCost < bestCost) {
        bestCost = candidateCost;
        bestOrder = candidateOrder;
      }
    }

    orderedBlocks = bestOrder;
  }

  /*
   * Local refinement: remove each block and try every
   * possible insertion point. This is what allows an
   * existing group to move when a better connection is
   * discovered.
   */
  const maximumPasses = 5;

  for (
    let pass = 0;
    pass < maximumPasses;
    pass++
  ) {
    let changed = false;

    for (
      let blockIndex = 0;
      blockIndex < orderedBlocks.length;
      blockIndex++
    ) {
      const currentCost =
        calculatePlacementCost(
          orderedBlocks,
          connections,
          columns
        );

      const block =
        orderedBlocks[blockIndex];

      const withoutBlock =
        orderedBlocks.filter(
          (_, index) =>
            index !== blockIndex
        );

      let bestOrder =
        orderedBlocks;

      let bestCost =
        currentCost;

      for (
        let insertionIndex = 0;
        insertionIndex <= withoutBlock.length;
        insertionIndex++
      ) {
        const candidateOrder = [
          ...withoutBlock.slice(
            0,
            insertionIndex
          ),

          block,

          ...withoutBlock.slice(
            insertionIndex
          ),
        ];

        const candidateCost =
          calculatePlacementCost(
            candidateOrder,
            connections,
            columns
          );

        if (
          candidateCost + 0.01 <
          bestCost
        ) {
          bestCost =
            candidateCost;

          bestOrder =
            candidateOrder;
        }
      }

      if (bestOrder !== orderedBlocks) {
        orderedBlocks = bestOrder;
        changed = true;
      }
    }

    if (!changed) {
      break;
    }
  }

  return orderedBlocks.flatMap(
    (block) => block.elements
  );
}