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
 * Matches the reference image style.
 * 
 * @param {Object} props
 * @param {Array<Object>} props.data - Array of { date: string, score: number } records.
 */
export default function ProgressChart({ data }) {
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

  return (
    <div className="w-full h-64 md:h-72 mt-2 min-w-0">
      <ResponsiveContainer width="100%" height={260} minWidth={0} minHeight={0}>
        <LineChart
          data={chartData}
          margin={{ top: 10, right: 15, left: -20, bottom: 5 }}
        >
          <CartesianGrid stroke="#f1f5f9" strokeDasharray="3 3" vertical={true} horizontal={true} />
          <XAxis
            dataKey="date"
            tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 'bold' }}
            axisLine={{ stroke: '#e2e8f0' }}
            tickLine={false}
          />
          <YAxis
            domain={[0, 100]}
            ticks={[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]}
            tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 'bold' }}
            axisLine={{ stroke: '#e2e8f0' }}
            tickLine={false}
            tickFormatter={formatYAxis}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                return (
                  <div className="bg-white/95 backdrop-blur-md shadow-lg border border-slate-100 rounded-xl p-3 text-left">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      {payload[0].payload.date}
                    </p>
                    <p className="text-sm font-black text-blue-600 mt-0.5">
                      {payload[0].value.toFixed(1)}% Efficiency
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
            stroke="#0284c7" // custom medium blue matching the reference
            strokeWidth={3}
            dot={{ r: 4, stroke: '#0284c7', strokeWidth: 2, fill: '#ffffff' }}
            activeDot={{ r: 6, fill: '#0284c7', strokeWidth: 0 }}
            animationDuration={600}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
