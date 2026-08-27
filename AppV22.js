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

// V0.22 — LEVEL ONE REFERENCE BUILD
// Original implementation inspired by publicly described idle railway tycoon conventions.
// No third-party code, art, audio, logos or copied asset files are included.
// See RELEASE_SAFETY.md before any public store release.

const SAVE_KEY = 'rail-rush-hour-v022';
const WORLD_W = 1180;
const WORLD_H = 820;
const TICK = 1000;

const money = (v) => `€${Math.max(0, Math.round(v)).toLocaleString('nl-NL')}`;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const cost = (base, level, g = 1.54) => Math.round(base * Math.pow(g, Math.max(0, level - 1)));
const cap = (base, level, step) => base + (level - 1) * step;
const rate = (base, level, step) => base + (level - 1) * step;

const ROUTES = [
  { id: 'greenfield', name: 'Greenfield', color: '#63c77e', fare: 6 },
  { id: 'lakeside', name: 'Lakeside', color: '#5ba7e8', fare: 9 },
  { id: 'airport', name: 'Airport', color: '#b884e8', fare: 14 },
];

const TASKS = [
  { id: 'ticket', title: 'Upgrade Ticket Office naar Lv 2', reward: 240 },
  { id: 'security', title: 'Upgrade Security naar Lv 2', reward: 320 },
  { id: 'serve', title: 'Vervoer 80 reizigers', reward: 450 },
  { id: 'cafe', title: 'Open het Café', reward: 600 },
  { id: 'train', title: 'Upgrade de trein naar Lv 2', reward: 850 },
];

