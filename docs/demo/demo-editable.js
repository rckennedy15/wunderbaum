/**
 * Demo code for Wunderbaum (https://github.com/mar10/wunderbaum).
 *
 * Copyright (c) 2021-2022, Martin Wendt (https://wwWendt.de).
 */
document.getElementById("demo-info").innerHTML = `
 A treegrid with embedded input controls (also renaming nodes, but no filter or d'n'd).
 cell-navigation mode
 `;

new mar10.Wunderbaum({
  id: "demo",
  element: document.querySelector("#demo-tree"),
  debugLevel: 5,
  connectTopBreadcrumb: document.getElementById("parentPath"),
  checkbox: true,
  // fixedCol: true,
  navigationModeOption: "cell",

  source: "../assets/ajax_1k_3_6.json",
  types: {
    "department": { "icon": "bi bi-diagram-3", "colspan": true },
    "role": { "icon": "bi bi-microsoft-teams", "colspan": true },
    "person": { "icon": "bi bi-person" },
  },
  columns: [
    {
      "title": "Title",
      "id": "*",
      "width": "250px",
    },
    {
      "title": "Age",
      "id": "age",
      "width": "50px",
      // "html": "<input type=number min=0 tabindex='-1'>",
      "classes": "wb-helper-end",
    },
    {
      "title": "Date",
      "id": "date",
      "width": "100px",
      // "html": '<input type=date tabindex="-1">',
    },
    {
      "title": "Mood",
      "id": "mood",
      "width": "70px",
      // "html": `<select tabindex="-1">
      //     <option value="h">Happy</option>
      //     <option value="s">Sad</option>
      //     </select>`
    },
    {
      "title": "Remarks",
      "id": "remarks",
      "width": "*",
      // "width": "300px",
      // "html": "<input type=text tabindex='-1'>",
    },
  ],

  edit: {
    trigger: ["clickActive", "F2", "macEnter"],
    select: true,
    beforeEdit: function (e) {
      console.log(e.type, e);
      // return false;
    },
    edit: function (e) {
      console.log(e.type, e);
    },
    apply: function (e) {
      console.log(e.type, e);
      // Simulate async storage that also validates:
      return e.util.setTimeoutPromise(() => {
        e.inputElem.setCustomValidity("");
        if (e.newValue.match(/.*\d.*/)) {
          e.inputElem.setCustomValidity("No numbers please.");
          return false;
        }
      }, 1000);
    },
  },
  filter: {
    connectInput: "input#filterQuery",
  },
  init: (e) => {
  },
  load: function (e) {
  },
  change: function (e) {
    const util = e.util;
    const info = e.info;
    const colId = info.colId;

    // console.log(e.type, util.getValueFromElem(e.inputElem, true));
    // For demo purposes, simulate a backend delay:
    return e.util.setTimeoutPromise(() => {
      // Assumption: we named column.id === node.data.NAME
      switch (colId) {
        case "author":
        case "details":
        case "price":
        case "qty":
        case "sale": // checkbox control
        case "year":
          // We can hand-code and customize it like so:
          // e.node.data[colId] = e.inputValue;
          // ... but this helper should work in most cases:
          e.node.data[colId] = util.getValueFromElem(e.inputElem, true);
          break;
      }
      // e.node.setModified()
    }, 500);
  },
  render: function (e) {
    // console.log(e.type, e.isNew, e);
    const node = e.node;
    const util = e.util;

    // Render embedded input controls for all data columns
    for (const col of Object.values(e.renderColInfosById)) {
      switch (col.id) {
        case "author":
          if (e.isNew) {
            col.elem.innerHTML = '<input type="text" tabindex="-1">';
          }
          util.setValueToElem(col.elem, node.data.author);
          break;
        case "details": // text control
          if (e.isNew) {
            col.elem.innerHTML = '<input type="text" tabindex="-1">';
          }
          util.setValueToElem(col.elem, node.data.details);
          break;
        case "price":
          if (e.isNew) {
            col.elem.innerHTML = '<input type="number" min="0.00" step="0.01" tabindex="-1">';
          }
          util.setValueToElem(col.elem, node.data.price.toFixed(2));
          break;
        case "age":
          if (e.isNew) {
            col.elem.innerHTML = '<input type="number" min="0" tabindex="-1">';
          }
          util.setValueToElem(col.elem, node.data.age);
          break;
        // case "qty":
        //   if (e.isNew) {
        //     col.elem.innerHTML = '<input type="number" min="0" tabindex="-1">';
        //   }
        //   util.setValueToElem(col.elem, node.data.qty);
        //   break;
        case "sale": // checkbox control
          if (e.isNew) {
            col.elem.innerHTML = '<input type="checkbox" tabindex="-1">';
          }
          // Cast value to bool, since we don't want tri-state behavior
          util.setValueToElem(col.elem, !!node.data.sale);
          break;
        case "year": // thousands separator
          if (e.isNew) {
            col.elem.innerHTML = '<input type="number" max="9999" tabindex="-1">';
          }
          util.setValueToElem(col.elem, node.data.year);
          break;
        default:
          // Assumption: we named column.id === node.data.NAME
          col.elem.textContent = node.data[col.id];
          break;
      }
    }
  },
  update: function (e) {
    // Only used for the demo app (display some stats in the bottom pane):
    showStatus(this);
  },
});
