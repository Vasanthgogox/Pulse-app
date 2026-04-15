// import {
//     Activity,
//     Bell,
//     Check,
//     CheckCircle2,
//     ChevronLeft,
//     ChevronRight,
//     ChevronUp,
//     Fingerprint,
//     Globe,
//     History,
//     Layers,
//     LayoutGrid,
//     Link2,
//     LogOut,
//     Medal,
//     Milestone,
//     Plus,
//     RefreshCw,
//     ShieldCheck,
//     ShieldHalf,
//     Star,
//     Target,
//     Trophy,
//     Truck as TruckIcon,
//     User,
//     UserCheck2,
//     UserPlus2,
//     UserX,
//     X
// } from 'lucide-react';
// import React, { useState } from 'react';

// // --- PREMIUM LIGHT DESIGN SYSTEM ---
// const PRIMARY_EMERALD = "#10B981"; 
// const SLATE_DARK = "#0F172A";
// const SOFT_SLATE = "#64748B";
// const ACCENT_GOLD = "#F59E0B";

// // --- MOCK DATA ---
// const PILOT_PROFILE = {
//   name: "RAJESH KUMAR",
//   id: "QU-PILOT-9921",
//   level: 14,
//   xp: 780, 
//   xpToNext: 1000,
//   rating: 4.8,
//   safetyScore: 98,
//   reliability: 94,
//   totalTrips: 142,
//   totalYield: 1485000,
//   vehicle: "NL-01-4567 // 32FT MXL",
//   region: "Maharashtra (West)",
//   status: "ACTIVE_LINK",
//   quests: [
//     { id: 'Q1', title: 'Neural Handshake', desc: 'Complete Biometric KYC', status: 'COMPLETED', xp: 500, countReq: 1, countDone: 1, icon: <Fingerprint size={20}/> },
//     { id: 'Q2', title: 'Fleet Pioneer', desc: 'Add 5 trips to ledger', status: 'IN_PROGRESS', progress: 60, xp: 1000, countReq: 5, countDone: 3, icon: <TruckIcon size={20}/> },
//     { id: 'Q3', title: 'Elite Rating', desc: 'Get 10 5-star reviews', status: 'IN_PROGRESS', progress: 80, xp: 500, countReq: 10, countDone: 8, icon: <Star size={20}/> },
//     { id: 'Q4', title: 'Chain Verifier', desc: 'Settle 10 Shared Ledgers', status: 'IN_PROGRESS', progress: 40, xp: 1500, countReq: 10, countDone: 4, icon: <RefreshCw size={20}/> }
//   ]
// };

// const PUBLIC_NETWORK_USERS = [
//   {
//     id: 'QU-PILOT-4482',
//     name: 'AMIT SHARMA',
//     level: 22,
//     tier: 'PLATINUM',
//     rating: 4.9,
//     safetyScore: 96,
//     totalTrips: 310,
//     region: 'Gujarat North',
//     status: 'PENDING_INCOMING',
//     avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Amit'
//   },
//   {
//     id: 'QU-PILOT-1102',
//     name: 'SURESH VERMA',
//     level: 9,
//     tier: 'SILVER',
//     rating: 4.2,
//     safetyScore: 88,
//     totalTrips: 45,
//     region: 'Pune SEZ',
//     status: 'DISCOVERED',
//     avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Suresh'
//   }
// ];

// const getTierData = (level) => {
//   if (level <= 10) return { label: 'SILVER', color: '#94A3B8', bg: 'bg-slate-400', border: 'border-slate-300', nextTier: 'GOLD', levelsToNext: 11 - level, unlock: 'Base Freight Access' };
//   if (level <= 20) return { label: 'GOLD', color: '#F59E0B', bg: 'bg-amber-500', border: 'border-amber-400', nextTier: 'PLATINUM', levelsToNext: 21 - level, unlock: 'Priority Load Bidding' };
//   if (level <= 30) return { label: 'PLATINUM', color: '#38BDF8', bg: 'bg-sky-400', nextTier: 'TITANIUM', levelsToNext: 31 - level, unlock: 'Instant Settlement' };
//   return { label: 'TITANIUM', color: '#E11D48', bg: 'bg-rose-600', border: 'border-rose-400', nextTier: 'MAX', levelsToNext: 0, unlock: 'Zero Fee Withdrawals' };
// };

// const INITIAL_FINANCE_DATA = {
//   clients: [
//     { id: 'C1', name: 'AMAZON INDIA', sales: 650000, paid: 600000, due: 50000, trips: 14, integrated: true, syncStatus: 'VERIFIED', model: 'ASSET' },
//     { id: 'C2', name: 'SAMSUNG SEZ', sales: 420000, paid: 420000, due: 0, trips: 8, integrated: true, syncStatus: 'MISMATCH', model: 'AGGREGATE' },
//   ],
//   suppliers: [
//     { id: 'S1', name: 'GURU LOGS', sales: 125000, paid: 112500, due: 12500, trips: 5, integrated: true, syncStatus: 'VERIFIED', model: 'ASSET' },
//     { id: 'S2', name: 'PUNJAB CAR', sales: 85000, paid: 83000, due: 2000, trips: 3, integrated: false, model: 'AGGREGATE' },
//   ],
// };

