function isSharedOutputConflict(terminals) { 
  const outputs = terminals.filter(
    (terminal) =>
      terminal.kind === "out" &&
      terminal.element
  );

  if (outputs.length < 2) {
    return false;
  }

  const distinctInputNets = new Set(
    outputs.map(
      (terminal) =>
        terminal.element.net_in ?? "__missing__"
    )
  );

  return distinctInputNets.size > 1;
}

function extractWireSegmentsFromElement(element) {
  const segments = [];

  if (element.tagName?.toLowerCase() === "line") {
    segments.push({
      a: {
        x: Number(element.getAttribute("x1")),
        y: Number(element.getAttribute("y1")),
      },
      b: {
        x: Number(element.getAttribute("x2")),
        y: Number(element.getAttribute("y2")),
      },
    });

    return segments;
  }

  if (element.tagName?.toLowerCase() !== "path") {
    return segments;
  }

  const tokens =
    element
      .getAttribute("d")
      ?.match(/[MLHV]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) || [];

  let index = 0;
  let command = null;
  let current = null;

  while (index < tokens.length) {
    if (/^[MLHV]$/i.test(tokens[index])) {
      command = tokens[index].toUpperCase();
      index++;
    }

    if (!command) {
      break;
    }

    let next = null;

    if (command === "M" || command === "L") {
      next = {
        x: Number(tokens[index++]),
        y: Number(tokens[index++]),
      };
    } else if (command === "H") {
      next = {
        x: Number(tokens[index++]),
        y: current.y,
      };
    } else if (command === "V") {
      next = {
        x: current.x,
        y: Number(tokens[index++]),
      };
    }

    if (!next) {
      break;
    }

    if (current && command !== "M") {
      segments.push({
        a: { ...current },
        b: { ...next },
      });
    }

    current = next;
  }

  return segments;
}

function buildRoutingObstacleBoxes(
  elements,
  excludedIds = new Set(),
  padding = 10
) {
  const boxes = [];
  const consumedIds = new Set();
  const halfSize = drawConfig.imageSize / 2;

  for (const current of elements) {
    if (
      consumedIds.has(current.id) ||
      getElementType(current) !== "JJ"
    ) {
      continue;
    }

    const resistor = elements.find(
      (candidate) =>
        !consumedIds.has(candidate.id) &&
        isJJResistorPair(current, candidate)
    );

    if (!resistor) {
      continue;
    }

    consumedIds.add(current.id);
    consumedIds.add(resistor.id);

    const ownerIds = new Set([
      current.id,
      resistor.id,
    ]);

    const geometry = getJJPairGeometry(
      current,
      resistor,
      25
    );

    boxes.push({
      left:
        Math.min(
          current.x,
          resistor.x
        ) -
        halfSize -
        padding,

      right:
        Math.max(
          current.x,
          resistor.x
        ) +
        halfSize +
        padding,

      /*
      * The top and bottom connection anchors lie
      * exactly on the obstacle boundary. The router
      * can reach the anchor, but cannot enter the
      * interior of the JR subcircuit.
      */
      top:
        geometry.topMiddle.y,

      bottom:
        geometry.bottomMiddle.y,

      ownerIds,

      isJRPair: true,
    });
  }

  for (const element of elements) {
    if (
      consumedIds.has(element.id) ||
      excludedIds.has(element.id)
    ) {
      continue;
    }

    const elementPadding =
      getElementType(element) === "L"
        ? Math.max(
            padding,
            drawConfig.wireStrokeWidth + 14
          )
        : padding;

    boxes.push({
      left:
        element.x -
        halfSize -
        elementPadding,
      right:
        element.x +
        halfSize +
        elementPadding,
      top:
        element.y -
        halfSize -
        elementPadding,
      bottom:
        element.y +
        halfSize +
        elementPadding,
      ownerIds: new Set([
        element.id,
      ]),
    });
  }

  return boxes;
}

function pointInsideBox(point, box) {
  const epsilon = 0.5;

  return (
    point.x > box.left + epsilon &&
    point.x < box.right - epsilon &&
    point.y > box.top + epsilon &&
    point.y < box.bottom - epsilon
  );
}

function axisAlignedSegmentHitsBox(
  first,
  second,
  box
) {
  const epsilon = 0.5;

  if (
    Math.abs(first.y - second.y) < epsilon
  ) {
    const minimumX = Math.min(first.x, second.x);
    const maximumX = Math.max(first.x, second.x);

    return (
      first.y > box.top + epsilon &&
      first.y < box.bottom - epsilon &&
      maximumX > box.left + epsilon &&
      minimumX < box.right - epsilon
    );
  }

  if (
    Math.abs(first.x - second.x) < epsilon
  ) {
    const minimumY = Math.min(first.y, second.y);
    const maximumY = Math.max(first.y, second.y);

    return (
      first.x > box.left + epsilon &&
      first.x < box.right - epsilon &&
      maximumY > box.top + epsilon &&
      minimumY < box.bottom - epsilon
    );
  }

  return true;
}

