/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
	ComposedChart,
	Line,
	Area,
	XAxis,
	YAxis,
	Tooltip,
	CartesianGrid,
	ResponsiveContainer,
} from 'recharts';
import './App.css';

const LINE_COLORS = {
	temperature: '#fb7185',
	humidity: '#60a5fa',
	aqi: '#34d399',
};

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

function toNumberOrNull(v) {
	return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function bucketForRange(rangeValue) {
	// must match backend parseBucket(): only minutes (m) and hours (h)
	switch (rangeValue) {
		case '15m':
			return '1m';
		case '30m':
			return '1m';
		case '1h':
			return '2m';
		case '6h':
			return '10m';
		case '24h':
			return '30m';
		case '7d':
			return '3h';
		case '30d':
			return '6h';
		default:
			return '10m';
	}
}

function formatTimeTick(ms, spanMs) {
	// show date when the visible range is large
	const d = new Date(ms);
	const showDate = spanMs >= 48 * 60 * 60 * 1000; // >= 48h
	return showDate
		? d.toLocaleString('en-GB', {
				month: '2-digit',
				day: '2-digit',
				hour: '2-digit',
				minute: '2-digit',
			})
		: d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function RangeTooltip({ active, payload, label, unit, title, dataKey }) {
	if (!active || !payload?.length) return null;
	const p = payload[0]?.payload;
	if (!p) return null;

	const avg = p[`${dataKey}Avg`];
	const min = p[`${dataKey}Min`];
	const max = p[`${dataKey}Max`];

	return (
		<div
			style={{
				position: 'relative',
				background: 'var(--hover-bg)',
				border: '1px solid rgba(139, 92, 246, 0.4)',
				backdropFilter: 'blur(10px)',
				WebkitBackdropFilter: 'blur(10px)',
				borderRadius: 12,
				padding: '12px 16px',
				color: '#ffffff',
				boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
				fontFamily: "'Sora', sans-serif",
			}}
		>
			<div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--text)' }}>
				{title}
			</div>
			<div
				style={{
					color: 'var(--hover-ts)',
					fontSize: 12,
					marginBottom: 8,
					fontFamily: "'JetBrains Mono', monospace",
				}}
			>
				{new Date(label).toLocaleString('en-GB')}
			</div>
			<div style={{ display: 'grid', gap: 4, fontSize: 13 }}>
				<div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
					<span
						style={{
							width: 8,
							height: 8,
							borderRadius: '50%',
							background: 'var(--hover-dot)',
							display: 'inline-block',
						}}
					/>
					<span style={{ color: 'var(--hover-txt)' }}>Min:</span>
					<span
						style={{
							color: 'var(--hover-value)',
							fontFamily: "'JetBrains Mono', monospace",
						}}
					>
						{fmt1(min)}
						{unit ?? ''}
					</span>
				</div>
				<div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
					<span
						style={{
							width: 8,
							height: 8,
							borderRadius: '50%',
							background: LINE_COLORS[dataKey],
							display: 'inline-block',
						}}
					/>
					<span style={{ color: 'var(--hover-txt)' }}>Avg:</span>
					<span
						style={{
							color: LINE_COLORS[dataKey],
							fontFamily: "'JetBrains Mono', monospace",
							fontWeight: 600,
						}}
					>
						{fmt1(avg)}
						{unit ?? ''}
					</span>
				</div>

				<div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
					<span
						style={{
							width: 8,
							height: 8,
							borderRadius: '50%',
							background: 'var(--hover-dot)',
							display: 'inline-block',
						}}
					/>
					<span style={{ color: 'var(--hover-txt)' }}>Max:</span>
					<span
						style={{
							color: 'var(--hover-value)',
							fontFamily: "'JetBrains Mono', monospace",
						}}
					>
						{fmt1(max)}
						{unit ?? ''}
					</span>
				</div>
			</div>
		</div>
	);
}

// SVG icons matching MonitoringDashboard palette
function IconThermometer({ color }) {
	return (
		<svg
			width="20"
			height="20"
			viewBox="0 0 24 24"
			fill="none"
			stroke={color}
			strokeWidth="2.5"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" />
		</svg>
	);
}
function IconDroplets({ color }) {
	return (
		<svg
			width="20"
			height="20"
			viewBox="0 0 24 24"
			fill="none"
			stroke={color}
			strokeWidth="2.5"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<path d="M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05z" />
			<path d="M12.56 6.6A10.97 10.97 0 0 0 14 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 0 1-11.91 4.97" />
		</svg>
	);
}
function IconWind({ color }) {
	return (
		<svg
			width="20"
			height="20"
			viewBox="0 0 24 24"
			fill="none"
			stroke={color}
			strokeWidth="2.5"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2" />
			<path d="M9.6 4.6A2 2 0 1 1 11 8H2" />
			<path d="M12.6 19.4A2 2 0 1 0 14 16H2" />
		</svg>
	);
}

const KPI_META = {
	temperature: {
		label: 'Temperature',
		unit: ' °C',
		color: '#fb7185',
		Icon: IconThermometer,
	},
	humidity: {
		label: 'Humidity',
		unit: ' %',
		color: '#60a5fa',
		Icon: IconDroplets,
	},
	aqi: { label: 'AQI', unit: '', color: '#34d399', Icon: IconWind },
};

function KpiCard({ metaKey, value, min, max }) {
	const { label, unit, color, Icon } = KPI_META[metaKey];
	const hasRange = min !== null && max !== null && min !== max;

	return (
		<div className="kpi">
			<div className="kpiHeader">
				<div className="kpiIconWrap" style={{ '--kpi-color': color }}>
					<Icon color={color} />
				</div>
				<span className="kpiLabel">{label}</span>
			</div>
			<div className="kpiValue" style={{ color }}>
				{value !== null ? `${fmt1(value)}` : '—'}
				<span className="kpiUnit">{value !== null ? unit : ''}</span>
			</div>
			{hasRange && (
				<div className="kpiRange">
					<span className="kpiRangeLabel">Range</span>
					<div className="kpiRangeBar">
						<span className="kpiRangeNum">{fmt1(min)}</span>
						<div
							className="kpiRangeLine"
							style={{
								background: `linear-gradient(90deg, ${color}40, ${color})`,
							}}
						>
							{value !== null && (
								<div
									className="kpiRangeDot"
									style={{
										left: `${Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100))}%`,
										borderColor: color,
										color,
									}}
								/>
							)}
						</div>
						<span className="kpiRangeNum">{fmt1(max)}</span>
					</div>
				</div>
			)}
		</div>
	);
}

function ChartCard({ title, data, dataKey, unit }) {
	const avgKey = `${dataKey}Avg`;
	const minKey = `${dataKey}Min`;
	const rangeKey = `${dataKey}Range`;
	const color = LINE_COLORS[dataKey];

	const spanMs = useMemo(() => {
		if (!data?.length) return 0;
		const a = data[0]?.x;
		const b = data[data.length - 1]?.x;
		return typeof a === 'number' && typeof b === 'number'
			? Math.max(0, b - a)
			: 0;
	}, [data]);

	return (
		<section className="card chartCard">
			<div className="cardTitle">
				<span className="cardTitleDot" style={{ background: color }} />
				{title}
			</div>
			<div className="chartWrap">
				<ResponsiveContainer width="100%" height="100%">
					<ComposedChart data={data} syncId="room-monitor" syncMethod="value">
						<CartesianGrid
							strokeDasharray="3 3"
							stroke="rgba(139, 92, 246, 0.15)"
						/>
						<XAxis
							dataKey="x"
							type="number"
							scale="time"
							domain={['dataMin', 'dataMax']}
							tick={{
								fontSize: 12,
								fill: 'rgba(255,255,255,0.5)',
								fontFamily: "'JetBrains Mono', monospace",
							}}
							stroke="rgba(255,255,255,0.15)"
							minTickGap={24}
							tickFormatter={(ms) => formatTimeTick(ms, spanMs)}
						/>
						<YAxis
							tick={{
								fontSize: 12,
								fill: 'rgba(255,255,255,0.5)',
								fontFamily: "'JetBrains Mono', monospace",
							}}
							stroke="rgba(255,255,255,0.15)"
							width={42}
						/>
						<Tooltip
							content={
								<RangeTooltip title={title} unit={unit} dataKey={dataKey} />
							}
							cursor={{ stroke: 'rgba(139,92,246,0.4)', strokeWidth: 1 }}
						/>
						{/* range band: min baseline (transparent) + range fill stacked on top */}
						<Area
							type="monotone"
							dataKey={minKey}
							stackId="band"
							stroke="none"
							fill="transparent"
							isAnimationActive={false}
							connectNulls
						/>
						<Area
							type="monotone"
							dataKey={rangeKey}
							stackId="band"
							stroke="none"
							fill={color}
							fillOpacity={0.18}
							isAnimationActive={false}
							connectNulls
						/>
						{/* avg line — coloured */}
						<Line
							type="monotone"
							dataKey={avgKey}
							dot={false}
							stroke={color}
							activeDot={{ r: 5, fill: color, strokeWidth: 2, stroke: '#fff' }}
							strokeWidth={2.5}
							isAnimationActive={false}
							connectNulls
						/>
						{/* overall average — solid white */}
						<Line
							type="monotone"
							dataKey={avgKey}
							dot={false}
							stroke="rgba(255,255,255,0.55)"
							strokeWidth={1.5}
							isAnimationActive={false}
							connectNulls
						/>
					</ComposedChart>
				</ResponsiveContainer>
			</div>
		</section>
	);
}

const RANGE_PRESETS = [
	{ value: '15m', label: '15m', ms: 15 * 60 * 1000 },
	{ value: '30m', label: '30m', ms: 30 * 60 * 1000 },
	{ value: '1h', label: '1h', ms: 60 * 60 * 1000 },
	{ value: '6h', label: '6h', ms: 6 * 60 * 60 * 1000 },
	{ value: '24h', label: '24h', ms: 24 * 60 * 60 * 1000 },
	{ value: '7d', label: '7d', ms: 7 * 24 * 60 * 60 * 1000 },
	{ value: '30d', label: '30d', ms: 30 * 24 * 60 * 60 * 1000 },
];

export default function App() {
	const [dashKey, setDashKey] = useState(
		() => localStorage.getItem('DASHBOARD_API_KEY') || '',
	);
	const [devices, setDevices] = useState([]);
	const [deviceId, setDeviceId] = useState('');
	const [range, setRange] = useState('6h');
	const [status, setStatus] = useState('');
	const [loading, setLoading] = useState(false);

	const [theme, setTheme] = useState(
		() => localStorage.getItem('theme') || 'dark',
	);

	useEffect(() => {
		document.documentElement.dataset.theme = theme;
		localStorage.setItem('theme', theme);
	}, [theme]);

	const [readings, setReadings] = useState([]);
	const timerRef = useRef(null);

	async function fetchJSON(url) {
		const res = await fetch(url, {
			headers: dashKey ? { 'x-dashboard-key': dashKey } : {},
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
		const preset =
			RANGE_PRESETS.find((p) => p.value === range) || RANGE_PRESETS[2];
		const to = new Date();
		const from = new Date(Date.now() - preset.ms);

		const qs = new URLSearchParams({
			deviceId,
			from: from.toISOString(),
			to: to.toISOString(),
			limit: '3000',
		});

		const bucket = bucketForRange(range);
		if (bucket) qs.set('bucket', bucket);

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
			setReadings([]);
			return;
		}
		loadDevices();
	}, [dashKey]);

	// load readings whenever deviceId or range changes, and start polling
	useEffect(() => {
		loadReadings();

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
			const ms = d.getTime();

			return {
				ts: r.ts,
				x: ms,

				// Aggregated response (preferred). Fallback to raw fields if backend returns raw.
				temperatureAvg: toNumberOrNull(r.temperatureAvg ?? r.temperature),
				temperatureMin: toNumberOrNull(r.temperatureMin ?? r.temperature),
				temperatureMax: toNumberOrNull(r.temperatureMax ?? r.temperature),
				temperatureRange: toNumberOrNull(r.temperatureRange ?? 0),

				humidityAvg: toNumberOrNull(r.humidityAvg ?? r.humidity),
				humidityMin: toNumberOrNull(r.humidityMin ?? r.humidity),
				humidityMax: toNumberOrNull(r.humidityMax ?? r.humidity),
				humidityRange: toNumberOrNull(r.humidityRange ?? 0),

				aqiAvg: toNumberOrNull(r.aqiAvg ?? r.aqi),
				aqiMin: toNumberOrNull(r.aqiMin ?? r.aqi),
				aqiMax: toNumberOrNull(r.aqiMax ?? r.aqi),
				aqiRange: toNumberOrNull(r.aqiRange ?? 0),
			};
		});

		return downsample(normalized, 900);
	}, [readings]);

	const latest = readings.length ? readings[readings.length - 1] : null;
	const isAggregated =
		!!latest && Object.prototype.hasOwnProperty.call(latest, 'temperatureAvg');
	const latestTemperature = latest
		? isAggregated
			? latest.temperatureAvg
			: latest.temperature
		: null;
	const latestHumidity = latest
		? isAggregated
			? latest.humidityAvg
			: latest.humidity
		: null;
	const latestAqi = latest ? (isAggregated ? latest.aqiAvg : latest.aqi) : null;
	const latestTs = latest?.ts
		? new Date(latest.ts).toLocaleString('en-GB')
		: '—';

	// min/max across the selected time range (for KPI range bars)
	const rangeStats = useMemo(() => {
		if (!chartData.length) return { temperature: {}, humidity: {}, aqi: {} };
		const minTemps = chartData
			.map((d) => d.temperatureMin)
			.filter((v) => v !== null);
		const maxTemps = chartData
			.map((d) => d.temperatureMax)
			.filter((v) => v !== null);
		const maxHumids = chartData
			.map((d) => d.humidityMax)
			.filter((v) => v !== null);
		const minHumids = chartData
			.map((d) => d.humidityMin)
			.filter((v) => v !== null);
		const minAqis = chartData.map((d) => d.aqiMin).filter((v) => v !== null);
		const maxAqis = chartData.map((d) => d.aqiMax).filter((v) => v !== null);
		return {
			temperature: {
				min: minTemps.length ? Math.min(...minTemps) : null,
				max: maxTemps.length ? Math.max(...maxTemps) : null,
			},
			humidity: {
				min: minHumids.length ? Math.min(...minHumids) : null,
				max: maxHumids.length ? Math.max(...maxHumids) : null,
			},
			aqi: {
				min: minAqis.length ? Math.min(...minAqis) : null,
				max: maxAqis.length ? Math.max(...maxAqis) : null,
			},
		};
	}, [chartData]);

	return (
		<div className="page">
			<style>{`
				@import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

				:root {
					--page-bg: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%);
					--card-bg: rgba(30, 27, 75, 0.5);
					--hover-bg: rgba(15, 23, 42, 0.95);
					--hover-dot: rgba(255,255,255,0.4);
					--hover-ts: rgba(255,255,255,0.6);
					--hover-txt: rgba(255,255,255,0.7);
					--hover-value: rgba(255,255,255,0.9);
					--card-border: rgba(139, 92, 246, 0.3);
					--text: #ffffff;
					--muted: rgba(255,255,255,0.5);
					--topbar-bg: rgba(15, 23, 42, 0.85);
					--topbar-border: rgba(139, 92, 246, 0.25);
					--control-bg: rgba(30, 27, 75, 0.6);
					--border: rgba(139, 92, 246, 0.3);
					--border-soft: rgba(139, 92, 246, 0.2);
					--focus-border: rgba(139,92,246,0.7);
					--glow: 0 0 0 2px rgba(139,92,246,0.25);
					--shadow: 0 8px 32px rgba(0,0,0,0.4);
					--kpi-bg: rgba(139,92,246,0.15);
					--row-hover: rgba(139,92,246,0.1);
					--btn-bg: rgba(139, 92, 246, 0.2);
					--btn-hover: rgba(139, 92, 246, 0.35);
					--btn-active-bg: linear-gradient(135deg, #8b5cf6, #6366f1);
					--range-btn-active-shadow: 0 4px 20px rgba(139, 92, 246, 0.4);
				}

				[data-theme="light"] {
					--page-bg: linear-gradient(135deg, #e0e7ff 0%, #f0f4ff 100%);
					--card-bg: rgba(255, 255, 255, 0.6);
					--hover-bg: rgba(245, 245, 245, 0.95);
					--hover-dot: rgba(30,27,75,0.4);
					--hover-ts: rgba(30,27,75,0.6);
					--hover-txt: rgba(30,27,75,0.7);
					--hover-value: rgba(30,27,75,0.9);
					--card-border: rgba(99, 102, 241, 0.25);
					--text: #1e1b4b;
					--muted: rgba(30,27,75,0.5);
					--topbar-bg: rgba(255, 255, 255, 0.8);
					--topbar-border: rgba(99, 102, 241, 0.2);
					--control-bg: rgba(255,255,255,0.7);
					--border: rgba(99, 102, 241, 0.3);
					--border-soft: rgba(99, 102, 241, 0.2);
					--focus-border: rgba(99,102,241,0.7);
					--glow: 0 0 0 2px rgba(99,102,241,0.2);
					--shadow: 0 8px 32px rgba(99,102,241,0.15);
					--kpi-bg: rgba(99,102,241,0.1);
					--row-hover: rgba(99,102,241,0.08);
					--btn-bg: rgba(99, 102, 241, 0.15);
					--btn-hover: rgba(99, 102, 241, 0.28);
					--btn-active-bg: linear-gradient(135deg, #6366f1, #8b5cf6);
					--range-btn-active-shadow: 0 4px 20px rgba(99, 102, 241, 0.35);
				}

				*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

				body {
					background: var(--page-bg);
					font-family: 'Sora', sans-serif;
					color: var(--text);
					min-height: 100vh;
				}

				.page {
					min-height: 100vh;
					background: var(--page-bg);
					position: relative;
				}

				.page::before {
					content: '';
					position: fixed;
					top: -50%;
					left: -50%;
					width: 200%;
					height: 200%;
					background:
						radial-gradient(circle at 20% 50%, rgba(139, 92, 246, 0.12) 0%, transparent 50%),
						radial-gradient(circle at 80% 80%, rgba(59, 130, 246, 0.12) 0%, transparent 50%),
						radial-gradient(circle at 40% 20%, rgba(236, 72, 153, 0.08) 0%, transparent 40%);
					animation: bgFloat 20s ease-in-out infinite;
					pointer-events: none;
					z-index: 0;
				}

				@keyframes bgFloat {
					0%, 100% { transform: translate(0, 0); }
					33% { transform: translate(20px, -20px); }
					66% { transform: translate(-15px, 15px); }
				}

				/* ── Topbar ── */
				.topbar {
					position: sticky;
					top: 0;
					z-index: 100;
					display: flex;
					align-items: center;
					gap: 16px;
					flex-wrap: wrap;
					padding: 14px 28px;
					background: var(--topbar-bg);
					border-bottom: 1px solid var(--topbar-border);
					backdrop-filter: blur(20px) saturate(160%);
					WebkitBackdropFilter: blur(20px) saturate(160%);
				}

				.topbarTs {
					margin-left: auto;
					font-family: 'JetBrains Mono', monospace;
					font-size: 0.8rem;
					color: var(--muted);
					background: rgba(139, 92, 246, 0.1);
					border: 1px solid rgba(139, 92, 246, 0.2);
					border-radius: 10px;
					padding: 6px 14px;
					white-space: nowrap;
				}

				[data-theme="light"] .topbarTs {
					background: rgba(99, 102, 241, 0.08);
					border-color: rgba(99, 102, 241, 0.2);
				}

				.topbar .control {
					display: flex;
					flex-direction: column;
					gap: 4px;
					font-size: 0.75rem;
					font-weight: 600;
					text-transform: uppercase;
					letter-spacing: 1px;
					color: var(--muted);
				}

				.topbar .control input[type="password"] {
					background: var(--control-bg);
					border: 1px solid var(--border);
					border-radius: 10px;
					color: var(--text);
					font-family: 'JetBrains Mono', monospace;
					font-size: 0.85rem;
					height: 38px;
					padding: 0 12px;
					outline: none;
					transition: border-color 0.2s, box-shadow 0.2s;
					min-width: 180px;
					backdrop-filter: blur(14px);
				}

				.topbar .control input[type="password"]:focus {
					border-color: var(--focus-border);
					box-shadow: var(--glow);
				}

				.topbar .control input[type="password"]::placeholder {
					color: var(--muted);
				}

				/* ── Controls row ── */
				.controls {
					display: flex;
					align-items: flex-end;
					gap: 16px;
					flex-wrap: wrap;
					margin-left: auto;
				}

				/* ── Range buttons ── */
				.rangeGroup {
					display: flex;
					gap: 5px;
					background: rgba(30, 27, 75, 0.45);
					border: 1px solid var(--card-border);
					backdrop-filter: blur(20px);
					padding: 5px;
					border-radius: 12px;
				}

				[data-theme="light"] .rangeGroup {
					background: rgba(255,255,255,0.5);
				}

				.rangeBtn {
					background: transparent;
					border: none;
					color: var(--muted);
					padding: 7px 14px;
					border-radius: 8px;
					cursor: pointer;
					font-family: 'Sora', sans-serif;
					font-size: 0.8rem;
					font-weight: 600;
					transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
				}

				.rangeBtn:hover:not(:disabled) {
					background: rgba(139, 92, 246, 0.2);
					color: var(--text);
				}

				.rangeBtn.active {
					background: linear-gradient(135deg, #8b5cf6, #6366f1);
					color: #ffffff;
					box-shadow: var(--range-btn-active-shadow);
				}

				.rangeBtn:disabled {
					opacity: 0.35;
					cursor: not-allowed;
				}

				/* ── Refresh / theme button ── */
				.btn {
					background: var(--btn-bg);
					border: 1px solid var(--card-border);
					border-radius: 10px;
					color: var(--text);
					cursor: pointer;
					font-family: 'Sora', sans-serif;
					font-size: 0.85rem;
					font-weight: 600;
					height: 38px;
					padding: 0 18px;
					transition: background 0.2s, transform 0.15s;
					backdrop-filter: blur(10px);
					white-space: nowrap;
				}

				.btn:hover:not(:disabled) {
					background: var(--btn-hover);
					transform: translateY(-1px);
				}

				.btn:disabled {
					opacity: 0.4;
					cursor: not-allowed;
				}

				/* ── Status text ── */
				.status {
					font-size: 0.8rem;
					color: var(--muted);
					font-family: 'JetBrains Mono', monospace;
					min-width: 0;
					white-space: nowrap;
					overflow: hidden;
					text-overflow: ellipsis;
					max-width: 220px;
				}

				/* ── Native device select ── */
				.nativeSelect {
					appearance: none;
					-webkit-appearance: none;
					background-color: rgba(30, 27, 75, 0.6);
					background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='rgba(255,255,255,0.45)' stroke-width='1.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
					background-repeat: no-repeat;
					background-position: right 12px center;
					backdrop-filter: blur(14px) saturate(160%);
					border: 1px solid rgba(139, 92, 246, 0.3);
					border-radius: 10px;
					color: #ffffff;
					cursor: pointer;
					font-family: 'Sora', sans-serif;
					font-size: 0.85rem;
					height: 38px;
					outline: none;
					padding: 0 36px 0 12px;
					transition: border-color 0.2s, box-shadow 0.2s;
					min-width: 180px;
				}

				.nativeSelect:focus {
					border-color: rgba(139, 92, 246, 0.7);
					box-shadow: 0 0 0 2px rgba(139, 92, 246, 0.25);
				}

				.nativeSelect:disabled {
					opacity: 0.4;
					cursor: not-allowed;
				}

				.nativeSelect option {
					background: #0f172a;
					color: #ffffff;
				}

				[data-theme="light"] .nativeSelect {
					background-color: rgba(255, 255, 255, 0.7);
					background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='rgba(30,27,75,0.5)' stroke-width='1.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
					border-color: rgba(99, 102, 241, 0.3);
					color: #1e1b4b;
				}

				[data-theme="light"] .nativeSelect:focus {
					border-color: rgba(99, 102, 241, 0.7);
					box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.2);
				}

				[data-theme="light"] .nativeSelect option {
					background: #f0f4ff;
					color: #1e1b4b;
				}

				/* ── Main grid ── */
				.grid {
					position: relative;
					z-index: 1;
					display: grid;
					gap: 24px;
					padding: 32px 28px;
					grid-template-columns: 1fr;
				}

				/* ── Glass card base ── */
				.card {
					background: var(--card-bg);
					border: 1px solid var(--card-border);
					border-radius: 24px;
					backdrop-filter: blur(20px) saturate(150%);
					WebkitBackdropFilter: blur(20px) saturate(150%);
					box-shadow: var(--shadow);
					transition: transform 0.35s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.35s;
				}

				.card:hover {
					transform: translateY(-4px);
					box-shadow: 0 24px 48px rgba(0, 0, 0, 0.35);
				}

				/* ── KPI strip ── */
				.kpis {
					display: grid;
					grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
					gap: 1px;
					padding: 0;
				}

				.kpi {
					padding: 24px 28px;
					position: relative;
					transition: background 0.2s;
				}

				.kpi:hover {
					background: rgba(139, 92, 246, 0.06);
				}

				.kpi + .kpi::before {
					content: '';
					position: absolute;
					left: 0;
					top: 16%;
					height: 68%;
					width: 1px;
					background: var(--card-border);
				}

				.kpiHeader {
					display: flex;
					align-items: center;
					gap: 10px;
					margin-bottom: 16px;
				}

				.kpiIconWrap {
					width: 40px;
					height: 40px;
					border-radius: 12px;
					background: linear-gradient(135deg, rgba(139,92,246,0.15), rgba(99,102,241,0.15));
					border: 1px solid color-mix(in srgb, var(--kpi-color) 35%, transparent);
					display: flex;
					align-items: center;
					justify-content: center;
					flex-shrink: 0;
				}

				.kpiLabel {
					font-size: 0.72rem;
					font-weight: 600;
					text-transform: uppercase;
					letter-spacing: 1.5px;
					color: var(--muted);
				}

				.kpiValue {
					font-size: 2.4rem;
					font-weight: 700;
					line-height: 1;
					font-family: 'JetBrains Mono', monospace;
					margin-bottom: 16px;
					transition: transform 0.3s;
				}

				.kpiUnit {
					font-size: 1.1rem;
					color: var(--muted);
					font-weight: 400;
					margin-left: 3px;
					font-family: 'Sora', sans-serif;
				}

				.kpiRange {
					background: rgba(15, 23, 42, 0.4);
					border: 1px solid rgba(139, 92, 246, 0.15);
					border-radius: 10px;
					padding: 10px 12px;
				}

				[data-theme="light"] .kpiRange {
					background: rgba(255, 255, 255, 0.5);
					border-color: rgba(99, 102, 241, 0.15);
				}

				.kpiRangeLabel {
					display: block;
					font-size: 0.65rem;
					text-transform: uppercase;
					letter-spacing: 1px;
					color: var(--muted);
					margin-bottom: 7px;
					font-weight: 600;
				}

				.kpiRangeBar {
					display: flex;
					align-items: center;
					gap: 8px;
					overflow: visible;
				}

				.kpiRangeNum {
					font-family: 'JetBrains Mono', monospace;
					font-size: 0.72rem;
					color: var(--text);
					opacity: 0.85;
					white-space: nowrap;
				}

				.kpiRangeLine {
					flex: 1;
					height: 3px;
					border-radius: 2px;
					position: relative;
					overflow: visible;
					margin: 6px 0;
				}

				.kpiRangeDot {
					position: absolute;
					top: 50%;
					width: 9px;
					height: 9px;
					border-radius: 50%;
					background: #ffffff;
					border: 2px solid currentColor;
					transform: translate(-50%, -50%);
					box-shadow: 0 0 6px currentColor;
					transition: left 0.4s cubic-bezier(0.4, 0, 0.2, 1);
				}

				/* ── Chart cards ── */
				.chartCard {
					padding: 28px 28px 20px;
				}

				.cardTitle {
					font-size: 1rem;
					font-weight: 600;
					color: var(--text);
					margin-bottom: 20px;
					display: flex;
					align-items: center;
					gap: 10px;
					letter-spacing: 0.3px;
				}

				.cardTitleDot {
					display: inline-block;
					width: 10px;
					height: 10px;
					border-radius: 50%;
					box-shadow: 0 0 8px currentColor;
					flex-shrink: 0;
				}

				.chartWrap {
					height: 280px;
				}

				@media (max-width: 640px) {
					.topbar { padding: 12px 16px; gap: 12px; }
					.grid { padding: 20px 16px; gap: 16px; }
					.kpiValue { font-size: 1.6rem; }
					.chartWrap { height: 220px; }
					.rangeBtn { padding: 6px 9px; font-size: 0.75rem; }
					.controls { margin-left: 0; width: 100%; }
				}
			`}</style>

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

				<div className="controls">
					<label className="control">
						<span>Device</span>
						<select
							className="nativeSelect"
							value={deviceId}
							onChange={(e) => setDeviceId(e.target.value)}
							disabled={!dashKey || devices.length === 0}
						>
							{devices.length === 0 ? (
								<option value="">
									{dashKey ? 'No devices found…' : 'Enter key first…'}
								</option>
							) : (
								devices.map((d) => (
									<option key={d} value={d}>
										{d}
									</option>
								))
							)}
						</select>
					</label>

					<div className="control">
						<span>Range</span>
						<div
							className="rangeGroup"
							role="group"
							aria-label="Select time range"
						>
							{RANGE_PRESETS.map((p) => (
								<button
									key={p.value}
									type="button"
									className={`rangeBtn ${range === p.value ? 'active' : ''}`}
									onClick={() => setRange(p.value)}
									disabled={!dashKey}
									aria-pressed={range === p.value}
									title={`Show ${p.label} of data`}
								>
									{p.label}
								</button>
							))}
						</div>
					</div>

					<button
						className="btn"
						onClick={() => (deviceId ? loadReadings() : loadDevices())}
						disabled={loading || !dashKey}
						title="Fetch latest data"
					>
						{loading ? 'Loading…' : 'Refresh'}
					</button>
					<div className="status">{status}</div>
					<button
						className="btn"
						type="button"
						onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
						title="Toggle theme"
					>
						{theme === 'dark' ? '🌙' : '☀️'}
					</button>
				</div>
				{latestTs !== '—' && (
					<div className="topbarTs" title="Timestamp of latest reading">
						🕐 {latestTs}
					</div>
				)}
			</header>

			<main className="grid">
				<section className="card kpis">
					<KpiCard
						metaKey="temperature"
						value={latestTemperature}
						min={rangeStats.temperature.min}
						max={rangeStats.temperature.max}
					/>
					<KpiCard
						metaKey="humidity"
						value={latestHumidity}
						min={rangeStats.humidity.min}
						max={rangeStats.humidity.max}
					/>
					<KpiCard
						metaKey="aqi"
						value={latestAqi}
						min={rangeStats.aqi.min}
						max={rangeStats.aqi.max}
					/>
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
			</main>
		</div>
	);
}
