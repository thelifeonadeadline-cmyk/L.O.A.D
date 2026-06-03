// javascript.js (MODULE version) — FULL UPDATED (B1)
//
// Rewritten to:
// - Merge & dedupe imports
// - Provide unified activity logging (logs both per-user counters and detailed activity docs)
// - Integrate activity logging into all tools (timer, topic planner, tasks, time blocks, meal planner,
//   self-care, gratitude, fitness tools)
// - Update streak logic to allow a 48-hour gap before resetting
// - Expose ensureUserDoc(user) and logActivity(category, action) as exports and attach them to window
//
// Usage: replace your old javascript.js with this file.

import { auth, db } from "./firebase-config.js";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  increment,
  arrayUnion,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.9.1/firebase-firestore.js";

/* ==========================
   Public exports
   ========================== */

/**
 * Ensure a user doc exists with baseline fields.
 * exported: ensureUserDoc(user)
 */
export async function ensureUserDoc(user) {
  if (!user) return;
  const userRef = doc(db, "users", user.uid);
  try {
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      await setDoc(userRef, {
        email: user.email || null,
        study: 0,
        lifestyle: 0,
        fitness: 0,
        budget: 0,
        profilePhoto: null,
        streak: 0,
        lastValidDay: null,
        productivityScore: 0,
        joinedAt: serverTimestamp()
      }, { merge: true });
    }
  } catch (err) {
    console.error("ensureUserDoc error:", err);
    // best-effort fallback
    try {
      await setDoc(userRef, {
        email: user.email || null,
        study: 0,
        lifestyle: 0,
        fitness: 0,
        budget: 0,
        profilePhoto: null,
        streak: 0,
        lastValidDay: null,
        productivityScore: 0,
        joinedAt: serverTimestamp()
      }, { merge: true });
    } catch (e2) {
      console.error("ensureUserDoc fallback failed:", e2);
    }
  }
}

/**
 * Unified activity logger.
 * - category: "study" | "fitness" | "lifestyle" | "budget"
 * - action: free-form string describing the action (e.g. "timer_start", "topic_add", "workout_reset")
 *
 * exported: logActivity(category, action)
 */
export async function logActivity(category, action) {
  const allowed = ["study", "fitness", "lifestyle", "budget"];
  if (!allowed.includes(category)) {
    console.warn("logActivity: invalid category", category);
    return;
  }

  const user = auth.currentUser;
  if (!user) {
    console.warn("logActivity: no authenticated user");
    return;
  }

  // Ensure user doc exists and increment category counter
  const userRef = doc(db, "users", user.uid);
  try {
    await ensureUserDoc(user);
    // increment the summary counter (study, fitness, etc.)
    await updateDoc(userRef, { [category]: increment(1) });
  } catch (err) {
    // fallback: set doc with initial values including the incremented field
    try {
      await setDoc(userRef, {
        email: user.email || null,
        study: 0,
        lifestyle: 0,
        fitness: 0,
        budget: 0,
        streak: 0,
        lastValidDay: null,
        productivityScore: 0,
        [category]: 1
      }, { merge: true });
    } catch (e2) {
      console.error("logActivity: failed to update user counters:", e2);
    }
  }

  // Also write a lightweight activity log in a separate 'userActivity' doc for analytics/timeline
  const activityRef = doc(db, "userActivity", user.uid);
  try {
    await setDoc(activityRef, {
      logs: arrayUnion({
        category,
        action,
        timestamp: serverTimestamp()
      })
    }, { merge: true });
  } catch (err) {
    console.error("logActivity: failed to write activity log:", err);
  }

  // After recording activity, update streak logic (best-effort)
  try {
    const userSnap = await getDoc(userRef);
    const userData = userSnap.exists() ? userSnap.data() : {};
    await updateStreakIfNeeded(userRef, userData);
  } catch (err) {
    // non-fatal
    console.error("logActivity: updateStreakIfNeeded failed:", err);
  }
}

/* ==========================
   Internal helpers (streak + date utilities)
   ========================== */

