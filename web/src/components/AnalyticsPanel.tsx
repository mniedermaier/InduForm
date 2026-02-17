import { useState, useEffect, useCallback, useMemo, memo } from 'react';
import DialogShell from './DialogShell';
import type { MetricsDataPoint, AnalyticsSummary, TrendDirection } from '../types/models';
import { api } from '../api/client';

// --- SVG Line Chart ---

interface ChartPoint {
  x: number;
  y: number;
  label?: string;
}

interface LineChartProps {
  data: ChartPoint[];
  width?: number;
  height?: number;
  color?: string;
  fillColor?: string;
  yMin?: number;
  yMax?: number;
  yLabel?: string;
  showDots?: boolean;
  showGrid?: boolean;
}

const LineChart = memo(({
  data,
  width = 500,
  height = 200,
  color = '#3b82f6',
  fillColor,
  yMin: forcedYMin,
  yMax: forcedYMax,
  yLabel = '',
  showDots = true,
  showGrid = true,
}: LineChartProps) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const padding = { top: 20, right: 20, bottom: 30, left: 50 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const { yMin, yMax, points, yTicks } = useMemo(() => {
    if (data.length === 0) {
      return { yMin: 0, yMax: 100, xMin: 0, xMax: 1, points: [], yTicks: [0, 25, 50, 75, 100] };
    }

    const xValues = data.map(d => d.x);
    const yValues = data.map(d => d.y);
    const computedYMin = forcedYMin !== undefined ? forcedYMin : Math.min(...yValues);
    const computedYMax = forcedYMax !== undefined ? forcedYMax : Math.max(...yValues);
    const yRange = computedYMax - computedYMin || 1;
    const xMinV = Math.min(...xValues);
    const xMaxV = Math.max(...xValues);
    const xRange = xMaxV - xMinV || 1;

    const pts = data.map(d => ({
      cx: padding.left + ((d.x - xMinV) / xRange) * chartWidth,
      cy: padding.top + (1 - (d.y - computedYMin) / yRange) * chartHeight,
      value: d.y,
      label: d.label,
    }));

    // Generate 5 evenly-spaced y-axis tick values
    const ticks = Array.from({ length: 5 }, (_, i) =>
      Math.round(computedYMin + (yRange * i) / 4)
    );

    return { yMin: computedYMin, yMax: computedYMax, points: pts, yTicks: ticks };
  }, [data, forcedYMin, forcedYMax, chartWidth, chartHeight, padding.left, padding.top]);

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center text-sm text-gray-400 dark:text-slate-500" style={{ width, height }}>
        No data available
      </div>
    );
  }

  const polylinePoints = points.map(p => `${p.cx},${p.cy}`).join(' ');
  const yRange = yMax - yMin || 1;

  // Area fill path
  const areaPath = points.length > 1
    ? `M ${points[0].cx},${padding.top + chartHeight} ` +
      points.map(p => `L ${p.cx},${p.cy}`).join(' ') +
      ` L ${points[points.length - 1].cx},${padding.top + chartHeight} Z`
    : '';

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      className="select-none"
    >
      {/* Grid lines */}
      {showGrid && yTicks.map((tick, i) => {
        const y = padding.top + (1 - (tick - yMin) / yRange) * chartHeight;
        return (
          <g key={i}>
            <line
              x1={padding.left}
              y1={y}
              x2={padding.left + chartWidth}
              y2={y}
              stroke="currentColor"
              className="text-gray-200 dark:text-slate-700"
              strokeDasharray="4,4"
              strokeWidth={0.5}
            />
            <text
              x={padding.left - 8}
              y={y + 4}
              textAnchor="end"
              className="text-gray-400 dark:text-slate-500 fill-current"
              fontSize={10}
            >
              {tick}
            </text>
          </g>
        );
      })}

      {/* Y-axis label */}
      {yLabel && (
        <text
          x={12}
          y={padding.top + chartHeight / 2}
          textAnchor="middle"
          transform={`rotate(-90, 12, ${padding.top + chartHeight / 2})`}
          className="text-gray-400 dark:text-slate-500 fill-current"
          fontSize={10}
        >
          {yLabel}
        </text>
      )}

      {/* Area fill */}
      {fillColor && areaPath && (
        <path d={areaPath} fill={fillColor} opacity={0.15} />
      )}

      {/* Line */}
      {points.length > 1 && (
        <polyline
          points={polylinePoints}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}

      {/* Data point dots */}
      {showDots && points.map((p, i) => (
        <circle
          key={i}
          cx={p.cx}
          cy={p.cy}
          r={hoveredIndex === i ? 5 : 3}
          fill={hoveredIndex === i ? color : 'white'}
          stroke={color}
          strokeWidth={2}
          className="cursor-pointer transition-all"
          onMouseEnter={() => setHoveredIndex(i)}
          onMouseLeave={() => setHoveredIndex(null)}
        />
      ))}

      {/* Hover tooltip */}
      {hoveredIndex !== null && points[hoveredIndex] && (
        <g>
          <rect
            x={Math.min(points[hoveredIndex].cx - 40, width - padding.right - 80)}
            y={points[hoveredIndex].cy - 28}
            width={80}
            height={22}
            rx={4}
            className="fill-gray-800 dark:fill-slate-200"
            opacity={0.9}
          />
          <text
            x={Math.min(points[hoveredIndex].cx, width - padding.right - 40)}
            y={points[hoveredIndex].cy - 13}
            textAnchor="middle"
            className="fill-white dark:fill-gray-900"
            fontSize={11}
            fontWeight="bold"
          >
            {points[hoveredIndex].value.toFixed(1)}
            {points[hoveredIndex].label ? ` - ${points[hoveredIndex].label}` : ''}
          </text>
        </g>
      )}
    </svg>
  );
});

