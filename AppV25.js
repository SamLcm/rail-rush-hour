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

// V0.25 — MULTI-TRAIN OPERATIONS
// Developer reference build. All code/art/layout is original placeholder work.
// Core test: multiple simultaneous platform services + route-specific passenger demand.

const SAVE_KEY = 'rail-rush-hour-v025';
const LEGACY_KEY = 'rail-rush-hour-v024';
const TICK = 1000;
const WORLD_W = 1320;
const WORLD_H = 900;
const MAX_LEVEL = 10;

const money = (v) => `€${Math.max(0, Math.round(v)).toLocaleString('nl-NL')}`;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const cap = (base, lv, step) => base + Math.max(0, lv - 1) * step;
const rate = (base, lv, step) => base + Math.max(0, lv - 1) * step;
const upgradeCost = (base, lv, growth = 1.49) => Math.round(base * Math.pow(growth, Math.max(0, lv - 1)));

const ROUTES = [
  { id: 'greenfield', name: 'Greenfield', color: '#63c77e', fare: 6, unlock: 1 },
  { id: 'lakeside', name: 'Lakeside', color: '#5ba7e8', fare: 9, unlock: 3 },
  { id: 'airport', name: 'Airport', color: '#b884e8', fare: 14, unlock: 5 },
  { id: 'harbor', name: 'Harbor City', color: '#ee9b54', fare: 18, unlock: 7 },
  { id: 'capital', name: 'Capital Central', color: '#e46879', fare: 25, unlock: 9 },
];

const STAGES = [
  ['Small Station', '1 perron • basisfaciliteiten'],
  ['Local Hub', 'Café • groter voorplein'],
  ['Town Station', 'Lakeside • shop'],
  ['Growing Junction', '2 perrons • twee treinen tegelijk'],
  ['Regional Station', 'Airport • grotere treinen'],
  ['Regional Hub', 'Restaurant • grotere hal'],
  ['Major Station', 'Harbor • 3-delige treinen'],
  ['Intercity Hub', '3 perrons • drie treinen tegelijk'],
  ['Metropolitan', 'Capital • hoogfrequente operatie'],
  ['Grand Terminal', 'Manager • volledige automatisering'],
];

const FACILITIES = {
  parking: { title: 'Parking', icon: '🚗', base: 150, unlock: 1 },
  ticket: { title: 'Tickets', icon: '🎫', base: 180, unlock: 1 },
  security: { title: 'Security', icon: '🛂', base: 250, unlock: 1 },
  waiting: { title: 'Waiting', icon: '🪑', base: 320, unlock: 1 },
  platform: { title: 'Platforms', icon: '🚉', base: 440, unlock: 1 },
  train: { title: 'Train', icon: '🚆', base: 760, unlock: 1 },
  cafe: { title: 'Café', icon: '☕', base: 500, unlock: 2 },
  shop: { title: 'Shop', icon: '🛍️', base: 640, unlock: 3 },
  toilet: { title: 'Toilets', icon: '🚻', base: 850, unlock: 5 },
  restaurant: { title: 'Restaurant', icon: '🍽️', base: 1200, unlock: 6 },
  vip: { title: 'VIP', icon: '⭐', base: 1700, unlock: 7 },
  manager: { title: 'Manager', icon: '🤖', base: 2800, unlock: 10 },
};

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
  return { platform, routeId, phase: 'boarding', countdown: 17 + platform * 3, delay: 0, hold: 0, onboard: 0, sets };
}

function People({ count, color = '#54899f', max = 24 }) {
  const shown = Math.min(max, Math.ceil(Math.max(0, count) / 4));
  return <View style={styles.people}>{Array.from({ length: shown }).map((_, i) => <View key={i} style={styles.person}><View style={styles.head}/><View style={[styles.body,{backgroundColor:i%3===0?color:i%3===1?'#936f5e':'#756e95'}]}/></View>)}</View>;
}
function Car({ i }) {
  const colors=['#4e9fd5','#e16f61','#e7c65b','#e7edef'];
  return <View style={[styles.car,{left:14+(i%8)*25,top:38+Math.floor(i/8)*23,backgroundColor:colors[i%4]}]}/>;
}
function Panel({ title, onClose, children }) {
  return <View style={styles.panel}><View style={styles.panelTop}><Text style={styles.panelTitle}>{title}</Text><Pressable onPress={onClose}><Text style={styles.close}>✕</Text></Pressable></View>{children}</View>;
}
function SideButton({ icon, label, onPress, badge }) {
  return <Pressable style={styles.sideButton} onPress={onPress}><Text style={styles.sideIcon}>{icon}</Text><Text style={styles.sideLabel}>{label}</Text>{badge?<View style={styles.badge}><Text style={styles.badgeText}>{badge}</Text></View>:null}</Pressable>;
}
function FacilityBubble({ x,y,kind,level,stationLevel,cash,onUpgrade,hot }) {
  const spec=FACILITIES[kind]; const locked=stationLevel<spec.unlock; const capped=level>=MAX_LEVEL; const price=upgradeCost(spec.base,Math.max(1,level||1));
  return <View style={[styles.bubble,{left:x,top:y},hot&&styles.bubbleHot,locked&&styles.bubbleLocked]}><Text style={styles.bubbleTitle}>{spec.icon} {spec.title}</Text><Text style={styles.bubbleLevel}>{locked?`Lv ${spec.unlock} nodig`:capped?'MAX':`Lv ${level}`}</Text>{!locked&&!capped?<Pressable disabled={cash<price} onPress={()=>onUpgrade(kind)} style={[styles.plus,cash>=price&&styles.plusReady]}><Text style={styles.plusText}>+</Text></Pressable>:<View style={styles.lockCircle}><Text style={styles.lockText}>{capped?'✓':'🔒'}</Text></View>}{!locked&&!capped?<Text style={[styles.bubblePrice,cash>=price&&styles.bubblePriceReady]}>{money(price)}</Text>:null}</View>;
}

