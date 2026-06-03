// dashboard.js
import { auth, db } from "./firebase-config.js";
import {
  doc,
  getDoc,
  onSnapshot,
  collection
} from "https://www.gstatic.com/firebasejs/11.9.1/firebase-firestore.js";

window.addEventListener("DOMContentLoaded", () => {
  const streakEl = document.getElementById("streakDisplay");
  const scoreEl = document.getElementById("scoreDisplay");
  const studyEl = document.getElementById("studyCount");
  const fitnessEl = document.getElementById("fitnessCount");
  const lifestyleEl = document.getElementById("lifestyleCount");
  const budgetEl = document.getElementById("budgetCount");
  const lastActiveEl = document.getElementById("lastActive");
  const activityChartCanvas = document.getElementById("activityChart");

  if (!auth.currentUser) {
    streakEl.textContent = 0;
    scoreEl.textContent = 0;
    return;
  }

  const uid = auth.currentUser.uid;
  const userRef = doc(db, "users", uid);
  const activityRef = doc(db, "userActivity", uid);

  // LIVE UPDATE USER STATS
  onSnapshot(userRef, (snap) => {
    if (!snap.exists()) return;

    const data = snap.data();

    streakEl.textContent = data.streak ?? 0;
    scoreEl.textContent = data.productivityScore ?? 0;

    studyEl.textContent = data.study ?? 0;
    fitnessEl.textContent = data.fitness ?? 0;
    lifestyleEl.textContent = data.lifestyle ?? 0;
    budgetEl.textContent = data.budget ?? 0;

    lastActiveEl.textContent = data.lastActive ?? "—";
  });

  // ---- ACTIVITY CHART ----
  onSnapshot(activityRef, (snap) => {
    if (!snap.exists()) return;

    const logs = snap.data().logs || [];

    // Count logs per day
    const counts = {};
    logs.forEach((log) => {
      const day = log.timestamp.toDate().toISOString().split("T")[0];
      counts[day] = (counts[day] || 0) + 1;
    });

    const labels = Object.keys(counts).sort();
    const values = labels.map((d) => counts[d]);

    if (window.activityChartInstance)
      window.activityChartInstance.destroy();

    window.activityChartInstance = new Chart(activityChartCanvas, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Daily Activity",
            data: values,
            borderWidth: 3
          }
        ]
      },
      options: {
        responsive: true,
        scales: {
          y: { beginAtZero: true }
        }
      }
    });
  });
});
