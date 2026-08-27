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

// REFERENCE BUILD / v0.20
// Gameplay structure intentionally follows proven idle-station conventions.
// All artwork, names, layout geometry and code in this file are original placeholders.
// See RELEASE_SAFETY.md before any public store release.

const SAVE_KEY = 'rail-rush-hour-v020';
const TICK_MS = 1000;
const WORLD_W = 1040;
const WORLD_H = 820;

const DESTINATIONS = [
  { id: 'ndr', name: 'Noorddam', color: '#4fa8ff', fare: 3 },
  { id: 'hvn', name: 'Havenstad', color: '#48d18e', fare: 4 },
  { id: 'oos', name: 'Oostpoort', color: '#ffad55', fare: 5 },
  { id: 'air', name: 'Luchthaven', color: '#b58cff', fare: 7 },
];

const money = (v) => `€${Math.max(0, Math.round(v)).toLocaleString('nl-NL')}`;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const cap = (base, lv, step) => base + (lv - 1) * step;
const rate = (base, lv, step) => base + (lv - 1) * step;
const upgradeCost = (base, lv, growth = 1.58) => Math.round(base * Math.pow(growth, lv - 1));

function loadSave() {
  try {
    if (!globalThis?.localStorage) return null;
    const raw = globalThis.localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveGame(data) {
  try {
    if (globalThis?.localStorage) globalThis.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    // Web persistence is optional.
  }
}

function PassengerDots({ count, max = 24, color = '#4f7f96' }) {
  const visible = Math.min(max, Math.max(0, Math.ceil(count / 4)));
  return (
    <View style={styles.dotCloud}>
      {Array.from({ length: visible }).map((_, i) => (
        <View key={i} style={styles.person}>
          <View style={[styles.personHead, i % 5 === 0 && { backgroundColor: '#d9a979' }]} />
          <View style={[styles.personBody, { backgroundColor: i % 4 === 0 ? color : i % 4 === 1 ? '#6f6289' : i % 4 === 2 ? '#9b6a55' : '#507e92' }]} />
        </View>
      ))}
    </View>
  );
}

function QueueCard({ title, value, capacity, rateText, hot, icon }) {
  const p = clamp(value / Math.max(1, capacity), 0, 1);
  return (
    <View style={[styles.queueCard, hot && styles.queueCardHot]}>
      <View style={styles.queueCardTop}>
        <Text style={styles.queueIcon}>{icon}</Text>
        <Text style={styles.queueTitle}>{title}</Text>
      </View>
      <Text style={[styles.queueValue, hot && styles.queueValueHot]}>{value}/{capacity}</Text>
      <View style={styles.miniTrack}><View style={[styles.miniFill, { width: `${Math.round(p * 100)}%` }, hot && styles.miniFillHot]} /></View>
      <Text style={styles.queueRate}>{rateText}</Text>
    </View>
  );
}

function StationZone({ style, title, subtitle, children, hot, accent = '#68a8c4' }) {
  return (
    <View style={[styles.zone, style, hot && styles.zoneHot]}>
      <View style={[styles.zoneAccent, { backgroundColor: accent }]} />
      <Text style={styles.zoneTitle}>{title}</Text>
      <Text style={styles.zoneSub}>{subtitle}</Text>
      {children}
    </View>
  );
}

function Train({ train, onDepart }) {
  const fill = clamp(train.onboard / Math.max(1, train.capacity), 0, 1);
  const ready = train.status === 'ready';
  return (
    <Pressable disabled={!ready} onPress={onDepart} style={[styles.trainWrap, ready && styles.trainWrapReady]}>
      <View style={styles.trainShadow} />
      <View style={[styles.train, { borderColor: train.destination.color }, ready && styles.trainReady]}>
        <View style={[styles.trainNose, { backgroundColor: train.destination.color }]} />
        <View style={styles.trainRoof} />
        <View style={styles.trainWindows}>
          {Array.from({ length: 7 }).map((_, i) => <View key={i} style={styles.trainWindow} />)}
        </View>
        <View style={styles.trainDoor} />
        <View style={styles.trainBelt} />
        <View style={styles.trainWheels}><View style={styles.wheel} /><View style={styles.wheel} /><View style={styles.wheel} /><View style={styles.wheel} /></View>
      </View>
      <View style={styles.trainLabel}>
        <Text style={styles.trainDest}>{train.destination.name}</Text>
        <Text style={styles.trainLoad}>{train.onboard}/{train.capacity}</Text>
        <View style={styles.trainFillTrack}><View style={[styles.trainFill, { width: `${Math.round(fill * 100)}%`, backgroundColor: train.destination.color }]} /></View>
        <Text style={[styles.trainAction, ready && styles.trainActionReady]}>{ready ? 'TIK OM TE VERTREKKEN' : `vertrekvenster ${Math.max(0, train.departDue)}s`}</Text>
      </View>
    </Pressable>
  );
}

function UpgradeCard({ icon, title, level, detail, cost, cash, onPress, hot, locked }) {
  return (
    <Pressable disabled={locked} onPress={onPress} style={[styles.upgrade, cash >= cost && !locked && styles.upgradeAffordable, hot && styles.upgradeHot, locked && styles.upgradeLocked]}>
      <View style={styles.upgradeIconBox}><Text style={styles.upgradeIcon}>{icon}</Text></View>
      <View style={styles.upgradeCopy}>
        <Text style={styles.upgradeTitle}>{title}</Text>
        <Text style={styles.upgradeDetail}>{locked ? 'Nog vergrendeld' : `Lv ${level} • ${detail}`}</Text>
      </View>
      <Text style={styles.upgradeCost}>{locked ? '🔒' : money(cost)}</Text>
    </Pressable>
  );
}

function Mission({ mission, progress, claimed, onClaim }) {
  const done = progress >= mission.target;
  const pct = Math.min(100, Math.round((progress / mission.target) * 100));
  return (
    <View style={styles.missionCard}>
      <View style={styles.missionTop}><Text style={styles.missionTitle}>DOEL • {mission.title}</Text><Text style={styles.missionReward}>{money(mission.reward)}</Text></View>
      <Text style={styles.missionText}>{Math.min(progress, mission.target)}/{mission.target}</Text>
      <View style={styles.missionTrack}><View style={[styles.missionFill, { width: `${pct}%` }]} /></View>
      {done && !claimed ? <Pressable style={styles.claimButton} onPress={onClaim}><Text style={styles.claimText}>CLAIM</Text></Pressable> : null}
      {claimed ? <Text style={styles.claimedText}>✓ afgerond</Text> : null}
    </View>
  );
}

export default function AppV20() {
  const saved = useRef(loadSave()).current;
  const [phase, setPhase] = useState('menu');
  const [cash, setCash] = useState(saved?.cash ?? 850);
  const [stationLevel, setStationLevel] = useState(saved?.stationLevel ?? 1);
  const [entryLevel, setEntryLevel] = useState(saved?.entryLevel ?? 1);
  const [ticketLevel, setTicketLevel] = useState(saved?.ticketLevel ?? 1);
  const [securityLevel, setSecurityLevel] = useState(saved?.securityLevel ?? 1);
  const [hallLevel, setHallLevel] = useState(saved?.hallLevel ?? 1);
  const [platformLevel, setPlatformLevel] = useState(saved?.platformLevel ?? 1);
  const [trainLevel, setTrainLevel] = useState(saved?.trainLevel ?? 1);
  const [retailLevel, setRetailLevel] = useState(saved?.retailLevel ?? 1);
  const [managerLevel, setManagerLevel] = useState(saved?.managerLevel ?? 0);

  const [entryQ, setEntryQ] = useState(18);
  const [ticketQ, setTicketQ] = useState(8);
  const [securityQ, setSecurityQ] = useState(5);
  const [hallQ, setHallQ] = useState(12);
  const [platformQ, setPlatformQ] = useState(20);
  const [served, setServed] = useState(saved?.served ?? 0);
  const [departures, setDepartures] = useState(saved?.departures ?? 0);
  const [lost, setLost] = useState(saved?.lost ?? 0);
  const [message, setMessage] = useState('');
  const [missionIndex, setMissionIndex] = useState(saved?.missionIndex ?? 0);
  const [missionClaimed, setMissionClaimed] = useState(false);
  const [viewport, setViewport] = useState({ width: 390, height: 520 });

  const makeTrain = (index = 0) => {
    const destination = DESTINATIONS[index % Math.min(DESTINATIONS.length, Math.max(2, stationLevel + 1))];
    const capacity = 120 + trainLevel * 90;
    return { id: Date.now() + index, destination, capacity, onboard: 0, status: 'boarding', departDue: 18 };
  };
  const [train, setTrain] = useState(() => makeTrain(0));
  const trainIndexRef = useRef(1);

  const cashRef = useRef(cash);
  const entryRef = useRef(entryQ);
  const ticketRef = useRef(ticketQ);
  const securityRef = useRef(securityQ);
  const hallRef = useRef(hallQ);
  const platformRef = useRef(platformQ);
  const trainRef = useRef(train);
  const servedRef = useRef(served);
  const departuresRef = useRef(departures);
  const lostRef = useRef(lost);

  useEffect(() => { cashRef.current = cash; }, [cash]);
  useEffect(() => { entryRef.current = entryQ; }, [entryQ]);
  useEffect(() => { ticketRef.current = ticketQ; }, [ticketQ]);
  useEffect(() => { securityRef.current = securityQ; }, [securityQ]);
  useEffect(() => { hallRef.current = hallQ; }, [hallQ]);
  useEffect(() => { platformRef.current = platformQ; }, [platformQ]);
  useEffect(() => { trainRef.current = train; }, [train]);

  const camera = useRef(new Animated.ValueXY({ x: -300, y: -185 })).current;
  const cameraCurrent = useRef({ x: -300, y: -185 });
  const panStart = useRef({ x: -300, y: -185 });
  const viewportRef = useRef(viewport);
  useEffect(() => { viewportRef.current = viewport; }, [viewport]);

  const clampCamera = (x, y) => ({
    x: Math.max(-(WORLD_W - viewportRef.current.width), Math.min(0, x)),
    y: Math.max(-(WORLD_H - viewportRef.current.height), Math.min(0, y)),
  });

  const jumpTo = (wx, wy) => {
    const next = clampCamera(viewportRef.current.width / 2 - wx, viewportRef.current.height / 2 - wy);
    cameraCurrent.current = next;
    Animated.spring(camera, { toValue: next, useNativeDriver: true, tension: 70, friction: 10 }).start();
  };

  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 5 || Math.abs(g.dy) > 5,
    onPanResponderGrant: () => { panStart.current = { ...cameraCurrent.current }; },
    onPanResponderMove: (_, g) => {
      const next = clampCamera(panStart.current.x + g.dx, panStart.current.y + g.dy);
      camera.setValue(next);
      cameraCurrent.current = next;
    },
  })).current;

  const currentLevels = entryLevel + ticketLevel + securityLevel + hallLevel + platformLevel + trainLevel + retailLevel + managerLevel;
  useEffect(() => { setStationLevel(Math.max(1, Math.floor(currentLevels / 6))); }, [currentLevels]);

  const persist = () => saveGame({
    cash: cashRef.current,
    stationLevel,
    entryLevel,
    ticketLevel,
    securityLevel,
    hallLevel,
    platformLevel,
    trainLevel,
    retailLevel,
    managerLevel,
    served: servedRef.current,
    departures: departuresRef.current,
    lost: lostRef.current,
    missionIndex,
    savedAt: Date.now(),
  });

  const addCash = (amount) => {
    cashRef.current += amount;
    setCash(Math.round(cashRef.current));
  };

  const spend = (amount) => {
    if (cashRef.current < amount) return false;
    cashRef.current -= amount;
    setCash(Math.round(cashRef.current));
    return true;
  };

  const departTrain = () => {
    const current = trainRef.current;
    if (!current || current.status !== 'ready') return;
    const punctual = current.departDue >= -8;
    const payout = Math.round(current.onboard * current.destination.fare * (1 + (trainLevel - 1) * 0.08));
    addCash(payout + (punctual ? 120 : 0));
    servedRef.current += current.onboard;
    departuresRef.current += 1;
    setServed(servedRef.current);
    setDepartures(departuresRef.current);
    const leaving = { ...current, status: 'away' };
    trainRef.current = leaving;
    setTrain(leaving);
    setMessage(`${current.destination.name}: ${current.onboard} reizigers • ${money(payout)}${punctual ? ' + €120 op-tijd' : ''}`);
    setTimeout(() => {
      const next = makeTrain(trainIndexRef.current++);
      trainRef.current = next;
      setTrain(next);
    }, 1800);
  };

  useEffect(() => {
    if (phase !== 'playing') return undefined;
    const id = setInterval(() => {
      const entryCap = cap(70, entryLevel, 35);
      const ticketCap = cap(45, ticketLevel, 28);
      const securityCap = cap(40, securityLevel, 25);
      const hallCap = cap(110, hallLevel, 65);
      const platformCap = cap(90, platformLevel, 55);

      let e = entryRef.current;
      let t = ticketRef.current;
      let s = securityRef.current;
      let h = hallRef.current;
      let p = platformRef.current;

      const inflow = rate(7, entryLevel, 2);
      const accepted = Math.min(inflow, Math.max(0, entryCap - e));
      const rejected = inflow - accepted;
      e += accepted;
      if (rejected > 0) {
        lostRef.current += rejected;
        setLost(lostRef.current);
      }

      const toTicket = Math.min(e, rate(6, entryLevel, 3), Math.max(0, ticketCap - t));
      e -= toTicket; t += toTicket;
      const toSecurity = Math.min(t, rate(5, ticketLevel, 3), Math.max(0, securityCap - s));
      t -= toSecurity; s += toSecurity;
      const toHall = Math.min(s, rate(4, securityLevel, 3), Math.max(0, hallCap - h));
      s -= toHall; h += toHall;
      const toPlatform = Math.min(h, rate(6, hallLevel, 4), Math.max(0, platformCap - p));
      h -= toPlatform; p += toPlatform;

      let tr = { ...trainRef.current };
      if (tr.status === 'boarding' || tr.status === 'ready') {
        const board = Math.min(p, rate(13, platformLevel, 6), Math.max(0, tr.capacity - tr.onboard));
        p -= board;
        tr.onboard += board;
        tr.departDue -= 1;
        if (tr.onboard >= tr.capacity * 0.88 || tr.departDue <= 0) tr.status = 'ready';
        if (managerLevel > 0 && tr.status === 'ready' && tr.departDue <= -2 && tr.onboard >= tr.capacity * 0.72) {
          trainRef.current = tr;
          setTrain(tr);
          setTimeout(departTrain, 20);
        }
      }

      const retail = Math.round((h + p) * 0.012 * retailLevel + retailLevel * 2);
      if (retail > 0) addCash(retail);

      entryRef.current = e; ticketRef.current = t; securityRef.current = s; hallRef.current = h; platformRef.current = p; trainRef.current = tr;
      setEntryQ(e); setTicketQ(t); setSecurityQ(s); setHallQ(h); setPlatformQ(p); setTrain(tr);

      if ((servedRef.current + departuresRef.current) % 10 === 0) persist();
    }, TICK_MS);
    return () => clearInterval(id);
  }, [phase, entryLevel, ticketLevel, securityLevel, hallLevel, platformLevel, trainLevel, retailLevel, managerLevel]);

  const upgrade = (kind) => {
    const spec = {
      entry: [upgradeCost(180, entryLevel), entryLevel, setEntryLevel, 'Entree uitgebreid: meer instroom.'],
      ticket: [upgradeCost(260, ticketLevel), ticketLevel, setTicketLevel, 'Ticketbalies verwerken sneller.'],
      security: [upgradeCost(360, securityLevel), securityLevel, setSecurityLevel, 'Securitycapaciteit verhoogd.'],
      hall: [upgradeCost(500, hallLevel), hallLevel, setHallLevel, 'Stationshal uitgebreid.'],
      platform: [upgradeCost(700, platformLevel), platformLevel, setPlatformLevel, 'Perron verwerkt meer reizigers.'],
      train: [upgradeCost(950, trainLevel), trainLevel, setTrainLevel, 'Nieuwe treinen krijgen meer capaciteit.'],
      retail: [upgradeCost(430, retailLevel), retailLevel, setRetailLevel, 'Meer horeca en winkels geopend.'],
      manager: [upgradeCost(2100, Math.max(1, managerLevel + 1), 1.8), managerLevel, setManagerLevel, 'Stationmanager automatiseert vertrek.'],
    }[kind];
    if (!spec) return;
    const [cost, level, setter, text] = spec;
    if (!spend(cost)) return setMessage('Niet genoeg geld voor deze upgrade.');
    setter(level + 1);
    setMessage(text);
    setTimeout(persist, 50);
  };

  const entryCapacity = cap(70, entryLevel, 35);
  const ticketCapacity = cap(45, ticketLevel, 28);
  const securityCapacity = cap(40, securityLevel, 25);
  const hallCapacity = cap(110, hallLevel, 65);
  const platformCapacity = cap(90, platformLevel, 55);

  const pressures = [
    ['ENTREE', entryQ / entryCapacity, [150, 590]],
    ['TICKETS', ticketQ / ticketCapacity, [360, 500]],
    ['SECURITY', securityQ / securityCapacity, [500, 500]],
    ['HAL', hallQ / hallCapacity, [650, 500]],
    ['PERRON', platformQ / platformCapacity, [650, 220]],
    ['TREIN', train.onboard / Math.max(1, train.capacity), [640, 125]],
  ].sort((a, b) => b[1] - a[1]);
  const bottleneck = pressures[0];

  const missions = [
    { title: 'Vervoer 120 reizigers', target: 120, reward: 700, type: 'served' },
    { title: 'Laat 3 treinen vertrekken', target: 3, reward: 1100, type: 'departures' },
    { title: 'Bereik ticketniveau 4', target: 4, reward: 1600, type: 'ticket' },
    { title: 'Vervoer 750 reizigers', target: 750, reward: 3000, type: 'served' },
  ];
  const mission = missions[Math.min(missionIndex, missions.length - 1)];
  const missionProgress = mission.type === 'served' ? served : mission.type === 'departures' ? departures : ticketLevel;
  const claimMission = () => {
    if (missionClaimed || missionProgress < mission.target) return;
    addCash(mission.reward);
    setMissionClaimed(true);
    setMessage(`Doel behaald: +${money(mission.reward)}`);
    setTimeout(() => {
      if (missionIndex < missions.length - 1) setMissionIndex((v) => v + 1);
      setMissionClaimed(false);
    }, 700);
  };

  if (phase === 'menu') {
    return (
      <SafeAreaView style={styles.screen}>
        <StatusBar barStyle="light-content" />
        <View style={styles.menu}>
          <Text style={styles.menuTag}>REFERENCE TYCOON BUILD • V0.20</Text>
          <Text style={styles.logo}>RAIL{`\n`}RUSH HOUR</Text>
          <Text style={styles.menuCopy}>Een snelle developer-build rond de bewezen idle-stationlus: instroom, tickets, security, hal, perron, trein, bottlenecks, upgrades, doelen en grote vertrekuitbetalingen.</Text>
          <Pressable style={styles.startButton} onPress={() => { setPhase('playing'); setMessage('Vind het knelpunt, upgrade slim en vul de trein.'); setTimeout(() => jumpTo(540, 425), 60); }}><Text style={styles.startText}>OPEN STATION</Text></Pressable>
          <Text style={styles.devNote}>DEV REFERENCE • release-safety register actief</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="light-content" />
      <View style={styles.hud}>
        <View><Text style={styles.hudLabel}>KAS</Text><Text style={styles.cash}>{money(cash)}</Text></View>
        <View><Text style={styles.hudLabel}>STATION</Text><Text style={styles.hudValue}>Lv {stationLevel}</Text></View>
        <Pressable onPress={() => jumpTo(...bottleneck[2])}><Text style={styles.hudLabel}>KNELPUNT</Text><Text style={styles.bottleneck}>{bottleneck[0]} {Math.round(bottleneck[1] * 100)}%</Text></Pressable>
        <View><Text style={styles.hudLabel}>VERVOERD</Text><Text style={styles.hudValue}>{served}</Text></View>
      </View>

      <Mission mission={mission} progress={missionProgress} claimed={missionClaimed} onClaim={claimMission} />

      <View style={styles.cameraBar}>
        <Pressable style={styles.cameraButton} onPress={() => jumpTo(540, 425)}><Text style={styles.cameraText}>◎ STATION</Text></Pressable>
        <Pressable style={styles.cameraButton} onPress={() => jumpTo(...bottleneck[2])}><Text style={styles.cameraText}>⚠ KNELPUNT</Text></Pressable>
        <Pressable style={styles.cameraButton} onPress={() => jumpTo(640, 130)}><Text style={styles.cameraText}>🚆 TREIN</Text></Pressable>
      </View>

      <View style={styles.viewport} onLayout={(e) => setViewport({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })} {...panResponder.panHandlers}>
        <Animated.View style={[styles.world, { transform: [{ translateX: camera.x }, { translateY: camera.y }] }]}>
          <View style={styles.grass} />
          <View style={styles.accessRoad}><View style={styles.roadLine} /></View>
          <View style={styles.forecourt} />
          <View style={styles.parking}><Text style={styles.parkingText}>P</Text>{Array.from({ length: 18 }).map((_, i) => <View key={i} style={[styles.car, { left: 18 + (i % 6) * 27, top: 30 + Math.floor(i / 6) * 25, backgroundColor: i % 3 === 0 ? '#4fa8ff' : i % 3 === 1 ? '#e76f62' : '#e9c85e' }]} />)}</View>

          <View style={styles.trackBed}>{Array.from({ length: 18 }).map((_, i) => <View key={i} style={[styles.sleeper, { left: 12 + i * 45 }]} />)}<View style={[styles.rail, { top: 23 }]} /><View style={[styles.rail, { top: 47 }]} /></View>
          {train.status !== 'away' ? <Train train={train} onDepart={departTrain} /> : <View style={styles.emptyTrackLabel}><Text style={styles.emptyTrackText}>Volgende trein onderweg…</Text></View>}

          <View style={styles.stationShell}>
            <View style={styles.stationRoof}><Text style={styles.stationName}>CENTRAAL STATION</Text><Text style={styles.stationSub}>REFERENCE TYCOON TERMINAL</Text></View>
            <View style={styles.mainCorridor} />

            <StationZone style={styles.entryZone} title="ENTREE" subtitle={`Lv ${entryLevel}`} hot={bottleneck[0] === 'ENTREE'} accent="#66b7e8"><PassengerDots count={entryQ} color="#5ea5c8" /><View style={styles.turnstiles}>{Array.from({ length: Math.min(5, 1 + entryLevel) }).map((_, i) => <View key={i} style={styles.turnstile}><View style={styles.greenLamp} /></View>)}</View></StationZone>
            <StationZone style={styles.ticketZone} title="TICKETS" subtitle={`Lv ${ticketLevel}`} hot={bottleneck[0] === 'TICKETS'} accent="#f0c65a"><PassengerDots count={ticketQ} color="#d29e4d" /><View style={styles.counterRow}>{Array.from({ length: Math.min(4, 1 + ticketLevel) }).map((_, i) => <View key={i} style={styles.counter}><View style={styles.counterScreen} /></View>)}</View></StationZone>
            <StationZone style={styles.securityZone} title="SECURITY" subtitle={`Lv ${securityLevel}`} hot={bottleneck[0] === 'SECURITY'} accent="#df745f"><PassengerDots count={securityQ} color="#be6250" /><View style={styles.securityRow}>{Array.from({ length: Math.min(4, 1 + securityLevel) }).map((_, i) => <View key={i} style={styles.scanner} />)}</View></StationZone>
            <StationZone style={styles.hallZone} title="STATIONSHAL" subtitle={`Lv ${hallLevel} • shops ${retailLevel}`} hot={bottleneck[0] === 'HAL'} accent="#61d395"><PassengerDots count={hallQ} max={30} color="#56a980" /><View style={styles.shopRow}><View style={styles.shop}><Text style={styles.shopText}>CAFE</Text></View><View style={styles.shop}><Text style={styles.shopText}>SHOP</Text></View><View style={styles.bench} /><View style={styles.bench} /></View></StationZone>
            <StationZone style={styles.gateZone} title="GATES" subtitle="naar perron" accent="#9c8fe3"><PassengerDots count={Math.ceil(hallQ / 3)} color="#8074bb" /><View style={styles.gateDoors}><View style={styles.gateDoor} /><View style={styles.gateDoor} /><View style={styles.gateDoor} /></View></StationZone>
          </View>

          <View style={[styles.platform, bottleneck[0] === 'PERRON' && styles.platformHot]}>
            <View style={styles.platformEdge} />
            <View style={styles.canopy}><View style={styles.canopyGlass} /></View>
            <Text style={styles.platformTitle}>PERRON 1</Text><Text style={styles.platformSub}>Lv {platformLevel} • {platformQ}/{platformCapacity}</Text>
            <PassengerDots count={platformQ} max={34} color={train.destination.color} />
            <View style={styles.platformBench} /><View style={[styles.platformBench, { left: 300 }]} />
          </View>

          <View style={styles.flowArrow1}><Text style={styles.flowArrowText}>→</Text></View><View style={styles.flowArrow2}><Text style={styles.flowArrowText}>→</Text></View><View style={styles.flowArrow3}><Text style={styles.flowArrowText}>→</Text></View><View style={styles.flowArrow4}><Text style={styles.flowArrowText}>↑</Text></View>

          <View style={styles.cardsOverlay}>
            <QueueCard icon="🚪" title="Entree" value={entryQ} capacity={entryCapacity} rateText={`${rate(6, entryLevel, 3)}/s`} hot={bottleneck[0] === 'ENTREE'} />
            <QueueCard icon="🎫" title="Tickets" value={ticketQ} capacity={ticketCapacity} rateText={`${rate(5, ticketLevel, 3)}/s`} hot={bottleneck[0] === 'TICKETS'} />
            <QueueCard icon="🛂" title="Security" value={securityQ} capacity={securityCapacity} rateText={`${rate(4, securityLevel, 3)}/s`} hot={bottleneck[0] === 'SECURITY'} />
          </View>
        </Animated.View>

        <View style={styles.dragHint}><Text style={styles.dragHintText}>↔↕ sleep over het station</Text></View>
        <View style={styles.message}><Text style={styles.messageText}>{message}</Text></View>
      </View>

      <View style={styles.statsStrip}><Text style={styles.stat}>🚆 {departures} vertrek</Text><Text style={styles.stat}>👥 {served} vervoerd</Text><Text style={styles.stat}>❌ {lost} gemist</Text><Text style={styles.stat}>{managerLevel > 0 ? '🤖 auto' : '👆 handmatig'}</Text></View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.upgradeDock} contentContainerStyle={styles.upgradeRail}>
        <UpgradeCard icon="🚪" title="Entree" level={entryLevel} detail={`${entryCapacity} cap.`} cost={upgradeCost(180, entryLevel)} cash={cash} onPress={() => upgrade('entry')} hot={bottleneck[0] === 'ENTREE'} />
        <UpgradeCard icon="🎫" title="Tickets" level={ticketLevel} detail={`${rate(5, ticketLevel, 3)}/s`} cost={upgradeCost(260, ticketLevel)} cash={cash} onPress={() => upgrade('ticket')} hot={bottleneck[0] === 'TICKETS'} />
        <UpgradeCard icon="🛂" title="Security" level={securityLevel} detail={`${rate(4, securityLevel, 3)}/s`} cost={upgradeCost(360, securityLevel)} cash={cash} onPress={() => upgrade('security')} hot={bottleneck[0] === 'SECURITY'} />
        <UpgradeCard icon="🏢" title="Hal" level={hallLevel} detail={`${hallCapacity} cap.`} cost={upgradeCost(500, hallLevel)} cash={cash} onPress={() => upgrade('hall')} hot={bottleneck[0] === 'HAL'} />
        <UpgradeCard icon="🚉" title="Perron" level={platformLevel} detail={`${platformCapacity} cap.`} cost={upgradeCost(700, platformLevel)} cash={cash} onPress={() => upgrade('platform')} hot={bottleneck[0] === 'PERRON'} />
        <UpgradeCard icon="🚆" title="Treinen" level={trainLevel} detail={`${120 + trainLevel * 90} plaatsen`} cost={upgradeCost(950, trainLevel)} cash={cash} onPress={() => upgrade('train')} hot={bottleneck[0] === 'TREIN'} />
        <UpgradeCard icon="☕" title="Retail" level={retailLevel} detail="passieve omzet" cost={upgradeCost(430, retailLevel)} cash={cash} onPress={() => upgrade('retail')} />
        <UpgradeCard icon="🤖" title="Manager" level={managerLevel} detail={managerLevel ? 'auto-vertrek' : 'automatisering'} cost={upgradeCost(2100, Math.max(1, managerLevel + 1), 1.8)} cash={cash} onPress={() => upgrade('manager')} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#081218' },
  menu: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 30, backgroundColor: '#0a1720' },
  menuTag: { color: '#76c5ef', fontSize: 9, fontWeight: '900', letterSpacing: 2, marginBottom: 12 },
  logo: { color: '#f2f6f7', fontSize: 48, lineHeight: 44, fontWeight: '900', letterSpacing: -2, textAlign: 'center' },
  menuCopy: { color: '#9db0b8', textAlign: 'center', fontSize: 13, lineHeight: 20, maxWidth: 390, marginTop: 18, marginBottom: 25 },
  startButton: { minWidth: 235, backgroundColor: '#f1c95e', borderRadius: 14, paddingVertical: 16, alignItems: 'center', borderWidth: 1, borderColor: '#ffe8a4' },
  startText: { color: '#142029', fontWeight: '900', fontSize: 14, letterSpacing: 1 },
  devNote: { color: '#566e79', fontSize: 7, fontWeight: '800', marginTop: 15, letterSpacing: 1 },

  hud: { height: 55, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', backgroundColor: '#0b1921', borderBottomWidth: 1, borderBottomColor: '#29424e' },
  hudLabel: { color: '#708893', fontSize: 6, fontWeight: '900', textAlign: 'center' },
  cash: { color: '#69e19a', fontSize: 13, fontWeight: '900', marginTop: 2, textAlign: 'center' },
  hudValue: { color: '#eaf1f3', fontSize: 12, fontWeight: '900', marginTop: 2, textAlign: 'center' },
  bottleneck: { color: '#ffc86a', fontSize: 8, fontWeight: '900', marginTop: 3, textAlign: 'center' },

  missionCard: { backgroundColor: '#10242e', borderBottomWidth: 1, borderBottomColor: '#2c4a59', paddingHorizontal: 9, paddingVertical: 6 },
  missionTop: { flexDirection: 'row', justifyContent: 'space-between' },
  missionTitle: { color: '#d9e7ec', fontSize: 7, fontWeight: '900' },
  missionReward: { color: '#f1c95e', fontSize: 7, fontWeight: '900' },
  missionText: { color: '#8098a3', fontSize: 6, marginTop: 3 },
  missionTrack: { height: 4, backgroundColor: '#21343d', borderRadius: 3, overflow: 'hidden', marginTop: 3 },
  missionFill: { height: '100%', backgroundColor: '#69c7f1' },
  claimButton: { position: 'absolute', right: 8, bottom: 5, backgroundColor: '#54bd7e', paddingHorizontal: 13, paddingVertical: 4, borderRadius: 6 },
  claimText: { color: '#fff', fontSize: 6, fontWeight: '900' },
  claimedText: { position: 'absolute', right: 8, bottom: 7, color: '#69df98', fontSize: 6.5, fontWeight: '900' },

  cameraBar: { height: 38, flexDirection: 'row', gap: 5, padding: 5, backgroundColor: '#0b1820', borderBottomWidth: 1, borderBottomColor: '#263d48' },
  cameraButton: { flex: 1, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#355b6e', borderRadius: 7, backgroundColor: '#132730' },
  cameraText: { color: '#c6dce4', fontSize: 6, fontWeight: '900' },

  viewport: { flex: 1, overflow: 'hidden', backgroundColor: '#b9d99c', position: 'relative' },
  world: { position: 'absolute', width: WORLD_W, height: WORLD_H, left: 0, top: 0 },
  grass: { position: 'absolute', inset: 0, backgroundColor: '#b9d99c' },
  accessRoad: { position: 'absolute', left: 5, top: 610, width: 300, height: 105, backgroundColor: '#596467', transform: [{ rotateZ: '-14deg' }], borderRadius: 12 },
  roadLine: { position: 'absolute', left: 15, right: 15, top: 51, borderTopWidth: 2, borderTopColor: '#e8e4d7', borderStyle: 'dashed', opacity: 0.7 },
  forecourt: { position: 'absolute', left: 200, top: 545, width: 620, height: 170, backgroundColor: '#c9c5b9', borderWidth: 2, borderColor: '#e6e2d9', transform: [{ skewY: '-6deg' }], borderRadius: 12 },
  parking: { position: 'absolute', left: 40, top: 520, width: 190, height: 150, backgroundColor: '#7e898b', borderWidth: 2, borderColor: '#cfd7d7', borderRadius: 12, transform: [{ rotateZ: '-6deg' }] },
  parkingText: { position: 'absolute', left: 12, top: 8, color: '#f1f6f6', fontSize: 16, fontWeight: '900' },
  car: { position: 'absolute', width: 18, height: 9, borderRadius: 3, borderWidth: 1, borderColor: '#edf3f4' },

  trackBed: { position: 'absolute', left: 250, top: 85, width: 760, height: 82, backgroundColor: '#626a6d', borderRadius: 5, transform: [{ rotateZ: '-5deg' }] },
  sleeper: { position: 'absolute', top: 15, width: 6, height: 52, backgroundColor: '#5a4434', opacity: 0.9 },
  rail: { position: 'absolute', left: 5, right: 5, height: 3, backgroundColor: '#d0d8dc' },
  trainWrap: { position: 'absolute', left: 355, top: 80, width: 490, height: 90, zIndex: 20 },
  trainWrapReady: { transform: [{ scale: 1.015 }] },
  trainShadow: { position: 'absolute', left: 5, top: 35, width: 390, height: 27, borderRadius: 14, backgroundColor: 'rgba(18,28,34,0.18)', transform: [{ rotateZ: '-5deg' }] },
  train: { position: 'absolute', left: 0, top: 13, width: 405, height: 38, borderRadius: 10, borderWidth: 3, backgroundColor: '#eaf1f3', transform: [{ rotateZ: '-5deg' }], overflow: 'visible' },
  trainReady: { backgroundColor: '#c5f2d2' },
  trainNose: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 28, borderTopLeftRadius: 7, borderBottomLeftRadius: 7 },
  trainRoof: { position: 'absolute', left: 45, right: 30, top: 2, height: 4, borderRadius: 3, backgroundColor: '#bdcbd0' },
  trainWindows: { position: 'absolute', left: 48, right: 60, top: 9, flexDirection: 'row', justifyContent: 'space-between' },
  trainWindow: { width: 27, height: 9, borderRadius: 2, backgroundColor: '#2a566b', borderWidth: 1, borderColor: '#8db7c8' },
  trainDoor: { position: 'absolute', right: 24, top: 11, width: 16, height: 22, backgroundColor: '#bed2da', borderWidth: 1, borderColor: '#637a84' },
  trainBelt: { position: 'absolute', left: 28, right: 0, top: 23, height: 3, backgroundColor: '#8199a3' },
  trainWheels: { position: 'absolute', left: 65, right: 50, bottom: -6, flexDirection: 'row', justifyContent: 'space-between' },
  wheel: { width: 12, height: 12, borderRadius: 7, backgroundColor: '#26343a', borderWidth: 2, borderColor: '#63747b' },
  trainLabel: { position: 'absolute', left: 410, top: 0, width: 120, backgroundColor: 'rgba(7,17,23,0.94)', padding: 7, borderRadius: 8, borderWidth: 1, borderColor: '#3b5966' },
  trainDest: { color: '#eff5f6', fontSize: 8, fontWeight: '900' },
  trainLoad: { color: '#b4c7ce', fontSize: 7, marginTop: 3, fontWeight: '800' },
  trainFillTrack: { height: 5, borderRadius: 3, backgroundColor: '#24373f', overflow: 'hidden', marginTop: 4 },
  trainFill: { height: '100%' },
  trainAction: { color: '#708690', fontSize: 5.2, fontWeight: '900', marginTop: 4 },
  trainActionReady: { color: '#6ce097' },
  emptyTrackLabel: { position: 'absolute', left: 550, top: 118, backgroundColor: '#263840', padding: 8, borderRadius: 7 },
  emptyTrackText: { color: '#c6d5da', fontSize: 7, fontWeight: '800' },

  stationShell: { position: 'absolute', left: 245, top: 265, width: 650, height: 355, backgroundColor: '#e7e8df', borderRadius: 18, borderWidth: 4, borderColor: '#516b78', shadowColor: '#17272f', shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 8, height: 12 } },
  stationRoof: { position: 'absolute', left: 0, top: 0, right: 0, height: 58, backgroundColor: '#334c58', borderTopLeftRadius: 14, borderTopRightRadius: 14, paddingLeft: 20, paddingTop: 12 },
  stationName: { color: '#f3f7f8', fontSize: 13, fontWeight: '900', letterSpacing: 0.4 },
  stationSub: { color: '#a9c0ca', fontSize: 5.5, fontWeight: '800', marginTop: 2 },
  mainCorridor: { position: 'absolute', left: 15, right: 15, top: 170, height: 55, borderRadius: 10, backgroundColor: '#d3d4cc', borderWidth: 1, borderColor: '#b7bbb6' },
  zone: { position: 'absolute', borderRadius: 10, backgroundColor: '#f4f3eb', borderWidth: 2, borderColor: '#b8c2c4', overflow: 'hidden', padding: 7 },
  zoneHot: { borderColor: '#f17862', borderWidth: 4, backgroundColor: '#fff2ee' },
  zoneAccent: { position: 'absolute', left: 0, right: 0, top: 0, height: 6 },
  zoneTitle: { color: '#263d48', fontSize: 8, fontWeight: '900', marginTop: 4 },
  zoneSub: { color: '#71848c', fontSize: 5.5, fontWeight: '800', marginBottom: 4 },
  entryZone: { left: 12, top: 72, width: 105, height: 245 },
  ticketZone: { left: 126, top: 72, width: 112, height: 245 },
  securityZone: { left: 247, top: 72, width: 112, height: 245 },
  hallZone: { left: 368, top: 72, width: 165, height: 245 },
  gateZone: { left: 542, top: 72, width: 96, height: 245 },
  dotCloud: { flexDirection: 'row', flexWrap: 'wrap', gap: 3, alignContent: 'flex-start', minHeight: 56, marginTop: 2 },
  person: { width: 8, height: 13, alignItems: 'center' },
  personHead: { width: 4, height: 4, borderRadius: 3, backgroundColor: '#efc79d' },
  personBody: { width: 5, height: 7, borderRadius: 1.5, marginTop: 1 },
  turnstiles: { marginTop: 'auto', flexDirection: 'row', gap: 4 },
  turnstile: { width: 13, height: 34, backgroundColor: '#536e79', borderRadius: 3, borderWidth: 1, borderColor: '#9fb3bb' },
  greenLamp: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#52d98b', marginLeft: 3, marginTop: 4 },
  counterRow: { marginTop: 'auto', flexDirection: 'row', gap: 4 },
  counter: { width: 22, height: 35, backgroundColor: '#c19756', borderRadius: 3, borderWidth: 1, borderColor: '#7a684e' },
  counterScreen: { width: 9, height: 6, borderRadius: 1, backgroundColor: '#31586b', marginLeft: 6, marginTop: 4 },
  securityRow: { marginTop: 'auto', flexDirection: 'row', gap: 5 },
  scanner: { width: 25, height: 38, borderRadius: 4, borderWidth: 4, borderColor: '#67757b', borderBottomWidth: 8, backgroundColor: '#d8dedf' },
  shopRow: { marginTop: 'auto', flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  shop: { width: 45, height: 28, borderRadius: 4, backgroundColor: '#80533a', borderTopWidth: 6, borderTopColor: '#d89a5c', alignItems: 'center', justifyContent: 'center' },
  shopText: { color: '#fff0d8', fontSize: 5, fontWeight: '900' },
  bench: { width: 43, height: 8, backgroundColor: '#805a3b', borderRadius: 2 },
  gateDoors: { marginTop: 'auto', gap: 7, alignItems: 'center' },
  gateDoor: { width: 55, height: 16, borderRadius: 3, backgroundColor: '#6d8ea0', borderWidth: 2, borderColor: '#b7d0dc' },

  platform: { position: 'absolute', left: 310, top: 180, width: 600, height: 105, backgroundColor: '#c4c2b9', borderRadius: 10, borderWidth: 3, borderColor: '#ede9df', padding: 8, zIndex: 5, transform: [{ rotateZ: '-2deg' }] },
  platformHot: { borderColor: '#f17862', borderWidth: 5 },
  platformEdge: { position: 'absolute', left: 5, right: 5, top: 8, height: 6, backgroundColor: '#e7cd61', borderRadius: 3 },
  canopy: { position: 'absolute', left: 170, top: 23, width: 250, height: 24, backgroundColor: '#557682', borderRadius: 5, borderWidth: 1, borderColor: '#b8ccd2' },
  canopyGlass: { position: 'absolute', left: 10, right: 10, top: 5, height: 12, backgroundColor: 'rgba(148,201,219,0.45)' },
  platformTitle: { color: '#263a43', fontSize: 8, fontWeight: '900', marginTop: 12 },
  platformSub: { color: '#687a82', fontSize: 5.5, fontWeight: '800' },
  platformBench: { position: 'absolute', left: 220, bottom: 16, width: 55, height: 8, borderRadius: 2, backgroundColor: '#78563b' },
  flowArrow1: { position: 'absolute', left: 350, top: 445 },
  flowArrow2: { position: 'absolute', left: 470, top: 445 },
  flowArrow3: { position: 'absolute', left: 590, top: 445 },
  flowArrow4: { position: 'absolute', left: 820, top: 310 },
  flowArrowText: { color: '#6b8d9a', fontSize: 24, fontWeight: '900', opacity: 0.5 },

  cardsOverlay: { position: 'absolute', left: 70, top: 115, flexDirection: 'row', gap: 7 },
  queueCard: { width: 112, padding: 8, backgroundColor: 'rgba(9,22,29,0.94)', borderRadius: 9, borderWidth: 1, borderColor: '#536f7b' },
  queueCardHot: { borderColor: '#f17961', borderWidth: 2 },
  queueCardTop: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  queueIcon: { fontSize: 10 },
  queueTitle: { color: '#a9bec7', fontSize: 6, fontWeight: '900' },
  queueValue: { color: '#ecf3f5', fontSize: 10, fontWeight: '900', marginTop: 3 },
  queueValueHot: { color: '#ff9a87' },
  miniTrack: { height: 4, backgroundColor: '#263c45', borderRadius: 2, overflow: 'hidden', marginTop: 3 },
  miniFill: { height: '100%', backgroundColor: '#5abcf0' },
  miniFillHot: { backgroundColor: '#ef7b64' },
  queueRate: { color: '#6f8791', fontSize: 5.5, fontWeight: '800', marginTop: 3 },

  dragHint: { position: 'absolute', right: 8, top: 8, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 7, backgroundColor: 'rgba(7,17,23,0.8)', borderWidth: 1, borderColor: '#425d68' },
  dragHintText: { color: '#d4e3e8', fontSize: 6, fontWeight: '900' },
  message: { position: 'absolute', left: 8, right: 8, bottom: 8, minHeight: 38, justifyContent: 'center', paddingHorizontal: 10, borderRadius: 9, backgroundColor: 'rgba(7,16,22,0.94)', borderWidth: 1, borderColor: '#34515e' },
  messageText: { color: '#c6d5da', fontSize: 7.6, lineHeight: 11, fontWeight: '700' },

  statsStrip: { minHeight: 28, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', backgroundColor: '#0c1920', borderTopWidth: 1, borderTopColor: '#263d47' },
  stat: { color: '#8da4ae', fontSize: 6, fontWeight: '800' },
  upgradeDock: { maxHeight: 108, backgroundColor: '#071116', borderTopWidth: 1, borderTopColor: '#263a43' },
  upgradeRail: { gap: 7, padding: 7 },
  upgrade: { width: 150, minHeight: 91, backgroundColor: '#eef2f3', borderRadius: 11, borderWidth: 2, borderColor: '#526d79', padding: 7, flexDirection: 'row', alignItems: 'center', gap: 7 },
  upgradeAffordable: { borderColor: '#dcb24f' },
  upgradeHot: { borderColor: '#ef765f', borderWidth: 3, backgroundColor: '#fff1ed' },
  upgradeLocked: { opacity: 0.45 },
  upgradeIconBox: { width: 32, height: 32, borderRadius: 9, backgroundColor: '#d9e5e8', alignItems: 'center', justifyContent: 'center' },
  upgradeIcon: { fontSize: 18 },
  upgradeCopy: { flex: 1 },
  upgradeTitle: { color: '#183747', fontSize: 7.5, fontWeight: '900' },
  upgradeDetail: { color: '#657b85', fontSize: 5.4, fontWeight: '700', marginTop: 2 },
  upgradeCost: { color: '#2f7d48', fontSize: 5.8, fontWeight: '900' },
});