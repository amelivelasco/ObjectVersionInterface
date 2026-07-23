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
      (
        element.net_in === bias.net_out ||
        (
          getElementType(element) === "L" &&
          element.net_out === bias.net_out
        )
      )
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

function placeBiasElementsAboveNetOut(
  placed
) {
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

    if (!target) {
      continue;
    }

    bias.biasPlacementLocked =
      false;

    bias.biasSnappedToNet =
      false;

    bias.biasNetSegment =
      null;

    /*
     * Original placement behavior for:
     *
     * - non-inductor targets;
     * - inductors without a matching pin;
     * - cases where there is no free side position.
     */
    if (!target.inputPin) {
      continue;
    }

    const targetDirection =
      target.electricalDirection ??
      target.direction ??
      1;

    const desiredJoinX =
      target.inputPin.x -
      targetDirection *
        drawConfig.biasBranchOffset;

    const netY =
      target.inputPin.y;

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
     * Original arrow points downward.
     */
    bias.biasRotation = 0;

    bias.biasFrontPin = {
      x:
        biasCenterX,

      y:
        biasCenterY +
        halfSize,
    };

    bias.biasNetJoin = {
      x:
        biasCenterX,

      y:
        netY,
    };

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


function findBiasInductorTarget(
  bias,
  placed
) {
  const layoutInstance =
    getLayoutInstance(bias);

  const candidates =
    placed.filter((element) => {
      if (
        element.id === bias.id ||
        getElementType(element) !== "L" ||
        getLayoutInstance(element) !==
          layoutInstance
      ) {
        return false;
      }

      return (
        element.net_in === bias.net_out ||
        element.net_out === bias.net_out
      );
    });

  if (candidates.length === 0) {
    return null;
  }

  /*
   * Prefer an inductor whose input consumes
   * the bias output.
   */
  candidates.sort(
    (first, second) => {
      const firstPriority =
        first.net_in === bias.net_out
          ? 0
          : 1;

      const secondPriority =
        second.net_in === bias.net_out
          ? 0
          : 1;

      if (
        firstPriority !==
        secondPriority
      ) {
        return (
          firstPriority -
          secondPriority
        );
      }

      const firstPin =
        first.net_in === bias.net_out
          ? first.inputPin
          : first.outputPin;

      const secondPin =
        second.net_in === bias.net_out
          ? second.inputPin
          : second.outputPin;

      const firstDistance =
        Math.abs(
          firstPin.x -
          bias.biasNetJoin.x
        ) +
        Math.abs(
          firstPin.y -
          bias.biasNetJoin.y
        );

      const secondDistance =
        Math.abs(
          secondPin.x -
          bias.biasNetJoin.x
        ) +
        Math.abs(
          secondPin.y -
          bias.biasNetJoin.y
        );

      return (
        firstDistance -
        secondDistance
      );
    }
  );

  return candidates[0];
}

function connectBiasStubsToInductors(
  wireLayer,
  labelLayer,
  placed
) {
  for (const bias of placed) {
    if (
      !isBiasElement(bias) ||
      !bias.biasNetJoin ||
      !bias.net_out
    ) {
      continue;
    }
    if (
      bias.biasSnappedToNet
    ) {
      continue;
    }

    const layoutInstance =
      getLayoutInstance(bias);

    const cellElements =
      placed.filter(
        (element) =>
          getLayoutInstance(element) ===
          layoutInstance
      );

    /*
     * Find every existing terminal belonging
     * to the bias output net.
     *
     * Bias elements are already skipped by
     * collectNetTerminals(), so the bias will
     * not select itself.
     */
    const terminals =
      collectNetTerminals(
        cellElements
      ).get(
        bias.net_out
      ) || [];

    let nearestConnection = null;

    for (const terminal of terminals) {
      const points =
        getTerminalPoints(
          terminal
        );

      for (const point of points) {
        const distance =
          Math.abs(
            bias.biasNetJoin.x -
            point.x
          ) +
          Math.abs(
            bias.biasNetJoin.y -
            point.y
          );

        if (
          !nearestConnection ||
          distance <
            nearestConnection.distance
        ) {
          nearestConnection = {
            terminal,
            point,
            distance,
          };
        }
      }
    }

    /*
     * There is no existing terminal on this net.
     */
    if (!nearestConnection) {
      console.warn(
        `No existing terminal found for bias net ${bias.net_out}`,
        {
          bias:
            bias.id,
        }
      );

      continue;
    }

    const start =
      bias.biasNetJoin;

    const targetPoint =
      nearestConnection.point;

    /*
     * Already connected.
     */
    if (
      Math.abs(
        start.x -
        targetPoint.x
      ) < 0.5 &&
      Math.abs(
        start.y -
        targetPoint.y
      ) < 0.5
    ) {
      continue;
    }

    /*
     * Collect the circuit wires that have already
     * been drawn. They remain obstacles for this
     * bias connection.
     */
    const routedSegments = [];

    for (
      const child of
      wireLayer.children
    ) {
      routedSegments.push(
        ...extractWireSegmentsFromElement(
          child
        )
      );
    }

    const biasTerminal = {
      net:
        bias.net_out,

      kind:
        "out",

      point:
        start,

      candidatePoints: [
        start,
      ],

      element:
        bias,

      ownerId:
        bias.id,

      layoutInstance,
    };

    /*
     * Use the actual existing terminal as the
     * destination. This preserves special handling
     * for inductors and JR pairs.
     */
    const targetTerminal = {
      ...nearestConnection.terminal,

      point:
        targetPoint,

      candidatePoints: [
        targetPoint,
      ],
    };

    const routePoints =
      buildShortestFreeRoute(
        start,
        targetPoint,
        biasTerminal,
        targetTerminal,
        cellElements,
        routedSegments,
        bias.net_out
      );

    if (
      !Array.isArray(
        routePoints
      ) ||
      routePoints.length < 2
    ) {
      console.warn(
        `No legal route found for bias ${bias.id}`,
        {
          net:
            bias.net_out,

          start,

          targetPoint,
        }
      );

      continue;
    }

    drawPath(
      wireLayer,
      start,
      targetPoint,
      {
        stroke:
          drawConfig.wireStroke,

        pathData:
          routePointsToPathData(
            routePoints
          ),

        net:
          bias.net_out,

        kind:
          "bias-net-join",
      }
    );
  }
}

function snapBiasElementsToNearestNet(
  wireLayer,
  placed
) {
  const halfSize =
    drawConfig.imageSize / 2;

  const gap =
    drawConfig.biasOutputGap;

  for (const bias of placed) {
    if (
      !isBiasElement(bias) ||
      !bias.net_out
    ) {
      continue;
    }

    if (
      bias.biasPlacementLocked
    ) {
      continue;
    }

    const originalX =
      bias.x;

    const originalY =
      bias.y;

    const layoutInstance =
      getLayoutInstance(bias);

    const cellElements =
      placed.filter(
        (element) =>
          getLayoutInstance(element) ===
          layoutInstance
      );

    /*
    * Reserve the complete JR subcircuit area,
    * including the space between the JJ and resistor.
    */
    const jrObstacleBoxes =
      buildRoutingObstacleBoxes(
        cellElements,
        new Set([
          bias.id,
        ]),
        8
      ).filter(
        (box) =>
          box.isJRPair
      );

    let best = null;

    for (
      const child of
      wireLayer.children
    ) {
      const childNet =
        child.getAttribute(
          "data-net"
        );

      const childKind =
        child.getAttribute(
          "data-kind"
        );

      if (
        childNet !==
          bias.net_out ||
        String(
          childKind || ""
        ).startsWith("bias-")
      ) {
        continue;
      }

      const segments =
        extractWireSegmentsFromElement(
          child
        );

      for (const segment of segments) {
        const horizontal =
          Math.abs(
            segment.a.y -
            segment.b.y
          ) < 0.5;

        const vertical =
          Math.abs(
            segment.a.x -
            segment.b.x
          ) < 0.5;

        let joinPoint = null;

        if (horizontal) {
          const minimumX =
            Math.min(
              segment.a.x,
              segment.b.x
            );

          const maximumX =
            Math.max(
              segment.a.x,
              segment.b.x
            );

          joinPoint = {
            x:
              Math.max(
                minimumX,
                Math.min(
                  originalX,
                  maximumX
                )
              ),

            y:
              segment.a.y,
          };
        } else if (vertical) {
          const minimumY =
            Math.min(
              segment.a.y,
              segment.b.y
            );

          const maximumY =
            Math.max(
              segment.a.y,
              segment.b.y
            );

          joinPoint = {
            x:
              segment.a.x,

            y:
              Math.max(
                minimumY,
                Math.min(
                  originalY,
                  maximumY
                )
              ),
          };
        }

        if (!joinPoint) {
          continue;
        }

        const candidates = [];

        if (horizontal) {
          /*
          * Existing wire:
          *
          * ----------------
          *
          * Bias can sit above and point downward,
          * or sit below and point upward.
          */
          candidates.push(
            {
              x:
                joinPoint.x,

              y:
                joinPoint.y -
                halfSize -
                gap,

              rotation:
                0,

              frontPin: {
                x:
                  joinPoint.x,

                y:
                  joinPoint.y -
                  gap,
              },

              joinPoint,
            },

            {
              x:
                joinPoint.x,

              y:
                joinPoint.y +
                halfSize +
                gap,

              rotation:
                180,

              frontPin: {
                x:
                  joinPoint.x,

                y:
                  joinPoint.y +
                  gap,
              },

              joinPoint,
            }
          );
        } else if (vertical) {
          /*
          * Existing wire:
          *
          *       |
          *       |
          *
          * Bias can sit on the left and point right,
          * or sit on the right and point left.
          */
          candidates.push(
            {
              x:
                joinPoint.x -
                halfSize -
                gap,

              y:
                joinPoint.y,

              rotation:
                -90,

              frontPin: {
                x:
                  joinPoint.x -
                  gap,

                y:
                  joinPoint.y,
              },

              joinPoint,
            },

            {
              x:
                joinPoint.x +
                halfSize +
                gap,

              y:
                joinPoint.y,

              rotation:
                90,

              frontPin: {
                x:
                  joinPoint.x +
                  gap,

                y:
                  joinPoint.y,
              },

              joinPoint,
            }
          );
        }

        for (const candidate of candidates) {
          const halfSize =
            drawConfig.imageSize / 2;

          /*
          * Reject any arrow position whose image overlaps
          * the complete JJ/resistor subcircuit rectangle.
          */
          const overlapsJRPair =
            jrObstacleBoxes.some(
              (box) =>
                !(
                  candidate.x +
                    halfSize <=
                      box.left ||

                  candidate.x -
                    halfSize >=
                      box.right ||

                  candidate.y +
                    halfSize <=
                      box.top ||

                  candidate.y -
                    halfSize >=
                      box.bottom
                )
            );

          /*
          * Reject a position when its short connection
          * stub would pass through the JR rectangle.
          */
          const stubCrossesJRPair =
            jrObstacleBoxes.some(
              (box) =>
                axisAlignedSegmentHitsBox(
                  candidate.frontPin,
                  joinPoint,
                  box
                )
            );

          if (
            overlapsJRPair ||
            stubCrossesJRPair
          ) {
            continue;
          }

          const isFree =
            isBiasPositionFree(
              bias,
              candidate.x,
              candidate.y,
              placed
            );

          const movement =
            Math.abs(
              originalX -
              candidate.x
            ) +
            Math.abs(
              originalY -
              candidate.y
            );

          const score =
            movement +
            (
              isFree
                ? 0
                : 1000000
            );

          if (
            !best ||
            score < best.score
          ) {
            best = {
              ...candidate,
              score,
            };
          }
        }
      }
    }

    /*
     * Keep the original target-based behavior when
     * no already-routed segment exists for this net.
     */
    if (!best) {
      bias.biasSnappedToNet =
        false;

      continue;
    }

    bias.x =
      best.x;

    bias.y =
      best.y;

    bias.biasRotation =
      best.rotation;

    bias.biasFrontPin = {
      ...best.frontPin,
    };

    bias.biasNetJoin = {
      ...best.joinPoint,
    };

    bias.outputPin = {
      ...best.joinPoint,

      net:
        bias.net_out,
    };

    /*
    * The bias is connected through only its own
    * perpendicular branch.
    */
    bias.biasNetSegment =
      null;

    bias.biasSnappedToNet =
      true;

    bias.biasPlacementLocked =
      true;
    }
}