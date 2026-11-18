import { auth, watchStaff, logout } from "./fb.js";
import {
  signInWithEmailAndPassword, sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const $ = (id) => document.getElementById(id);
const views = ["view-loading", "view-login", "view-denied", "view-home", "view-error"];
function show(id) { views.forEach(v => { $(v).hidden = v !== id; }); }

// Only one place we ever send people back to after login.
const nextIsHost = new URLSearchParams(location.search).get("next") === "host";

function friendly(code) {
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
    case "auth/invalid-login-credentials":
      return "That email and password don't match. Check both, or use “Forgot password”.";
    case "auth/invalid-email": return "Enter a full email address.";
    case "auth/too-many-requests": return "Too many tries. Wait a few minutes, or reset your password.";
    case "auth/network-request-failed": return "No connection. Check Wi-Fi or data and try again.";
    case "auth/unauthorized-domain": return "This website isn't approved in Firebase yet (Authorized domains).";
    default: return "Sign-in failed (" + code + ").";
  }
}

$("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("login-btn");
  $("login-msg").textContent = "";
  btn.disabled = true; btn.textContent = "Signing in…";
  try {
    await signInWithEmailAndPassword(auth, $("email").value.trim(), $("password").value);
    $("password").value = "";
  } catch (err) {
    $("login-msg").textContent = friendly(err.code);
  } finally {
    btn.disabled = false; btn.textContent = "Sign in";
  }
});

$("forgot").addEventListener("click", async () => {
  const email = $("email").value.trim();
  if (!email) { $("login-msg").textContent = "Type your email above first, then tap “Forgot password”."; return; }
  try {
    await sendPasswordResetEmail(auth, email);
    $("login-msg").textContent = "If that email is on file, a reset link is on its way. Check spam too.";
  } catch (err) {
    $("login-msg").textContent = friendly(err.code);
  }
});

document.querySelectorAll("[data-signout]").forEach(b => b.addEventListener("click", logout));

watchStaff({
  onSignedOut() { show("view-login"); $("email").focus(); },
  onDenied(user) { $("denied-email").textContent = user.email || "this account"; show("view-denied"); },
  onStaff(user) {
    if (nextIsHost) { location.replace("/staff/host/"); return; }
    $("home-email").textContent = user.email;
    show("view-home");
  },
  onError(e) { $("error-msg").textContent = (e && e.message) || String(e); show("view-error"); }
});