// const INITIAL_TRIPS = [
//   { 
//     id: 'T-901', 
//     client: 'AMAZON IN', 
//     client_id: 'C1',
//     origin: 'MUMBAI', 
//     dest: 'DELHI', 
//     status: 'TRANSIT',
//     source: 'SOURCED', 
//     supplier: 'GURU LOGS',
//     supplier_id: 'S1',
//     vehicle: 'NL-01-4567',
//     driver: 'Rajesh K.',
//     finance: {
//       baseRevenue: 65000,
//       adjustedRevenue: 68500,
//       cost: 52000,
//       collected: 15000,
//       paidToSupplier: 10000,
//       expenses: [
//         { id: 'E1', type: 'FUEL', amount: 4500, date: '26 FEB' },
//         { id: 'E2', type: 'TOLL', amount: 1200, date: '27 FEB' }
//       ]
//     }
//   }
// ];

// const INITIAL_TRANSACTIONS = [
//   { id: 'TX-101', party_id: 'C1', date: '26 Feb', type: 'TRIP', ref: 'T-901', amount: 65000, direction: 'IN', status: 'confirmed', integrated: true },
//   { id: 'TX-102', party_id: 'C1', date: '27 Feb', type: 'PAYMENT', ref: 'PY-442', amount: 15000, direction: 'OUT', status: 'pending', integrated: true, counter_amount: 12000 },
//   { id: 'TX-301', party_id: 'S1', date: '01 Mar', type: 'TRIP_COST', ref: 'T-901', amount: 52000, direction: 'OUT', status: 'confirmed', integrated: true },
// ];

// // --- STYLISH LIGHT COMPONENTS ---

// const HudHeader = ({ title, subtitle, showBack, onBack, onNetworkClick, onProfileClick }) => (
//   <header className="pt-12 pb-4 px-6 bg-white/95 backdrop-blur-xl border-b border-slate-100 sticky top-0 z-[100] flex items-center justify-between">
//     <div className="flex items-center gap-4">
//       {showBack ? (
//         <button onClick={onBack} className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-50 border border-slate-100 active:scale-90 transition-all">
//           <ChevronLeft size={20} className="text-slate-900" strokeWidth={2.5} />
//         </button>
//       ) : (
//         <div className="relative group cursor-pointer" onClick={onProfileClick}>
//           <div className="absolute inset-0 bg-[#10B981] rounded-full blur-[6px] opacity-10 animate-pulse"></div>
//           <div className="w-11 h-11 rounded-full border-2 border-slate-100 p-0.5 relative z-10 overflow-hidden bg-white">
//              <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=Rajesh`} alt="Avatar" className="w-full h-full" />
//           </div>
//         </div>
//       )}
//       <div className="flex flex-col">
//         <h1 className="text-[15px] font-black tracking-tight text-slate-900 uppercase leading-none">{title}</h1>
//         {subtitle && (
//           <div className="flex items-center gap-1.5 mt-1.5">
//              <div className="w-1.5 h-1.5 bg-[#10B981] rounded-full animate-pulse"></div>
//              <p className="text-[9px] text-slate-500 font-bold tracking-[0.1em] uppercase">{subtitle}</p>
//           </div>
//         )}
//       </div>
//     </div>
//     <div className="flex items-center gap-2">
//       <button onClick={onNetworkClick} className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-50 border border-slate-100 text-slate-400 hover:text-[#10B981] transition-all">
//         <Globe size={18} className="animate-spin-slow" />
//       </button>
//       <div className="relative">
//         <button className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-50 border border-slate-100 text-slate-400">
//           <Bell size={18} />
//         </button>
//         <div className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></div>
//       </div>
//     </div>
//   </header>
// );

// const TacticalCard = ({ children, className = "" }) => (
//   <div className={`bg-white border border-slate-100 rounded-[24px] overflow-hidden shadow-[0_8px_30px_-10px_rgba(0,0,0,0.05)] hover:shadow-xl transition-all duration-300 ${className}`}>
//     {children}
//   </div>
// );

// export default function App() {
//   const [currentView, setCurrentView] = useState('directory'); 
//   const [selectedParty, setSelectedParty] = useState(null);
//   const [selectedTrip, setSelectedTrip] = useState(null);
//   const [selectedPublicUser, setSelectedPublicUser] = useState(null);
//   const [showSuccess, setShowSuccess] = useState(null);
//   const [tripSubTab, setTripSubTab] = useState('finance');
//   const [confirmingAction, setConfirmingAction] = useState(null); // { type: 'ACCEPT' | 'DECLINE', user: object }

//   const triggerSuccess = (msg) => {
//     setShowSuccess(msg || "SYNCED");
//     setTimeout(() => setShowSuccess(null), 2000);
//   };

//   const handleConfirmAction = () => {
//     if (!confirmingAction) return;
//     const msg = confirmingAction.type === 'ACCEPT' ? 'LINK ESTABLISHED' : 'REQUEST DECLINED';
//     triggerSuccess(msg);
//     setConfirmingAction(null);
//     // In a real app, we would remove the user from the pending list here
//   };

//   const renderContent = () => {
//     switch (currentView) {
//       case 'directory':
//         return (
//           <div className="flex-1 flex flex-col bg-[#F8FAFC] overflow-hidden animate-in fade-in duration-500 h-full">
//             <HudHeader 
//               title="Qu Treasury" 
//               subtitle="Network Active" 
//               onProfileClick={() => setCurrentView('profile')}
//               onNetworkClick={() => setCurrentView('networkDiscovery')}
//             />
            
