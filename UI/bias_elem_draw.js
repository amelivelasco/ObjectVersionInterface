function isBiasElement(element) {
  return getElementType(element) === "IB";
}


function findBiasTarget(bias, placed) {
  const layoutInstance =
    getLayoutInstance(bias);

  const candidates = placed.filter(
    (element) =>
      element.id !== bias.id &&
      getElementType(element) !== "R" &&
      getLayoutInstance(element) ===
        layoutInstance &&
      element.net_in === bias.net_out
  );

  if (candidates.length === 0) {
    console.warn(
      `No consumer found for bias ${bias.id}`,
      {
        netOut: bias.net_out,
        layoutInstance,
      }
    );

    return null;
  }

  return candidates.reduce(
    (closest, candidate) => {
      const closestDistance =
        Math.abs(closest.x - bias.x) +
        Math.abs(closest.y - bias.y);

      const candidateDistance =
        Math.abs(candidate.x - bias.x) +
        Math.abs(candidate.y - bias.y);

      return candidateDistance < closestDistance
        ? candidate
        : closest;
    }
  );
}


function isBiasPositionFree(
  bias,
  centerX,
  centerY,
  placed
) {
  const halfSize =
    drawConfig.imageSize / 2;

  const margin = 8;

  return placed.every((element) => {
    if (element.id === bias.id) {
      return true;
    }

    const otherHalf =
      drawConfig.imageSize / 2;

    return (
      centerX + halfSize + margin <=
        element.x - otherHalf ||
      centerX - halfSize - margin >=
        element.x + otherHalf ||
      centerY + halfSize + margin <=
        element.y - otherHalf ||
      centerY - halfSize - margin >=
        element.y + otherHalf
    );
  });
}

function findFreeBiasX(
  bias,
  desiredX,
  centerY,
  placed
) {
  const spacing =
    drawConfig.biasPlacementSpacing;

  const offsets = [
    0,
    -spacing,
    spacing,
    -spacing * 2,
    spacing * 2,
    -spacing * 3,
    spacing * 3,
  ];

  for (const offset of offsets) {
    const candidateX =
      desiredX + offset;

    if (
      isBiasPositionFree(
        bias,
        candidateX,
        centerY,
        placed
      )
    ) {
      return candidateX;
    }
  }

  return desiredX;
}


function placeBiasElementsAboveNetOut(placed) {
  const halfSize =
    drawConfig.imageSize / 2;

  for (const bias of placed) {
    if (!isBiasElement(bias)) {
      continue;
    }

    const target =
      findBiasTarget(
        bias,
        placed
      );

    if (
      !target ||
      !target.inputPin
    ) {
      continue;
    }

    /*
     * direction = 1:
     * target input is on the left.
     *
     * direction = -1:
     * target input is on the right.
     */
    const targetDirection =
      target.direction ?? 1;

    /*
     * Place the bias junction slightly before
     * the target input.
     */
    const desiredJoinX =
      target.inputPin.x -
      targetDirection *
        drawConfig.biasBranchOffset;

    /*
     * The net_out line is horizontal at the
     * same Y position as the target input.
     */
    const netY =
      target.inputPin.y;

    /*
     * Bias is always above the net.
     */
    const biasCenterY =
      netY -
      halfSize -
      drawConfig.biasOutputGap;

    const biasCenterX =
      findFreeBiasX(
        bias,
        desiredJoinX,
        biasCenterY,
        placed
      );

    bias.x =
      biasCenterX;

    bias.y =
      biasCenterY;

    /*
     * Original bias image points downward.
     */
    bias.biasRotation = 0;

    /*
     * Bottom/pointing end of the bias image.
     */
    bias.biasFrontPin = {
      x:
        biasCenterX,

      y:
        biasCenterY +
        halfSize,
    };

    /*
     * Junction on the horizontal net_out line.
     */
    bias.biasNetJoin = {
      x:
        biasCenterX,

      y:
        netY,
    };

    /*
     * The bias normal output terminal is the
     * junction on its net_out line.
     */
    bias.outputPin = {
      ...bias.biasNetJoin,
      net:
        bias.net_out,
    };

    bias.biasTarget =
      target.id;
  }
}


function drawBiasLocalConnections(
  wireLayer,
  labelLayer,
  placed
) {
  for (const bias of placed) {
    if (!isBiasElement(bias)) {
      continue;
    }

    if (
      !bias.biasFrontPin ||
      !bias.biasNetJoin
    ) {
      continue;
    }

    /*
     * When the bias net has no existing horizontal
     * route, draw the small host segment leading
     * toward its consumer.
     */
    if (
      bias.biasNetSegment?.synthetic
    ) {
      drawLine(
        wireLayer,
        labelLayer,
        bias,
        bias.biasNetSegment.a,
        bias.biasNetSegment.b,
        {
          net: bias.net_out,
          kind: "bias-net-host",
          stroke:
            drawConfig.wireStroke,
        }
      );
    }

    /*
     * Draw only the short line from the pointing
     * end of the bias to its net_out.
     */
    drawLine(
      wireLayer,
      labelLayer,
      bias,
      bias.biasFrontPin,
      bias.biasNetJoin,
      {
        net: bias.net_out,
        kind: "bias-output-stub",
        stroke:
          drawConfig.wireStroke,
      }
    );
  }
}