function load() {
  try {
    if (!globalThis?.localStorage) return null;
    const raw = globalThis.localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function save(data) {
  try {
    if (globalThis?.localStorage) globalThis.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {}
}

function People({ count, color = '#5d8191', max = 20 }) {
  const shown = Math.min(max, Math.ceil(count / 3));
  return (
    <View style={styles.people}>
      {Array.from({ length: shown }).map((_, i) => (
        <View key={i} style={styles.person}>
          <View style={styles.head} />
          <View style={[styles.body, { backgroundColor: i % 3 === 0 ? color : i % 3 === 1 ? '#936f5e' : '#756e95' }]} />
        </View>
      ))}
    </View>
  );
}

function UpgradeBubble({ x, y, title, level, price, cash, onPress, locked, ready }) {
  return (
    <View style={[styles.upgradeBubble, { left: x, top: y }, ready && styles.upgradeBubbleReady]}>
      <Text style={styles.bubbleTitle}>{title}</Text>
      <Text style={styles.bubbleLevel}>{locked ? 'LOCKED' : `Lv ${level}`}</Text>
      <Pressable disabled={locked || cash < price} onPress={onPress} style={[styles.plus, cash >= price && !locked && styles.plusReady, locked && styles.plusLocked]}>
        <Text style={styles.plusText}>{locked ? '🔒' : '+'}</Text>
      </Pressable>
      {!locked ? <Text style={[styles.bubblePrice, cash >= price && styles.bubblePriceReady]}>{money(price)}</Text> : null}
    </View>
  );
}

function SideButton({ icon, label, onPress, badge }) {
  return (
    <Pressable style={styles.sideButton} onPress={onPress}>
      <Text style={styles.sideIcon}>{icon}</Text>
      <Text style={styles.sideLabel}>{label}</Text>
      {badge ? <View style={styles.badge}><Text style={styles.badgeText}>{badge}</Text></View> : null}
    </Pressable>
  );
}

function Panel({ title, onClose, children }) {
  return (
    <View style={styles.panel}>
      <View style={styles.panelTop}><Text style={styles.panelTitle}>{title}</Text><Pressable onPress={onClose}><Text style={styles.close}>✕</Text></Pressable></View>
      {children}
    </View>
  );
}

function Train({ level, onboard, capacity, route, phase, countdown }) {
  return (
    <View style={styles.trainArea}>
      <View style={styles.trainShadow} />
      <View style={[styles.train, phase === 'boarding' && styles.trainBoarding]}>
        <View style={[styles.trainFront, { backgroundColor: route.color }]} />
        <View style={styles.trainRoof} />
        <View style={styles.windows}>{Array.from({ length: 7 }).map((_, i) => <View key={i} style={styles.window} />)}</View>
        <View style={styles.trainDoor} />
        <View style={styles.trainStripe} />
        <View style={styles.wheels}><View style={styles.wheel}/><View style={styles.wheel}/><View style={styles.wheel}/><View style={styles.wheel}/></View>
      </View>
      <View style={styles.trainInfo}>
        <Text style={styles.trainRoute}>{route.name}</Text>
        <Text style={styles.trainLoad}>{onboard}/{capacity} • Train Lv {level}</Text>
        <View style={styles.loadTrack}><View style={[styles.loadFill,{width:`${Math.round(clamp(onboard/capacity,0,1)*100)}%`,backgroundColor:route.color}]} /></View>
        <Text style={styles.trainTimer}>{phase === 'away' ? 'Trein onderweg…' : `Vertrek over ${countdown}s`}</Text>
      </View>
    </View>
  );
}

export default function AppV22() {
  const saved = useRef(load()).current;
  const [phase, setPhase] = useState('menu');
  const [cash, setCash] = useState(saved?.cash ?? 520);
  const [gems] = useState(saved?.gems ?? 12);
  const [ticketLevel, setTicketLevel] = useState(saved?.ticketLevel ?? 1);
  const [securityLevel, setSecurityLevel] = useState(saved?.securityLevel ?? 1);
  const [waitingLevel, setWaitingLevel] = useState(saved?.waitingLevel ?? 1);
  const [platformLevel, setPlatformLevel] = useState(saved?.platformLevel ?? 1);
  const [trainLevel, setTrainLevel] = useState(saved?.trainLevel ?? 1);
  const [cafeLevel, setCafeLevel] = useState(saved?.cafeLevel ?? 0);
  const [entranceQ, setEntranceQ] = useState(12);
  const [ticketQ, setTicketQ] = useState(5);
  const [securityQ, setSecurityQ] = useState(2);
  const [waitingQ, setWaitingQ] = useState(8);
  const [platformQ, setPlatformQ] = useState(14);
  const [onboard, setOnboard] = useState(0);
  const [served, setServed] = useState(saved?.served ?? 0);
  const [departures, setDepartures] = useState(saved?.departures ?? 0);
  const [taskIndex, setTaskIndex] = useState(saved?.taskIndex ?? 0);
  const [panel, setPanel] = useState(null);
  const [routeIndex, setRouteIndex] = useState(0);
  const [trainPhase, setTrainPhase] = useState('boarding');
  const [departureCountdown, setDepartureCountdown] = useState(24);
  const [message, setMessage] = useState('');
  const [viewport, setViewport] = useState({ width:390, height:520 });

  const cashRef = useRef(cash);
  const entranceRef = useRef(entranceQ);
  const ticketRef = useRef(ticketQ);
  const securityRef = useRef(securityQ);
  const waitingRef = useRef(waitingQ);
  const platformRef = useRef(platformQ);
  const onboardRef = useRef(onboard);
  const servedRef = useRef(served);
  const departuresRef = useRef(departures);
  const trainPhaseRef = useRef(trainPhase);
  const countdownRef = useRef(departureCountdown);

  useEffect(()=>{cashRef.current=cash;},[cash]);
  useEffect(()=>{entranceRef.current=entranceQ;},[entranceQ]);
  useEffect(()=>{ticketRef.current=ticketQ;},[ticketQ]);
  useEffect(()=>{securityRef.current=securityQ;},[securityQ]);
  useEffect(()=>{waitingRef.current=waitingQ;},[waitingQ]);
  useEffect(()=>{platformRef.current=platformQ;},[platformQ]);
  useEffect(()=>{onboardRef.current=onboard;},[onboard]);
  useEffect(()=>{trainPhaseRef.current=trainPhase;},[trainPhase]);
  useEffect(()=>{countdownRef.current=departureCountdown;},[departureCountdown]);

  const camera = useRef(new Animated.ValueXY({x:-300,y:-180})).current;
  const cameraCurrent = useRef({x:-300,y:-180});
  const panStart = useRef({x:-300,y:-180});
  const viewportRef = useRef(viewport);
  useEffect(()=>{viewportRef.current=viewport;},[viewport]);
  const clampCamera=(x,y)=>({x:Math.max(-(WORLD_W-viewportRef.current.width),Math.min(0,x)),y:Math.max(-(WORLD_H-viewportRef.current.height),Math.min(0,y))});
  const jumpTo=(wx,wy)=>{const n=clampCamera(viewportRef.current.width/2-wx,viewportRef.current.height/2-wy);cameraCurrent.current=n;Animated.spring(camera,{toValue:n,useNativeDriver:true,tension:70,friction:10}).start();};
  const panResponder=useRef(PanResponder.create({onStartShouldSetPanResponder:()=>false,onMoveShouldSetPanResponder:(_,g)=>Math.abs(g.dx)>5||Math.abs(g.dy)>5,onPanResponderGrant:()=>{panStart.current={...cameraCurrent.current};},onPanResponderMove:(_,g)=>{const n=clampCamera(panStart.current.x+g.dx,panStart.current.y+g.dy);camera.setValue(n);cameraCurrent.current=n;}})).current;

  const route = ROUTES[Math.min(routeIndex, ROUTES.length-1)];
  const trainCapacity = 110 + trainLevel * 80;
  const ticketCap = cap(34,ticketLevel,24);
  const securityCap = cap(28,securityLevel,20);
  const waitingCap = cap(72,waitingLevel,48);
  const platformCap = cap(72,platformLevel,50);

  const addCash=(v)=>{cashRef.current+=v;setCash(Math.round(cashRef.current));};
  const spend=(v)=>{if(cashRef.current<v)return false;cashRef.current-=v;setCash(Math.round(cashRef.current));return true;};

  const task = TASKS[Math.min(taskIndex,TASKS.length-1)];
  const taskDone = task.id==='ticket'?ticketLevel>=2:task.id==='security'?securityLevel>=2:task.id==='serve'?served>=80:task.id==='cafe'?cafeLevel>=1:task.id==='train'?trainLevel>=2:false;
  const claimTask=()=>{if(!taskDone)return;addCash(task.reward);setMessage(`Missie voltooid • +${money(task.reward)}`);setTaskIndex(v=>Math.min(TASKS.length-1,v+1));};

  const doUpgrade=(kind)=>{
    const specs={
      ticket:[cost(170,ticketLevel),ticketLevel,setTicketLevel,'Ticket Office verbeterd.'],
      security:[cost(240,securityLevel),securityLevel,setSecurityLevel,'Extra metaaldetector en sneller personeel.'],
      waiting:[cost(310,waitingLevel),waitingLevel,setWaitingLevel,'Meer zitplaatsen in de wachtruimte.'],
      platform:[cost(420,platformLevel),platformLevel,setPlatformLevel,'Perroncapaciteit verhoogd.'],
      train:[cost(720,trainLevel),trainLevel,setTrainLevel,'Trein heeft meer capaciteit.'],
      cafe:[cafeLevel?cost(390,cafeLevel):480,cafeLevel,setCafeLevel,cafeLevel?'Café verbeterd.':'Café geopend.'],
    }[kind];
    if(!specs)return;
    const [price,lv,setter,text]=specs;
    if(!spend(price)){setMessage('Nog niet genoeg geld.');return;}
    setter(lv+1);setMessage(text);
  };

  useEffect(()=>{
    if(phase!=='playing')return undefined;
    const id=setInterval(()=>{
      let e=entranceRef.current,t=ticketRef.current,s=securityRef.current,w=waitingRef.current,p=platformRef.current,o=onboardRef.current;
      const incoming=6+Math.floor(ticketLevel/2);
      e=Math.min(90,e+incoming);
      const toTicket=Math.min(e,rate(4,ticketLevel,3),Math.max(0,ticketCap-t));e-=toTicket;t+=toTicket;
      const toSecurity=Math.min(t,rate(4,ticketLevel,3),Math.max(0,securityCap-s));t-=toSecurity;s+=toSecurity;
      const toWaiting=Math.min(s,rate(3,securityLevel,3),Math.max(0,waitingCap-w));s-=toWaiting;w+=toWaiting;
      const toPlatform=Math.min(w,rate(5,waitingLevel,4),Math.max(0,platformCap-p));w-=toPlatform;p+=toPlatform;

      let phaseNow=trainPhaseRef.current;
      let cd=countdownRef.current;
      if(phaseNow==='boarding'){
        const board=Math.min(p,rate(10,platformLevel,6),Math.max(0,trainCapacity-o));p-=board;o+=board;cd=Math.max(0,cd-1);
        if(cd<=0){
          const payout=Math.round(o*route.fare*(1+(trainLevel-1)*0.1));
          addCash(payout);
          servedRef.current+=o;departuresRef.current+=1;setServed(servedRef.current);setDepartures(departuresRef.current);
          setMessage(`${route.name}: ${o} reizigers vertrokken • +${money(payout)}`);
          o=0;phaseNow='away';cd=5;
        }
      } else {
        cd=Math.max(0,cd-1);
        if(cd<=0){phaseNow='boarding';cd=24;setRouteIndex(v=>(v+1)%Math.min(ROUTES.length,Math.max(1,1+Math.floor(departuresRef.current/4))));}
      }

      const cafeIncome=cafeLevel>0?Math.round((w+p)*0.02*cafeLevel)+cafeLevel:0;
      if(cafeIncome)addCash(cafeIncome);

      entranceRef.current=e;ticketRef.current=t;securityRef.current=s;waitingRef.current=w;platformRef.current=p;onboardRef.current=o;trainPhaseRef.current=phaseNow;countdownRef.current=cd;
      setEntranceQ(e);setTicketQ(t);setSecurityQ(s);setWaitingQ(w);setPlatformQ(p);setOnboard(o);setTrainPhase(phaseNow);setDepartureCountdown(cd);

      if((departuresRef.current+servedRef.current)%8===0)save({cash:cashRef.current,gems,ticketLevel,securityLevel,waitingLevel,platformLevel,trainLevel,cafeLevel,served:servedRef.current,departures:departuresRef.current,taskIndex});
    },TICK);
    return()=>clearInterval(id);
  },[phase,ticketLevel,securityLevel,waitingLevel,platformLevel,trainLevel,cafeLevel,routeIndex]);

  if(phase==='menu')return(
    <SafeAreaView style={styles.screen}><StatusBar barStyle="light-content"/><View style={styles.menu}>
      <Text style={styles.devTag}>LEVEL 1 REFERENCE BUILD • V0.22</Text><Text style={styles.logo}>RAIL{`\n`}RUSH HOUR</Text>
      <Text style={styles.menuText}>Start met één klein station, één trein en een paar basisfaciliteiten. Upgrade de passagiersstroom, voltooi missies en bouw het eerste station stap voor stap uit.</Text>
      <Pressable style={styles.start} onPress={()=>{setPhase('playing');setMessage('Tutorial: upgrade eerst het Ticket Office.');setTimeout(()=>jumpTo(575,430),60);}}><Text style={styles.startText}>START LEVEL 1</Text></Pressable>
      <Text style={styles.safeNote}>DEV REFERENCE • eigen tijdelijke graphics • release register actief</Text>
    </View></SafeAreaView>
  );

  return(
    <SafeAreaView style={styles.screen}><StatusBar barStyle="light-content"/>
      <View style={styles.topHud}><View><Text style={styles.hudSmall}>LEVEL 1</Text><Text style={styles.hudBig}>Central Valley</Text></View><View><Text style={styles.hudSmall}>CASH</Text><Text style={styles.cash}>{money(cash)}</Text></View><View><Text style={styles.hudSmall}>GEMS</Text><Text style={styles.gems}>💎 {gems}</Text></View></View>
      <View style={styles.taskBar}><View style={{flex:1}}><Text style={styles.taskLabel}>MISSION {taskIndex+1}/{TASKS.length}</Text><Text style={styles.taskTitle}>{task.title}</Text></View><Text style={styles.taskReward}>{money(task.reward)}</Text>{taskDone?<Pressable style={styles.claim} onPress={claimTask}><Text style={styles.claimText}>CLAIM</Text></Pressable>:null}</View>
      <View style={styles.viewport} onLayout={e=>setViewport({width:e.nativeEvent.layout.width,height:e.nativeEvent.layout.height})} {...panResponder.panHandlers}>
        <Animated.View style={[styles.world,{transform:[{translateX:camera.x},{translateY:camera.y}]}]}>
          <View style={styles.grass}/><View style={styles.road}><View style={styles.roadDash}/></View><View style={styles.plaza}/>
          <View style={styles.stationBuilding}><View style={styles.roof}><Text style={styles.stationName}>CENTRAL VALLEY</Text></View><View style={styles.floor}/>
            <View style={styles.ticketRoom}><Text style={styles.roomTitle}>TICKET OFFICE</Text><People count={ticketQ} color="#c99345"/><View style={styles.ticketMachines}>{Array.from({length:Math.min(4,1+ticketLevel)}).map((_,i)=><View key={i} style={styles.ticketMachine}><View style={styles.machineScreen}/></View>)}</View></View>
            <View style={styles.securityRoom}><Text style={styles.roomTitle}>SECURITY</Text><People count={securityQ} color="#bd6756"/><View style={styles.detectors}>{Array.from({length:Math.min(4,1+securityLevel)}).map((_,i)=><View key={i} style={styles.detector}/>)}</View></View>
            <View style={styles.waitingRoom}><Text style={styles.roomTitle}>WAITING HALL</Text><People count={waitingQ} max={28} color="#5b8ea4"/><View style={styles.seats}>{Array.from({length:Math.min(12,4+waitingLevel*2)}).map((_,i)=><View key={i} style={styles.seat}/>)}</View></View>
            <View style={[styles.cafe,cafeLevel===0&&styles.cafeLocked]}><Text style={styles.roomTitle}>{cafeLevel?'CAFE':'EMPTY SHOP'}</Text><Text style={styles.cafeText}>{cafeLevel?`Lv ${cafeLevel} • passieve omzet`:'Ontgrendel met upgrade'}</Text>{cafeLevel?<View style={styles.counterCafe}/>:null}</View>
            <View style={styles.entrance}><Text style={styles.entranceSign}>ENTRANCE</Text><People count={entranceQ} max={30} color="#4e9dbe"/></View>
          </View>

          <View style={styles.platform}><View style={styles.yellowLine}/><Text style={styles.platformName}>PLATFORM 1</Text><Text style={styles.platformInfo}>{platformQ}/{platformCap} waiting</Text><People count={platformQ} max={30} color={route.color}/><View style={styles.canopy}/><View style={styles.bench}/><View style={[styles.bench,{left:330}]}/></View>
          <View style={styles.track}>{Array.from({length:22}).map((_,i)=><View key={i} style={[styles.sleeper,{left:i*42}]}/>) }<View style={[styles.rail,{top:20}]}/><View style={[styles.rail,{top:50}]}/></View>
          {trainPhase!=='away'?<Train level={trainLevel} onboard={onboard} capacity={trainCapacity} route={route} phase={trainPhase} countdown={departureCountdown}/>:<View style={styles.away}><Text style={styles.awayText}>TRAIN EN ROUTE • {departureCountdown}s</Text></View>}

          <UpgradeBubble x={350} y={485} title="Tickets" level={ticketLevel} price={cost(170,ticketLevel)} cash={cash} onPress={()=>doUpgrade('ticket')} ready={task.id==='ticket'}/>
          <UpgradeBubble x={500} y={485} title="Security" level={securityLevel} price={cost(240,securityLevel)} cash={cash} onPress={()=>doUpgrade('security')} ready={task.id==='security'}/>
          <UpgradeBubble x={665} y={485} title="Waiting" level={waitingLevel} price={cost(310,waitingLevel)} cash={cash} onPress={()=>doUpgrade('waiting')}/>
          <UpgradeBubble x={720} y={205} title="Platform" level={platformLevel} price={cost(420,platformLevel)} cash={cash} onPress={()=>doUpgrade('platform')}/>
          <UpgradeBubble x={840} y={80} title="Train" level={trainLevel} price={cost(720,trainLevel)} cash={cash} onPress={()=>doUpgrade('train')} ready={task.id==='train'}/>
          <UpgradeBubble x={825} y={505} title="Cafe" level={cafeLevel} price={cafeLevel?cost(390,cafeLevel):480} cash={cash} onPress={()=>doUpgrade('cafe')} ready={task.id==='cafe'}/>
        </Animated.View>

        <View style={styles.leftMenu}><SideButton icon="📋" label="Missions" onPress={()=>setPanel('missions')} badge={taskDone?'!':null}/><SideButton icon="📍" label="Routes" onPress={()=>setPanel('routes')}/><SideButton icon="🕒" label="Schedule" onPress={()=>setPanel('schedule')}/><SideButton icon="🚆" label="Trains" onPress={()=>setPanel('trains')}/><SideButton icon="⚙️" label="Tech" onPress={()=>setPanel('tech')}/></View>
        <View style={styles.zoomButtons}><Pressable style={styles.zoomBtn} onPress={()=>jumpTo(575,430)}><Text style={styles.zoomText}>⌂</Text></Pressable><Pressable style={styles.zoomBtn} onPress={()=>jumpTo(720,175)}><Text style={styles.zoomText}>🚆</Text></Pressable></View>
        <View style={styles.message}><Text style={styles.messageText}>{message}</Text></View>

        {panel==='missions'?<Panel title="MISSIONS" onClose={()=>setPanel(null)}><ScrollView>{TASKS.map((t,i)=><View key={t.id} style={[styles.listRow,i===taskIndex&&styles.listRowActive]}><Text style={styles.listTitle}>{i<taskIndex?'✓ ':''}{t.title}</Text><Text style={styles.listReward}>{money(t.reward)}</Text></View>)}</ScrollView></Panel>:null}
        {panel==='routes'?<Panel title="DESTINATIONS" onClose={()=>setPanel(null)}>{ROUTES.map((r,i)=><View key={r.id} style={[styles.listRow,i>Math.floor(departures/4)&&styles.lockedRow]}><View><Text style={styles.listTitle}>{i>Math.floor(departures/4)?'🔒 ':''}{r.name}</Text><Text style={styles.listSub}>Fare {money(r.fare)} / passenger</Text></View></View>)}</Panel>:null}
        {panel==='schedule'?<Panel title="SCHEDULE" onClose={()=>setPanel(null)}><View style={styles.scheduleCard}><Text style={styles.listTitle}>Next departure</Text><Text style={styles.scheduleTime}>00:{String(departureCountdown).padStart(2,'0')}</Text><Text style={styles.listSub}>{route.name} • Platform 1</Text></View><View style={styles.scheduleCard}><Text style={styles.listTitle}>Service interval</Text><Text style={styles.listSub}>24s boarding + 5s turnaround</Text></View></Panel>:null}
        {panel==='trains'?<Panel title="TRAINS" onClose={()=>setPanel(null)}><View style={styles.bigTrainCard}><Text style={styles.trainCardTitle}>Regional Unit</Text><Text style={styles.listSub}>Level {trainLevel} • Capacity {trainCapacity}</Text><Text style={styles.listSub}>Current load {onboard}/{trainCapacity}</Text></View></Panel>:null}
        {panel==='tech'?<Panel title="TECHNOLOGY" onClose={()=>setPanel(null)}><View style={styles.techRow}><Text style={styles.listTitle}>Passenger flow</Text><Text style={styles.techValue}>Lv {Math.floor((ticketLevel+securityLevel+waitingLevel)/3)}</Text></View><View style={styles.techRow}><Text style={styles.listTitle}>Station income</Text><Text style={styles.techValue}>Lv {cafeLevel+1}</Text></View><View style={styles.techRow}><Text style={styles.listTitle}>Rail operations</Text><Text style={styles.techValue}>Lv {trainLevel}</Text></View></Panel>:null}
      </View>
      <View style={styles.bottomStats}><Text style={styles.stat}>👥 {served} transported</Text><Text style={styles.stat}>🚆 {departures} departures</Text><Text style={styles.stat}>☕ Café Lv {cafeLevel}</Text></View>
    </SafeAreaView>
  );
}

const styles=StyleSheet.create({
  screen:{flex:1,backgroundColor:'#162631'},menu:{flex:1,backgroundColor:'#123043',alignItems:'center',justifyContent:'center',padding:28},devTag:{color:'#8bd6ff',fontSize:9,fontWeight:'900',letterSpacing:2,marginBottom:12},logo:{color:'#fff',fontSize:48,lineHeight:44,fontWeight:'900',textAlign:'center'},menuText:{color:'#b8cfda',fontSize:13,lineHeight:20,textAlign:'center',maxWidth:390,marginTop:18,marginBottom:24},start:{backgroundColor:'#f5c85c',paddingVertical:16,paddingHorizontal:44,borderRadius:14,borderWidth:1,borderColor:'#ffe6a2'},startText:{color:'#17303c',fontWeight:'900',fontSize:14},safeNote:{color:'#6d94a5',fontSize:6.5,fontWeight:'800',marginTop:15},
  topHud:{height:58,backgroundColor:'#163447',flexDirection:'row',alignItems:'center',justifyContent:'space-around',borderBottomWidth:2,borderBottomColor:'#244e63'},hudSmall:{color:'#7ea3b5',fontSize:5.8,fontWeight:'900',textAlign:'center'},hudBig:{color:'#fff',fontSize:11,fontWeight:'900',textAlign:'center'},cash:{color:'#7ee397',fontSize:13,fontWeight:'900'},gems:{color:'#7ec9ff',fontSize:11,fontWeight:'900'},
  taskBar:{minHeight:52,backgroundColor:'#f3f0e4',paddingHorizontal:10,paddingVertical:7,flexDirection:'row',alignItems:'center',gap:8,borderBottomWidth:2,borderBottomColor:'#b8b4a8'},taskLabel:{color:'#7f7b6d',fontSize:5.7,fontWeight:'900'},taskTitle:{color:'#273d49',fontSize:8,fontWeight:'900',marginTop:2},taskReward:{color:'#b88329',fontSize:7.5,fontWeight:'900'},claim:{backgroundColor:'#55bd79',paddingHorizontal:12,paddingVertical:6,borderRadius:7},claimText:{color:'#fff',fontSize:6.5,fontWeight:'900'},
  viewport:{flex:1,overflow:'hidden',backgroundColor:'#a8d27f',position:'relative'},world:{position:'absolute',width:WORLD_W,height:WORLD_H},grass:{position:'absolute',inset:0,backgroundColor:'#a8d27f'},road:{position:'absolute',left:-40,top:610,width:420,height:110,backgroundColor:'#687477',transform:[{rotateZ:'-14deg'}],borderRadius:15},roadDash:{position:'absolute',left:15,right:15,top:53,borderTopWidth:3,borderTopColor:'#e7e3d3',borderStyle:'dashed'},plaza:{position:'absolute',left:170,top:520,width:760,height:185,backgroundColor:'#d2cbb9',borderWidth:3,borderColor:'#e8e1d2',borderRadius:18},
  stationBuilding:{position:'absolute',left:275,top:340,width:650,height:300,backgroundColor:'#eee9da',borderRadius:14,borderWidth:4,borderColor:'#476677',shadowColor:'#25414d',shadowOpacity:.28,shadowRadius:10,shadowOffset:{width:8,height:10}},roof:{position:'absolute',left:0,right:0,top:0,height:52,backgroundColor:'#365d70',borderTopLeftRadius:10,borderTopRightRadius:10,padding:12},stationName:{color:'#fff',fontSize:12,fontWeight:'900',letterSpacing:1},floor:{position:'absolute',left:12,right:12,top:62,bottom:12,backgroundColor:'#dcd8ca',borderRadius:9},roomTitle:{color:'#314a55',fontSize:7,fontWeight:'900'},ticketRoom:{position:'absolute',left:20,top:78,width:125,height:190,backgroundColor:'#f6f1e3',borderWidth:2,borderColor:'#ceb676',borderRadius:8,padding:7},securityRoom:{position:'absolute',left:155,top:78,width:125,height:190,backgroundColor:'#f4eee2',borderWidth:2,borderColor:'#bd7a6a',borderRadius:8,padding:7},waitingRoom:{position:'absolute',left:290,top:78,width:180,height:190,backgroundColor:'#eef3e8',borderWidth:2,borderColor:'#779b88',borderRadius:8,padding:7},cafe:{position:'absolute',left:480,top:78,width:145,height:190,backgroundColor:'#f1e4d5',borderWidth:2,borderColor:'#b98557',borderRadius:8,padding:7},cafeLocked:{backgroundColor:'#d6d1c6',borderStyle:'dashed',borderColor:'#8a8a82'},cafeText:{color:'#806f5d',fontSize:5.5,fontWeight:'800',marginTop:6},counterCafe:{position:'absolute',left:12,right:12,bottom:18,height:40,backgroundColor:'#8a5a3b',borderTopWidth:8,borderTopColor:'#d99c60',borderRadius:5},entrance:{position:'absolute',left:-90,top:126,width:90,height:110,backgroundColor:'#d3dde0',borderWidth:3,borderColor:'#5e7d89',borderRadius:9,padding:6},entranceSign:{color:'#334e5b',fontSize:6,fontWeight:'900'},
  people:{flexDirection:'row',flexWrap:'wrap',gap:3,marginTop:7,alignContent:'flex-start'},person:{width:7,height:13,alignItems:'center'},head:{width:4,height:4,borderRadius:3,backgroundColor:'#efc49a'},body:{width:5,height:7,borderRadius:1,marginTop:1},ticketMachines:{position:'absolute',left:8,right:8,bottom:10,flexDirection:'row',gap:5},ticketMachine:{width:23,height:37,borderRadius:3,backgroundColor:'#bd8e49',borderWidth:1,borderColor:'#776443'},machineScreen:{width:11,height:7,backgroundColor:'#345d6e',marginLeft:5,marginTop:4,borderRadius:1},detectors:{position:'absolute',left:8,right:8,bottom:8,flexDirection:'row',gap:6},detector:{width:24,height:45,borderWidth:5,borderBottomWidth:9,borderColor:'#69787d',backgroundColor:'#d9dcda',borderRadius:4},seats:{position:'absolute',left:10,right:10,bottom:12,flexDirection:'row',flexWrap:'wrap',gap:5},seat:{width:30,height:10,backgroundColor:'#8b6549',borderRadius:3},
  platform:{position:'absolute',left:360,top:205,width:590,height:120,backgroundColor:'#c9c5b9',borderRadius:10,borderWidth:3,borderColor:'#ebe7db',padding:9},yellowLine:{position:'absolute',left:10,right:10,top:7,height:6,backgroundColor:'#e2c450',borderRadius:3},platformName:{color:'#344c55',fontSize:8,fontWeight:'900',marginTop:11},platformInfo:{color:'#6d7e84',fontSize:5.5,fontWeight:'800'},canopy:{position:'absolute',left:185,top:29,width:245,height:29,backgroundColor:'#527888',borderRadius:6,borderWidth:1,borderColor:'#a8c5d0'},bench:{position:'absolute',left:235,bottom:15,width:65,height:9,backgroundColor:'#7d5c41',borderRadius:2},track:{position:'absolute',left:300,top:105,width:800,height:80,backgroundColor:'#686e70',transform:[{rotateZ:'-3deg'}],borderRadius:5},sleeper:{position:'absolute',top:13,width:7,height:55,backgroundColor:'#614937'},rail:{position:'absolute',left:5,right:5,height:3,backgroundColor:'#d7dde0'},
  trainArea:{position:'absolute',left:410,top:85,width:580,height:100,zIndex:20},trainShadow:{position:'absolute',left:0,top:42,width:410,height:24,backgroundColor:'rgba(18,31,36,.2)',borderRadius:14,transform:[{rotateZ:'-3deg'}]},train:{position:'absolute',left:0,top:15,width:420,height:42,backgroundColor:'#e9f0f1',borderRadius:9,borderWidth:3,borderColor:'#5c7b88',transform:[{rotateZ:'-3deg'}]},trainBoarding:{backgroundColor:'#edf5ea'},trainFront:{position:'absolute',left:0,top:0,bottom:0,width:30,borderTopLeftRadius:6,borderBottomLeftRadius:6},trainRoof:{position:'absolute',left:45,right:35,top:2,height:5,backgroundColor:'#bdc9ce',borderRadius:3},windows:{position:'absolute',left:50,right:70,top:10,flexDirection:'row',justifyContent:'space-between'},window:{width:29,height:10,backgroundColor:'#31586a',borderRadius:2,borderWidth:1,borderColor:'#8bb3c3'},trainDoor:{position:'absolute',right:28,top:12,width:18,height:25,backgroundColor:'#c2d5dc',borderWidth:1,borderColor:'#627b84'},trainStripe:{position:'absolute',left:30,right:0,top:27,height:3,backgroundColor:'#8097a0'},wheels:{position:'absolute',left:65,right:55,bottom:-7,flexDirection:'row',justifyContent:'space-between'},wheel:{width:13,height:13,borderRadius:8,backgroundColor:'#28373d',borderWidth:2,borderColor:'#617176'},trainInfo:{position:'absolute',left:432,top:3,width:135,backgroundColor:'rgba(13,34,43,.96)',borderRadius:8,borderWidth:1,borderColor:'#496976',padding:7},trainRoute:{color:'#fff',fontSize:8,fontWeight:'900'},trainLoad:{color:'#acc1ca',fontSize:6,marginTop:2,fontWeight:'800'},loadTrack:{height:5,backgroundColor:'#243d47',borderRadius:3,overflow:'hidden',marginTop:4},loadFill:{height:'100%'},trainTimer:{color:'#f2cb67',fontSize:5.5,fontWeight:'900',marginTop:4},away:{position:'absolute',left:600,top:125,backgroundColor:'#24414f',padding:9,borderRadius:8},awayText:{color:'#d2e4ea',fontSize:6.5,fontWeight:'900'},
  upgradeBubble:{position:'absolute',width:92,backgroundColor:'rgba(23,48,59,.94)',borderRadius:9,borderWidth:1,borderColor:'#567481',padding:6,alignItems:'center',zIndex:30},upgradeBubbleReady:{borderColor:'#f2cb63',borderWidth:2},bubbleTitle:{color:'#dce9ed',fontSize:6,fontWeight:'900'},bubbleLevel:{color:'#8fa7b0',fontSize:5,marginTop:1},plus:{width:25,height:25,borderRadius:13,backgroundColor:'#50636b',alignItems:'center',justifyContent:'center',marginTop:4},plusReady:{backgroundColor:'#54bb78'},plusLocked:{backgroundColor:'#5c5f60'},plusText:{color:'#fff',fontSize:16,lineHeight:18,fontWeight:'900'},bubblePrice:{color:'#798e96',fontSize:5.2,fontWeight:'900',marginTop:3},bubblePriceReady:{color:'#f2cb63'},
  leftMenu:{position:'absolute',left:6,top:8,gap:5},sideButton:{width:58,minHeight:52,backgroundColor:'rgba(20,50,64,.95)',borderRadius:9,borderWidth:1,borderColor:'#477082',alignItems:'center',justifyContent:'center',position:'relative'},sideIcon:{fontSize:16},sideLabel:{color:'#d3e3e9',fontSize:5.2,fontWeight:'900',marginTop:2},badge:{position:'absolute',right:-3,top:-3,width:17,height:17,borderRadius:9,backgroundColor:'#e05d51',alignItems:'center',justifyContent:'center'},badgeText:{color:'#fff',fontSize:8,fontWeight:'900'},zoomButtons:{position:'absolute',right:7,top:8,gap:5},zoomBtn:{width:38,height:38,borderRadius:9,backgroundColor:'rgba(20,50,64,.95)',borderWidth:1,borderColor:'#477082',alignItems:'center',justifyContent:'center'},zoomText:{fontSize:16},message:{position:'absolute',left:70,right:55,bottom:8,minHeight:35,backgroundColor:'rgba(17,42,53,.94)',borderRadius:8,borderWidth:1,borderColor:'#456675',justifyContent:'center',paddingHorizontal:9},messageText:{color:'#cadbe1',fontSize:6.5,fontWeight:'800'},
  panel:{position:'absolute',left:72,right:54,top:60,maxHeight:330,backgroundColor:'#f1eee3',borderRadius:12,borderWidth:3,borderColor:'#3f6474',padding:10,zIndex:200},panelTop:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:8},panelTitle:{color:'#294653',fontSize:12,fontWeight:'900'},close:{color:'#5d6f77',fontSize:15,fontWeight:'900'},listRow:{paddingVertical:9,paddingHorizontal:8,borderBottomWidth:1,borderBottomColor:'#ccc7b9',flexDirection:'row',justifyContent:'space-between'},listRowActive:{backgroundColor:'#fff7d6'},lockedRow:{opacity:.45},listTitle:{color:'#344e58',fontSize:7.5,fontWeight:'900'},listReward:{color:'#b27f2d',fontSize:7,fontWeight:'900'},listSub:{color:'#7a898e',fontSize:6,marginTop:3},scheduleCard:{backgroundColor:'#e4e0d4',padding:10,borderRadius:8,marginBottom:8},scheduleTime:{color:'#315a6b',fontSize:20,fontWeight:'900',marginVertical:4},bigTrainCard:{backgroundColor:'#e3e0d5',padding:13,borderRadius:9},trainCardTitle:{color:'#294a58',fontSize:12,fontWeight:'900',marginBottom:5},techRow:{paddingVertical:11,borderBottomWidth:1,borderBottomColor:'#ccc7b9',flexDirection:'row',justifyContent:'space-between'},techValue:{color:'#4f8e68',fontSize:8,fontWeight:'900'},
  bottomStats:{height:31,backgroundColor:'#122c39',flexDirection:'row',alignItems:'center',justifyContent:'space-around',borderTopWidth:1,borderTopColor:'#315264'},stat:{color:'#9db5bf',fontSize:5.8,fontWeight:'800'},
});