function ServiceCard({ service, capacity, waiting, priority, onPriority, onWait, onDepart }) {
  const route=routeById(service.routeId);
  const ready=service.phase==='ready';
  const state=service.phase==='away'?'ONDERWEG':service.phase==='holding'?`WACHT ${service.hold}s`:ready?`VERTREK +${service.delay}s`:`${service.countdown}s`;
  return <View style={[styles.serviceCard,ready&&styles.serviceCardReady,priority&&styles.serviceCardPriority,{borderColor:route.color}]}>
    <View style={styles.serviceTop}><Text style={styles.servicePlatform}>P{service.platform}</Text><Text style={styles.serviceRoute}>{route.name}</Text><Pressable onPress={onPriority} style={[styles.priorityDot,priority&&styles.priorityDotOn]}><Text style={styles.priorityDotText}>★</Text></Pressable></View>
    <Text style={styles.serviceLoad}>{service.onboard}/{capacity} • {waiting} wachten • {service.sets} set{service.sets>1?'s':''}</Text>
    <Text style={[styles.serviceState,ready&&styles.serviceStateReady]}>{state}</Text>
    {ready?<View style={styles.serviceActions}><Pressable style={styles.serviceWait} onPress={onWait}><Text style={styles.serviceActionText}>+5s</Text></Pressable><Pressable style={styles.serviceDepart} onPress={onDepart}><Text style={styles.serviceActionText}>VERTREK</Text></Pressable></View>:null}
  </View>;
}

function TrainVisual({ service, capacity, hot }) {
  if(service.phase==='away') return null;
  const route=routeById(service.routeId);
  const top=28+(service.platform-1)*80;
  return <View style={[styles.trainArea,{top}]}><View style={styles.trainShadow}/><View style={[styles.train,hot&&styles.trainHot]}><View style={[styles.trainFront,{backgroundColor:route.color}]}/><View style={styles.trainRoof}/><View style={styles.windows}>{Array.from({length:7}).map((_,i)=><View key={i} style={styles.window}/>)}</View><View style={styles.trainDoor}/><View style={styles.wheels}>{Array.from({length:4}).map((_,i)=><View key={i} style={styles.wheel}/>)}</View></View><View style={styles.trainInfo}><Text style={styles.trainRoute}>P{service.platform} • {route.name}</Text><Text style={styles.trainLoad}>{service.onboard}/{capacity} • {service.sets} set{service.sets>1?'s':''}</Text><View style={styles.loadTrack}><View style={[styles.loadFill,{width:`${Math.round(clamp(service.onboard/capacity,0,1)*100)}%`,backgroundColor:route.color}]}/></View><Text style={styles.trainState}>{service.phase==='ready'?`READY +${service.delay}s`:service.phase==='holding'?`HOLD ${service.hold}s`:`${service.countdown}s`}</Text></View></View>;
}

