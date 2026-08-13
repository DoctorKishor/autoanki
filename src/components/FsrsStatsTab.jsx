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

  const statCards = [
    {
      title: 'True Retention',
      icon: '🎯',
      value: `${retentionRate}%`,
      valueColor: 'text-emerald-400',
      subtext: `Target: ${Math.round((fsrsConfig.globalDesiredRetention || 0.9) * 100)}%`,
      delay: 0.05
    },
    {
      title: 'Reviews Completed',
      icon: '📈',
      value: totalReviews,
      valueColor: 'text-indigo-400',
      subtext: `${topicStats.totalTopicsCount} active textbook topics`,
      delay: 0.1
    },
    {
      title: 'Avg Stability (S)',
      icon: '🧠',
      value: `${topicStats.avgStability} days`,
      valueColor: 'text-sky-400',
      subtext: 'Recall threshold retention duration',
      delay: 0.15
    },
    {
      title: 'Avg Difficulty (D)',
      icon: '⚖️',
      value: `${topicStats.avgDifficulty} / 10`,
      valueColor: 'text-amber-400',
      subtext: 'Topic complexity weight score',
      delay: 0.2
    }
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="space-y-5 sm:space-y-6 w-full text-slate-200"
    >
      {/* Header Bar - Staggered Motion */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-[#222730] p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-slate-700/60 shadow-lg neu-card-dark"
      >
        <div>
          <h3 className="text-base sm:text-lg font-black text-white tracking-tight flex items-center gap-2">
            <span>📊</span> FSRS Analytics & Memory Forecast
          </h3>
          <p className="text-[11px] text-slate-400 font-medium">Track recall performance, memory stability, and projected study load</p>
        </div>

        {/* Sliding Pill Switcher for Time Range */}
        <div className="relative flex bg-slate-900/90 p-1 rounded-xl sm:rounded-2xl border border-slate-700/60 w-full sm:w-auto shadow-inner">
          {['1M', '3M', '1Y', 'ALL'].map((range, idx) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`flex-1 sm:px-4 py-1.5 sm:py-2 rounded-lg sm:rounded-xl text-xs font-black uppercase tracking-wider transition-all relative z-10 ${
                timeRange === range ? 'text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {range === '1M' ? '1 Month' : range === '3M' ? '3 Months' : range === '1Y' ? '1 Year' : 'All Time'}
            </button>
          ))}
          <div
            className="absolute top-1 bottom-1 bg-indigo-600 rounded-lg sm:rounded-xl shadow-md"
            style={{
              left: timeRange === '1M' ? '4px' : timeRange === '3M' ? 'calc(25% + 1px)' : timeRange === '1Y' ? 'calc(50% + 1px)' : 'calc(75% + 1px)',
              width: 'calc(25% - 5px)',
              transition: 'all 0.6s cubic-bezier(0, 0, 0, 1)'
            }}
          />
        </div>
      </motion.div>

      {/* Metric Cards Grid with Per-Card Staggered Entrance */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
        {statCards.map((card, idx) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.35, delay: card.delay, ease: 'easeOut' }}
            whileHover={{ y: -3, scale: 1.01 }}
            className="p-4 sm:p-5 rounded-2xl bg-[#222730] border border-slate-700/60 shadow-md neu-card-dark space-y-2 relative overflow-hidden active:scale-98 transition-transform"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] sm:text-xs font-black text-slate-400 uppercase tracking-wider">{card.title}</span>
              <span className="text-xl">{card.icon}</span>
            </div>
            <div className={`text-2xl sm:text-3xl font-black ${card.valueColor}`}>{card.value}</div>
            <p className="text-[10px] sm:text-[11px] text-slate-400 font-medium">{card.subtext}</p>
          </motion.div>
        ))}
      </div>

      {/* Visualizations Section with Staggered Entrance */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* 30-Day Upcoming Review Forecast Bar Chart */}
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.4, delay: 0.25 }}
          className="lg:col-span-2 p-4 sm:p-6 rounded-2xl sm:rounded-3xl bg-[#222730] border border-slate-700/60 shadow-lg neu-card-dark space-y-4"
        >
          <div className="flex items-center justify-between">
            <h4 className="text-xs sm:text-sm font-black text-white tracking-wide flex items-center gap-2 uppercase">
              <span>📅</span> 30-Day Upcoming Review Forecast
            </h4>
            <span className="text-[10px] sm:text-xs text-slate-400 font-bold">Pages per day</span>
          </div>

          <div className="h-56 sm:h-64 w-full">
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
        </motion.div>

        {/* Rating Frequency Breakdown Pie Chart */}
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.4, delay: 0.3 }}
          className="p-4 sm:p-6 rounded-2xl sm:rounded-3xl bg-[#222730] border border-slate-700/60 shadow-lg neu-card-dark space-y-4"
        >
          <h4 className="text-xs sm:text-sm font-black text-white tracking-wide flex items-center gap-2 uppercase">
            <span>🍕</span> Rating Breakdown
          </h4>

          {ratingPieData.length > 0 ? (
            <div className="h-56 sm:h-64 w-full flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={ratingPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={75}
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
            <div className="h-56 sm:h-64 flex items-center justify-center text-xs text-slate-500 font-semibold">
              No study logs recorded yet.
            </div>
          )}
        </motion.div>
      </div>

      {/* Leech & Problematic Topics Section */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.35 }}
        className="p-4 sm:p-6 rounded-2xl sm:rounded-3xl bg-[#222730] border border-slate-700/60 shadow-lg neu-card-dark space-y-4"
      >
        <div className="flex items-center justify-between">
          <h4 className="text-xs sm:text-sm font-black text-white tracking-wide flex items-center gap-2 uppercase">
            <span>⚠️</span> Problematic Topics & Leeches ({topicStats.leechList.length})
          </h4>
          <span className="text-[10px] sm:text-xs text-slate-400 font-semibold">Topics needing extra revision</span>
        </div>

        {topicStats.leechList.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {topicStats.leechList.map((item, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: 0.04 * idx }}
                className="p-3.5 rounded-xl bg-slate-900/60 border border-amber-500/30 flex items-start justify-between shadow-sm active:scale-98 transition-transform"
              >
                <div>
                  <div className="text-xs font-black text-amber-300">{item.name}</div>
                  <div className="text-[10px] text-slate-400 font-medium">{item.subject} • Page {item.page || '?'}</div>
                </div>
                <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-400 text-[10px] font-black uppercase">
                  {item.lapses} lapses
                </span>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-700/40 text-xs text-slate-400 font-semibold text-center">
            🎉 Great job! No problematic leech topics detected in your study queue.
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
