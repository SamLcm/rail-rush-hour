import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';

// V0.23 — FULL PROGRESSION REFERENCE BUILD
// Developer reference only. All art/layout is original placeholder work.
// Public descriptions/screenshots of idle railway tycoon conventions were used as reference.
// See RELEASE_SAFETY.md before any public store release.

const SAVE_KEY = 'rail-rush-hour-v023';
const LEGACY_KEY = 'rail-rush-hour-v022';
const WORLD_W = 1320;
const WORLD_H = 900;
const TICK = 1000;
const MAX_FACILITY_LEVEL = 10;
const MAX_STATION_LEVEL = 10;

const money = (v) => `€${Math.max(0, Math.round(v)).toLocaleString('nl-NL')}`;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const cost = (base, level, growth = 1.49) => Math.round(base * Math.pow(growth, Math.max(0, level - 1)));
const cap = (base, level, step) => base + Math.max(0, level - 1) * step;
const rate = (base, level, step) => base + Math.max(0, level - 1) * step;

const ROUTES = [
  { id: 'greenfield', name: 'Greenfield', color: '#63c77e', fare: 6, unlock: 1 },
  { id: 'lakeside', name: 'Lakeside', color: '#5ba7e8', fare: 9, unlock: 3 },
  { id: 'airport', name: 'Airport', color: '#b884e8', fare: 14, unlock: 5 },
  { id: 'harbor', name: 'Harbor City', color: '#ee9b54', fare: 18, unlock: 7 },
  { id: 'capital', name: 'Capital Central', color: '#e46879', fare: 25, unlock: 9 },
];

const STAGES = [
  { level: 1, name: 'Small Station', unlocks: 'Parking • Ticket Office • Security • Waiting Hall • Platform 1' },
  { level: 2, name: 'Local Hub', unlocks: 'Café • larger forecourt • more parking' },
  { level: 3, name: 'Town Station', unlocks: 'Shop • Lakeside route • larger waiting hall' },
  { level: 4, name: 'Growing Junction', unlocks: 'Platform 2 • second waiting zone' },
  { level: 5, name: 'Regional Station', unlocks: 'Toilets • Airport route • bigger trains' },
  { level: 6, name: 'Regional Hub', unlocks: 'Restaurant • expanded concourse' },
  { level: 7, name: 'Major Station', unlocks: 'VIP lounge • Harbor route • more services' },
  { level: 8, name: 'Intercity Hub', unlocks: 'Platform 3 • premium waiting area' },
  { level: 9, name: 'Metropolitan Station', unlocks: 'Capital route • large terminal hall' },
  { level: 10, name: 'Grand Terminal', unlocks: 'Full station • manager automation • all facilities' },
];

const FACILITIES = {
  parking: { title: 'Parking', icon: '🚗', base: 140, unlock: 1 },
  ticket: { title: 'Tickets', icon: '🎫', base: 170, unlock: 1 },
  security: { title: 'Security', icon: '🛂', base: 240, unlock: 1 },
  waiting: { title: 'Waiting', icon: '🪑', base: 310, unlock: 1 },
  platform: { title: 'Platform', icon: '🚉', base: 420, unlock: 1 },
  train: { title: 'Train', icon: '🚆', base: 720, unlock: 1 },
  cafe: { title: 'Café', icon: '☕', base: 480, unlock: 2 },
  shop: { title: 'Shop', icon: '🛍️', base: 620, unlock: 3 },
  toilet: { title: 'Toilets', icon: '🚻', base: 820, unlock: 5 },
  restaurant: { title: 'Restaurant', icon: '🍽️', base: 1150, unlock: 6 },
  vip: { title: 'VIP Lounge', icon: '⭐', base: 1600, unlock: 7 },
  manager: { title: 'Manager', icon: '🤖', base: 2600, unlock: 10 },
};

