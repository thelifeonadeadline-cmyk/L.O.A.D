// ------------------- MEAL PLANNER -------------------
const mealForm = document.getElementById('mealForm');
const mealList = document.getElementById('mealList');

mealForm.addEventListener('submit', function (e) {
  e.preventDefault();

  const meal = document.getElementById('meal').value;
  const time = document.getElementById('time').value;

  const div = document.createElement('div');
  div.className = 'meal-item';
  div.innerHTML = `<strong>${time}</strong>: ${meal}`;

  mealList.appendChild(div);
  mealForm.reset();
});


// ------------------- SLEEP TRACKER -------------------
const sleepForm = document.getElementById('sleepForm');
const sleepTimeInput = document.getElementById('sleepTime');
const wakeTimeInput = document.getElementById('wakeTime');
const logList = document.getElementById('logList');
const clearBtn = document.getElementById('clearLogs');

function calculateSleepHours(sleepTime, wakeTime) {
  const [sleepH, sleepM] = sleepTime.split(':').map(Number);
  const [wakeH, wakeM] = wakeTime.split(':').map(Number);

  const sleepDate = new Date();
  sleepDate.setHours(sleepH, sleepM);

  const wakeDate = new Date();
  wakeDate.setHours(wakeH, wakeM);

  if (wakeDate <= sleepDate) {
    wakeDate.setDate(wakeDate.getDate() + 1); // overnight sleep
  }

  const diffMs = wakeDate - sleepDate;
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs / (1000 * 60)) % 60);
  return `${hours}h ${minutes}m`;
}

function addToLog(entry) {
  const li = document.createElement('li');
  li.textContent = entry;
  logList.prepend(li);

  const existing = JSON.parse(localStorage.getItem('sleepLog') || '[]');
  existing.unshift(entry);
  localStorage.setItem('sleepLog', JSON.stringify(existing));
}

function loadLog() {
  const saved = JSON.parse(localStorage.getItem('sleepLog') || '[]');
  logList.innerHTML = '';
  saved.forEach(entry => {
    const li = document.createElement('li');
    li.textContent = entry;
    logList.appendChild(li);
  });
}

sleepForm.addEventListener('submit', function (e) {
  e.preventDefault();
  const sleep = sleepTimeInput.value;
  const wake = wakeTimeInput.value;

  if (!sleep || !wake) return;

  const duration = calculateSleepHours(sleep, wake);
  const today = new Date().toLocaleDateString();
  const entry = `${today}: Slept ${duration}`;
  addToLog(entry);

  sleepForm.reset();
});

clearBtn.addEventListener("click", () => {
  if (confirm("Are you sure you want to clear all sleep logs?")) {
    localStorage.removeItem("sleepLog");
    logList.innerHTML = '';
  }
});

loadLog();


// ------------------- SELF CARE ROUTINE -------------------
function addSelfCareTask() {
  const time = document.getElementById("timeOfDay").value;
  const type = document.getElementById("careType").value;
  const task = document.getElementById("customTask").value.trim();

  if (task) {
    const listItem = document.createElement("li");
    listItem.textContent = `${time.charAt(0).toUpperCase() + time.slice(1)} - ${type.charAt(0).toUpperCase() + type.slice(1)}: ${task}`;
    document.getElementById("routineList").appendChild(listItem);
    document.getElementById("customTask").value = "";
  }
}

function downloadRoutine() {
  let content = "Self-Care Routine:\n";
  document.querySelectorAll("#routineList li").forEach(item => {
    content += `- ${item.textContent}\n`;
  });

  const blob = new Blob([content], { type: "text/plain" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "self_care_routine.txt";
  link.click();
}

// ------------------- GRATITUDE JOURNAL -------------------
const today = new Date().toISOString().split('T')[0];

function saveEntry() {
  const entry = document.getElementById('entry').value.trim();
  const status = document.getElementById('status');

  if (!entry) {
    status.textContent = "Please write something you're grateful for.";
    status.style.color = 'red';
    return;
  }

  if (localStorage.getItem('gratitude-' + today)) {
    status.textContent = "You've already written a gratitude entry for today. Come back tomorrow!";
    status.style.color = 'orange';
    return;
  }

  localStorage.setItem('gratitude-' + today, entry);
  status.textContent = "Your gratitude has been saved for today. 💛";
  status.style.color = 'green';
  document.getElementById('entry').value = '';
}
// Chat box disappear
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
import { auth } from "./firebase-config.js";

const chatBtn = document.getElementById("ai-button");         // Your AI bubble
const fakeMessage = document.getElementById("fake-ai-message");
const realAI = document.getElementById("real-ai");

onAuthStateChanged(auth, (user) => {
  if (user) {
    // User is logged in
    chatBtn.onclick = () => {
      // Hide the button after 1 second
      setTimeout(() => {
        chatBtn.style.display = "none"; // hide the floating button
        realAI.style.display = "block"; // show the real AI
      }, 1000);
    };
  } else {
    // User is NOT logged in
    chatBtn.onclick = () => {
      fakeMessage.style.display = "block";

      setTimeout(() => {
        fakeMessage.style.display = "none";
      }, 4000);
    };
  }
});
