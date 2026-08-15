import React, { useState, useCallback, useEffect } from 'react';
import {
  X, Check, RefreshCw, Eye, EyeOff, Settings, Music, Quote, BarChart,
  Layout, Plus, Code2, Save, GripVertical, Volume2, VolumeX,
  Minimize2, Timer, Play, Pause, RotateCcw, ImageIcon, MonitorPlay,
  Clock, CheckCircle, Flame, Move, Edit2
} from 'lucide-react';

// ─── Constants ────────────────────────────────────────────────────────────────

const STATIC_BG_GRADIENTS = {
  sunset:        'linear-gradient(135deg,#f43f5e,#ec4899,#f59e0b)',
  cyberpunk:     'linear-gradient(135deg,#1e1b4b,#4c1d95,#701a75)',
  aurora:        'linear-gradient(135deg,#042f2e,#065f46,#0f172a)',
  midnight:      'linear-gradient(135deg,#0f172a,#1e1b4b,#000000)',
  pitchBlack:    '#000000',
  shiftingCosmic:'linear-gradient(135deg,#312e81,#6d28d9,#9d174d)',
  solarFlare:    'linear-gradient(135deg,#d97706,#b91c1c,#eab308)',
  glacierMint:   'linear-gradient(135deg,#083344,#0f766e,#052e16)',
  cyberLime:     'linear-gradient(135deg,#052e16,#3f6212,#18181b)',
  royalAmethyst: 'linear-gradient(135deg,#2e1065,#86198f,#1e1b4b)',
};

const BG_CATEGORIES = {
  Nature: [
    { id:'yt_forest_rain',     label:'Forest Rain',        videoId:'qRTVg8HHzUo', thumb:'https://img.youtube.com/vi/qRTVg8HHzUo/mqdefault.jpg' },
    { id:'yt_northern_lights', label:'Northern Lights',    videoId:'n339V89pL-U', thumb:'https://img.youtube.com/vi/n339V89pL-U/mqdefault.jpg' },
    { id:'yt_sunset_beach',    label:'Sunset Beach',       videoId:'npeE3106nZc', thumb:'https://img.youtube.com/vi/npeE3106nZc/mqdefault.jpg' },
  ],
  Anime: [
    { id:'yt_lofi_girl',       label:'Lofi Girl Study',    videoId:'5qap5aO4i9A', thumb:'https://img.youtube.com/vi/5qap5aO4i9A/mqdefault.jpg' },
    { id:'yt_tokyo_rain',      label:'Tokyo Rain',         videoId:'mPZkdNFkNps', thumb:'https://img.youtube.com/vi/mPZkdNFkNps/mqdefault.jpg' },
    { id:'yt_cherry_blossoms', label:'Cherry Blossoms',    videoId:'Kz39-S6v1H4', thumb:'https://img.youtube.com/vi/Kz39-S6v1H4/mqdefault.jpg' },
  ],
  Library: [
    { id:'yt_hogwarts',        label:'Hogwarts Library',   videoId:'J340Gf8wBfM', thumb:'https://img.youtube.com/vi/J340Gf8wBfM/mqdefault.jpg' },
    { id:'yt_classic_study',   label:'Classic Study Hall', videoId:'CHFif_y2TyM', thumb:'https://img.youtube.com/vi/CHFif_y2TyM/mqdefault.jpg' },
  ],
  Cafe: [
    { id:'yt_parisian_cafe',   label:'Parisian Café',      videoId:'c0_ejQQcrwI', thumb:'https://img.youtube.com/vi/c0_ejQQcrwI/mqdefault.jpg' },
    { id:'yt_coffee_rain',     label:'Coffee Shop Rain',   videoId:'Dx5qFachd3A', thumb:'https://img.youtube.com/vi/Dx5qFachd3A/mqdefault.jpg' },
  ],
  Desk: [
    { id:'yt_aesthetic_desk',  label:'Aesthetic Study Desk', videoId:'yR73_uT9rU8', thumb:'https://img.youtube.com/vi/yR73_uT9rU8/mqdefault.jpg' },
  ],
  City: [
    { id:'yt_cyber_tokyo',     label:'Cyber Tokyo',        videoId:'5Wqea5g8kig', thumb:'https://img.youtube.com/vi/5Wqea5g8kig/mqdefault.jpg' },
  ],
  Colors: Object.entries(STATIC_BG_GRADIENTS).map(([k]) => ({ id:k, label:k.replace(/([A-Z])/g,' $1').trim(), videoId:null })),
  Other: [
    { id:'yt_earth_space',     label:'Earth from Space',   videoId:'P7n2D119jcw', thumb:'https://img.youtube.com/vi/P7n2D119jcw/mqdefault.jpg' },
  ],
};

const SOUND_TRACKS = [
  { id:'lofi',      label:'🌠 LoFi Beats',        videoId:'Dx5qFachd3A' },
  { id:'nature',    label:'🌿 Nature Sounds',      videoId:'3HDFg_rOqgA' },
  { id:'rain',      label:'💧 Rain Sounds',        videoId:'e29S7kIvx40' },
  { id:'fireplace', label:'🔥 Fireplace',          videoId:'L_LUpnjgPso' },
  { id:'library',   label:'📚 Library Ambience',   videoId:'CHFif_y2TyM' },
  { id:'piano',     label:'🎹 Piano Music',        videoId:'3s7c1V26X6A' },
  { id:'jazz',      label:'🎷 Jazz Music',         videoId:'H4128N6s4aE' },
  { id:'ghibli',    label:'🐉 Studio Ghibli',      videoId:'yR73_uT9rU8' },
  { id:'binaural',  label:'🧠 Binaural Beats',     videoId:'WPni755-kBI' },
  { id:'coffee',    label:'☕ Coffee Shop',        videoId:'c0_ejQQcrwI' },
];

