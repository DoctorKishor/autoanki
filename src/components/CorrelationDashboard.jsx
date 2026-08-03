import React, { useState, useEffect, useMemo } from 'react';
import {
  ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, ZAxis,
  Tooltip, Legend, ReferenceLine, BarChart, Bar, Cell, CartesianGrid
} from 'recharts';
import { Activity, Moon, Dumbbell, Info, Zap, Terminal, Sparkles, Loader } from 'lucide-react';
import { collection, onSnapshot, doc, setDoc } from 'firebase/firestore';
import { mockHealthData } from '../utils/healthMockData';

const STUDY_METRICS = {
  studyDuration: { name: 'Study Duration', key: 'studyDuration', unit: ' mins' },
  cards: { name: 'Cards Reviewed', key: 'cards', unit: ' cards' },
  questions: { name: 'Questions Solved', key: 'questions', unit: ' questions' },
  pages: { name: 'Pages Read', key: 'pages', unit: ' pages' }
};

const HEALTH_METRICS = {
  sleepHours: { name: 'Sleep Hours', key: 'sleepHours', unit: ' hrs' },
  sleepScore: { name: 'Sleep Score', key: 'sleepScore', unit: ' pts' },
  workoutDuration: { name: 'Workout Duration', key: 'workoutDuration', unit: ' mins' }
};

const formatSleepHours = (hoursDec) => {
  if (!hoursDec || hoursDec <= 0) return '0 hrs';
  const hrs = Math.floor(hoursDec);
  const mins = Math.round((hoursDec - hrs) * 60);
  if (mins === 60) {
    return `${hrs + 1} hrs`;
  }
  if (hrs === 0) {
    return `${mins} mins`;
  }
  if (mins === 0) {
    return `${hrs} hrs`;
  }
  return `${hrs} hrs ${mins} mins`;
};

