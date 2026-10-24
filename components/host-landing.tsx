import { ArrowRight, LockKeyhole, Radio, ShieldCheck } from "lucide-react";
import { chatGPTSignInPath } from "@/app/chatgpt-auth";

export default function HostLanding() {
  return <main className="host-landing">
    <div className="host-landing-shade" />
    <section className="host-login-wrap" aria-labelledby="host-login-title">
      <div className="host-mark"><img src="/assets/famyank-logo.png" alt="" /><div><span>Welcome to</span><strong>FamBridge<em>Live</em></strong></div></div>
      <div className="host-login-card">
        <span className="host-kicker"><Radio size={15} /> HOST PORTAL</span>
        <h1 id="host-login-title">Bring your family together.</h1>
        <p>Sign in securely to start a private FamBridge room and share a no-login link with your guests.</p>
        <a className="host-signin-button" href={chatGPTSignInPath("/")} target="_top">
          <LockKeyhole size={21} /><span>Sign in to host</span><ArrowRight size={22} />
        </a>
        <div className="host-trust"><ShieldCheck size={18} /><span>Only hosts sign in. FamGuests join directly from your private link.</span></div>
        <small>For service security and usage tracking, the host’s name, email, and sign-in time are sent to the FamYank administrator.</small>
      </div>
    </section>
    <footer className="host-footer"><span />Created and Powered by <b>FamYank</b><span /></footer>
  </main>;
}