LineChart.displayName = 'LineChart';

// --- Sparkline (compact version for ProjectsPage) ---

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
}

export const Sparkline = memo(({ data, width = 60, height = 20, color = '#3b82f6' }: SparklineProps) => {
  if (data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width={width} height={height} className="inline-block align-middle">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
});

Sparkline.displayName = 'Sparkline';

// --- Trend Arrow ---

function TrendArrow({ direction, change, positiveIsGood = true }: { direction: string; change: number; positiveIsGood?: boolean }) {
  const isGood = positiveIsGood ? direction === 'up' : direction === 'down';
  const isBad = positiveIsGood ? direction === 'down' : direction === 'up';

  if (direction === 'stable') {
    return (
      <span className="inline-flex items-center text-xs text-gray-400 dark:text-slate-500 ml-1">
        <svg className="w-3 h-3 mr-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
        </svg>
        {Math.abs(change).toFixed(1)}
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center text-xs ml-1 ${
      isGood ? 'text-green-500' : isBad ? 'text-red-500' : 'text-gray-400 dark:text-slate-500'
    }`}>
      {direction === 'up' ? (
        <svg className="w-3 h-3 mr-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
        </svg>
      ) : (
        <svg className="w-3 h-3 mr-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      )}
      {Math.abs(change).toFixed(1)}
    </span>
  );
}

// --- Summary Card ---

function SummaryCard({ title, value, unit, trend, positiveIsGood = true }: {
  title: string;
  value: string | number;
  unit?: string;
  trend?: TrendDirection | null;
  positiveIsGood?: boolean;
}) {
  return (
    <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
      <div className="text-xs text-gray-500 dark:text-slate-400 mb-1">{title}</div>
      <div className="flex items-baseline gap-1">
        <span className="text-xl font-bold text-gray-800 dark:text-slate-100">{value}</span>
        {unit && <span className="text-xs text-gray-400 dark:text-slate-500">{unit}</span>}
        {trend && (
          <TrendArrow direction={trend.direction} change={trend.change} positiveIsGood={positiveIsGood} />
        )}
      </div>
    </div>
  );
}

// --- Main AnalyticsPanel ---

interface AnalyticsPanelProps {
  projectId: string;
  onClose: () => void;
}

export default function AnalyticsPanel({ projectId, onClose }: AnalyticsPanelProps) {
  const [timeRange, setTimeRange] = useState<7 | 30 | 90>(30);
  const [data, setData] = useState<MetricsDataPoint[]>([]);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [dataJson, summaryJson] = await Promise.all([
        api.getProjectAnalytics(projectId, timeRange),
        api.getAnalyticsSummary(projectId, timeRange),
      ]);

      setData(dataJson);
      setSummary(summaryJson);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, [projectId, timeRange]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  // Transform data for charts
  const complianceChartData = useMemo((): ChartPoint[] =>
    data.map((d) => ({
      x: new Date(d.recorded_at).getTime(),
      y: d.compliance_score,
      label: new Date(d.recorded_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    })),
    [data]
  );

  const riskChartData = useMemo((): ChartPoint[] =>
    data.map((d) => ({
      x: new Date(d.recorded_at).getTime(),
      y: d.risk_score,
      label: new Date(d.recorded_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    })),
    [data]
  );

  const zoneChartData = useMemo((): ChartPoint[] =>
    data.map((d) => ({
      x: new Date(d.recorded_at).getTime(),
      y: d.zone_count,
    })),
    [data]
  );

  const assetChartData = useMemo((): ChartPoint[] =>
    data.map((d) => ({
      x: new Date(d.recorded_at).getTime(),
      y: d.asset_count,
    })),
    [data]
  );

  const conduitChartData = useMemo((): ChartPoint[] =>
    data.map((d) => ({
      x: new Date(d.recorded_at).getTime(),
      y: d.conduit_count,
    })),
    [data]
  );

  const errorChartData = useMemo((): ChartPoint[] =>
    data.map((d) => ({
      x: new Date(d.recorded_at).getTime(),
      y: d.error_count + d.warning_count,
    })),
    [data]
  );

  return (
    <DialogShell title="Project Analytics" onClose={onClose} maxWidth="max-w-4xl">
      <div className="p-6 max-h-[80vh] overflow-y-auto">
        {/* Time range selector */}
        <div className="flex items-center gap-2 mb-6">
          <span className="text-sm text-gray-500 dark:text-slate-400">Time range:</span>
          <div className="flex gap-1 bg-gray-100 dark:bg-gray-700/50 rounded-lg p-1">
            {([7, 30, 90] as const).map(days => (
              <button
                key={days}
                onClick={() => setTimeRange(days)}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${
                  timeRange === days
                    ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                {days}d
              </button>
            ))}
          </div>
          {summary && (
            <span className="text-xs text-gray-400 dark:text-slate-500 ml-auto">
              {summary.snapshot_count} data point{summary.snapshot_count !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="text-center py-8">
            <div className="text-red-500 dark:text-red-400 mb-2">{error}</div>
            <button
              onClick={fetchAnalytics}
              className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-slate-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 text-sm"
            >
              Retry
            </button>
          </div>
        )}

        {/* No data */}
        {!loading && !error && data.length === 0 && (
          <div className="text-center py-12">
            <svg className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <div className="text-gray-500 dark:text-slate-400 mb-1">No analytics data yet</div>
            <div className="text-sm text-gray-400 dark:text-slate-500">
              Analytics data is recorded each time the project is saved.
              Save the project a few times to start seeing trends.
            </div>
          </div>
        )}

        {/* Charts and summary */}
        {!loading && !error && data.length > 0 && summary && (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              <SummaryCard
                title="Compliance Score"
                value={summary.current?.compliance_score.toFixed(0) ?? '-'}
                unit="%"
                trend={summary.compliance_trend}
                positiveIsGood={true}
              />
              <SummaryCard
                title="Risk Score"
                value={summary.current?.risk_score.toFixed(0) ?? '-'}
                unit="/100"
                trend={summary.risk_trend}
                positiveIsGood={false}
              />
              <SummaryCard
                title="Zones"
                value={summary.current?.zone_count ?? 0}
                trend={summary.zone_count_trend}
              />
              <SummaryCard
                title="Assets"
                value={summary.current?.asset_count ?? 0}
                trend={summary.asset_count_trend}
              />
            </div>

            {/* Compliance chart */}
            <div className="mb-6">
              <h3 className="text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                Compliance Score Trend
                {summary.min_compliance !== null && summary.max_compliance !== null && (
                  <span className="text-xs text-gray-400 dark:text-slate-500 ml-2">
                    (range: {summary.min_compliance.toFixed(0)}-{summary.max_compliance.toFixed(0)}%)
                  </span>
                )}
              </h3>
              <div className="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-3">
                <LineChart
                  data={complianceChartData}
                  color="#3b82f6"
                  fillColor="#3b82f6"
                  yMin={0}
                  yMax={100}
                  yLabel="Score %"
                />
              </div>
            </div>

            {/* Risk chart */}
            <div className="mb-6">
              <h3 className="text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                Risk Score Trend
                {summary.min_risk !== null && summary.max_risk !== null && (
                  <span className="text-xs text-gray-400 dark:text-slate-500 ml-2">
                    (range: {summary.min_risk.toFixed(0)}-{summary.max_risk.toFixed(0)})
                  </span>
                )}
              </h3>
              <div className="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-3">
                <LineChart
                  data={riskChartData}
                  color="#ef4444"
                  fillColor="#ef4444"
                  yMin={0}
                  yMax={100}
                  yLabel="Risk"
                />
              </div>
            </div>

            {/* Entity counts */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <div>
                <h3 className="text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Zones</h3>
                <div className="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-3">
                  <LineChart
                    data={zoneChartData}
                    height={120}
                    color="#06b6d4"
                    fillColor="#06b6d4"
                    yLabel="Count"
                    showDots={data.length <= 30}
                  />
                </div>
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Assets</h3>
                <div className="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-3">
                  <LineChart
                    data={assetChartData}
                    height={120}
                    color="#f59e0b"
                    fillColor="#f59e0b"
                    yLabel="Count"
                    showDots={data.length <= 30}
                  />
                </div>
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Conduits</h3>
                <div className="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-3">
                  <LineChart
                    data={conduitChartData}
                    height={120}
                    color="#8b5cf6"
                    fillColor="#8b5cf6"
                    yLabel="Count"
                    showDots={data.length <= 30}
                  />
                </div>
              </div>
            </div>

            {/* Errors + Warnings chart */}
            <div className="mb-2">
              <h3 className="text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                Validation Issues (Errors + Warnings)
              </h3>
              <div className="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-3">
                <LineChart
                  data={errorChartData}
                  height={120}
                  color="#f97316"
                  fillColor="#f97316"
                  yMin={0}
                  yLabel="Issues"
                  showDots={data.length <= 30}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </DialogShell>
  );
}