export default function AppV25(){
  const saved=useRef(load()).current;
  const initialLevels={
    parking:saved?.levels?.parking??1,ticket:saved?.levels?.ticket??1,security:saved?.levels?.security??1,waiting:saved?.levels?.waiting??1,platform:saved?.levels?.platform??1,train:saved?.levels?.train??1,
    cafe:saved?.levels?.cafe??0,shop:saved?.levels?.shop??0,toilet:saved?.levels?.toilet??0,restaurant:saved?.levels?.restaurant??0,vip:saved?.levels?.vip??0,manager:saved?.levels?.manager??0,
  };
  const [phase,setPhase]=useState('menu');
  const [cash,setCash]=useState(saved?.cash??850);
  const [levels,setLevels]=useState(initialLevels);
  const [stationLevel,setStationLevel]=useState(saved?.stationLevel??1);
  const [devLevel,setDevLevel]=useState(null);
  const [parkingQ,setParkingQ]=useState(15),[entranceQ,setEntranceQ]=useState(7),[ticketQ,setTicketQ]=useState(4),[securityQ,setSecurityQ]=useState(2),[waitingQ,setWaitingQ]=useState(7);
  const [platformDemand,setPlatformDemand]=useState(Object.fromEntries(ROUTES.map(r=>[r.id,r.id==='greenfield'?12:0])));
  const [services,setServices]=useState([makeService(1,'greenfield',1)]);
  const [priorityPlatform,setPriorityPlatform]=useState(1);
  const [served,setServed]=useState(saved?.served??0),[departures,setDepartures]=useState(saved?.departures??0),[lost,setLost]=useState(saved?.lost??0);
  const [satisfaction,setSatisfaction]=useState(saved?.satisfaction??86);
  const [clock,setClock]=useState(0);
  const [message,setMessage]=useState('');
  const [panel,setPanel]=useState(null);
  const [viewport,setViewport]=useState({width:390,height:520});

  const effectiveLevel=devLevel??stationLevel;
  const currentStage=STAGES[effectiveLevel-1];
  const unlockedRoutes=ROUTES.filter(r=>r.unlock<=effectiveLevel);
  const platformsUnlocked=effectiveLevel>=8?3:effectiveLevel>=4?2:1;
  const maxSets=effectiveLevel>=7?3:effectiveLevel>=4?2:1;
  const rush=(clock%75)>=55;

  const cashRef=useRef(cash),levelsRef=useRef(levels),parkingRef=useRef(parkingQ),entranceRef=useRef(entranceQ),ticketRef=useRef(ticketQ),securityRef=useRef(securityQ),waitingRef=useRef(waitingQ),demandRef=useRef(platformDemand),servicesRef=useRef(services),servedRef=useRef(served),departuresRef=useRef(departures),lostRef=useRef(lost),satisfactionRef=useRef(satisfaction),clockRef=useRef(clock),priorityRef=useRef(priorityPlatform);
  useEffect(()=>{cashRef.current=cash;},[cash]);useEffect(()=>{levelsRef.current=levels;},[levels]);useEffect(()=>{parkingRef.current=parkingQ;},[parkingQ]);useEffect(()=>{entranceRef.current=entranceQ;},[entranceQ]);useEffect(()=>{ticketRef.current=ticketQ;},[ticketQ]);useEffect(()=>{securityRef.current=securityQ;},[securityQ]);useEffect(()=>{waitingRef.current=waitingQ;},[waitingQ]);useEffect(()=>{demandRef.current=platformDemand;},[platformDemand]);useEffect(()=>{servicesRef.current=services;},[services]);useEffect(()=>{satisfactionRef.current=satisfaction;},[satisfaction]);useEffect(()=>{clockRef.current=clock;},[clock]);useEffect(()=>{priorityRef.current=priorityPlatform;},[priorityPlatform]);

  useEffect(()=>{
    setServices(prev=>{
      const next=[];
      for(let p=1;p<=platformsUnlocked;p++){
        const existing=prev.find(s=>s.platform===p);
        const defaultRoute=unlockedRoutes[(p-1)%Math.max(1,unlockedRoutes.length)]?.id||'greenfield';
        if(existing&&unlockedRoutes.some(r=>r.id===existing.routeId)) next.push(existing);
        else next.push(makeService(p,defaultRoute,1));
      }
      servicesRef.current=next;
      return next;
    });
    if(priorityPlatform>platformsUnlocked)setPriorityPlatform(1);
  },[platformsUnlocked,effectiveLevel]);

  const camera=useRef(new Animated.ValueXY({x:-395,y:-225})).current,cameraCurrent=useRef({x:-395,y:-225}),panStart=useRef({x:-395,y:-225}),viewportRef=useRef(viewport);
  useEffect(()=>{viewportRef.current=viewport;},[viewport]);
  const clampCamera=(x,y)=>({x:Math.max(-(WORLD_W-viewportRef.current.width),Math.min(0,x)),y:Math.max(-(WORLD_H-viewportRef.current.height),Math.min(0,y))});
  const jumpTo=(wx,wy)=>{const n=clampCamera(viewportRef.current.width/2-wx,viewportRef.current.height/2-wy);cameraCurrent.current=n;Animated.spring(camera,{toValue:n,useNativeDriver:true,tension:70,friction:10}).start();};
  const panResponder=useRef(PanResponder.create({onStartShouldSetPanResponder:()=>false,onMoveShouldSetPanResponder:(_,g)=>Math.abs(g.dx)>5||Math.abs(g.dy)>5,onPanResponderGrant:()=>{panStart.current={...cameraCurrent.current};},onPanResponderMove:(_,g)=>{const n=clampCamera(panStart.current.x+g.dx,panStart.current.y+g.dy);camera.setValue(n);cameraCurrent.current=n;}})).current;

  const addCash=v=>{cashRef.current+=v;setCash(Math.round(cashRef.current));};
  const spend=v=>{if(cashRef.current<v)return false;cashRef.current-=v;setCash(Math.round(cashRef.current));return true;};
  const changeSatisfaction=v=>{satisfactionRef.current=clamp(satisfactionRef.current+v,0,100);setSatisfaction(Math.round(satisfactionRef.current));};

  const parkingCap=cap(48,Math.max(1,levels.parking),36);
  const entranceCap=38+effectiveLevel*12;
  const ticketCap=cap(36,Math.max(1,levels.ticket),25);
  const securityCap=cap(30,Math.max(1,levels.security),21);
  const waitingCap=cap(76,Math.max(1,levels.waiting),50)+Math.max(0,effectiveLevel-3)*35;
  const platformCap=cap(80,Math.max(1,levels.platform),52)*platformsUnlocked;
  const baseTrainCap=90+Math.max(1,levels.train)*65+Math.max(0,effectiveLevel-4)*22;
  const serviceCapacity=s=>baseTrainCap*s.sets;
  const totalPlatform=Object.values(platformDemand).reduce((a,b)=>a+b,0);
  const fullestTrain=services.reduce((m,s)=>Math.max(m,s.onboard/Math.max(1,serviceCapacity(s))),0);

  const pressures=[
    ['PARKING',parkingQ/parkingCap,[170,650]],['ENTRANCE',entranceQ/entranceCap,[330,530]],['TICKETS',ticketQ/ticketCap,[455,520]],['SECURITY',securityQ/securityCap,[575,520]],['WAITING',waitingQ/waitingCap,[720,520]],['PLATFORMS',totalPlatform/platformCap,[760,180]],['TREINEN',fullestTrain,[930,115]],
  ].sort((a,b)=>b[1]-a[1]);
  const bottleneck=pressures[0];

  const totalDevelopment=Object.entries(levels).reduce((sum,[kind,lv])=>sum+(lv||0)+(effectiveLevel>=(FACILITIES[kind]?.unlock||1)?1:0),0);
  const nextNeed=9+stationLevel*5;
  useEffect(()=>{if(devLevel!=null||stationLevel>=MAX_LEVEL)return;if(totalDevelopment>=nextNeed){setStationLevel(v=>Math.min(MAX_LEVEL,v+1));setMessage(`Station Level ${Math.min(MAX_LEVEL,stationLevel+1)} ontgrendeld.`);}},[totalDevelopment,stationLevel,devLevel]);

  const upgrade=kind=>{const spec=FACILITIES[kind];if(!spec||effectiveLevel<spec.unlock)return;const lv=levels[kind]||0;if(lv>=MAX_LEVEL)return;const price=upgradeCost(spec.base,Math.max(1,lv||1));if(!spend(price))return setMessage('Nog niet genoeg geld.');setLevels(prev=>({...prev,[kind]:lv+1}));setMessage(`${spec.title} → Lv ${lv+1}.`);};

  const setServiceSets=(platform,n)=>{
    if(n>maxSets)return;
    setServices(prev=>prev.map(s=>s.platform===platform&&s.phase!=='ready'&&s.phase!=='holding'?{...s,sets:n}:s));
  };
  const waitService=platform=>{
    setServices(prev=>prev.map(s=>s.platform===platform&&s.phase==='ready'?{...s,phase:'holding',hold:5}:s));
    setMessage(`Perron ${platform}: +5s wachten voor extra instappers.`);
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
    const bonus=current.delay<=3?120:current.delay<=8?50:0;
    const payout=Math.max(0,gross-operating+bonus);
    addCash(payout);
    servedRef.current+=current.onboard;departuresRef.current+=1;setServed(servedRef.current);setDepartures(departuresRef.current);
    const strandedPenalty=Math.min(9,stranded*.035)*(alternative?.25:1);
    changeSatisfaction(-strandedPenalty-Math.max(0,current.delay-3)*.18+(current.delay<=3?1.1:0));
    setMessage(`P${platform} ${route.name}: ${current.onboard} mee • ${stranded} wachten • +${current.delay}s • +${money(payout)}`);
    const next=servicesRef.current.map(s=>s.platform===platform?{...s,phase:'away',countdown:4+s.platform,delay:0,hold:0,onboard:0}:s);
    servicesRef.current=next;setServices(next);
  };

  const persist=()=>save({cash:cashRef.current,levels:levelsRef.current,stationLevel,served:servedRef.current,departures:departuresRef.current,lost:lostRef.current,satisfaction:satisfactionRef.current});

  useEffect(()=>{
    if(phase!=='playing')return undefined;
    const id=setInterval(()=>{
      const lv=levelsRef.current;
      let pk=parkingRef.current,e=entranceRef.current,t=ticketRef.current,s=securityRef.current,w=waitingRef.current;
      let demand={...demandRef.current};
      const c=clockRef.current+1;clockRef.current=c;setClock(c);
      const rushNow=(c%75)>=55;
      const inflowBase=rate(5,Math.max(1,lv.parking),2)+Math.floor(effectiveLevel/2);
      const inflow=Math.round(inflowBase*(rushNow?1.85:1));
      const accepted=Math.min(inflow,Math.max(0,parkingCap-pk));const rejected=inflow-accepted;pk+=accepted;
      if(rejected>0){lostRef.current+=rejected;setLost(lostRef.current);changeSatisfaction(-Math.min(1.3,rejected*.045));}
      const fromParking=Math.min(pk,rate(4,Math.max(1,lv.parking),3),Math.max(0,entranceCap-e));pk-=fromParking;e+=fromParking;
      const toTicket=Math.min(e,rate(4,Math.max(1,lv.ticket),3),Math.max(0,ticketCap-t));e-=toTicket;t+=toTicket;
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
          const board=Math.min(match,boardRate,Math.max(0,serviceCapacity(ns)-ns.onboard));
          demand[route.id]=match-board;ns.onboard+=board;
        }
        if(ns.phase==='boarding'){
          ns.countdown=Math.max(0,ns.countdown-1);
          if(ns.countdown<=0){ns.phase='ready';ns.delay=0;setMessage(`P${ns.platform} ${route.name} is vertrek gereed.`);}
        } else if(ns.phase==='holding'){
          ns.hold=Math.max(0,ns.hold-1);ns.delay+=1;if(ns.hold<=0)ns.phase='ready';
        } else if(ns.phase==='ready'){
          ns.delay+=1;
        } else if(ns.phase==='away'){
          ns.countdown=Math.max(0,ns.countdown-1);
          if(ns.countdown<=0){
            const idx=unlockedRoutes.findIndex(r=>r.id===ns.routeId);
            const nextRoute=unlockedRoutes[(Math.max(0,idx)+platformsUnlocked)%Math.max(1,unlockedRoutes.length)]||unlockedRoutes[0]||ROUTES[0];
            ns={...ns,routeId:nextRoute.id,phase:'boarding',countdown:Math.max(12,22-effectiveLevel)+ns.platform*2,delay:0,hold:0,onboard:0};
          }
        }
        return ns;
      });

      // Manager: automatic departures after 3 seconds ready.
      if((lv.manager||0)>0){
        const auto=nextServices.find(x=>x.phase==='ready'&&x.delay>=3);
        if(auto){
          servicesRef.current=nextServices;demandRef.current=demand;setServices(nextServices);setPlatformDemand(demand);
          setTimeout(()=>departService(auto.platform),20);
        }
      }

      const servicePower=(lv.cafe||0)*2+(lv.shop||0)*3+(lv.toilet||0)*2+(lv.restaurant||0)*5+(lv.vip||0)*8;
      if(servicePower>0)addCash(Math.round(servicePower+(w+Object.values(demand).reduce((a,b)=>a+b,0))*.005*servicePower));
      const worstRatio=Math.max(pk/parkingCap,e/entranceCap,t/ticketCap,s/securityCap,w/waitingCap,Object.values(demand).reduce((a,b)=>a+b,0)/platformCap);
      if(worstRatio<.72)changeSatisfaction(.08);else if(worstRatio>.96)changeSatisfaction(-.18);

      parkingRef.current=pk;entranceRef.current=e;ticketRef.current=t;securityRef.current=s;waitingRef.current=w;demandRef.current=demand;servicesRef.current=nextServices;
      setParkingQ(pk);setEntranceQ(e);setTicketQ(t);setSecurityQ(s);setWaitingQ(w);setPlatformDemand(demand);setServices(nextServices);
      if((c%15)===0)persist();
    },TICK);
    return()=>clearInterval(id);
  },[phase,effectiveLevel,parkingCap,entranceCap,ticketCap,securityCap,waitingCap,platformCap,platformsUnlocked]);

  if(phase==='menu')return <SafeAreaView style={styles.screen}><StatusBar barStyle="light-content"/><View style={styles.menu}><Text style={styles.devTag}>MULTI-TRAIN OPERATIONS • V0.25</Text><Text style={styles.logo}>RAIL{`\n`}RUSH HOUR</Text><Text style={styles.menuText}>Vanaf level 4 rijden twee treinen tegelijk en vanaf level 8 drie. Reizigers wachten per bestemming; jij bepaalt per perron vertrek, extra wachttijd, treinlengte en instapprioriteit.</Text><Pressable style={styles.start} onPress={()=>{setPhase('playing');setMessage('Houd meerdere vertrekklokken tegelijk in de gaten.');setTimeout(()=>jumpTo(620,480),60);}}><Text style={styles.startText}>OPEN STATION</Text></Pressable><Text style={styles.safeNote}>DEV REFERENCE • tijdelijke eigen graphics • release register actief</Text></View></SafeAreaView>;

  const occupiedCars=Math.min(32,Math.ceil(parkingQ/Math.max(1,parkingCap)*32));
  const readyCount=services.filter(s=>s.phase==='ready').length;

  return <SafeAreaView style={styles.screen}><StatusBar barStyle="light-content"/>
    <View style={styles.topHud}><View><Text style={styles.hudSmall}>STATION</Text><Text style={styles.hudBig}>Lv {effectiveLevel} • {currentStage[0]}</Text></View><View><Text style={styles.hudSmall}>CASH</Text><Text style={styles.cash}>{money(cash)}</Text></View><Pressable onPress={()=>jumpTo(...bottleneck[2])}><Text style={styles.hudSmall}>KNELPUNT</Text><Text style={styles.warning}>{bottleneck[0]} {Math.round(bottleneck[1]*100)}%</Text></Pressable><View><Text style={styles.hudSmall}>TEVREDENHEID</Text><Text style={[styles.satisfaction,satisfaction<60&&styles.satisfactionBad]}>{satisfaction}%</Text></View></View>
    <View style={[styles.rushBar,rush&&styles.rushBarOn]}><Text style={styles.rushText}>{rush?'⚡ RUSH HOUR • INSTROOM +85%':`${platformsUnlocked} PERRON${platformsUnlocked>1?'S':''} • ${services.length} ACTIEVE TREIN${services.length>1?'EN':''}`}</Text><View style={styles.devControls}><Pressable style={styles.devBtn} onPress={()=>setDevLevel(v=>Math.max(1,(v??stationLevel)-1))}><Text style={styles.devBtnText}>−</Text></Pressable><Pressable style={styles.devBtnWide} onPress={()=>setDevLevel(null)}><Text style={styles.devBtnText}>LIVE</Text></Pressable><Pressable style={styles.devBtn} onPress={()=>setDevLevel(v=>Math.min(10,(v??stationLevel)+1))}><Text style={styles.devBtnText}>+</Text></Pressable></View></View>
    <View style={styles.serviceDeck}><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.serviceRail}>{services.map(s=><ServiceCard key={s.platform} service={s} capacity={serviceCapacity(s)} waiting={platformDemand[s.routeId]||0} priority={priorityPlatform===s.platform} onPriority={()=>setPriorityPlatform(s.platform)} onWait={()=>waitService(s.platform)} onDepart={()=>departService(s.platform)}/>)}</ScrollView></View>

    <View style={styles.viewport} onLayout={e=>setViewport({width:e.nativeEvent.layout.width,height:e.nativeEvent.layout.height})} {...panResponder.panHandlers}>
      <Animated.View style={[styles.world,{transform:[{translateX:camera.x},{translateY:camera.y}]}]}><View style={styles.grass}/><View style={styles.road}><View style={styles.roadDash}/></View><View style={styles.plaza}/>
        <View style={[styles.parking,bottleneck[0]==='PARKING'&&styles.zoneHot]}><Text style={styles.zoneTitle}>PARKING • Lv {levels.parking}</Text><Text style={styles.zoneSub}>{parkingQ}/{parkingCap}</Text>{Array.from({length:32}).map((_,i)=>i<occupiedCars?<Car key={i} i={i}/>:<View key={i} style={[styles.emptySpace,{left:12+(i%8)*25,top:36+Math.floor(i/8)*23}]}/>)}</View><View style={styles.walkway}><Text style={styles.walkArrow}>→ → →</Text></View>
        <View style={styles.station}><View style={styles.roof}><Text style={styles.stationName}>CENTRAL VALLEY</Text><Text style={styles.stationMeta}>{currentStage[1]}</Text></View><View style={[styles.entrance,bottleneck[0]==='ENTRANCE'&&styles.zoneHot]}><Text style={styles.zoneTitle}>ENTRANCE</Text><Text style={styles.zoneSub}>{entranceQ}/{entranceCap}</Text><People count={entranceQ}/></View><View style={[styles.room,styles.ticket,bottleneck[0]==='TICKETS'&&styles.zoneHot]}><Text style={styles.zoneTitle}>TICKETS</Text><Text style={styles.zoneSub}>{ticketQ}/{ticketCap}</Text><People count={ticketQ} color="#c99345"/><View style={styles.machineRow}>{Array.from({length:Math.min(5,1+levels.ticket)}).map((_,i)=><View key={i} style={styles.machine}/>)}</View></View><View style={[styles.room,styles.security,bottleneck[0]==='SECURITY'&&styles.zoneHot]}><Text style={styles.zoneTitle}>SECURITY</Text><Text style={styles.zoneSub}>{securityQ}/{securityCap}</Text><People count={securityQ} color="#bd6756"/><View style={styles.machineRow}>{Array.from({length:Math.min(5,1+levels.security)}).map((_,i)=><View key={i} style={styles.detector}/>)}</View></View><View style={[styles.room,styles.waiting,bottleneck[0]==='WAITING'&&styles.zoneHot]}><Text style={styles.zoneTitle}>WAITING HALL</Text><Text style={styles.zoneSub}>{waitingQ}/{waitingCap}</Text><People count={waitingQ} max={28}/><View style={styles.seatRow}>{Array.from({length:Math.min(16,4+levels.waiting*2)}).map((_,i)=><View key={i} style={styles.seat}/>)}</View></View><View style={styles.services}><Text style={styles.servicesTitle}>SERVICES</Text><Text style={styles.servicesText}>☕{levels.cafe}  🛍️{levels.shop}  🚻{levels.toilet}{`\n`}🍽️{levels.restaurant}  ⭐{levels.vip}  🤖{levels.manager}</Text></View></View>

        {[1,2,3].map(n=>{const unlocked=n<=platformsUnlocked;const service=services.find(s=>s.platform===n);const route=service?routeById(service.routeId):ROUTES[0];const top=260-(n-1)*80;return <View key={n} style={[styles.platform,{top,opacity:unlocked?1:.25},bottleneck[0]==='PLATFORMS'&&unlocked&&styles.zoneHot]}><View style={styles.yellowLine}/><Text style={styles.platformTitle}>{unlocked?`PLATFORM ${n} • ${route.name}`:`PLATFORM ${n} LOCKED`}</Text><Text style={styles.platformInfo}>{unlocked?`${platformDemand[route.id]||0} voor deze bestemming`:`Station Lv ${n===2?4:8}`}</Text>{unlocked?<People count={platformDemand[route.id]||0} max={22} color={route.color}/>:null}</View>;})}
        {[1,2,3].map(n=>{const top=190-(n-1)*80;return <View key={`track-${n}`} style={[styles.track,{top,opacity:n<=platformsUnlocked?1:.2}]}>{Array.from({length:23}).map((_,i)=><View key={i} style={[styles.sleeper,{left:i*42}]}/>)}<View style={[styles.rail,{top:18}]}/><View style={[styles.rail,{top:48}]}/></View>;})}
        {services.map(s=><TrainVisual key={`train-${s.platform}`} service={s} capacity={serviceCapacity(s)} hot={bottleneck[0]==='TREINEN'}/>) }

        <FacilityBubble x={95} y={690} kind="parking" level={levels.parking} stationLevel={effectiveLevel} cash={cash} onUpgrade={upgrade} hot={bottleneck[0]==='PARKING'}/><FacilityBubble x={420} y={585} kind="ticket" level={levels.ticket} stationLevel={effectiveLevel} cash={cash} onUpgrade={upgrade} hot={bottleneck[0]==='TICKETS'}/><FacilityBubble x={545} y={585} kind="security" level={levels.security} stationLevel={effectiveLevel} cash={cash} onUpgrade={upgrade} hot={bottleneck[0]==='SECURITY'}/><FacilityBubble x={680} y={585} kind="waiting" level={levels.waiting} stationLevel={effectiveLevel} cash={cash} onUpgrade={upgrade} hot={bottleneck[0]==='WAITING'}/><FacilityBubble x={790} y={300} kind="platform" level={levels.platform} stationLevel={effectiveLevel} cash={cash} onUpgrade={upgrade} hot={bottleneck[0]==='PLATFORMS'}/><FacilityBubble x={955} y={70} kind="train" level={levels.train} stationLevel={effectiveLevel} cash={cash} onUpgrade={upgrade} hot={bottleneck[0]==='TREINEN'}/><FacilityBubble x={820} y={590} kind="cafe" level={levels.cafe} stationLevel={effectiveLevel} cash={cash} onUpgrade={upgrade}/><FacilityBubble x={925} y={590} kind="shop" level={levels.shop} stationLevel={effectiveLevel} cash={cash} onUpgrade={upgrade}/><FacilityBubble x={1030} y={590} kind="toilet" level={levels.toilet} stationLevel={effectiveLevel} cash={cash} onUpgrade={upgrade}/><FacilityBubble x={1080} y={470} kind="restaurant" level={levels.restaurant} stationLevel={effectiveLevel} cash={cash} onUpgrade={upgrade}/><FacilityBubble x={1080} y={355} kind="vip" level={levels.vip} stationLevel={effectiveLevel} cash={cash} onUpgrade={upgrade}/><FacilityBubble x={1120} y={240} kind="manager" level={levels.manager} stationLevel={effectiveLevel} cash={cash} onUpgrade={upgrade}/>
      </Animated.View>
      <View style={styles.leftMenu}><SideButton icon="🚦" label="Operate" onPress={()=>setPanel('operate')} badge={readyCount?String(readyCount):null}/><SideButton icon="📍" label="Routes" onPress={()=>setPanel('routes')}/><SideButton icon="📊" label="Flow" onPress={()=>setPanel('flow')}/><SideButton icon="🏗️" label="Levels" onPress={()=>setPanel('levels')}/></View><View style={styles.zoomButtons}><Pressable style={styles.zoomBtn} onPress={()=>jumpTo(620,480)}><Text>⌂</Text></Pressable><Pressable style={styles.zoomBtn} onPress={()=>jumpTo(...bottleneck[2])}><Text>⚠️</Text></Pressable><Pressable style={styles.zoomBtn} onPress={()=>jumpTo(760,160)}><Text>🚆</Text></Pressable></View><View style={styles.message}><Text style={styles.messageText}>{message}</Text></View>

      {panel==='operate'?<Panel title="MULTI-TRAIN OPERATIONS" onClose={()=>setPanel(null)}><Text style={styles.panelLead}>★ Instapprioriteit geeft dat perron ongeveer 45% meer boardingcapaciteit.</Text>{services.map(s=>{const r=routeById(s.routeId);return <View key={s.platform} style={styles.opsRow}><View style={{flex:1}}><Text style={styles.listTitle}>P{s.platform} • {r.name}</Text><Text style={styles.listSub}>{s.onboard}/{serviceCapacity(s)} • {platformDemand[s.routeId]||0} wachten • {s.phase} {s.delay?`+${s.delay}s`:''}</Text></View><Pressable onPress={()=>setPriorityPlatform(s.platform)} style={[styles.smallAction,priorityPlatform===s.platform&&styles.smallActionOn]}><Text style={styles.smallActionText}>★</Text></Pressable>{[1,2,3].map(n=><Pressable key={n} disabled={n>maxSets||s.phase==='ready'||s.phase==='holding'} onPress={()=>setServiceSets(s.platform,n)} style={[styles.setMini,s.sets===n&&styles.setMiniOn,n>maxSets&&styles.setMiniLocked]}><Text style={styles.setMiniText}>{n}</Text></Pressable>)}</View>})}</Panel>:null}
      {panel==='routes'?<Panel title="ROUTE DEMAND" onClose={()=>setPanel(null)}>{ROUTES.map(r=><View key={r.id} style={[styles.listRow,effectiveLevel<r.unlock&&styles.lockedRow]}><Text style={styles.listTitle}>{r.name}</Text><Text style={styles.listSub}>{effectiveLevel<r.unlock?`unlock Lv ${r.unlock}`:`${platformDemand[r.id]||0} wachtend • ${money(r.fare)} p.p.`}</Text></View>)}</Panel>:null}
      {panel==='flow'?<Panel title="PASSENGER FLOW" onClose={()=>setPanel(null)}>{pressures.map(p=><View key={p[0]} style={styles.flowRow}><Text style={styles.listTitle}>{p[0]}</Text><View style={styles.flowTrack}><View style={[styles.flowFill,{width:`${Math.min(100,Math.round(p[1]*100))}%`},p[1]>.9&&styles.flowFillHot]}/></View><Text style={styles.flowPct}>{Math.round(p[1]*100)}%</Text></View>)}<Text style={styles.panelLead}>Verloren reizigers: {lost}</Text></Panel>:null}
      {panel==='levels'?<Panel title="STATION LEVELS" onClose={()=>setPanel(null)}><ScrollView>{STAGES.map((s,i)=><Pressable key={i} onPress={()=>setDevLevel(i+1)} style={[styles.listRow,effectiveLevel===i+1&&styles.listRowActive]}><Text style={styles.listTitle}>LEVEL {i+1} • {s[0]}</Text><Text style={styles.listSub}>{s[1]}</Text></Pressable>)}</ScrollView></Panel>:null}
    </View>
    <View style={styles.bottomStats}><Text style={styles.stat}>🚉 {platformsUnlocked}</Text><Text style={styles.stat}>🚆 {services.length}</Text><Text style={styles.stat}>👥 {served}</Text><Text style={styles.stat}>❌ {lost}</Text><Text style={styles.stat}>🙂 {satisfaction}%</Text></View>
  </SafeAreaView>;
}

