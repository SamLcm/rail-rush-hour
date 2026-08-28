import React, { useEffect, useRef, useState } from 'react';
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';

// V0.26 — POLISHED PLAYABLE VISUAL SHELL
// Original developer implementation. No third-party art/assets are included.
// Goal: make the current idle + operations loop immediately readable on one phone screen.

const SAVE_KEY = 'rail-rush-hour-v026';
const LEGACY_KEY = 'rail-rush-hour-v025';
const TICK = 1000;
const MAX_LEVEL = 10;

const money = (v) => `€${Math.max(0, Math.round(v)).toLocaleString('nl-NL')}`;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const cap = (base, lv, step) => base + Math.max(0, lv - 1) * step;
const rate = (base, lv, step) => base + Math.max(0, lv - 1) * step;
const upgradeCost = (base, lv, growth = 1.48) => Math.round(base * Math.pow(growth, Math.max(0, lv - 1)));

const ROUTES = [
  { id: 'north', name: 'Northbridge', code: 'A', color: '#52d68b', fare: 6, unlock: 1 },
  { id: 'sea', name: 'Seabright', code: 'B', color: '#4aa9ff', fare: 9, unlock: 3 },
  { id: 'ember', name: 'Emberfall', code: 'C', color: '#b679ff', fare: 14, unlock: 5 },
  { id: 'harbor', name: 'Harbor Point', code: 'D', color: '#ff9f55', fare: 18, unlock: 7 },
  { id: 'capital', name: 'Grand City', code: 'E', color: '#ff7084', fare: 25, unlock: 9 },
];

const STAGES = [
  ['Small Station', '1 platform • basic passenger flow'],
  ['Local Hub', 'café • stronger visitor flow'],
  ['Town Station', 'second route • shop'],
  ['Growing Junction', '2 platforms • simultaneous trains'],
  ['Regional Station', 'third route • larger trains'],
  ['Regional Hub', 'restaurant • expanded hall'],
  ['Major Station', 'Harbor route • 3-set trains'],
  ['Intercity Hub', '3 platforms • 3 simultaneous trains'],
  ['Metropolitan', 'Grand City • high-frequency traffic'],
  ['Grand Terminal', 'manager automation • full operation'],
];

const FACILITIES = {
  parking: { title: 'Parking', icon: 'P', base: 150, unlock: 1, effect: '+ instroom' },
  ticket: { title: 'Tickets', icon: '🎫', base: 180, unlock: 1, effect: '+ doorstroom' },
  security: { title: 'Security', icon: '◆', base: 250, unlock: 1, effect: '+ doorstroom' },
  waiting: { title: 'Waiting Hall', icon: '▰', base: 320, unlock: 1, effect: '+ capaciteit' },
  platform: { title: 'Platform', icon: 'Ⅱ', base: 440, unlock: 1, effect: '+ boarding' },
  train: { title: 'Train', icon: '▣', base: 760, unlock: 1, effect: '+ capaciteit' },
  cafe: { title: 'Café', icon: '☕', base: 500, unlock: 2, effect: '+ omzet' },
  shop: { title: 'Shop', icon: '▦', base: 640, unlock: 3, effect: '+ omzet' },
  toilet: { title: 'Toilets', icon: 'WC', base: 850, unlock: 5, effect: '+ tevreden' },
  restaurant: { title: 'Restaurant', icon: '🍴', base: 1200, unlock: 6, effect: '+ omzet' },
  vip: { title: 'VIP', icon: '★', base: 1700, unlock: 7, effect: '+ bonus' },
  manager: { title: 'Manager', icon: 'M', base: 2800, unlock: 10, effect: 'auto vertrek' },
};

const MISSIONS = [
  ['parking', 2, 'Upgrade Parking to Lv 2', 300],
  ['ticket', 2, 'Upgrade Tickets to Lv 2', 420],
  ['security', 2, 'Upgrade Security to Lv 2', 520],
  ['served', 120, 'Transport 120 passengers', 800],
  ['station', 4, 'Reach Station Level 4', 1400],
  ['departures', 12, 'Complete 12 departures', 1800],
  ['station', 8, 'Reach Station Level 8', 3500],
  ['served', 3000, 'Transport 3,000 passengers', 6500],
];