//             <div className="flex-1 overflow-y-auto scrollbar-hide p-6 space-y-8 pb-32">
//               {['CLIENT', 'SUPPLIER'].map(type => {
//                 const key = type.toLowerCase() + 's';
//                 const partners = INITIAL_FINANCE_DATA[key] || [];
                
//                 return (
//                   <div key={type} className="space-y-4">
//                     <div className="flex items-center justify-between px-1">
//                       <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">{type} Nodes</h4>
//                       <div className="h-[1px] flex-1 bg-slate-100 mx-4"></div>
//                       <LayoutGrid size={14} className="text-slate-300"/>
//                     </div>
//                     <div className="grid grid-cols-1 gap-4">
//                       {partners.map(p => (
//                         <TacticalCard key={p.id}>
//                           <button 
//                             onClick={() => { setSelectedParty(p); setCurrentView('ledger'); }}
//                             className="w-full p-5 flex justify-between items-center active:bg-slate-50 transition-all text-left"
//                           >
//                             <div className="flex items-center gap-4">
//                               <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border shadow-inner ${p.model === 'ASSET' ? 'bg-emerald-50 border-emerald-100 text-[#10B981]' : 'bg-amber-50 border-amber-100 text-[#F59E0B]'}`}>
//                                 {p.model === 'ASSET' ? <TruckIcon size={20}/> : <Layers size={20}/>}
//                               </div>
//                               <div className="flex flex-col">
//                                  <div className="flex items-center gap-2">
//                                     <p className="text-[15px] font-black text-slate-900 tracking-tight">{p.name}</p>
//                                     {p.integrated && <Link2 size={12} className="text-[#10B981] animate-pulse"/>}
//                                  </div>
//                                  <div className="flex items-center gap-2 mt-1">
//                                     <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">{p.trips} Trips</span>
//                                     <div className="w-1 h-1 rounded-full bg-slate-200"></div>
//                                     <span className={`text-[8px] font-black uppercase ${p.syncStatus === 'VERIFIED' ? 'text-[#10B981]' : 'text-amber-500'}`}>{p.syncStatus}</span>
//                                  </div>
//                               </div>
//                             </div>
//                             <div className="text-right">
//                                <p className="text-[16px] font-black text-slate-900 mb-0.5">₹{(p.due/1000).toFixed(1)}K</p>
//                                <p className="text-[8px] font-black text-zinc-300 uppercase tracking-widest">Balance</p>
//                             </div>
//                           </button>
//                         </TacticalCard>
//                       ))}
//                     </div>
//                   </div>
//                 );
//               })}
//             </div>
//           </div>
//         );

//       case 'ledger':
//         return (
//           <div className="flex-1 flex flex-col bg-white overflow-hidden animate-in slide-in-from-right duration-300 h-full">
//             <HudHeader title={selectedParty.name} subtitle="Verified Ledger" showBack={true} onBack={() => setCurrentView('directory')} />
            
//             <div className="p-6 bg-[#F9FAFB] border-b border-zinc-100 relative overflow-hidden">
//                <div className="absolute top-0 right-0 p-4 opacity-5"><Activity size={100} className="text-[#10B981]"/></div>
//                <div className="flex justify-between items-end relative z-10">
//                   <div>
//                     <p className="text-[9px] font-black text-zinc-400 uppercase tracking-[0.3em] mb-2">Total Exposure</p>
//                     <h2 className="text-[42px] font-black text-zinc-900 tracking-tighter leading-none">₹{selectedParty.due.toLocaleString()}</h2>
//                   </div>
//                   <div className="text-right flex flex-col items-end gap-3">
//                      <div className="flex items-center bg-white border border-zinc-200 rounded-full px-4 py-1.5 gap-2 shadow-sm">
//                         <ShieldCheck size={12} className="text-[#10B981]"/>
//                         <span className="text-[8px] font-black text-zinc-600 uppercase tracking-widest">Synced</span>
//                      </div>
//                      <p className="text-[7px] font-black text-[#10B981] uppercase tracking-[0.4em] animate-pulse">Link Online</p>
//                   </div>
//                </div>
//             </div>