export default function CorrelationDashboard({ user, db, studySessions, cards, geminiApiKey }) {
  const [dataSource, setDataSource] = useState('live'); // Default purely to live Firestore data
  const [liveHealthData, setLiveHealthData] = useState([]);
  const [timeRange, setTimeRange] = useState(30); // days: 3, 5, 7, 14, 30, 90, 180

  // Dynamic selector states
  const [selectedStudyMetric, setSelectedStudyMetric] = useState('studyDuration');
  const [selectedHealthMetric, setSelectedHealthMetric] = useState('sleepHours');

  // AI Analysis state
  const [aiInsight, setAiInsight] = useState('');
  const [isAnalysing, setIsAnalysing] = useState(false);

  // Firestore snapshot listener for health_metrics
  useEffect(() => {
    if (!user || !db || dataSource !== 'live') return;

    const healthRef = collection(db, 'artifacts', 'auto-anki-app', 'users', user.uid, 'health_metrics');
    const unsubscribe = onSnapshot(healthRef, (snapshot) => {
      const docs = [];
      snapshot.forEach((doc) => {
        docs.push({ id: doc.id, ...doc.data() });
      });
      setLiveHealthData(docs);
    }, (error) => {
      console.error("Error fetching health metrics:", error);
    });

    return () => unsubscribe();
  }, [user, db, dataSource]);

  // Merge daily health metrics with daily study logs
  const mergedData = useMemo(() => {
    if (dataSource === 'mock') {
      return mockHealthData.slice(-timeRange).map(day => ({
        date: day.date,
        sleepHours: day.sleep_hours,
        sleepScore: day.sleep_score,
        workoutDuration: day.workout_duration,
        workout_type: day.workout_type,
        studyDuration: day.study_duration,
        cards: Math.round(day.study_duration * 0.5 + Math.random() * 20),
        questions: Math.round(day.study_duration * 0.3 + Math.random() * 10),
        origin: 'Mock'
      }));
    }

    const list = [];
    const today = new Date();

    for (let i = timeRange - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(today.getDate() - i);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const dayVal = String(d.getDate()).padStart(2, '0');
      const dateString = `${year}-${month}-${dayVal}`;

      // Find health document
      const healthDocObj = liveHealthData.find(doc => doc.id === dateString || doc.date === dateString);
      const healthDoc = healthDocObj || {
        sleep_hours: 0,
        sleep_score: 0,
        workout_type: 'None',
        workout_duration: 0
      };

      // Find study log document (studySessions maps date to log)
      const studyLog = studySessions && studySessions[dateString] ? studySessions[dateString] : {
        hours: 0,
        questions: 0,
        cards: 0,
        pages: 0,
        sessions: []
      };

      // Convert studied hours to minutes
      const studyDuration = (studyLog.hours || 0) * 60;
      const cardsCount = studyLog.cards || 0;
      const questionsCount = studyLog.questions || 0;
      const pagesCount = studyLog.pages || 0;

      // Determine the origin of health telemetry
      const origin = healthDocObj
        ? (healthDocObj.source === 'Simulator' ? 'Simulator' : 'Webhook')
        : (studyDuration > 0 ? 'App Log' : 'None');

      list.push({
        date: dateString,
        sleepHours: healthDoc.sleep_hours || 0,
        sleepScore: healthDoc.sleep_score || 0,
        workout_type: healthDoc.workout_type || 'None',
        workoutDuration: healthDoc.workout_duration || 0,
        studyDuration,
        cards: cardsCount,
        questions: questionsCount,
        pages: pagesCount,
        origin
      });
    }

    return list;
  }, [dataSource, liveHealthData, studySessions, timeRange]);

  // Aggregate workout comparison (Lifting vs Rest Days)
  const workoutComparisonData = useMemo(() => {
    const categories = {
      Lifting: { totalMinutes: 0, count: 0 },
      Rest: { totalMinutes: 0, count: 0 }
    };

    mergedData.forEach(day => {
      if (day.studyDuration > 0) {
        if (day.workout_type === 'Lifting') {
          categories.Lifting.totalMinutes += day.studyDuration;
          categories.Lifting.count += 1;
        } else if (day.workout_type === 'None') {
          categories.Rest.totalMinutes += day.studyDuration;
          categories.Rest.count += 1;
        }
      }
    });

    const liftingAvg = categories.Lifting.count > 0
      ? Math.round(categories.Lifting.totalMinutes / categories.Lifting.count)
      : 0;
    const restAvg = categories.Rest.count > 0
      ? Math.round(categories.Rest.totalMinutes / categories.Rest.count)
      : 0;

    return [
      { name: 'Lifting Days', averageStudy: liftingAvg, count: categories.Lifting.count },
      { name: 'Rest Days', averageStudy: restAvg, count: categories.Rest.count }
    ];
  }, [mergedData]);

  // Filter out days without health metrics logged to keep scatter clean in live mode
  const scatterChartData = useMemo(() => {
    if (dataSource === 'mock') return mergedData;
    return mergedData.filter(d => d.sleepHours > 0 || d.sleepScore > 0 || d.workoutDuration > 0);
  }, [mergedData, dataSource]);

  // Simulated Webhook writing directly to Firebase
  const handleSimulateWebhook = async () => {
    if (!user || !db) return;

    const tzoffset = (new Date()).getTimezoneOffset() * 60000;
    const todayStr = (new Date(Date.now() - tzoffset)).toISOString().split('T')[0];

    try {
      const healthDocRef = doc(db, 'artifacts', 'auto-anki-app', 'users', user.uid, 'health_metrics', todayStr);

      const simulatedPayload = {
        date: todayStr,
        sleep_hours: parseFloat((6.5 + Math.random() * 2.5).toFixed(1)),
        sleep_score: Math.round(75 + Math.random() * 20),
        workout_duration: Math.round(45 + Math.random() * 30),
        workout_type: Math.random() > 0.5 ? 'Lifting' : 'Cardio',
        timestamp: new Date().toISOString(),
        source: 'Simulator'
      };

      await setDoc(healthDocRef, simulatedPayload, { merge: true });
      alert(`🚀 Today's simulated webhook successfully written to Firestore!\n\nDate: ${todayStr}\nSleep: ${simulatedPayload.sleep_hours} hrs (Score: ${simulatedPayload.sleep_score})\nWorkout: ${simulatedPayload.workout_duration} mins (${simulatedPayload.workout_type})`);

      // Auto switch to live data source if not already selected to immediately show effect
      if (dataSource !== 'live') {
        setDataSource('live');
      }
    } catch (err) {
      console.error("Failed to simulate webhook:", err);
      alert("Error writing simulation to Firestore: " + err.message);
    }
  };

  // Gemini AI Analysis
  const handleAiAnalysis = async () => {
    if (isAnalysing) return;
    setIsAnalysing(true);
    setAiInsight('');
    try {
      const apiKey = geminiApiKey || '';
      if (!apiKey) {
        setAiInsight('⚠️ No Gemini API key configured. Please add your API key in Setup settings.');
        setIsAnalysing(false);
        return;
      }

      const studyDays = scatterChartData.filter(d => (d[activeStudyM.key] || 0) > 0);
      const avgStudy = studyDays.length > 0
        ? (studyDays.reduce((a, d) => a + (d[activeStudyM.key] || 0), 0) / studyDays.length).toFixed(1)
        : 0;

      const healthDays = scatterChartData.filter(d => (d[activeHealthM.key] || 0) > 0);
      const avgHealth = healthDays.length > 0
        ? (healthDays.reduce((a, d) => a + (d[activeHealthM.key] || 0), 0) / healthDays.length).toFixed(1)
        : 0;

      const prompt = `You are a medical student performance analyst. Analyze the following ${timeRange}-day correlation between ${activeStudyM.name} (avg: ${avgStudy}${activeStudyM.unit}) and ${activeHealthM.name} (avg: ${avgHealth}${activeHealthM.unit}) for a NEET PG / medical student. Data source: ${dataSource === 'mock' ? 'Sample mock data' : 'Live Firestore health logs'}. 

Data points (${scatterChartData.length} days): ${scatterChartData.slice(0, 10).map(d => `[${d.date}: ${activeStudyM.name}=${d[activeStudyM.key]}${activeStudyM.unit}, ${activeHealthM.name}=${d[activeHealthM.key]}${activeHealthM.unit}]`).join(', ')}${scatterChartData.length > 10 ? '...' : ''}

Workout days (Lifting): ${workoutComparisonData[0]?.count || 0}, avg study ${workoutComparisonData[0]?.averageStudy || 0} mins
Rest days: ${workoutComparisonData[1]?.count || 0}, avg study ${workoutComparisonData[1]?.averageStudy || 0} mins

Provide a concise, actionable 3-4 sentence analysis: (1) What does the correlation between ${activeStudyM.name} and ${activeHealthM.name} suggest? (2) One specific optimization tip for this student's recovery-study balance. Keep it medically grounded and motivational.`;

      const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });

      const data = await resp.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || 'No analysis returned.';
      setAiInsight(text);
    } catch (err) {
      setAiInsight('Error generating analysis: ' + err.message);
    }
    setIsAnalysing(false);
  };

  // Helper values for dynamic text rendering
  const activeStudyM = STUDY_METRICS[selectedStudyMetric];
  const activeHealthM = HEALTH_METRICS[selectedHealthMetric];

  return (
    <div className="flex-grow p-4 lg:p-6 flex flex-col gap-6 max-w-[1200px] mx-auto w-full overflow-y-auto pb-24 lg:pb-6 text-left">
      {/* Header Panel */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/40 backdrop-blur-md p-6 rounded-3xl border border-gray-200 shadow-sm">
        <div className="flex items-center gap-3.5">
          <div className="bg-gradient-to-tr from-pink-500 to-rose-500 text-white p-3 rounded-2xl shadow-lg shadow-rose-500/20">
            <Activity className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h2 className="text-xl font-black text-gray-900 tracking-tight leading-none">Correlation Dashboard</h2>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1.5">
              Analyze physical recovery triggers against daily cognitive & study outputs
            </p>
          </div>
        </div>

        {/* Action Panel: Simulator & Toggle */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Dev-only simulation button */}
          {import.meta.env.DEV && (
            <button
              onClick={handleSimulateWebhook}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-black uppercase tracking-wider rounded-xl bg-purple-600 hover:bg-purple-750 text-white shadow-md shadow-purple-600/10 transition-all duration-200"
              title="Push simulated sleep & workout document to Firestore for today"
            >
              <Terminal className="w-3.5 h-3.5" />
              Simulate Sync
            </button>
          )}

          {/* Time Range Selector */}
          <div className="flex items-center bg-gray-150 p-1 rounded-2xl border border-gray-200 shadow-inner shrink-0 text-[10px] font-black uppercase tracking-wider gap-0.5">
            {[
              { label: '3d', value: 3 },
              { label: '5d', value: 5 },
              { label: '7d', value: 7 },
              { label: '2w', value: 14 },
              { label: '1m', value: 30 },
              { label: '3m', value: 90 },
              { label: '6m', value: 180 },
            ].map(opt => (
              <button
                key={opt.value}
                onClick={() => setTimeRange(opt.value)}
                className={`px-2 py-1.5 rounded-xl transition-all duration-200 whitespace-nowrap ${timeRange === opt.value
                    ? 'bg-indigo-600 text-white shadow-sm font-black'
                    : 'text-gray-500 hover:text-gray-800'
                  }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

        </div>
      </div>

      {/* Dynamic Metric Selectors */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-white p-6 rounded-3xl border border-gray-200 shadow-sm">
        {/* Study Metric Selector */}
        <div className="flex flex-col gap-2.5">
          <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider">
            1. Select Study Metric (X-Axis)
          </span>
          <div className="grid grid-cols-4 gap-2">
            {Object.values(STUDY_METRICS).map((m) => (
              <button
                key={m.key}
                onClick={() => setSelectedStudyMetric(m.key)}
                className={`px-3 py-2.5 rounded-xl border text-center transition-all duration-200 ${selectedStudyMetric === m.key
                    ? 'bg-blue-600 border-blue-600 text-white font-extrabold text-[10px] uppercase tracking-wider shadow-md shadow-blue-600/15'
                    : 'bg-gray-50 border-gray-200 hover:bg-gray-100 text-gray-600 text-[10px] font-bold uppercase tracking-wider'
                  }`}
              >
                {m.name}
              </button>
            ))}
          </div>
        </div>

        {/* Health Metric Selector */}
        <div className="flex flex-col gap-2.5">
          <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider">
            2. Select Health Metric (Y-Axis)
          </span>
          <div className="grid grid-cols-3 gap-2">
            {Object.values(HEALTH_METRICS).map((m) => (
              <button
                key={m.key}
                onClick={() => setSelectedHealthMetric(m.key)}
                className={`px-3 py-2.5 rounded-xl border text-center transition-all duration-200 ${selectedHealthMetric === m.key
                    ? 'bg-pink-600 border-pink-600 text-white font-extrabold text-[10px] uppercase tracking-wider shadow-md shadow-pink-600/15'
                    : 'bg-gray-50 border-gray-200 hover:bg-gray-100 text-gray-600 text-[10px] font-bold uppercase tracking-wider'
                  }`}
              >
                {m.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Avg Sleep Duration</span>
            <h3 className="text-2xl font-black text-gray-800 mt-1">
              {(() => {
                const loggedSleepDays = mergedData.filter(d => (d.sleepHours || 0) > 0);
                return loggedSleepDays.length > 0
                  ? formatSleepHours(loggedSleepDays.reduce((acc, d) => acc + d.sleepHours, 0) / loggedSleepDays.length)
                  : '0 hrs';
              })()}
            </h3>
            <p className="text-[10px] text-emerald-600 font-bold mt-1">Target: 7.5 hrs</p>
          </div>
          <Moon className="w-8 h-8 text-indigo-500 opacity-80" />
        </div>

        <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Study Duration</span>
            <h3 className="text-2xl font-black text-gray-800 mt-1">
              {(() => {
                const loggedStudyDays = mergedData.filter(d => (d.studyDuration || 0) > 0);
                return loggedStudyDays.length > 0
                  ? (loggedStudyDays.reduce((acc, d) => acc + d.studyDuration, 0) / loggedStudyDays.length).toFixed(0)
                  : '0';
              })()} mins
            </h3>
            <p className="text-[10px] text-blue-600 font-bold mt-1">Daily Avg</p>
          </div>
          <Zap className="w-8 h-8 text-amber-500 opacity-80" />
        </div>

        <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Workout Logged</span>
            <h3 className="text-2xl font-black text-gray-800 mt-1">
              {mergedData.filter(d => d.workout_type !== 'None').length} / {mergedData.length} Days
            </h3>
            <p className="text-[10px] text-rose-600 font-bold mt-1">Active recovery focus</p>
          </div>
          <Dumbbell className="w-8 h-8 text-rose-500 opacity-80" />
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Dynamic Scatter Correlation Plot */}
        <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm flex flex-col gap-4">
          <div>
            <h3 className="font-extrabold text-gray-800 text-sm">
              Correlation: {activeStudyM.name} vs. {activeHealthM.name}
            </h3>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-1">
              Visualizing the relationship between selected daily inputs
            </p>
          </div>

          <div className="h-[300px] w-full mt-2">
            {scatterChartData.length === 0 ? (
              <div className="h-full w-full flex flex-col items-center justify-center text-gray-400 bg-gray-50 rounded-2xl border border-dashed border-gray-200 p-6 text-center">
                <Terminal className="w-8 h-8 mb-2 text-gray-300 animate-pulse" />
                <span className="text-xs font-bold uppercase tracking-wider text-gray-400">No Logged Correlation Data</span>
                <p className="text-[10px] text-gray-400 max-w-[240px] mt-1">
                  We need non-zero values for both "{activeStudyM.name}" and "{activeHealthM.name}" to plot this coordinate.
                </p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis
                    type="number"
                    dataKey={activeStudyM.key}
                    name={activeStudyM.name}
                    unit={activeStudyM.unit}
                    stroke="#9ca3af"
                    fontSize={10}
                    fontWeight="bold"
                    domain={[0, 'auto']}
                  />
                  <YAxis
                    type="number"
                    dataKey={activeHealthM.key}
                    name={activeHealthM.name}
                    unit={activeHealthM.unit}
                    stroke="#9ca3af"
                    fontSize={10}
                    fontWeight="bold"
                    domain={activeHealthM.key === 'sleepHours' ? [4, 11] : activeHealthM.key === 'sleepScore' ? [40, 100] : [0, 'auto']}
                  />
                  <ZAxis type="number" range={[60, 120]} />
                  <Tooltip
                    cursor={{ strokeDasharray: '3 3' }}
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-gray-900 text-white p-3 rounded-xl border border-gray-800 text-xs shadow-xl">
                            <p className="font-bold text-gray-400 mb-1">{data.date}</p>
                            <p>
                              <span className="font-semibold text-blue-400">{activeStudyM.name}:</span>{' '}
                              {data[activeStudyM.key]}{activeStudyM.unit}
                            </p>
                            <p>
                              <span className="font-semibold text-pink-400">{activeHealthM.name}:</span>{' '}
                              {activeHealthM.key === 'sleepHours'
                                ? formatSleepHours(data.sleepHours)
                                : `${data[activeHealthM.key]}${activeHealthM.unit}`}
                            </p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Legend verticalAlign="top" height={36} />
                  {activeHealthM.key === 'sleepHours' && (
                    <ReferenceLine y={6} stroke="#f87171" strokeDasharray="3 3" label={{ value: '6hr Critical Limit', fill: '#f87171', fontSize: 9, position: 'right', fontWeight: 'bold' }} />
                  )}
                  <Scatter name="Daily Log" data={scatterChartData} fill="#6366f1" />
                </ScatterChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="flex gap-2 items-start bg-indigo-50/50 p-3 rounded-2xl border border-indigo-100/30 text-xs text-indigo-700">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              **Insight:** Click selections above to dynamically shift axes. Notice trends of higher study output matching consistent sleep and recovery days.
            </p>
          </div>

          {/* Gemini AI Analysis */}
          <div className="border-t border-gray-100 pt-4">
            <button
              onClick={handleAiAnalysis}
              disabled={isAnalysing}
              className={`w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-xs font-black uppercase tracking-wider transition active:scale-95 shadow-sm ${isAnalysing
                  ? 'bg-purple-100 text-purple-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white hover:shadow-lg hover:shadow-purple-500/20'
                }`}
            >
              {isAnalysing ? (
                <><Loader className="w-4 h-4 animate-spin" /> Analysing with Gemini...</>
              ) : (
                <><Sparkles className="w-4 h-4" /> AI Analyse This Correlation</>
              )}
            </button>

            {aiInsight && (
              <div className="mt-3 bg-gradient-to-br from-purple-50 to-indigo-50 border border-purple-100 rounded-2xl p-4 text-xs text-purple-900 leading-relaxed font-semibold space-y-1 animate-in slide-in-from-bottom duration-300">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-3.5 h-3.5 text-purple-500" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-purple-500">Gemini AI Analysis</span>
                  <span className="text-[9px] text-purple-400 ml-auto">{activeStudyM.name} vs {activeHealthM.name} · {timeRange}d</span>
                </div>
                <p className="whitespace-pre-wrap">{aiInsight}</p>
              </div>
            )}
          </div>
        </div>

        {/* Chart 2: Total Study Duration on Lifting Days vs Rest Days */}
        <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm flex flex-col gap-4">
          <div>
            <h3 className="font-extrabold text-gray-800 text-sm">Study Hours: Lifting Days vs. Rest Days</h3>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-1">
              Comparing average daily study duration (minutes)
            </p>
          </div>

          <div className="h-[300px] w-full mt-2">
            {workoutComparisonData.reduce((acc, c) => acc + c.averageStudy, 0) === 0 ? (
              <div className="h-full w-full flex flex-col items-center justify-center text-gray-400 bg-gray-50 rounded-2xl border border-dashed border-gray-200 p-6 text-center">
                <Dumbbell className="w-8 h-8 mb-2 text-gray-300 font-bold" />
                <span className="text-xs font-bold uppercase tracking-wider text-gray-400">No Study Logs Recorded</span>
                <p className="text-[10px] text-gray-400 max-w-[200px] mt-1">
                  Once daily study hours are logged, comparative metrics will display here.
                </p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={workoutComparisonData} margin={{ top: 20, right: 20, bottom: 20, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis
                    dataKey="name"
                    stroke="#9ca3af"
                    fontSize={10}
                    fontWeight="bold"
                  />
                  <YAxis
                    stroke="#9ca3af"
                    fontSize={10}
                    fontWeight="bold"
                    unit=" min"
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-gray-900 text-white p-3 rounded-xl border border-gray-800 text-xs shadow-xl">
                            <p className="font-bold text-gray-300">{data.name}</p>
                            <p className="mt-1"><span className="font-semibold text-rose-400">Avg Study:</span> {data.averageStudy} mins (~{(data.averageStudy / 60).toFixed(1)} hrs)</p>
                            <p className="text-[10px] text-gray-400 mt-0.5">Sample: {data.count} days</p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar dataKey="averageStudy" radius={[12, 12, 0, 0]}>
                    {workoutComparisonData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={entry.name.includes('Lifting') ? '#ec4899' : '#06b6d4'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="flex gap-2 items-start bg-rose-50/50 p-3 rounded-2xl border border-rose-100/30 text-xs text-rose-700">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              **Insight:** Lifting days reflect slightly lower study durations, but help maintain study consistency and long-term stamina.
            </p>
          </div>
        </div>
      </div>

      {/* Daily Metrics breakdown log */}
      <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm flex flex-col gap-4">
        <div>
          <h3 className="font-extrabold text-gray-800 text-sm">Daily Recovery & Study Log</h3>
          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-1">
            Historical day-by-day telemetry matching sleep tracking, workouts, and logged studies
          </p>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-gray-100">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="p-3.5 font-black uppercase text-gray-400 text-[10px] tracking-wider">Date</th>
                <th className="p-3.5 font-black uppercase text-gray-400 text-[10px] tracking-wider">Origin</th>
                <th className="p-3.5 font-black uppercase text-gray-400 text-[10px] tracking-wider">Sleep Details</th>
                <th className="p-3.5 font-black uppercase text-gray-400 text-[10px] tracking-wider">Workout Details</th>
                <th className="p-3.5 font-black uppercase text-gray-400 text-[10px] tracking-wider">Study Output</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {mergedData
                .slice()
                .reverse()
                .filter(day => day.sleepHours > 0 || day.sleepScore > 0 || day.workoutDuration > 0 || day.studyDuration > 0)
                .map(day => (
                  <tr key={day.date} className="hover:bg-gray-50/50 transition">
                    <td className="p-3.5 font-bold text-gray-800 whitespace-nowrap">{day.date}</td>
                    <td className="p-3.5 whitespace-nowrap">
                      {day.origin === 'Mock' && (
                        <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-blue-50 text-blue-650 border border-blue-100">Mock Data</span>
                      )}
                      {day.origin === 'Simulator' && (
                        <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-purple-50 text-purple-650 border border-purple-100">Simulator</span>
                      )}
                      {day.origin === 'Webhook' && (
                        <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-50 text-emerald-650 border border-emerald-100">Live Sync</span>
                      )}
                      {day.origin === 'App Log' && (
                        <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-gray-50 text-gray-500 border border-gray-200">Study Log</span>
                      )}
                    </td>
                    <td className="p-3.5 text-gray-600 whitespace-nowrap">
                      {day.sleepHours > 0 ? (
                        <div className="flex items-center gap-2">
                          <Moon className="w-3.5 h-3.5 text-indigo-500" />
                          <span>{formatSleepHours(day.sleepHours)} <span className="text-gray-400">({day.sleepScore} pts)</span></span>
                        </div>
                      ) : (
                        <span className="text-gray-300 font-medium">No sleep data</span>
                      )}
                    </td>
                    <td className="p-3.5 text-gray-600 whitespace-nowrap">
                      {day.workoutDuration > 0 || day.workout_type !== 'None' ? (
                        <div className="flex items-center gap-2">
                          <Dumbbell className="w-3.5 h-3.5 text-rose-500" />
                          <span>{day.workoutDuration} mins <span className="text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-rose-50 text-rose-600">{day.workout_type}</span></span>
                        </div>
                      ) : (
                        <span className="text-gray-300 font-medium">No workout data</span>
                      )}
                    </td>
                    <td className="p-3.5 text-gray-600 whitespace-nowrap">
                      {day.studyDuration > 0 ? (
                        <div className="flex items-center gap-2">
                          <Zap className="w-3.5 h-3.5 text-amber-500" />
                          <span>{day.studyDuration} mins <span className="text-gray-400">({day.cards} cards / {day.questions} qns / {day.pages || 0} pgs)</span></span>
                        </div>
                      ) : (
                        <span className="text-gray-300 font-medium">No study logs</span>
                      )}
                    </td>
                  </tr>
                ))}
              {mergedData.filter(day => day.sleepHours > 0 || day.sleepScore > 0 || day.workoutDuration > 0 || day.studyDuration > 0).length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-gray-400 font-medium">
                    No active daily metrics logged yet. Try simulating a sync above!
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
