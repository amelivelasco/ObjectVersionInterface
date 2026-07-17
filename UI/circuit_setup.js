const drawConfig = {
  imageSize: 44,

  wireStroke: "#475569",
  wireStrokeWidth: 2,

  nodeRadius: 4,
  groundRadius: 6,

  nodeFill: "#ffffff",
  nodeStroke: "#1f2937",

  groundFill: "#dc2626",
  groundStroke: "#7f1d1d",

  fontFamily: "Arial, sans-serif",

  externalPortLength: 45,

  // Python currently generates left/right pins.
  rotateResistors: true,
};

function createSvg(width, height) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");

  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", "100%");
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

  svg.classList.add("circuit-svg");

  return svg;
}

function createSvgElement(name, attrs = {}) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", name);

  Object.entries(attrs).forEach(([key, value]) => {
    el.setAttribute(key, value);
  });

  return el;
}

function routePointsToPath(points) {
  return points
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"} ` +
        `${point.x} ${point.y}`
    )
    .join(" ");
}

function drawGeneratedRoutes(
  wireLayer,
  routes
) {
  const orderedRoutes = [
    ...(routes || []),
  ].sort(
    (first, second) =>
      Number(first.routing_layer ?? 0) -
      Number(second.routing_layer ?? 0)
  );

  for (const route of orderedRoutes) {
    if (!route.routed) {
      console.warn(
        `Unrouted net: ${route.net}`
      );

      continue;
    }

    if (route.external) {
      continue;
    }

    const routingLayer = Number(
      route.routing_layer ?? 0
    );

    for (const points of route.paths || []) {
      if (
        !Array.isArray(points) ||
        points.length < 2
      ) {
        continue;
      }

      const pathData =
        routePointsToPath(points);

      /*
       * A higher routing layer receives a white
       * underlay. This makes crossings look like
       * insulated wire crossings rather than
       * electrical junctions.
       */
      if (routingLayer > 0) {
        const underlay =
          createSvgElement("path", {
            d: pathData,

            fill: "none",
            stroke: "#ffffff",

            "stroke-width":
              drawConfig.wireStrokeWidth + 6,

            "stroke-linecap": "round",
            "stroke-linejoin": "round",

            class:
              "edge routed-edge-underlay",

            "data-net": route.net,

            "data-routing-layer":
              routingLayer,
          });

        wireLayer.appendChild(
          underlay
        );
      }

      const path =
        createSvgElement("path", {
          d: pathData,

          fill: "none",

          stroke:
            route.net === "GND!"
              ? drawConfig.groundFill
              : drawConfig.wireStroke,

          "stroke-width":
            drawConfig.wireStrokeWidth,

          "stroke-linecap": "round",
          "stroke-linejoin": "round",

          class:
            "edge routed-edge",

          "data-net": route.net,

          "data-routing-layer":
            routingLayer,
        });

      wireLayer.appendChild(path);
    }
  }
}

function setupPanZoom(svg, fullWidth, fullHeight) {
  let viewBox = {
    x: 0,
    y: 0,
    width: fullWidth,
    height: fullHeight,
  };

  let isPanning = false;
  let start = null;

  function applyViewBox() {
    svg.setAttribute(
      "viewBox",
      `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`
    );
  }

  function clientToSvgPoint(event) {
    const rect = svg.getBoundingClientRect();

    const x =
      viewBox.x +
      ((event.clientX - rect.left) / rect.width) * viewBox.width;

    const y =
      viewBox.y +
      ((event.clientY - rect.top) / rect.height) * viewBox.height;

    return { x, y };
  }

  svg.addEventListener("wheel", (event) => {
    event.preventDefault();

    const point = clientToSvgPoint(event);
    const zoomFactor = event.deltaY < 0 ? 0.88 : 1.14;

    const newWidth = viewBox.width * zoomFactor;
    const newHeight = viewBox.height * zoomFactor;

    viewBox.x = point.x - ((point.x - viewBox.x) / viewBox.width) * newWidth;
    viewBox.y = point.y - ((point.y - viewBox.y) / viewBox.height) * newHeight;
    viewBox.width = newWidth;
    viewBox.height = newHeight;

    applyViewBox();
  });

  svg.addEventListener("mousedown", (event) => {
    isPanning = true;
    svg.classList.add("is-panning");

    start = {
      clientX: event.clientX,
      clientY: event.clientY,
      viewBoxX: viewBox.x,
      viewBoxY: viewBox.y,
    };
  });

  window.addEventListener("mousemove", (event) => {
    if (!isPanning || !start) {
      return;
    }

    const rect = svg.getBoundingClientRect();

    const dx =
      ((event.clientX - start.clientX) / rect.width) * viewBox.width;

    const dy =
      ((event.clientY - start.clientY) / rect.height) * viewBox.height;

    viewBox.x = start.viewBoxX - dx;
    viewBox.y = start.viewBoxY - dy;

    applyViewBox();
  });

  window.addEventListener("mouseup", () => {
    isPanning = false;
    svg.classList.remove("is-panning");
    start = null;
  });

  svg.addEventListener("dblclick", () => {
    viewBox = {
      x: 0,
      y: 0,
      width: fullWidth,
      height: fullHeight,
    };

    applyViewBox();
  });

  applyViewBox();
}