//             <div className="flex-1 overflow-y-auto scrollbar-hide bg-white">
//               <table className="w-full text-left">
//                 <thead className="sticky top-0 z-20 bg-white/90 backdrop-blur-md">
//                    <tr className="text-[8px] font-black text-zinc-400 uppercase tracking-[0.4em] border-b border-zinc-50">
//                       <th className="py-5 px-6">Date</th>
//                       <th className="py-5 px-2">Ref</th>
//                       <th className="py-5 px-2 text-right">In</th>
//                       <th className="py-5 px-6 text-right">Out</th>
//                    </tr>
//                 </thead>
//                 <tbody className="divide-y divide-zinc-50">
//                    {INITIAL_TRANSACTIONS.filter(t => t.party_id === (selectedParty.id === 'C1' ? 'C1' : 'S1')).map(tx => (
//                      <tr key={tx.id} className="active:bg-zinc-50 transition-all group cursor-pointer" onClick={() => triggerSuccess(`AUDIT: ${tx.id}`)}>
//                         <td className="py-6 px-6">
//                            <p className="text-[12px] font-black text-zinc-900">{tx.date}</p>
//                            <p className="text-[8px] font-bold text-zinc-300 uppercase mt-1 tracking-widest">#{tx.id}</p>
//                         </td>
//                         <td className="py-6 px-2">
//                            <div className="flex items-center gap-3">
//                               <div className="w-2 h-2 rounded-full bg-[#10B981]/20 group-hover:bg-[#10B981] transition-all"></div>
//                               <div>
//                                  <p className="text-[11px] font-black text-zinc-700 uppercase tracking-tight">{tx.ref}</p>
//                                  <p className="text-[7px] font-black text-zinc-300 uppercase tracking-widest">{tx.type}</p>
//                               </div>
//                            </div>
//                         </td>
//                         <td className="py-6 px-2 text-right">
//                            <span className={`text-[14px] font-black ${tx.direction === 'IN' ? 'text-[#10B981]' : 'text-zinc-200'}`}>
//                              {tx.direction === 'IN' ? `₹${tx.amount.toLocaleString()}` : '—'}
//                            </span>
//                         </td>
//                         <td className="py-6 px-6 text-right">
//                            <span className={`text-[14px] font-black ${tx.direction === 'OUT' ? 'text-[#E11D48]' : 'text-zinc-200'}`}>
//                              {tx.direction === 'OUT' ? `₹${tx.amount.toLocaleString()}` : '—'}
//                            </span>
//                         </td>
//                      </tr>
//                    ))}
//                 </tbody>
//               </table>
//             </div>

//             <button className="absolute bottom-10 right-8 w-16 h-16 bg-[#10B981] text-white rounded-full flex items-center justify-center shadow-[0_10px_25px_rgba(16,185,129,0.3)] active:scale-90 transition-all">
//                <Plus size={32} strokeWidth={3} />
//             </button>
//           </div>
//         );

//       case 'profile':
//         const p = PILOT_PROFILE;
//         const tier = getTierData(p.level);
//         const xpProgress = (p.xp / p.xpToNext) * 100;
//         return (
//           <div className="flex-1 flex flex-col bg-[#F8FAFC] overflow-hidden animate-in slide-in-from-bottom duration-400 h-full">
//              <HudHeader title="Identity Hub" subtitle="Biometric Match" showBack={true} onBack={() => setCurrentView('directory')} />
             
//              <div className="flex-1 overflow-y-auto scrollbar-hide p-6 space-y-8 pb-32">
//                 <div className="flex flex-col items-center gap-6 py-4">
//                    <div className="relative">
//                       <svg className="w-36 h-36 -rotate-90">
//                          <circle cx="72" cy="72" r="68" stroke="#E5E7EB" strokeWidth="6" fill="none" />
//                          <circle 
//                             cx="72" cy="72" r="68" stroke={PRIMARY_EMERALD} strokeWidth="6" fill="none" 
//                             strokeDasharray={427} strokeDashoffset={427 - (427 * xpProgress) / 100}
//                             className="transition-all duration-1000 ease-out"
//                             strokeLinecap="round"
//                          />
//                       </svg>
//                       <div className="absolute inset-0 flex items-center justify-center">
//                          <div className="w-28 h-28 rounded-full bg-white border-4 border-white shadow-xl overflow-hidden relative">
//                             <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=Rajesh`} alt="Pilot" />
//                          </div>
//                       </div>
//                       <div className={`absolute -bottom-1 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full ${tier.bg} text-white text-[9px] font-black shadow-lg border-2 border-white`}>
//                          LVL {p.level}
//                       </div>
//                    </div>
                   
//                    <div className="text-center">
//                       <h2 className="text-[26px] font-black text-zinc-900 leading-none tracking-tight">{p.name}</h2>
//                       <div className="flex items-center justify-center gap-3 mt-3">
//                          <div className="flex items-center gap-1 bg-white border border-slate-100 px-3 py-1 rounded-full shadow-sm">
//                             <Star size={10} className="text-amber-500 fill-amber-500"/>
//                             <span className="text-[10px] font-black text-zinc-700">{p.rating}</span>
//                          </div>
//                          <div className="flex items-center gap-1 bg-white border border-slate-100 px-3 py-1 rounded-full shadow-sm">
//                             <ShieldCheck size={12} className="text-[#10B981]"/>
//                             <span className="text-[10px] font-black text-zinc-700">{tier.label} ELITE</span>
//                          </div>
//                       </div>
//                    </div>
//                 </div>

//                 <TacticalCard className="bg-[#10B981] border-none shadow-[0_15px_30px_rgba(16,185,129,0.2)]">
//                    <div className="p-6 space-y-6 cursor-pointer" onClick={() => setCurrentView('levelDetail')}>
//                       <div className="flex justify-between items-end">
//                          <div>
//                             <p className="text-[9px] font-black text-white/60 uppercase tracking-[0.3em] mb-1.5">Elite Evolution</p>
//                             <p className="text-[18px] font-black text-white uppercase">Road to {tier.nextTier}</p>
//                          </div>
//                          <div className="text-right">
//                             <p className="text-[18px] font-black text-white">{p.xp} / {p.xpToNext}</p>
//                             <p className="text-[7px] font-black text-white/50 uppercase tracking-widest">XP Progress</p>
//                          </div>
//                       </div>
//                       <div className="w-full h-1.5 bg-black/10 rounded-full overflow-hidden">
//                          <div className="h-full bg-white shadow-[0_0_10px_white]" style={{ width: `${xpProgress}%` }}></div>
//                       </div>
//                       <div className="flex justify-between items-center text-[7px] font-black uppercase text-white/70 tracking-[0.2em]">
//                          <span>Status: {p.status}</span>
//                          <span className="flex items-center gap-1">Milestone Tracker <ChevronRight size={10}/></span>
//                       </div>
//                    </div>
//                 </TacticalCard>

