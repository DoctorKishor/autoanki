import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, PieChart, Pie } from 'recharts';

export default function FsrsStatsTab({ subjectTrackerData = [], studyLogs = [], fsrsConfig = {} }) {
  const [timeRange, setTimeRange] = useState('1M'); // '1M', '3M', '1Y', 'ALL'

  // Filter study logs based on selected time range
  const filteredLogs = useMemo(() => {
    if (!studyLogs || studyLogs.length === 0) return [];
    const now = new Date();
    let cutoff = new Date();

    if (timeRange === '1M') cutoff.setDate(now.getDate() - 30);
    else if (timeRange === '3M') cutoff.setDate(now.getDate() - 90);
    else if (timeRange === '1Y') cutoff.setDate(now.getDate() - 365);
    else cutoff = new Date(0); // All time

    return studyLogs.filter(log => {
      const logDate = new Date(log.timestamp || log.date);
      return logDate >= cutoff;
    });
  }, [studyLogs, timeRange]);

  // Calculated Metrics
  const totalReviews = filteredLogs.length;

  const ratingCounts = useMemo(() => {
    const counts = { again: 0, hard: 0, good: 0, easy: 0 };
    filteredLogs.forEach(log => {
      const r = log.rating;
      if (r === 1 || r === 'again' || r === 'Again') counts.again++;
      else if (r === 2 || r === 'hard' || r === 'Hard') counts.hard++;
      else if (r === 3 || r === 'good' || r === 'Good') counts.good++;
      else if (r === 4 || r === 'easy' || r === 'Easy') counts.easy++;
    });
    return counts;
  }, [filteredLogs]);

  const retentionRate = useMemo(() => {
    if (totalReviews === 0) return 0;
    const passed = ratingCounts.hard + ratingCounts.good + ratingCounts.easy;
    return Math.round((passed / totalReviews) * 100);
  }, [totalReviews, ratingCounts]);

  // Topic Statistics from subjectTrackerData
  const topicStats = useMemo(() => {
    let totalTopicsCount = 0;
    let sumStability = 0;
    let sumDifficulty = 0;
    let countFSRS = 0;
    const leechList = [];

    subjectTrackerData.forEach(subDoc => {
      const subName = subDoc.subject;
      if (subDoc.topics) {
        Object.values(subDoc.topics).forEach(topic => {
          if (typeof topic.name === 'string' && topic.name.trim().length > 0) {
            totalTopicsCount++;
            if (topic.stability != null && topic.difficulty != null) {
              sumStability += topic.stability;
              sumDifficulty += topic.difficulty;
              countFSRS++;
            }
            const lapses = topic.lapses || topic.lapsesCount || 0;
            if (lapses >= (fsrsConfig.lapses?.leechThreshold ?? 8) || topic.isLeech) {
              leechList.push({ ...topic, subject: subName, lapses });
            }
          }
        });
      }
    });

    const avgStability = countFSRS > 0 ? (sumStability / countFSRS).toFixed(1) : 'N/A';
    const avgDifficulty = countFSRS > 0 ? (sumDifficulty / countFSRS).toFixed(1) : 'N/A';

    return { totalTopicsCount, avgStability, avgDifficulty, leechList };
  }, [subjectTrackerData, fsrsConfig]);

  // 30-Day Forecast Data Calculation
  const forecastData = useMemo(() => {
    const daysMap = {};
    const today = new Date();

    for (let i = 0; i < 30; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];
      const dayLabel = `${d.getMonth() + 1}/${d.getDate()}`;
      daysMap[dateStr] = { date: dateStr, label: dayLabel, count: 0, pages: 0 };
    }

    subjectTrackerData.forEach(subDoc => {
      if (subDoc.topics) {
        Object.values(subDoc.topics).forEach(topic => {
          if (topic.nextReviewDue && daysMap[topic.nextReviewDue]) {
            daysMap[topic.nextReviewDue].count += 1;
            const pageLen = parseInt(topic.pageCount, 10) || 1;
            daysMap[topic.nextReviewDue].pages += pageLen;
          }
        });
      }
    });

    return Object.values(daysMap);
  }, [subjectTrackerData]);

  // Rating Distribution Pie Chart Data
  const ratingPieData = [
    { name: 'Again (1)', value: ratingCounts.again, color: '#f43f5e' },
    { name: 'Hard (2)', value: ratingCounts.hard, color: '#f59e0b' },
    { name: 'Good (3)', value: ratingCounts.good, color: '#3b82f6' },
    { name: 'Easy (4)', value: ratingCounts.easy, color: '#10b981' },
  ].filter(d => d.value > 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="space-y-6 w-full text-slate-200"
    >
      {/* Top Filter Bar (Responsive for Mobile & Desktop) */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-[#222730] p-4 rounded-2xl border border-slate-700/60 shadow-sm">
        <div>
          <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
            <span>📊</span> FSRS Analytics & Memory Forecast
          </h3>
          <p className="text-xs text-slate-400">Track recall performance, memory stability, and projected study load</p>
        </div>

        {/* Dynamic Single Sliding Pill Switcher for Time Range */}
        <div className="relative flex bg-slate-900 p-1 rounded-xl border border-slate-700/60 w-full sm:w-auto">
          {['1M', '3M', '1Y', 'ALL'].map(range => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`flex-1 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition-all relative z-10 ${
                timeRange === range ? 'text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {range === '1M' ? '1 Month' : range === '3M' ? '3 Months' : range === '1Y' ? '1 Year' : 'All Time'}
            </button>
          ))}
          <div
            className="absolute top-1 bottom-1 bg-indigo-600 rounded-lg shadow-sm"
            style={{
              left: timeRange === '1M' ? '4px' : timeRange === '3M' ? 'calc(25% + 1px)' : timeRange === '1Y' ? 'calc(50% + 1px)' : 'calc(75% + 1px)',
              width: 'calc(25% - 5px)',
              transition: 'all 0.6s cubic-bezier(0, 0, 0, 1)'
            }}
          />
        </div>
      </div>

      {/* Metric Cards Grid (Responsive 1-col on Mobile, 4-col on Desktop) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: True Retention Rate */}
        <motion.div
          whileHover={{ y: -2 }}
          className="p-4 sm:p-5 rounded-2xl bg-[#222730] border border-slate-700/60 shadow-md space-y-2 relative overflow-hidden"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">True Retention</span>
            <span className="text-xl">🎯</span>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-emerald-400">{retentionRate}%</div>
          <p className="text-[11px] text-slate-400">Target Retention: {Math.round((fsrsConfig.globalDesiredRetention || 0.9) * 100)}%</p>
        </motion.div>

        {/* Card 2: Total Reviews Completed */}
        <motion.div
          whileHover={{ y: -2 }}
          className="p-4 sm:p-5 rounded-2xl bg-[#222730] border border-slate-700/60 shadow-md space-y-2 relative overflow-hidden"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Reviews Completed</span>
            <span className="text-xl">📈</span>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-indigo-400">{totalReviews}</div>
          <p className="text-[11px] text-slate-400">{topicStats.totalTopicsCount} active textbook topics</p>
        </motion.div>

        {/* Card 3: Average Memory Stability */}
        <motion.div
          whileHover={{ y: -2 }}
          className="p-4 sm:p-5 rounded-2xl bg-[#222730] border border-slate-700/60 shadow-md space-y-2 relative overflow-hidden"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Avg Stability (S)</span>
            <span className="text-xl">🧠</span>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-sky-400">{topicStats.avgStability} <span className="text-xs font-normal text-slate-400">days</span></div>
          <p className="text-[11px] text-slate-400">Interval duration before 90% recall drop</p>
        </motion.div>

        {/* Card 4: Average Difficulty */}
        <motion.div
          whileHover={{ y: -2 }}
          className="p-4 sm:p-5 rounded-2xl bg-[#222730] border border-slate-700/60 shadow-md space-y-2 relative overflow-hidden"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Avg Difficulty (D)</span>
            <span className="text-xl">⚖️</span>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-amber-400">{topicStats.avgDifficulty} <span className="text-xs font-normal text-slate-400">/ 10</span></div>
          <p className="text-[11px] text-slate-400">Topic complexity weight score</p>
        </motion.div>
      </div>

      {/* Visualizations Section (Responsive dual grid on Desktop, stack on Mobile) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 30-Day Upcoming Review Forecast Bar Chart (Spans 2 columns on Desktop) */}
        <div className="lg:col-span-2 p-5 sm:p-6 rounded-2xl bg-[#222730] border border-slate-700/60 shadow-md space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <span>📅</span> 30-Day Upcoming Review Forecast
            </h4>
            <span className="text-xs text-slate-400">Pages per day</span>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={forecastData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <XAxis dataKey="label" stroke="#64748b" fontSize={10} tickLine={false} />
                <YAxis stroke="#64748b" fontSize={10} tickLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '0.75rem', color: '#f8fafc', fontSize: '12px' }}
                  formatter={(val) => [`${val} pages`, 'Review Load']}
                />
                <Bar dataKey="pages" fill="#6366f1" radius={[4, 4, 0, 0]}>
                  {forecastData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.pages > (fsrsConfig.dailyLimits?.maxReviewPagesPerDay || 30) ? '#f43f5e' : '#6366f1'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Rating Frequency Breakdown Pie Chart */}
        <div className="p-5 sm:p-6 rounded-2xl bg-[#222730] border border-slate-700/60 shadow-md space-y-4">
          <h4 className="text-sm font-bold text-white flex items-center gap-2">
            <span>🍕</span> Review Rating Breakdown
          </h4>

          {ratingPieData.length > 0 ? (
            <div className="h-64 w-full flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={ratingPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {ratingPieData.map((entry, index) => (
                      <Cell key={`pie-cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '0.75rem', color: '#f8fafc', fontSize: '12px' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-xs text-slate-500">
              No study logs recorded yet.
            </div>
          )}
        </div>
      </div>

      {/* Leech & Problematic Topics Section */}
      <div className="p-5 sm:p-6 rounded-2xl bg-[#222730] border border-slate-700/60 shadow-md space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-bold text-white flex items-center gap-2">
            <span>⚠️</span> Problematic Topics & Leeches ({topicStats.leechList.length})
          </h4>
          <span className="text-xs text-slate-400">Topics requiring extra revision / mnemonics</span>
        </div>

        {topicStats.leechList.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {topicStats.leechList.map((item, idx) => (
              <div key={idx} className="p-3.5 rounded-xl bg-slate-900/60 border border-amber-500/30 flex items-start justify-between">
                <div>
                  <div className="text-xs font-bold text-amber-300">{item.name}</div>
                  <div className="text-[11px] text-slate-400">{item.subject} • Page {item.page || '?'}</div>
                </div>
                <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-400 text-[10px] font-bold">
                  {item.lapses} lapses
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-700/40 text-xs text-slate-400 text-center">
            🎉 Great job! No problematic leech topics detected in your study queue.
          </div>
        )}
      </div>
    </motion.div>
  );
}