const MISSION_TEMPLATES = [
  ['parking', 'Upgrade Parking naar Lv 2', 260],
  ['ticket', 'Upgrade Ticket Office naar Lv 2', 320],
  ['security', 'Upgrade Security naar Lv 2', 420],
  ['served', 'Vervoer 100 reizigers', 620],
  ['cafe', 'Open het Café', 780],
  ['level', 'Bereik stationlevel 3', 1000],
  ['shop', 'Open de Shop', 1250],
  ['departures', 'Laat 8 treinen vertrekken', 1500],
  ['level', 'Bereik stationlevel 5', 1800],
  ['toilet', 'Open Toiletten', 2200],
  ['level', 'Bereik stationlevel 7', 2800],
  ['vip', 'Open de VIP Lounge', 3400],
  ['level', 'Bereik stationlevel 9', 4200],
  ['served', 'Vervoer 2500 reizigers', 5200],
  ['level', 'Bereik stationlevel 10', 7000],
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
  try {
    if (globalThis?.localStorage) globalThis.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {}
}

function People({ count, color = '#5d8191', max = 24 }) {
  const shown = Math.min(max, Math.ceil(Math.max(0, count) / 4));
  return (
    <View style={styles.people}>
      {Array.from({ length: shown }).map((_, i) => (
        <View key={i} style={styles.person}>
          <View style={styles.head} />
          <View style={[styles.body, { backgroundColor: i % 4 === 0 ? color : i % 4 === 1 ? '#936f5e' : i % 4 === 2 ? '#756e95' : '#54899f' }]} />
        </View>
      ))}
    </View>
  );
}

function Car({ i }) {
  return <View style={[styles.car, { left: 15 + (i % 8) * 25, top: 33 + Math.floor(i / 8) * 23, backgroundColor: i % 4 === 0 ? '#4e9fd5' : i % 4 === 1 ? '#e16f61' : i % 4 === 2 ? '#e7c65b' : '#e7edef' }]} />;
}

function FacilityBubble({ x, y, kind, level, stationLevel, cash, onUpgrade, hot }) {
  const spec = FACILITIES[kind];
  const locked = stationLevel < spec.unlock;
  const capped = level >= MAX_FACILITY_LEVEL;
  const price = cost(spec.base, Math.max(1, level || 1));
  return (
    <View style={[styles.bubble, { left: x, top: y }, hot && styles.bubbleHot, locked && styles.bubbleLocked]}>
      <Text style={styles.bubbleTitle}>{spec.icon} {spec.title}</Text>
      <Text style={styles.bubbleLevel}>{locked ? `Lv ${spec.unlock} nodig` : capped ? 'MAX' : `Lv ${level}`}</Text>
      {!locked && !capped ? (
        <Pressable disabled={cash < price} onPress={() => onUpgrade(kind)} style={[styles.plus, cash >= price && styles.plusReady]}>
          <Text style={styles.plusText}>+</Text>
        </Pressable>
      ) : <View style={styles.lockCircle}><Text style={styles.lockText}>{capped ? '✓' : '🔒'}</Text></View>}
      {!locked && !capped ? <Text style={[styles.bubblePrice, cash >= price && styles.bubblePriceReady]}>{money(price)}</Text> : null}
    </View>
  );
}

function SideButton({ icon, label, onPress, badge }) {
  return (
    <Pressable style={styles.sideButton} onPress={onPress}>
      <Text style={styles.sideIcon}>{icon}</Text><Text style={styles.sideLabel}>{label}</Text>
      {badge ? <View style={styles.badge}><Text style={styles.badgeText}>{badge}</Text></View> : null}
    </Pressable>
  );
}

function Panel({ title, onClose, children }) {
  return <View style={styles.panel}><View style={styles.panelTop}><Text style={styles.panelTitle}>{title}</Text><Pressable onPress={onClose}><Text style={styles.close}>✕</Text></Pressable></View>{children}</View>;
}

function ServiceRoom({ style, title, subtitle, count, color, children, locked }) {
  return (
    <View style={[styles.room, style, locked && styles.roomLocked]}>
      <Text style={styles.roomTitle}>{locked ? '🔒 ' : ''}{title}</Text>
      <Text style={styles.roomSub}>{locked ? 'Nog niet geopend' : subtitle}</Text>
      {!locked ? <People count={count} color={color} max={20} /> : null}
      {!locked ? children : null}
    </View>
  );
}

function Train({ platform = 1, level, onboard, capacity, route, phase, countdown }) {
  const top = platform === 1 ? 93 : platform === 2 ? 158 : 223;
  return (
    <View style={[styles.trainArea, { top }]}>
      <View style={styles.trainShadow} />
      <View style={[styles.train, phase === 'boarding' && styles.trainBoarding]}>
        <View style={[styles.trainFront, { backgroundColor: route.color }]} /><View style={styles.trainRoof} />
        <View style={styles.windows}>{Array.from({ length: 7 }).map((_, i) => <View key={i} style={styles.window} />)}</View>
        <View style={styles.trainDoor} /><View style={styles.trainStripe} /><View style={styles.wheels}><View style={styles.wheel}/><View style={styles.wheel}/><View style={styles.wheel}/><View style={styles.wheel}/></View>
      </View>
      <View style={styles.trainInfo}><Text style={styles.trainRoute}>{route.name}</Text><Text style={styles.trainLoad}>{onboard}/{capacity} • Lv {level}</Text><View style={styles.loadTrack}><View style={[styles.loadFill,{width:`${Math.round(clamp(onboard/capacity,0,1)*100)}%`,backgroundColor:route.color}]} /></View><Text style={styles.trainTimer}>{phase === 'away' ? 'Onderweg…' : `${countdown}s`}</Text></View>
    </View>
  );
}

export default function AppV23() {
  const saved = useRef(load()).current;
  const initialLevels = {
    parking: saved?.levels?.parking ?? 1,
    ticket: saved?.levels?.ticket ?? saved?.ticketLevel ?? 1,
    security: saved?.levels?.security ?? saved?.securityLevel ?? 1,
    waiting: saved?.levels?.waiting ?? saved?.waitingLevel ?? 1,
    platform: saved?.levels?.platform ?? saved?.platformLevel ?? 1,
    train: saved?.levels?.train ?? saved?.trainLevel ?? 1,
    cafe: saved?.levels?.cafe ?? saved?.cafeLevel ?? 0,
    shop: saved?.levels?.shop ?? 0,
    toilet: saved?.levels?.toilet ?? 0,
    restaurant: saved?.levels?.restaurant ?? 0,
    vip: saved?.levels?.vip ?? 0,
    manager: saved?.levels?.manager ?? 0,
  };

  const [phase, setPhase] = useState('menu');
  const [cash, setCash] = useState(saved?.cash ?? 650);
  const [gems] = useState(saved?.gems ?? 12);
  const [levels, setLevels] = useState(initialLevels);
  const [stationLevel, setStationLevel] = useState(saved?.stationLevel ?? 1);
  const [devLevel, setDevLevel] = useState(null);
  const [parkingQ, setParkingQ] = useState(15);
  const [entranceQ, setEntranceQ] = useState(8);
  const [ticketQ, setTicketQ] = useState(4);
  const [securityQ, setSecurityQ] = useState(2);
  const [waitingQ, setWaitingQ] = useState(8);
  const [platformQ, setPlatformQ] = useState(12);
  const [onboard, setOnboard] = useState(0);
  const [served, setServed] = useState(saved?.served ?? 0);
  const [departures, setDepartures] = useState(saved?.departures ?? 0);
  const [missionIndex, setMissionIndex] = useState(saved?.missionIndex ?? 0);
  const [panel, setPanel] = useState(null);
  const [routeIndex, setRouteIndex] = useState(0);
  const [trainPhase, setTrainPhase] = useState('boarding');
  const [countdown, setCountdown] = useState(24);
  const [message, setMessage] = useState('');
  const [viewport, setViewport] = useState({ width: 390, height: 520 });

  const effectiveLevel = devLevel ?? stationLevel;
  const stage = STAGES[effectiveLevel - 1];
  const unlockedRoutes = ROUTES.filter(r => r.unlock <= effectiveLevel);
  const route = unlockedRoutes[routeIndex % unlockedRoutes.length] || ROUTES[0];
  const platformsUnlocked = effectiveLevel >= 8 ? 3 : effectiveLevel >= 4 ? 2 : 1;

  const cashRef = useRef(cash);
  const levelsRef = useRef(levels);
  const parkingRef = useRef(parkingQ);
  const entranceRef = useRef(entranceQ);
  const ticketRef = useRef(ticketQ);
  const securityRef = useRef(securityQ);
  const waitingRef = useRef(waitingQ);
  const platformRef = useRef(platformQ);
  const onboardRef = useRef(onboard);
  const servedRef = useRef(served);
  const departuresRef = useRef(departures);
  const trainPhaseRef = useRef(trainPhase);
  const countdownRef = useRef(countdown);

  useEffect(()=>{cashRef.current=cash;},[cash]);
  useEffect(()=>{levelsRef.current=levels;},[levels]);
  useEffect(()=>{parkingRef.current=parkingQ;},[parkingQ]);
  useEffect(()=>{entranceRef.current=entranceQ;},[entranceQ]);
  useEffect(()=>{ticketRef.current=ticketQ;},[ticketQ]);
  useEffect(()=>{securityRef.current=securityQ;},[securityQ]);
  useEffect(()=>{waitingRef.current=waitingQ;},[waitingQ]);
  useEffect(()=>{platformRef.current=platformQ;},[platformQ]);
  useEffect(()=>{onboardRef.current=onboard;},[onboard]);
  useEffect(()=>{trainPhaseRef.current=trainPhase;},[trainPhase]);
  useEffect(()=>{countdownRef.current=countdown;},[countdown]);

  const camera = useRef(new Animated.ValueXY({x:-390,y:-220})).current;
  const cameraCurrent = useRef({x:-390,y:-220});
  const panStart = useRef({x:-390,y:-220});
  const viewportRef = useRef(viewport);
  useEffect(()=>{viewportRef.current=viewport;},[viewport]);
  const clampCamera=(x,y)=>({x:Math.max(-(WORLD_W-viewportRef.current.width),Math.min(0,x)),y:Math.max(-(WORLD_H-viewportRef.current.height),Math.min(0,y))});
  const jumpTo=(wx,wy)=>{const n=clampCamera(viewportRef.current.width/2-wx,viewportRef.current.height/2-wy);cameraCurrent.current=n;Animated.spring(camera,{toValue:n,useNativeDriver:true,tension:70,friction:10}).start();};
  const panResponder=useRef(PanResponder.create({onStartShouldSetPanResponder:()=>false,onMoveShouldSetPanResponder:(_,g)=>Math.abs(g.dx)>5||Math.abs(g.dy)>5,onPanResponderGrant:()=>{panStart.current={...cameraCurrent.current};},onPanResponderMove:(_,g)=>{const n=clampCamera(panStart.current.x+g.dx,panStart.current.y+g.dy);camera.setValue(n);cameraCurrent.current=n;}})).current;

  const addCash=(v)=>{cashRef.current+=v;setCash(Math.round(cashRef.current));};
  const spend=(v)=>{if(cashRef.current<v)return false;cashRef.current-=v;setCash(Math.round(cashRef.current));return true;};

  const totalDevelopment = Object.entries(levels).reduce((sum,[kind,lv]) => {
    const unlock = FACILITIES[kind]?.unlock ?? 1;
    return sum + (lv > 0 ? lv : 0) + (stationLevel >= unlock ? 1 : 0);
  }, 0);
  const nextLevelNeed = 8 + stationLevel * 5;
  useEffect(()=>{
    if (devLevel != null || stationLevel >= MAX_STATION_LEVEL) return;
    if (totalDevelopment >= nextLevelNeed) {
      setStationLevel(v => Math.min(MAX_STATION_LEVEL, v + 1));
      setMessage(`Station uitgebreid naar Level ${Math.min(MAX_STATION_LEVEL, stationLevel + 1)}! Nieuwe onderdelen beschikbaar.`);
    }
  }, [totalDevelopment, stationLevel, devLevel]);

  const upgrade = (kind) => {
    const spec = FACILITIES[kind];
    if (!spec || effectiveLevel < spec.unlock) return;
    const lv = levels[kind] || 0;
    if (lv >= MAX_FACILITY_LEVEL) return;
    const price = cost(spec.base, Math.max(1, lv || 1));
    if (!spend(price)) return setMessage('Nog niet genoeg geld.');
    setLevels(prev => ({ ...prev, [kind]: lv + 1 }));
    setMessage(`${spec.title} verbeterd naar Lv ${lv + 1}.`);
  };

  const mission = MISSION_TEMPLATES[Math.min(missionIndex, MISSION_TEMPLATES.length - 1)];
  const [missionType, missionTitle, missionReward] = mission;
  const missionDone = missionType === 'served' ? served >= (missionIndex >= 13 ? 2500 : 100)
    : missionType === 'departures' ? departures >= 8
    : missionType === 'level' ? stationLevel >= ([5,8,10,12,14].includes(missionIndex) ? {5:3,8:5,10:7,12:9,14:10}[missionIndex] : 2)
    : (levels[missionType] || 0) >= (missionType === 'parking' || missionType === 'ticket' || missionType === 'security' ? 2 : 1);
  const claimMission = () => {
    if (!missionDone) return;
    addCash(missionReward);
    setMissionIndex(v => Math.min(MISSION_TEMPLATES.length - 1, v + 1));
    setMessage(`Missie voltooid • +${money(missionReward)}`);
  };

  const parkingCap = cap(45, Math.max(1, levels.parking), 35);
  const entranceCap = 35 + effectiveLevel * 12;
  const ticketCap = cap(34, Math.max(1, levels.ticket), 24);
  const securityCap = cap(28, Math.max(1, levels.security), 20);
  const waitingCap = cap(72, Math.max(1, levels.waiting), 48) + Math.max(0,effectiveLevel-3)*35;
  const platformCap = cap(72, Math.max(1, levels.platform), 50) * platformsUnlocked;
  const trainCapacity = 110 + Math.max(1, levels.train) * 80 + Math.max(0,effectiveLevel-4)*35;

  const persist=()=>save({cash:cashRef.current,gems,levels:levelsRef.current,stationLevel,served:servedRef.current,departures:departuresRef.current,missionIndex});

  useEffect(()=>{
    if(phase!=='playing') return undefined;
    const id=setInterval(()=>{
      const lv=levelsRef.current;
      let pk=parkingRef.current,e=entranceRef.current,t=ticketRef.current,s=securityRef.current,w=waitingRef.current,p=platformRef.current,o=onboardRef.current;

      const incoming = rate(5, Math.max(1,lv.parking), 2) + Math.floor(effectiveLevel / 2);
      pk = Math.min(parkingCap, pk + incoming);
      const fromParking = Math.min(pk, rate(4,Math.max(1,lv.parking),3), Math.max(0,entranceCap-e)); pk-=fromParking; e+=fromParking;
      const toTicket = Math.min(e, rate(4,Math.max(1,lv.ticket),3), Math.max(0,ticketCap-t)); e-=toTicket; t+=toTicket;
      const toSecurity = Math.min(t, rate(4,Math.max(1,lv.ticket),3), Math.max(0,securityCap-s)); t-=toSecurity; s+=toSecurity;
      const toWaiting = Math.min(s, rate(3,Math.max(1,lv.security),3), Math.max(0,waitingCap-w)); s-=toWaiting; w+=toWaiting;
      const toPlatform = Math.min(w, rate(5,Math.max(1,lv.waiting),4) + (platformsUnlocked-1)*5, Math.max(0,platformCap-p)); w-=toPlatform; p+=toPlatform;

      let phaseNow=trainPhaseRef.current, cd=countdownRef.current;
      if(phaseNow==='boarding'){
        const board = Math.min(p, rate(10,Math.max(1,lv.platform),6), Math.max(0,trainCapacity-o)); p-=board; o+=board; cd=Math.max(0,cd-1);
        if(cd<=0){
          const payout=Math.round(o*route.fare*(1+(Math.max(1,lv.train)-1)*0.1)); addCash(payout);
          servedRef.current+=o; departuresRef.current+=1; setServed(servedRef.current); setDepartures(departuresRef.current);
          setMessage(`${route.name}: ${o} reizigers • +${money(payout)}`); o=0; phaseNow='away'; cd=Math.max(3,6-Math.floor(effectiveLevel/3));
        }
      } else {
        cd=Math.max(0,cd-1);
        if(cd<=0){phaseNow='boarding';cd=Math.max(14,25-effectiveLevel);setRouteIndex(v=>(v+1)%Math.max(1,unlockedRoutes.length));}
      }

      const serviceIncome = (lv.cafe||0)*2 + (lv.shop||0)*3 + (lv.toilet||0)*2 + (lv.restaurant||0)*5 + (lv.vip||0)*8;
      if(serviceIncome>0)addCash(serviceIncome + Math.round((w+p)*0.006*serviceIncome));
      if((lv.manager||0)>0 && missionDone && missionIndex < MISSION_TEMPLATES.length-1) setTimeout(claimMission, 40);

      parkingRef.current=pk;entranceRef.current=e;ticketRef.current=t;securityRef.current=s;waitingRef.current=w;platformRef.current=p;onboardRef.current=o;trainPhaseRef.current=phaseNow;countdownRef.current=cd;
      setParkingQ(pk);setEntranceQ(e);setTicketQ(t);setSecurityQ(s);setWaitingQ(w);setPlatformQ(p);setOnboard(o);setTrainPhase(phaseNow);setCountdown(cd);
      if((departuresRef.current+servedRef.current)%12===0)persist();
    },TICK);
    return()=>clearInterval(id);
  },[phase,effectiveLevel,parkingCap,entranceCap,ticketCap,securityCap,waitingCap,platformCap,trainCapacity,routeIndex,missionIndex,missionDone]);

  if(phase==='menu') return (
    <SafeAreaView style={styles.screen}><StatusBar barStyle="light-content"/><View style={styles.menu}>
      <Text style={styles.devTag}>FULL PROGRESSION REFERENCE • V0.23</Text><Text style={styles.logo}>RAIL{`\n`}RUSH HOUR</Text>
      <Text style={styles.menuText}>Nu met parkeerterrein als eerste instroomzone en een volledige 10-level stationsgroei: meer voorzieningen, routes, perrons, treinen en automatisering.</Text>
      <Pressable style={styles.start} onPress={()=>{setPhase('playing');setMessage('Start bij Parking → Entrance → Tickets → Security → Waiting → Platform → Train.');setTimeout(()=>jumpTo(610,475),60);}}><Text style={styles.startText}>OPEN STATION</Text></Pressable>
      <Text style={styles.safeNote}>DEV REFERENCE • tijdelijke eigen graphics • release register actief</Text>
    </View></SafeAreaView>
  );

  const occupiedCars=Math.min(32,Math.ceil((parkingQ/Math.max(1,parkingCap))*32));
  const currentStage=STAGES[effectiveLevel-1];

  return (
    <SafeAreaView style={styles.screen}><StatusBar barStyle="light-content"/>
      <View style={styles.topHud}><View><Text style={styles.hudSmall}>STATION LEVEL</Text><Text style={styles.hudBig}>{effectiveLevel} • {currentStage.name}</Text></View><View><Text style={styles.hudSmall}>CASH</Text><Text style={styles.cash}>{money(cash)}</Text></View><View><Text style={styles.hudSmall}>GEMS</Text><Text style={styles.gems}>💎 {gems}</Text></View></View>
      <View style={styles.levelStrip}><Text style={styles.levelText}>Lv {effectiveLevel}: {currentStage.unlocks}</Text><View style={styles.devControls}><Pressable onPress={()=>setDevLevel(v=>Math.max(1,(v??stationLevel)-1))} style={styles.devBtn}><Text style={styles.devBtnText}>−</Text></Pressable><Pressable onPress={()=>setDevLevel(null)} style={styles.devBtnWide}><Text style={styles.devBtnText}>LIVE</Text></Pressable><Pressable onPress={()=>setDevLevel(v=>Math.min(MAX_STATION_LEVEL,(v??stationLevel)+1))} style={styles.devBtn}><Text style={styles.devBtnText}>+</Text></Pressable></View></View>
      <View style={styles.taskBar}><View style={{flex:1}}><Text style={styles.taskLabel}>MISSION {missionIndex+1}/{MISSION_TEMPLATES.length}</Text><Text style={styles.taskTitle}>{missionTitle}</Text></View><Text style={styles.taskReward}>{money(missionReward)}</Text>{missionDone?<Pressable style={styles.claim} onPress={claimMission}><Text style={styles.claimText}>CLAIM</Text></Pressable>:null}</View>

      <View style={styles.viewport} onLayout={e=>setViewport({width:e.nativeEvent.layout.width,height:e.nativeEvent.layout.height})} {...panResponder.panHandlers}>
        <Animated.View style={[styles.world,{transform:[{translateX:camera.x},{translateY:camera.y}]}]}>
          <View style={styles.grass}/><View style={styles.road}><View style={styles.roadDash}/></View><View style={styles.plaza}/>

          <View style={[styles.parking,{width:230+effectiveLevel*12,height:145+Math.min(70,effectiveLevel*5)}]}><Text style={styles.parkingTitle}>PARKING • Lv {levels.parking}</Text><Text style={styles.parkingSub}>{parkingQ}/{parkingCap} visitors</Text>{Array.from({length:32}).map((_,i)=>i<occupiedCars?<Car key={i} i={i}/>:<View key={i} style={[styles.emptySpace,{left:13+(i%8)*25,top:31+Math.floor(i/8)*23}]}/>)}</View>
          <View style={styles.walkway}><Text style={styles.walkArrow}>→ → →</Text></View>

          <View style={[styles.stationBuilding,{width:650+Math.max(0,effectiveLevel-4)*45}]}><View style={styles.roof}><Text style={styles.stationName}>CENTRAL VALLEY</Text><Text style={styles.stationMeta}>LEVEL {effectiveLevel} • {currentStage.name.toUpperCase()}</Text></View><View style={styles.floor}/>
            <View style={styles.entrance}><Text style={styles.roomTitle}>ENTRANCE</Text><Text style={styles.roomSub}>{entranceQ}/{entranceCap}</Text><People count={entranceQ} max={18} color="#4e9dbe"/></View>
            <ServiceRoom style={styles.ticketRoom} title="TICKET OFFICE" subtitle={`Lv ${levels.ticket} • ${ticketQ}/${ticketCap}`} count={ticketQ} color="#c99345"><View style={styles.ticketMachines}>{Array.from({length:Math.min(5,1+levels.ticket)}).map((_,i)=><View key={i} style={styles.ticketMachine}><View style={styles.machineScreen}/></View>)}</View></ServiceRoom>
            <ServiceRoom style={styles.securityRoom} title="SECURITY" subtitle={`Lv ${levels.security} • ${securityQ}/${securityCap}`} count={securityQ} color="#bd6756"><View style={styles.detectors}>{Array.from({length:Math.min(5,1+levels.security)}).map((_,i)=><View key={i} style={styles.detector}/>)}</View></ServiceRoom>
            <ServiceRoom style={styles.waitingRoom} title="WAITING HALL" subtitle={`Lv ${levels.waiting} • ${waitingQ}/${waitingCap}`} count={waitingQ} color="#5b8ea4"><View style={styles.seats}>{Array.from({length:Math.min(18,4+levels.waiting*2)}).map((_,i)=><View key={i} style={styles.seat}/>)}</View></ServiceRoom>
            <ServiceRoom style={styles.cafe} title="CAFE" subtitle={`Lv ${levels.cafe}`} count={Math.round(waitingQ*.18)} color="#ad7857" locked={effectiveLevel<2}><View style={styles.counterCafe}/></ServiceRoom>
            <ServiceRoom style={styles.shop} title="SHOP" subtitle={`Lv ${levels.shop}`} count={Math.round(waitingQ*.14)} color="#a279aa" locked={effectiveLevel<3}><View style={styles.shopShelf}/></ServiceRoom>
            <ServiceRoom style={styles.toilet} title="TOILETS" subtitle={`Lv ${levels.toilet}`} count={Math.round(waitingQ*.06)} color="#678da0" locked={effectiveLevel<5}/>
            {effectiveLevel>=6?<ServiceRoom style={styles.restaurant} title="RESTAURANT" subtitle={`Lv ${levels.restaurant}`} count={Math.round(waitingQ*.12)} color="#a06d50"><View style={styles.restaurantTables}/></ServiceRoom>:null}
            {effectiveLevel>=7?<ServiceRoom style={styles.vip} title="VIP LOUNGE" subtitle={`Lv ${levels.vip}`} count={Math.round(waitingQ*.05)} color="#8770b7"><View style={styles.vipSeats}/></ServiceRoom>:null}
          </View>

          {[1,2,3].map((pNum)=>{
            const unlocked=pNum<=platformsUnlocked; const top=198-(pNum-1)*72;
            return <View key={pNum} style={[styles.platform,{top,opacity:unlocked?1:.36}]}><View style={styles.yellowLine}/><Text style={styles.platformName}>{unlocked?`PLATFORM ${pNum}`:`PLATFORM ${pNum} • LOCKED`}</Text><Text style={styles.platformInfo}>{unlocked?`${Math.round(platformQ/platformsUnlocked)}/${Math.round(platformCap/platformsUnlocked)} waiting`:`Station Lv ${pNum===2?4:8}`}</Text>{unlocked?<People count={Math.round(platformQ/platformsUnlocked)} max={22} color={route.color}/>:null}<View style={styles.canopy}/><View style={styles.bench}/></View>;
          })}
          {[1,2,3].map((pNum)=>{const top=100-(pNum-1)*72;return <View key={`track-${pNum}`} style={[styles.track,{top,opacity:pNum<=platformsUnlocked?1:.25}]}>{Array.from({length:24}).map((_,i)=><View key={i} style={[styles.sleeper,{left:i*42}]}/>) }<View style={[styles.rail,{top:20}]}/><View style={[styles.rail,{top:50}]}/></View>;})}
          {trainPhase!=='away'?<Train platform={1} level={levels.train} onboard={onboard} capacity={trainCapacity} route={route} phase={trainPhase} countdown={countdown}/>:<View style={styles.away}><Text style={styles.awayText}>TRAIN EN ROUTE • {countdown}s</Text></View>}

          <FacilityBubble x={110} y={665} kind="parking" level={levels.parking} stationLevel={effectiveLevel} cash={cash} onUpgrade={upgrade} hot={missionType==='parking'}/>
          <FacilityBubble x={385} y={575} kind="ticket" level={levels.ticket} stationLevel={effectiveLevel} cash={cash} onUpgrade={upgrade} hot={missionType==='ticket'}/>
          <FacilityBubble x={525} y={575} kind="security" level={levels.security} stationLevel={effectiveLevel} cash={cash} onUpgrade={upgrade} hot={missionType==='security'}/>
          <FacilityBubble x={665} y={575} kind="waiting" level={levels.waiting} stationLevel={effectiveLevel} cash={cash} onUpgrade={upgrade}/>
          <FacilityBubble x={780} y={250} kind="platform" level={levels.platform} stationLevel={effectiveLevel} cash={cash} onUpgrade={upgrade}/>
          <FacilityBubble x={940} y={72} kind="train" level={levels.train} stationLevel={effectiveLevel} cash={cash} onUpgrade={upgrade}/>
          <FacilityBubble x={825} y={585} kind="cafe" level={levels.cafe} stationLevel={effectiveLevel} cash={cash} onUpgrade={upgrade} hot={missionType==='cafe'}/>
          <FacilityBubble x={940} y={585} kind="shop" level={levels.shop} stationLevel={effectiveLevel} cash={cash} onUpgrade={upgrade} hot={missionType==='shop'}/>
          <FacilityBubble x={1050} y={585} kind="toilet" level={levels.toilet} stationLevel={effectiveLevel} cash={cash} onUpgrade={upgrade} hot={missionType==='toilet'}/>
          <FacilityBubble x={1080} y={455} kind="restaurant" level={levels.restaurant} stationLevel={effectiveLevel} cash={cash} onUpgrade={upgrade}/>
          <FacilityBubble x={1080} y={340} kind="vip" level={levels.vip} stationLevel={effectiveLevel} cash={cash} onUpgrade={upgrade} hot={missionType==='vip'}/>
          <FacilityBubble x={1115} y={235} kind="manager" level={levels.manager} stationLevel={effectiveLevel} cash={cash} onUpgrade={upgrade}/>
        </Animated.View>

        <View style={styles.leftMenu}><SideButton icon="📋" label="Missions" onPress={()=>setPanel('missions')} badge={missionDone?'!':null}/><SideButton icon="📍" label="Routes" onPress={()=>setPanel('routes')}/><SideButton icon="🕒" label="Schedule" onPress={()=>setPanel('schedule')}/><SideButton icon="🚆" label="Trains" onPress={()=>setPanel('trains')}/><SideButton icon="⚙️" label="Tech" onPress={()=>setPanel('tech')}/><SideButton icon="🏗️" label="Levels" onPress={()=>setPanel('levels')}/></View>
        <View style={styles.zoomButtons}><Pressable style={styles.zoomBtn} onPress={()=>jumpTo(610,475)}><Text style={styles.zoomText}>⌂</Text></Pressable><Pressable style={styles.zoomBtn} onPress={()=>jumpTo(180,660)}><Text style={styles.zoomText}>🚗</Text></Pressable><Pressable style={styles.zoomBtn} onPress={()=>jumpTo(760,160)}><Text style={styles.zoomText}>🚆</Text></Pressable></View>
        <View style={styles.message}><Text style={styles.messageText}>{message}</Text></View>

        {panel==='missions'?<Panel title="MISSIONS" onClose={()=>setPanel(null)}><ScrollView>{MISSION_TEMPLATES.map((m,i)=><View key={`${m[0]}-${i}`} style={[styles.listRow,i===missionIndex&&styles.listRowActive]}><Text style={styles.listTitle}>{i<missionIndex?'✓ ':''}{m[1]}</Text><Text style={styles.listReward}>{money(m[2])}</Text></View>)}</ScrollView></Panel>:null}
        {panel==='routes'?<Panel title="DESTINATIONS" onClose={()=>setPanel(null)}>{ROUTES.map(r=><View key={r.id} style={[styles.listRow,effectiveLevel<r.unlock&&styles.lockedRow]}><View><Text style={styles.listTitle}>{effectiveLevel<r.unlock?'🔒 ':''}{r.name}</Text><Text style={styles.listSub}>Unlock Lv {r.unlock} • Fare {money(r.fare)}</Text></View></View>)}</Panel>:null}
        {panel==='schedule'?<Panel title="SCHEDULE" onClose={()=>setPanel(null)}><View style={styles.scheduleCard}><Text style={styles.listTitle}>Current service</Text><Text style={styles.scheduleTime}>00:{String(countdown).padStart(2,'0')}</Text><Text style={styles.listSub}>{route.name} • Platform 1</Text></View><Text style={styles.listSub}>Station Lv {effectiveLevel}: {platformsUnlocked} platform(s), {unlockedRoutes.length} route(s).</Text></Panel>:null}
        {panel==='trains'?<Panel title="TRAINS" onClose={()=>setPanel(null)}><View style={styles.bigTrainCard}><Text style={styles.trainCardTitle}>{effectiveLevel>=8?'Intercity Unit':effectiveLevel>=5?'Regional Unit':'Local Unit'}</Text><Text style={styles.listSub}>Train Lv {levels.train} • Capacity {trainCapacity}</Text><Text style={styles.listSub}>Current load {onboard}/{trainCapacity}</Text></View></Panel>:null}
        {panel==='tech'?<Panel title="TECHNOLOGY" onClose={()=>setPanel(null)}>{Object.entries(FACILITIES).map(([key,s])=><View key={key} style={[styles.techRow,effectiveLevel<s.unlock&&styles.lockedRow]}><Text style={styles.listTitle}>{s.icon} {s.title}</Text><Text style={styles.techValue}>{effectiveLevel<s.unlock?`Lv ${s.unlock}`:`Lv ${levels[key]||0}`}</Text></View>)}</Panel>:null}
        {panel==='levels'?<Panel title="STATION LEVELS" onClose={()=>setPanel(null)}><ScrollView>{STAGES.map(s=><Pressable key={s.level} onPress={()=>setDevLevel(s.level)} style={[styles.stageRow,effectiveLevel===s.level&&styles.stageActive]}><Text style={styles.stageTitle}>LEVEL {s.level} • {s.name}</Text><Text style={styles.listSub}>{s.unlocks}</Text></Pressable>)}</ScrollView></Panel>:null}
      </View>
      <View style={styles.bottomStats}><Text style={styles.stat}>🚗 {parkingQ}/{parkingCap}</Text><Text style={styles.stat}>👥 {served} transported</Text><Text style={styles.stat}>🚆 {departures} departures</Text><Text style={styles.stat}>🚉 {platformsUnlocked} platforms</Text><Text style={styles.stat}>📍 {unlockedRoutes.length} routes</Text></View>
    </SafeAreaView>
  );
}

const styles=StyleSheet.create({
  screen:{flex:1,backgroundColor:'#162631'},menu:{flex:1,backgroundColor:'#123043',alignItems:'center',justifyContent:'center',padding:28},devTag:{color:'#8bd6ff',fontSize:9,fontWeight:'900',letterSpacing:2,marginBottom:12},logo:{color:'#fff',fontSize:48,lineHeight:44,fontWeight:'900',textAlign:'center'},menuText:{color:'#b8cfda',fontSize:13,lineHeight:20,textAlign:'center',maxWidth:390,marginTop:18,marginBottom:24},start:{backgroundColor:'#f5c85c',paddingVertical:16,paddingHorizontal:44,borderRadius:14,borderWidth:1,borderColor:'#ffe6a2'},startText:{color:'#17303c',fontWeight:'900',fontSize:14},safeNote:{color:'#6d94a5',fontSize:6.5,fontWeight:'800',marginTop:15},
  topHud:{height:58,backgroundColor:'#163447',flexDirection:'row',alignItems:'center',justifyContent:'space-around',borderBottomWidth:2,borderBottomColor:'#244e63'},hudSmall:{color:'#7ea3b5',fontSize:5.8,fontWeight:'900',textAlign:'center'},hudBig:{color:'#fff',fontSize:9,fontWeight:'900',textAlign:'center'},cash:{color:'#7ee397',fontSize:13,fontWeight:'900'},gems:{color:'#7ec9ff',fontSize:11,fontWeight:'900'},levelStrip:{minHeight:37,backgroundColor:'#102c3b',flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:8,borderBottomWidth:1,borderBottomColor:'#285166'},levelText:{color:'#a8c9d7',fontSize:6,fontWeight:'800',flex:1},devControls:{flexDirection:'row',gap:3},devBtn:{width:28,height:25,borderRadius:6,backgroundColor:'#31566a',alignItems:'center',justifyContent:'center'},devBtnWide:{width:40,height:25,borderRadius:6,backgroundColor:'#31566a',alignItems:'center',justifyContent:'center'},devBtnText:{color:'#e4f0f4',fontSize:7,fontWeight:'900'},
  taskBar:{minHeight:52,backgroundColor:'#f3f0e4',paddingHorizontal:10,paddingVertical:7,flexDirection:'row',alignItems:'center',gap:8,borderBottomWidth:2,borderBottomColor:'#b8b4a8'},taskLabel:{color:'#7f7b6d',fontSize:5.7,fontWeight:'900'},taskTitle:{color:'#273d49',fontSize:8,fontWeight:'900',marginTop:2},taskReward:{color:'#b88329',fontSize:7.5,fontWeight:'900'},claim:{backgroundColor:'#55bd79',paddingHorizontal:12,paddingVertical:6,borderRadius:7},claimText:{color:'#fff',fontSize:6.5,fontWeight:'900'},
  viewport:{flex:1,overflow:'hidden',backgroundColor:'#a8d27f',position:'relative'},world:{position:'absolute',width:WORLD_W,height:WORLD_H},grass:{position:'absolute',inset:0,backgroundColor:'#a8d27f'},road:{position:'absolute',left:-40,top:675,width:500,height:110,backgroundColor:'#687477',transform:[{rotateZ:'-12deg'}],borderRadius:15},roadDash:{position:'absolute',left:15,right:15,top:53,borderTopWidth:3,borderTopColor:'#e7e3d3',borderStyle:'dashed'},plaza:{position:'absolute',left:250,top:555,width:850,height:190,backgroundColor:'#d2cbb9',borderWidth:3,borderColor:'#e8e1d2',borderRadius:18},
  parking:{position:'absolute',left:35,top:585,backgroundColor:'#788789',borderWidth:3,borderColor:'#cfd8d7',borderRadius:14,padding:9},parkingTitle:{color:'#f0f5f5',fontSize:8,fontWeight:'900'},parkingSub:{color:'#cad6d8',fontSize:5.5,fontWeight:'800',marginTop:2},car:{position:'absolute',width:17,height:9,borderRadius:3,borderWidth:1,borderColor:'#f2f4f2'},emptySpace:{position:'absolute',width:19,height:12,borderWidth:1,borderColor:'#cbd3d1',opacity:.42},walkway:{position:'absolute',left:270,top:635,width:115,height:40,backgroundColor:'#c9c5b9',borderRadius:6,justifyContent:'center',alignItems:'center'},walkArrow:{color:'#71838a',fontSize:15,fontWeight:'900'},
  stationBuilding:{position:'absolute',left:360,top:395,height:320,backgroundColor:'#eee9da',borderRadius:14,borderWidth:4,borderColor:'#476677',shadowColor:'#25414d',shadowOpacity:.28,shadowRadius:10,shadowOffset:{width:8,height:10}},roof:{position:'absolute',left:0,right:0,top:0,height:55,backgroundColor:'#365d70',borderTopLeftRadius:10,borderTopRightRadius:10,paddingHorizontal:12,paddingTop:9},stationName:{color:'#fff',fontSize:12,fontWeight:'900',letterSpacing:1},stationMeta:{color:'#a9c8d5',fontSize:5.3,fontWeight:'800',marginTop:2},floor:{position:'absolute',left:12,right:12,top:64,bottom:12,backgroundColor:'#dcd8ca',borderRadius:9},room:{position:'absolute',backgroundColor:'#f5f0e2',borderWidth:2,borderColor:'#a7aa9d',borderRadius:8,padding:6,overflow:'hidden'},roomLocked:{backgroundColor:'#d0cdc3',borderStyle:'dashed',opacity:.66},roomTitle:{color:'#314a55',fontSize:6.3,fontWeight:'900'},roomSub:{color:'#75868c',fontSize:5.1,fontWeight:'800',marginTop:2},entrance:{position:'absolute',left:-92,top:128,width:92,height:118,backgroundColor:'#d6e0e2',borderWidth:3,borderColor:'#5e7d89',borderRadius:9,padding:6},ticketRoom:{left:18,top:76,width:110,height:205},securityRoom:{left:136,top:76,width:110,height:205},waitingRoom:{left:254,top:76,width:150,height:205},cafe:{left:412,top:76,width:105,height:98},shop:{left:525,top:76,width:105,height:98},toilet:{left:412,top:183,width:105,height:98},restaurant:{left:525,top:183,width:115,height:98},vip:{left:648,top:76,width:115,height:205},
  people:{flexDirection:'row',flexWrap:'wrap',gap:3,marginTop:6,alignContent:'flex-start'},person:{width:7,height:13,alignItems:'center'},head:{width:4,height:4,borderRadius:3,backgroundColor:'#efc49a'},body:{width:5,height:7,borderRadius:1,marginTop:1},ticketMachines:{position:'absolute',left:7,right:7,bottom:8,flexDirection:'row',gap:4},ticketMachine:{width:19,height:34,borderRadius:3,backgroundColor:'#bd8e49',borderWidth:1,borderColor:'#776443'},machineScreen:{width:9,height:6,backgroundColor:'#345d6e',marginLeft:4,marginTop:4,borderRadius:1},detectors:{position:'absolute',left:7,right:7,bottom:8,flexDirection:'row',gap:4},detector:{width:20,height:41,borderWidth:4,borderBottomWidth:8,borderColor:'#69787d',backgroundColor:'#d9dcda',borderRadius:4},seats:{position:'absolute',left:8,right:8,bottom:10,flexDirection:'row',flexWrap:'wrap',gap:4},seat:{width:25,height:9,backgroundColor:'#8b6549',borderRadius:3},counterCafe:{position:'absolute',left:8,right:8,bottom:10,height:25,backgroundColor:'#8a5a3b',borderTopWidth:6,borderTopColor:'#d99c60',borderRadius:4},shopShelf:{position:'absolute',left:8,right:8,bottom:10,height:25,backgroundColor:'#7b6150',borderTopWidth:5,borderTopColor:'#b99a71'},restaurantTables:{position:'absolute',left:8,right:8,bottom:10,height:28,backgroundColor:'#9a7658',borderRadius:5},vipSeats:{position:'absolute',left:10,right:10,bottom:12,height:45,backgroundColor:'#8275a2',borderRadius:8},
  platform:{position:'absolute',left:440,width:610,height:63,backgroundColor:'#c9c5b9',borderRadius:8,borderWidth:3,borderColor:'#ebe7db',padding:7,zIndex:6},yellowLine:{position:'absolute',left:8,right:8,top:5,height:5,backgroundColor:'#e2c450',borderRadius:3},platformName:{color:'#344c55',fontSize:7,fontWeight:'900',marginTop:8},platformInfo:{color:'#6d7e84',fontSize:5,fontWeight:'800'},canopy:{position:'absolute',left:185,top:20,width:245,height:19,backgroundColor:'#527888',borderRadius:5,borderWidth:1,borderColor:'#a8c5d0'},bench:{position:'absolute',left:260,bottom:10,width:65,height:7,backgroundColor:'#7d5c41',borderRadius:2},track:{position:'absolute',left:380,width:830,height:62,backgroundColor:'#686e70',transform:[{rotateZ:'-2deg'}],borderRadius:5},sleeper:{position:'absolute',top:9,width:7,height:43,backgroundColor:'#614937'},rail:{position:'absolute',left:5,right:5,height:3,backgroundColor:'#d7dde0'},
  trainArea:{position:'absolute',left:500,width:610,height:75,zIndex:20},trainShadow:{position:'absolute',left:0,top:35,width:400,height:20,backgroundColor:'rgba(18,31,36,.2)',borderRadius:14,transform:[{rotateZ:'-2deg'}]},train:{position:'absolute',left:0,top:9,width:410,height:38,backgroundColor:'#e9f0f1',borderRadius:9,borderWidth:3,borderColor:'#5c7b88',transform:[{rotateZ:'-2deg'}]},trainBoarding:{backgroundColor:'#edf5ea'},trainFront:{position:'absolute',left:0,top:0,bottom:0,width:28,borderTopLeftRadius:6,borderBottomLeftRadius:6},trainRoof:{position:'absolute',left:44,right:35,top:2,height:4,backgroundColor:'#bdc9ce',borderRadius:3},windows:{position:'absolute',left:47,right:70,top:9,flexDirection:'row',justifyContent:'space-between'},window:{width:27,height:9,backgroundColor:'#31586a',borderRadius:2,borderWidth:1,borderColor:'#8bb3c3'},trainDoor:{position:'absolute',right:28,top:10,width:17,height:23,backgroundColor:'#c2d5dc',borderWidth:1,borderColor:'#627b84'},trainStripe:{position:'absolute',left:28,right:0,top:24,height:3,backgroundColor:'#8097a0'},wheels:{position:'absolute',left:65,right:55,bottom:-7,flexDirection:'row',justifyContent:'space-between'},wheel:{width:12,height:12,borderRadius:8,backgroundColor:'#28373d',borderWidth:2,borderColor:'#617176'},trainInfo:{position:'absolute',left:420,top:0,width:125,backgroundColor:'rgba(13,34,43,.96)',borderRadius:8,borderWidth:1,borderColor:'#496976',padding:6},trainRoute:{color:'#fff',fontSize:7.2,fontWeight:'900'},trainLoad:{color:'#acc1ca',fontSize:5.5,marginTop:2,fontWeight:'800'},loadTrack:{height:4,backgroundColor:'#243d47',borderRadius:3,overflow:'hidden',marginTop:3},loadFill:{height:'100%'},trainTimer:{color:'#f2cb67',fontSize:5.2,fontWeight:'900',marginTop:3},away:{position:'absolute',left:690,top:120,backgroundColor:'#24414f',padding:9,borderRadius:8},awayText:{color:'#d2e4ea',fontSize:6.5,fontWeight:'900'},
  bubble:{position:'absolute',width:98,backgroundColor:'rgba(23,48,59,.95)',borderRadius:9,borderWidth:1,borderColor:'#567481',padding:6,alignItems:'center',zIndex:30},bubbleHot:{borderColor:'#f2cb63',borderWidth:2},bubbleLocked:{opacity:.62},bubbleTitle:{color:'#dce9ed',fontSize:5.8,fontWeight:'900'},bubbleLevel:{color:'#8fa7b0',fontSize:5,marginTop:1},plus:{width:24,height:24,borderRadius:13,backgroundColor:'#50636b',alignItems:'center',justifyContent:'center',marginTop:3},plusReady:{backgroundColor:'#54bb78'},plusText:{color:'#fff',fontSize:16,lineHeight:18,fontWeight:'900'},lockCircle:{width:24,height:24,borderRadius:13,backgroundColor:'#555f63',alignItems:'center',justifyContent:'center',marginTop:3},lockText:{fontSize:10},bubblePrice:{color:'#798e96',fontSize:5,fontWeight:'900',marginTop:2},bubblePriceReady:{color:'#f2cb63'},
  leftMenu:{position:'absolute',left:6,top:8,gap:4},sideButton:{width:58,minHeight:49,backgroundColor:'rgba(20,50,64,.95)',borderRadius:9,borderWidth:1,borderColor:'#477082',alignItems:'center',justifyContent:'center',position:'relative'},sideIcon:{fontSize:15},sideLabel:{color:'#d3e3e9',fontSize:5,fontWeight:'900',marginTop:2},badge:{position:'absolute',right:-3,top:-3,width:17,height:17,borderRadius:9,backgroundColor:'#e05d51',alignItems:'center',justifyContent:'center'},badgeText:{color:'#fff',fontSize:8,fontWeight:'900'},zoomButtons:{position:'absolute',right:7,top:8,gap:5},zoomBtn:{width:38,height:38,borderRadius:9,backgroundColor:'rgba(20,50,64,.95)',borderWidth:1,borderColor:'#477082',alignItems:'center',justifyContent:'center'},zoomText:{fontSize:15},message:{position:'absolute',left:70,right:55,bottom:8,minHeight:35,backgroundColor:'rgba(17,42,53,.94)',borderRadius:8,borderWidth:1,borderColor:'#456675',justifyContent:'center',paddingHorizontal:9},messageText:{color:'#cadbe1',fontSize:6.5,fontWeight:'800'},
  panel:{position:'absolute',left:72,right:54,top:55,maxHeight:360,backgroundColor:'#f1eee3',borderRadius:12,borderWidth:3,borderColor:'#3f6474',padding:10,zIndex:200},panelTop:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:8},panelTitle:{color:'#294653',fontSize:12,fontWeight:'900'},close:{color:'#5d6f77',fontSize:15,fontWeight:'900'},listRow:{paddingVertical:9,paddingHorizontal:8,borderBottomWidth:1,borderBottomColor:'#ccc7b9',flexDirection:'row',justifyContent:'space-between'},listRowActive:{backgroundColor:'#fff7d6'},lockedRow:{opacity:.42},listTitle:{color:'#344e58',fontSize:7.2,fontWeight:'900'},listReward:{color:'#b27f2d',fontSize:7,fontWeight:'900'},listSub:{color:'#7a898e',fontSize:5.8,marginTop:3},scheduleCard:{backgroundColor:'#e4e0d4',padding:10,borderRadius:8,marginBottom:8},scheduleTime:{color:'#315a6b',fontSize:20,fontWeight:'900',marginVertical:4},bigTrainCard:{backgroundColor:'#e3e0d5',padding:13,borderRadius:9},trainCardTitle:{color:'#294a58',fontSize:12,fontWeight:'900',marginBottom:5},techRow:{paddingVertical:8,borderBottomWidth:1,borderBottomColor:'#ccc7b9',flexDirection:'row',justifyContent:'space-between'},techValue:{color:'#4f8e68',fontSize:7.5,fontWeight:'900'},stageRow:{padding:9,borderBottomWidth:1,borderBottomColor:'#cbc7ba'},stageActive:{backgroundColor:'#fff5c9'},stageTitle:{color:'#304f5b',fontSize:7.5,fontWeight:'900'},
  bottomStats:{height:31,backgroundColor:'#122c39',flexDirection:'row',alignItems:'center',justifyContent:'space-around',borderTopWidth:1,borderTopColor:'#315264'},stat:{color:'#9db5bf',fontSize:5.5,fontWeight:'800'},
});