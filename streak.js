// streak.js
// Central streak & tool-usage tracking used by tools (focus, topic, fitness).
// Rules:
// - Allowed tracked tools: focus_timer, topic_allocator, fitness_workout, fitness_progress, fitness_challenge_day
// - Day becomes VALID when >= 2 different tracked tools used that day
// - Streak resets if 48 hours pass without a valid day
// - productivityScore += (countToday * 10) the FIRST time the day becomes valid

import { auth, db } from "./firebase-config.js";
import {
  doc, getDoc, setDoc, updateDoc, serverTimestamp, increment
} from "https://www.gstatic.com/firebasejs/11.9.1/firebase-firestore.js";

/* ========== HELPERS ========== */

function dateKeyForTs(ts = new Date()){
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function secondsBetween(a, b){
  return Math.abs((a.getTime() - b.getTime())/1000);
}

/* ========== ALLOWED TOOLS ========== */

const allowedTools = {
  focus_timer: true,
  topic_allocator: true,
  fitness_workout: true,
  fitness_progress: true,
  fitness_challenge_day: true
};

/* ========== PUBLIC FUNCTIONS (USED BY TOOLS) ========== */

export async function recordFocusCompletion(){
  await logToolUsage("focus_timer");
}

export async function recordTopicAdded(){
  await logToolUsage("topic_allocator");
}

export async function recordWorkoutTimer(){
  await logToolUsage("fitness_workout");
  await incrementUserCounter("fitness", 1);
}

export async function recordProgressLog(){
  await logToolUsage("fitness_progress");
  await incrementUserCounter("fitness", 1);
}

export async function recordChallengeCompletion(){
  await logToolUsage("fitness_challenge_day");
  await incrementUserCounter("fitness", 1);
}

/* ========== CORE LOGGING ========== */

async function logToolUsage(toolId){
  if(!auth?.currentUser) return;
  if(!allowedTools[toolId]) return;

  const uid = auth.currentUser.uid;
  const todayKey = dateKeyForTs();
  const usageRef = doc(db, "users", uid, "usage", todayKey);

  await setDoc(usageRef, {
    tools: { [toolId]: true },
    updatedAt: serverTimestamp()
  }, { merge: true });

  return await updateStreakAfterUsage(uid, todayKey);
}

async function incrementUserCounter(field, amount){
  if(!auth?.currentUser) return;
  const uid = auth.currentUser.uid;
  const userRef = doc(db, "users", uid);

  try {
    await updateDoc(userRef, { [field]: increment(amount) });
  } catch {
    await setDoc(userRef, { [field]: amount }, { merge: true });
  }
}

/* ========== STREAK LOGIC ========== */

async function getToolsUsedCount(uid, dateKey){
  const usageRef = doc(db, "users", uid, "usage", dateKey);
  const snap = await getDoc(usageRef);
  if(!snap.exists()) return 0;

  const tools = snap.data().tools || {};
  return Object.values(tools).filter(v => v).length;
}

async function updateStreakAfterUsage(uid, todayKey){
  const userRef = doc(db, "users", uid);
  const snap = await getDoc(userRef);
  const user = snap.exists() ? snap.data() : {};

  const prevValidDay = user.lastValidDay || null;
  const prevStreak = Number(user.streak) || 0;
  let productivityScore = Number(user.productivityScore) || 0;

  const countToday = await getToolsUsedCount(uid, todayKey);
  const todayValid = countToday >= 2;

  if(!todayValid){
    if(!snap.exists()){
      await setDoc(userRef, { streak: 0, lastValidDay: "", productivityScore: 0 }, { merge:true });
    }
    return;
  }

  let newStreak = 1;

  if(prevValidDay){
    const [y, m, d] = prevValidDay.split("-").map(Number);
    const prevDate = new Date(y, m-1, d);
    const diffSec = secondsBetween(new Date(), prevDate);

    if(diffSec <= 48 * 3600){
      if(prevValidDay !== todayKey) newStreak = prevStreak + 1;
      else newStreak = prevStreak;
    }
  }

  if(prevValidDay !== todayKey){
    productivityScore += countToday * 10;
  }

  await setDoc(userRef, {
    streak: newStreak,
    lastValidDay: todayKey,
    productivityScore
  }, { merge:true });

  return { streak: newStreak, productivityScore };
}

/* ========== DASHBOARD HELPERS ========== */

export async function getUserStreakSummary(uid){
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);

  if(!snap.exists()) {
    return {
      streak: 0,
      productivityScore: 0,
      lastValidDay: null,
      study: 0, lifestyle: 0, fitness: 0, budget: 0
    };
  }

  const d = snap.data();
  return {
    streak: Number(d.streak) || 0,
    productivityScore: Number(d.productivityScore) || 0,
    lastValidDay: d.lastValidDay || null,
    study: Number(d.study) || 0,
    lifestyle: Number(d.lifestyle) || 0,
    fitness: Number(d.fitness) || 0,
    budget: Number(d.budget) || 0
  };
}

export async function getTodayUsage(uid){
  const todayKey = dateKeyForTs();
  const ref = doc(db, "users", uid, "usage", todayKey);
  const snap = await getDoc(ref);
  if(!snap.exists()) return { tools:{}, updatedAt:null };
  return snap.data();
}
