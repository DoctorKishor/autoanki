import React from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip
} from 'recharts';

/**
 * A sleek line chart component showing study efficiency history.
 * Supports Neumorphic Light and Dark themes.
 * 
 * @param {Object} props
 * @param {Array<Object>} props.data - Array of { date: string, score: number } records.
 * @param {string} [props.themeMode='dark'] - Dual theme ('dark' | 'light').
 */
export default function ProgressChart({ data, themeMode = 'dark' }) {
  const isDark = themeMode === 'dark';

  // Ensure we always have some data to display
  const chartData = data && data.length > 0 ? data : [
    { date: '21-May', score: 0 },
    { date: '22-May', score: 0 },
    { date: '23-May', score: 0 },
    { date: '24-May', score: 0 },
    { date: '25-May', score: 0 },
    { date: '26-May', score: 0 },
    { date: '27-May', score: 0 },
  ];

  // Format y-axis values to add '%' sign or just numbers
  const formatYAxis = (tick) => `${tick}`;

  const gridColor = isDark ? 'rgba(255, 255, 255, 0.05)' : '#e2e8f0';
  const axisColor = isDark ? '#475569' : '#cbd5e1';
  const tickColor = isDark ? '#94a3b8' : '#64748b';
  const lineColor = isDark ? '#3b82f6' : '#2563eb';
  const dotFill = isDark ? '#222730' : '#ffffff';

  return (
    <div className="w-full h-64 md:h-72 mt-2 min-w-0">
      <ResponsiveContainer width="100%" height={260} minWidth={0} minHeight={0}>
        <LineChart
          data={chartData}
          margin={{ top: 10, right: 15, left: -20, bottom: 5 }}
        >
          <CartesianGrid stroke={gridColor} strokeDasharray="3 3" vertical={true} horizontal={true} />
          <XAxis
            dataKey="date"
            tick={{ fill: tickColor, fontSize: 10, fontWeight: 700 }}
            axisLine={{ stroke: axisColor }}
            tickLine={false}
          />
          <YAxis
            domain={[0, 100]}
            ticks={[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]}
            tick={{ fill: tickColor, fontSize: 10, fontWeight: 700 }}
            axisLine={{ stroke: axisColor }}
            tickLine={false}
            tickFormatter={formatYAxis}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                return (
                  <div className={`${isDark ? 'neu-card-dark border border-slate-700/60' : 'neu-card-light border border-white/80'} rounded-2xl p-3.5 text-left shadow-xl select-none`}>
                    <p className={`text-[10px] font-black uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      {payload[0].payload.date}
                    </p>
                    <p className={`text-sm font-black mt-0.5 flex items-center gap-1.5 ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>
                      <span>⚡</span> {payload[0].value.toFixed(1)}% Efficiency
                    </p>
                  </div>
                );
              }
              return null;
            }}
          />
          <Line
            type="monotone"
            dataKey="score"
            stroke={lineColor}
            strokeWidth={3}
            dot={{ r: 4, stroke: lineColor, strokeWidth: 2, fill: dotFill }}
            activeDot={{ r: 6, fill: lineColor, strokeWidth: 2, stroke: dotFill }}
            animationDuration={600}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