function getWireRelation(first, second) {
  const epsilon = 0.5;

  const firstHorizontal =
    Math.abs(first.a.y - first.b.y) < epsilon;
  const secondHorizontal =
    Math.abs(second.a.y - second.b.y) < epsilon;

  if (firstHorizontal && secondHorizontal) {
    if (
      Math.abs(first.a.y - second.a.y) >= epsilon
    ) {
      return null;
    }

    const overlap =
      Math.min(
        Math.max(first.a.x, first.b.x),
        Math.max(second.a.x, second.b.x)
      ) -
      Math.max(
        Math.min(first.a.x, first.b.x),
        Math.min(second.a.x, second.b.x)
      );

    return overlap > epsilon
      ? "overlap"
      : null;
  }

  if (!firstHorizontal && !secondHorizontal) {
    if (
      Math.abs(first.a.x - second.a.x) >= epsilon
    ) {
      return null;
    }

    const overlap =
      Math.min(
        Math.max(first.a.y, first.b.y),
        Math.max(second.a.y, second.b.y)
      ) -
      Math.max(
        Math.min(first.a.y, first.b.y),
        Math.min(second.a.y, second.b.y)
      );

    return overlap > epsilon
      ? "overlap"
      : null;
  }

  const horizontal = firstHorizontal
    ? first
    : second;
  const vertical = firstHorizontal
    ? second
    : first;

  const crossingX = vertical.a.x;
  const crossingY = horizontal.a.y;

  const crossesHorizontalInterior =
    crossingX >
      Math.min(horizontal.a.x, horizontal.b.x) +
        epsilon &&
    crossingX <
      Math.max(horizontal.a.x, horizontal.b.x) -
        epsilon;

  const crossesVerticalInterior =
    crossingY >
      Math.min(vertical.a.y, vertical.b.y) +
        epsilon &&
    crossingY <
      Math.max(vertical.a.y, vertical.b.y) -
        epsilon;

  return (
    crossesHorizontalInterior &&
    crossesVerticalInterior
  )
    ? "cross"
    : null;
}

function getWirePenalty(
  first,
  second,
  routedSegments
) {
  const candidate = {
    a: first,
    b: second,
  };

  let penalty = 0;

  for (const existing of routedSegments) {
    const relation = getWireRelation(
      candidate,
      existing
    );

    if (relation === "overlap") {
      penalty += 1000000000000;
    } else if (relation === "cross") {
      penalty += 1000000000;
    }
  }

  return penalty;
}

function uniqueSortedNumbers(values) {
  return [...new Set(
    values.map(
      (value) => Number(value.toFixed(3))
    )
  )].sort(
    (first, second) => first - second
  );
}

class RoutingMinHeap {
  constructor() {
    this.items = [];
  }

  push(item) {
    this.items.push(item);
    this.bubbleUp(this.items.length - 1);
  }

  pop() {
    if (this.items.length === 0) {
      return null;
    }

    const first = this.items[0];
    const last = this.items.pop();

    if (this.items.length > 0) {
      this.items[0] = last;
      this.bubbleDown(0);
    }

    return first;
  }

  bubbleUp(index) {
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);

      if (
        this.items[parent].priority <=
        this.items[index].priority
      ) {
        break;
      }

      [
        this.items[parent],
        this.items[index],
      ] = [
        this.items[index],
        this.items[parent],
      ];

      index = parent;
    }
  }

  bubbleDown(index) {
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      let smallest = index;

      if (
        left < this.items.length &&
        this.items[left].priority <
          this.items[smallest].priority
      ) {
        smallest = left;
      }

      if (
        right < this.items.length &&
        this.items[right].priority <
          this.items[smallest].priority
      ) {
        smallest = right;
      }

      if (smallest === index) {
        break;
      }

      [
        this.items[index],
        this.items[smallest],
      ] = [
        this.items[smallest],
        this.items[index],
      ];

      index = smallest;
    }
  }
}

function simplifyOrthogonalPoints(points) {
  const cleaned = [];

  for (const point of points) {
    const previous = cleaned[cleaned.length - 1];

    if (
      previous &&
      Math.abs(previous.x - point.x) < 0.5 &&
      Math.abs(previous.y - point.y) < 0.5
    ) {
      continue;
    }

    cleaned.push({ ...point });
  }

  let index = 1;

  while (index < cleaned.length - 1) {
    const previous = cleaned[index - 1];
    const current = cleaned[index];
    const next = cleaned[index + 1];

    const sameX =
      Math.abs(previous.x - current.x) < 0.5 &&
      Math.abs(current.x - next.x) < 0.5;

    const sameY =
      Math.abs(previous.y - current.y) < 0.5 &&
      Math.abs(current.y - next.y) < 0.5;

    if (sameX || sameY) {
      cleaned.splice(index, 1);
    } else {
      index++;
    }
  }

  return cleaned;
}

function routePointsToPathData(points) {
  const cleaned = simplifyOrthogonalPoints(points);

  if (cleaned.length === 0) {
    return "";
  }

  const commands = [
    `M ${cleaned[0].x} ${cleaned[0].y}`,
  ];

  for (
    let index = 1;
    index < cleaned.length;
    index++
  ) {
    const previous = cleaned[index - 1];
    const current = cleaned[index];

    if (
      Math.abs(previous.y - current.y) < 0.5
    ) {
      commands.push(`H ${current.x}`);
    } else {
      commands.push(`V ${current.y}`);
    }
  }

  return commands.join(" ");
}

function routePointsToSegments(points) {
  const cleaned = simplifyOrthogonalPoints(points);
  const segments = [];

  for (
    let index = 0;
    index < cleaned.length - 1;
    index++
  ) {
    segments.push({
      a: cleaned[index],
      b: cleaned[index + 1],
    });
  }

  return segments;
}