const styles=StyleSheet.create({
  screen:{flex:1,backgroundColor:'#162631'},menu:{flex:1,backgroundColor:'#123043',alignItems:'center',justifyContent:'center',padding:28},devTag:{color:'#8bd6ff',fontSize:9,fontWeight:'900',letterSpacing:2,marginBottom:12},logo:{color:'#fff',fontSize:48,lineHeight:44,fontWeight:'900',textAlign:'center'},menuText:{color:'#b8cfda',fontSize:13,lineHeight:20,textAlign:'center',maxWidth:390,marginTop:18,marginBottom:24},start:{backgroundColor:'#f5c85c',paddingVertical:16,paddingHorizontal:44,borderRadius:14,borderWidth:1,borderColor:'#ffe6a2'},startText:{color:'#17303c',fontWeight:'900',fontSize:14},safeNote:{color:'#6d94a5',fontSize:6.5,fontWeight:'800',marginTop:15},
  topHud:{height:58,backgroundColor:'#163447',flexDirection:'row',alignItems:'center',justifyContent:'space-around',borderBottomWidth:2,borderBottomColor:'#244e63'},hudSmall:{color:'#7ea3b5',fontSize:5.5,fontWeight:'900',textAlign:'center'},hudBig:{color:'#fff',fontSize:8.5,fontWeight:'900',textAlign:'center'},cash:{color:'#7ee397',fontSize:12,fontWeight:'900'},warning:{color:'#ffc968',fontSize:7,fontWeight:'900',textAlign:'center'},satisfaction:{color:'#75df95',fontSize:10,fontWeight:'900',textAlign:'center'},satisfactionBad:{color:'#ee7767'},
  rushBar:{minHeight:34,backgroundColor:'#102c3b',flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:8,borderBottomWidth:1,borderBottomColor:'#285166'},rushBarOn:{backgroundColor:'#5a321e'},rushText:{color:'#b8d2dd',fontSize:6.5,fontWeight:'900'},devControls:{flexDirection:'row',gap:3},devBtn:{width:28,height:24,borderRadius:6,backgroundColor:'#31566a',alignItems:'center',justifyContent:'center'},devBtnWide:{width:40,height:24,borderRadius:6,backgroundColor:'#31566a',alignItems:'center',justifyContent:'center'},devBtnText:{color:'#e4f0f4',fontSize:7,fontWeight:'900'},
  serviceDeck:{height:88,backgroundColor:'#0d202a',borderBottomWidth:1,borderBottomColor:'#2c4b59'},serviceRail:{padding:6,gap:6},serviceCard:{width:164,height:75,backgroundColor:'#eef0e8',borderRadius:9,borderWidth:2,padding:6},serviceCardReady:{backgroundColor:'#fff5d2'},serviceCardPriority:{borderWidth:4},serviceTop:{flexDirection:'row',alignItems:'center',gap:5},servicePlatform:{color:'#2f4b57',fontSize:8,fontWeight:'900'},serviceRoute:{color:'#2f4b57',fontSize:7,fontWeight:'900',flex:1},priorityDot:{width:22,height:22,borderRadius:11,backgroundColor:'#c9c8bd',alignItems:'center',justifyContent:'center'},priorityDotOn:{backgroundColor:'#f2c85a'},priorityDotText:{color:'#fff',fontSize:10,fontWeight:'900'},serviceLoad:{color:'#64777e',fontSize:5.4,fontWeight:'800',marginTop:2},serviceState:{color:'#4d6974',fontSize:7,fontWeight:'900',marginTop:2},serviceStateReady:{color:'#c17626'},serviceActions:{position:'absolute',right:5,bottom:5,flexDirection:'row',gap:4},serviceWait:{backgroundColor:'#d5a24b',paddingHorizontal:7,paddingVertical:4,borderRadius:5},serviceDepart:{backgroundColor:'#4fb775',paddingHorizontal:7,paddingVertical:4,borderRadius:5},serviceActionText:{color:'#fff',fontSize:5,fontWeight:'900'},
  viewport:{flex:1,overflow:'hidden',backgroundColor:'#a8d27f',position:'relative'},world:{position:'absolute',width:WORLD_W,height:WORLD_H},grass:{position:'absolute',inset:0,backgroundColor:'#a8d27f'},road:{position:'absolute',left:-40,top:675,width:500,height:110,backgroundColor:'#687477',transform:[{rotateZ:'-12deg'}],borderRadius:15},roadDash:{position:'absolute',left:15,right:15,top:53,borderTopWidth:3,borderTopColor:'#e7e3d3',borderStyle:'dashed'},plaza:{position:'absolute',left:250,top:555,width:850,height:190,backgroundColor:'#d2cbb9',borderWidth:3,borderColor:'#e8e1d2',borderRadius:18},
  parking:{position:'absolute',left:35,top:585,width:270,height:185,backgroundColor:'#788789',borderWidth:3,borderColor:'#cfd8d7',borderRadius:14,padding:9},zoneHot:{borderColor:'#e76d59',borderWidth:4},zoneTitle:{color:'#314a55',fontSize:6.8,fontWeight:'900'},zoneSub:{color:'#74878e',fontSize:5.3,fontWeight:'800',marginTop:2},car:{position:'absolute',width:17,height:9,borderRadius:3,borderWidth:1,borderColor:'#f2f4f2'},emptySpace:{position:'absolute',width:19,height:12,borderWidth:1,borderColor:'#cbd3d1',opacity:.42},walkway:{position:'absolute',left:300,top:630,width:90,height:42,backgroundColor:'#c9c5b9',borderRadius:6,alignItems:'center',justifyContent:'center'},walkArrow:{color:'#71838a',fontSize:15,fontWeight:'900'},
  station:{position:'absolute',left:390,top:415,width:690,height:300,backgroundColor:'#eee9da',borderRadius:14,borderWidth:4,borderColor:'#476677'},roof:{position:'absolute',left:0,right:0,top:0,height:55,backgroundColor:'#365d70',borderTopLeftRadius:10,borderTopRightRadius:10,paddingHorizontal:12,paddingTop:9},stationName:{color:'#fff',fontSize:12,fontWeight:'900'},stationMeta:{color:'#abc8d4',fontSize:5.4,fontWeight:'800',marginTop:2},entrance:{position:'absolute',left:-92,top:118,width:92,height:118,backgroundColor:'#d6e0e2',borderWidth:3,borderColor:'#5e7d89',borderRadius:9,padding:6},room:{position:'absolute',top:72,height:195,backgroundColor:'#f5f0e2',borderWidth:2,borderColor:'#a7aa9d',borderRadius:8,padding:6},ticket:{left:18,width:120},security:{left:147,width:120},waiting:{left:276,width:190},services:{position:'absolute',left:475,top:72,width:195,height:195,backgroundColor:'#e7ddcc',borderWidth:2,borderColor:'#b7a887',borderRadius:8,padding:8},servicesTitle:{color:'#624f3f',fontSize:6.5,fontWeight:'900'},servicesText:{color:'#7f6956',fontSize:10,fontWeight:'900',marginTop:15,lineHeight:24},
  people:{flexDirection:'row',flexWrap:'wrap',gap:3,marginTop:6,alignContent:'flex-start'},person:{width:7,height:13,alignItems:'center'},head:{width:4,height:4,borderRadius:3,backgroundColor:'#efc49a'},body:{width:5,height:7,borderRadius:1,marginTop:1},machineRow:{position:'absolute',left:7,right:7,bottom:8,flexDirection:'row',gap:4},machine:{width:20,height:34,backgroundColor:'#bd8e49',borderRadius:3},detector:{width:20,height:41,borderWidth:4,borderBottomWidth:8,borderColor:'#69787d',borderRadius:4},seatRow:{position:'absolute',left:8,right:8,bottom:10,flexDirection:'row',flexWrap:'wrap',gap:4},seat:{width:28,height:9,backgroundColor:'#8b6549',borderRadius:3},
  platform:{position:'absolute',left:440,width:620,height:68,backgroundColor:'#c9c5b9',borderRadius:8,borderWidth:3,borderColor:'#ebe7db',padding:7,zIndex:6},yellowLine:{position:'absolute',left:8,right:8,top:5,height:5,backgroundColor:'#e2c450',borderRadius:3},platformTitle:{color:'#344c55',fontSize:6.8,fontWeight:'900',marginTop:8},platformInfo:{color:'#6d7e84',fontSize:5.1,fontWeight:'800'},track:{position:'absolute',left:380,width:830,height:62,backgroundColor:'#686e70',transform:[{rotateZ:'-2deg'}],borderRadius:5},sleeper:{position:'absolute',top:9,width:7,height:43,backgroundColor:'#614937'},rail:{position:'absolute',left:5,right:5,height:3,backgroundColor:'#d7dde0'},
  trainArea:{position:'absolute',left:500,width:610,height:75,zIndex:20},trainShadow:{position:'absolute',left:0,top:35,width:405,height:20,backgroundColor:'rgba(18,31,36,.2)',borderRadius:14},train:{position:'absolute',left:0,top:9,width:410,height:39,backgroundColor:'#e9f0f1',borderRadius:9,borderWidth:3,borderColor:'#5c7b88'},trainHot:{borderColor:'#e76d59'},trainFront:{position:'absolute',left:0,top:0,bottom:0,width:28,borderTopLeftRadius:6,borderBottomLeftRadius:6},trainRoof:{position:'absolute',left:44,right:35,top:2,height:4,backgroundColor:'#bdc9ce'},windows:{position:'absolute',left:47,right:70,top:9,flexDirection:'row',justifyContent:'space-between'},window:{width:27,height:9,backgroundColor:'#31586a',borderRadius:2},trainDoor:{position:'absolute',right:28,top:10,width:17,height:23,backgroundColor:'#c2d5dc'},wheels:{position:'absolute',left:65,right:55,bottom:-7,flexDirection:'row',justifyContent:'space-between'},wheel:{width:12,height:12,borderRadius:8,backgroundColor:'#28373d'},trainInfo:{position:'absolute',left:420,top:0,width:132,backgroundColor:'rgba(13,34,43,.96)',borderRadius:8,borderWidth:1,borderColor:'#496976',padding:6},trainRoute:{color:'#fff',fontSize:7.2,fontWeight:'900'},trainLoad:{color:'#acc1ca',fontSize:5.5,marginTop:2,fontWeight:'800'},loadTrack:{height:4,backgroundColor:'#243d47',borderRadius:3,overflow:'hidden',marginTop:3},loadFill:{height:'100%'},trainState:{color:'#f2cb67',fontSize:5.2,fontWeight:'900',marginTop:3},
  bubble:{position:'absolute',width:98,backgroundColor:'rgba(23,48,59,.95)',borderRadius:9,borderWidth:1,borderColor:'#567481',padding:6,alignItems:'center',zIndex:30},bubbleHot:{borderColor:'#f2cb63',borderWidth:2},bubbleLocked:{opacity:.62},bubbleTitle:{color:'#dce9ed',fontSize:5.8,fontWeight:'900'},bubbleLevel:{color:'#8fa7b0',fontSize:5,marginTop:1},plus:{width:24,height:24,borderRadius:13,backgroundColor:'#50636b',alignItems:'center',justifyContent:'center',marginTop:3},plusReady:{backgroundColor:'#54bb78'},plusText:{color:'#fff',fontSize:16,lineHeight:18,fontWeight:'900'},lockCircle:{width:24,height:24,borderRadius:13,backgroundColor:'#555f63',alignItems:'center',justifyContent:'center',marginTop:3},lockText:{fontSize:10},bubblePrice:{color:'#798e96',fontSize:5,fontWeight:'900',marginTop:2},bubblePriceReady:{color:'#f2cb63'},
  leftMenu:{position:'absolute',left:6,top:8,gap:5},sideButton:{width:58,minHeight:50,backgroundColor:'rgba(20,50,64,.95)',borderRadius:9,borderWidth:1,borderColor:'#477082',alignItems:'center',justifyContent:'center',position:'relative'},sideIcon:{fontSize:15},sideLabel:{color:'#d3e3e9',fontSize:5,fontWeight:'900'},badge:{position:'absolute',right:-3,top:-3,width:17,height:17,borderRadius:9,backgroundColor:'#e05d51',alignItems:'center',justifyContent:'center'},badgeText:{color:'#fff',fontSize:8,fontWeight:'900'},zoomButtons:{position:'absolute',right:7,top:8,gap:5},zoomBtn:{width:38,height:38,borderRadius:9,backgroundColor:'rgba(20,50,64,.95)',borderWidth:1,borderColor:'#477082',alignItems:'center',justifyContent:'center'},message:{position:'absolute',left:70,right:55,bottom:8,minHeight:38,backgroundColor:'rgba(17,42,53,.94)',borderRadius:8,borderWidth:1,borderColor:'#456675',justifyContent:'center',paddingHorizontal:9},messageText:{color:'#cadbe1',fontSize:6.5,fontWeight:'800'},
  panel:{position:'absolute',left:72,right:54,top:55,maxHeight:375,backgroundColor:'#f1eee3',borderRadius:12,borderWidth:3,borderColor:'#3f6474',padding:10,zIndex:200},panelTop:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:8},panelTitle:{color:'#294653',fontSize:12,fontWeight:'900'},close:{color:'#5d6f77',fontSize:15,fontWeight:'900'},panelLead:{color:'#3b5964',fontSize:7,fontWeight:'900',marginVertical:7},listRow:{paddingVertical:9,paddingHorizontal:8,borderBottomWidth:1,borderBottomColor:'#ccc7b9'},listRowActive:{backgroundColor:'#fff5c9'},lockedRow:{opacity:.42},listTitle:{color:'#344e58',fontSize:7.2,fontWeight:'900'},listSub:{color:'#7a898e',fontSize:5.8,marginTop:3},flowRow:{flexDirection:'row',alignItems:'center',gap:6,paddingVertical:6},flowTrack:{flex:1,height:7,backgroundColor:'#d4d0c4',borderRadius:4,overflow:'hidden'},flowFill:{height:'100%',backgroundColor:'#5bb6dd'},flowFillHot:{backgroundColor:'#e66f5a'},flowPct:{width:32,color:'#586970',fontSize:6,fontWeight:'900',textAlign:'right'},opsRow:{flexDirection:'row',alignItems:'center',gap:4,paddingVertical:7,borderBottomWidth:1,borderBottomColor:'#cbc7ba'},smallAction:{width:26,height:26,borderRadius:6,backgroundColor:'#b9b7ad',alignItems:'center',justifyContent:'center'},smallActionOn:{backgroundColor:'#efc658'},smallActionText:{color:'#fff',fontSize:10,fontWeight:'900'},setMini:{width:25,height:25,borderRadius:6,backgroundColor:'#d7d3c7',alignItems:'center',justifyContent:'center'},setMiniOn:{backgroundColor:'#bfe6ca'},setMiniLocked:{opacity:.35},setMiniText:{color:'#39535e',fontSize:7,fontWeight:'900'},
  bottomStats:{height:31,backgroundColor:'#122c39',flexDirection:'row',alignItems:'center',justifyContent:'space-around',borderTopWidth:1,borderTopColor:'#315264'},stat:{color:'#9db5bf',fontSize:5.4,fontWeight:'800'},
});