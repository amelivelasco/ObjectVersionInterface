function findBiasTarget(
  bias,
  placed
) {
  const layoutInstance =
    getLayoutInstance(bias);

  const candidates =
    placed.filter(
      (element) =>
        element.id !== bias.id &&
        getLayoutInstance(element) ===
          layoutInstance &&
        getElementType(element) !== "R" &&
        element.net_in === bias.net_out
    );

  if (candidates.length === 0) {
    console.warn(
      `No target found for bias ${bias.id}`,
      {
        netOut: bias.net_out,
        layoutInstance,
      }
    );

    return null;
  }

  /*
   * Prefer the closest consumer when several
   * elements consume the bias output net.
   */
  return candidates.reduce(
    (closest, candidate) => {
      const closestDistance =
        Math.abs(
          closest.x - bias.x
        ) +
        Math.abs(
          closest.y - bias.y
        );

      const candidateDistance =
        Math.abs(
          candidate.x - bias.x
        ) +
        Math.abs(
          candidate.y - bias.y
        );

      return candidateDistance <
        closestDistance
        ? candidate
        : closest;
    }
  );
}


function getBiasDirection(
  bias,
  target
) {
  if (!target) {
    return {
      x: 0,
      y: 1,
      rotation: 0,
      name: "down",
    };
  }

  const dx =
    target.x - bias.x;

  const dy =
    target.y - bias.y;

  /*
   * Select the dominant axis so the image
   * remains horizontal or vertical.
   */
  if (
    Math.abs(dx) >=
    Math.abs(dy)
  ) {
    if (dx >= 0) {
      return {
        x: 1,
        y: 0,
        rotation: -90,
        name: "right",
      };
    }

    return {
      x: -1,
      y: 0,
      rotation: 90,
      name: "left",
    };
  }

  if (dy >= 0) {
    return {
      x: 0,
      y: 1,
      rotation: 0,
      name: "down",
    };
  }

  return {
    x: 0,
    y: -1,
    rotation: 180,
    name: "up",
  };
}


function prepareBiasElements(
  placed
) {
  const componentRadius =
    drawConfig.imageSize / 2;

  const supplyStubLength = 24;

  for (const element of placed) {
    if (!isBiasElement(element)) {
      continue;
    }

    const target =
      findBiasTarget(
        element,
        placed
      );

    const direction =
      getBiasDirection(
        element,
        target
      );

    /*
     * The front side points toward the next
     * connected circuit element.
     */
    const frontPin = {
      x:
        element.x +
        direction.x *
          componentRadius,

      y:
        element.y +
        direction.y *
          componentRadius,

      net:
        element.net_out,
    };

    /*
     * The rear side is directly opposite.
     */
    const rearPin = {
      x:
        element.x -
        direction.x *
          componentRadius,

      y:
        element.y -
        direction.y *
          componentRadius,

      net:
        element.net_in,
    };

    /*
     * Private VDD stub extends farther away
     * from the rear of the bias element.
     */
    const supplyEnd = {
      x:
        rearPin.x -
        direction.x *
          supplyStubLength,

      y:
        rearPin.y -
        direction.y *
          supplyStubLength,
    };

    element.biasTarget =
      target?.id || null;

    element.biasDirection =
      direction;

    element.biasRotation =
      direction.rotation;

    element.inputPin =
      rearPin;

    element.outputPin =
      frontPin;

    element.biasSupplyPin =
      rearPin;

    element.biasSupplyEnd =
      supplyEnd;
  }
}


function drawBiasSupplyStubs(
  wireLayer,
  labelLayer,
  placed
) {
  for (const bias of placed) {
    if (!isBiasElement(bias)) {
      continue;
    }

    if (
      !bias.biasSupplyPin ||
      !bias.biasSupplyEnd
    ) {
      continue;
    }

    drawLine(
      wireLayer,
      labelLayer,
      bias,

      bias.biasSupplyPin,
      bias.biasSupplyEnd,

      {
        stroke:
          drawConfig.wireStroke,

        strokeWidth:
          drawConfig.wireStrokeWidth,
      }
    );

    const direction =
      bias.biasDirection || {
        x: 0,
        y: 1,
      };

    /*
     * Label is placed slightly farther behind
     * the supply stub.
     */
    const labelX =
      bias.biasSupplyEnd.x -
      direction.x * 9;

    const labelY =
      bias.biasSupplyEnd.y -
      direction.y * 9 -
      (
        direction.y === 0
          ? 9
          : 0
      );

    let anchor = "middle";

    if (direction.x > 0) {
      anchor = "end";
    } else if (direction.x < 0) {
      anchor = "start";
    }

    drawLabel(
      labelLayer,

      bias.net_in ||
        "VDD",

      labelX,
      labelY,

      {
        anchor,
        size: "8.5px",
        fill: "#334155",
      }
    );
  }
}