/* ============================================================
   Firebase init (compat SDK, vendored locally — no CDN).
   Loaded BEFORE scripts.js so window.firebase + helpers are ready.
   Backend = Auth (Email/Password) + Cloud Firestore. Media stays in
   Google Drive (Path A), so Firebase Storage is intentionally NOT used.
   This config is public-safe; real security lives in the Firestore rules.
   ============================================================ */
(function () {
  var cfg = {
    apiKey: "AIzaSyCA_tyDgka-1UAjQeG_Lt2YmX9-Rf1HYi0",
    authDomain: "window-guardians-marketing.firebaseapp.com",
    projectId: "window-guardians-marketing",
    storageBucket: "window-guardians-marketing.firebasestorage.app",
    messagingSenderId: "791954514814",
    appId: "1:791954514814:web:de105d363d6009afd8892f"
  };
  try {
    if (window.firebase && firebase.initializeApp) {
      if (!firebase.apps || !firebase.apps.length) firebase.initializeApp(cfg);
      window.WG_AUTH = firebase.auth();
      // keep people signed in across app re-opens (esp. the installed Quick Upload shortcut)
      try { window.WG_AUTH.setPersistence(firebase.auth.Auth.Persistence.LOCAL); } catch (e) {}
      window.WG_DB = firebase.firestore();
      window.WG_FB_READY = true;
    } else {
      window.WG_FB_READY = false;
      window.WG_FB_ERR = "Firebase SDK not loaded";
    }
  } catch (e) {
    window.WG_FB_READY = false;
    window.WG_FB_ERR = String(e);
  }
})();
