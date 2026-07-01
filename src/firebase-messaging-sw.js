// 1. Firebase Scripts ko import karein (Compat Version)
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

// 2. Apna Firebase Config Object yahan dalein
// (Is config ko apne Firebase Console -> Project Settings se copy karke replace karein)
const firebaseConfig = {
  apiKey: "AIzaSyAXEbSiNSrdVtcFNopn_YPrL0MNXRp4Oqk",
  authDomain: "pushnotification-4de58.firebaseapp.com",
  projectId: "pushnotification-4de58",
  storageBucket: "pushnotification-4de58.firebasestorage.app",
  messagingSenderId: "492098009563",
  appId: "1:492098009563:web:23fac7670072e4b869cffe",
  measurementId: "G-QCEDTTBR9C"
};

// 3. Firebase ko initialize karein
firebase.initializeApp(firebaseConfig);

// 4. Messaging ka instance lein
const messaging = firebase.messaging();

// 5. Background notifications handle karne ke liye logger
messaging.onBackgroundMessage((payload) => {
    console.log('[firebase-messaging-sw.js] Received background message ', payload);
    
    const notificationTitle = payload.notification.title;
    const notificationOptions = {
        body: payload.notification.body,
        icon: '/firebase-logo.png' // Agar icon nahi hai toh yeh line hata sakte hain
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
});