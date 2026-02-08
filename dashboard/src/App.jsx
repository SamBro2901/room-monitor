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
import Select from 'react-select';

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
					<LineChart
						data={data}
						syncId="room-monitor" // ✅ same id across all charts
						syncMethod="index" // (default) works since all charts share chartData
					>
						<CartesianGrid strokeDasharray="3 3" opacity={0.2} />
						<XAxis dataKey="t" tick={{ fontSize: 12 }} minTickGap={24} />
						<YAxis tick={{ fontSize: 12 }} width={42} />
						<Tooltip
							formatter={(v) => [`${fmt1(v)}${unit ?? ''}`, title]}
							labelFormatter={(label) => `Time: ${label}`}
							cursor={{ opacity: 0.2 }} // optional: makes the synced hover line more visible
						/>
						<Line
							type="monotone"
							dataKey={dataKey}
							dot={false}
							activeDot={{ r: 5 }} // ✅ visible highlight on hover (and synced charts)
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
	const latestTs = latest?.ts
		? new Date(latest.ts).toLocaleString('en-GB')
		: '—';

	const tableRows = useMemo(() => {
		const rows = readings.slice(-25).reverse();
		return rows.map((r) => ({
			ts: new Date(r.ts).toLocaleString(),
			temperature: r.temperature,
			humidity: r.humidity,
			aqi: r.aqi,
		}));
	}, [readings]);

	const deviceOptions = useMemo(
		() => devices.map((d) => ({ value: d, label: d })),
		[devices],
	);

	const rangeOptions = useMemo(
		() => [
			{ value: '1h', label: 'Last 1 hour' },
			{ value: '6h', label: 'Last 6 hours' },
			{ value: '24h', label: 'Last 24 hours' },
			{ value: '7d', label: 'Last 7 days' },
		],
		[],
	);

	// Dark theme styles to match your UI
	const selectStyles = useMemo(
		() => ({
			control: (base, state) => ({
				...base,
				backgroundColor: '#141c2b',
				borderColor: state.isFocused
					? 'rgba(255,255,255,0.25)'
					: 'rgba(255,255,255,0.12)',
				boxShadow: 'none',
				borderRadius: 10,
				minHeight: 38,
				color: '#e6edf7',
			}),
			singleValue: (base) => ({ ...base, color: '#e6edf7' }),
			input: (base) => ({ ...base, color: '#e6edf7' }),
			placeholder: (base) => ({ ...base, color: '#a9b6cc' }),
			menu: (base) => ({
				...base,
				backgroundColor: '#0f1624',
				border: '1px solid rgba(255,255,255,0.10)',
				borderRadius: 12,
				overflow: 'hidden',
			}),
			option: (base, state) => ({
				...base,
				backgroundColor: state.isSelected
					? 'rgba(255,255,255,0.10)'
					: state.isFocused
						? 'rgba(255,255,255,0.06)'
						: 'transparent',
				color: '#e6edf7',
				cursor: 'pointer',
			}),
			indicatorSeparator: (base) => ({
				...base,
				backgroundColor: 'rgba(255,255,255,0.12)',
			}),
			dropdownIndicator: (base) => ({ ...base, color: '#a9b6cc' }),
			clearIndicator: (base) => ({ ...base, color: '#a9b6cc' }),
			menuPortal: (base) => ({ ...base, zIndex: 9999 }), // prevents clipping under sticky header
		}),
		[],
	);

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
						<Select
							styles={selectStyles}
							options={deviceOptions}
							value={deviceOptions.find((o) => o.value === deviceId) || null}
							onChange={(opt) => setDeviceId(opt?.value || '')}
							isDisabled={!dashKey || deviceOptions.length === 0}
							placeholder={dashKey ? 'Select device…' : 'Enter key first…'}
							isSearchable
							menuPortalTarget={document.body}
						/>
					</label>

					<label className="control">
						<span>Range</span>
						<Select
							styles={selectStyles}
							options={rangeOptions}
							value={rangeOptions.find((o) => o.value === range) || null}
							onChange={(opt) => setRange(opt?.value || '6h')}
							isDisabled={!dashKey}
							isSearchable={false}
							menuPortalTarget={document.body}
						/>
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
