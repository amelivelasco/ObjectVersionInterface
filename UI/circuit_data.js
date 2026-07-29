window.circuitData = {
  "name": "ordered_elems",
  "generated_at": "2026-07-29T11:32:55.145140+00:00",
  "nodes": [
    {
      "id": "VDD",
      "label": "VDD"
    },
    {
      "id": "net14",
      "label": "net14"
    },
    {
      "id": "net25",
      "label": "net25"
    },
    {
      "id": "GND!",
      "label": "GND!"
    },
    {
      "id": "net18",
      "label": "net18"
    },
    {
      "id": "net10",
      "label": "net10"
    },
    {
      "id": "OUT1",
      "label": "OUT1"
    },
    {
      "id": "OUT2",
      "label": "OUT2"
    },
    {
      "id": "IN",
      "label": "IN"
    }
  ],
  "elements": [
    {
      "id": "IB1",
      "raw": "IB1",
      "path": "splitter_1/IB1",
      "pid": "IB1",
      "layout_cell": "pwrcell_pcell_802c",
      "layout_instance": "splitter_1::pwrcell_pcell_802c",
      "instance_path": "splitter_1",
      "type": [
        "IB",
        ""
      ],
      "net_in": "VDD",
      "net_out": "net14",
      "value": "570.0",
      "image": "../img/biais_draw.png"
    },
    {
      "id": "J2",
      "raw": "J2",
      "path": "splitter_1/J2",
      "pid": "J2",
      "layout_cell": "jj_s_pcell_34fb",
      "layout_instance": "splitter_1::jj_s_pcell_34fb",
      "instance_path": "splitter_1",
      "type": [
        "JJ",
        "R"
      ],
      "net_in": "net25",
      "net_out": "GND!",
      "value": "250.0",
      "image": "../img/jj_draw.png"
    },
    {
      "id": "R2",
      "raw": "R2",
      "path": "splitter_1/J2",
      "pid": "J2",
      "layout_cell": "jj_s_pcell_34fb",
      "layout_instance": "splitter_1::jj_s_pcell_34fb",
      "instance_path": "splitter_1",
      "type": [
        "R",
        ""
      ],
      "net_in": "net25",
      "net_out": "GND!",
      "image": "../img/res_draw.png"
    },
    {
      "id": "J3",
      "raw": "J3",
      "path": "splitter_1/J3",
      "pid": "J3",
      "layout_cell": "jj_s_pcell_34fb",
      "layout_instance": "splitter_1::jj_s_pcell_34fb",
      "instance_path": "splitter_1",
      "type": [
        "JJ",
        "R"
      ],
      "net_in": "net18",
      "net_out": "GND!",
      "value": "250.0",
      "image": "../img/jj_draw.png"
    },
    {
      "id": "R3",
      "raw": "R3",
      "path": "splitter_1/J3",
      "pid": "J3",
      "layout_cell": "jj_s_pcell_34fb",
      "layout_instance": "splitter_1::jj_s_pcell_34fb",
      "instance_path": "splitter_1",
      "type": [
        "R",
        ""
      ],
      "net_in": "net18",
      "net_out": "GND!",
      "image": "../img/res_draw.png"
    },
    {
      "id": "J1",
      "raw": "J1",
      "path": "splitter_1/J1",
      "pid": "J1",
      "layout_cell": "jj_s_pcell_6976",
      "layout_instance": "splitter_1::jj_s_pcell_6976",
      "instance_path": "splitter_1",
      "type": [
        "JJ",
        "R"
      ],
      "net_in": "net10",
      "net_out": "GND!",
      "value": "325.0",
      "image": "../img/jj_draw.png"
    },
    {
      "id": "R1",
      "raw": "R1",
      "path": "splitter_1/J1",
      "pid": "J1",
      "layout_cell": "jj_s_pcell_6976",
      "layout_instance": "splitter_1::jj_s_pcell_6976",
      "instance_path": "splitter_1",
      "type": [
        "R",
        ""
      ],
      "net_in": "net10",
      "net_out": "GND!",
      "image": "../img/res_draw.png"
    },
    {
      "id": "L9",
      "raw": "L9",
      "path": "splitter_1/L9",
      "pid": "L9",
      "layout_cell": "ind2_pcell_1657",
      "layout_instance": "splitter_1::ind2_pcell_1657",
      "instance_path": "splitter_1",
      "type": [
        "L",
        ""
      ],
      "net_in": "net25",
      "net_out": "OUT1",
      "value": "1.9",
      "image": "../img/ind_draw.png"
    },
    {
      "id": "L8",
      "raw": "L8",
      "path": "splitter_1/L8",
      "pid": "L8",
      "layout_cell": "ind2_pcell_1657",
      "layout_instance": "splitter_1::ind2_pcell_1657",
      "instance_path": "splitter_1",
      "type": [
        "L",
        ""
      ],
      "net_in": "net18",
      "net_out": "OUT2",
      "value": "1.9",
      "image": "../img/ind_draw.png"
    },
    {
      "id": "L7",
      "raw": "L7",
      "path": "splitter_1/L7",
      "pid": "L7",
      "layout_cell": "ind2_pcell_2c0c",
      "layout_instance": "splitter_1::ind2_pcell_2c0c",
      "instance_path": "splitter_1",
      "type": [
        "L",
        ""
      ],
      "net_in": "net14",
      "net_out": "net18",
      "value": "1.6",
      "image": "../img/ind_draw.png"
    },
    {
      "id": "L6",
      "raw": "L6",
      "path": "splitter_1/L6",
      "pid": "L6",
      "layout_cell": "ind2_pcell_2c0c",
      "layout_instance": "splitter_1::ind2_pcell_2c0c",
      "instance_path": "splitter_1",
      "type": [
        "L",
        ""
      ],
      "net_in": "net14",
      "net_out": "net25",
      "value": "1.6",
      "image": "../img/ind_draw.png"
    },
    {
      "id": "L4",
      "raw": "L4",
      "path": "splitter_1/L4",
      "pid": "L4",
      "layout_cell": "ind2_pcell_4f32",
      "layout_instance": "splitter_1::ind2_pcell_4f32",
      "instance_path": "splitter_1",
      "type": [
        "L",
        ""
      ],
      "net_in": "net10",
      "net_out": "net14",
      "value": "1.4",
      "image": "../img/ind_draw.png"
    },
    {
      "id": "L3",
      "raw": "L3",
      "path": "splitter_1/L3",
      "pid": "L3",
      "layout_cell": "ind2_pcell_e6bf",
      "layout_instance": "splitter_1::ind2_pcell_e6bf",
      "instance_path": "splitter_1",
      "type": [
        "L",
        ""
      ],
      "net_in": "IN",
      "net_out": "net10",
      "value": "1.1",
      "image": "../img/ind_draw.png"
    }
  ],
  "layout_cells": [
    {
      "id": "splitter_1::pwrcell_pcell_802c",
      "layout_instance": "splitter_1::pwrcell_pcell_802c",
      "layout_cell": "pwrcell_pcell_802c",
      "instance_path": "splitter_1",
      "display_name": "pwrcell_pcell_802c (splitter_1)",
      "net_in": "VDD",
      "net_out": "net14",
      "elements": [
        "IB1"
      ]
    },
    {
      "id": "splitter_1::jj_s_pcell_34fb",
      "layout_instance": "splitter_1::jj_s_pcell_34fb",
      "layout_cell": "jj_s_pcell_34fb",
      "instance_path": "splitter_1",
      "display_name": "jj_s_pcell_34fb (splitter_1)",
      "net_in": "net25",
      "net_out": "GND!",
      "elements": [
        "J2",
        "R2",
        "J3",
        "R3"
      ]
    },
    {
      "id": "splitter_1::jj_s_pcell_6976",
      "layout_instance": "splitter_1::jj_s_pcell_6976",
      "layout_cell": "jj_s_pcell_6976",
      "instance_path": "splitter_1",
      "display_name": "jj_s_pcell_6976 (splitter_1)",
      "net_in": "net10",
      "net_out": "GND!",
      "elements": [
        "J1",
        "R1"
      ]
    },
    {
      "id": "splitter_1::ind2_pcell_1657",
      "layout_instance": "splitter_1::ind2_pcell_1657",
      "layout_cell": "ind2_pcell_1657",
      "instance_path": "splitter_1",
      "display_name": "ind2_pcell_1657 (splitter_1)",
      "net_in": "net25",
      "net_out": "OUT2",
      "elements": [
        "L9",
        "L8"
      ]
    },
    {
      "id": "splitter_1::ind2_pcell_2c0c",
      "layout_instance": "splitter_1::ind2_pcell_2c0c",
      "layout_cell": "ind2_pcell_2c0c",
      "instance_path": "splitter_1",
      "display_name": "ind2_pcell_2c0c (splitter_1)",
      "net_in": "net14",
      "net_out": "net25",
      "elements": [
        "L7",
        "L6"
      ]
    },
    {
      "id": "splitter_1::ind2_pcell_4f32",
      "layout_instance": "splitter_1::ind2_pcell_4f32",
      "layout_cell": "ind2_pcell_4f32",
      "instance_path": "splitter_1",
      "display_name": "ind2_pcell_4f32 (splitter_1)",
      "net_in": "net10",
      "net_out": "net14",
      "elements": [
        "L4"
      ]
    },
    {
      "id": "splitter_1::ind2_pcell_e6bf",
      "layout_instance": "splitter_1::ind2_pcell_e6bf",
      "layout_cell": "ind2_pcell_e6bf",
      "instance_path": "splitter_1",
      "display_name": "ind2_pcell_e6bf (splitter_1)",
      "net_in": "IN",
      "net_out": "net10",
      "elements": [
        "L3"
      ]
    }
  ]
};