function load() {
  try {
    if (!globalThis?.localStorage) return null;
    const current = globalThis.localStorage.getItem(SAVE_KEY);
    if (current) return JSON.parse(current);
    const legacy = globalThis.localStorage.getItem(LEGACY_KEY);
    return legacy ? JSON.parse(legacy) : null;
  } catch { return null; }
}
function save(data) {
  try { if (globalThis?.localStorage) globalThis.localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch {}
}
function routeById(id) { return ROUTES.find(r => r.id === id) || ROUTES[0]; }
function makeService(platform, routeId, sets = 1) {
  return { platform, routeId, phase: 'boarding', countdown: 16 + platform * 4, delay: 0, hold: 0, onboard: 0, sets };
}
function trainCapacityFor(service, levels, stationLevel) {
  const base = 95 + Math.max(1, levels.train || 1) * 65 + Math.max(0, stationLevel - 4) * 22;
  return base * service.sets;
}

function MiniPeople({ count, color = '#4aa9ff', max = 18 }) {
  const shown = Math.min(max, Math.ceil(Math.max(0, count) / 5));
  return <View style={styles.peopleRow}>{Array.from({ length: shown }).map((_, i) => (
    <View key={i} style={styles.personMini}>
      <View style={styles.personHead}/>
      <View style={[styles.personBody,{backgroundColor:i%3===0?color:i%3===1?'#e27b55':'#6d78a8'}]}/>
    </View>
  ))}</View>;
}

function HudTile({ label, children, wide }) {
  return <View style={[styles.hudTile,wide&&styles.hudTileWide]}><Text style={styles.hudLabel}>{label}</Text>{children}</View>;
}

function ServiceCard({ service, levels, stationLevel, waiting, priority, onPriority, onWait, onDepart }) {
  const route=routeById(service.routeId);
  const capacity=trainCapacityFor(service,levels,stationLevel);
  const ready=service.phase==='ready';
  const state=service.phase==='away'?'EN ROUTE':service.phase==='holding'?`HOLD ${service.hold}s`:ready?`READY +${service.delay}s`:`DEPARTS ${service.countdown}s`;
  return <View style={[styles.serviceCard,{borderTopColor:route.color},ready&&styles.serviceReady]}>
    <View style={styles.serviceHeader}>
      <View style={[styles.platformBadge,{backgroundColor:route.color}]}><Text style={styles.platformBadgeText}>{route.code}{service.platform}</Text></View>
      <View style={{flex:1}}><Text style={styles.serviceName}>{route.name}</Text><Text style={styles.serviceState}>{state}</Text></View>
      <Pressable onPress={onPriority} style={[styles.starButton,priority&&styles.starButtonOn]}><Text style={styles.starText}>★</Text></Pressable>
    </View>
    <View style={styles.serviceMetaRow}><Text style={styles.serviceMeta}>{service.onboard}/{capacity}</Text><Text style={styles.serviceMeta}>{waiting} waiting</Text><Text style={styles.serviceMeta}>{service.sets} set{service.sets>1?'s':''}</Text></View>
    <View style={styles.progressTrack}><View style={[styles.progressFill,{width:`${Math.round(clamp(service.onboard/Math.max(1,capacity),0,1)*100)}%`,backgroundColor:route.color}]}/></View>
    {ready?<View style={styles.serviceActions}><Pressable onPress={onWait} style={styles.waitButton}><Text style={styles.actionText}>+5s WAIT</Text></Pressable><Pressable onPress={onDepart} style={styles.departButton}><Text style={styles.actionText}>DEPART</Text></Pressable></View>:null}
  </View>;
}

function MenuButton({ icon, label, active, badge, onPress }) {
  return <Pressable onPress={onPress} style={[styles.menuButton,active&&styles.menuButtonActive]}>
    <Text style={styles.menuIcon}>{icon}</Text><Text style={styles.menuLabel}>{label}</Text>
    {badge?<View style={styles.menuBadge}><Text style={styles.menuBadgeText}>{badge}</Text></View>:null}
  </Pressable>;
}

function UpgradeCard({ kind, level, stationLevel, cash, hot, onPress }) {
  const spec=FACILITIES[kind];
  const locked=stationLevel<spec.unlock;
  const capped=level>=MAX_LEVEL;
  const price=upgradeCost(spec.base,Math.max(1,level||1));
  const canBuy=!locked&&!capped&&cash>=price;
  return <View style={[styles.upgradeCard,hot&&styles.upgradeHot,locked&&styles.upgradeLocked]}>
    <View style={styles.upgradeIcon}><Text style={styles.upgradeIconText}>{spec.icon}</Text></View>
    <Text style={styles.upgradeTitle}>{spec.title}</Text>
    <Text style={styles.upgradeLevel}>{locked?`UNLOCK Lv ${spec.unlock}`:capped?'MAX':`LVL ${level}`}</Text>
    <Text style={styles.upgradeEffect}>{locked?'':spec.effect}</Text>
    <Pressable disabled={!canBuy} onPress={onPress} style={[styles.buyButton,canBuy&&styles.buyButtonReady,capped&&styles.buyButtonMax]}>
      <Text style={styles.buyText}>{locked?'LOCKED':capped?'MAX':money(price)}</Text>
    </Pressable>
  </View>;
}

function Panel({ title, onClose, children }) {
  return <View style={styles.panelShade}><View style={styles.panel}>
    <View style={styles.panelHeader}><Text style={styles.panelTitle}>{title}</Text><Pressable onPress={onClose} style={styles.closeButton}><Text style={styles.closeText}>×</Text></Pressable></View>
    {children}
  </View></View>;
}

export default function AppV26(){
  const saved=useRef(load()).current;
  const initialLevels={
    parking:saved?.levels?.parking??1,ticket:saved?.levels?.ticket??1,security:saved?.levels?.security??1,waiting:saved?.levels?.waiting??1,platform:saved?.levels?.platform??1,train:saved?.levels?.train??1,
    cafe:saved?.levels?.cafe??0,shop:saved?.levels?.shop??0,toilet:saved?.levels?.toilet??0,restaurant:saved?.levels?.restaurant??0,vip:saved?.levels?.vip??0,manager:saved?.levels?.manager??0,
  };

  const [phase,setPhase]=useState('menu');
  const [cash,setCash]=useState(saved?.cash??1100);
  const [gems]=useState(saved?.gems??18);
  const [levels,setLevels]=useState(initialLevels);
  const [stationLevel,setStationLevel]=useState(saved?.stationLevel??1);
  const [devLevel,setDevLevel]=useState(null);
  const [parkingQ,setParkingQ]=useState(16),[ticketQ,setTicketQ]=useState(5),[securityQ,setSecurityQ]=useState(3),[waitingQ,setWaitingQ]=useState(8);
  const [platformDemand,setPlatformDemand]=useState(Object.fromEntries(ROUTES.map(r=>[r.id,r.id==='north'?14:0])));
  const [services,setServices]=useState([makeService(1,'north',1)]);
  const [priorityPlatform,setPriorityPlatform]=useState(1);
  const [served,setServed]=useState(saved?.served??0),[departures,setDepartures]=useState(saved?.departures??0),[lost,setLost]=useState(saved?.lost??0);
  const [satisfaction,setSatisfaction]=useState(saved?.satisfaction??88);
  const [clock,setClock]=useState(0);
  const [missionIndex,setMissionIndex]=useState(saved?.missionIndex??0);
  const [panel,setPanel]=useState(null);
  const [message,setMessage]=useState('Upgrade the bottleneck or manage a ready train.');

  const effectiveLevel=devLevel??stationLevel;
  const stage=STAGES[effectiveLevel-1];
  const unlockedRoutes=ROUTES.filter(r=>r.unlock<=effectiveLevel);
  const platformsUnlocked=effectiveLevel>=8?3:effectiveLevel>=4?2:1;
  const maxSets=effectiveLevel>=7?3:effectiveLevel>=4?2:1;
  const rush=(clock%75)>=55;

  const cashRef=useRef(cash),levelsRef=useRef(levels),parkingRef=useRef(parkingQ),ticketRef=useRef(ticketQ),securityRef=useRef(securityQ),waitingRef=useRef(waitingQ),demandRef=useRef(platformDemand),servicesRef=useRef(services),servedRef=useRef(served),departuresRef=useRef(departures),lostRef=useRef(lost),satisfactionRef=useRef(satisfaction),clockRef=useRef(clock),priorityRef=useRef(priorityPlatform);
  useEffect(()=>{cashRef.current=cash;},[cash]);
  useEffect(()=>{levelsRef.current=levels;},[levels]);
  useEffect(()=>{parkingRef.current=parkingQ;},[parkingQ]);
  useEffect(()=>{ticketRef.current=ticketQ;},[ticketQ]);
  useEffect(()=>{securityRef.current=securityQ;},[securityQ]);
  useEffect(()=>{waitingRef.current=waitingQ;},[waitingQ]);
  useEffect(()=>{demandRef.current=platformDemand;},[platformDemand]);
  useEffect(()=>{servicesRef.current=services;},[services]);
  useEffect(()=>{satisfactionRef.current=satisfaction;},[satisfaction]);
  useEffect(()=>{clockRef.current=clock;},[clock]);
  useEffect(()=>{priorityRef.current=priorityPlatform;},[priorityPlatform]);

  useEffect(()=>{
    setServices(prev=>{
      const next=[];
      for(let p=1;p<=platformsUnlocked;p++){
        const existing=prev.find(s=>s.platform===p);
        const defaultRoute=unlockedRoutes[(p-1)%Math.max(1,unlockedRoutes.length)]?.id||'north';
        next.push(existing&&unlockedRoutes.some(r=>r.id===existing.routeId)?existing:makeService(p,defaultRoute,1));
      }
      servicesRef.current=next;
      return next;
    });
    if(priorityPlatform>platformsUnlocked)setPriorityPlatform(1);
  },[platformsUnlocked,effectiveLevel]);

  const addCash=v=>{cashRef.current+=v;setCash(Math.round(cashRef.current));};
  const spend=v=>{if(cashRef.current<v)return false;cashRef.current-=v;setCash(Math.round(cashRef.current));return true;};
  const changeSatisfaction=v=>{satisfactionRef.current=clamp(satisfactionRef.current+v,0,100);setSatisfaction(Math.round(satisfactionRef.current));};

  const parkingCap=cap(50,Math.max(1,levels.parking),38);
  const ticketCap=cap(38,Math.max(1,levels.ticket),26);
  const securityCap=cap(32,Math.max(1,levels.security),22);
  const waitingCap=cap(80,Math.max(1,levels.waiting),52)+Math.max(0,effectiveLevel-3)*38;
  const platformCap=cap(85,Math.max(1,levels.platform),55)*platformsUnlocked;
  const totalPlatform=Object.values(platformDemand).reduce((a,b)=>a+b,0);
  const fullestTrain=services.reduce((m,s)=>Math.max(m,s.onboard/Math.max(1,trainCapacityFor(s,levels,effectiveLevel))),0);

  const pressures=[
    ['PARKING',parkingQ/parkingCap,'parking'],
    ['TICKETS',ticketQ/ticketCap,'ticket'],
    ['SECURITY',securityQ/securityCap,'security'],
    ['WAITING HALL',waitingQ/waitingCap,'waiting'],
    ['PLATFORMS',totalPlatform/platformCap,'platform'],
    ['TRAINS',fullestTrain,'train'],
  ].sort((a,b)=>b[1]-a[1]);
  const bottleneck=pressures[0];

  const totalDevelopment=Object.entries(levels).reduce((sum,[kind,lv])=>sum+(lv||0)+(stationLevel>=(FACILITIES[kind]?.unlock||1)?1:0),0);
  const nextNeed=9+stationLevel*5;
  useEffect(()=>{
    if(devLevel!=null||stationLevel>=MAX_LEVEL)return;
    if(totalDevelopment>=nextNeed){
      setStationLevel(v=>Math.min(MAX_LEVEL,v+1));
      setMessage(`Station expanded to Level ${Math.min(MAX_LEVEL,stationLevel+1)}.`);
    }
  },[totalDevelopment,stationLevel,devLevel]);

  const upgrade=kind=>{
    const spec=FACILITIES[kind];
    if(!spec||effectiveLevel<spec.unlock)return;
    const lv=levels[kind]||0;
    if(lv>=MAX_LEVEL)return;
    const price=upgradeCost(spec.base,Math.max(1,lv||1));
    if(!spend(price))return setMessage(`${spec.title} costs ${money(price)}.`);
    setLevels(prev=>({...prev,[kind]:lv+1}));
    setMessage(`${spec.title} upgraded to Lv ${lv+1}. Watch where the bottleneck moves.`);
  };

  const fixBottleneck=()=>{
    const kind=bottleneck[2];
    const spec=FACILITIES[kind];
    const lv=levels[kind]||0;
    if(!spec||effectiveLevel<spec.unlock)return;
    const price=upgradeCost(spec.base,Math.max(1,lv||1));
    if(cashRef.current>=price)upgrade(kind);
    else setMessage(`${bottleneck[0]} is congested. Save ${money(price)} for the next upgrade.`);
  };

  const setServiceSets=(platform,n)=>{
    if(n>maxSets)return;
    const next=servicesRef.current.map(s=>s.platform===platform&&s.phase!=='ready'&&s.phase!=='holding'?{...s,sets:n}:s);
    servicesRef.current=next;setServices(next);
  };
  const waitService=platform=>{
    const next=servicesRef.current.map(s=>s.platform===platform&&s.phase==='ready'?{...s,phase:'holding',hold:5}:s);
    servicesRef.current=next;setServices(next);setMessage(`Platform ${platform}: holding 5 seconds for more passengers.`);
  };
  const departService=platform=>{
    const current=servicesRef.current.find(s=>s.platform===platform);
    if(!current||current.phase!=='ready')return;
    const route=routeById(current.routeId);
    const demand={...demandRef.current};
    const stranded=demand[route.id]||0;
    const alternative=servicesRef.current.some(s=>s.platform!==platform&&s.routeId===route.id&&s.phase!=='away');
    const gross=Math.round(current.onboard*route.fare*(1+(Math.max(1,levelsRef.current.train)-1)*.08));
    const operating=35*current.sets;
    const bonus=current.delay<=3?140:current.delay<=8?60:0;
    const payout=Math.max(0,gross-operating+bonus);
    addCash(payout);
    servedRef.current+=current.onboard;departuresRef.current+=1;setServed(servedRef.current);setDepartures(departuresRef.current);
    const penalty=Math.min(9,stranded*.035)*(alternative?.25:1)+Math.max(0,current.delay-3)*.18;
    changeSatisfaction(-penalty+(current.delay<=3?1.2:0));
    const next=servicesRef.current.map(s=>s.platform===platform?{...s,phase:'away',countdown:4+s.platform,delay:0,hold:0,onboard:0}:s);
    servicesRef.current=next;setServices(next);
    setMessage(`${route.name} departed with ${current.onboard}. ${stranded} still waiting. +${money(payout)}`);
  };

  const mission=MISSIONS[Math.min(missionIndex,MISSIONS.length-1)];
  const missionDone=mission[0]==='served'?served>=mission[1]:mission[0]==='departures'?departures>=mission[1]:mission[0]==='station'?stationLevel>=mission[1]:(levels[mission[0]]||0)>=mission[1];
  const claimMission=()=>{
    if(!missionDone)return;
    addCash(mission[3]);
    setMissionIndex(v=>Math.min(MISSIONS.length-1,v+1));
    setMessage(`Mission complete. +${money(mission[3])}`);
  };

  const persist=()=>save({cash:cashRef.current,gems,levels:levelsRef.current,stationLevel,served:servedRef.current,departures:departuresRef.current,lost:lostRef.current,satisfaction:satisfactionRef.current,missionIndex});

  useEffect(()=>{
    if(phase!=='playing')return undefined;
    const id=setInterval(()=>{
      const lv=levelsRef.current;
      let pk=parkingRef.current,t=ticketRef.current,s=securityRef.current,w=waitingRef.current;
      let demand={...demandRef.current};
      const c=clockRef.current+1;clockRef.current=c;setClock(c);
      const rushNow=(c%75)>=55;

      const inflowBase=rate(5,Math.max(1,lv.parking),2)+Math.floor(effectiveLevel/2);
      const inflow=Math.round(inflowBase*(rushNow?1.85:1));
      const accepted=Math.min(inflow,Math.max(0,parkingCap-pk));
      const rejected=inflow-accepted;pk+=accepted;
      if(rejected>0){lostRef.current+=rejected;setLost(lostRef.current);changeSatisfaction(-Math.min(1.2,rejected*.04));}

      const toTicket=Math.min(pk,rate(4,Math.max(1,lv.parking),3),Math.max(0,ticketCap-t));pk-=toTicket;t+=toTicket;
      const toSecurity=Math.min(t,rate(4,Math.max(1,lv.ticket),3),Math.max(0,securityCap-s));t-=toSecurity;s+=toSecurity;
      const toWaiting=Math.min(s,rate(3,Math.max(1,lv.security),3),Math.max(0,waitingCap-w));s-=toWaiting;w+=toWaiting;
      const currentPlatformTotal=Object.values(demand).reduce((a,b)=>a+b,0);
      const toPlatform=Math.min(w,rate(5,Math.max(1,lv.waiting),4)+(platformsUnlocked-1)*6,Math.max(0,platformCap-currentPlatformTotal));w-=toPlatform;
      for(let i=0;i<toPlatform;i++){
        const r=unlockedRoutes[(c+i+Math.floor(i/3))%Math.max(1,unlockedRoutes.length)];
        demand[r.id]=(demand[r.id]||0)+1;
      }

      let nextServices=servicesRef.current.map(service=>({...service}));
      nextServices=nextServices.map(service=>{
        const route=routeById(service.routeId);
        let ns={...service};
        if(ns.phase==='boarding'||ns.phase==='holding'||ns.phase==='ready'){
          const match=demand[route.id]||0;
          const priorityBoost=priorityRef.current===ns.platform?1.45:1;
          const boardRate=Math.round(rate(7,Math.max(1,lv.platform),5)*priorityBoost);
          const capacity=trainCapacityFor(ns,lv,effectiveLevel);
          const board=Math.min(match,boardRate,Math.max(0,capacity-ns.onboard));
          demand[route.id]=match-board;ns.onboard+=board;
        }
        if(ns.phase==='boarding'){
          ns.countdown=Math.max(0,ns.countdown-1);
          if(ns.countdown<=0){ns.phase='ready';ns.delay=0;setMessage(`Platform ${ns.platform} ${route.name} is ready to depart.`);}
        } else if(ns.phase==='holding') {
          ns.hold=Math.max(0,ns.hold-1);ns.delay+=1;if(ns.hold<=0)ns.phase='ready';
        } else if(ns.phase==='ready') {
          ns.delay+=1;
        } else if(ns.phase==='away') {
          ns.countdown=Math.max(0,ns.countdown-1);
          if(ns.countdown<=0){
            const idx=unlockedRoutes.findIndex(r=>r.id===ns.routeId);
            const nextRoute=unlockedRoutes[(Math.max(0,idx)+platformsUnlocked)%Math.max(1,unlockedRoutes.length)]||unlockedRoutes[0]||ROUTES[0];
            ns={...ns,routeId:nextRoute.id,phase:'boarding',countdown:Math.max(12,22-effectiveLevel)+ns.platform*2,delay:0,hold:0,onboard:0};
          }
        }
        return ns;
      });

      if((lv.manager||0)>0){
        const auto=nextServices.find(x=>x.phase==='ready'&&x.delay>=3);
        if(auto){servicesRef.current=nextServices;demandRef.current=demand;setServices(nextServices);setPlatformDemand(demand);setTimeout(()=>departService(auto.platform),20);}
      }

      const servicePower=(lv.cafe||0)*2+(lv.shop||0)*3+(lv.toilet||0)*2+(lv.restaurant||0)*5+(lv.vip||0)*8;
      if(servicePower>0)addCash(Math.round(servicePower+(w+Object.values(demand).reduce((a,b)=>a+b,0))*.005*servicePower));
      const worst=Math.max(pk/parkingCap,t/ticketCap,s/securityCap,w/waitingCap,Object.values(demand).reduce((a,b)=>a+b,0)/platformCap);
      if(worst<.72)changeSatisfaction(.08);else if(worst>.96)changeSatisfaction(-.18);

      parkingRef.current=pk;ticketRef.current=t;securityRef.current=s;waitingRef.current=w;demandRef.current=demand;servicesRef.current=nextServices;
      setParkingQ(pk);setTicketQ(t);setSecurityQ(s);setWaitingQ(w);setPlatformDemand(demand);setServices(nextServices);
      if(c%15===0)persist();
    },TICK);
    return()=>clearInterval(id);
  },[phase,effectiveLevel,parkingCap,ticketCap,securityCap,waitingCap,platformCap,platformsUnlocked]);

  if(phase==='menu')return <SafeAreaView style={styles.screen}><StatusBar barStyle="light-content"/>
    <View style={styles.menuScreen}>
      <View style={styles.menuLogoBadge}><Text style={styles.menuLogoSmall}>RAIL</Text><Text style={styles.menuLogoBig}>RUSH HOUR</Text></View>
      <Text style={styles.menuVersion}>V0.26 • PLAYABLE VISUAL SHELL</Text>
      <Text style={styles.menuHeadline}>BUILD. BOARD. DEPART.</Text>
      <Text style={styles.menuCopy}>Run one living station from parking lot to platform. Fix bottlenecks, grow the terminal and decide when every train leaves.</Text>
      <Pressable style={styles.startButton} onPress={()=>{setPhase('playing');setMessage('Start with the highlighted bottleneck.');}}><Text style={styles.startButtonText}>OPEN STATION</Text></Pressable>
      <Text style={styles.menuFoot}>Developer reference build • original temporary art</Text>
    </View>
  </SafeAreaView>;

  const readyCount=services.filter(s=>s.phase==='ready').length;
  const occupiedCars=Math.min(24,Math.ceil(parkingQ/Math.max(1,parkingCap)*24));
  const activePanel=panel;
  const bottleneckPct=Math.round(bottleneck[1]*100);

  return <SafeAreaView style={styles.screen}><StatusBar barStyle="light-content"/>
    <View style={styles.gameFrame}>
      <View style={styles.topHud}>
        <HudTile label="STATION LEVEL"><View style={styles.levelShield}><Text style={styles.levelNumber}>{effectiveLevel}</Text></View></HudTile>
        <HudTile label="CASH" wide><Text style={styles.cashText}>{money(cash)}</Text><Text style={styles.incomeText}>+ live station income</Text></HudTile>
        <HudTile label="GEMS"><Text style={styles.gemText}>◆ {gems}</Text></HudTile>
        <HudTile label="SATISFACTION"><Text style={[styles.satText,satisfaction<60&&styles.satBad]}>{satisfaction}%</Text><View style={styles.satTrack}><View style={[styles.satFill,{width:`${satisfaction}%`}]} /></View></HudTile>
      </View>

      <View style={[styles.alertBar,bottleneckPct>=90&&styles.alertBarHot]}>
        <View style={styles.alertIcon}><Text style={styles.alertIconText}>!</Text></View>
        <View style={{flex:1}}><Text style={styles.alertTitle}>BOTTLENECK ALERT</Text><Text style={styles.alertText}>{bottleneck[0]} is at {bottleneckPct}% capacity.</Text></View>
        <Pressable onPress={fixBottleneck} style={styles.fixButton}><Text style={styles.fixText}>FIX NOW</Text></Pressable>
      </View>

      <View style={styles.serviceDeck}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.serviceDeckInner}>
          {services.map(s=><ServiceCard key={s.platform} service={s} levels={levels} stationLevel={effectiveLevel} waiting={platformDemand[s.routeId]||0} priority={priorityPlatform===s.platform} onPriority={()=>setPriorityPlatform(s.platform)} onWait={()=>waitService(s.platform)} onDepart={()=>departService(s.platform)}/>)}
        </ScrollView>
      </View>

      <View style={styles.sceneArea}>
        <View style={styles.stationScene}>
          <View style={styles.sceneGrass}/>
          <View style={styles.sceneRailBed}/>
          {[1,2,3].map(n=>{
            const unlocked=n<=platformsUnlocked;
            const service=services.find(s=>s.platform===n);
            const route=service?routeById(service.routeId):ROUTES[n-1]||ROUTES[0];
            const top=18+(n-1)*58;
            return <React.Fragment key={n}>
              <View style={[styles.trackLine,{top:top+7,opacity:unlocked?1:.18}]}><View style={styles.railA}/><View style={styles.railB}/>{Array.from({length:16}).map((_,i)=><View key={i} style={[styles.tie,{left:i*24}]}/>)}</View>
              <View style={[styles.platformStrip,{top:top+29,opacity:unlocked?1:.25},unlocked&&service?.phase==='ready'&&styles.platformReady]}>
                <View style={[styles.platformSign,{backgroundColor:unlocked?route.color:'#6d7780'}]}><Text style={styles.platformSignText}>{unlocked?`${route.code}${n}`:`P${n}`}</Text></View>
                <View style={{flex:1}}><Text style={styles.platformDest}>{unlocked?route.name:'LOCKED PLATFORM'}</Text><Text style={styles.platformSub}>{unlocked?`${platformDemand[route.id]||0} waiting`:`Unlock at station Lv ${n===2?4:8}`}</Text></View>
                {unlocked?<MiniPeople count={platformDemand[route.id]||0} color={route.color} max={12}/>:null}
              </View>
              {unlocked&&service?.phase!=='away'?<View style={[styles.trainSprite,{top:top-1,borderColor:route.color}]}>
                <View style={[styles.trainNose,{backgroundColor:route.color}]}/><View style={styles.trainWindshield}/><View style={styles.trainWindows}>{Array.from({length:6}).map((_,i)=><View key={i} style={styles.trainWindow}/>)}</View><View style={styles.trainDoor}/><View style={styles.trainRoofLine}/>
              </View>:null}
            </React.Fragment>;
          })}

          <View style={styles.stationBuilding}>
            <View style={styles.buildingRoof}><Text style={styles.buildingBrand}>RAIL RUSH HOUR</Text><Text style={styles.buildingSub}>NORTHVALE STATION • {stage[0].toUpperCase()}</Text></View>
            <View style={styles.hallFloor}>
              <View style={styles.ticketZone}><Text style={styles.zoneName}>TICKETS</Text><Text style={styles.zoneCount}>{ticketQ}/{ticketCap}</Text><MiniPeople count={ticketQ} color="#e2a94f"/><View style={styles.kioskRow}>{Array.from({length:Math.min(4,1+levels.ticket)}).map((_,i)=><View key={i} style={styles.kiosk}/>)}</View></View>
              <View style={styles.securityZone}><Text style={styles.zoneName}>SECURITY</Text><Text style={styles.zoneCount}>{securityQ}/{securityCap}</Text><MiniPeople count={securityQ} color="#e87667"/><View style={styles.gatesRow}>{Array.from({length:Math.min(4,1+levels.security)}).map((_,i)=><View key={i} style={styles.gate}/>)}</View></View>
              <View style={styles.waitingZone}><Text style={styles.zoneName}>WAITING HALL</Text><Text style={styles.zoneCount}>{waitingQ}/{waitingCap}</Text><MiniPeople count={waitingQ} color="#58a9cf" max={14}/><View style={styles.chairRow}>{Array.from({length:6}).map((_,i)=><View key={i} style={styles.chair}/>)}</View></View>
              <View style={styles.serviceZone}><Text style={styles.zoneName}>STATION SERVICES</Text><Text style={styles.serviceIcons}>☕ {levels.cafe}   ▦ {levels.shop}   WC {levels.toilet}</Text><Text style={styles.serviceIcons}>🍴 {levels.restaurant}   ★ {levels.vip}</Text></View>
            </View>
            <View style={styles.entranceFacade}><Text style={styles.entranceTitle}>NORTHVALE STATION</Text><Text style={styles.entranceSub}>ENTRANCE → TICKETS → SECURITY → PLATFORMS</Text></View>
          </View>

          <View style={styles.parkingLot}>
            <View style={styles.parkingHeader}><Text style={styles.parkingTitle}>P PARKING</Text><Text style={styles.parkingCount}>{parkingQ}/{parkingCap}</Text></View>
            <View style={styles.parkingGrid}>{Array.from({length:24}).map((_,i)=><View key={i} style={[styles.parkingSpace,i<occupiedCars&&styles.parkingSpaceFull]}>{i<occupiedCars?<View style={[styles.carBlock,{backgroundColor:['#4aa9ff','#ef6b62','#f5c95c','#61c788'][i%4]}]}/>:null}</View>)}</View>
          </View>
          <View style={styles.accessRoad}><View style={styles.crosswalk}>{Array.from({length:5}).map((_,i)=><View key={i} style={styles.crossStripe}/>)}</View></View>

          <View style={styles.leftMenu}>
            <MenuButton icon="✓" label="MISSIONS" badge={missionDone?'1':null} active={activePanel==='missions'} onPress={()=>setPanel(activePanel==='missions'?null:'missions')}/>
            <MenuButton icon="⌖" label="ROUTES" active={activePanel==='routes'} onPress={()=>setPanel(activePanel==='routes'?null:'routes')}/>
            <MenuButton icon="↯" label="FLOW" active={activePanel==='flow'} onPress={()=>setPanel(activePanel==='flow'?null:'flow')}/>
            <MenuButton icon="↑" label="LEVELS" active={activePanel==='levels'} onPress={()=>setPanel(activePanel==='levels'?null:'levels')}/>
          </View>

          <View style={[styles.rushPill,rush&&styles.rushPillOn]}><Text style={styles.rushPillText}>{rush?'⚡ RUSH HOUR +85%':'NORMAL SERVICE'}</Text></View>
          <View style={styles.messagePill}><Text style={styles.messagePillText}>{message}</Text></View>

          {panel==='missions'?<Panel title="MISSIONS" onClose={()=>setPanel(null)}><Text style={styles.panelLead}>{mission[2]}</Text><Text style={styles.panelReward}>Reward {money(mission[3])}</Text><Pressable disabled={!missionDone} onPress={claimMission} style={[styles.claimButton,missionDone&&styles.claimReady]}><Text style={styles.claimText}>{missionDone?'CLAIM REWARD':'IN PROGRESS'}</Text></Pressable><View style={styles.panelDivider}/>{MISSIONS.map((m,i)=><Text key={i} style={[styles.panelList,i<missionIndex&&styles.panelListDone]}>{i<missionIndex?'✓ ':i===missionIndex?'› ':'  '}{m[2]}</Text>)}</Panel>:null}
          {panel==='routes'?<Panel title="ROUTES" onClose={()=>setPanel(null)}>{ROUTES.map(r=><View key={r.id} style={[styles.routeRow,effectiveLevel<r.unlock&&styles.routeLocked]}><View style={[styles.routeColor,{backgroundColor:r.color}]}/><View style={{flex:1}}><Text style={styles.routeName}>{r.name}</Text><Text style={styles.routeInfo}>{effectiveLevel<r.unlock?`Unlock Lv ${r.unlock}`:`${platformDemand[r.id]||0} waiting • ${money(r.fare)} fare`}</Text></View></View>)}</Panel>:null}
          {panel==='flow'?<Panel title="PASSENGER FLOW" onClose={()=>setPanel(null)}>{pressures.map(p=><View key={p[0]} style={styles.flowRow}><Text style={styles.flowName}>{p[0]}</Text><View style={styles.flowTrack}><View style={[styles.flowFill,{width:`${Math.min(100,Math.round(p[1]*100))}%`},p[1]>.9&&styles.flowHot]}/></View><Text style={styles.flowPct}>{Math.round(p[1]*100)}%</Text></View>)}<Text style={styles.panelLead}>Lost visitors: {lost}</Text></Panel>:null}
          {panel==='levels'?<Panel title="STATION LEVELS" onClose={()=>setPanel(null)}><ScrollView style={{maxHeight:250}}>{STAGES.map((s,i)=><Pressable key={i} onPress={()=>setDevLevel(i+1)} style={[styles.levelRow,effectiveLevel===i+1&&styles.levelRowActive]}><Text style={styles.levelRowTitle}>LEVEL {i+1} • {s[0]}</Text><Text style={styles.levelRowSub}>{s[1]}</Text></Pressable>)}</ScrollView><View style={styles.devRow}><Pressable onPress={()=>setDevLevel(v=>Math.max(1,(v??stationLevel)-1))} style={styles.devSmall}><Text style={styles.devText}>−</Text></Pressable><Pressable onPress={()=>setDevLevel(null)} style={styles.devLive}><Text style={styles.devText}>LIVE</Text></Pressable><Pressable onPress={()=>setDevLevel(v=>Math.min(10,(v??stationLevel)+1))} style={styles.devSmall}><Text style={styles.devText}>+</Text></Pressable></View></Panel>:null}
        </View>
      </View>

      <View style={styles.upgradeDock}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.upgradeDockInner}>
          {['parking','ticket','security','waiting','platform','train','cafe','shop','toilet','restaurant','vip','manager'].map(kind=><UpgradeCard key={kind} kind={kind} level={levels[kind]||0} stationLevel={effectiveLevel} cash={cash} hot={bottleneck[2]===kind} onPress={()=>upgrade(kind)}/>) }
        </ScrollView>
      </View>

      <View style={styles.footerStats}>
        <View style={styles.footerStat}><Text style={styles.footerIcon}>●●●</Text><View><Text style={styles.footerLabel}>TRANSPORTED</Text><Text style={styles.footerValue}>{served.toLocaleString('nl-NL')}</Text></View></View>
        <View style={styles.footerDivider}/>
        <View style={styles.footerStat}><Text style={styles.footerIcon}>▣</Text><View><Text style={styles.footerLabel}>DEPARTURES</Text><Text style={styles.footerValue}>{departures}</Text></View></View>
        <View style={styles.footerDivider}/>
        <View style={styles.footerStat}><Text style={styles.footerIcon}>Ⅱ</Text><View><Text style={styles.footerLabel}>ACTIVE PLATFORMS</Text><Text style={styles.footerValue}>{platformsUnlocked}/3</Text></View></View>
        {readyCount>0?<View style={styles.readyBadge}><Text style={styles.readyBadgeText}>{readyCount} READY</Text></View>:null}
      </View>
    </View>
  </SafeAreaView>;
}

