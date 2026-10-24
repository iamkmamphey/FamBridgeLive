"use client";

import { FormEvent, useState } from "react";
import { ArrowRight, Loader2, Mail, Phone, Radio, ShieldCheck, User } from "lucide-react";

export default function HostLanding() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function login(event: FormEvent) {
    event.preventDefault(); setLoading(true); setError("");
    try {
      const response = await fetch("/api/host-session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, email, phone }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Unable to log in");
      window.location.assign("/");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to log in"); setLoading(false);
    }
  }

  return <main className="host-landing">
    <div className="host-landing-shade" />
    <section className="host-login-wrap" aria-labelledby="host-login-title">
      <div className="host-mark"><img src="/assets/famyank-logo.png" alt="" /><div><span>Welcome to</span><strong>FamBridge<em>Live</em></strong></div></div>
      <form className="host-login-card" onSubmit={login}>
        <span className="host-kicker"><Radio size={15} /> HOST PORTAL</span>
        <h1 id="host-login-title">Start your family room.</h1>
        <p>Hosts log in here. FamGuests use your private invitation link and never need to log in.</p>
        <label className="host-input"><User /><input required minLength={2} autoComplete="name" value={name} onChange={event => setName(event.target.value)} placeholder="Name" aria-label="Name" /></label>
        <label className="host-input"><Mail /><input required type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="Email" aria-label="Email" /></label>
        <label className="host-input"><Phone /><input required type="tel" autoComplete="tel" value={phone} onChange={event => setPhone(event.target.value)} placeholder="Phone number" aria-label="Phone number" /></label>
        {error && <p className="host-login-error" role="alert">{error}</p>}
        <button className="host-signin-button" disabled={loading}>{loading ? <Loader2 className="spin" /> : <ShieldCheck size={21} />}<span>{loading ? "Logging in…" : "Log in"}</span><ArrowRight size={22} /></button>
        <small>Your details are used for host access, security, and FamBridge usage tracking.</small>
      </form>
    </section>
    <footer className="host-footer"><span />Created and Powered by <b>FamYank</b><span /></footer>
  </main>;
}
