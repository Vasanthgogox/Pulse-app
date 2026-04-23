import { useRouter } from 'expo-router';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

const WEBSITE_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>PULSE</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/lucide@latest"></script>
  <style>
    html { scroll-behavior: smooth; scroll-padding-top: 96px; }
    body { background: #ffffff; }
    .page-pad { padding-left: clamp(10px, 1.6vw, 24px); padding-right: clamp(10px, 1.6vw, 24px); }
    @media (min-width: 1440px) {
      .page-pad { padding-left: 24px; padding-right: 24px; }
      .wide-shell { max-width: 1500px; margin-left: auto; margin-right: auto; }
    }
    .brand-dot { color: #10b981; }
    .dot-light { color: #10b981; }
    .dot-on-green { color: #ffffff; }
    .glass-nav { background: rgba(255,255,255,0.8); backdrop-filter: blur(16px); border-bottom: 1px solid #e2e8f0; }
    .hero-title { font-size: clamp(54px, 10vw, 132px); line-height: 0.82; letter-spacing: -0.06em; }
    .final-title { font-size: clamp(56px, 12vw, 152px); line-height: 0.8; letter-spacing: -0.055em; }
    .support-copy { font-size: clamp(1rem, 1.2vw, 1.5rem); line-height: 1.38; }
    .section-copy { font-size: clamp(0.95rem, 1.05vw, 1.28rem); line-height: 1.36; }
    .nav-link { font-size: 11px; letter-spacing: 0.22em; }
    .tight-btn { letter-spacing: 0.22em; }
    @media (min-width: 1366px) and (max-width: 1535px) {
      .hero-title { font-size: 116px; line-height: 0.82; letter-spacing: -0.062em; }
      .final-title { font-size: 126px; line-height: 0.8; letter-spacing: -0.058em; }
    }
    @media (min-width: 1536px) {
      .hero-title { font-size: 132px; line-height: 0.8; letter-spacing: -0.065em; }
      .final-title { font-size: 146px; line-height: 0.78; letter-spacing: -0.06em; }
    }
    .reveal { opacity: 0; transform: translateY(24px) scale(0.99); transition: opacity 700ms ease, transform 700ms ease; }
    .reveal.in { opacity: 1; transform: translateY(0) scale(1); }
    .hover-float { transition: transform 500ms ease, box-shadow 500ms ease; }
    .hover-float:hover { transform: translateY(-6px); box-shadow: 0 24px 60px -28px rgba(0,0,0,0.22); }
    .type-cursor { display: inline-block; border-right: 4px solid #10b981; margin-left: 6px; animation: blink 1s steps(1) infinite; }
    @keyframes blink { 50% { border-color: transparent; } }
    @keyframes pulseSoft { 0%,100% { opacity: .2; transform: scale(1); } 50% { opacity: .35; transform: scale(1.05); } }
    .bg-glow { animation: pulseSoft 5s ease-in-out infinite; }
    section[id], div[id] { scroll-margin-top: 96px; }
  </style>
</head>
<body class="min-h-screen bg-white font-sans selection:bg-emerald-100 overflow-x-hidden">
  <nav class="fixed top-0 left-0 right-0 z-[100] glass-nav page-pad py-4">
    <div class="wide-shell max-w-7xl mx-auto flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-2xl bg-slate-950 flex items-center justify-center font-black text-emerald-500 shadow-xl ring-2 ring-emerald-500/10">P.</div>
        <span class="font-black text-2xl tracking-tighter italic text-slate-950 uppercase">Pulse<span class="brand-dot">.</span></span>
      </div>
      <div class="hidden lg:flex items-center gap-12">
        <a href="#network" class="nav-link font-black uppercase text-slate-400 hover:text-emerald-600 transition-colors">Network</a>
        <a href="#trips" class="nav-link font-black uppercase text-slate-400 hover:text-emerald-600 transition-colors">Trips</a>
        <a href="#ledger" class="nav-link font-black uppercase text-slate-400 hover:text-emerald-600 transition-colors">Ledger</a>
        <a href="#drivers" class="nav-link font-black uppercase text-slate-400 hover:text-emerald-600 transition-colors">Drivers</a>
        <a href="#contracts" class="nav-link font-black uppercase text-slate-400 hover:text-emerald-600 transition-colors">Contracts</a>
      </div>
      <a href="/sign-up" target="_top" class="px-10 py-3 bg-slate-950 text-white rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600 shadow-2xl transition-all">Enter OS</a>
    </div>
  </nav>

  <section class="relative pt-44 pb-40 page-pad bg-slate-50 overflow-hidden">
    <div class="max-w-7xl mx-auto wide-shell grid lg:grid-cols-2 gap-16 xl:gap-24 items-center">
      <div class="relative z-10 reveal">
        <div class="inline-flex items-center gap-3 bg-white px-5 py-2.5 rounded-full mb-10 border border-slate-100 shadow-sm hover-float">
          <i data-lucide="sparkles" class="w-4 h-4 text-emerald-600"></i>
          <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Global Logistics Hub v4.0</span>
        </div>
        <h1 class="hero-title font-black text-slate-900 italic mb-12 uppercase max-w-[9.5ch]">
          <span id="typewriter" data-text="MOVE BUSINESS FASTER"></span><span class="dot-light">.</span><span class="type-cursor"></span>
        </h1>
        <p class="support-copy text-slate-500 font-medium max-w-xl mb-14">
          Run your entire transport business on one platform. From loads to payments — manage everything in one simple, unified flow.
        </p>
        <div class="flex flex-col sm:flex-row gap-6">
          <a href="/sign-in" target="_top" class="px-16 py-8 bg-emerald-600 text-white rounded-[4rem] font-black text-sm uppercase tight-btn shadow-[0_20px_50px_-10px_rgba(16,185,129,0.5)] hover:bg-emerald-700 transition-all text-center hover-float">Get Started</a>
          <a href="#network" class="px-16 py-8 bg-white border border-slate-200 rounded-[4rem] font-black text-sm uppercase tight-btn hover:bg-slate-50 transition-all text-center hover-float">See Features</a>
        </div>
      </div>
      <div class="relative reveal">
        <div class="relative z-10 bg-slate-950 rounded-[4.5rem] p-14 shadow-[0_60px_120px_-20px_rgba(0,0,0,0.35)] border border-white/10 hover-float">
          <div class="flex justify-between items-center mb-12">
            <div class="flex gap-2"><div class="w-3 h-3 rounded-full bg-rose-500"></div><div class="w-3 h-3 rounded-full bg-amber-500"></div><div class="w-3 h-3 rounded-full bg-emerald-500"></div></div>
            <span class="text-[10px] font-black text-emerald-400 uppercase tracking-[0.5em] italic">Pulse_Active</span>
          </div>
          <div class="space-y-8">
            <div class="p-8 rounded-3xl bg-white/5 border border-white/10 flex justify-between items-center">
              <div class="space-y-2"><p class="text-[10px] font-black text-slate-500 uppercase tracking-widest">Active Trip</p><p class="text-white text-xl font-black">DARJEELING HUB -> KOLKATA</p></div>
              <i data-lucide="activity" class="w-8 h-8 text-emerald-500"></i>
            </div>
            <div class="p-8 rounded-3xl bg-emerald-500 text-slate-950 shadow-xl shadow-emerald-500/20"><p class="text-[10px] uppercase font-black mb-2 opacity-60">System Liquidity</p><p class="text-4xl font-black italic">₹47,555.00</p></div>
          </div>
        </div>
        <div class="absolute -inset-12 rounded-full bg-emerald-500/20 blur-[120px] bg-glow -z-10"></div>
      </div>
    </div>
  </section>

  <section id="network" class="py-28 page-pad max-w-7xl mx-auto wide-shell overflow-hidden">
    <div class="grid lg:grid-cols-[1fr_1.05fr] gap-10 xl:gap-12 items-start">
      <div class="reveal">
        <h2 class="text-5xl md:text-7xl font-black tracking-tighter uppercase italic leading-none mb-6">Your Network. Fully Connected.<span class="text-emerald-500">.</span></h2>
        <p class="section-copy font-bold max-w-[44rem] text-slate-500 mb-10">Pulse connects you seamlessly with trusted clients and suppliers. Post requirements like social posts and get bids instantly.</p>
        <div class="space-y-4">
          <div class="flex items-center gap-5 p-6 rounded-[2.2rem] bg-slate-50 border border-slate-100 hover:border-emerald-200 transition-all">
            <div class="w-14 h-14 rounded-2xl bg-white flex items-center justify-center text-slate-400"><i data-lucide="boxes" class="w-7 h-7"></i></div>
            <div><h4 class="font-black text-slate-900 uppercase text-base tracking-tight">Give & Get Loads</h4><p class="text-slate-500 font-medium">Post trip requirements to your circles instantly.</p></div>
          </div>
          <div class="flex items-center gap-5 p-6 rounded-[2.2rem] bg-slate-50 border border-slate-100 hover:border-emerald-200 transition-all">
            <div class="w-14 h-14 rounded-2xl bg-white flex items-center justify-center text-slate-400"><i data-lucide="gavel" class="w-7 h-7"></i></div>
            <div><h4 class="font-black text-slate-900 uppercase text-base tracking-tight">Bid & Award</h4><p class="text-slate-500 font-medium">Match with the best partner rates via live bidding.</p></div>
          </div>
          <div class="flex items-center gap-5 p-6 rounded-[2.2rem] bg-slate-50 border border-slate-100 hover:border-emerald-200 transition-all">
            <div class="w-14 h-14 rounded-2xl bg-white flex items-center justify-center text-slate-400"><i data-lucide="users" class="w-7 h-7"></i></div>
            <div><h4 class="font-black text-slate-900 uppercase text-base tracking-tight">Trusted Partners</h4><p class="text-slate-500 font-medium">Only work with audited and verified business accounts.</p></div>
          </div>
        </div>
      </div>
      <div class="reveal">
        <div class="bg-slate-950 rounded-[3.2rem] p-8 xl:p-9 relative overflow-hidden shadow-[0_50px_120px_-30px_rgba(2,6,23,0.45)]">
          <div class="absolute inset-0 bg-gradient-to-br from-emerald-500/10 via-transparent to-transparent opacity-60"></div>
          <div class="relative z-10 space-y-4">
            <div class="p-7 rounded-[2.1rem] border border-white/5 bg-white/5 shadow-2xl">
              <div class="flex justify-between items-center mb-6"><span class="text-[10px] font-black text-emerald-400 uppercase tracking-widest">@GLOBAL_LOGISTICS_LTD</span><span class="text-[10px] text-white/20 font-bold italic">12m ago</span></div>
              <p class="text-white/80 text-[1.03rem] leading-relaxed mb-7 italic">"Seeking 20ft Container for Chennai dispatch. Load ready for tomorrow 6 AM. Trusted partners only."</p>
              <div class="flex justify-between items-center"><span class="text-2xl font-black text-white">₹22,000</span><a href="/sign-in" target="_top" class="px-7 py-3 bg-emerald-600 text-white rounded-full text-[10px] font-black uppercase shadow-lg">Submit Quote</a></div>
            </div>
            <div class="p-7 rounded-[2.1rem] border border-white/5 bg-white/5 shadow-2xl opacity-40 scale-95 blur-[1px]">
              <div class="flex justify-between items-center mb-6"><span class="text-[10px] font-black text-emerald-400 uppercase tracking-widest">@VENDHAN_FLEET</span><span class="text-[10px] text-white/20 font-bold italic">45m ago</span></div>
              <p class="text-white/80 text-[1.03rem] leading-relaxed mb-7 italic">"Reliable 14ft Open truck available in Delhi area for Jaipur route. Looking for return loads."</p>
              <div class="flex justify-between items-center"><span class="text-2xl font-black text-white">Market Rate</span><a href="/sign-in" target="_top" class="px-7 py-3 bg-emerald-600 text-white rounded-full text-[10px] font-black uppercase shadow-lg">Submit Quote</a></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <section id="trips" class="py-32 page-pad bg-slate-950 text-white rounded-[5rem] mx-4 relative overflow-hidden reveal">
    <div class="max-w-6xl mx-auto wide-shell">
      <h2 class="text-5xl md:text-7xl font-black tracking-tighter uppercase italic leading-none mb-6 text-center">End to End Trip Management<span class="text-emerald-500">.</span></h2>
      <p class="text-lg md:text-xl font-bold max-w-3xl leading-relaxed text-slate-400 mb-16 mx-auto text-center">Track live manifests from warehouse to destination. Link kilometers directly to payments.</p>
      <div class="grid md:grid-cols-3 gap-8">
        <div class="p-10 rounded-[3rem] bg-white/5 border border-white/10 text-center">
          <div class="w-16 h-16 bg-emerald-500/10 rounded-[1.5rem] flex items-center justify-center mx-auto mb-8"><i data-lucide="mouse-pointer-2" class="w-8 h-8 text-emerald-500"></i></div>
          <h4 class="font-black uppercase text-lg mb-3 tracking-tighter italic">Instant Assign</h4>
          <p class="text-slate-400 leading-relaxed font-medium">Push job details to driver apps in one tap.</p>
        </div>
        <div class="p-10 rounded-[3rem] bg-white/5 border border-white/10 text-center">
          <div class="w-16 h-16 bg-emerald-500/10 rounded-[1.5rem] flex items-center justify-center mx-auto mb-8"><i data-lucide="map-pinned" class="w-8 h-8 text-emerald-500"></i></div>
          <h4 class="font-black uppercase text-lg mb-3 tracking-tighter italic">Route Mapping</h4>
          <p class="text-slate-400 leading-relaxed font-medium">Live GPS updates with route optimization.</p>
        </div>
        <div class="p-10 rounded-[3rem] bg-white/5 border border-white/10 text-center">
          <div class="w-16 h-16 bg-emerald-500/10 rounded-[1.5rem] flex items-center justify-center mx-auto mb-8"><i data-lucide="check-circle-2" class="w-8 h-8 text-emerald-500"></i></div>
          <h4 class="font-black uppercase text-lg mb-3 tracking-tighter italic">Auto-Settlement</h4>
          <p class="text-slate-400 leading-relaxed font-medium">Completion auto-logs entries into your ledger.</p>
        </div>
      </div>
    </div>
  </section>

  <section id="ledger" class="py-40 page-pad max-w-7xl mx-auto wide-shell">
    <h2 class="text-5xl md:text-7xl font-black tracking-tighter uppercase italic leading-none mb-6 reveal">Know Exactly Who Paid What<span class="text-emerald-500">.</span></h2>
    <p class="text-lg md:text-xl font-bold max-w-xl leading-relaxed text-slate-500 mb-16 reveal">A shared ledger between you and your partners.</p>
    <div class="grid lg:grid-cols-2 gap-12">
      <div class="p-16 rounded-[4.5rem] bg-white border border-slate-100 shadow-[0_50px_120px_-30px_rgba(0,0,0,0.1)] reveal hover-float">
        <div class="flex justify-between items-center p-8 bg-slate-50 rounded-[2.5rem] mb-6"><span class="font-black text-slate-400 uppercase text-xs tracking-widest">My Ledger</span><span class="font-black text-4xl text-slate-900 tracking-tighter italic">₹5,839.00</span></div>
        <div class="flex justify-between items-center p-8 bg-emerald-50 rounded-[2.5rem] border border-emerald-100"><span class="font-black text-emerald-600 uppercase text-xs tracking-widest">Partner Side</span><span class="font-black text-4xl text-emerald-600 tracking-tighter italic">₹5,839.00</span></div>
      </div>
      <div class="p-16 rounded-[4.5rem] bg-emerald-600 text-white shadow-3xl reveal hover-float">
        <h4 class="text-4xl font-black italic uppercase mb-6 leading-tight">No Payment Confusion<span class="dot-on-green">.</span></h4>
        <p class="text-emerald-100 text-xl font-medium leading-relaxed">Pulse OS enforces pricing rules before manifest lock.</p>
        <a href="/sign-in" target="_top" class="block w-full py-8 bg-slate-950 text-white rounded-[3rem] font-black text-sm uppercase tracking-[0.4em] shadow-2xl mt-16 text-center">Configure My Pricing</a>
      </div>
    </div>
  </section>

  <section id="drivers" class="py-32 page-pad bg-slate-50">
    <div class="max-w-7xl mx-auto wide-shell grid lg:grid-cols-2 gap-20 items-center">
      <div class="reveal">
        <h2 class="text-5xl md:text-7xl font-black tracking-tighter uppercase italic leading-none mb-6">Built for Drivers Too<span class="text-emerald-500">.</span></h2>
        <p class="text-lg md:text-xl font-bold max-w-xl leading-relaxed text-slate-500 mb-12">Empower your pilots with a mobile app for trip updates, digital PODs, and expense tracking.</p>
        <div class="grid grid-cols-2 gap-5">
          <div class="p-7 bg-white rounded-[2rem] border border-slate-100 shadow-sm flex flex-col items-center text-center gap-3"><i data-lucide="smartphone" class="w-8 h-8 text-emerald-500"></i><span class="font-black uppercase text-xs tracking-widest text-slate-800">Pilot App</span></div>
          <div class="p-7 bg-white rounded-[2rem] border border-slate-100 shadow-sm flex flex-col items-center text-center gap-3"><i data-lucide="camera" class="w-8 h-8 text-emerald-500"></i><span class="font-black uppercase text-xs tracking-widest text-slate-800">Instant POD</span></div>
          <div class="p-7 bg-white rounded-[2rem] border border-slate-100 shadow-sm flex flex-col items-center text-center gap-3"><i data-lucide="fuel" class="w-8 h-8 text-emerald-500"></i><span class="font-black uppercase text-xs tracking-widest text-slate-800">Expense Logs</span></div>
          <div class="p-7 bg-white rounded-[2rem] border border-slate-100 shadow-sm flex flex-col items-center text-center gap-3"><i data-lucide="wallet" class="w-8 h-8 text-emerald-500"></i><span class="font-black uppercase text-xs tracking-widest text-slate-800">Pay Status</span></div>
        </div>
      </div>
      <div class="reveal flex justify-center">
        <div class="w-72 h-[560px] bg-slate-950 rounded-[4rem] border-[14px] border-slate-900 shadow-[0_80px_160px_-40px_rgba(0,0,0,0.4)] p-10 relative overflow-hidden">
          <div class="absolute top-0 left-1/2 -translate-x-1/2 w-16 h-8 bg-slate-900 rounded-b-2xl"></div>
          <div class="mt-10 space-y-8">
            <div class="flex items-center gap-3"><div class="w-2.5 h-2.5 rounded-full bg-emerald-500"></div><span class="text-[10px] font-black text-white/40 uppercase tracking-widest">Active_Trip</span></div>
            <h5 class="text-3xl font-black tracking-tighter text-white italic uppercase leading-none">VARANASI HUB</h5>
            <div class="space-y-4">
              <div class="h-2 w-full bg-white/5 rounded-full overflow-hidden"><div class="h-full w-2/3 bg-emerald-500 shadow-[0_0_15px_#10b981]"></div></div>
              <div class="p-5 bg-white/5 rounded-[1.5rem] border border-white/5">
                <p class="text-[8px] font-black text-slate-500 uppercase mb-2">Assigned Manifest</p>
                <p class="text-xs font-bold text-white uppercase tracking-tight italic">20ft_Cont_TRP092</p>
              </div>
            </div>
          </div>
          <a href="/sign-in" target="_top" class="absolute bottom-10 left-10 right-10 py-4 bg-emerald-600 text-white rounded-3xl font-black text-[11px] uppercase text-center shadow-2xl">Upload POD Proof</a>
        </div>
      </div>
    </div>
  </section>

  <section id="contracts" class="py-40 page-pad max-w-7xl mx-auto wide-shell">
    <div class="text-center mb-20 reveal">
      <h2 class="text-5xl md:text-7xl font-black tracking-tighter uppercase italic leading-none mb-6">Standardize Your Business<span class="text-emerald-500">.</span></h2>
      <p class="text-lg md:text-xl font-bold max-w-3xl mx-auto leading-relaxed text-slate-500">Define your lane pricing and unloading rules once. Automated contracts ensure everyone agrees before the wheel turns.</p>
    </div>
    <div class="grid lg:grid-cols-2 gap-12">
      <div class="p-16 rounded-[4rem] bg-slate-950 text-white shadow-3xl relative overflow-hidden reveal">
        <h4 class="text-3xl font-black italic uppercase mb-10">Standard Rules</h4>
        <div class="space-y-8">
          <div class="flex justify-between items-center py-5 border-b border-white/5"><span class="text-sm font-bold text-slate-500 uppercase tracking-widest">Lane Pricing</span><span class="font-black text-emerald-500 uppercase text-sm tracking-[0.2em]">Fixed System Rate</span></div>
          <div class="flex justify-between items-center py-5 border-b border-white/5"><span class="text-sm font-bold text-slate-500 uppercase tracking-widest">Weight Logic</span><span class="font-black text-emerald-500 uppercase text-sm tracking-[0.2em]">Per Ton / Trip Split</span></div>
          <div class="flex justify-between items-center py-5 border-b border-white/5"><span class="text-sm font-bold text-slate-500 uppercase tracking-widest">Loading Policy</span><span class="font-black text-emerald-500 uppercase text-sm tracking-[0.2em]">Verified Manual Audit</span></div>
        </div>
      </div>
      <div id="pricing" class="p-16 rounded-[4rem] bg-emerald-600 text-white shadow-3xl reveal flex flex-col justify-between hover-float">
        <div>
          <h4 class="text-4xl font-black italic uppercase mb-6 leading-tight">No Payment<br/>Confusion<span class="dot-on-green">.</span></h4>
          <p class="text-emerald-100 text-xl font-medium leading-relaxed">Pulse OS enforces your pricing rules at the start, ensuring every partner agrees on the price before the manifest is locked.</p>
        </div>
        <a href="/sign-in" target="_top" class="block w-full py-8 bg-slate-950 text-white rounded-[3rem] font-black text-sm uppercase tracking-[0.4em] shadow-2xl mt-16 text-center">Configure My Pricing</a>
      </div>
    </div>
  </section>

  <section class="py-40 page-pad max-w-5xl mx-auto wide-shell text-center reveal">
    <h2 class="text-6xl font-black tracking-tighter italic uppercase mb-20">3 Steps To Start<span class="text-emerald-500">.</span></h2>
    <div class="grid sm:grid-cols-3 gap-12 relative">
      <div class="absolute top-10 left-0 right-0 h-px bg-slate-100 hidden sm:block"></div>
      <div class="relative z-10 space-y-6">
        <div class="w-20 h-20 rounded-full bg-slate-950 text-white flex items-center justify-center mx-auto text-2xl font-black italic shadow-2xl border-4 border-white">01</div>
        <div><h4 class="font-black uppercase text-lg tracking-tighter">Add Your Network</h4><p class="text-slate-400 font-bold uppercase text-xs tracking-widest mt-2">Invite partners & vendors.</p></div>
      </div>
      <div class="relative z-10 space-y-6">
        <div class="w-20 h-20 rounded-full bg-slate-950 text-white flex items-center justify-center mx-auto text-2xl font-black italic shadow-2xl border-4 border-white">02</div>
        <div><h4 class="font-black uppercase text-lg tracking-tighter">Log Trips</h4><p class="text-slate-400 font-bold uppercase text-xs tracking-widest mt-2">Manage manifests live.</p></div>
      </div>
      <div class="relative z-10 space-y-6">
        <div class="w-20 h-20 rounded-full bg-slate-950 text-white flex items-center justify-center mx-auto text-2xl font-black italic shadow-2xl border-4 border-white">03</div>
        <div><h4 class="font-black uppercase text-lg tracking-tighter">Grow Fast</h4><p class="text-slate-400 font-bold uppercase text-xs tracking-widest mt-2">Scale with digital ledger.</p></div>
      </div>
    </div>
  </section>

  <section class="py-56 page-pad bg-slate-950 text-white text-center relative overflow-hidden rounded-t-[6rem]">
    <div class="max-w-5xl mx-auto relative z-10 reveal">
      <h2 class="final-title font-black italic mb-16 uppercase">
        <span id="final-typewriter" data-text="CONNECT YOUR BUSINESS"></span><span class="text-emerald-500">.</span>
      </h2>
      <a href="/sign-in" target="_top" class="inline-block px-24 py-10 bg-emerald-600 text-white rounded-[5rem] font-black text-xl uppercase tracking-[0.2em] shadow-[0_40px_100px_rgba(16,185,129,0.4)] hover-float">Initialize Now</a>
    </div>
    <div class="absolute inset-0 opacity-[0.02] pointer-events-none text-white font-black text-[35vw] select-none leading-none top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">PULSE.</div>
  </section>

  <footer class="py-16 page-pad bg-slate-950 border-t border-white/5 text-center">
    <p class="text-[11px] font-black text-slate-600 uppercase tracking-widest leading-relaxed italic">GoGoX pulse • All rights reserved 2024</p>
  </footer>
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

    const HEADER_OFFSET = 96;
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
  </script>
</body>
</html>`;

export default function TerminalWebsitePage() {
  const router = useRouter();

  if (Platform.OS !== 'web') {
    return (
      <View style={styles.nativeWrap}>
        <Text style={styles.nativeTitle}>
          Pulse<Text style={styles.nativeTitleDot}>.</Text> Website
        </Text>
        <Text style={styles.nativeBody}>This page is designed for web. Continue to sign in.</Text>
        <Pressable onPress={() => router.push('/sign-in')} style={styles.nativeBtn}>
          <Text style={styles.nativeBtnText}>Go to Sign In</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <iframe
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
  nativeTitle: { fontSize: 32, fontWeight: '900', color: '#020617', fontStyle: 'italic' },
  nativeTitleDot: { color: '#10b981' },
  nativeBody: { marginTop: 10, fontSize: 15, color: '#64748b', textAlign: 'center' },
  nativeBtn: {
    marginTop: 16,
    backgroundColor: '#10b981',
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  nativeBtnText: { color: '#fff', fontWeight: '900', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.8 },
});