//                 <div className="grid grid-cols-2 gap-4">
//                    <TacticalCard className="p-6 flex flex-col items-center text-center">
//                       <Trophy size={28} className="text-[#F59E0B] mb-4"/>
//                       <p className="text-[20px] font-black text-zinc-900 leading-none">{p.totalTrips}</p>
//                       <p className="text-[7px] font-black text-zinc-400 uppercase tracking-widest mt-2">Trips</p>
//                    </TacticalCard>
//                    <TacticalCard className="p-6 flex flex-col items-center text-center">
//                       <Activity size={28} className="text-[#10B981] mb-4 animate-pulse" />
//                       <p className="text-[20px] font-black text-zinc-900 leading-none">{p.reliability}%</p>
//                       <p className="text-[7px] font-black text-zinc-400 uppercase tracking-widest mt-2">Uptime</p>
//                    </TacticalCard>
//                 </div>

//                 <div className="pt-4">
//                    <button className="w-full py-5 bg-white border border-zinc-200 text-zinc-900 text-[12px] font-black uppercase tracking-[0.5em] rounded-2xl flex items-center justify-center gap-4 active:bg-zinc-900 active:text-white transition-all shadow-sm">
//                       <LogOut size={20}/> Terminate Link
//                    </button>
//                 </div>
//              </div>
//           </div>
//         );

//       case 'levelDetail':
//         const currentTier = getTierData(PILOT_PROFILE.level);
//         const segments = [11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
        
//         return (
//           <div className="flex-1 flex flex-col bg-white overflow-hidden animate-in slide-in-from-right duration-300 h-full">
//              <HudHeader title="Milestone Map" subtitle="Evolution Protocol" showBack={true} onBack={() => setCurrentView('profile')} />
             
//              <div className="flex-1 overflow-y-auto scrollbar-hide p-6 space-y-10 pb-32">
//                 <div className="p-8 bg-slate-900 rounded-[40px] text-white relative overflow-hidden shadow-2xl">
//                    <div className="absolute top-0 right-0 p-8 opacity-10"><Milestone size={120} /></div>
//                    <div className="relative z-10 flex flex-col items-center text-center space-y-4">
//                       <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-[#10B981] shadow-xl">
//                          <ChevronUp size={32} strokeWidth={3} className="animate-bounce" />
//                       </div>
//                       <div>
//                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mb-1">Upgrade Distance</p>
//                          <h2 className="text-[48px] font-black tracking-tighter leading-none">{PILOT_PROFILE.xpToNext - PILOT_PROFILE.xp} <span className="text-[14px] text-[#10B981]">XP</span></h2>
//                          <p className="text-[9px] font-bold text-slate-500 uppercase mt-4 tracking-widest leading-relaxed">
//                             Complete the tasks below to reach Level {PILOT_PROFILE.level + 1} <br/> and unlock <b>{currentTier.unlock}</b>.
//                          </p>
//                       </div>
//                    </div>
//                 </div>

//                 <div className="space-y-4">
//                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] px-2">Gold Path Progress</h4>
//                    <div className="flex justify-between items-center gap-1.5 px-2">
//                       {segments.map((s, i) => (
//                         <div key={s} className="flex-1 flex flex-col items-center gap-2">
//                            <div className={`w-full h-1.5 rounded-full transition-all ${s < PILOT_PROFILE.level ? 'bg-[#10B981]' : s === PILOT_PROFILE.level ? 'bg-[#10B981] animate-pulse shadow-[0_0_8px_#10B981]' : 'bg-slate-100'}`}></div>
//                            <span className={`text-[7px] font-black ${s === PILOT_PROFILE.level ? 'text-[#10B981]' : 'text-slate-300'}`}>{s}</span>
//                         </div>
//                       ))}
//                    </div>
//                 </div>

