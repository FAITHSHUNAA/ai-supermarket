const find = id => document.getElementById(id);
const slope = find("slope");
const note = find("note");
const share = find("share");
const key = "muchuan.linear.v1";
let previous = {};
try { previous = JSON.parse(localStorage.getItem(key)) || {}; } catch {}
const incoming = new URLSearchParams(location.search).get("slope");
function valid(value) {
  return typeof value === "string" && value.trim() !== "" && Number.isFinite(+value) && +value >= 0 && +value <= 4 && Number.isInteger(+value * 4);
}
slope.value = valid(incoming) ? incoming : valid(previous.slope) ? previous.slope : "0";
note.value = typeof previous.note === "string" ? previous.note : "";
if (valid(previous.slope)) document.querySelector(".action").textContent = "继续实验 ↓";
function render() {
  const k = Number(slope.value);
  find("value").value = k;
  find("line").setAttribute("y2", 160 - 16 * 3.3 * k);
  let total = 0;
  for (const cell of document.querySelectorAll("[data-x]")) {
    const x = Number(cell.dataset.x);
    const prediction = k * x + 1;
    cell.textContent = prediction;
    total += Math.abs(prediction - (2 * x + 1));
  }
  find("result").textContent = "平均绝对误差 " + total / 3 + (total === 0 ? " · 三个观测值全部吻合。" : "");
  share.href = "/?from=share&slope=" + k + "#lab";
}
function save() {
  try { localStorage.setItem(key, JSON.stringify({slope:slope.value,note:note.value})); }
  catch { find("saved").textContent = "浏览器未允许保存，本次仍可继续练习。"; }
}
slope.addEventListener("input", () => { render(); save(); });
note.addEventListener("input", save);
share.addEventListener("click", async event => {
  event.preventDefault();
  try {
    await navigator.clipboard.writeText(share.href);
    find("share-status").textContent = "链接已复制，只包含斜率。";
  } catch { window.prompt("复制实验链接", share.href); }
});
render();
