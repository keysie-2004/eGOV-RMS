const { initializeApp } = require('firebase/app');
const { getFirestore, collection, addDoc, serverTimestamp } = require('firebase/firestore');

const firebaseConfig = {
  apiKey: "AIzaSyC8Abwais4AHobcyXtQN2X6aQDuIXmM2YM",
  authDomain: "hareneth-cgsd.firebaseapp.com",
  projectId: "hareneth-cgsd",
  storageBucket: "hareneth-cgsd.appspot.com",
  messagingSenderId: "499890967015",
  appId: "1:499890967015:web:07652d7f53651108512d42"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

module.exports = { db, collection, addDoc, serverTimestamp };