//                 <div className="space-y-6">
//                    <div className="flex items-center justify-between px-2">
//                       <h4 className="text-[11px] font-black text-slate-900 uppercase tracking-[0.4em]">Next Mile Objectives</h4>
//                       <Target size={16} className="text-red-500"/>
//                    </div>
//                    <div className="space-y-4">
//                       {PILOT_PROFILE.quests.map(q => (
//                         <TacticalCard key={q.id} className={q.status === 'COMPLETED' ? 'bg-[#F0FDF4] border-[#10B981]/10 opacity-70' : 'bg-white'}>
//                            <div className="p-5 flex justify-between items-center text-left">
//                               <div className="flex items-center gap-4">
//                                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border transition-all ${q.status === 'COMPLETED' ? 'border-[#10B981] bg-[#10B981] text-white shadow-lg' : 'bg-slate-50 border-slate-100 text-slate-300'}`}>
//                                     {q.status === 'COMPLETED' ? <Check size={24} strokeWidth={4}/> : q.icon}
//                                  </div>
//                                  <div className="flex flex-col">
//                                     <p className={`text-[14px] font-black uppercase tracking-tight ${q.status === 'COMPLETED' ? 'text-slate-900 line-through decoration-slate-300' : 'text-slate-900'}`}>{q.title}</p>
//                                     <p className="text-[9px] font-bold text-slate-400 uppercase mt-1 tracking-widest">{q.desc}</p>
//                                  </div>
//                               </div>
//                               <div className="text-right shrink-0 ml-4">
//                                  {q.status === 'COMPLETED' ? (
//                                    <div className="bg-white px-3 py-1 rounded-full shadow-sm border border-emerald-100">
//                                       <span className="text-[8px] font-black text-[#10B981] uppercase tracking-widest">VERIFIED</span>
//                                    </div>
//                                  ) : (
//                                    <div className="flex flex-col items-end">
//                                       <p className="text-[18px] font-black text-slate-900">{q.countDone}<span className="text-slate-200 text-[12px]">/{q.countReq}</span></p>
//                                       <div className="w-16 h-1 bg-slate-100 rounded-full mt-1.5 overflow-hidden">
//                                          <div className="h-full bg-red-500" style={{width: `${(q.countDone/q.countReq)*100}%`}}></div>
//                                       </div>
//                                    </div>
//                                  )}
//                               </div>
//                            </div>
//                         </TacticalCard>
//                       ))}
//                    </div>
//                 </div>
//              </div>
//           </div>
//         );

//       case 'networkDiscovery':
//         return (
//           <div className="flex-1 flex flex-col bg-[#F8FAFC] overflow-hidden animate-in slide-in-from-bottom duration-400 h-full">
//              <HudHeader title="Network Nodes" subtitle="Scanning Regional Pilots" showBack={true} onBack={() => setCurrentView('directory')} />
             
//              <div className="flex-1 overflow-y-auto scrollbar-hide p-6 space-y-8 pb-32">
//                 <div className="space-y-6">
//                    <div className="flex items-center justify-between px-2">
//                       <h4 className="text-[11px] font-black text-slate-900 uppercase tracking-[0.4em]">Connection Requests</h4>
//                       <div className="px-2 py-1 bg-red-100 rounded-full text-[8px] font-black text-red-600 uppercase tracking-widest animate-pulse">1 Urgent</div>
//                    </div>
                   
//                    <div className="space-y-4">
//                       {PUBLIC_NETWORK_USERS.filter(u => u.status === 'PENDING_INCOMING').map(user => (
//                         <TacticalCard key={user.id}>
//                            <div className="p-5 flex justify-between items-center">
//                               <div className="flex items-center gap-4 cursor-pointer" onClick={() => { setSelectedPublicUser(user); setCurrentView('publicProfile'); }}>
//                                  <div className="w-12 h-12 rounded-full border-2 border-[#10B981]/20 p-0.5 overflow-hidden">
//                                     <img src={user.avatar} alt={user.name} className="w-full h-full" />
//                                  </div>
//                                  <div>
//                                     <p className="text-[14px] font-black text-slate-900 uppercase tracking-tight">{user.name}</p>
//                                     <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{user.region}</p>
//                                  </div>
//                               </div>
//                               <div className="flex gap-2">
//                                  <button 
//                                    onClick={() => setConfirmingAction({ type: 'ACCEPT', user })} 
//                                    className="p-3 bg-[#10B981] text-white rounded-xl shadow-lg shadow-emerald-100 active:scale-90 transition-all"
//                                  >
//                                     <Check size={18} strokeWidth={4}/>
//                                  </button>
//                                  <button 
//                                    onClick={() => setConfirmingAction({ type: 'DECLINE', user })} 
//                                    className="p-3 bg-white border border-slate-100 text-slate-400 rounded-xl active:scale-90 transition-all"
//                                  >
//                                     <X size={18} strokeWidth={3}/>
//                                  </button>
//                               </div>
//                            </div>
//                         </TacticalCard>
//                       ))}
//                    </div>
//                 </div>

//                 <div className="space-y-6">
//                    <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.4em] px-2">Nearby Pilots</h4>
//                    <div className="space-y-4">
//                       {PUBLIC_NETWORK_USERS.filter(u => u.status === 'DISCOVERED').map(user => (
//                         <TacticalCard key={user.id}>
//                            <div className="p-5 flex justify-between items-center">
//                               <div className="flex items-center gap-4 cursor-pointer" onClick={() => { setSelectedPublicUser(user); setCurrentView('publicProfile'); }}>
//                                  <div className="w-12 h-12 rounded-full bg-slate-50 border border-slate-100 overflow-hidden">
//                                     <img src={user.avatar} alt={user.name} className="w-full h-full opacity-60" />
//                                  </div>
//                                  <div>
//                                     <p className="text-[14px] font-black text-slate-900 uppercase tracking-tight">{user.name}</p>
//                                     <div className="flex items-center gap-2 mt-1">
//                                        <span className="text-[8px] font-black text-zinc-400 uppercase tracking-widest">{user.tier} ELITE</span>
//                                        <div className="w-1 h-1 rounded-full bg-slate-200"></div>
//                                        <span className="text-[8px] font-black text-[#10B981] uppercase tracking-widest">{user.safetyScore}% SAFETY</span>
//                                     </div>
//                                  </div>
//                               </div>
//                               <button onClick={() => triggerSuccess("INVITE RELAYED")} className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all">
//                                  <UserPlus2 size={14}/>
//                                  <span>Sync</span>
//                               </button>
//                            </div>
//                         </TacticalCard>
//                       ))}
//                    </div>
//                 </div>
//              </div>
//           </div>
//         );

