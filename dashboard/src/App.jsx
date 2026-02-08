import { useEffect, useMemo, useRef, useState } from 'react';
import {
	LineChart,
	Line,
	XAxis,
	YAxis,
	Tooltip,
	CartesianGrid,
	ResponsiveContainer,
} from 'recharts';
import './App.css';

function rangeToMs(v) {
	switch (v) {
		case '1h':
			return 1 * 60 * 60 * 1000;
		case '6h':
			return 6 * 60 * 60 * 1000;
		case '24h':
			return 24 * 60 * 60 * 1000;
		case '7d':
			return 7 * 24 * 60 * 60 * 1000;
		default:
			return 6 * 60 * 60 * 1000;
	}
}

// simple downsample so charts stay snappy
function downsample(arr, maxPoints = 800) {
	if (arr.length <= maxPoints) return arr;
	const step = Math.ceil(arr.length / maxPoints);
	const out = [];
	for (let i = 0; i < arr.length; i += step) out.push(arr[i]);
	return out;
}

function fmt1(x) {
	return typeof x === 'number' ? x.toFixed(1) : '—';
}

function KpiCard({ label, value, sub }) {
	return (
		<div className="kpi">
			<div className="kpiLabel">{label}</div>
			<div className="kpiValue">{value}</div>
			{sub ? <div className="kpiSub">{sub}</div> : null}
		</div>
	);
}

function ChartCard({ title, data, dataKey, unit }) {
	return (
		<section className="card">
			<div className="cardTitle">{title}</div>
			<div className="chartWrap">
				<ResponsiveContainer width="100%" height="100%">
					<LineChart data={data}>
						<CartesianGrid strokeDasharray="3 3" opacity={0.2} />
						<XAxis dataKey="t" tick={{ fontSize: 12 }} minTickGap={24} />
						<YAxis tick={{ fontSize: 12 }} width={42} />
						<Tooltip
							formatter={(v) => [`${fmt1(v)}${unit ?? ''}`, title]}
							labelFormatter={(label) => `Time: ${label}`}
						/>
						<Line
							type="monotone"
							dataKey={dataKey}
							dot={false}
							strokeWidth={2}
							isAnimationActive={false}
						/>
					</LineChart>
				</ResponsiveContainer>
			</div>
		</section>
	);
}

