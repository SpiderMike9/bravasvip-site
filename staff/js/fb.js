// BRAVAS staff: shared Firebase setup + staff gate.
// The web config is public by design. Security comes from Firestore rules.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, getDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDLoh2DNKWq_WFOD9zfnsScdyDd1tj_gh4",
  authDomain: "bravas-host-board.firebaseapp.com",
  projectId: "bravas-host-board",
  storageBucket: "bravas-host-board.firebasestorage.app",
  messagingSenderId: "852000268043",
  appId: "1:852000268043:web:59446833852e49c7458c0e"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Floor Board webhook: a "nudge" so Make sends capacity alerts right away.
export const FLOORBOARD_HOOK = "https://hook.us2.make.com/rvxumfubda8sq3cuybgd64u17cpjegb2";

export function logout() {
  return signOut(auth).then(() => { location.href = "/staff/"; });
}

// Asks Firestore whether this account is staff. The rules answer, not the page:
// a non-staff account gets "permission-denied" and no data.
async function isStaff() {
  try {
    await getDoc(doc(db, "system", "alertStatus"));
    return true;
  } catch (e) {
    if (e && e.code === "permission-denied") return false;
    throw e;
  }
}

/**
 * watchStaff({ onSignedOut, onDenied, onStaff, onError })
 * Calls exactly one handler each time the sign-in state changes.
 */
export function watchStaff(h) {
  return onAuthStateChanged(auth, async (user) => {
    if (!user) { h.onSignedOut && h.onSignedOut(); return; }
    try {
      const ok = await isStaff();
      if (ok) h.onStaff(user); else h.onDenied && h.onDenied(user);
    } catch (e) {
      h.onError && h.onError(e, user);
    }
  });
}