//       case 'publicProfile':
//         if (!selectedPublicUser) return null;
//         const pu = selectedPublicUser;
//         const puTier = getTierData(pu.level);
//         return (
//           <div className="flex-1 flex flex-col bg-[#F8FAFC] overflow-hidden animate-in slide-in-from-right duration-400 h-full">
//              <HudHeader title="Pilot Node" subtitle="Public Tactical Data" showBack={true} onBack={() => setCurrentView('networkDiscovery')} />
             
//              <div className="flex-1 overflow-y-auto scrollbar-hide p-6 space-y-10 pb-32">
//                 <div className="flex flex-col items-center gap-6 py-4">
//                    <div className="relative">
//                       <div className={`w-32 h-32 rounded-full border-4 ${puTier.border} p-1 shadow-2xl relative overflow-hidden bg-white`}>
//                          <img src={pu.avatar} alt={pu.name} className="w-full h-full" />
//                       </div>
//                       <div className={`absolute -bottom-2 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-full ${puTier.bg} text-white text-[10px] font-black shadow-lg border-2 border-white`}>
//                          LVL {pu.level}
//                       </div>
//                    </div>
//                    <div className="text-center">
//                       <h2 className="text-[28px] font-black text-slate-900 leading-none tracking-tight">{pu.name}</h2>
//                       <p className="text-[10px] font-bold text-slate-400 uppercase mt-2 tracking-[0.4em]">{pu.id}</p>
//                    </div>
//                 </div>

//                 <div className="grid grid-cols-2 gap-4">
//                    <TacticalCard className="p-6 flex flex-col items-center text-center">
//                       <ShieldHalf size={28} className="text-[#10B981] mb-4"/>
//                       <p className="text-[24px] font-black text-slate-900 leading-none">{pu.safetyScore}%</p>
//                       <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-2">Safety Rating</p>
//                    </TacticalCard>
//                    <TacticalCard className="p-6 flex flex-col items-center text-center">
//                       <Medal size={28} className="text-amber-500 mb-4"/>
//                       <p className="text-[24px] font-black text-slate-900 leading-none">{pu.totalTrips}</p>
//                       <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-2">Verified Trips</p>
//                    </TacticalCard>
//                 </div>

//                 <div className="space-y-4">
//                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] px-2">Neural Status</h4>
//                    <div className="p-6 bg-white border border-slate-100 rounded-3xl space-y-4">
//                       <div className="flex justify-between items-center">
//                          <span className="text-[11px] font-black text-slate-600 uppercase">Region Lock</span>
//                          <span className="text-[11px] font-black text-slate-900 uppercase">{pu.region}</span>
//                       </div>
//                       <div className="flex justify-between items-center">
//                          <span className="text-[11px] font-black text-slate-600 uppercase">Account Rank</span>
//                          <span className={`text-[11px] font-black uppercase ${puTier.color === '#F59E0B' ? 'text-[#F59E0B]' : 'text-slate-500'}`}>{puTier.label} ELITE</span>
//                       </div>
//                       <div className="flex justify-between items-center">
//                          <span className="text-[11px] font-black text-slate-600 uppercase">Verification</span>
//                          <div className="flex items-center gap-1.5 text-[#10B981]">
//                             <CheckCircle2 size={14} strokeWidth={3}/>
//                             <span className="text-[11px] font-black uppercase">Active</span>
//                          </div>
//                       </div>
//                    </div>
//                 </div>

//                 <div className="pt-6 flex gap-4">
//                    <button onClick={() => triggerSuccess("SYNC REQUESTED")} className="flex-1 py-5 bg-[#10B981] text-white text-[13px] font-black uppercase tracking-[0.5em] rounded-2xl shadow-xl shadow-emerald-100 flex items-center justify-center gap-3 active:scale-95 transition-all">
//                       <UserPlus2 size={20}/>
//                       <span>Establish Link</span>
//                    </button>
//                 </div>
//              </div>
//           </div>
//         );

//       default: return null;
//     }
//   };

//   const renderModals = () => (
//     <>
//       {confirmingAction && (
//         <div className="fixed inset-0 z-[1000] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-200">
//            <div className="w-full max-w-[320px] bg-white rounded-[32px] shadow-2xl p-8 flex flex-col items-center text-center space-y-6 animate-in zoom-in duration-300">
//               <div className={`w-20 h-20 rounded-full flex items-center justify-center border-4 ${confirmingAction.type === 'ACCEPT' ? 'bg-emerald-50 border-emerald-100 text-[#10B981]' : 'bg-red-50 border-red-100 text-red-500'} shadow-inner`}>
//                  {confirmingAction.type === 'ACCEPT' ? <UserCheck2 size={32} strokeWidth={2.5}/> : <UserX size={32} strokeWidth={2.5}/>}
//               </div>
              
