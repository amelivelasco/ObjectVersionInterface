const drawConfig = {
  nodeRadius: 8,
  nodeStroke: "#1f2937",
  nodeFill: "#ffffff",
  edgeStroke: "#475569",
  edgeStrokeWidth: 2,
  nodeTextFill: "#0f172a",
  imageSize: 40,
  boardPadding: 20,
};

function createSvg(width, height) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", "100%");
  svg.classList.add("circuit-svg");
  return svg;
}

function createSvgElement(name, attrs) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", name);
  Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, value));
  return el;
}

function buildPositions(data, width, height) {
  const nodes = data.nodes.slice();
  const ports = new Set(data.ports || []);
  const left = width * 0.12;
  const middle = width * 0.45;
  const right = width * 0.78;

  const portNodes = nodes.filter((node) => ports.has(node.id));
  const gndNodes = nodes.filter((node) => node.id === "GND!");
  const otherNodes = nodes.filter((node) => !ports.has(node.id) && node.id !== "GND!");

  const portSpacing = Math.max(60, (height - 120) / Math.max(1, portNodes.length));
  portNodes.forEach((node, index) => {
    node.x = left;
    node.y = 80 + index * portSpacing;
  });

  const otherSpacing = Math.max(60, (height - 120) / Math.max(1, otherNodes.length));
  otherNodes.forEach((node, index) => {
    node.x = middle;
    node.y = 80 + index * otherSpacing;
  });

  gndNodes.forEach((node, index) => {
    node.x = right;
    node.y = height - 90 - index * 50;
  });

  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  return nodeMap;
}

function buildEdgePath(source, target) {
  const midX = source.x + (target.x - source.x) * 0.4;
  return `M ${source.x} ${source.y} L ${midX} ${source.y} L ${midX} ${target.y} L ${target.x} ${target.y}`;
}

function drawCircuit(data) {
  const board = document.getElementById("drawing_board");
  board.innerHTML = "";

  if (!data || !data.nodes || !data.elements) {
    board.textContent = "Circuit data is missing. Run export_circuit_data.py first.";
    return;
  }

  const width = 1100;
  const height = 700;
  const svg = createSvg(width, height);
  board.appendChild(svg);

  const nodeMap = buildPositions(data, width, height);

  data.elements.forEach((element) => {
    const source = nodeMap.get(element.net_in);
    const target = nodeMap.get(element.net_out);
    if (!source || !target) {
      return;
    }

    const path = createSvgElement("path", {
      d: buildEdgePath(source, target),
      stroke: drawConfig.edgeStroke,
      "stroke-width": drawConfig.edgeStrokeWidth,
      fill: "none",
      "stroke-linecap": "round",
    });
    svg.appendChild(path);

    const midX = source.x + (target.x - source.x) * 0.5;
    const midY = source.y + (target.y - source.y) * 0.5;
    const image = createSvgElement("image", {
      href: element.image,
      x: midX - drawConfig.imageSize / 2,
      y: midY - drawConfig.imageSize / 2,
      width: drawConfig.imageSize,
      height: drawConfig.imageSize,
    });
    svg.appendChild(image);
  });

  nodeMap.forEach((node) => {
    const dot = createSvgElement("circle", {
      cx: node.x,
      cy: node.y,
      r: drawConfig.nodeRadius,
      fill: drawConfig.nodeFill,
      stroke: drawConfig.nodeStroke,
      "stroke-width": 2,
    });
    svg.appendChild(dot);

    const label = createSvgElement("text", {
      x: node.x + 16,
      y: node.y + 4,
      fill: drawConfig.nodeTextFill,
      "font-family": "Arial, sans-serif",
      "font-size": "11px",
    });
    label.textContent = node.label;
    svg.appendChild(label);
  });
}

window.addEventListener("DOMContentLoaded", () => {
  if (window.circuitData) {
    drawCircuit(window.circuitData);
  } else {
    const board = document.getElementById("drawing_board");
    board.textContent = "Circuit data is missing. Run export_circuit_data.py first.";
  }
});