const styles=StyleSheet.create({
  screen:{flex:1,backgroundColor:'#08131b'},gameFrame:{flex:1,backgroundColor:'#0b1821',alignSelf:'stretch'},
  menuScreen:{flex:1,backgroundColor:'#0b1a24',alignItems:'center',justifyContent:'center',padding:28},menuLogoBadge:{width:215,paddingVertical:20,borderRadius:28,backgroundColor:'#142c3a',borderWidth:2,borderColor:'#2e5b71',alignItems:'center',shadowColor:'#000',shadowOpacity:.4,shadowRadius:18,shadowOffset:{width:0,height:10}},menuLogoSmall:{color:'#7fcae8',fontSize:17,fontWeight:'900',letterSpacing:8},menuLogoBig:{color:'#fff',fontSize:31,fontWeight:'900',letterSpacing:1},menuVersion:{color:'#5c879b',fontSize:9,fontWeight:'900',letterSpacing:2,marginTop:22},menuHeadline:{color:'#f6cf66',fontSize:21,fontWeight:'900',marginTop:18},menuCopy:{color:'#a9c0ca',fontSize:13,lineHeight:20,textAlign:'center',maxWidth:360,marginTop:11},startButton:{backgroundColor:'#68cf54',borderRadius:14,paddingVertical:16,paddingHorizontal:52,marginTop:28,borderWidth:2,borderColor:'#91ed75',shadowColor:'#64df4c',shadowOpacity:.35,shadowRadius:10},startButtonText:{color:'#102318',fontSize:14,fontWeight:'900'},menuFoot:{color:'#537181',fontSize:8,fontWeight:'700',marginTop:18},
  topHud:{height:72,backgroundColor:'#09131c',flexDirection:'row',paddingHorizontal:5,paddingVertical:5,gap:4,borderBottomWidth:1,borderBottomColor:'#243542'},hudTile:{flex:1,minWidth:70,backgroundColor:'#14222e',borderRadius:11,borderWidth:1,borderColor:'#344652',padding:6,justifyContent:'center',shadowColor:'#000',shadowOpacity:.25,shadowRadius:5},hudTileWide:{flex:1.35},hudLabel:{color:'#8aa0aa',fontSize:5.5,fontWeight:'900',letterSpacing:.5},levelShield:{width:35,height:35,borderRadius:9,backgroundColor:'#20384a',borderWidth:2,borderColor:'#67b9e4',alignItems:'center',justifyContent:'center',marginTop:3},levelNumber:{color:'#fff',fontSize:19,fontWeight:'900'},cashText:{color:'#56e36e',fontSize:14,fontWeight:'900',marginTop:2},incomeText:{color:'#67c97b',fontSize:5.2,fontWeight:'800',marginTop:2},gemText:{color:'#d88cff',fontSize:12,fontWeight:'900',marginTop:5},satText:{color:'#70e28b',fontSize:13,fontWeight:'900',marginTop:2},satBad:{color:'#ff735f'},satTrack:{height:5,backgroundColor:'#283a44',borderRadius:3,marginTop:4,overflow:'hidden'},satFill:{height:'100%',backgroundColor:'#67db66'},
  alertBar:{height:50,backgroundColor:'#322316',marginHorizontal:6,marginTop:5,borderRadius:10,borderWidth:1,borderColor:'#76551d',paddingHorizontal:9,flexDirection:'row',alignItems:'center',gap:8},alertBarHot:{backgroundColor:'#3d2018',borderColor:'#a55332'},alertIcon:{width:28,height:28,borderRadius:14,backgroundColor:'#f6be32',alignItems:'center',justifyContent:'center'},alertIconText:{color:'#3c2b08',fontSize:18,fontWeight:'900'},alertTitle:{color:'#f5c95c',fontSize:7.2,fontWeight:'900'},alertText:{color:'#e7d8bd',fontSize:6.2,fontWeight:'700',marginTop:1},fixButton:{backgroundColor:'#f0ab24',paddingHorizontal:12,paddingVertical:8,borderRadius:8,borderWidth:1,borderColor:'#ffcf53'},fixText:{color:'#2c2008',fontSize:6.3,fontWeight:'900'},
  serviceDeck:{height:101,paddingTop:5,backgroundColor:'#0b1821'},serviceDeckInner:{paddingHorizontal:6,gap:6},serviceCard:{width:174,height:91,backgroundColor:'#14232d',borderRadius:11,borderWidth:1,borderColor:'#354b58',borderTopWidth:4,padding:7},serviceReady:{backgroundColor:'#30281b'},serviceHeader:{flexDirection:'row',alignItems:'center',gap:6},platformBadge:{width:31,height:31,borderRadius:7,alignItems:'center',justifyContent:'center'},platformBadgeText:{color:'#fff',fontSize:11,fontWeight:'900'},serviceName:{color:'#edf5f7',fontSize:7.5,fontWeight:'900'},serviceState:{color:'#8ca4ae',fontSize:5.6,fontWeight:'800',marginTop:2},starButton:{width:25,height:25,borderRadius:7,backgroundColor:'#243742',alignItems:'center',justifyContent:'center'},starButtonOn:{backgroundColor:'#e0ac31'},starText:{color:'#fff',fontSize:11,fontWeight:'900'},serviceMetaRow:{flexDirection:'row',justifyContent:'space-between',marginTop:5},serviceMeta:{color:'#91a8b1',fontSize:5.2,fontWeight:'800'},progressTrack:{height:5,backgroundColor:'#253944',borderRadius:3,overflow:'hidden',marginTop:4},progressFill:{height:'100%'},serviceActions:{flexDirection:'row',gap:4,marginTop:5},waitButton:{flex:1,backgroundColor:'#b77b2b',paddingVertical:5,borderRadius:5,alignItems:'center'},departButton:{flex:1.3,backgroundColor:'#49ad68',paddingVertical:5,borderRadius:5,alignItems:'center'},actionText:{color:'#fff',fontSize:5.1,fontWeight:'900'},
  sceneArea:{flex:1,minHeight:300,backgroundColor:'#10212a',alignItems:'center',justifyContent:'center',overflow:'hidden'},stationScene:{width:390,height:395,backgroundColor:'#92bc70',position:'relative',overflow:'hidden',borderTopWidth:1,borderBottomWidth:1,borderColor:'#37545f'},sceneGrass:{position:'absolute',inset:0,backgroundColor:'#91bc70'},sceneRailBed:{position:'absolute',left:48,right:-40,top:0,height:190,backgroundColor:'#586268',transform:[{rotateZ:'-2deg'}]},trackLine:{position:'absolute',left:58,width:355,height:34,backgroundColor:'#545d61',transform:[{rotateZ:'-2deg'}]},railA:{position:'absolute',left:0,right:0,top:8,height:3,backgroundColor:'#ccd2d5'},railB:{position:'absolute',left:0,right:0,top:24,height:3,backgroundColor:'#ccd2d5'},tie:{position:'absolute',top:4,width:5,height:27,backgroundColor:'#5a4435'},platformStrip:{position:'absolute',left:76,width:300,height:31,backgroundColor:'#d4d0c3',borderRadius:5,borderWidth:1,borderColor:'#ebe6d8',paddingHorizontal:5,flexDirection:'row',alignItems:'center',gap:5,shadowColor:'#000',shadowOpacity:.18,shadowRadius:4},platformReady:{borderColor:'#f5c85c',borderWidth:2},platformSign:{width:27,height:22,borderRadius:4,alignItems:'center',justifyContent:'center'},platformSignText:{color:'#fff',fontSize:9,fontWeight:'900'},platformDest:{color:'#314b56',fontSize:6.3,fontWeight:'900'},platformSub:{color:'#77888e',fontSize:4.8,fontWeight:'800'},peopleRow:{flexDirection:'row',gap:2,flexWrap:'wrap',alignItems:'flex-end',maxWidth:82},personMini:{width:6,height:11,alignItems:'center'},personHead:{width:4,height:4,borderRadius:2,backgroundColor:'#f0c49d'},personBody:{width:5,height:6,borderRadius:1,marginTop:1},trainSprite:{position:'absolute',left:105,width:240,height:24,backgroundColor:'#eef4f5',borderRadius:11,borderWidth:2,shadowColor:'#000',shadowOpacity:.35,shadowRadius:6,shadowOffset:{width:0,height:3},zIndex:8,transform:[{rotateZ:'-2deg'}]},trainNose:{position:'absolute',left:-1,top:-1,bottom:-1,width:25,borderTopLeftRadius:10,borderBottomLeftRadius:10},trainWindshield:{position:'absolute',left:8,top:5,width:12,height:7,borderRadius:2,backgroundColor:'#173a4a'},trainWindows:{position:'absolute',left:34,right:55,top:5,flexDirection:'row',justifyContent:'space-between'},trainWindow:{width:18,height:7,borderRadius:2,backgroundColor:'#315e70'},trainDoor:{position:'absolute',right:24,top:4,width:11,height:15,borderRadius:2,backgroundColor:'#c2d6dc'},trainRoofLine:{position:'absolute',left:35,right:45,top:1,height:2,backgroundColor:'#bec9cd'},
  stationBuilding:{position:'absolute',left:72,top:188,width:306,height:138,backgroundColor:'#dfdbcf',borderRadius:8,borderWidth:2,borderColor:'#596f78',shadowColor:'#20313a',shadowOpacity:.4,shadowRadius:8,shadowOffset:{width:0,height:6}},buildingRoof:{height:34,backgroundColor:'#294c5b',borderTopLeftRadius:6,borderTopRightRadius:6,paddingHorizontal:8,paddingTop:6},buildingBrand:{color:'#fff',fontSize:9,fontWeight:'900',letterSpacing:.7},buildingSub:{color:'#9fc4d2',fontSize:4.7,fontWeight:'800',marginTop:1},hallFloor:{position:'absolute',left:6,right:6,top:39,bottom:28,backgroundColor:'#f0ede5',borderRadius:5,flexDirection:'row',gap:4,padding:4},ticketZone:{width:61,backgroundColor:'#fbf2dc',borderRadius:4,borderWidth:1,borderColor:'#d4b96e',padding:4},securityZone:{width:61,backgroundColor:'#f8e8e2',borderRadius:4,borderWidth:1,borderColor:'#d69786',padding:4},waitingZone:{width:85,backgroundColor:'#eaf1e9',borderRadius:4,borderWidth:1,borderColor:'#8aad97',padding:4},serviceZone:{flex:1,backgroundColor:'#ede3d2',borderRadius:4,borderWidth:1,borderColor:'#c0aa83',padding:4},zoneName:{color:'#38515a',fontSize:4.9,fontWeight:'900'},zoneCount:{color:'#72838a',fontSize:4.3,fontWeight:'800',marginTop:1},kioskRow:{position:'absolute',left:4,right:4,bottom:4,flexDirection:'row',gap:3},kiosk:{width:10,height:16,borderRadius:2,backgroundColor:'#c99a52',borderTopWidth:4,borderTopColor:'#33596a'},gatesRow:{position:'absolute',left:4,right:4,bottom:4,flexDirection:'row',gap:3},gate:{width:10,height:18,borderWidth:3,borderBottomWidth:5,borderColor:'#69787d',borderRadius:2},chairRow:{position:'absolute',left:5,right:5,bottom:4,flexDirection:'row',flexWrap:'wrap',gap:3},chair:{width:19,height:6,borderRadius:2,backgroundColor:'#527f9a'},serviceIcons:{color:'#775f49',fontSize:6.4,fontWeight:'900',marginTop:8},entranceFacade:{position:'absolute',left:68,right:68,bottom:-23,height:38,backgroundColor:'#d7d4ca',borderWidth:2,borderColor:'#536b76',borderRadius:5,alignItems:'center',justifyContent:'center',shadowColor:'#000',shadowOpacity:.22,shadowRadius:4},entranceTitle:{color:'#304b57',fontSize:7,fontWeight:'900'},entranceSub:{color:'#7b898d',fontSize:3.8,fontWeight:'800',marginTop:2},
  parkingLot:{position:'absolute',left:13,top:330,width:182,height:58,backgroundColor:'#59666b',borderRadius:6,borderWidth:2,borderColor:'#c6d0d2',padding:4},parkingHeader:{flexDirection:'row',justifyContent:'space-between'},parkingTitle:{color:'#fff',fontSize:5.5,fontWeight:'900'},parkingCount:{color:'#d5e4e7',fontSize:5,fontWeight:'900'},parkingGrid:{flexDirection:'row',flexWrap:'wrap',gap:2,marginTop:4},parkingSpace:{width:19,height:9,borderWidth:1,borderColor:'#aebabc',alignItems:'center',justifyContent:'center'},parkingSpaceFull:{backgroundColor:'#49565b'},carBlock:{width:12,height:5,borderRadius:2},accessRoad:{position:'absolute',left:194,top:348,width:210,height:45,backgroundColor:'#596267',transform:[{rotateZ:'-5deg'}],borderRadius:6},crosswalk:{position:'absolute',left:14,top:5,flexDirection:'row',gap:3},crossStripe:{width:6,height:28,backgroundColor:'#e6e4dc'},
  leftMenu:{position:'absolute',left:5,top:54,gap:4,zIndex:30},menuButton:{width:57,height:47,borderRadius:8,backgroundColor:'rgba(10,28,38,.94)',borderWidth:1,borderColor:'#385365',alignItems:'center',justifyContent:'center'},menuButtonActive:{backgroundColor:'#254e63',borderColor:'#6bb9de'},menuIcon:{color:'#e9f3f7',fontSize:13,fontWeight:'900'},menuLabel:{color:'#b8ccd5',fontSize:4.7,fontWeight:'900',marginTop:2},menuBadge:{position:'absolute',right:-3,top:-3,width:15,height:15,borderRadius:8,backgroundColor:'#ed5d51',alignItems:'center',justifyContent:'center'},menuBadgeText:{color:'#fff',fontSize:7,fontWeight:'900'},rushPill:{position:'absolute',right:7,top:5,backgroundColor:'rgba(13,36,47,.93)',borderRadius:8,paddingHorizontal:8,paddingVertical:5,borderWidth:1,borderColor:'#46697a'},rushPillOn:{backgroundColor:'#7a3c1f',borderColor:'#f0a44f'},rushPillText:{color:'#d9e7ec',fontSize:5.3,fontWeight:'900'},messagePill:{position:'absolute',left:76,right:8,bottom:5,backgroundColor:'rgba(8,27,36,.92)',borderRadius:7,borderWidth:1,borderColor:'#3b6171',paddingHorizontal:7,paddingVertical:5},messagePillText:{color:'#c1d4dc',fontSize:5.3,fontWeight:'800'},
  upgradeDock:{height:119,backgroundColor:'#0a161f',borderTopWidth:1,borderTopColor:'#243944'},upgradeDockInner:{paddingHorizontal:6,paddingVertical:5,gap:5},upgradeCard:{width:102,height:108,backgroundColor:'#152630',borderRadius:10,borderWidth:1,borderColor:'#38505d',padding:6,alignItems:'center'},upgradeHot:{borderColor:'#f1c451',borderWidth:2,backgroundColor:'#2a2a21'},upgradeLocked:{opacity:.52},upgradeIcon:{width:28,height:28,borderRadius:7,backgroundColor:'#263c48',alignItems:'center',justifyContent:'center'},upgradeIconText:{color:'#d9edf3',fontSize:11,fontWeight:'900'},upgradeTitle:{color:'#edf5f7',fontSize:6.2,fontWeight:'900',marginTop:3,textAlign:'center'},upgradeLevel:{color:'#8ea7b1',fontSize:5,fontWeight:'900',marginTop:1},upgradeEffect:{color:'#62d986',fontSize:4.7,fontWeight:'800',marginTop:1},buyButton:{position:'absolute',left:6,right:6,bottom:5,height:23,borderRadius:6,backgroundColor:'#263842',alignItems:'center',justifyContent:'center'},buyButtonReady:{backgroundColor:'#55b927',borderWidth:1,borderColor:'#7de14c'},buyButtonMax:{backgroundColor:'#30424a'},buyText:{color:'#fff',fontSize:6.3,fontWeight:'900'},
  footerStats:{height:43,backgroundColor:'#09141c',borderTopWidth:1,borderTopColor:'#29414e',flexDirection:'row',alignItems:'center',paddingHorizontal:7,gap:6},footerStat:{flex:1,flexDirection:'row',alignItems:'center',gap:5},footerIcon:{color:'#d8e6eb',fontSize:9,fontWeight:'900'},footerLabel:{color:'#6f8a96',fontSize:4.4,fontWeight:'900'},footerValue:{color:'#edf6f8',fontSize:8,fontWeight:'900',marginTop:1},footerDivider:{width:1,height:25,backgroundColor:'#2a414d'},readyBadge:{backgroundColor:'#d69c28',borderRadius:5,paddingHorizontal:6,paddingVertical:4},readyBadgeText:{color:'#fff',fontSize:5,fontWeight:'900'},
  panelShade:{position:'absolute',left:65,right:7,top:52,bottom:34,backgroundColor:'rgba(6,17,23,.42)',zIndex:100,alignItems:'center',justifyContent:'center'},panel:{width:'94%',maxHeight:'90%',backgroundColor:'#edf0e8',borderRadius:12,borderWidth:2,borderColor:'#436678',padding:10,shadowColor:'#000',shadowOpacity:.45,shadowRadius:12},panelHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},panelTitle:{color:'#2c4a57',fontSize:12,fontWeight:'900'},closeButton:{width:28,height:28,borderRadius:7,backgroundColor:'#d5d8d1',alignItems:'center',justifyContent:'center'},closeText:{color:'#47616b',fontSize:18,fontWeight:'900'},panelLead:{color:'#3c5a65',fontSize:8,fontWeight:'900',marginTop:10},panelReward:{color:'#a47725',fontSize:8,fontWeight:'900',marginTop:5},claimButton:{marginTop:10,backgroundColor:'#9aa5a1',paddingVertical:10,borderRadius:8,alignItems:'center'},claimReady:{backgroundColor:'#50b975'},claimText:{color:'#fff',fontSize:7,fontWeight:'900'},panelDivider:{height:1,backgroundColor:'#c9cec5',marginVertical:10},panelList:{color:'#738187',fontSize:6.4,fontWeight:'800',marginVertical:3},panelListDone:{color:'#4d9a68'},routeRow:{flexDirection:'row',gap:8,alignItems:'center',paddingVertical:9,borderBottomWidth:1,borderBottomColor:'#cdd1c8'},routeLocked:{opacity:.38},routeColor:{width:9,height:32,borderRadius:4},routeName:{color:'#34515d',fontSize:8,fontWeight:'900'},routeInfo:{color:'#77858a',fontSize:6,marginTop:2},flowRow:{flexDirection:'row',alignItems:'center',gap:6,paddingVertical:7},flowName:{width:75,color:'#38535e',fontSize:6,fontWeight:'900'},flowTrack:{flex:1,height:8,backgroundColor:'#d0d4cb',borderRadius:4,overflow:'hidden'},flowFill:{height:'100%',backgroundColor:'#55afd2'},flowHot:{backgroundColor:'#e56d59'},flowPct:{width:29,textAlign:'right',color:'#5f737b',fontSize:6,fontWeight:'900'},levelRow:{padding:8,borderBottomWidth:1,borderBottomColor:'#cdd1c8'},levelRowActive:{backgroundColor:'#fff0ba'},levelRowTitle:{color:'#34515d',fontSize:7,fontWeight:'900'},levelRowSub:{color:'#7a898e',fontSize:5.5,marginTop:2},devRow:{flexDirection:'row',gap:6,justifyContent:'center',marginTop:10},devSmall:{width:38,height:31,borderRadius:7,backgroundColor:'#456775',alignItems:'center',justifyContent:'center'},devLive:{width:60,height:31,borderRadius:7,backgroundColor:'#456775',alignItems:'center',justifyContent:'center'},devText:{color:'#fff',fontSize:7,fontWeight:'900'},
});