//               <div>
//                  <h3 className="text-[18px] font-black text-slate-900 uppercase tracking-tight mb-2">
//                     {confirmingAction.type === 'ACCEPT' ? 'Establish Neural Link?' : 'Decline Connection?'}
//                  </h3>
//                  <p className="text-[11px] font-bold text-slate-500 uppercase leading-relaxed tracking-widest">
//                     {confirmingAction.type === 'ACCEPT' 
//                       ? `Confirming this handshake will integrate your shared ledger with ${confirmingAction.user.name}.` 
//                       : `Are you sure you want to reject the connection request from ${confirmingAction.user.name}?`}
//                  </p>
//               </div>

//               <div className="w-full flex flex-col gap-3 pt-2">
//                  <button 
//                    onClick={handleConfirmAction}
//                    className={`w-full py-4 rounded-2xl text-[12px] font-black uppercase tracking-[0.4em] shadow-xl transition-all active:scale-95 ${confirmingAction.type === 'ACCEPT' ? 'bg-[#10B981] text-white shadow-emerald-100' : 'bg-red-500 text-white shadow-red-100'}`}
//                  >
//                     Confirm Action
//                  </button>
//                  <button 
//                    onClick={() => setConfirmingAction(null)}
//                    className="w-full py-3 text-[11px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-900 transition-colors"
//                  >
//                     Cancel
//                  </button>
//               </div>
//            </div>
//         </div>
//       )}
//     </>
//   );

//   return (
//     <div className="h-screen w-full bg-slate-100 flex flex-col items-center justify-center font-sans overflow-hidden">
//       <div className={`w-full max-w-[385px] h-[820px] shadow-[0_50px_100px_-20px_rgba(0,0,0,0.2)] overflow-hidden flex flex-col relative rounded-[54px] border-[12px] border-slate-900 bg-white transition-all`}>
        
//         <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-7 bg-slate-900 rounded-b-3xl z-[150]"></div>

//         {showSuccess && (
//           <div className="absolute inset-x-0 top-14 z-[500] flex justify-center px-8 pointer-events-none animate-in slide-in-from-top duration-500">
//             <div className="bg-slate-900 backdrop-blur-xl px-10 py-4 flex items-center gap-4 shadow-2xl border border-slate-800 rounded-full">
//               <CheckCircle2 size={20} className="text-[#10B981]" strokeWidth={3} />
//               <span className="text-[12px] font-black text-white tracking-[0.4em] uppercase">{showSuccess}</span>
//             </div>
//           </div>
//         )}

//         {renderModals()}

//         <div className="flex-1 flex flex-col overflow-hidden h-full">
//           {renderContent()}
//         </div>

//         {/* Tactical Footer */}
//         <footer className="h-24 border-t border-slate-50 flex items-center justify-around px-5 shrink-0 z-50 pb-8 bg-white/95 backdrop-blur-xl">
//           <button onClick={() => setCurrentView('directory')} className={`flex flex-col items-center gap-2.5 w-16 transition-all ${currentView === 'directory' || currentView === 'ledger' ? 'text-[#10B981] scale-110' : 'text-zinc-300'}`}>
//             <LayoutGrid size={24} strokeWidth={(currentView === 'directory' || currentView === 'ledger') ? 3 : 2} />
//             <span className="text-[8px] font-black tracking-tighter uppercase">Hub</span>
//           </button>
          
//           <button onClick={() => setCurrentView('networkDiscovery')} className={`flex flex-col items-center gap-2.5 w-16 transition-all ${currentView === 'networkDiscovery' || currentView === 'publicProfile' ? 'text-[#10B981] scale-110' : 'text-zinc-300'}`}>
//             <Globe size={24} />
//             <span className="text-[8px] font-black tracking-tighter uppercase">Radar</span>
//           </button>

//           <div className="w-14 h-14 bg-slate-900 rounded-3xl flex items-center justify-center shadow-2xl -mt-12 active:scale-90 transition-all border-[6px] border-white">
//              <Plus size={28} className="text-white" strokeWidth={3}/>
//           </div>

//           <button onClick={() => triggerSuccess("FETCHING ARCHIVE")} className="flex flex-col items-center gap-2.5 w-16 text-zinc-300">
//             <History size={24} />
//             <span className="text-[8px] font-black tracking-tighter uppercase">Logs</span>
//           </button>

//           <button onClick={() => setCurrentView('profile')} className={`flex flex-col items-center gap-2.5 w-16 transition-all ${currentView === 'profile' || currentView === 'levelDetail' ? 'text-[#10B981] scale-110' : 'text-zinc-300'}`}>
//             <User size={24} strokeWidth={(currentView === 'profile' || currentView === 'levelDetail') ? 3 : 2} />
//             <span className="text-[8px] font-black tracking-tighter uppercase">Neural</span>
//           </button>
//         </footer>
//       </div>

//       <style>{`
//         @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap');
//         body { font-family: 'Inter', sans-serif; letter-spacing: -0.02em; background: #F1F5F9; -webkit-user-select: none; user-select: none; }
//         .scrollbar-hide::-webkit-scrollbar { display: none; }
//         * { -webkit-tap-highlight-color: transparent; outline: none !important; }
        
//         @keyframes spin-slow {
//           from { transform: rotate(0deg); }
//           to { transform: rotate(360deg); }
//         }
//         .animate-spin-slow { animation: spin-slow 15s linear infinite; }
//       `}</style>
//     </div>
//   );
// }