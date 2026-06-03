// firebase-config.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.9.1/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/11.9.1/firebase-analytics.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.9.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.9.1/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/11.9.1/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyC7h2iqH-RN4uXjPAELmYtJfOtyZq5iY3U",
  authDomain: "lifeonadeadlineapp.firebaseapp.com",
  projectId: "lifeonadeadlineapp",
  storageBucket: "lifeonadeadlineapp.appspot.com",
  messagingSenderId: "573691334631",
  appId: "1:573691334631:web:899a12ef2fa52fc391b742",
  measurementId: "G-JFY3ZHS55M"
};

const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

export { app, analytics, auth, db, storage };
