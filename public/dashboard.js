const deviceSelect = document.getElementById("deviceSelect");
const rangeSelect = document.getElementById("rangeSelect");
const refreshBtn = document.getElementById("refreshBtn");
const statusEl = document.getElementById("status");

const kpiTemp = document.getElementById("kpiTemp");
const kpiHum = document.getElementById("kpiHum");
const kpiAqi = document.getElementById("kpiAqi");
const kpiTs = document.getElementById("kpiTs");
const tableBody = document.getElementById("tableBody");

let tempChart, humChart, aqiChart;
const fmt = (n) => (typeof n === "number" ? n.toFixed(1) : "—");

function rangeToMs(v) {
  switch (v) {
    case "1h": return 1 * 60 * 60 * 1000;
    case "6h": return 6 * 60 * 60 * 1000;
    case "24h": return 24 * 60 * 60 * 1000;
    case "7d": return 7 * 24 * 60 * 60 * 1000;
    default: return 6 * 60 * 60 * 1000;
  }
}

function setStatus(msg) {
  statusEl.textContent = msg;
}

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

function ensureCharts(labels, temps, hums, aqis) {
  const makeCfg = (label, data) => ({
    type: "line",
    data: { labels, datasets: [{ label, data, tension: 0.25, pointRadius: 0 }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: { ticks: { maxTicksLimit: 8 } } }
    }
  });

  const tempCtx = document.getElementById("tempChart");
  const humCtx = document.getElementById("humChart");
  const aqiCtx = document.getElementById("aqiChart");

  // Set canvas heights via CSS-like sizing
  tempCtx.parentElement.style.height = "240px";
  humCtx.parentElement.style.height = "240px";
  aqiCtx.parentElement.style.height = "240px";

  if (tempChart) tempChart.destroy();
  if (humChart) humChart.destroy();
  if (aqiChart) aqiChart.destroy();

  tempChart = new Chart(tempCtx, makeCfg("Temperature", temps));
  humChart = new Chart(humCtx, makeCfg("Humidity", hums));
  aqiChart = new Chart(aqiCtx, makeCfg("AQI", aqis));
}

function fillKPIs(latest) {
  if (!latest) {
    kpiTemp.textContent = "—";
    kpiHum.textContent = "—";
    kpiAqi.textContent = "—";
    kpiTs.textContent = "—";
    return;
  }
  kpiTemp.textContent = `${fmt(latest.temperature)} °C`;
  kpiHum.textContent = `${fmt(latest.humidity)} %`;
  kpiAqi.textContent = `${fmt(latest.aqi)}`;
  kpiTs.textContent = new Date(latest.ts).toLocaleString("en-GB");
}

function fillTable(readings) {
  const recent = readings.slice(-50).reverse();
  tableBody.innerHTML = recent.map(r => `
    <tr>
      <td>${new Date(r.ts).toLocaleString()}</td>
      <td>${fmt(r.temperature)} °C</td>
      <td>${fmt(r.humidity)} %</td>
      <td>${fmt(r.aqi)}</td>
    </tr>
  `).join("");
}

async function loadDevices() {
  setStatus("Loading devices…");
  const data = await fetchJSON("/api/devices");
  deviceSelect.innerHTML = data.devices.map(d => `<option value="${d}">${d}</option>`).join("");
  setStatus("");
}

async function loadData() {
  const deviceId = deviceSelect.value;
  const ms = rangeToMs(rangeSelect.value);
  const to = new Date();
  const from = new Date(Date.now() - ms);

  setStatus("Fetching readings…");
  const q = new URLSearchParams({
    deviceId,
    from: from.toISOString(),
    to: to.toISOString(),
    limit: "3000"
  });

  const data = await fetchJSON(`/api/readings?${q.toString()}`);
  const readings = data.readings || [];

  if (!readings.length) {
    fillKPIs(null);
    fillTable([]);
    ensureCharts([], [], [], []);
    setStatus("No data in this range.");
    return;
  }

  const labels = readings.map(r => new Date(r.ts).toLocaleTimeString());
  const temps = readings.map(r => r.temperature);
  const hums = readings.map(r => r.humidity);
  const aqis = readings.map(r => r.aqi);

  ensureCharts(labels, temps, hums, aqis);
  fillTable(readings);
  fillKPIs(readings[readings.length - 1]);
  setStatus(`Loaded ${readings.length} points.`);
}

async function init() {
  try {
    await loadDevices();
    await loadData();
    // auto-refresh every 30s
    setInterval(loadData, 30000);
  } catch (e) {
    console.error(e);
    setStatus(`Error: ${e.message}`);
  }
}

refreshBtn.addEventListener("click", loadData);
deviceSelect.addEventListener("change", loadData);
rangeSelect.addEventListener("change", loadData);

init();
