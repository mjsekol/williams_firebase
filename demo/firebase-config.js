// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCxL7D_tUR-nz3gHQmuXJWlq9fhmdQp4n0",
  authDomain: "app2-1569c.firebaseapp.com",
  projectId: "app2-1569c",
  storageBucket: "app2-1569c.firebasestorage.app",
  messagingSenderId: "195014078004",
  appId: "1:195014078004:web:176fe75b2d72632493a461",
  measurementId: "G-EB6WXPFX1M"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
window.PROBLEM_REPORT_FIREBASE_CONFIG = firebaseConfig;
