import fs from 'fs';

const filePath = 'src/App.jsx';
let content = fs.readFileSync(filePath, 'utf8');

// Target section to replace
const startMarker = "                {/* MOBILE FLOATING HEADER - Minimalist Dynamic Island & Sync */}";
const endMarker = "<main className={`flex-grow overflow-y-auto pb-36 px-2 sm:px-4 py-3 transition-colors duration-300 ${settingsThemeMode === 'dark' ? 'neu-bg-dark text-slate-100' : 'neu-bg-light text-slate-800'}`}>\r\n";
const endMarkerLF = "<main className={`flex-grow overflow-y-auto pb-36 px-2 sm:px-4 py-3 transition-colors duration-300 ${settingsThemeMode === 'dark' ? 'neu-bg-dark text-slate-100' : 'neu-bg-light text-slate-800'}`}>\n";

const newContent = `                {/* MOBILE FLOATING DYNAMIC ISLAND (Headerless Overlay) */}
                <div className="fixed top-0 left-0 right-0 z-40 flex justify-center pointer-events-none pt-2">
                  {/* Backdrop for active drawers */}
                  {(isDailyMetricsOpen || islandMobileState === 'semi') && (
                    <div
                      className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px] pointer-events-auto"
                      onClick={() => {
                        setIsDailyMetricsOpen(false);
                        if (islandMobileState === 'semi') setIsIslandMobileState('mini');
                      }}
                      onTouchEnd={(e) => {
                        e.stopPropagation();
                        setIsDailyMetricsOpen(false);
                        if (islandMobileState === 'semi') setIsIslandMobileState('mini');
                      }}
                    />
                  )}

                  <div
                    onTouchStart={(e) => {
                      const touch = e.touches[0];
                      islandTouchRef.current = {
                        startX: touch.clientX,
                        startY: touch.clientY,
                        startTime: Date.now(),
                        isSwiping: false,
                        wasAlreadyOpenAtTouchStart: isDailyMetricsOpen,
                        wasAlreadyTimerSemiAtTouchStart: (islandMobileState === 'semi'),
                        lastTouchTime: islandTouchRef.current.lastTouchTime || 0
                      };
                    }}
                    onTouchMove={(e) => {
                      if (!islandTouchRef.current.startX) return;
                      const touch = e.touches[0];
                      const diffX = touch.clientX - islandTouchRef.current.startX;
                      const diffY = touch.clientY - islandTouchRef.current.startY;
                      if (Math.abs(diffX) > 8 && Math.abs(diffX) > Math.abs(diffY)) {
                        islandTouchRef.current.isSwiping = true;
                      }
                    }}
                    onTouchEnd={(e) => {
                      const { startX, startY, startTime, isSwiping, wasAlreadyOpenAtTouchStart, wasAlreadyTimerSemiAtTouchStart } = islandTouchRef.current;
                      const touch = e.changedTouches ? e.changedTouches[0] : null;
                      const now = Date.now();
                      islandTouchRef.current.lastTouchTime = now;
                      if (!touch || !startX) return;

                      const diffX = touch.clientX - startX;
                      const diffY = touch.clientY - startY;
                      const duration = now - startTime;

                      // 1. SWIPE GESTURE (Horizontal swipe with >= 10px movement)
                      if (isSwiping || (Math.abs(diffX) >= 10 && Math.abs(diffX) > Math.abs(diffY))) {
                        if (isDailyMetricsOpen) {
                          setIsDailyMetricsOpen(false);
                        } else if (islandMobileState === 'semi') {
                          setIsIslandMobileState('mini');
                        } else {
                          // Cycle through all 5 compact pills: hole -> momentum -> timer -> exam -> sync
                          const mobileStates = ['hole', 'pill', 'mini', 'exam', 'sync'];
                          setIsIslandMobileState(prev => {
                            let currentIdx = mobileStates.indexOf(prev);
                            if (currentIdx === -1) currentIdx = 0;
                            const step = diffX > 0 ? 1 : -1;
                            const nextIdx = (currentIdx + step + mobileStates.length) % mobileStates.length;
                            return mobileStates[nextIdx];
                          });
                        }
                        islandTouchRef.current = { startX: 0, startY: 0, startTime: 0, isSwiping: false, lastTouchTime: now };
                        return;
                      }

                      // 2. TAP GESTURE (Low movement & quick release)
                      if (!isSwiping && Math.abs(diffX) < 10 && Math.abs(diffY) < 10 && duration < 600) {
                        if (wasAlreadyOpenAtTouchStart && isDailyMetricsOpen) {
                          if (now - (islandExpandedTimeRef.current || 0) > 400) {
                            setCurrentTab('study');
                            setStudyActiveTab('manual');
                            setIsDailyMetricsOpen(false);
                          }
                        } else if (wasAlreadyTimerSemiAtTouchStart && islandMobileState === 'semi') {
                          if (now - (islandExpandedTimeRef.current || 0) > 400) {
                            setIsTimerFullscreen(true);
                          }
                        } else if (islandMobileState === 'mini') {
                          islandExpandedTimeRef.current = now;
                          setIsIslandMobileState('semi');
                        } else if (islandMobileState === 'pill') {
                          islandExpandedTimeRef.current = now;
                          setIsDailyMetricsOpen(true);
                        } else if (islandMobileState === 'exam') {
                          islandExpandedTimeRef.current = now;
                          setCurrentTab('smartReview');
                          setSmartReviewSubTab('queue');
                        } else if (islandMobileState === 'sync') {
                          islandExpandedTimeRef.current = now;
                          handleHeaderSync();
                        } else if (islandMobileState === 'hole') {
                          // Tap on Glowing Lava Orb directly opens OxygenOS Live Alerts Stack
                          islandExpandedTimeRef.current = now;
                          setIsLiveAlertsStackOpen(true);
                        }
                      }
                      islandTouchRef.current = { startX: 0, startY: 0, startTime: 0, isSwiping: false, lastTouchTime: now };
                    }}
                    onClick={(e) => {
                      if (Date.now() - (islandTouchRef.current.lastTouchTime || 0) < 700) {
                        return;
                      }
                      if (isDailyMetricsOpen) {
                        if (Date.now() - (islandExpandedTimeRef.current || 0) > 400) {
                          setCurrentTab('study');
                          setStudyActiveTab('manual');
                          setIsDailyMetricsOpen(false);
                        }
                      } else if (islandMobileState === 'semi') {
                        if (Date.now() - (islandExpandedTimeRef.current || 0) > 400) {
                          setIsTimerFullscreen(true);
                        }
                      } else if (islandMobileState === 'mini') {
                        islandExpandedTimeRef.current = Date.now();
                        setIsIslandMobileState('semi');
                      } else if (islandMobileState === 'pill') {
                        islandExpandedTimeRef.current = Date.now();
                        setIsDailyMetricsOpen(true);
                      } else if (islandMobileState === 'exam') {
                        islandExpandedTimeRef.current = Date.now();
                        setCurrentTab('smartReview');
                        setSmartReviewSubTab('queue');
                      } else if (islandMobileState === 'sync') {
                        islandExpandedTimeRef.current = Date.now();
                        handleHeaderSync();
                      } else {
                        islandExpandedTimeRef.current = Date.now();
                        setIsLiveAlertsStackOpen(true);
                      }
                    }}
                    className={\`ios-dynamic-island pointer-events-auto \${settingsThemeMode === 'dark' ? 'dark' : 'light'} \${isDailyMetricsOpen
                        ? 'active'
                        : (islandMobileState === 'semi'
                            ? 'mobile-timer-semi'
                            : (islandMobileState === 'mini'
                                ? 'mobile-timer-mini'
                                : (islandMobileState === 'exam'
                                    ? 'mobile-exam'
                                    : (islandMobileState === 'sync'
                                        ? 'mobile-sync'
                                        : (islandMobileState === 'pill' ? 'mobile-pill' : 'mobile-hole')))))
                      }\`}
                    title={isDailyMetricsOpen ? "Click to open Study Room Manual Log" : "Swipe horizontally to cycle Live Alerts (Orb / Stats / Timer / Exam / Sync), tap Orb to open stacked alert cards"}
                  >
                    {/* STATE 1: CLOSED HOLE ORB (Fluid Lava Glow Orb) */}
                    <div className="compact-hole-orb">
                      <div className="dynamic-island-orb">
                        <svg width="100" height="100" viewBox="0 0 100 100">
                          <defs>
                            <mask id="island-clipping-mask">
                              <polygon points="0,0 100,0 100,100 0,100" fill="black" />
                              <polygon points="25,25 75,25 50,75" fill="white" />
                              <polygon points="50,25 75,75 25,75" fill="white" />
                              <polygon points="35,35 65,35 50,65" fill="white" />
                              <polygon points="35,35 65,35 50,65" fill="white" />
                              <polygon points="35,35 65,35 50,65" fill="white" />
                              <polygon points="35,35 65,35 50,65" fill="white" />
                            </mask>
                          </defs>
                        </svg>
                        <div className="box" />
                      </div>
                    </div>

                    {/* STATE 2: STATS COMPACT PILL */}
                    <div
                      className="compact-content cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        islandExpandedTimeRef.current = Date.now();
                        setIsDailyMetricsOpen(true);
                      }}
                    >
                      <div className="flex items-center gap-1 shrink-0">
                        <Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-blue-500 shrink-0" />
                        <span className="text-[11px] sm:text-xs font-black tracking-tight">{getLiveTodayHours().toFixed(1)}h</span>
                      </div>
                      <span className="opacity-30 text-[10px] sm:text-xs font-bold">•</span>
                      <div className="flex items-center gap-1 shrink-0">
                        <Layers className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-purple-500 shrink-0" />
                        <span className="text-[11px] sm:text-xs font-black tracking-tight">{studyLogs[todayStr]?.cards || 0}c</span>
                      </div>
                      <span className="opacity-30 text-[10px] sm:text-xs font-bold">•</span>
                      <div className="flex items-center gap-1 shrink-0">
                        <Flame className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-orange-500 shrink-0" />
                        <span className="text-[11px] sm:text-xs font-black tracking-tight text-orange-500">{streakStats.currentStreak}d</span>
                      </div>
                      <ChevronDown className="w-3 h-3 opacity-60 text-blue-500 shrink-0" />
                    </div>

                    {/* STATE 3: TIMER MINI CAPSULE */}
                    <div
                      className="compact-timer-mini flex items-center justify-between w-full px-3 cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        islandExpandedTimeRef.current = Date.now();
                        setIsIslandMobileState('semi');
                      }}
                    >
                      <Hourglass className={\`w-3.5 h-3.5 text-blue-400 shrink-0 \${activeTimerInfo.isRunning ? 'animate-pulse' : ''}\`} />
                      <span className="font-mono text-xs font-black text-blue-400 tracking-tight">{activeTimerInfo.timeStr}</span>
                    </div>

                    {/* STATE 4: EXAM TARGET PILL */}
                    <div
                      className="compact-exam flex items-center justify-between w-full px-2.5 cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        islandExpandedTimeRef.current = Date.now();
                        setCurrentTab('smartReview');
                        setSmartReviewSubTab('queue');
                      }}
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        <Calendar className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                        <span className="text-[11px] font-black tracking-tight truncate max-w-[110px]">
                          {headerUpcomingExam ? headerUpcomingExam.title : 'Target Exam'}
                        </span>
                      </div>
                      <span className="px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-500 shrink-0">
                        {headerUpcomingExam ? headerUpcomingExam.countdownText : 'Set'}
                      </span>
                    </div>

                    {/* STATE 5: CLOUD VAULT & SYNC PILL */}
                    <div
                      className="compact-sync flex items-center justify-between w-full px-2.5 cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        islandExpandedTimeRef.current = Date.now();
                        handleHeaderSync();
                      }}
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        <Cloud className={\`w-3.5 h-3.5 \${justSynced ? 'text-emerald-400' : 'text-blue-400'} shrink-0\`} />
                        <span className="text-[11px] font-black tracking-tight truncate">
                          {isSyncing || gdriveSyncState.isSyncing ? 'Syncing...' : justSynced ? 'Synced' : 'Cloud Vault'}
                        </span>
                      </div>
                      <span className={\`px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider shrink-0 \${justSynced ? 'bg-emerald-500/20 text-emerald-400' : 'bg-blue-500/20 text-blue-400'}\`}>
                        {isSyncing || gdriveSyncState.isSyncing ? '🔄' : justSynced ? '✨' : 'Sync'}
                      </span>
                    </div>

                    {/* TIMER EXPANDED CARD */}
                    <div
                      className="compact-timer-semi flex flex-col justify-between w-full h-full cursor-pointer select-none"
                      onClick={() => {
                        if (Date.now() - (islandExpandedTimeRef.current || 0) > 400) {
                          setIsTimerFullscreen(true);
                        }
                      }}
                      title="Click to open Fullscreen Timer"
                    >
                      {/* Header Strip */}
                      <div className="flex items-center justify-between pb-1.5 border-b border-white/10 shrink-0">
                        <div className="flex items-center gap-1.5">
                          <Hourglass className={\`w-3.5 h-3.5 text-blue-500 shrink-0 \${activeTimerInfo.isRunning ? 'animate-pulse' : ''}\`} />
                          <h4 className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider">
                            {activeTimerInfo.label === 'Pomodoro' ? 'Focus Session' : activeTimerInfo.label}
                          </h4>
                          <span className="text-[9px] sm:text-[10px] font-bold opacity-40">•</span>
                          <span className="text-[9px] sm:text-[10px] font-bold opacity-60">
                            {timerState.timerType === 'pomodoro' ? \`Round \${timerState.pomodoroRounds || 1}/\${pomodoroTargetRounds || 4}\` : todayStr}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className={\`px-1.5 py-0.5 rounded-lg text-[8px] sm:text-[9px] font-black uppercase tracking-wider border flex items-center gap-1 \${activeTimerInfo.isRunning
                              ? (settingsThemeMode === 'dark' ? 'bg-blue-500/15 text-blue-400 border-blue-500/30 animate-pulse' : 'bg-blue-50 text-blue-700 border-blue-200 animate-pulse')
                              : (settingsThemeMode === 'dark' ? 'bg-amber-500/15 text-amber-400 border-amber-500/30' : 'bg-amber-50 text-amber-700 border-amber-200')
                            }\`}>
                            <span className={\`w-1.5 h-1.5 rounded-full \${activeTimerInfo.isRunning ? 'bg-blue-500' : 'bg-amber-500'}\`} />
                            {activeTimerInfo.isRunning ? 'Running' : 'Paused'}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setIsIslandMobileState('mini');
                            }}
                            onTouchEnd={(e) => {
                              e.stopPropagation();
                              setIsIslandMobileState('mini');
                            }}
                            className="p-1 hover:bg-white/10 rounded-lg opacity-60 hover:opacity-100 transition cursor-pointer"
                            title="Minimize Timer"
                          >
                            <ChevronDown className="w-3.5 h-3.5 rotate-180 text-blue-500" />
                          </button>
                        </div>
                      </div>

                      {/* Body Content */}
                      <div className="flex items-center justify-between gap-2 pt-1 flex-1">
                        <div className="flex items-center gap-2">
                          <div className={\`px-3 py-1.5 rounded-xl border flex flex-col items-start justify-center \${settingsThemeMode === 'dark'
                              ? 'bg-white/[0.04] border-white/[0.08] shadow-[inset_0_1px_1px_rgba(255,255,255,0.06)]'
                              : 'bg-white/70 border-white/80 shadow-[inset_0_1px_1px_rgba(255,255,255,0.7)]'
                            }\`}>
                            <div className="flex items-baseline gap-1.5">
                              <span className="font-mono text-xl sm:text-2xl font-black tracking-tight leading-none text-blue-500 dark:text-blue-400">
                                {activeTimerInfo.timeStr}
                              </span>
                              <span className="text-[9px] font-bold opacity-50 uppercase tracking-wider">
                                {activeTimerInfo.subLabel || activeTimerInfo.label}
                              </span>
                            </div>
                            <span className="text-[8px] font-semibold text-blue-500 dark:text-blue-400/80 mt-0.5 flex items-center gap-0.5">
                              Tap for Fullscreen <ChevronRight className="w-2.5 h-2.5 inline" />
                            </span>
                          </div>
                        </div>

                        <div
                          className="flex items-center gap-2"
                          onClick={(e) => e.stopPropagation()}
                          onTouchStart={(e) => e.stopPropagation()}
                          onTouchEnd={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (activeTimerInfo.isRunning) {
                                handlePauseTimer();
                              } else {
                                handleStartTimer();
                              }
                            }}
                            className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 hover:from-blue-500 hover:to-indigo-400 active:scale-95 text-white flex items-center justify-center transition shadow-lg shadow-blue-500/25 cursor-pointer shrink-0"
                            title={activeTimerInfo.isRunning ? "Pause Timer" : "Start Timer"}
                          >
                            {activeTimerInfo.isRunning ? (
                              <Pause className="w-4 h-4 fill-current" />
                            ) : (
                              <Play className="w-4 h-4 fill-current ml-0.5" />
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleResetTimer();
                            }}
                            className={\`w-10 h-10 sm:w-11 sm:h-11 rounded-xl active:scale-95 flex items-center justify-center transition border cursor-pointer shrink-0 \${settingsThemeMode === 'dark'
                                ? 'bg-white/5 hover:bg-white/10 text-slate-300 border-white/10'
                                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                              }\`}
                            title="Reset Timer"
                          >
                            <RotateCcw className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* EXPANDED MOMENTUM DRAWER */}
                    <div
                      className="expanded-content cursor-pointer"
                      onClick={() => {
                        if (Date.now() - (islandExpandedTimeRef.current || 0) > 400) {
                          setCurrentTab('study');
                          setStudyActiveTab('manual');
                          setIsDailyMetricsOpen(false);
                        }
                      }}
                      title="Click to open Study Room Manual Log"
                    >
                      <div className="flex items-center justify-between pb-1.5 border-b border-white/10">
                        <div className="flex items-center gap-1.5">
                          <h4 className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider">Today's Momentum</h4>
                          <span className="text-[9px] sm:text-[10px] font-bold opacity-40">•</span>
                          <span className="text-[9px] sm:text-[10px] font-bold opacity-60">{todayStr}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className={\`px-1.5 py-0.5 rounded-lg text-[8px] sm:text-[9px] font-black uppercase tracking-wider border flex items-center gap-1 \${settingsThemeMode === 'dark' ? 'bg-orange-500/15 text-orange-400 border-orange-500/30' : 'bg-orange-50 text-orange-700 border-orange-200'
                            }\`}>
                            <Flame className="w-2.5 h-2.5" /> {streakStats.currentStreak}d Streak
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setIsDailyMetricsOpen(false);
                            }}
                            onTouchEnd={(e) => {
                              e.stopPropagation();
                              setIsDailyMetricsOpen(false);
                            }}
                            className="p-1 hover:bg-white/10 rounded-lg opacity-60 hover:opacity-100 transition cursor-pointer"
                            title="Close Momentum Drawer"
                          >
                            <ChevronDown className="w-3.5 h-3.5 rotate-180 text-blue-500" />
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
                        <div className={\`p-1.5 sm:p-2 rounded-xl border text-center flex flex-col items-center justify-center \${settingsThemeMode === 'dark' ? 'bg-white/[0.04] border-white/[0.08] shadow-[inset_0_1px_1px_rgba(255,255,255,0.06)]' : 'bg-white/70 border-white/80 shadow-[inset_0_1px_1px_rgba(255,255,255,0.7)]'}\`}>
                          <div className="flex items-center gap-0.5 sm:gap-1 mb-0.5">
                            <Clock className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-blue-500 shrink-0" />
                            <span className="text-[7.5px] sm:text-[8px] font-black uppercase tracking-wider opacity-60">Time</span>
                          </div>
                          <div className="text-[11px] sm:text-xs font-black">{getLiveTodayHours().toFixed(2)}h</div>
                        </div>
                        <div className={\`p-1.5 sm:p-2 rounded-xl border text-center flex flex-col items-center justify-center \${settingsThemeMode === 'dark' ? 'bg-white/[0.04] border-white/[0.08] shadow-[inset_0_1px_1px_rgba(255,255,255,0.06)]' : 'bg-white/70 border-white/80 shadow-[inset_0_1px_1px_rgba(255,255,255,0.7)]'}\`}>
                          <div className="flex items-center gap-0.5 sm:gap-1 mb-0.5">
                            <Layers className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-purple-500 shrink-0" />
                            <span className="text-[7.5px] sm:text-[8px] font-black uppercase tracking-wider opacity-60">Cards</span>
                          </div>
                          <div className="text-[11px] sm:text-xs font-black">{studyLogs[todayStr]?.cards || 0}</div>
                        </div>
                        <div className={\`p-1.5 sm:p-2 rounded-xl border text-center flex flex-col items-center justify-center \${settingsThemeMode === 'dark' ? 'bg-white/[0.04] border-white/[0.08] shadow-[inset_0_1px_1px_rgba(255,255,255,0.06)]' : 'bg-white/70 border-white/80 shadow-[inset_0_1px_1px_rgba(255,255,255,0.7)]'}\`}>
                          <div className="flex items-center gap-0.5 sm:gap-1 mb-0.5">
                            <HelpCircle className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-indigo-500 shrink-0" />
                            <span className="text-[7.5px] sm:text-[8px] font-black uppercase tracking-wider opacity-60">Qs</span>
                          </div>
                          <div className="text-[11px] sm:text-xs font-black">{studyLogs[todayStr]?.questions || 0}</div>
                        </div>
                        <div className={\`p-1.5 sm:p-2 rounded-xl border text-center flex flex-col items-center justify-center \${settingsThemeMode === 'dark' ? 'bg-white/[0.04] border-white/[0.08] shadow-[inset_0_1px_1px_rgba(255,255,255,0.06)]' : 'bg-white/70 border-white/80 shadow-[inset_0_1px_1px_rgba(255,255,255,0.7)]'}\`}>
                          <div className="flex items-center gap-0.5 sm:gap-1 mb-0.5">
                            <FileText className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-teal-500 shrink-0" />
                            <span className="text-[7.5px] sm:text-[8px] font-black uppercase tracking-wider opacity-60">Pages</span>
                          </div>
                          <div className="text-[11px] sm:text-xs font-black">{studyLogs[todayStr]?.pages || 0}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* OxygenOS / Live Alerts Stack Overlay */}
                <AnimatePresence>
                  {isLiveAlertsStackOpen && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="fixed inset-0 z-50 flex flex-col items-center justify-start p-4 pt-12 bg-black/60 backdrop-blur-md overflow-y-auto"
                      onClick={() => setIsLiveAlertsStackOpen(false)}
                    >
                      <motion.div
                        initial={{ scale: 0.9, y: -20, opacity: 0 }}
                        animate={{ scale: 1, y: 0, opacity: 1 }}
                        exit={{ scale: 0.9, y: -20, opacity: 0 }}
                        transition={{ type: "spring", damping: 25, stiffness: 300 }}
                        onClick={(e) => e.stopPropagation()}
                        className={\`w-full max-w-md rounded-3xl p-5 border shadow-2xl space-y-4 select-none \${
                          settingsThemeMode === 'dark'
                            ? 'bg-[#1e232d]/95 border-white/10 text-white shadow-[0_20px_60px_rgba(0,0,0,0.8)]'
                            : 'bg-white/95 border-slate-200 text-slate-900 shadow-[0_20px_60px_rgba(0,0,0,0.15)]'
                        }\`}
                      >
                        {/* Header Bar */}
                        <div className="flex items-center justify-between pb-3 border-b border-white/10">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">🔮</span>
                            <div>
                              <h3 className="text-sm font-black uppercase tracking-wider">Live Alerts & Status</h3>
                              <p className="text-[10px] font-bold opacity-60">{todayStr}</p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setIsLiveAlertsStackOpen(false)}
                            className="p-1.5 rounded-xl hover:bg-white/10 opacity-70 hover:opacity-100 transition cursor-pointer"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>

                        {/* Card 1: Focus Timer Card */}
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.05 }}
                          className={\`p-4 rounded-2xl border \${
                            settingsThemeMode === 'dark' ? 'bg-white/[0.04] border-white/10' : 'bg-slate-50 border-slate-200'
                          }\`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <Hourglass className={\`w-4 h-4 text-blue-400 \${activeTimerInfo.isRunning ? 'animate-pulse' : ''}\`} />
                              <span className="text-xs font-black uppercase tracking-wider">
                                {activeTimerInfo.label === 'Pomodoro' ? 'Focus Session' : activeTimerInfo.label}
                              </span>
                            </div>
                            <span className={\`px-2 py-0.5 rounded-lg text-[9px] font-extrabold uppercase tracking-wider border \${
                              activeTimerInfo.isRunning
                                ? (settingsThemeMode === 'dark' ? 'bg-blue-500/20 text-blue-400 border-blue-500/40' : 'bg-blue-50 text-blue-700 border-blue-200')
                                : (settingsThemeMode === 'dark' ? 'bg-amber-500/20 text-amber-400 border-amber-500/40' : 'bg-amber-50 text-amber-700 border-amber-200')
                            }\`}>
                              {activeTimerInfo.isRunning ? 'Running' : 'Paused'}
                            </span>
                          </div>

                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="font-mono text-2xl font-black tracking-tight text-blue-500 dark:text-blue-400">
                                {activeTimerInfo.timeStr}
                              </div>
                              <div className="text-[10px] opacity-60 font-semibold">
                                {timerState.timerType === 'pomodoro' ? \`Round \${timerState.pomodoroRounds || 1}/\${pomodoroTargetRounds || 4}\` : 'Focus Mode'}
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  if (activeTimerInfo.isRunning) handlePauseTimer();
                                  else handleStartTimer();
                                }}
                                className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 text-white flex items-center justify-center active:scale-95 shadow-md transition cursor-pointer"
                              >
                                {activeTimerInfo.isRunning ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
                              </button>
                              <button
                                type="button"
                                onClick={handleResetTimer}
                                className="w-9 h-9 rounded-xl border border-white/10 flex items-center justify-center active:scale-95 opacity-75 hover:opacity-100 transition cursor-pointer"
                              >
                                <RotateCcw className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setIsLiveAlertsStackOpen(false);
                                  setIsTimerFullscreen(true);
                                }}
                                className="px-2.5 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 active:scale-95 transition cursor-pointer"
                              >
                                Fullscreen
                              </button>
                            </div>
                          </div>
                        </motion.div>

                        {/* Card 2: Today's Momentum Card */}
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.1 }}
                          className={\`p-4 rounded-2xl border \${
                            settingsThemeMode === 'dark' ? 'bg-white/[0.04] border-white/10' : 'bg-slate-50 border-slate-200'
                          }\`}
                        >
                          <div className="flex items-center justify-between mb-2.5">
                            <div className="flex items-center gap-2">
                              <Flame className="w-4 h-4 text-orange-500" />
                              <span className="text-xs font-black uppercase tracking-wider">Today's Momentum</span>
                            </div>
                            <span className={\`px-2 py-0.5 rounded-lg text-[9px] font-extrabold uppercase tracking-wider border \${
                              settingsThemeMode === 'dark' ? 'bg-orange-500/20 text-orange-400 border-orange-500/40' : 'bg-orange-50 text-orange-700 border-orange-200'
                            }\`}>
                              {streakStats.currentStreak}d Streak
                            </span>
                          </div>

                          <div className="grid grid-cols-4 gap-2 text-center mb-3">
                            <div className="p-2 rounded-xl border border-white/5 bg-white/[0.02]">
                              <div className="text-[8px] font-bold opacity-60 uppercase">Time</div>
                              <div className="text-xs font-black text-blue-400">{getLiveTodayHours().toFixed(1)}h</div>
                            </div>
                            <div className="p-2 rounded-xl border border-white/5 bg-white/[0.02]">
                              <div className="text-[8px] font-bold opacity-60 uppercase">Cards</div>
                              <div className="text-xs font-black text-purple-400">{studyLogs[todayStr]?.cards || 0}</div>
                            </div>
                            <div className="p-2 rounded-xl border border-white/5 bg-white/[0.02]">
                              <div className="text-[8px] font-bold opacity-60 uppercase">Qs</div>
                              <div className="text-xs font-black text-indigo-400">{studyLogs[todayStr]?.questions || 0}</div>
                            </div>
                            <div className="p-2 rounded-xl border border-white/5 bg-white/[0.02]">
                              <div className="text-[8px] font-bold opacity-60 uppercase">Pages</div>
                              <div className="text-xs font-black text-teal-400">{studyLogs[todayStr]?.pages || 0}</div>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              setIsLiveAlertsStackOpen(false);
                              setCurrentTab('study');
                              setStudyActiveTab('manual');
                            }}
                            className="w-full py-2 rounded-xl text-[10px] font-black uppercase tracking-wider border border-white/10 hover:bg-white/5 active:scale-98 transition flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <span>Open Study Room Manual Log</span>
                            <ChevronRight className="w-3 h-3" />
                          </button>
                        </motion.div>

                        {/* Card 3: Upcoming Exam Target Card */}
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.15 }}
                          className={\`p-4 rounded-2xl border \${
                            settingsThemeMode === 'dark' ? 'bg-amber-500/[0.06] border-amber-500/30' : 'bg-amber-50/80 border-amber-300'
                          }\`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <Calendar className="w-4 h-4 text-amber-500" />
                              <span className="text-xs font-black uppercase tracking-wider text-amber-500">Upcoming Exam Target</span>
                            </div>
                            {headerUpcomingExam && (
                              <span className="px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider bg-amber-500/25 text-amber-400 border border-amber-500/40">
                                {headerUpcomingExam.countdownText}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="font-extrabold text-sm tracking-tight truncate max-w-[200px]">
                                {headerUpcomingExam ? headerUpcomingExam.title : 'No Target Exam Configured'}
                              </div>
                              <div className="text-[10px] opacity-70 font-medium">
                                {headerUpcomingExam ? headerUpcomingExam.dateStr : 'Set your exam date for smart countdown'}
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => {
                                setIsLiveAlertsStackOpen(false);
                                setCurrentTab('smartReview');
                                setSmartReviewSubTab('queue');
                              }}
                              className="px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 active:scale-95 transition cursor-pointer shrink-0"
                            >
                              Manage
                            </button>
                          </div>
                        </motion.div>

                        {/* Card 4: Cloud Vault & Sync Card */}
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.2 }}
                          className={\`p-4 rounded-2xl border \${
                            settingsThemeMode === 'dark' ? 'bg-emerald-500/[0.06] border-emerald-500/30' : 'bg-emerald-50/80 border-emerald-300'
                          }\`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <Cloud className="w-4 h-4 text-emerald-400" />
                              <span className="text-xs font-black uppercase tracking-wider text-emerald-400">Google Drive Cloud Vault</span>
                            </div>
                            <span className="px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                              {isSyncing || gdriveSyncState.isSyncing ? 'Syncing...' : justSynced ? 'Synced ✨' : (gdriveAuthState ? 'Connected' : 'Offline DB')}
                            </span>
                          </div>

                          <div className="flex items-center justify-between gap-3">
                            <div className="text-[11px] opacity-75 truncate max-w-[200px]">
                              {gdriveSyncState.message || (justSynced ? 'All changes synced with cloud' : 'Ready to sync')}
                            </div>

                            <button
                              type="button"
                              disabled={isSyncing || gdriveSyncState.isSyncing}
                              onClick={() => {
                                handleHeaderSync();
                              }}
                              className="px-3.5 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider bg-emerald-500/25 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/35 active:scale-95 transition cursor-pointer flex items-center gap-1.5 shrink-0"
                            >
                              <RefreshCw className={\`w-3 h-3 \${(isSyncing || gdriveSyncState.isSyncing) ? 'animate-spin' : ''}\`} />
                              <span>Sync Now</span>
                            </button>
                          </div>
                        </motion.div>
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* MOBILE MAIN CONTENT */}
                <main className={\`flex-grow overflow-y-auto pb-36 px-2 sm:px-4 pt-12 transition-colors duration-300 \${settingsThemeMode === 'dark' ? 'neu-bg-dark text-slate-100' : 'neu-bg-light text-slate-800'}\`}>
`;

const startIndex = content.indexOf(startMarker);
let endIndex = content.indexOf(endMarker, startIndex);
if (endIndex === -1) {
  endIndex = content.indexOf(endMarkerLF, startIndex);
  if (endIndex !== -1) {
    endIndex += endMarkerLF.length;
  }
} else {
  endIndex += endMarker.length;
}

if (startIndex === -1 || endIndex === -1) {
  console.error('Markers not found! startIndex:', startIndex, 'endIndex:', endIndex);
  process.exit(1);
}

const updated = content.substring(0, startIndex) + newContent + content.substring(endIndex);
fs.writeFileSync(filePath, updated, 'utf8');
console.log('Successfully updated App.jsx with headerless mobile Dynamic Island & Live Alerts overlay!');