function fmtYYYYMMDD(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function secondsBetween(a, b) {
  return Math.abs((a.getTime() - b.getTime()) / 1000);
}

/**
 * updateStreakIfNeeded(userRef, userData)
 * - A day becomes VALID when the user triggers at least 2 distinct tracked tools that day.
 *   (This file can't by itself read usage subcollection — it relies on the app tools to call
 *   logActivity for distinct actions. The streak update here uses lastValidDay and
 *   enforces the 48-hr gap rule.)
 *
 * - If lastValidDay is within 48 hours of now (strict <= 48h), increment streak; otherwise reset to 1.
 * - Also increases productivityScore by 10 per tracked action the first time the day becomes valid.
 *
 * Note: This function expects userData (may be empty object) and will update the user doc.
 */
async function updateStreakIfNeeded(userRef, userData = {}) {
  const todayKey = fmtYYYYMMDD(new Date());
  const prevValidDay = userData.lastValidDay || null;
  let prevStreak = Number(userData.streak) || 0;
  let productivityScore = Number(userData.productivityScore) || 0;

  // If already recorded as valid today, do nothing (but return current state)
  if (prevValidDay === todayKey) {
    return { streak: prevStreak, lastValidDay: prevValidDay, productivityScore };
  }

  // Determine if previous valid day was within 48 hours
  let newStreak = 1;
  if (prevValidDay) {
    // parse prevValidDay
    const [y, m, d] = prevValidDay.split("-").map(Number);
    const prevDate = new Date(y, m - 1, d);
    const diffSec = secondsBetween(new Date(), prevDate);
    if (diffSec <= 48 * 3600) {
      // continue streak
      newStreak = (prevStreak || 0) + 1;
    } else {
      newStreak = 1;
    }
  } else {
    newStreak = 1;
  }

  // For productivityScore: add a base of 10 for this new valid day (this is conservative).
  // NOTE: Ideally you'd add (toolsUsedCount * 10), but counting tools requires reading usage subcollection.
  // Here we add +10 the first time the day becomes valid (to keep scoring moving).
  productivityScore += 10;

  try {
    await updateDoc(userRef, {
      streak: newStreak,
      lastValidDay: todayKey,
      productivityScore
    });
  } catch (err) {
    // fallback: set doc
    try {
      await setDoc(userRef, {
        streak: newStreak,
        lastValidDay: todayKey,
        productivityScore
      }, { merge: true });
    } catch (e2) {
      console.error("updateStreakIfNeeded: failed to set user doc:", e2);
    }
  }

  return { streak: newStreak, lastValidDay: todayKey, productivityScore };
}

/* ==========================
   DOM wiring — attach logging to tools where present
   ========================== */

window.addEventListener("DOMContentLoaded", () => {
  /* ---------- TIMER (focus) ---------- */
  const timerEl = document.getElementById("timer");
  const modeEl = document.getElementById("mode");
  const focusMinutesInput = document.getElementById("focusMinutes");
  const breakMinutesInput = document.getElementById("breakMinutes");
  const alarmSound = document.getElementById("alarmSound");

  if (timerEl && modeEl && focusMinutesInput && breakMinutesInput) {
    let focusTime = 25 * 60;
    let breakTime = 5 * 60;
    let time = focusTime;
    let timer = null;
    let isRunning = false;
    let isFocus = true;

    function updateDisplay_local() {
      const minutes = Math.floor(time / 60);
      const seconds = time % 60;
      timerEl.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
      modeEl.textContent = isFocus ? "Focus Time" : "Break Time";
    }

    async function startTimer() {
      if (isRunning) return;
      isRunning = true;

      // Log the timer start as a study action
      await logActivity("study", "timer_start").catch(() => {});

      // Ensure user doc exists and try to update streak
      if (auth.currentUser) {
        try {
          await ensureUserDoc(auth.currentUser);
        } catch (e) { /* ignore */ }
      }

      timer = setInterval(async () => {
        if (time > 0) {
          time--;
          updateDisplay_local();
        } else {
          clearInterval(timer);
          isRunning = false;
          try { alarmSound?.play(); } catch (e) {}
          // Log session complete
          await logActivity(isFocus ? "study" : "lifestyle", isFocus ? "focus_complete" : "break_complete").catch(() => {});
          setTimeout(() => {
            if (isFocus) {
              const startBreak = confirm("Focus session over! Start your break?");
              if (startBreak) {
                isFocus = false;
                time = breakTime;
                updateDisplay_local();
                startTimer();
              }
            } else {
              const backToWork = confirm("Break over! Start another focus session?");
              if (backToWork) {
                isFocus = true;
                time = focusTime;
                updateDisplay_local();
                startTimer();
              }
            }
          }, 400);
        }
      }, 1000);
    }

    function pauseTimer() {
      clearInterval(timer);
      isRunning = false;
      // log pause
      logActivity("study", "timer_pause").catch(() => {});
    }

    function resetTimer() {
      pauseTimer();
      const customFocus = parseInt(focusMinutesInput.value, 10);
      const customBreak = parseInt(breakMinutesInput.value, 10);

      focusTime = isNaN(customFocus) ? 25 * 60 : customFocus * 60;
      breakTime = isNaN(customBreak) ? 5 * 60 : customBreak * 60;

      isFocus = true;
      time = focusTime;
      updateDisplay_local();

      // log reset action
      logActivity("study", "timer_reset").catch(() => {});
    }

    // expose for inline handlers (backwards compatibility)
    window.startTimer = startTimer;
    window.pauseTimer = pauseTimer;
    window.resetTimer = resetTimer;

    // bind any present buttons (IDs used across pages)
    const startBtn = document.getElementById("startBtn") || document.getElementById("startTimerBtn") || document.querySelector('button[onclick="startTimer()"]');
    const pauseBtn = document.getElementById("pauseBtn") || document.getElementById("pauseTimerBtn") || document.querySelector('button[onclick="pauseTimer()"]');
    const resetBtn = document.getElementById("resetBtn") || document.getElementById("resetTimerBtn") || document.querySelector('button[onclick="resetTimer()"]');
    const focusModeBtn = document.getElementById("focusModeBtn");
    const breakModeBtn = document.getElementById("breakModeBtn");

    startBtn?.addEventListener("click", startTimer);
    pauseBtn?.addEventListener("click", pauseTimer);
    resetBtn?.addEventListener("click", resetTimer);
    focusModeBtn?.addEventListener("click", () => { isFocus = true; time = parseInt(focusMinutesInput.value, 10) * 60 || focusTime; updateDisplay_local(); });
    breakModeBtn?.addEventListener("click", () => { isFocus = false; time = parseInt(breakMinutesInput.value, 10) * 60 || breakTime; updateDisplay_local(); });

    resetTimer();
  }

  /* ---------- TOPIC PLANNER ---------- */
  const topicForm = document.getElementById("topicForm");
  const topicList = document.getElementById("topicList");
  const totalTimeDisplay = document.getElementById("totalTimeDisplay");

  if (topicForm && topicList && totalTimeDisplay) {
    let topics = JSON.parse(localStorage.getItem("topics") || "[]");

    function saveTopics() { localStorage.setItem("topics", JSON.stringify(topics)); }
    function renderTopics() {
      topicList.innerHTML = "";
      let totalTime = 0;
      topics.forEach((t, idx) => {
        totalTime += t.time;
        const div = document.createElement("div");
        div.className = "topic-card";
        div.innerHTML = `
          <strong>${t.topic}</strong><br/>
          Study Time: ${t.time} min | Marks: ${t.marks}
          <br/><br/>
          <button class="complete-topic" data-index="${idx}">✅ Complete</button>
          <button class="edit-topic" data-index="${idx}">✏️ Edit</button>
          <button class="delete-topic" data-index="${idx}">❌ Delete</button>
        `;
        topicList.appendChild(div);
      });
      totalTimeDisplay.textContent = `Total Study Time Planned: ${totalTime} minutes`;
      saveTopics();
    }

    topicForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const t = document.getElementById("topic").value.trim();
      const time = parseInt(document.getElementById("time").value, 10) || 0;
      const marks = parseInt(document.getElementById("marks").value, 10) || 0;
      if (!t) return;
      topics.push({ topic: t, time, marks });
      topics.sort((a,b)=> b.marks - a.marks);
      renderTopics();
      topicForm.reset();

      // log the addition of a topic
      await logActivity("study", "topic_add").catch(()=>{});
    });

    topicList.addEventListener("click", async (ev) => {
      const btn = ev.target.closest("button");
      if (!btn) return;
      const idx = Number(btn.dataset.index);
      if (btn.classList.contains("complete-topic")) {
        if (confirm("Mark this topic as completed?")) {
          // remove locally
          topics.splice(idx, 1);
          renderTopics();
          // record as study completion / streak tool
          await logActivity("study", "topic_complete").catch(()=>{});
        }
      } else if (btn.classList.contains("edit-topic")) {
        const topic = topics[idx];
        const newTopic = prompt("Edit Topic Name:", topic.topic);
        const newTime = prompt("Edit Study Time (minutes):", topic.time);
        const newMarks = prompt("Edit Marks:", topic.marks);
        if (newTopic && newTime && newMarks) {
          topics[idx] = { topic: newTopic, time: parseInt(newTime,10), marks: parseInt(newMarks,10) };
          topics.sort((a,b)=> b.marks - a.marks);
          renderTopics();
          await logActivity("study", "topic_edit").catch(()=>{});
        }
      } else if (btn.classList.contains("delete-topic")) {
        if (confirm("Are you sure you want to delete this topic?")) {
          topics.splice(idx, 1);
          renderTopics();
          await logActivity("study", "topic_delete").catch(()=>{});
        }
      }
    });

    renderTopics();
  }

  /* ---------- TASK PLANNER ---------- */
  const taskForm = document.getElementById("taskForm");
  const taskListEl = document.getElementById("taskList");
  if (taskForm && taskListEl) {
    let tasks = JSON.parse(localStorage.getItem("tasks") || "[]");

    function saveTasks() { localStorage.setItem("tasks", JSON.stringify(tasks)); }
    function renderTasks() {
      taskListEl.innerHTML = "";
      tasks.forEach((t, i) => {
        const div = document.createElement("div");
        div.className = `task-card priority-${t.priority} ${t.completed ? "completed" : ""}`;
        div.innerHTML = `<span>${t.name}</span> <button class="toggle-task" data-index="${i}">${t.completed ? "Undo" : "Done"}</button>`;
        taskListEl.appendChild(div);
      });
      saveTasks();
    }

    taskForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = document.getElementById("taskName").value.trim();
      const priority = document.getElementById("priority").value;
      if (!name) return;
      tasks.push({ name, priority, completed: false });
      renderTasks();
      taskForm.reset();
      await logActivity("study", "task_add").catch(()=>{});
    });

    taskListEl.addEventListener("click", async (ev) => {
      const btn = ev.target.closest("button");
      if (!btn) return;
      const idx = Number(btn.dataset.index);
      if (btn.classList.contains("toggle-task")) {
        tasks[idx].completed = !tasks[idx].completed;
        renderTasks();
        await logActivity("study", tasks[idx].completed ? "task_complete" : "task_toggle").catch(()=>{});
      }
    });

    renderTasks();
    window.toggleTask = (i) => { if (tasks[i]) { tasks[i].completed = !tasks[i].completed; renderTasks(); logActivity("study", tasks[i].completed ? "task_complete" : "task_toggle").catch(()=>{}); } };
  }

  /* ---------- TIME BLOCK SCHEDULER ---------- */
  const timeBlockForm = document.getElementById("timeBlockForm");
  const scheduleEl = document.getElementById("schedule");
  if (timeBlockForm && scheduleEl) {
    let timeBlocks = JSON.parse(localStorage.getItem("timeBlocks") || "[]");

    function saveBlocks() { localStorage.setItem("timeBlocks", JSON.stringify(timeBlocks)); }
    function renderBlocks() {
      scheduleEl.innerHTML = "";
      timeBlocks.forEach((b,i) => {
        const div = document.createElement("div");
        div.className = "block";
        div.innerHTML = `<span>${b.task}</span><small>${b.start} - ${b.end}</small> <button class="delete-block" data-index="${i}">❌</button>`;
        scheduleEl.appendChild(div);
      });
      saveBlocks();
    }

    timeBlockForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const task = document.getElementById("blockTask").value.trim();
      const start = document.getElementById("startTime").value;
      const end = document.getElementById("endTime").value;
      if (!task || !start || !end || start >= end) return alert("Enter valid times.");
      timeBlocks.push({ task, start, end });
      renderBlocks();
      timeBlockForm.reset();
      await logActivity("study", "timeblock_add").catch(()=>{});
    });

    scheduleEl.addEventListener("click", async (ev) => {
      const btn = ev.target.closest("button");
      if (!btn) return;
      const idx = Number(btn.dataset.index);
      if (btn.classList.contains("delete-block")) {
        timeBlocks.splice(idx, 1);
        renderBlocks();
        await logActivity("study", "timeblock_delete").catch(()=>{});
      }
    });

    renderBlocks();
    window.deleteBlock = (i) => { timeBlocks.splice(i,1); renderBlocks(); logActivity("study", "timeblock_delete").catch(()=>{}); };
  }

  /* ---------- MEAL PLANNER ---------- */
  const mealForm = document.getElementById("mealForm");
  const mealList = document.getElementById("mealList");
  if (mealForm && mealList) {
    let meals = JSON.parse(localStorage.getItem("meals") || "[]");
    function saveMeals(){ localStorage.setItem("meals", JSON.stringify(meals)); }
    function renderMeals(){ mealList.innerHTML=''; meals.forEach((m,i)=>{ const div=document.createElement('div'); div.className='meal-item'; div.innerHTML=`<strong>${m.time}</strong>: ${m.meal} <button data-index="${i}" class="delete-meal">❌</button>`; mealList.appendChild(div); }); saveMeals(); }
    mealForm.addEventListener('submit', async (e)=>{ e.preventDefault(); const meal=document.getElementById('meal').value.trim(); const time=document.getElementById('time').value; if(!meal||!time) return; meals.push({ meal, time }); renderMeals(); mealForm.reset(); await logActivity("lifestyle","meal_add").catch(()=>{}); });
    mealList.addEventListener("click", async (ev) => {
      const btn = ev.target.closest("button");
      if(!btn) return;
      const idx = Number(btn.dataset.index);
      if (btn.classList.contains("delete-meal")) {
        meals.splice(idx,1); renderMeals(); await logActivity("lifestyle","meal_delete").catch(()=>{});
      }
    });
    renderMeals();
  }

  /* ---------- SELF-CARE ROUTINE ---------- */
  const routineList = document.getElementById("routineList");
  if (routineList) {
    function saveRoutine() {
      const items = [];
      routineList.querySelectorAll("li").forEach(li => items.push(li.textContent));
      localStorage.setItem("selfCareRoutine", JSON.stringify(items));
    }
    function loadRoutine() {
      const items = JSON.parse(localStorage.getItem("selfCareRoutine") || "[]");
      items.forEach(text => {
        const li = document.createElement('li');
        li.textContent = text;
        routineList.appendChild(li);
      });
    }
    window.addSelfCareTask = async function addSelfCareTask() {
      const time = document.getElementById("timeOfDay")?.value || "";
      const type = document.getElementById("careType")?.value || "";
      const task = document.getElementById("customTask")?.value.trim();
      if (task) {
        const li = document.createElement("li");
        li.textContent = `${time} - ${type}: ${task}`;
        routineList.appendChild(li);
        document.getElementById("customTask").value = "";
        saveRoutine();
        await logActivity("lifestyle", "selfcare_add").catch(()=>{});
      }
    };
    window.downloadRoutine = function downloadRoutine() {
      let content = "Self-Care Routine:\n";
      routineList.querySelectorAll("li").forEach(item => content += `- ${item.textContent}\n`);
      const blob = new Blob([content], { type: "text/plain" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "self_care_routine.txt";
      link.click();
    };
    loadRoutine();
  }

  /* ---------- GRATITUDE JOURNAL ---------- */
  const gratitudeEntry = document.getElementById("entry");
  const gratitudeStatus = document.getElementById("status");
  if (gratitudeEntry && gratitudeStatus) {
    const today = new Date().toISOString().split('T')[0];
    window.saveEntry = async function saveEntry() {
      const entry = gratitudeEntry.value.trim();
      if (!entry) {
        gratitudeStatus.textContent = "Please write something you're grateful for.";
        gratitudeStatus.style.color = "red";
        return;
      }
      if (localStorage.getItem("gratitude-" + today)) {
        gratitudeStatus.textContent = "You've already written a gratitude entry for today. Come back tomorrow!";
        gratitudeStatus.style.color = "orange";
        return;
      }
      localStorage.setItem("gratitude-" + today, entry);
      gratitudeStatus.textContent = "Your gratitude has been saved for today. 💛";
      gratitudeStatus.style.color = "green";
      gratitudeEntry.value = "";
      await logActivity("lifestyle", "gratitude_write").catch(()=>{});
    };
  }

  /* ---------- FITNESS PAGE HOOKS (workout/progress/challenge) ---------- */
  // elements may be present on fitness.html
  const workoutDisplay = document.getElementById("workoutDisplay");
  const startWorkoutBtn = document.getElementById("startWorkoutBtn");
  const pauseWorkoutBtn = document.getElementById("pauseWorkoutBtn");
  const resetWorkoutBtn = document.getElementById("resetWorkoutBtn");
  if (workoutDisplay && startWorkoutBtn && pauseWorkoutBtn && resetWorkoutBtn) {
    let workoutSeconds = 0;
    let workoutInterval = null;
    function updateWorkoutDisplay() {
      const mm = String(Math.floor(workoutSeconds / 60)).padStart(2,'0');
      const ss = String(workoutSeconds % 60).padStart(2,'0');
      workoutDisplay.textContent = `${mm}:${ss}`;
    }
    startWorkoutBtn.addEventListener('click', async () => {
      if (workoutInterval) return;
      workoutInterval = setInterval(() => { workoutSeconds++; updateWorkoutDisplay(); }, 1000);
      await logActivity("fitness", "workout_start").catch(()=>{});
    });
    pauseWorkoutBtn.addEventListener('click', async () => {
      clearInterval(workoutInterval); workoutInterval = null;
      await logActivity("fitness", "workout_pause").catch(()=>{});
    });
    resetWorkoutBtn.addEventListener('click', async () => {
      if (workoutSeconds > 0) {
        // count as a workout completion
        await logActivity("fitness", "workout_complete").catch(()=>{});
      }
      clearInterval(workoutInterval);
      workoutInterval = null;
      workoutSeconds = 0;
      updateWorkoutDisplay();
    });
    updateWorkoutDisplay();
  }

  // Progress logger on fitness page
  const progressForm = document.getElementById("progressForm");
  const logList = document.getElementById("logList");
  if (progressForm && logList) {
    function renderLogs() {
      const logs = JSON.parse(localStorage.getItem("progressLogs") || "[]");
      logList.innerHTML = "";
      logs.forEach(log => {
        const li = document.createElement("li");
        li.innerHTML = `<strong>${log.date}</strong><br>${log.note}`;
        logList.appendChild(li);
      });
    }
    progressForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const date = document.getElementById("logDate").value;
      const note = document.getElementById("workoutNote").value.trim();
      if (!date || !note) return;
      const logs = JSON.parse(localStorage.getItem("progressLogs") || "[]");
      logs.unshift({ date, note });
      localStorage.setItem("progressLogs", JSON.stringify(logs));
      renderLogs();
      await logActivity("fitness", "progress_log").catch(()=>{});
      progressForm.reset();
    });
    renderLogs();
  }

  // Challenge tracker (fitness)
  const challengeForm = document.getElementById("challengeForm");
  const challengeTracker = document.getElementById("challengeTracker");
  if (challengeForm && challengeTracker) {
    const challengeTitle = document.getElementById("challengeTitle");
    const daysContainer = document.getElementById("daysContainer");
    const completedCount = document.getElementById("completedCount");

    function renderChallenge() {
      const saved = JSON.parse(localStorage.getItem("fitnessChallenge") || "null");
      if (!saved) {
        challengeForm.style.display = "block";
        challengeTracker.style.display = "none";
        return;
      }
      challengeForm.style.display = "none";
      challengeTracker.style.display = "block";
      challengeTitle.textContent = saved.name;
      daysContainer.innerHTML = "";
      saved.completed.forEach((done, i) => {
        const day = document.createElement("div");
        day.className = "day-box" + (done ? " completed" : "");
        day.textContent = i + 1;
        day.addEventListener("click", async () => {
          const before = saved.completed[i];
          saved.completed[i] = !saved.completed[i];
          // if turning from false -> true, record completion
          if (!before && saved.completed[i]) {
            await logActivity("fitness", "challenge_day_complete").catch(()=>{});
          }
          localStorage.setItem("fitnessChallenge", JSON.stringify(saved));
          renderChallenge();
        });
        daysContainer.appendChild(day);
      });
      const totalDone = saved.completed.filter(Boolean).length;
      completedCount.textContent = totalDone;
    }

    challengeForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const name = document.getElementById("challengeName").value.trim();
      const days = parseInt(document.getElementById("challengeDays").value, 10);
      if (!name || !days) return;
      const obj = { name, days, completed: Array(days).fill(false) };
      localStorage.setItem("fitnessChallenge", JSON.stringify(obj));
      logActivity("fitness", "challenge_start").catch(()=>{});
      renderChallenge();
    });

    document.getElementById("resetChallenge")?.addEventListener("click", () => {
      if (confirm("Reset challenge? This will erase progress.")) {
        localStorage.removeItem("fitnessChallenge");
        renderChallenge();
      }
    });

    renderChallenge();
  }

  /* ---------- Small auth UI wiring (if present) ---------- */
  const authArea = document.getElementById("authArea");
  const mobileAuthArea = document.getElementById("mobileAuthArea");
  const navUser = document.getElementById("navUser");

  if (authArea || mobileAuthArea || navUser) {
    import("https://www.gstatic.com/firebasejs/11.9.1/firebase-auth.js").then(mod => {
      const { onAuthStateChanged, signOut } = mod;
      onAuthStateChanged(auth, async (user) => {
        if (user) {
          let displayName = user.email?.split("@")[0] || "User";
          try {
            const userDocRef = doc(db, "users", user.uid);
            const userDocSnap = await getDoc(userDocRef);
            if (!userDocSnap.exists()) {
              await setDoc(userDocRef, { email: user.email, name: displayName, joinedAt: serverTimestamp() }, { merge: true });
            } else {
              displayName = userDocSnap.data().name || displayName;
            }
          } catch (err) {
            console.error("Firestore fetch error:", err);
          }
          if (authArea) authArea.innerHTML = `<span style="color:white; font-weight:bold;"> ${displayName}</span> <a href="#" id="logoutBtn">Logout</a>`;
          if (mobileAuthArea) mobileAuthArea.innerHTML = `<span style="color:white; font-weight:bold;"> ${displayName}</span><br><a href="#" id="mobileLogoutBtn">Logout</a>`;
          if (navUser) navUser.textContent = displayName;

          // attach logout handlers
          setTimeout(()=> {
            const lb = document.getElementById("logoutBtn");
            if (lb) lb.addEventListener('click', async (e) => { e.preventDefault(); try{ await signOut(auth); }catch(err){console.error(err);} });
            const mlb = document.getElementById("mobileLogoutBtn");
            if (mlb) mlb.addEventListener('click', async (e) => { e.preventDefault(); try{ await signOut(auth); }catch(err){console.error(err);} });
          }, 200);
        } else {
          if (authArea) authArea.innerHTML = `<a href="login.html">Login</a> / <a href="signup.html">Sign Up</a>`;
          if (mobileAuthArea) mobileAuthArea.innerHTML = `<a href="login.html" onclick="toggleSidebar()">Login</a> / <a href="signup.html" onclick="toggleSidebar()">Sign Up</a>`;
          if (navUser) navUser.textContent = "";
        }
      });
    }).catch(err => console.error("auth import error", err));
  }

}); // end DOMContentLoaded

/* ==========================
   Backwards compatibility: attach to window
   ========================== */
window.ensureUserDoc = ensureUserDoc;
window.logActivity = logActivity;
