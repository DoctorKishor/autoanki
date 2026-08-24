# Requirements & Design Specification Document

> [!IMPORTANT]
> **Status**: Gathering Requirements & Planning Phase (Strict Hold)  
> **Rule**: No code execution or file modifications outside specification tracking will be performed until the user explicitly commands: **"ready to execute"**.  
> All requirements, algorithm notes, and architectural specifications are logged persistently here.

---

## 🎯 Project Goal: Smart Repetition Hub & Engine Overhaul (FSRS-6 with FSRS-7 Ready Architecture)

### Primary Objective
Overhaul the Smart Repetition Hub and upgrade the spaced repetition engine to **FSRS-6** with modular code architecture designed for future upgrades (e.g., FSRS-7), incorporating **Page-Weighted Load-Balancing & Fuzzing**, a **Full Anki-Grade Categorized Advanced Settings Suite with Interactive Help Manuals**, and a **Dedicated FSRS Analytics & Statistics Workspace ("Stats Tab")**.

The project is structured in 2 strict sequential phases:
1. **Phase 1 (Core Engine, Backend Logic & Analytics)**: Build modular FSRS-6 engine, LocalDB persistence for 21 parameters, Desired Retention modes (Global vs. Per-Subject), Categorized Advanced Settings Modal (7 Categories with `?` Manual Modals), FSRS Analytics Dashboard ("Stats Tab"), Page-Weighted Smart Load Balancing, Dual Page Caps, and queue batching.
2. **Phase 2 (UI/UX Redesign)**: Complete interface redesign *only after* Phase 1 functionality is 100% stable and verified.

---

## 📘 FSRS-6 Algorithm Technical Specification (Learnings & Math)