const STUDY_QUOTES = [
  { text:"Real change, enduring change, happens one step at a time.", author:"Ruth Bader Ginsburg" },
  { text:"The secret of getting ahead is getting started.", author:"Mark Twain" },
  { text:"Don't watch the clock; do what it does. Keep going.", author:"Sam Levenson" },
  { text:"Success is the sum of small efforts, repeated day in and day out.", author:"Robert Collier" },
  { text:"Education is the most powerful weapon which you can use to change the world.", author:"Nelson Mandela" },
  { text:"The beautiful thing about learning is that nobody can take it away from you.", author:"B.B. King" },
  { text:"Strive for progress, not perfection.", author:"Unknown" },
  { text:"Perseverance is not a long race; it is many short races one after the other.", author:"Walter Elliot" },
  { text:"Your future self is watching you right now through your memories.", author:"Aubrey de Grey" },
  { text:"It always seems impossible until it's done.", author:"Nelson Mandela" },
];

const OBS_CSS_TEMPLATE = `/* OBS Default Browser Source CSS */
body {
  background-color: rgba(0, 0, 0, 0);
  margin: 0;
  overflow: hidden;
}
* { box-sizing: border-box; }`;

// ─── Helpers: YouTube & Time Parsers ──────────────────────────────────────────
export const parseYouTubeVideoId = (urlOrId) => {
  if (!urlOrId) return '';
  const trimmed = urlOrId.trim();
  if (trimmed.length === 11) return trimmed;
  
  // Standard Regex for various youtube URLs
  const regExp = /^.*(?:(?:youtu\.be\/|v\/|vi\/|u\/\w\/|embed\/|shorts\/)|(?:(?:watch)?\?vi?=|&vi?=))([^#\&\?]*).*/;
  const match = trimmed.match(regExp);
  if (match && match[1] && match[1].length === 11) {
    return match[1];
  }
  
  // Fallback scanner for any 11-character block
  const fallback = trimmed.match(/[a-zA-Z0-9_-]{11}/);
  if (fallback) {
    return fallback[0];
  }
  return trimmed;
};

export const parseTimeToSeconds = (timeStr) => {
  if (!timeStr) return 0;
  const clean = timeStr.trim();
  if (/^\d+$/.test(clean)) return parseInt(clean, 10);
  
  const parts = clean.split(':').map(Number);
  if (parts.some(isNaN)) return 0;
  
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return 0;
};

// ─── Helper: Control Button ────────────────────────────────────────────────────
function CtrlBtn({ panelId, activePanel, icon: Icon, label, onToggle }) {
  const isActive = activePanel === panelId;
  return (
    <button
      onClick={() => onToggle(panelId)}
      title={label}
      className={`w-10 h-10 flex items-center justify-center rounded-xl border transition-all active:scale-95 ${
        isActive
          ? 'bg-white text-slate-900 border-white shadow-lg shadow-white/20'
          : 'bg-black/40 text-white border-white/15 hover:bg-white/20 hover:border-white/30 backdrop-blur-md'
      }`}
    >
      <Icon className="w-4.5 h-4.5" style={{ width: 18, height: 18 }} />
    </button>
  );
}

// ─── Panel: Background ────────────────────────────────────────────────────────
function BgPanel({
  fsYoutubeVideoId, setFsYoutubeVideoId,
  fsBgCategory, setFsBgCategory,
  fullscreenTimerBg, handleSetFullscreenTimerBg,
  fsBgVideoVolume, setFsBgVideoVolume,
  fsBgVideoBlur, setFsBgVideoBlur,
  fsBgVideoStartTime, setFsBgVideoStartTime,
  bgCategories, onUpdateBgItem, onAddBgItem, onClose
}) {
  const [customInput, setCustomInput] = useState('');
  const [editItemId, setEditItemId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editVideoId, setEditVideoId] = useState('');
  const [editStartTime, setEditStartTime] = useState('');
  const [addCategory, setAddCategory] = useState('Nature');
  const [addName, setAddName] = useState('');
  const [addUrl, setAddUrl] = useState('');
  const [addStartTime, setAddStartTime] = useState('');

  // Find selected background details
  const selectedItem = Object.values(bgCategories).flat().find(item => item.videoId && (item.videoId === fsYoutubeVideoId || (!fsYoutubeVideoId && item.id === fullscreenTimerBg)));

  useEffect(() => {
    if (selectedItem) {
      setEditItemId(selectedItem.id);
      setEditName(selectedItem.label);
      setEditVideoId(selectedItem.videoId ? `https://www.youtube.com/watch?v=${selectedItem.videoId}` : '');
      setEditStartTime(selectedItem.startTime || '');
    } else {
      setEditItemId(null);
    }
  }, [selectedItem, fsYoutubeVideoId, fullscreenTimerBg]);

  return (
    <div className="w-[280px] bg-[#0f0f1a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
      <PanelHeader icon={ImageIcon} label="Background" onClose={onClose} />
      {/* Category tabs */}
      <div className="px-3 pt-3 flex flex-wrap gap-1.5">
        {Object.keys(bgCategories).map(cat => (
          <button key={cat} onClick={() => setFsBgCategory(cat)}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition ${fsBgCategory === cat ? 'bg-white text-slate-900' : 'bg-white/10 text-slate-300 hover:bg-white/20'}`}
          >{cat}</button>
        ))}
      </div>
      {/* Grid */}
      <div className="p-3 grid grid-cols-3 gap-2 max-h-48 overflow-y-auto">
        {(bgCategories[fsBgCategory] || []).map(item => {
          const isSelected = item.videoId ? fsYoutubeVideoId === item.videoId : (!fsYoutubeVideoId && fullscreenTimerBg === item.id);
          return (
            <button key={item.id} onClick={() => {
              if (item.videoId) {
                setFsYoutubeVideoId(item.videoId);
                setFsBgVideoStartTime(item.startTime || '');
              }
              else {
                setFsYoutubeVideoId('');
                setFsBgVideoStartTime('');
                handleSetFullscreenTimerBg(item.id);
              }
            }}
              className={`relative aspect-video rounded-xl overflow-hidden border-2 transition ${isSelected ? 'border-white' : 'border-transparent hover:border-white/40'}`}
            >
              {item.thumb
                ? <img src={item.thumb} alt={item.label} className="w-full h-full object-cover" />
                : <div className="w-full h-full" style={{ background: STATIC_BG_GRADIENTS[item.id] || '#222' }} />}
              {isSelected && <div className="absolute inset-0 bg-black/30 flex items-center justify-center"><Check className="w-4 h-4 text-white" /></div>}
              <div className="absolute bottom-0 inset-x-0 bg-black/60 px-1 py-0.5 text-[8px] text-white font-bold truncate">{item.label}</div>
            </button>
          );
        })}
      </div>
      {/* Custom YouTube */}
      <div className="px-3 pb-3 space-y-2 border-t border-white/10 pt-3">
        <div className="flex items-center gap-1.5 text-[10px] font-black text-slate-400 uppercase tracking-wider">
          <MonitorPlay className="w-3.5 h-3.5 text-red-400" /> YouTube Video
        </div>
        <div className="flex gap-2">
          <input type="text" placeholder="Paste YouTube link or ID..." value={customInput} onChange={e => setCustomInput(e.target.value)}
            className="flex-grow bg-white/10 border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-white placeholder-slate-500 outline-none focus:border-white/30"
          />
          <button onClick={() => {
            const vid = parseYouTubeVideoId(customInput);
            if (vid.length === 11) {
              setFsYoutubeVideoId(vid);
              setFsBgVideoStartTime('');
              setCustomInput('');
            }
          }} className="px-3 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-black transition">Set</button>
        </div>
        
        {/* Controls: Sound & Blur sliders */}
        <div className="space-y-2.5 pt-1.5 border-t border-white/5">
          <SoundSlider icon={Volume2} label="Video Sound" value={fsBgVideoVolume} onChange={setFsBgVideoVolume} />
          
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] text-slate-400 font-bold">
              <span>Video Blur</span>
              <span>{fsBgVideoBlur}px</span>
            </div>
            <div className="flex items-center gap-2">
              <input type="range" min="0" max="24" value={fsBgVideoBlur} onChange={e => setFsBgVideoBlur(Number(e.target.value))}
                className="flex-grow h-1 cursor-pointer rounded-full appearance-none bg-white/20 accent-blue-400" />
            </div>
          </div>
        </div>
      </div>
      {/* Edit Form */}
      {editItemId && (
        <div className="px-3 pb-3 border-t border-white/10 pt-3 space-y-2">
          <div className="flex items-center gap-1 text-[9px] font-black text-slate-400 uppercase tracking-wider">
            <Edit2 className="w-3 h-3 text-blue-400" /> Edit Backdrop (Cloud)
          </div>
          <div className="space-y-1.5">
            <input type="text" value={editName} onChange={e => setEditName(e.target.value)}
              placeholder="Display Name" className="w-full bg-white/10 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-white/30" />
            <input type="text" value={editVideoId} onChange={e => setEditVideoId(e.target.value)}
              placeholder="YouTube Video URL" className="w-full bg-white/10 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs font-mono text-white outline-none focus:border-white/30" />
            <input type="text" value={editStartTime} onChange={e => setEditStartTime(e.target.value)}
              placeholder="Start Time (e.g. 01:05:00)" className="w-full bg-white/10 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs font-mono text-white outline-none focus:border-white/30" />
            <button onClick={() => onUpdateBgItem(editItemId, editName, editVideoId, editStartTime)}
              className="w-full py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-[10px] font-black uppercase tracking-wider transition active:scale-95">
              Save Details to Cloud
            </button>
          </div>
        </div>
      )}
      {/* Add Form */}
      <div className="px-3 pb-3 border-t border-white/10 pt-3 space-y-2">
        <div className="flex items-center gap-1.5 text-[9px] font-black text-slate-400 uppercase tracking-wider">
          <Plus className="w-3 h-3 text-emerald-400" /> Add Backdrop (Cloud)
        </div>
        <div className="space-y-1.5">
          <select value={addCategory} onChange={e => setAddCategory(e.target.value)}
            className="w-full bg-white/10 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-white/30 cursor-pointer">
            {Object.keys(bgCategories).filter(c => c !== 'Colors').map(cat => (
              <option key={cat} value={cat} className="bg-[#0f0f1a] text-white">{cat}</option>
            ))}
          </select>
          <input type="text" placeholder="Display Name (e.g. Lofi Cozy Cabin)" value={addName} onChange={e => setAddName(e.target.value)}
            className="w-full bg-white/10 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-white/30" />
          <input type="text" placeholder="YouTube Video URL or ID" value={addUrl} onChange={e => setAddUrl(e.target.value)}
            className="w-full bg-white/10 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs font-mono text-white outline-none focus:border-white/30" />
          <input type="text" placeholder="Start Time (e.g. 00:05:30)" value={addStartTime} onChange={e => setAddStartTime(e.target.value)}
            className="w-full bg-white/10 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs font-mono text-white outline-none focus:border-white/30" />
          <button onClick={() => {
            if (!addUrl.trim()) return;
            onAddBgItem(addCategory, addName, addUrl, addStartTime);
            setAddName('');
            setAddUrl('');
            setAddStartTime('');
          }} className="w-full py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[10px] font-black uppercase tracking-wider transition active:scale-95">
            Add Backdrop to Collection
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Panel: Sound Mixer ────────────────────────────────────────────────────────
function SoundsPanel({ fsSoundVolumes, setFsSoundVolumes, fsBgVideoVolume, setFsBgVideoVolume, onClose }) {
  return (
    <div className="w-72 bg-[#0f0f1a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
      <PanelHeader icon={Music} label="Sound Mixer" onClose={onClose} />
      <div className="p-4 space-y-4 max-h-[420px] overflow-y-auto">
        <div className="space-y-1.5">
          <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider">Original Video Sound</span>
          <SoundSlider icon={Volume2} label="" value={fsBgVideoVolume} onChange={setFsBgVideoVolume} />
        </div>
        {SOUND_TRACKS.map(track => (
          <div key={track.id} className="space-y-1">
            <span className="text-[11px] font-bold text-slate-300">{track.label}</span>
            <SoundSlider
              icon={Volume2}
              label=""
              value={fsSoundVolumes[track.id] ?? 0}
              onChange={val => setFsSoundVolumes(prev => ({ ...prev, [track.id]: val }))}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function SoundSlider({ label, value, onChange }) {
  const muted = value === 0;
  return (
    <div className="flex items-center gap-2">
      <button onClick={() => onChange(muted ? 40 : 0)} className="text-slate-400 hover:text-white transition shrink-0">
        {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
      </button>
      {label && <span className="text-[10px] text-slate-400 font-bold whitespace-nowrap">{label}</span>}
      <input type="range" min="0" max="100" value={value} onChange={e => onChange(Number(e.target.value))}
        className="flex-grow h-1 cursor-pointer rounded-full appearance-none bg-white/20 accent-blue-400" />
      <span className="text-[9px] font-mono text-slate-500 w-7 text-right">{value}%</span>
    </div>
  );
}

// ─── Panel: Quotes ────────────────────────────────────────────────────────────
function QuotesPanel({ fsQuoteVisible, setFsQuoteVisible, onShuffle, fsQuoteShuffleInterval, setFsQuoteShuffleInterval, onClose }) {
  return (
    <div className="w-56 bg-[#0f0f1a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
      <PanelHeader icon={Quote} label="Motivational Quote" onClose={onClose} />
      <div className="p-3 space-y-2">
        <PanelAction icon={RefreshCw} label="Shuffle Quote" onClick={onShuffle} />
        <PanelAction icon={fsQuoteVisible ? EyeOff : Eye} label={fsQuoteVisible ? 'Hide Quote' : 'Show Quote'} onClick={() => setFsQuoteVisible(v => !v)} />
        
        {/* Shuffle Interval Selector */}
        <div className="space-y-1.5 px-3 py-2 bg-white/5 rounded-xl border border-white/5">
          <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">Auto Shuffle</label>
          <select
            value={fsQuoteShuffleInterval || 'off'}
            onChange={e => setFsQuoteShuffleInterval(e.target.value)}
            className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-xs text-white outline-none cursor-pointer font-bold"
          >
            <option value="off" className="bg-[#0f0f1a]">Off</option>
            <option value="10s" className="bg-[#0f0f1a]">Every 10s</option>
            <option value="30s" className="bg-[#0f0f1a]">Every 30s</option>
            <option value="1m" className="bg-[#0f0f1a]">Every 1m</option>
            <option value="5m" className="bg-[#0f0f1a]">Every 5m</option>
            <option value="10m" className="bg-[#0f0f1a]">Every 10m</option>
            <option value="15m" className="bg-[#0f0f1a]">Every 15m</option>
            <option value="30m" className="bg-[#0f0f1a]">Every 30m</option>
          </select>
        </div>
      </div>
    </div>
  );
}

// ─── Panel: Stats ─────────────────────────────────────────────────────────────
function StatsPanel({ todayLog, timerState, todayTasks, currentStreak, onClose }) {
  const hours = Number(todayLog?.hours || 0);
  const pomRounds = timerState?.completedRounds || 0;
  const totalTasks = todayTasks.length;
  const doneTasks = todayTasks.filter(t => t.completed).length;
  const stats = [
    { label:'Hours Today', value:`${hours.toFixed(1)}h`, Icon:Clock },
    { label:'Pomodoros', value:pomRounds, Icon:Timer },
    { label:'Tasks Done', value:`${doneTasks}/${totalTasks}`, Icon:CheckCircle },
    { label:'Streak', value:`${currentStreak}d`, Icon:Flame },
  ];
  return (
    <div className="w-64 bg-[#0f0f1a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
      <PanelHeader icon={BarChart} label="Study Stats" onClose={onClose} />
      <div className="p-3 grid grid-cols-2 gap-2.5">
        {stats.map(({ label, value, Icon }) => (
          <div key={label} className="bg-white/5 rounded-xl p-3 border border-white/5">
            <div className="flex items-center gap-1.5 mb-1">
              <Icon className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider">{label}</span>
            </div>
            <div className="text-lg font-black text-white">{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Panel: Timer Settings ────────────────────────────────────────────────────
function TimerSettingsPanel({
  activeType, isRunning, isIdle, fullscreenTimerStyle,
  pomodoroFocusMins, setPomodoroFocusMins,
  pomodoroBreakMins, setPomodoroBreakMins,
  pomodoroLongBreakMins, setPomodoroLongBreakMins,
  pomodoroTargetRounds, setPomodoroTargetRounds,
  customTimerHours, setCustomTimerHours,
  customTimerMins, setCustomTimerMins,
  customTimerSecs, setCustomTimerSecs,
  showMilliseconds, setShowMilliseconds,
  handleSwitchTimerType, handleSetFullscreenTimerStyle,
  handleStartPomodoro, handleStartCountdownTimer, handleStartStopwatchTimer,
  handlePauseActiveTimer, handleResumeActiveTimer, handleResetActiveTimer, handleRecordStopwatchLap,
  fsTimerFontSize, setFsTimerFontSize,
  fsTimerOpacity, setFsTimerOpacity,
  fsTimerBlendMode, handleSetFullscreenTimerBlendMode,
  handleSaveActiveTimerSession,
  handleResetTimerPosition,
  onClose,
}) {
  return (
    <div className="w-80 bg-[#0f0f1a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
      <PanelHeader icon={Settings} label="Timer Settings" onClose={onClose} />
      <div className="p-4 space-y-4 max-h-[80vh] overflow-y-auto">
        {/* Type switch */}
        <div>
          <Label>Timer Type</Label>
          <div className="grid grid-cols-3 gap-1.5 bg-white/5 p-1 rounded-xl mt-1.5">
            {['pomodoro','timer','stopwatch'].map(type => (
              <button key={type} onClick={() => handleSwitchTimerType(type)}
                className={`py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition ${activeType === type ? 'bg-white text-slate-900' : 'text-slate-400 hover:text-white'}`}
              >{type}</button>
            ))}
          </div>
        </div>

        {/* Pomodoro */}
        {activeType === 'pomodoro' && (
          <>
            <div>
              <Label>Focus Presets</Label>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {[15,25,30,45,60].map(m => (
                  <button key={m} onClick={() => handleStartPomodoro(m, pomodoroBreakMins, pomodoroLongBreakMins, pomodoroTargetRounds, false)}
                    className={`px-3 py-1.5 rounded-xl text-[10px] font-black border transition ${pomodoroFocusMins === m ? 'bg-white text-slate-900 border-white' : 'bg-white/10 border-white/10 text-slate-300 hover:bg-white/20'}`}
                  >{m}m</button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[
                ['Focus (min)', pomodoroFocusMins, setPomodoroFocusMins],
                ['Short Break (min)', pomodoroBreakMins, setPomodoroBreakMins],
                ['Long Break (min)', pomodoroLongBreakMins, setPomodoroLongBreakMins],
                ['Rounds', pomodoroTargetRounds, setPomodoroTargetRounds],
              ].map(([label, val, set]) => (
                <NumberInput key={label} label={label} value={val} onChange={v => set(Math.max(1, v))} />
              ))}
            </div>
          </>
        )}

        {/* Countdown timer */}
        {activeType === 'timer' && (
          <div>
            <Label>Duration</Label>
            <div className="grid grid-cols-3 gap-2 mt-1.5">
              {[['Hours', customTimerHours, setCustomTimerHours], ['Minutes', customTimerMins, setCustomTimerMins], ['Seconds', customTimerSecs, setCustomTimerSecs]].map(([l, v, s]) => (
                <NumberInput key={l} label={l} value={v} onChange={n => s(Math.max(0, n))} />
              ))}
            </div>
          </div>
        )}

        {/* Display style */}
        <div>
          <Label>Display Style</Label>
          <div className="flex gap-2 mt-1.5">
            {[{id:'regular',label:'🔢 Digital'},{id:'flip',label:'⏳ Flip Clock'}].map(s => (
              <button key={s.id} onClick={() => handleSetFullscreenTimerStyle(s.id)}
                className={`flex-1 py-2 rounded-xl text-[10px] font-black border transition ${fullscreenTimerStyle === s.id ? 'bg-white text-slate-900 border-white' : 'bg-white/10 border-white/10 text-slate-300 hover:bg-white/20'}`}
              >{s.label}</button>
            ))}
          </div>
        </div>

        {/* Stopwatch ms toggle */}
        {activeType === 'stopwatch' && (
          <button onClick={() => setShowMilliseconds(v => !v)}
            className={`w-full py-2 rounded-xl text-[10px] font-black border transition ${showMilliseconds ? 'bg-white text-slate-900 border-white' : 'bg-white/10 border-white/10 text-slate-300 hover:bg-white/20'}`}
          >⏱️ {showMilliseconds ? 'Hide' : 'Show'} Milliseconds</button>
        )}

        {/* Timer Size & Opacity Customizer */}
        <div className="space-y-3 pt-3 border-t border-white/10">
          <Label>Timer Styling</Label>
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] text-slate-400 font-bold">
              <span>Font Size</span>
              <span>{fsTimerFontSize}px</span>
            </div>
            <input type="range" min="24" max="180" value={fsTimerFontSize} onChange={e => setFsTimerFontSize(Number(e.target.value))}
              className="w-full h-1 cursor-pointer rounded-full appearance-none bg-white/20 accent-blue-400" />
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] text-slate-400 font-bold">
              <span>Opacity</span>
              <span>{fsTimerOpacity}%</span>
            </div>
            <input type="range" min="10" max="100" value={fsTimerOpacity} onChange={e => setFsTimerOpacity(Number(e.target.value))}
              className="w-full h-1 cursor-pointer rounded-full appearance-none bg-white/20 accent-blue-400" />
          </div>

          {/* Timer Blend Mode */}
          <div className="space-y-1">
            <Label>Timer Blend Mode</Label>
            <select
              value={fsTimerBlendMode || 'normal'}
              onChange={e => handleSetFullscreenTimerBlendMode(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-2.5 py-1.5 text-xs text-white outline-none font-bold cursor-pointer transition focus:border-blue-400/50"
            >
              {['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity'].map(bm => (
                <option key={bm} value={bm} className="bg-slate-900 text-white font-bold">{bm}</option>
              ))}
            </select>
          </div>

          <GhostBtn onClick={handleResetTimerPosition}>
            Reset Size & Position
          </GhostBtn>
        </div>

        {/* Actions */}
        <div className="pt-3 border-t border-white/10 space-y-2">
          {isIdle ? (
            activeType === 'pomodoro' ? (
              <ActionBtn color="orange" onClick={() => handleStartPomodoro(pomodoroFocusMins, pomodoroBreakMins, pomodoroLongBreakMins, pomodoroTargetRounds, true)}>
                <Play className="w-4 h-4 fill-white" /> Start Focus
              </ActionBtn>
            ) : activeType === 'timer' ? (
              <ActionBtn color="indigo" onClick={() => { const t = customTimerHours*3600+customTimerMins*60+customTimerSecs; handleStartCountdownTimer(t||600); }}>
                <Play className="w-4 h-4 fill-white" /> Start Timer
              </ActionBtn>
            ) : (
              <ActionBtn color="emerald" onClick={handleStartStopwatchTimer}>
                <Play className="w-4 h-4 fill-white" /> Start Stopwatch
              </ActionBtn>
            )
          ) : (
            <>
              {isRunning ? (
                <ActionBtn color="amber" onClick={handlePauseActiveTimer}>
                  <Pause className="w-4 h-4 fill-white" /> Pause
                </ActionBtn>
              ) : (
                <ActionBtn color="emerald" onClick={handleResumeActiveTimer}>
                  <Play className="w-4 h-4 fill-white" /> Resume
                </ActionBtn>
              )}
              {activeType === 'stopwatch' && isRunning && (
                <GhostBtn onClick={handleRecordStopwatchLap}>Lap</GhostBtn>
              )}
              <GhostBtn onClick={handleResetActiveTimer}>
                <RotateCcw className="w-3.5 h-3.5" /> Reset
              </GhostBtn>
            </>
          )}

          {/* Manual Study Room Logger */}
          {!isIdle && (
            <ActionBtn color="indigo" onClick={handleSaveActiveTimerSession}>
              <Save className="w-4 h-4" /> Save Elapsed Time
            </ActionBtn>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Panel: Overlay Widgets ───────────────────────────────────────────────────
function WidgetsPanel({ fsWidgets, setFsWidgets, fsCustomizingWidgets, setFsCustomizingWidgets, setFsEditingWidgetId, onClose }) {
  const [addOpen, setAddOpen] = useState(false);
  const [addType, setAddType] = useState('custom_browser');
  const [addUrl, setAddUrl] = useState('');
  const [addTitle, setAddTitle] = useState('');
  const [addNativeId, setAddNativeId] = useState('streakCounter');

  const addWidget = () => {
    setFsWidgets(prev => [...prev, {
      id:`widget_${Date.now()}`,
      type:addType,
      title:addTitle || (addType === 'custom_browser' ? 'Browser Source' : addNativeId),
      url:addUrl,
      nativeId:addNativeId,
      x:40, y:120, w:360, h:320,
      customCss:'', visible:true,
    }]);
    setAddOpen(false);
    setAddUrl(''); setAddTitle('');
    setFsCustomizingWidgets(true);
  };

  return (
    <div className="w-72 bg-[#0f0f1a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
      <PanelHeader icon={Layout} label="Overlay Widgets" onClose={onClose} />
      <div className="p-3 space-y-2.5 max-h-[420px] overflow-y-auto">
        <button onClick={() => setFsCustomizingWidgets(v => !v)}
          className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-black uppercase tracking-wider transition ${fsCustomizingWidgets ? 'bg-blue-600 border-blue-500 text-white' : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'}`}
        >
          <Move className="w-3.5 h-3.5" /> {fsCustomizingWidgets ? 'Done Customizing' : 'Customize Widgets'}
        </button>

        {fsWidgets.length > 0 && (
          <div className="space-y-1.5">
            <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider">Active Widgets</span>
            {fsWidgets.map(w => (
              <div key={w.id} className="flex items-center gap-2 bg-white/5 rounded-xl px-3 py-2 border border-white/5">
                <span className="flex-grow text-[11px] font-bold text-slate-300 truncate">{w.title}</span>
                <button onClick={() => { setFsEditingWidgetId(w.id); onClose(); }} className="text-slate-500 hover:text-blue-400 transition"><Code2 className="w-3.5 h-3.5" /></button>
                <button onClick={() => setFsWidgets(prev => prev.filter(x => x.id !== w.id))} className="text-slate-500 hover:text-red-400 transition"><X className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </div>
        )}

        <button onClick={() => setAddOpen(v => !v)}
          className="w-full flex items-center gap-2 px-3 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-black text-slate-300 uppercase tracking-wider transition"
        ><Plus className="w-3.5 h-3.5" /> Add Widget</button>

        {addOpen && (
          <div className="space-y-2 p-3 bg-white/5 rounded-xl border border-white/10">
            <div className="grid grid-cols-2 gap-1.5">
              {[['custom_browser','🌐 Browser Source'],['existing_widget','📦 App Widget']].map(([t,l]) => (
                <button key={t} onClick={() => setAddType(t)}
                  className={`py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider border transition ${addType===t?'bg-white text-slate-900 border-white':'bg-white/10 border-white/10 text-slate-400 hover:bg-white/20'}`}
                >{l}</button>
              ))}
            </div>
            <input placeholder="Widget title (optional)" value={addTitle} onChange={e => setAddTitle(e.target.value)}
              className="w-full bg-white/10 border border-white/10 rounded-lg px-2.5 py-2 text-xs text-white placeholder-slate-500 outline-none" />
            {addType === 'custom_browser'
              ? <input placeholder="https://..." value={addUrl} onChange={e => setAddUrl(e.target.value)}
                  className="w-full bg-white/10 border border-white/10 rounded-lg px-2.5 py-2 text-xs font-mono text-white placeholder-slate-500 outline-none" />
              : (
                <select value={addNativeId} onChange={e => setAddNativeId(e.target.value)}
                  className="w-full bg-white/10 border border-white/10 rounded-lg px-2.5 py-2 text-xs text-white outline-none">
                  <option value="streakCounter">🔥 Streak Counter</option>
                  <option value="liveStudyTracker">📍 Live Study Tracker</option>
                  <option value="studySchedule">📅 Study Schedule</option>
                  <option value="subjectTracker">🎯 Subject Tracker</option>
                  <option value="pytTracker">⚡ PYT Tracker</option>
                  <option value="campEfficiency">📊 CAMP Efficiency Score</option>
                  <option value="recentSessions">⏱️ Today's Logged Sessions</option>
                  <option value="quickNotes">✍️ Scratchpad Notes</option>
                  <option value="todayStatsOverview">📈 Today's Stats Overview</option>
                </select>
              )
            }
            <button onClick={addWidget}
              className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-[10px] font-black uppercase tracking-wider transition active:scale-95">
              Add to Canvas
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Floating Widget Wrapper ──────────────────────────────────────────────────
const sanitizeWidgetCss = (css, widgetId) => {
  if (!css || typeof css !== 'string') return '';
  // Strip dangerous CSS constructs (expressions, script schemes, @import)
  let cleaned = css
    .replace(/@import\s+[^;]+;/gi, '')
    .replace(/javascript\s*:/gi, '')
    .replace(/behavior\s*:/gi, '')
    .replace(/-moz-binding\s*:/gi, '')
    .replace(/expression\s*\([^)]*\)/gi, '');

  // Scope CSS rules to the widget's container ID if not already scoped
  if (cleaned.trim() && !cleaned.includes(`#fw-${widgetId}`)) {
    cleaned = cleaned
      .split('}')
      .map(block => {
        const trimmed = block.trim();
        if (!trimmed) return '';
        const parts = trimmed.split('{');
        if (parts.length === 2) {
          const selectors = parts[0].split(',').map(s => {
            const sel = s.trim();
            if (sel === 'body' || sel === 'html' || sel === ':root') {
              return `#fw-${widgetId}`;
            }
            return `#fw-${widgetId} ${sel}`;
          }).join(', ');
          return `${selectors} { ${parts[1]} }`;
        }
        return trimmed;
      })
      .filter(Boolean)
      .join('\n');
  }
  return cleaned;
};

function FloatingWidget({ widget, customizing, onDragStart, onResizeStart, onEdit, onRemove, children }) {
  const safeCustomCss = sanitizeWidgetCss(widget.customCss, widget.id);

  return (
    <div
      className={`absolute z-20 rounded-2xl overflow-hidden shadow-2xl ${customizing ? 'ring-2 ring-blue-400/50' : ''}`}
      style={{ left:widget.x, top:widget.y, width:widget.w, height:widget.h }}
      onClick={e => e.stopPropagation()}
      onMouseDown={e => e.stopPropagation()}
    >
      <style>{`
        #fw-${widget.id} {
          ${widget.fontSize ? `font-size: ${widget.fontSize}px !important;` : ''}
        }
        #fw-${widget.id} *:not(.cursor-grab):not(.cursor-se-resize):not(svg):not(path) {
          ${widget.fontSize ? `font-size: inherit !important;` : ''}
        }
        ${safeCustomCss}
      `}</style>
      {(() => {
        let bgClass = "bg-black/15 backdrop-blur-md border border-white/10";
        if (widget.backgroundType === 'transparent') {
          bgClass = "bg-transparent border-0";
        } else if (widget.backgroundType === 'opaque') {
          bgClass = "bg-[#0f0f1a] border border-white/10";
        }
        return (
          <div id={`fw-${widget.id}`} className={`w-full h-full rounded-2xl flex flex-col overflow-hidden ${bgClass}`}>
            {customizing && (
              <div className="flex items-center justify-between px-3 py-2 bg-black/50 border-b border-white/10 shrink-0 cursor-grab active:cursor-grabbing"
                onMouseDown={e => { e.preventDefault(); onDragStart(e, widget.id); }}>
                <div className="flex items-center gap-2">
                  <GripVertical className="w-3.5 h-3.5 text-slate-500" />
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider truncate max-w-[140px]">{widget.title}</span>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => onEdit(widget)} className="w-5 h-5 flex items-center justify-center text-slate-500 hover:text-blue-400 transition"><Edit2 className="w-3 h-3" /></button>
                  <button onClick={() => onRemove(widget.id)} className="w-5 h-5 flex items-center justify-center text-slate-500 hover:text-red-400 transition"><X className="w-3 h-3" /></button>
                </div>
              </div>
            )}
            <div className="flex-grow overflow-hidden">{children}</div>
            {customizing && (
              <div className="absolute bottom-0 right-0 w-5 h-5 cursor-se-resize flex items-end justify-end pr-1 pb-1"
                onMouseDown={e => { e.preventDefault(); e.stopPropagation(); onResizeStart(e, widget.id); }}>
                <div className="w-3 h-3 border-r-2 border-b-2 border-white/40 rounded-br" />
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}

// ─── Reusable small components ────────────────────────────────────────────────
function PanelHeader({ icon: Icon, label, onClose }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
      <span className="text-sm font-black text-white tracking-tight flex items-center gap-2">
        <Icon className="w-4 h-4" /> {label}
      </span>
      <button onClick={onClose} className="w-7 h-7 flex items-center justify-center hover:bg-white/10 rounded-lg transition">
        <X className="w-3.5 h-3.5 text-slate-400" />
      </button>
    </div>
  );
}

function PanelAction({ icon: Icon, label, onClick }) {
  return (
    <button onClick={onClick}
      className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-white/10 rounded-xl transition text-left">
      <Icon className="w-4 h-4 text-slate-400 shrink-0" />
      <span className="text-sm font-bold text-slate-200">{label}</span>
    </button>
  );
}

function Label({ children }) {
  return <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider block">{children}</span>;
}

function NumberInput({ label, value, onChange }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-2.5">
      <Label>{label}</Label>
      <input type="number" value={value} onChange={e => onChange(Number(e.target.value) || 0)}
        className="bg-transparent text-sm font-black text-white focus:outline-none mt-1 w-full font-mono border-b border-transparent focus:border-blue-400" />
    </div>
  );
}

const colorMap = { orange:'bg-orange-600 hover:bg-orange-500', indigo:'bg-indigo-600 hover:bg-indigo-500', emerald:'bg-emerald-600 hover:bg-emerald-500', amber:'bg-amber-600 hover:bg-amber-500' };
function ActionBtn({ color, onClick, children }) {
  return (
    <button onClick={onClick} className={`w-full py-3 ${colorMap[color] || 'bg-blue-600 hover:bg-blue-500'} text-white rounded-xl text-xs font-black uppercase tracking-widest transition active:scale-95 flex items-center justify-center gap-2`}>
      {children}
    </button>
  );
}
function GhostBtn({ onClick, children }) {
  return (
    <button onClick={onClick} className="w-full py-2.5 bg-white/10 hover:bg-white/20 text-white border border-white/10 rounded-xl text-xs font-black uppercase tracking-widest transition active:scale-95 flex items-center justify-center gap-2">
      {children}
    </button>
  );
}

// ─── Flip Digit (pass-through — uses existing ReactFlipDigit from App) ────────
// Exported as a named hook for the StudyRoomView so we can call it:
export { BG_CATEGORIES, STATIC_BG_GRADIENTS, SOUND_TRACKS, STUDY_QUOTES, OBS_CSS_TEMPLATE };
export { CtrlBtn, BgPanel, SoundsPanel, SoundSlider, QuotesPanel, StatsPanel, TimerSettingsPanel, WidgetsPanel, FloatingWidget };
export { PanelHeader, PanelAction, Label, NumberInput, ActionBtn, GhostBtn };
