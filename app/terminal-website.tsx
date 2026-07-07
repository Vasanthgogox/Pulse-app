import { ROUTES } from '@/lib/routes';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

/** Posted by landing HTML inside iframe so parent can SPA-navigate (avoids full document reload). */
const PULSE_SIGN_IN_NAV = 'pulse-sign-in-nav' as const;

const WEBSITE_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>PULSE</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/lucide@latest"></script>
  <style>
    html { scroll-behavior: smooth; scroll-padding-top: 72px; }
    body { background: #ffffff; }
    .page-pad { padding-left: clamp(12px, 2vw, 20px); padding-right: clamp(12px, 2vw, 20px); }
    @media (min-width: 1440px) {
      .page-pad { padding-left: 20px; padding-right: 20px; }
      .wide-shell { max-width: 1180px; margin-left: auto; margin-right: auto; }
    }
    .brand-dot { color: #10b981; }
    .dot-light { color: #10b981; }
    .dot-on-green { color: #ffffff; }
    .glass-nav { background: rgba(255,255,255,0.88); backdrop-filter: blur(12px); border-bottom: 1px solid #e2e8f0; }
    .hero-title { font-size: clamp(30px, 5vw, 64px); line-height: 0.9; letter-spacing: -0.04em; }
    .final-title { font-size: clamp(32px, 5.5vw, 68px); line-height: 0.88; letter-spacing: -0.038em; }
    .headline-lg { font-size: clamp(1.5rem, 2.8vw, 2.25rem) !important; line-height: 1.08 !important; letter-spacing: -0.03em !important; }
    .support-copy { font-size: clamp(0.8125rem, 0.95vw, 1rem); line-height: 1.5; }
    .section-copy { font-size: clamp(0.8125rem, 0.9vw, 0.9375rem); line-height: 1.45; }
    .nav-link { font-size: 10px; letter-spacing: 0.18em; }
    .tight-btn { letter-spacing: 0.16em; font-size: 11px; }
    .section-lead { font-size: clamp(0.875rem, 1vw, 1rem) !important; line-height: 1.5 !important; }
    @media (min-width: 1366px) and (max-width: 1535px) {
      .hero-title { font-size: 58px; line-height: 0.9; letter-spacing: -0.042em; }
      .final-title { font-size: 62px; line-height: 0.88; letter-spacing: -0.04em; }
    }
    @media (min-width: 1536px) {
      .hero-title { font-size: 64px; line-height: 0.88; letter-spacing: -0.044em; }
      .final-title { font-size: 68px; line-height: 0.86; letter-spacing: -0.038em; }
    }
    .reveal { opacity: 0; transform: translateY(24px) scale(0.99); transition: opacity 700ms ease, transform 700ms ease; }
    .reveal.in { opacity: 1; transform: translateY(0) scale(1); }
    .hover-float { transition: transform 500ms ease, box-shadow 500ms ease; }
    .hover-float:hover { transform: translateY(-6px); box-shadow: 0 24px 60px -28px rgba(0,0,0,0.22); }
    .type-cursor { display: inline-block; border-right: 3px solid #10b981; margin-left: 4px; animation: blink 1s steps(1) infinite; }
    @keyframes blink { 50% { border-color: transparent; } }
    @keyframes pulseSoft { 0%,100% { opacity: .2; transform: scale(1); } 50% { opacity: .35; transform: scale(1.05); } }
    .bg-glow { animation: pulseSoft 5s ease-in-out infinite; }
    .site-dark-tail { background: #020617; }
    .final-cta {
      border-radius: 2.5rem 2.5rem 0 0;
    }
    .site-footer {
      background: #020617;
      border-top: 0;
    }
    section[id], div[id] { scroll-margin-top: 72px; }
    .mobile-tabbar { display: none; }
    @media (max-width: 1024px) {
      html { scroll-padding-top: 64px; }
      section[id], div[id] { scroll-margin-top: 64px; }
      .page-pad { padding-left: 16px; padding-right: 16px; }
      .glass-nav { backdrop-filter: blur(10px); }
      .hero-title { font-size: clamp(26px, 7.5vw, 42px); line-height: 0.92; letter-spacing: -0.035em; }
      .final-title { font-size: clamp(26px, 7vw, 44px); line-height: 0.92; letter-spacing: -0.035em; }
      .headline-lg { font-size: clamp(1.375rem, 5.5vw, 1.75rem) !important; }
      .support-copy { font-size: 13px; line-height: 1.5; }
      .section-copy { font-size: 13px; line-height: 1.45; }
      .section-lead { font-size: 13px !important; line-height: 1.45 !important; }
      #trips { border-radius: 1.5rem !important; }
      .final-cta { border-radius: 1.5rem 1.5rem 0 0 !important; }
      .hero-shell { border-radius: 1.5rem !important; padding: 16px !important; }
      .ledger-card, .contract-card, .pricing-card { border-radius: 1.5rem !important; padding: 20px !important; }
      .compact-card { border-radius: 1.25rem !important; padding: 16px !important; }
      .trip-feature-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; gap: 10px !important; }
      .steps-grid { gap: 12px !important; }
      body { padding-bottom: 82px; }
      .mobile-tabbar {
        display: grid;
        grid-template-columns: repeat(6, minmax(0, 1fr));
        gap: 8px;
        position: fixed;
        left: 12px;
        right: 12px;
        bottom: max(10px, env(safe-area-inset-bottom));
        z-index: 120;
        background: rgba(2, 6, 23, 0.9);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 18px;
        padding: 8px;
        backdrop-filter: blur(14px);
        box-shadow: 0 16px 36px rgba(2, 6, 23, 0.35);
      }
      .mobile-tabbar a {
        color: #cbd5e1;
        text-decoration: none;
        text-align: center;
        text-transform: uppercase;
        letter-spacing: 0.12em;
        font-weight: 800;
        font-size: 8px;
        padding: 8px 4px;
        border-radius: 10px;
      }
      .mobile-tabbar a:active,
      .mobile-tabbar a:hover {
        background: rgba(16, 185, 129, 0.2);
        color: #ffffff;
      }
      .driver-phone {
        width: min(100%, 280px) !important;
        height: 460px !important;
      }
    }
    @media (max-width: 767px) {
      nav .brand-wordmark { font-size: 1rem; }
      nav .brand-mark { width: 32px !important; height: 32px !important; border-radius: 10px !important; font-size: 11px !important; }
      .nav-cta { padding: 8px 12px !important; font-size: 8px !important; }
      .hero-section { padding-top: 88px !important; padding-bottom: 40px !important; }
      .hero-badges { margin-bottom: 14px !important; padding: 6px 12px !important; }
      .hero-actions a { width: 100%; padding: 12px 16px !important; font-size: 10px !important; }
      .trip-feature-grid, .steps-grid, .ledger-grid, .contracts-grid { grid-template-columns: minmax(0, 1fr) !important; }
      .driver-feature-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
      .section-stack { padding-top: 44px !important; padding-bottom: 44px !important; }
      .headline-lg { font-size: clamp(1.25rem, 6.5vw, 1.625rem) !important; }
      .footer-copy { letter-spacing: 0.08em !important; font-size: 9px !important; }
      .hero-grid { gap: 28px !important; }
      .hero-title { margin-bottom: 20px !important; max-width: 11ch !important; }
      .support-copy { margin-bottom: 24px !important; }
    }
  </style>
</head>
<body class="min-h-screen bg-white font-sans selection:bg-emerald-100 overflow-x-hidden">
  <nav class="fixed top-0 left-0 right-0 z-[100] glass-nav page-pad py-3">
    <div class="wide-shell max-w-6xl mx-auto flex items-center justify-between gap-4">
      <div class="flex items-center gap-2.5">
        <div class="brand-mark w-8 h-8 rounded-xl bg-slate-950 flex items-center justify-center text-[11px] font-black text-emerald-500 shadow-lg ring-1 ring-emerald-500/10">P.</div>
        <span class="brand-wordmark font-black text-lg tracking-tighter italic text-slate-950 uppercase">Pulse<span class="brand-dot">.</span></span>
      </div>
      <div class="hidden lg:flex items-center gap-8">
        <a href="#network" class="nav-link font-black uppercase text-slate-400 hover:text-emerald-600 transition-colors">Network</a>
        <a href="#trips" class="nav-link font-black uppercase text-slate-400 hover:text-emerald-600 transition-colors">Trips</a>
        <a href="#ledger" class="nav-link font-black uppercase text-slate-400 hover:text-emerald-600 transition-colors">Ledger</a>
        <a href="#drivers" class="nav-link font-black uppercase text-slate-400 hover:text-emerald-600 transition-colors">Drivers</a>
        <a href="#contracts" class="nav-link font-black uppercase text-slate-400 hover:text-emerald-600 transition-colors">Contracts</a>
        <a href="#steps" class="nav-link font-black uppercase text-slate-400 hover:text-emerald-600 transition-colors">Steps</a>
      </div>
      <a href="/sign-in" target="_top" class="nav-cta px-5 py-2 bg-slate-950 text-white rounded-full text-[9px] font-black uppercase tracking-widest hover:bg-emerald-600 shadow-lg transition-all">Enter OS</a>
    </div>
  </nav>

  <section class="hero-section relative pt-28 pb-24 page-pad bg-slate-50 overflow-hidden">
    <div class="hero-grid max-w-6xl mx-auto wide-shell grid lg:grid-cols-2 gap-10 xl:gap-14 items-center">
      <div class="relative z-10 reveal">
        <div class="hero-badges inline-flex items-center gap-2 bg-white px-3.5 py-1.5 rounded-full mb-6 border border-slate-100 shadow-sm hover-float">
          <i data-lucide="sparkles" class="w-3.5 h-3.5 text-emerald-600"></i>
          <span class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Global Logistics Hub v4.0</span>
        </div>
        <h1 class="hero-title font-black text-slate-900 italic mb-8 uppercase max-w-[10ch]">
          <span id="typewriter" data-text="MOVE BUSINESS FASTER"></span><span class="dot-light">.</span><span class="type-cursor"></span>
        </h1>
        <p class="support-copy text-slate-500 font-medium max-w-md mb-8">
          Run your entire transport business on one platform. From loads to payments — manage everything in one simple, unified flow.
        </p>
        <div class="hero-actions flex flex-col sm:flex-row gap-3">
          <a href="/sign-in" target="_top" class="px-8 py-3.5 bg-emerald-600 text-white rounded-full font-black uppercase tight-btn shadow-[0_12px_32px_-8px_rgba(16,185,129,0.45)] hover:bg-emerald-700 transition-all text-center hover-float">Get Started</a>
          <a href="#network" class="px-8 py-3.5 bg-white border border-slate-200 rounded-full font-black uppercase tight-btn hover:bg-slate-50 transition-all text-center hover-float">See Features</a>
        </div>
      </div>
      <div class="relative reveal w-full max-w-md lg:max-w-none lg:justify-self-end">
        <div class="hero-shell relative z-10 bg-slate-950 rounded-3xl p-6 md:p-8 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.35)] border border-white/10 hover-float">
          <div class="flex justify-between items-center mb-6">
            <div class="flex gap-1.5"><div class="w-2.5 h-2.5 rounded-full bg-rose-500"></div><div class="w-2.5 h-2.5 rounded-full bg-amber-500"></div><div class="w-2.5 h-2.5 rounded-full bg-emerald-500"></div></div>
            <span class="text-[8px] font-black text-emerald-400 uppercase tracking-[0.35em] italic">Pulse_Active</span>
          </div>
          <div class="space-y-4">
            <div class="p-4 rounded-2xl bg-white/5 border border-white/10 flex justify-between items-center gap-3">
              <div class="space-y-1 min-w-0"><p class="text-[8px] font-black text-slate-500 uppercase tracking-widest">Active Trip</p><p class="text-white text-sm md:text-base font-black truncate">DARJEELING HUB -> KOLKATA</p></div>
              <i data-lucide="activity" class="w-5 h-5 text-emerald-500 shrink-0"></i>
            </div>
            <div class="p-4 rounded-2xl bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20"><p class="text-[8px] uppercase font-black mb-1 opacity-60">System Liquidity</p><p class="text-2xl md:text-3xl font-black italic">₹47,555.00</p></div>
          </div>
        </div>
        <div class="absolute -inset-8 rounded-full bg-emerald-500/15 blur-[80px] bg-glow -z-10"></div>
      </div>
    </div>
  </section>

  <section id="network" class="section-stack py-16 page-pad max-w-6xl mx-auto wide-shell overflow-hidden">
    <div class="grid lg:grid-cols-[1fr_1.05fr] gap-8 xl:gap-10 items-start">
      <div class="reveal">
        <h2 class="headline-lg font-black tracking-tighter uppercase italic leading-none mb-4">Your Network. Fully Connected.<span class="text-emerald-500">.</span></h2>
        <p class="section-copy font-semibold max-w-lg text-slate-500 mb-6">Pulse connects you seamlessly with trusted clients and suppliers. Post requirements like social posts and get bids instantly.</p>
        <div class="space-y-3">
          <div class="flex items-center gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-100 hover:border-emerald-200 transition-all">
            <div class="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-slate-400"><i data-lucide="boxes" class="w-5 h-5"></i></div>
            <div><h4 class="font-black text-slate-900 uppercase text-sm tracking-tight">Give & Get Loads</h4><p class="text-slate-500 text-sm font-medium">Post trip requirements to your circles instantly.</p></div>
          </div>
          <div class="flex items-center gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-100 hover:border-emerald-200 transition-all">
            <div class="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-slate-400"><i data-lucide="gavel" class="w-5 h-5"></i></div>
            <div><h4 class="font-black text-slate-900 uppercase text-sm tracking-tight">Bid & Award</h4><p class="text-slate-500 text-sm font-medium">Match with the best partner rates via live bidding.</p></div>
          </div>
          <div class="flex items-center gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-100 hover:border-emerald-200 transition-all">
            <div class="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-slate-400"><i data-lucide="users" class="w-5 h-5"></i></div>
            <div><h4 class="font-black text-slate-900 uppercase text-sm tracking-tight">Trusted Partners</h4><p class="text-slate-500 text-sm font-medium">Only work with audited and verified business accounts.</p></div>
          </div>
        </div>
      </div>
      <div class="reveal">
        <div class="bg-slate-950 rounded-3xl p-5 md:p-6 relative overflow-hidden shadow-[0_32px_64px_-20px_rgba(2,6,23,0.4)]">
          <div class="absolute inset-0 bg-gradient-to-br from-emerald-500/10 via-transparent to-transparent opacity-60"></div>
          <div class="relative z-10 space-y-3">
            <div class="p-5 rounded-2xl border border-white/5 bg-white/5 shadow-xl">
              <div class="flex justify-between items-center mb-4"><span class="text-[9px] font-black text-emerald-400 uppercase tracking-widest">@GLOBAL_LOGISTICS_LTD</span><span class="text-[9px] text-white/20 font-bold italic">12m ago</span></div>
              <p class="text-white/80 text-sm leading-relaxed mb-4 italic">"Seeking 20ft Container for Chennai dispatch. Load ready for tomorrow 6 AM. Trusted partners only."</p>
              <div class="flex justify-between items-center gap-3"><span class="text-lg font-black text-white">₹22,000</span><a href="/sign-in" target="_top" class="px-4 py-2 bg-emerald-600 text-white rounded-full text-[9px] font-black uppercase shadow-lg">Submit Quote</a></div>
            </div>
            <div class="p-5 rounded-2xl border border-white/5 bg-white/5 shadow-xl opacity-40 scale-95 blur-[1px]">
              <div class="flex justify-between items-center mb-4"><span class="text-[9px] font-black text-emerald-400 uppercase tracking-widest">@VENDHAN_FLEET</span><span class="text-[9px] text-white/20 font-bold italic">45m ago</span></div>
              <p class="text-white/80 text-sm leading-relaxed mb-4 italic">"Reliable 14ft Open truck available in Delhi area for Jaipur route. Looking for return loads."</p>
              <div class="flex justify-between items-center gap-3"><span class="text-lg font-black text-white">Market Rate</span><a href="/sign-in" target="_top" class="px-4 py-2 bg-emerald-600 text-white rounded-full text-[9px] font-black uppercase shadow-lg">Submit Quote</a></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <section id="trips" class="section-stack py-16 page-pad bg-slate-950 text-white rounded-[2rem] mx-3 md:mx-4 relative overflow-hidden reveal">
    <div class="max-w-5xl mx-auto wide-shell">
      <h2 class="headline-lg font-black tracking-tighter uppercase italic leading-none mb-4 text-center">End to End Trip Management<span class="text-emerald-500">.</span></h2>
      <p class="section-lead font-semibold max-w-2xl leading-relaxed text-slate-400 mb-10 mx-auto text-center">Track live manifests from warehouse to destination. Link kilometers directly to payments.</p>
      <div class="trip-feature-grid grid md:grid-cols-3 gap-4">
        <div class="compact-card p-6 rounded-2xl bg-white/5 border border-white/10 text-center">
          <div class="w-11 h-11 bg-emerald-500/10 rounded-xl flex items-center justify-center mx-auto mb-4"><i data-lucide="mouse-pointer-2" class="w-5 h-5 text-emerald-500"></i></div>
          <h4 class="font-black uppercase text-sm mb-2 tracking-tighter italic">Instant Assign</h4>
          <p class="text-slate-400 text-sm leading-relaxed font-medium">Push job details to driver apps in one tap.</p>
        </div>
        <div class="compact-card p-6 rounded-2xl bg-white/5 border border-white/10 text-center">
          <div class="w-11 h-11 bg-emerald-500/10 rounded-xl flex items-center justify-center mx-auto mb-4"><i data-lucide="map-pinned" class="w-5 h-5 text-emerald-500"></i></div>
          <h4 class="font-black uppercase text-sm mb-2 tracking-tighter italic">Route Mapping</h4>
          <p class="text-slate-400 text-sm leading-relaxed font-medium">Live GPS updates with route optimization.</p>
        </div>
        <div class="compact-card p-6 rounded-2xl bg-white/5 border border-white/10 text-center">
          <div class="w-11 h-11 bg-emerald-500/10 rounded-xl flex items-center justify-center mx-auto mb-4"><i data-lucide="check-circle-2" class="w-5 h-5 text-emerald-500"></i></div>
          <h4 class="font-black uppercase text-sm mb-2 tracking-tighter italic">Auto-Settlement</h4>
          <p class="text-slate-400 text-sm leading-relaxed font-medium">Completion auto-logs entries into your ledger.</p>
        </div>
      </div>
    </div>
  </section>

  <section id="ledger" class="section-stack py-16 page-pad max-w-6xl mx-auto wide-shell">
    <h2 class="headline-lg font-black tracking-tighter uppercase italic leading-none mb-4 reveal">Know Exactly Who Paid What<span class="text-emerald-500">.</span></h2>
    <p class="section-lead font-semibold max-w-lg leading-relaxed text-slate-500 mb-8 reveal">A shared ledger between you and your partners.</p>
    <div class="ledger-grid grid lg:grid-cols-2 gap-6">
      <div class="ledger-card p-8 rounded-3xl bg-white border border-slate-100 shadow-[0_24px_48px_-20px_rgba(0,0,0,0.1)] reveal hover-float">
        <div class="flex justify-between items-center p-4 bg-slate-50 rounded-2xl mb-4"><span class="font-black text-slate-400 uppercase text-[10px] tracking-widest">My Ledger</span><span class="font-black text-2xl text-slate-900 tracking-tighter italic">₹5,839.00</span></div>
        <div class="flex justify-between items-center p-4 bg-emerald-50 rounded-2xl border border-emerald-100"><span class="font-black text-emerald-600 uppercase text-[10px] tracking-widest">Partner Side</span><span class="font-black text-2xl text-emerald-600 tracking-tighter italic">₹5,839.00</span></div>
      </div>
      <div class="pricing-card p-8 rounded-3xl bg-emerald-600 text-white shadow-xl reveal hover-float">
        <h4 class="text-2xl font-black italic uppercase mb-4 leading-tight">No Payment Confusion<span class="dot-on-green">.</span></h4>
        <p class="text-emerald-100 text-sm font-medium leading-relaxed">Pulse OS enforces pricing rules before manifest lock.</p>
        <a href="/sign-in" target="_top" class="block w-full py-4 bg-slate-950 text-white rounded-2xl font-black text-[11px] uppercase tracking-[0.3em] shadow-xl mt-8 text-center">Configure My Pricing</a>
      </div>
    </div>
  </section>

  <section id="drivers" class="section-stack py-16 page-pad bg-slate-50">
    <div class="max-w-6xl mx-auto wide-shell grid lg:grid-cols-2 gap-10 items-center">
      <div class="reveal">
        <h2 class="headline-lg font-black tracking-tighter uppercase italic leading-none mb-4">Built for Drivers Too<span class="text-emerald-500">.</span></h2>
        <p class="section-lead font-semibold max-w-md leading-relaxed text-slate-500 mb-8">Empower your pilots with a mobile app for trip updates, digital PODs, and expense tracking.</p>
        <div class="driver-feature-grid grid grid-cols-2 gap-3">
          <div class="p-4 bg-white rounded-xl border border-slate-100 shadow-sm flex flex-col items-center text-center gap-2"><i data-lucide="smartphone" class="w-5 h-5 text-emerald-500"></i><span class="font-black uppercase text-[10px] tracking-widest text-slate-800">Pilot App</span></div>
          <div class="p-4 bg-white rounded-xl border border-slate-100 shadow-sm flex flex-col items-center text-center gap-2"><i data-lucide="camera" class="w-5 h-5 text-emerald-500"></i><span class="font-black uppercase text-[10px] tracking-widest text-slate-800">Instant POD</span></div>
          <div class="p-4 bg-white rounded-xl border border-slate-100 shadow-sm flex flex-col items-center text-center gap-2"><i data-lucide="fuel" class="w-5 h-5 text-emerald-500"></i><span class="font-black uppercase text-[10px] tracking-widest text-slate-800">Expense Logs</span></div>
          <div class="p-4 bg-white rounded-xl border border-slate-100 shadow-sm flex flex-col items-center text-center gap-2"><i data-lucide="wallet" class="w-5 h-5 text-emerald-500"></i><span class="font-black uppercase text-[10px] tracking-widest text-slate-800">Pay Status</span></div>
        </div>
      </div>
      <div class="reveal flex justify-center">
        <div class="driver-phone w-60 h-[460px] bg-slate-950 rounded-[2.5rem] border-[10px] border-slate-900 shadow-[0_40px_80px_-24px_rgba(0,0,0,0.35)] p-7 relative overflow-hidden">
          <div class="absolute top-0 left-1/2 -translate-x-1/2 w-14 h-6 bg-slate-900 rounded-b-xl"></div>
          <div class="mt-8 space-y-5">
            <div class="flex items-center gap-2"><div class="w-2 h-2 rounded-full bg-emerald-500"></div><span class="text-[9px] font-black text-white/40 uppercase tracking-widest">Active_Trip</span></div>
            <h5 class="text-xl font-black tracking-tighter text-white italic uppercase leading-none">VARANASI HUB</h5>
            <div class="space-y-3">
              <div class="h-1.5 w-full bg-white/5 rounded-full overflow-hidden"><div class="h-full w-2/3 bg-emerald-500 shadow-[0_0_10px_#10b981]"></div></div>
              <div class="p-4 bg-white/5 rounded-xl border border-white/5">
                <p class="text-[8px] font-black text-slate-500 uppercase mb-1">Assigned Manifest</p>
                <p class="text-[11px] font-bold text-white uppercase tracking-tight italic">20ft_Cont_TRP092</p>
              </div>
            </div>
          </div>
          <a href="/sign-in" target="_top" class="absolute bottom-7 left-7 right-7 py-3 bg-emerald-600 text-white rounded-2xl font-black text-[10px] uppercase text-center shadow-xl">Upload POD Proof</a>
        </div>
      </div>
    </div>
  </section>

  <section id="contracts" class="section-stack py-16 page-pad max-w-6xl mx-auto wide-shell">
    <div class="text-center mb-10 reveal">
      <h2 class="headline-lg font-black tracking-tighter uppercase italic leading-none mb-4">Standardize Your Business<span class="text-emerald-500">.</span></h2>
      <p class="section-lead font-semibold max-w-2xl mx-auto leading-relaxed text-slate-500">Define your lane pricing and unloading rules once. Automated contracts ensure everyone agrees before the wheel turns.</p>
    </div>
    <div class="contracts-grid grid lg:grid-cols-2 gap-6">
      <div class="contract-card p-8 rounded-3xl bg-slate-950 text-white shadow-xl relative overflow-hidden reveal">
        <h4 class="text-xl font-black italic uppercase mb-6">Standard Rules</h4>
        <div class="space-y-4">
          <div class="flex justify-between items-center py-3 border-b border-white/5 gap-3"><span class="text-xs font-bold text-slate-500 uppercase tracking-widest">Lane Pricing</span><span class="font-black text-emerald-500 uppercase text-xs tracking-[0.15em] text-right">Fixed System Rate</span></div>
          <div class="flex justify-between items-center py-3 border-b border-white/5 gap-3"><span class="text-xs font-bold text-slate-500 uppercase tracking-widest">Weight Logic</span><span class="font-black text-emerald-500 uppercase text-xs tracking-[0.15em] text-right">Per Ton / Trip Split</span></div>
          <div class="flex justify-between items-center py-3 border-b border-white/5 gap-3"><span class="text-xs font-bold text-slate-500 uppercase tracking-widest">Loading Policy</span><span class="font-black text-emerald-500 uppercase text-xs tracking-[0.15em] text-right">Verified Manual Audit</span></div>
        </div>
      </div>
      <div id="pricing" class="pricing-card p-8 rounded-3xl bg-emerald-600 text-white shadow-xl reveal flex flex-col justify-between hover-float">
        <div>
          <h4 class="text-2xl font-black italic uppercase mb-4 leading-tight">No Payment<br/>Confusion<span class="dot-on-green">.</span></h4>
          <p class="text-emerald-100 text-sm font-medium leading-relaxed">Pulse OS enforces your pricing rules at the start, ensuring every partner agrees on the price before the manifest is locked.</p>
        </div>
        <a href="/sign-in" target="_top" class="block w-full py-4 bg-slate-950 text-white rounded-2xl font-black text-[11px] uppercase tracking-[0.3em] shadow-xl mt-8 text-center">Configure My Pricing</a>
      </div>
    </div>
  </section>

  <section id="steps" class="section-stack py-16 page-pad max-w-4xl mx-auto wide-shell text-center reveal">
    <h2 class="headline-lg font-black tracking-tighter italic uppercase mb-10">3 Steps To Start<span class="text-emerald-500">.</span></h2>
    <div class="steps-grid grid sm:grid-cols-3 gap-8 relative">
      <div class="absolute top-8 left-0 right-0 h-px bg-slate-100 hidden sm:block"></div>
      <div class="relative z-10 space-y-4">
        <div class="w-14 h-14 rounded-full bg-slate-950 text-white flex items-center justify-center mx-auto text-lg font-black italic shadow-xl border-2 border-white">01</div>
        <div><h4 class="font-black uppercase text-sm tracking-tighter">Add Your Network</h4><p class="text-slate-400 font-bold uppercase text-[10px] tracking-widest mt-1">Invite partners & vendors.</p></div>
      </div>
      <div class="relative z-10 space-y-4">
        <div class="w-14 h-14 rounded-full bg-slate-950 text-white flex items-center justify-center mx-auto text-lg font-black italic shadow-xl border-2 border-white">02</div>
        <div><h4 class="font-black uppercase text-sm tracking-tighter">Log Trips</h4><p class="text-slate-400 font-bold uppercase text-[10px] tracking-widest mt-1">Manage manifests live.</p></div>
      </div>
      <div class="relative z-10 space-y-4">
        <div class="w-14 h-14 rounded-full bg-slate-950 text-white flex items-center justify-center mx-auto text-lg font-black italic shadow-xl border-2 border-white">03</div>
        <div><h4 class="font-black uppercase text-sm tracking-tighter">Grow Fast</h4><p class="text-slate-400 font-bold uppercase text-[10px] tracking-widest mt-1">Scale with digital ledger.</p></div>
      </div>
    </div>
  </section>

  <div class="site-dark-tail">
  <section class="final-cta py-20 page-pad bg-slate-950 text-white text-center relative overflow-hidden">
    <div class="max-w-4xl mx-auto relative z-10 reveal">
      <h2 class="final-title font-black italic mb-8 uppercase">
        <span id="final-typewriter" data-text="CONNECT YOUR BUSINESS"></span><span class="text-emerald-500">.</span>
      </h2>
      <a href="/sign-in" target="_top" class="inline-block px-10 py-4 bg-emerald-600 text-white rounded-full font-black text-sm uppercase tracking-[0.18em] shadow-[0_20px_48px_rgba(16,185,129,0.35)] hover-float">Initialize Now</a>
    </div>
    <div class="absolute inset-0 opacity-[0.02] pointer-events-none text-white font-black italic text-[28vw] select-none leading-none top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">PULSE.</div>
  </section>

  <footer class="site-footer py-10 page-pad text-center">
    <p class="footer-copy text-[9px] font-black text-slate-600 uppercase tracking-widest leading-relaxed italic">GoGoX pulse • All rights reserved 2026</p>
  </footer>
  </div>
  <div class="mobile-tabbar">
    <a href="#network">Network</a>
    <a href="#trips">Trips</a>
    <a href="#ledger">Ledger</a>
    <a href="#drivers">Drivers</a>
    <a href="#contracts">Rules</a>
    <a href="#steps">Steps</a>
  </div>
  <script>
    lucide.createIcons();
    const typeEl = document.getElementById('typewriter');
    if (typeEl) {
      const text = typeEl.getAttribute('data-text') || '';
      const TYPE_SPEED_MS = 90;
      const REPLAY_EVERY_MS = 5 * 60 * 1000;
      const runTypewriter = () => {
        let idx = 0;
        typeEl.textContent = '';
        const t = setInterval(() => {
          idx += 1;
          typeEl.textContent = text.slice(0, idx);
          if (idx >= text.length) clearInterval(t);
        }, TYPE_SPEED_MS);
      };
      runTypewriter();
      setInterval(runTypewriter, REPLAY_EVERY_MS);
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) entry.target.classList.add('in');
      });
    }, { threshold: 0.12 });
    document.querySelectorAll('.reveal').forEach((el) => observer.observe(el));

    const finalTypeEl = document.getElementById('final-typewriter');
    if (finalTypeEl) {
      const finalText = finalTypeEl.getAttribute('data-text') || '';
      let finalAnimated = false;
      const runFinalTypewriter = () => {
        if (finalAnimated) return;
        finalAnimated = true;
        let idx = 0;
        finalTypeEl.textContent = '';
        const t = setInterval(() => {
          idx += 1;
          finalTypeEl.textContent = finalText.slice(0, idx);
          if (idx >= finalText.length) clearInterval(t);
        }, 80);
      };
    const finalObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) runFinalTypewriter();
        });
      }, { threshold: 0.35 });
      finalObserver.observe(finalTypeEl);
    }

    const HEADER_OFFSET = 72;
    document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
      anchor.addEventListener('click', (event) => {
        const href = anchor.getAttribute('href');
        if (!href || href === '#') return;
        const target = document.querySelector(href);
        if (!target) return;
        event.preventDefault();
        const top = target.getBoundingClientRect().top + window.scrollY - HEADER_OFFSET;
        window.scrollTo({ top, behavior: 'smooth' });
      });
    });

    document.body.addEventListener(
      'click',
      function (event) {
        const el = event.target;
        if (!el || typeof el.closest !== 'function') return;
        const anchor = el.closest('a[href^="/sign-in"], a[href^="/welcome"]');
        if (!anchor) return;
        event.preventDefault();
        event.stopPropagation();
        try {
          if (window.parent && window.parent !== window) {
            window.parent.postMessage({ type: '${PULSE_SIGN_IN_NAV}', v: 1 }, '*');
          }
        } catch (_) {}
      },
      true
    );
  </script>