Reference: [Expertium's FSRS Technical Explanation](https://expertium.github.io/Algorithm.html) & Open-Spaced-Repetition standard.

### 1. FSRS-6 Parameter Set ($w_0$ to $w_{20}$ — 21 Parameters)
- **$w_0 \dots w_3$**: Initial stabilities $S_0$ for ratings $[1=\text{Again}, 2=\text{Hard}, 3=\text{Good}, 4=\text{Easy}]$.
- **$w_4, w_5$**: Initial difficulty baseline $D_0$ parameters.
- **$w_6, w_7$**: Difficulty update rate & mean-reversion strength toward easy baseline $D_0(\text{Easy})$.
- **$w_8 \dots w_{10}$**: Recall stability growth factor, stability decay power, and retrievability bonus exponent.
- **$w_{11} \dots w_{14}$**: Forget stability coefficient, difficulty decay power, stability growth power, and retrievability bonus on lapse.
- **$w_{15}, w_{16}$**: Hard penalty multiplier and Easy bonus multiplier.
- **$w_{17}, w_{18}$**: Short-term stability / learning step transition parameters.
- **$w_{19}$**: Reserved / short-term stability modifier.
- **$w_{20}$**: **Forgetting curve shape parameter** (Range $[0.1, 0.8]$, default $\sim 0.2345$). Generalizes the power forgetting curve for personalized memory decay.

---

## 📊 FSRS Analytics & Statistics Dashboard ("Stats Tab") Specification

A dedicated, comprehensive analytics workspace integrated into the Smart Repetition Hub, displaying real-time metrics computed directly from IndexedDB (`localDb.js`):

### 1. Topic State Breakdown (Interactive Pie / Donut Chart)
- Categorizes all topics across all subjects into 7 distinct states:
  - 🟦 **New**: Unstarted topics (0 reviews).
  - 🟧 **Learning**: Topics currently in initial learning steps.
  - 🟥 **Relearning**: Topics undergoing lapse relearning steps.
  - 🟩 **Young**: Graduated topics with interval $I < 21$ days.
  - 🌲 **Mature**: Established topics with high stability ($I \ge 21$ days).
  - 🟨 **Suspended**: Topics suspended (leeches or manually paused).
  - 🩶 **Buried**: Topics deferred for the current day.
- Displays both **Topic Count** and **Total Page Count** percentages.
- Toggle: `Separate suspended/buried topics`.

### 2. Actual Retention Analysis Table
- Computes empirical pass rates for reviews with interval $\ge 1$ day:
  - **Metrics**: Young Pass Rate %, Mature Pass Rate %, Total Pass Rate %, Review Count.
  - **Time Horizons**: `Today`, `Yesterday`, `Last Week (7d)`, `Last Month (30d)`, `Last Year (365d)`, `All-Time`.
  - **Filter Radio Buttons**: `Young`, `Mature`, `All`.

### 3. Future Due Forecast & Calendar Workload Heatmap
- Visualizes upcoming topic page review workloads across days, weeks, and months.
- Highlights load-balanced days, daily cap thresholds, and easy days.

### 4. Historical Review Count & Retention Growth Curves
- Bar & line charts tracking daily review volume, pass/fail rates, and stability growth over time.

---

## ⚙️ Advanced Settings Suite & Interactive Help Manual System

### ❓ Question Mark `?` Interactive Manual Modal System
Every section header inside the Advanced Settings Modal will feature an interactive **Question Mark `?` button**.  
Clicking `?` launches a dedicated **In-App Section User Manual Modal** containing comprehensive documentation, usage tips, and explanations adapted specifically for AutoAnki's topic & page-weight workflow.

---

### Category Detailed Specifications

#### Section 1: 📊 Daily Limits
- **Inputs & Scopes**:
  - `New topic pages/day`: Max new topic pages to introduce per day. Range selector / number input.
  - `Maximum review pages/day`: Max review pages to show per day.
  - `New topics ignore review limit`: Toggle switch.
  - `Limits start from top`: Toggle switch.
  - **Scope Tabs**: `Preset (Global)`, `This Subject`, `Today Only` (temporary daily override).

#### Section 2: 🆕 New Topics / Chapters (Topic-Adapted)
- **Inputs**:
  - `Learning steps`: Configurable initial delays adapted for textbook chapters/topics (Default: `1d`, customizable e.g., `1d` or `2h 1d`).
  - `Insertion order`: Dropdown selector (`Sequential (Book / Page Order)` vs. `Random`).

#### Section 3: ⚠️ Lapses & Problematic Topics (Leeches)
- **Inputs**:
  - `Relearning steps`: Configurable relearning delays adapted for textbook chapters/topics (Default: `1d`, customizable e.g., `1d` or `4h`).
  - `Leech threshold`: Lapse count threshold before topic is flagged as a Leech (Default: `8`).
  - `Leech action`: Dropdown selector (`Tag Only` vs. `Suspend Topic`).

#### Section 4: 🔀 Display Order & Queue Priority (Subject & Chapter Adapted)
- **Inputs**:
  - `New topic gather order`: Dropdown (`Subject Curriculum Order`, `Ascending Page Position`, `Descending Page Position`, `Random Topics`).
  - `New topic sort order`: Dropdown (`Subject, then order gathered`, `Order gathered`, `Random`).
  - `New/review order`: Dropdown (`Show after reviews`, `Show before reviews`, `Mix with reviews`).
  - `Interday learning/review order`: Dropdown (`Mix with reviews`, `Show before reviews`, `Show after reviews`).
  - `Review sort order`: Dropdown (`Due date, then random (FSRS Urgency)`, `Relative overdueness`, `Book / Page number order`).

#### Section 5: 🧠 FSRS Core & Parameters
- **Inputs**:
  - `FSRS Master Switch`: Master Toggle (ON/OFF).
  - `Desired Retention Mode`: Toggle (`Global Mode` vs. `Per-Subject Mode`).
  - `Desired Retention ($DR$)`: Slider ($70\% - 97\%$) with dynamic **Workload Level Indicator** (🟢 Light, 🔵 Moderate, 🟠 Heavy, 🔴 Extreme/Burnout Risk).
  - `FSRS Parameters`: Multi-line parameter weights editor for 21 weights ($w_0 \dots w_{20}$) with Import/Export JSON file & text string buttons.
  - `Reschedule topics on change`: Toggle switch (Default: OFF).
  - `Check health when optimizing`: Toggle switch (Default: ON).
  - `Optimize Current Preset`: Action button to calculate optimal weights from local review logs.

#### Section 6: 🏖️ Easy Days (Weekly Workload Balancer)
- **Inputs**:
  - 3-Point Sliders for **Mon, Tue, Wed, Thu, Fri, Sat, Sun**: `Minimum`, `Reduced`, `Normal`.

#### Section 7: 🛠️ Advanced Engine Rules
- **Inputs**:
  - `Maximum interval`: Number input in days (Default: `365` days).
  - `Historical retention`: Baseline historical assumption percentage (Default: `90%`).
  - `Ignore cards reviewed before`: Date picker.
  - `Custom scheduling rules`: Expandable scripting/rule code block.

---

## 🚀 Execution Checklist (PAUSED — Waiting for explicit command)
- [x] Document FSRS-6 algorithm specifications and equations
- [x] Document FSRS Analytics & Statistics Dashboard ("Stats Tab")
- [x] Document Interactive Question Mark `?` Manual Modal System
- [x] Document Section 1: Daily Limits specs & user manual content
- [x] Document Section 2: New Topics / Chapters specs & user manual content
- [x] Document Section 3: Lapses & Leech Management specs & user manual content
- [x] Document Section 4: Display Order & Queue Priority specs & user manual content
- [x] Document Section 5: FSRS Core & Parameters specs & user manual content
- [x] Document Section 6: Easy Days specs & user manual content
- [x] Document Section 7: Advanced Engine Rules specs & user manual content
- [ ] User reviews completed specification document
- [ ] User gives explicit command: **"ready to execute"**
- [ ] Begin Phase 1 Implementation