export default function App() {
	const [dashKey, setDashKey] = useState(
		() => localStorage.getItem('DASHBOARD_API_KEY') || '',
	);
	const [devices, setDevices] = useState([]);
	const [deviceId, setDeviceId] = useState('');
	const [range, setRange] = useState('6h');
	const [status, setStatus] = useState('');
	const [loading, setLoading] = useState(false);

	const [readings, setReadings] = useState([]);
	const timerRef = useRef(null);

	async function fetchJSON(url) {
		const res = await fetch(url, {
			headers: dashKey
				? { 'x-dashboard-key': dashKey } // or Authorization: `Bearer ${dashKey}`
				: {},
		});
		if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
		return res.json();
	}

	async function loadDevices() {
		setStatus('Loading devices…');
		const data = await fetchJSON('/api/devices');
		const list = (data.devices ?? []).slice().sort();
		setDevices(list);
		setDeviceId((prev) => (prev && list.includes(prev) ? prev : list[0] || ''));
		setStatus(list.length ? '' : 'No devices found yet.');
	}

	async function loadReadings({ silent = false } = {}) {
		if (!deviceId) return;
		const ms = rangeToMs(range);
		const to = new Date();
		const from = new Date(Date.now() - ms);

		const qs = new URLSearchParams({
			deviceId,
			from: from.toISOString(),
			to: to.toISOString(),
			limit: '3000',
		});

		if (!silent) setLoading(true);
		setStatus(silent ? '' : 'Fetching readings…');
		try {
			const data = await fetchJSON(`/api/readings?${qs.toString()}`);
			setReadings(data.readings ?? []);
			setStatus((data.readings?.length ?? 0) ? '' : 'No data in this range.');
		} catch (e) {
			console.error(e);
			setStatus(`Error: ${e.message}`);
		} finally {
			if (!silent) setLoading(false);
		}
	}

	// load devices whenever the dashboard key becomes available/changes
	useEffect(() => {
		if (!dashKey) {
			setStatus('Enter Dashboard Key to load data.');
			setDevices([]);
			setDeviceId('');
			setReadings([]);
			return;
		}
		loadDevices().catch((e) => setStatus(`Error: ${e.message}`));
	}, [dashKey]);

	// reload readings when device or range changes
	useEffect(() => {
		if (!deviceId) return;
		loadReadings().catch((e) => setStatus(`Error: ${e.message}`));
	}, [deviceId, range]);

	// auto-refresh every 30s
	useEffect(() => {
		if (timerRef.current) clearInterval(timerRef.current);
		timerRef.current = setInterval(() => {
			loadReadings({ silent: true });
		}, 30000);

		return () => {
			if (timerRef.current) clearInterval(timerRef.current);
		};
	}, [deviceId, range]);

	const chartData = useMemo(() => {
		const normalized = readings.map((r) => {
			const d = new Date(r.ts);
			return {
				ts: r.ts,
				t: d.toLocaleTimeString(),
				temperature: r.temperature,
				humidity: r.humidity,
				aqi: r.aqi,
			};
		});
		return downsample(normalized, 900);
	}, [readings]);

	const latest = readings.length ? readings[readings.length - 1] : null;
	const latestTs = latest?.ts ? new Date(latest.ts).toLocaleString() : '—';

	const tableRows = useMemo(() => {
		const rows = readings.slice(-25).reverse();
		return rows.map((r) => ({
			ts: new Date(r.ts).toLocaleString(),
			temperature: r.temperature,
			humidity: r.humidity,
			aqi: r.aqi,
		}));
	}, [readings]);

	return (
		<div className="page">
			<header className="topbar">
				<label className="control">
					<span>Dashboard Key</span>
					<input
						type="password"
						value={dashKey}
						onChange={(e) => {
							setDashKey(e.target.value);
							localStorage.setItem('DASHBOARD_API_KEY', e.target.value);
						}}
						placeholder="Enter key"
					/>
				</label>

				<div>
					<div className="title">Room Monitoring</div>
					<div className="subtitle">
						MongoDB time-series → Vercel API → React dashboard
					</div>
				</div>

				<div className="controls">
					<label className="control">
						<span>Device</span>
						<select
							value={deviceId}
							onChange={(e) => setDeviceId(e.target.value)}
						>
							{devices.map((d) => (
								<option key={d} value={d}>
									{d}
								</option>
							))}
						</select>
					</label>

					<label className="control">
						<span>Range</span>
						<select value={range} onChange={(e) => setRange(e.target.value)}>
							<option value="1h">Last 1 hour</option>
							<option value="6h">Last 6 hours</option>
							<option value="24h">Last 24 hours</option>
							<option value="7d">Last 7 days</option>
						</select>
					</label>

					<button
						className="btn"
						onClick={() => (deviceId ? loadReadings() : loadDevices())}
						disabled={loading || !dashKey}
						title="Fetch latest data"
					>
						{loading ? 'Loading…' : 'Refresh'}
					</button>

					<div className="status">{status}</div>
				</div>
			</header>

			<main className="grid">
				<section className="card kpis">
					<KpiCard
						label="Temperature"
						value={latest ? `${fmt1(latest.temperature)} °C` : '—'}
						sub="latest in range"
					/>
					<KpiCard
						label="Humidity"
						value={latest ? `${fmt1(latest.humidity)} %` : '—'}
						sub="latest in range"
					/>
					<KpiCard
						label="AQI"
						value={latest ? `${fmt1(latest.aqi)}` : '—'}
						sub="latest in range"
					/>
					<KpiCard label="Timestamp" value={latestTs} sub="local time" />
				</section>

				<ChartCard
					title="Temperature"
					data={chartData}
					dataKey="temperature"
					unit=" °C"
				/>
				<ChartCard
					title="Humidity"
					data={chartData}
					dataKey="humidity"
					unit=" %"
				/>
				<ChartCard title="AQI" data={chartData} dataKey="aqi" unit="" />

				<section className="card tableCard">
					<div className="cardTitle">Recent readings</div>
					<div className="tableWrap">
						<table>
							<thead>
								<tr>
									<th>Time</th>
									<th>Temp</th>
									<th>Humidity</th>
									<th>AQI</th>
								</tr>
							</thead>
							<tbody>
								{tableRows.map((r, idx) => (
									<tr key={idx}>
										<td>{r.ts}</td>
										<td>{fmt1(r.temperature)} °C</td>
										<td>{fmt1(r.humidity)} %</td>
										<td>{fmt1(r.aqi)}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</section>
			</main>
		</div>
	);
}