</body>
</html>`;

export default function TerminalWebsitePage() {
  const router = useRouter();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const handler = (event: MessageEvent) => {
      if (event.data?.type !== PULSE_SIGN_IN_NAV || event.data?.v !== 1) return;
      if (iframeRef.current?.contentWindow !== event.source) return;
      router.push(ROUTES.ONBOARDING.HUB);
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [router]);

  if (Platform.OS !== 'web') {
    return (
      <View style={styles.nativeWrap}>
        <Text style={styles.nativeTitle}>
          Pulse<Text style={styles.nativeTitleDot}>.</Text> Website
        </Text>
        <Text style={styles.nativeBody}>This page is designed for web. Continue to sign in.</Text>
        <Pressable onPress={() => router.push(ROUTES.ONBOARDING.HUB)} style={styles.nativeBtn}>
          <Text style={styles.nativeBtnText}>Go to Sign In</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <iframe
      ref={iframeRef}
      title="Pulse Website"
      srcDoc={WEBSITE_HTML}
      style={{ width: '100%', height: '100vh', border: 'none' }}
      sandbox="allow-scripts allow-same-origin allow-popups allow-top-navigation allow-top-navigation-by-user-activation"
    />
  );
}

const styles = StyleSheet.create({
  nativeWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    paddingHorizontal: 24,
  },
  nativeTitle: { fontSize: 22, fontWeight: '900', color: '#020617', fontStyle: 'italic' },
  nativeTitleDot: { color: '#10b981' },
  nativeBody: { marginTop: 8, fontSize: 13, lineHeight: 18, color: '#64748b', textAlign: 'center' },
  nativeBtn: {
    marginTop: 14,
    backgroundColor: '#10b981',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  nativeBtnText: { color: '#fff', fontWeight: '900', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6 },
});
