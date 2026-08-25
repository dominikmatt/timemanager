import "./components.js";

const table = document.querySelector("time-result-table");
document.querySelector("file-compare-form").addEventListener("compare-result", (event) => {
  table.result = event.detail;
});
