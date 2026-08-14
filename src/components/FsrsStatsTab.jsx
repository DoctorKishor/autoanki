import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, PieChart, Pie } from 'recharts';
import { getTopicPageWeight } from '../utils/pageUtils';

export default function FsrsStatsTab({ subjectTrackerData = [], studyLogs = [], fsrsConfig = {}, themeMode = 'dark' }) {
  const isDark = themeMode === 'dark';
  const [timeRange, setTimeRange] = useState('1M'); // '1M', '3M', '1Y', 'ALL'

  // Map of valid (subject|topicName|dateStr) present in subjectTrackerData
  const validTopicDatesMap = useMemo(() => {
    const map = new Set();
    if (!Array.isArray(subjectTrackerData)) return map;

    subjectTrackerData.forEach(subDoc => {
      const subName = (subDoc.subject || '').trim().toLowerCase();
      if (subDoc.topics && typeof subDoc.topics === 'object') {
        Object.values(subDoc.topics).forEach(topic => {
          if (topic && typeof topic.name === 'string' && Array.isArray(topic.studyDates)) {
            const topName = topic.name.trim().toLowerCase();
            topic.studyDates.forEach(dStr => {
              if (dStr) {
                map.add(`${subName}|${topName}|${dStr}`);
                map.add(`${topName}|${dStr}`);
              }
            });
          }
        });
      }
    });

    return map;
  }, [subjectTrackerData]);

  // Filter study logs based on selected time range and valid studyDates
  const filteredLogs = useMemo(() => {
    let rawFsrsLogs = [];
    if (Array.isArray(studyLogs)) {
      rawFsrsLogs = studyLogs;
    } else if (studyLogs && typeof studyLogs === 'object') {
      Object.entries(studyLogs).forEach(([dateKey, dayLog]) => {
        if (Array.isArray(dayLog)) {
          rawFsrsLogs.push(...dayLog);
        } else if (dayLog && typeof dayLog === 'object') {
          if (Array.isArray(dayLog.fsrsLogs)) {
            rawFsrsLogs.push(...dayLog.fsrsLogs);
          } else if (dayLog.rating) {
            rawFsrsLogs.push(dayLog);
          }
        }
      });
    }

    if (rawFsrsLogs.length === 0) return [];

    const now = new Date();
    let cutoff = new Date();

    if (timeRange === '1M') cutoff.setDate(now.getDate() - 30);
    else if (timeRange === '3M') cutoff.setDate(now.getDate() - 90);
    else if (timeRange === '1Y') cutoff.setDate(now.getDate() - 365);
    else cutoff = new Date(0); // All time

    return rawFsrsLogs.filter(log => {
      if (!log || typeof log !== 'object') return false;

      // Validate log against active subjectTrackerData studyDates
      if (log.subject && log.topicName) {
        const subName = log.subject.trim().toLowerCase();
        const topName = log.topicName.trim().toLowerCase();
        const dStr = log.dateStr || (log.timestamp ? log.timestamp.split('T')[0] : null);

        if (dStr) {
          const isValidKey = validTopicDatesMap.has(`${subName}|${topName}|${dStr}`) || validTopicDatesMap.has(`${topName}|${dStr}`);
          if (!isValidKey) return false; // Exclude legacy or orphan unlinked logs
        }
      }

      const dateString = log.timestamp || log.dateStr || log.date || log.createdAt;
      if (!dateString) return true; // If no date, include in All Time
      const logDate = new Date(dateString);
      if (isNaN(logDate.getTime())) return true;
      return logDate >= cutoff;
    });
  }, [studyLogs, validTopicDatesMap, timeRange]);

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

    // Set of topic names present in current filtered study logs
    const reviewedTopicNames = new Set();
    filteredLogs.forEach(log => {
      if (log && log.topicName) {
        reviewedTopicNames.add(log.topicName.trim().toLowerCase());
      }
    });

    subjectTrackerData.forEach(subDoc => {
      const subName = subDoc.subject;
      if (subDoc.topics) {
        Object.values(subDoc.topics).forEach(topic => {
          if (typeof topic.name === 'string' && topic.name.trim().length > 0) {
            totalTopicsCount++;
            const cleanName = topic.name.trim().toLowerCase();
            const hasActiveLogs = reviewedTopicNames.has(cleanName);
            const hasReviews = (topic.reviewCount || 0) > 0 && Array.isArray(topic.studyDates) && topic.studyDates.length > 0;

            // Only aggregate stability & difficulty if active revision logs exist for topic
            if (filteredLogs.length > 0 && hasActiveLogs && hasReviews && topic.stability != null && topic.difficulty != null) {
              sumStability += topic.stability;
              sumDifficulty += topic.difficulty;
              countFSRS++;
            }

            const lapses = topic.lapses || topic.lapsesCount || 0;
            if ((hasActiveLogs || hasReviews) && (lapses >= (fsrsConfig.lapses?.leechThreshold ?? 8) || topic.isLeech)) {
              leechList.push({ ...topic, subject: subName, lapses });
            }
          }
        });
      }
    });

    const avgStability = countFSRS > 0 ? (sumStability / countFSRS).toFixed(1) : '0.0';
    const avgDifficulty = countFSRS > 0 ? (sumDifficulty / countFSRS).toFixed(1) : '0.0';

    return { totalTopicsCount, avgStability, avgDifficulty, leechList };
  }, [subjectTrackerData, fsrsConfig, filteredLogs]);

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
        const topicsList = Object.values(subDoc.topics);
        topicsList.forEach(topic => {
          // Only forecast upcoming reviews for topics that have completed at least one review session
          if (topic.nextReviewDue && (topic.reviewCount || 0) > 0 && topic.lastReviewDate && daysMap[topic.nextReviewDue]) {
            daysMap[topic.nextReviewDue].count += 1;
            const pageLen = getTopicPageWeight(topic, topicsList);
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
      valueColor: isDark ? 'text-emerald-400' : 'text-emerald-600',
      subtext: `Target: ${Math.round((fsrsConfig.globalDesiredRetention || 0.9) * 100)}%`,
      delay: 0.05
    },
    {
      title: 'Reviews Completed',
      icon: '📈',
      value: totalReviews,
      valueColor: isDark ? 'text-indigo-400' : 'text-indigo-600',
      subtext: `${topicStats.totalTopicsCount} active textbook topics`,
      delay: 0.1
    },
    {
      title: 'Avg Stability (S)',
      icon: '🧠',
      value: `${topicStats.avgStability} days`,
      valueColor: isDark ? 'text-sky-400' : 'text-sky-600',
      subtext: 'Recall threshold retention duration',
      delay: 0.15
    },
    {
      title: 'Avg Difficulty (D)',
      icon: '⚖️',
      value: `${topicStats.avgDifficulty} / 10`,
      valueColor: isDark ? 'text-amber-400' : 'text-amber-600',
      subtext: 'Topic complexity weight score',
      delay: 0.2
    }
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className={`space-y-5 sm:space-y-6 w-full ${isDark ? 'text-slate-200' : 'text-slate-800'}`}
    >
      {/* Header Bar - Staggered Motion */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 sm:p-5 rounded-2xl sm:rounded-3xl border shadow-lg ${
          isDark ? 'bg-[#222730] border-slate-700/60 neu-card-dark' : 'bg-white border-slate-200/80 neu-card-light'
        }`}
      >
        <div>
          <h3 className={`text-base sm:text-lg font-black tracking-tight flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
            <span>📊</span> FSRS Analytics & Memory Forecast
          </h3>
          <p className={`text-[11px] font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Track recall performance, memory stability, and projected study load</p>
        </div>

        {/* Sliding Pill Switcher for Time Range */}
        <div className={`relative flex p-1 rounded-xl sm:rounded-2xl border w-full sm:w-auto ${
          isDark ? 'bg-slate-900/90 border-slate-700/60 shadow-inner' : 'neu-pressed-light border-slate-200/80'
        }`}>
          {['1M', '3M', '1Y', 'ALL'].map((range, idx) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`flex-1 sm:px-4 py-1.5 sm:py-2 rounded-lg sm:rounded-xl text-xs font-black uppercase tracking-wider transition-all relative z-10 ${
                timeRange === range ? 'text-white' : isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-900'
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
            className={`p-4 sm:p-5 rounded-2xl border shadow-md space-y-2 relative overflow-hidden active:scale-98 transition-transform ${
              isDark ? 'bg-[#222730] border-slate-700/60 neu-card-dark' : 'bg-white border-slate-200/80 neu-card-light'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className={`text-[10px] sm:text-xs font-black uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{card.title}</span>
              <span className="text-xl">{card.icon}</span>
            </div>
            <div className={`text-2xl sm:text-3xl font-black ${card.valueColor}`}>{card.value}</div>
            <p className={`text-[10px] sm:text-[11px] font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{card.subtext}</p>
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
          className={`lg:col-span-2 p-4 sm:p-6 rounded-2xl sm:rounded-3xl border shadow-lg space-y-4 ${
            isDark ? 'bg-[#222730] border-slate-700/60 neu-card-dark' : 'bg-white border-slate-200/80 neu-card-light'
          }`}
        >
          <div className="flex items-center justify-between">
            <h4 className={`text-xs sm:text-sm font-black tracking-wide flex items-center gap-2 uppercase ${isDark ? 'text-white' : 'text-slate-900'}`}>
              <span>📅</span> 30-Day Upcoming Review Forecast
            </h4>
            <span className={`text-[10px] sm:text-xs font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Pages per day</span>
          </div>

          <div className="h-56 sm:h-64 w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <BarChart data={forecastData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <XAxis dataKey="label" stroke={isDark ? "#64748b" : "#94a3b8"} fontSize={10} tickLine={false} />
                <YAxis stroke={isDark ? "#64748b" : "#94a3b8"} fontSize={10} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: isDark ? '#0f172a' : '#ffffff',
                    borderColor: isDark ? '#334155' : '#cbd5e1',
                    borderRadius: '0.75rem',
                    color: isDark ? '#f8fafc' : '#0f172a',
                    fontSize: '12px',
                    boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)'
                  }}
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
          className={`p-4 sm:p-6 rounded-2xl sm:rounded-3xl border shadow-lg space-y-4 ${
            isDark ? 'bg-[#222730] border-slate-700/60 neu-card-dark' : 'bg-white border-slate-200/80 neu-card-light'
          }`}
        >
          <h4 className={`text-xs sm:text-sm font-black tracking-wide flex items-center gap-2 uppercase ${isDark ? 'text-white' : 'text-slate-900'}`}>
            <span>🍕</span> Rating Breakdown
          </h4>

          {ratingPieData.length > 0 ? (
            <div className="h-56 sm:h-64 w-full flex items-center justify-center min-w-0">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
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
                    contentStyle={{
                      backgroundColor: isDark ? '#0f172a' : '#ffffff',
                      borderColor: isDark ? '#334155' : '#cbd5e1',
                      borderRadius: '0.75rem',
                      color: isDark ? '#f8fafc' : '#0f172a',
                      fontSize: '12px',
                      boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)'
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className={`h-56 sm:h-64 flex items-center justify-center text-xs font-semibold ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
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
        className={`p-4 sm:p-6 rounded-2xl sm:rounded-3xl border shadow-lg space-y-4 ${
          isDark ? 'bg-[#222730] border-slate-700/60 neu-card-dark' : 'bg-white border-slate-200/80 neu-card-light'
        }`}
      >
        <div className="flex items-center justify-between">
          <h4 className={`text-xs sm:text-sm font-black tracking-wide flex items-center gap-2 uppercase ${isDark ? 'text-white' : 'text-slate-900'}`}>
            <span>⚠️</span> Problematic Topics & Leeches ({topicStats.leechList.length})
          </h4>
          <span className={`text-[10px] sm:text-xs font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Topics needing extra revision</span>
        </div>

        {topicStats.leechList.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {topicStats.leechList.map((item, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: 0.04 * idx }}
                className={`p-3.5 rounded-xl border flex items-start justify-between shadow-sm active:scale-98 transition-transform ${
                  isDark ? 'bg-slate-900/60 border-amber-500/30' : 'bg-amber-50/50 border-amber-200'
                }`}
              >
                <div>
                  <div className="text-xs font-black text-amber-600">{item.name}</div>
                  <div className={`text-[10px] font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{item.subject} • Page {item.page || '?'}</div>
                </div>
                <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-600 text-[10px] font-black uppercase">
                  {item.lapses} lapses
                </span>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className={`p-4 rounded-xl border text-xs font-semibold text-center ${
            isDark ? 'bg-slate-900/40 border-slate-700/40 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-600 neu-pressed-light'
          }`}>
            🎉 Great job! No problematic leech topics detected in your study queue.
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
