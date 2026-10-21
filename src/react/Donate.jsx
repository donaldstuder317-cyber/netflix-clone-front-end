import React, { useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, CardElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { createDonation } from "../js/api.js";
import { useAuth } from "./auth.jsx";

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);
const PRESETS = [500, 1000, 2500, 5000];
const MIN = 1, MAX = 1_000_000;
const usd = (c) => `$${(c / 100).toFixed(2)}`;

// "12.50" -> 1250; null when not a valid dollar amount with at most 2 decimals.
function dollarsToCents(text) {
  const t = text.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  return Math.round(parseFloat(t) * 100);
}

const CARD_STYLE = { style: { base: { color: "#f5f5f5", fontSize: "16px", "::placeholder": { color: "#a3a3a3" } }, invalid: { color: "#ff6b6b" } } };

function DonateForm({ user }) {
  const stripe = useStripe();
  const elements = useElements();
  const [preset, setPreset] = useState(1000);
  const [custom, setCustom] = useState("");
  const [status, setStatus] = useState("idle"); // idle | busy | success | declined | error
  const [message, setMessage] = useState("");
  const [paid, setPaid] = useState(0);
  const [validation, setValidation] = useState("");

  const customActive = custom !== "";
  const cents = customActive ? dollarsToCents(custom) : preset;

  async function submit(e) {
    e?.preventDefault();
    setValidation("");
    if (cents === null || cents < MIN || cents > MAX) {
      return setValidation("Enter an amount between $0.01 and $10,000.00.");
    }
    if (!stripe || !elements) return;
    setStatus("busy");
    let secret;
    try {
      const data = await createDonation(cents, user.id);
      secret = data?.client_secret;
      if (!secret) throw new Error("no client_secret");
    } catch {
      return setStatus("error");
    }
    try {
      const { error, paymentIntent } = await stripe.confirmCardPayment(secret, {
        payment_method: { card: elements.getElement(CardElement) },
      });
      if (error) {
        setMessage(error.type === "validation_error" && error.message
          ? error.message
          : "Your card was declined. Please check the details or try a different card.");
        return setStatus("declined");
      }
      if (paymentIntent?.status !== "succeeded") {
        setMessage("The payment couldn't be completed. Please try again.");
        return setStatus("declined");
      }
      setPaid(paymentIntent.amount);
      setStatus("success");
    } catch {
      setStatus("error");
    }
  }

  const reset = () => { setStatus("idle"); setMessage(""); };

  if (status === "success") {
    return (
      <div className="donate-result" data-testid="donate-success" role="status">
        <h2>Thank you!</h2>
        <p>Your {usd(paid)} donation went through. We really appreciate your support.</p>
        <div className="btn-row"><button type="button" className="btn secondary" onClick={() => { setCustom(""); setStatus("idle"); }}>Donate again</button></div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate aria-label="Donation form" data-testid="donate-form">
      <fieldset className="donate-amounts" disabled={status === "busy"}>
        <legend>Choose an amount</legend>
        <div className="donate-grid">
          {PRESETS.map((c) => (
            <button type="button" key={c} data-testid={`amount-${c / 100}`}
              className={`btn ${!customActive && preset === c ? "" : "secondary"}`}
              aria-pressed={!customActive && preset === c}
              onClick={() => { setPreset(c); setCustom(""); }}>{usd(c).replace(".00", "")}</button>
          ))}
        </div>
        <label className="donate-label">Custom amount (USD)
          <input type="text" inputMode="decimal" placeholder="e.g. 15.00" data-testid="custom-amount"
            value={custom} aria-invalid={!!validation}
            onChange={(e) => setCustom(e.target.value)} />
        </label>
      </fieldset>

      <label className="donate-label" id="card-label">Card details
        <div className="donate-card" data-testid="card-element"><CardElement options={CARD_STYLE} /></div>
      </label>

      {validation && <p className="error" role="alert">{validation}</p>}
      {status === "declined" && <p className="error" role="alert" data-testid="donate-declined">{message}</p>}
      {status === "error" && (
        <div className="error" role="alert" data-testid="donate-error">
          <p style={{ margin: "0 0 12px" }}>Something went wrong. Please try again.</p>
          <button type="button" className="btn red" data-testid="retry" onClick={submit}>Retry</button>
        </div>
      )}

      <button type="submit" className="btn red donate-submit" data-testid="donate-submit" disabled={status === "busy" || !stripe}>
        {status === "busy" ? "Processing…" : `Donate${cents && cents >= MIN && cents <= MAX ? " " + usd(cents) : ""}`}
      </button>
    </form>
  );
}

export default function Donate() {
  const { user, loading } = useAuth();
  return (
    <>
      <header className="header">
        <a className="logo" href="/src/pages/browse.html">NETFLIX CLONE</a>
        <nav><a href="/src/pages/browse.html">Home</a></nav>
      </header>
      <main className="donate">
        <h1>Support Netflix Clone</h1>
        <p className="hint">Enjoying the show? A one-time donation helps keep the lights on. Pick an amount and pay securely with your card.</p>
        {loading ? <p className="hint">Loading…</p> : !user ? (
          <div className="empty" data-testid="donate-signin">
            Please sign in to donate. <a href="/index.html" style={{ color: "#fff", textDecoration: "underline" }}>Go to sign in</a>
          </div>
        ) : (
          <Elements stripe={stripePromise}><DonateForm user={user} /></Elements>
        )}
      </main>
    </>
  );
}
