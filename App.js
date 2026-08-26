import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';

const DESTINATIONS = [
  { id: 'noorddam', name: 'Noorddam', code: 'NDR', fare: 1, unlock: 1 },
  { id: 'havenstad', name: 'Havenstad', code: 'HVN', fare: 2, unlock: 1 },
  { id: 'oostpoort', name: 'Oostpoort', code: 'OOS', fare: 3, unlock: 2 },
  { id: 'luchthaven', name: 'Luchthaven', code: 'AIR', fare: 4, unlock: 3 },
];

const TRAIN_TYPES = [
  { code: 'SPR', name: 'Sprinter', setCapacity: 180, dwell: 7 },
  { code: 'IC', name: 'Intercity', setCapacity: 260, dwell: 9 },
  { code: 'EXP', name: 'Express', setCapacity: 340, dwell: 11 },
];

const SAVE_KEY = 'rail-rush-hour-v011';
const TICK_MS = 1000;
const SERVICE_INTERVAL = 16;
const DELAY_MARGIN = 12;

const money = (value) => `€${Math.max(0, Math.round(value)).toLocaleString('nl-NL')}`;
const sum = (obj) => Object.values(obj).reduce((a, b) => a + b, 0);
const clampPct = (value, max) => Math.max(0, Math.min(100, Math.round((value / Math.max(1, max)) * 100)));
const levelTarget = (level) => 450 + level * 250;

const parkingCap = (lv) => 45 + lv * 55;
const parkingInflow = (lv) => 2 + lv * 3;
const parkingCost = (lv) => 450 + lv * 520;

const entranceBuffer = (lv) => 30 + lv * 35;
const gateRate = (lv) => 4 + lv * 5;
const gateCost = (lv) => 600 + lv * 620;

const hallCap = (lv) => 120 + lv * 190;
const hallRate = (lv) => 6 + lv * 6;
const hallCost = (lv) => 800 + lv * 760;

const platformCap = (lv) => 75 + lv * 85;
const platformCost = (lv) => 950 + lv * 850;

const fleetCost = (lv) => 1200 + lv * 1050;
const retailCost = (lv) => 700 + lv * 650;
const ticketCost = (lv) => 850 + lv * 700;
const platform3Cost = 2800;
const retailIncome = (lv) => 1 + lv * 2;
const fareMultiplier = (lv) => 1 + (lv - 1) * 0.12;

const clock = (seconds) => {
  const total = 8 * 3600 + Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600) % 24;
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

const emptyDemand = () => ({ noorddam: 0, havenstad: 0, oostpoort: 0, luchthaven: 0 });

const safeLoad = () => {
  try {
    if (!globalThis?.localStorage) return null;
    const raw = globalThis.localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const safeSave = (data) => {
  try {
    if (globalThis?.localStorage) globalThis.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    // Web prototype keeps running without persistence.
  }
};

function FlowPeople({ amount, label, vertical = true }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(anim, { toValue: 1, duration: 1800, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [anim]);

  const people = Math.min(12, Math.max(0, Math.ceil(amount / 3)));
  const move = anim.interpolate({ inputRange: [0, 1], outputRange: [0, vertical ? 42 : 72] });

  return (
    <View style={[styles.flow, vertical ? styles.flowVertical : styles.flowHorizontal]}>
      <Text style={styles.flowLabel}>{label}</Text>
      <View style={styles.flowTrack}>
        {Array.from({ length: people }).map((_, i) => (
          <Animated.View
            key={i}
            style={[
              styles.person,
              vertical
                ? { left: 8 + (i % 4) * 13, top: -5 - Math.floor(i / 4) * 11, transform: [{ translateY: move }] }
                : { top: 7 + (i % 3) * 9, left: -7 - Math.floor(i / 3) * 14, transform: [{ translateX: move }] },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

function Meter({ label, value, max, subtitle }) {
  const p = clampPct(value, max);
  const danger = p >= 90;
  return (
    <View style={styles.meter}>
      <View style={styles.meterTop}>
        <Text style={styles.meterLabel}>{label}</Text>
        <Text style={[styles.meterValue, danger && styles.dangerText]}>{value}/{max} • {p}%</Text>
      </View>
      <View style={styles.meterTrack}><View style={[styles.meterFill, danger && styles.meterFillDanger, { width: `${p}%` }]} /></View>
      <Text style={styles.meterSub}>{subtitle}</Text>
    </View>
  );
}

function CarPark({ level, queue }) {
  const slots = Math.min(24, 6 + level * 4);
  const busy = Math.round((queue / Math.max(1, parkingCap(level))) * slots);
  return (
    <View style={styles.carGrid}>
      {Array.from({ length: slots }).map((_, i) => (
        <View key={i} style={[styles.carSlot, i < busy && styles.carSlotBusy]}>
          <Text style={styles.carGlyph}>{i < busy ? '▰' : '·'}</Text>
        </View>
      ))}
    </View>
  );
}

function GateVisual({ level }) {
  const gates = Math.min(7, 1 + level);
  return (
    <View style={styles.gates}>
      {Array.from({ length: gates }).map((_, i) => (
        <View key={i} style={styles.gate}><View style={styles.gateLight} /></View>
      ))}
    </View>
  );
}

function Crowd({ count, max, tiny = false }) {
  const dots = Math.min(tiny ? 15 : 36, Math.max(0, Math.ceil((count / Math.max(1, max)) * (tiny ? 15 : 36))));
  return (
    <View style={[styles.crowd, tiny && styles.crowdTiny]}>
      {Array.from({ length: dots }).map((_, i) => <View key={i} style={[styles.crowdDot, i % 5 === 0 && styles.crowdDotAccent]} />)}
    </View>
  );
}

function Train({ train, onPress, ready, late }) {
  if (!train) return null;
  const body = (
    <View style={styles.trainBodyRow}>
      {Array.from({ length: train.sets }).map((_, i) => (
        <React.Fragment key={i}>
          {i > 0 ? <View style={styles.coupler} /> : null}
          <View style={[styles.trainSet, ready && styles.trainSetReady, late && styles.trainSetLate]}>
            <View style={styles.cab} />
            <View style={styles.windows}><View style={styles.window} /><View style={styles.window} /><View style={styles.window} /></View>
            <Text style={styles.trainCode}>{train.type.code}</Text>
          </View>
        </React.Fragment>
      ))}
    </View>
  );
  if (!onPress) return body;
  return <Pressable hitSlop={12} onPress={onPress} style={styles.trainPress}>{body}</Pressable>;
}

function BalanceBar({ data }) {
  const worst = [...data].sort((a, b) => b.pressure - a.pressure)[0];
  return (
    <View style={styles.balanceCard}>
      <View style={styles.balanceHead}>
        <Text style={styles.balanceTitle}>OPBOUWENDE CAPACITEITSBALANS</Text>
        <Text style={styles.balanceWorst}>VOLGEND PROBLEEM: {worst.label}</Text>
      </View>
      <View style={styles.balanceStages}>
        {data.map((item, index) => (
          <React.Fragment key={item.label}>
            {index > 0 ? <Text style={styles.balanceArrow}>›</Text> : null}
            <View style={[styles.balanceStage, item.pressure >= 90 && styles.balanceStageBad]}>
              <Text style={styles.balanceStageLabel}>{item.label}</Text>
              <Text style={styles.balanceStageValue}>{Math.min(999, item.pressure)}%</Text>
            </View>
          </React.Fragment>
        ))}
      </View>
      <Text style={styles.balanceHint}>Meer aanvoer is alleen nuttig als alle volgende schakels kunnen meegroeien.</Text>
    </View>
  );
}

function Upgrade({ title, level, description, cost, cash, onPress, focus, done }) {
  return (
    <Pressable disabled={done} onPress={onPress} style={[styles.upgrade, cash >= cost && !done && styles.upgradeAffordable, focus && styles.upgradeFocus, done && styles.upgradeDone]}>
      <View style={styles.upgradeTop}><Text style={styles.upgradeTitle}>{title}</Text><Text style={styles.upgradeLevel}>{done ? 'OPEN' : `Lv ${level}`}</Text></View>
      <Text style={styles.upgradeDesc}>{description}</Text>
      <Text style={styles.upgradeCost}>{done ? 'ACTIEF' : money(cost)}</Text>
    </Pressable>
  );
}

function Timetable({ services, now }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}><Text style={styles.cardTitle}>VOLGENDE TREINEN</Text><Text style={styles.clock}>{clock(now)}</Text></View>
      {services.filter((s) => s.status !== 'departed').slice(0, 5).map((s) => {
        const depIn = s.departureAt - now;
        let status = s.status.toUpperCase();
        if (s.status === 'scheduled') status = `IN ${Math.max(0, s.arrivalAt - now)}s`;
        if (s.status === 'waiting') status = 'WACHT BUITEN';
        if (s.status === 'arriving') status = `→ P${s.actualLane}`;
        if (s.status === 'platform') status = depIn > 0 ? `V OVER ${depIn}s` : depIn >= -DELAY_MARGIN ? `${Math.max(0, DELAY_MARGIN + depIn)}s MARGE` : `+${Math.abs(depIn + DELAY_MARGIN)}s`;
        return (
          <View key={s.id} style={styles.serviceRow}>
            <Text style={styles.serviceTime}>{clock(s.departureAt).slice(0, 5)}</Text>
            <View style={styles.serviceMain}><Text style={styles.serviceId}>{s.number}</Text><Text style={styles.serviceDest}>→ {s.destination.name}</Text></View>
            <Text style={styles.servicePlatform}>P{s.actualLane || s.plannedLane}</Text>
            <Text style={styles.serviceStatus}>{status}</Text>
          </View>
        );
      })}
    </View>
  );
}

export default function App() {
  const saved = useRef(safeLoad()).current;
  const [phase, setPhase] = useState('menu');
  const [now, setNow] = useState(0);
  const [message, setMessage] = useState('');

  const [cash, setCash] = useState(saved?.cash ?? 500);
  const [stationLevel, setStationLevel] = useState(saved?.stationLevel ?? 1);
  const [xp, setXp] = useState(saved?.xp ?? 0);
  const [parkingLevel, setParkingLevel] = useState(saved?.parkingLevel ?? 1);
  const [gateLevel, setGateLevel] = useState(saved?.gateLevel ?? 1);
  const [hallLevel, setHallLevel] = useState(saved?.hallLevel ?? 1);
  const [platformLevel, setPlatformLevel] = useState(saved?.platformLevel ?? 1);
  const [fleetLevel, setFleetLevel] = useState(saved?.fleetLevel ?? 1);
  const [retailLevel, setRetailLevel] = useState(saved?.retailLevel ?? 1);
  const [ticketLevel, setTicketLevel] = useState(saved?.ticketLevel ?? 1);
  const [platform3, setPlatform3] = useState(Boolean(saved?.platform3));

  const [parkingQueue, setParkingQueue] = useState(15);
  const [entranceQueue, setEntranceQueue] = useState(8);
  const [hallDemand, setHallDemand] = useState(emptyDemand());
  const [platformDemand, setPlatformDemand] = useState(emptyDemand());
  const [platforms, setPlatforms] = useState({ 1: null, 2: null, 3: null });
  const [services, setServices] = useState([]);
  const [outside, setOutside] = useState([]);
  const [handled, setHandled] = useState(saved?.handled ?? 0);
  const [lost, setLost] = useState(saved?.lost ?? 0);
  const [transported, setTransported] = useState(saved?.transported ?? 0);
  const [onTime, setOnTime] = useState(saved?.onTime ?? 0);

  const nowRef = useRef(0);
  const cashRef = useRef(cash);
  const stationLevelRef = useRef(stationLevel);
  const xpRef = useRef(xp);
  const parkingLevelRef = useRef(parkingLevel);
  const gateLevelRef = useRef(gateLevel);
  const hallLevelRef = useRef(hallLevel);
  const platformLevelRef = useRef(platformLevel);
  const fleetLevelRef = useRef(fleetLevel);
  const retailLevelRef = useRef(retailLevel);
  const ticketLevelRef = useRef(ticketLevel);
  const platform3Ref = useRef(platform3);
  const parkingRef = useRef(15);
  const entranceRef = useRef(8);
  const hallRef = useRef(emptyDemand());
  const platformDemandRef = useRef(emptyDemand());
  const platformsRef = useRef({ 1: null, 2: null, 3: null });
  const servicesRef = useRef([]);
  const outsideRef = useRef([]);
  const handledRef = useRef(handled);
  const lostRef = useRef(lost);
  const transportedRef = useRef(transported);
  const onTimeRef = useRef(onTime);
  const serviceIndex = useRef(0);
  const nextServiceAt = useRef(3);
  const demandCursor = useRef(0);
  const arrivalBusy = useRef(false);

  const syncParking = (v) => { parkingRef.current = v; setParkingQueue(v); };
  const syncEntrance = (v) => { entranceRef.current = v; setEntranceQueue(v); };
  const syncHall = (v) => { hallRef.current = v; setHallDemand(v); };
  const syncPlatformDemand = (v) => { platformDemandRef.current = v; setPlatformDemand(v); };
  const syncPlatforms = (v) => { platformsRef.current = v; setPlatforms(v); };
  const syncServices = (v) => { servicesRef.current = v; setServices(v); };
  const syncOutside = (v) => { outsideRef.current = v; setOutside(v); };

  const persist = () => safeSave({
    cash: Math.round(cashRef.current), stationLevel: stationLevelRef.current, xp: Math.round(xpRef.current),
    parkingLevel: parkingLevelRef.current, gateLevel: gateLevelRef.current, hallLevel: hallLevelRef.current,
    platformLevel: platformLevelRef.current, fleetLevel: fleetLevelRef.current, retailLevel: retailLevelRef.current,
    ticketLevel: ticketLevelRef.current, platform3: platform3Ref.current, handled: handledRef.current,
    lost: lostRef.current, transported: transportedRef.current, onTime: onTimeRef.current, lastSaved: Date.now(),
  });

  const addCash = (value) => { cashRef.current += value; setCash(Math.round(cashRef.current)); };
  const spend = (value) => {
    if (cashRef.current < value) return false;
    cashRef.current -= value;
    setCash(Math.round(cashRef.current));
    return true;
  };

  const awardXp = (value) => {
    let nextXp = xpRef.current + value;
    let nextLevel = stationLevelRef.current;
    while (nextXp >= levelTarget(nextLevel)) {
      nextXp -= levelTarget(nextLevel);
      nextLevel += 1;
    }
    xpRef.current = nextXp;
    stationLevelRef.current = nextLevel;
    setXp(Math.round(nextXp));
    setStationLevel(nextLevel);
  };

  const makeService = (arrivalAt) => {
    const i = serviceIndex.current++;
    const type = TRAIN_TYPES[i % TRAIN_TYPES.length];
    const destinations = DESTINATIONS.filter((d) => d.unlock <= stationLevelRef.current);
    const destination = destinations[i % destinations.length];
    const lanes = platform3Ref.current ? [1, 2, 3] : [1, 2];
    const plannedLane = lanes[i % lanes.length];
    const sets = fleetLevelRef.current <= 1 ? 1 + (i % 2) : fleetLevelRef.current === 2 ? 2 + (i % 2) : 3;
    const capacity = type.setCapacity * sets;
    return {
      id: `svc-${i}-${arrivalAt}`,
      number: `${type.code} ${1700 + i * 4 + 2}`,
      type,
      destination,
      plannedLane,
      actualLane: null,
      arrivalAt,
      departureAt: arrivalAt + type.dwell + 5,
      sets,
      capacity,
      onboard: Math.round(capacity * 0.38),
      status: 'scheduled',
      remaining: type.dwell,
      wait: 0,
    };
  };

  const updateService = (id, patch) => syncServices(servicesRef.current.map((s) => s.id === id ? { ...s, ...patch } : s));

  const tryArrival = () => {
    if (arrivalBusy.current || !outsideRef.current.length) return;
    const train = outsideRef.current[0];
    const planned = train.plannedLane;
    if (!platformsRef.current[planned]) {
      arrivalBusy.current = true;
      syncOutside(outsideRef.current.slice(1));
      updateService(train.id, { status: 'arriving', actualLane: planned });
      setTimeout(() => {
        const arrived = { ...train, status: 'dwelling', actualLane: planned, remaining: train.type.dwell };
        syncPlatforms({ ...platformsRef.current, [planned]: arrived });
        updateService(train.id, { status: 'platform', actualLane: planned });
        arrivalBusy.current = false;
        setMessage(`${train.number} is automatisch binnen op P${planned}.`);
      }, 2200);
    }
  };

  const divert = (lane) => {
    const train = outsideRef.current[0];
    if (!train || platformsRef.current[lane] || (lane === 3 && !platform3Ref.current)) return;
    arrivalBusy.current = true;
    syncOutside(outsideRef.current.slice(1));
    updateService(train.id, { status: 'arriving', actualLane: lane });
    setMessage(`${train.number}: perronwijziging P${train.plannedLane} → P${lane}. Reizigers verplaatsen mee.`);
    setTimeout(() => {
      syncPlatforms({ ...platformsRef.current, [lane]: { ...train, status: 'dwelling', actualLane: lane, remaining: train.type.dwell } });
      updateService(train.id, { status: 'platform', actualLane: lane });
      arrivalBusy.current = false;
    }, 2200);
  };

  const depart = (lane) => {
    const train = platformsRef.current[lane];
    if (!train) return;
    if (train.status !== 'ready') return setMessage(`${train.number} is nog niet gereed: ${train.remaining}s reizigerswissel.`);
    if (nowRef.current < train.departureAt) return setMessage(`${train.number} mag nog niet vertrekken. Nog ${train.departureAt - nowRef.current}s.`);

    const delay = nowRef.current - train.departureAt;
    const within = delay <= DELAY_MARGIN;
    const revenue = Math.round(train.onboard * train.destination.fare * fareMultiplier(ticketLevelRef.current));
    syncPlatforms({ ...platformsRef.current, [lane]: null });
    updateService(train.id, { status: 'departed' });
    handledRef.current += 1;
    transportedRef.current += train.onboard;
    if (within) onTimeRef.current += 1;
    setHandled(handledRef.current);
    setTransported(transportedRef.current);
    setOnTime(onTimeRef.current);
    addCash(revenue + (within ? 75 : 0));
    awardXp(Math.round(train.onboard / 4) + (within ? 45 : 10));
    setMessage(`${train.number} vertrokken naar ${train.destination.name}: ${money(revenue)}${within ? ' + €75 op-tijdbonus' : ''}.`);
    persist();
    setTimeout(tryArrival, 100);
  };

  useEffect(() => {
    if (phase !== 'playing') return undefined;
    const timer = setInterval(() => {
      const t = nowRef.current + 1;
      nowRef.current = t;
      setNow(t);

      let nextServices = [...servicesRef.current];
      while (nextServices.filter((s) => s.status === 'scheduled').length < 6) {
        nextServices.push(makeService(nextServiceAt.current));
        nextServiceAt.current += SERVICE_INTERVAL;
      }
      const newlyDue = [];
      nextServices = nextServices.map((s) => {
        if (s.status === 'scheduled' && s.arrivalAt <= t) {
          const due = { ...s, status: 'waiting', wait: 0 };
          newlyDue.push(due);
          return due;
        }
        return s;
      });
      syncServices(nextServices);
      if (newlyDue.length) syncOutside([...outsideRef.current, ...newlyDue]);
      if (outsideRef.current.length) syncOutside(outsideRef.current.map((s) => ({ ...s, wait: (s.wait || 0) + 1 })));

      const inflow = parkingInflow(parkingLevelRef.current);
      const freeParking = Math.max(0, parkingCap(parkingLevelRef.current) - parkingRef.current);
      const enterParking = Math.min(inflow, freeParking);
      const rejected = inflow - enterParking;
      if (rejected > 0) { lostRef.current += rejected; setLost(lostRef.current); }
      let nextParking = parkingRef.current + enterParking;

      const freeEntrance = Math.max(0, entranceBuffer(gateLevelRef.current) - entranceRef.current);
      const toEntrance = Math.min(nextParking, gateRate(gateLevelRef.current), freeEntrance);
      nextParking -= toEntrance;
      let nextEntrance = entranceRef.current + toEntrance;

      const nextHall = { ...hallRef.current };
      const hallSpace = Math.max(0, hallCap(hallLevelRef.current) - sum(nextHall));
      const throughGates = Math.min(nextEntrance, gateRate(gateLevelRef.current), hallSpace);
      nextEntrance -= throughGates;
      const unlocked = DESTINATIONS.filter((d) => d.unlock <= stationLevelRef.current);
      for (let i = 0; i < throughGates; i += 1) {
        const d = unlocked[(demandCursor.current + i) % unlocked.length];
        nextHall[d.id] += 1;
      }
      demandCursor.current += throughGates;

      const nextPlatformDemand = { ...platformDemandRef.current };
      let hallFlowBudget = hallRate(hallLevelRef.current);
      unlocked.forEach((d) => {
        if (hallFlowBudget <= 0 || nextHall[d.id] <= 0) return;
        const nextService = servicesRef.current.find((s) => s.destination.id === d.id && !['departed'].includes(s.status));
        const lane = nextService?.actualLane || nextService?.plannedLane;
        if (!lane || (lane === 3 && !platform3Ref.current)) return;
        const waitingOnLane = unlocked.reduce((acc, candidate) => {
          const candidateService = servicesRef.current.find((s) => s.destination.id === candidate.id && s.status !== 'departed');
          const candidateLane = candidateService?.actualLane || candidateService?.plannedLane;
          return acc + (candidateLane === lane ? nextPlatformDemand[candidate.id] : 0);
        }, 0);
        const laneSpace = Math.max(0, platformCap(platformLevelRef.current) - waitingOnLane);
        const moved = Math.min(nextHall[d.id], hallFlowBudget, laneSpace);
        nextHall[d.id] -= moved;
        nextPlatformDemand[d.id] += moved;
        hallFlowBudget -= moved;
      });

      const nextPlatforms = { ...platformsRef.current };
      [1, 2, 3].forEach((lane) => {
        const current = nextPlatforms[lane];
        if (!current) return;
        const train = { ...current };
        const available = nextPlatformDemand[train.destination.id] || 0;
        const room = Math.max(0, train.capacity - train.onboard);
        const board = Math.min(available, room, 30 + train.sets * 12);
        nextPlatformDemand[train.destination.id] -= board;
        train.onboard += board;
        if (train.status === 'dwelling') {
          train.remaining = Math.max(0, train.remaining - 1);
          if (train.remaining === 0) train.status = 'ready';
        }
        nextPlatforms[lane] = train;
      });

      syncParking(nextParking);
      syncEntrance(nextEntrance);
      syncHall(nextHall);
      syncPlatformDemand(nextPlatformDemand);
      syncPlatforms(nextPlatforms);
      addCash(retailIncome(retailLevelRef.current));
      if (t % 10 === 0) persist();
      setTimeout(tryArrival, 30);
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [phase]);

  const begin = () => {
    nowRef.current = 0;
    serviceIndex.current = 0;
    nextServiceAt.current = 3;
    arrivalBusy.current = false;
    syncParking(15);
    syncEntrance(8);
    syncHall({ noorddam: 8, havenstad: 10, oostpoort: stationLevelRef.current >= 2 ? 5 : 0, luchthaven: stationLevelRef.current >= 3 ? 4 : 0 });
    syncPlatformDemand({ noorddam: 12, havenstad: 18, oostpoort: stationLevelRef.current >= 2 ? 7 : 0, luchthaven: stationLevelRef.current >= 3 ? 5 : 0 });
    syncPlatforms({ 1: null, 2: null, 3: null });
    syncOutside([]);
    const initial = [];
    for (let i = 0; i < 8; i += 1) {
      initial.push(makeService(nextServiceAt.current));
      nextServiceAt.current += SERVICE_INTERVAL;
    }
    syncServices(initial);
    setNow(0);
    setMessage('Station geopend. Kijk hoe de reizigers door elke capaciteitslaag schuiven.');
    setPhase('playing');
  };

  const upgradeParking = () => {
    const c = parkingCost(parkingLevelRef.current);
    if (!spend(c)) return setMessage('Niet genoeg geld voor parkeeruitbreiding.');
    parkingLevelRef.current += 1; setParkingLevel(parkingLevelRef.current);
    setMessage(`Parkeren Lv ${parkingLevelRef.current}: meer capaciteit én meer instroom. Nu zullen entree en poortjes sneller onder druk komen.`);
    persist();
  };
  const upgradeGates = () => {
    const c = gateCost(gateLevelRef.current);
    if (!spend(c)) return setMessage('Niet genoeg geld voor entree & poortjes.');
    gateLevelRef.current += 1; setGateLevel(gateLevelRef.current);
    setMessage(`Poortjes Lv ${gateLevelRef.current}: hogere doorstroom. De hal krijgt nu meer reizigers per seconde.`);
    persist();
  };
  const upgradeHall = () => {
    const c = hallCost(hallLevelRef.current);
    if (!spend(c)) return setMessage('Niet genoeg geld voor haluitbreiding.');
    hallLevelRef.current += 1; setHallLevel(hallLevelRef.current);
    setMessage(`Stationshal Lv ${hallLevelRef.current}: meer ruimte en sneller naar perrons.`);
    persist();
  };
  const upgradePlatforms = () => {
    const c = platformCost(platformLevelRef.current);
    if (!spend(c)) return setMessage('Niet genoeg geld voor grotere perrons.');
    platformLevelRef.current += 1; setPlatformLevel(platformLevelRef.current);
    setMessage(`Perroncapaciteit Lv ${platformLevelRef.current}: meer wachtenden mogelijk; treincapaciteit wordt waarschijnlijk het volgende knelpunt.`);
    persist();
  };
  const upgradeFleet = () => {
    const c = fleetCost(fleetLevelRef.current);
    if (!spend(c)) return setMessage('Niet genoeg geld voor langere treinen.');
    fleetLevelRef.current += 1; setFleetLevel(fleetLevelRef.current);
    setMessage(`Treinvloot Lv ${fleetLevelRef.current}: toekomstige treinen rijden met meer stellen.`);
    persist();
  };
  const upgradeRetail = () => {
    const c = retailCost(retailLevelRef.current);
    if (!spend(c)) return setMessage('Niet genoeg geld voor winkels.');
    retailLevelRef.current += 1; setRetailLevel(retailLevelRef.current);
    setMessage(`Winkelzone Lv ${retailLevelRef.current}: ${money(retailIncome(retailLevelRef.current))}/sec passief inkomen.`);
    persist();
  };
  const upgradeTickets = () => {
    const c = ticketCost(ticketLevelRef.current);
    if (!spend(c)) return setMessage('Niet genoeg geld voor service & tickets.');
    ticketLevelRef.current += 1; setTicketLevel(ticketLevelRef.current);
    setMessage(`Service Lv ${ticketLevelRef.current}: hogere opbrengst per vervoerde reiziger.`);
    persist();
  };
  const buildP3 = () => {
    if (platform3Ref.current) return;
    if (!spend(platform3Cost)) return setMessage('Niet genoeg geld voor Perron 3.');
    platform3Ref.current = true; setPlatform3(true);
    setMessage('Perron 3 geopend: meer spoorcapaciteit en betere spreiding van reizigers.');
    persist();
  };

  if (phase === 'menu') {
    return (
      <SafeAreaView style={styles.screen}>
        <StatusBar barStyle="light-content" />
        <View style={styles.menu}>
          <Text style={styles.kicker}>PASSENGER FLOW / V0.11</Text>
          <Text style={styles.logo}>RAIL{`\n`}RUSH HOUR</Text>
          <Text style={styles.subtitle}>Bouw capaciteit stap voor stap. Meer parkeerplaatsen trekken meer reizigers aan, waardoor poortjes, hal, perrons en treinen automatisch de volgende groeiproblemen worden.</Text>
          <Pressable style={styles.primary} onPress={begin}><Text style={styles.primaryText}>{saved ? 'GA VERDER' : 'OPEN STATION'}</Text></Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const hallTotal = sum(hallDemand);
  const platformTotal = sum(platformDemand);
  const openPlatforms = platform3 ? 3 : 2;
  const maxPlatformWaiting = Math.max(0, ...[1, 2, 3].filter((lane) => lane !== 3 || platform3).map((lane) => DESTINATIONS.reduce((acc, d) => {
    const s = services.find((svc) => svc.destination.id === d.id && svc.status !== 'departed');
    const assigned = s?.actualLane || s?.plannedLane;
    return acc + (assigned === lane ? platformDemand[d.id] : 0);
  }, 0)));
  const trainCapacityNow = Object.values(platforms).filter(Boolean).reduce((acc, t) => acc + t.capacity, 0) || openPlatforms * 180 * Math.max(1, fleetLevel);

  const balance = [
    { label: 'PARKEREN', pressure: clampPct(parkingQueue, parkingCap(parkingLevel)) },
    { label: 'ENTREE', pressure: clampPct(entranceQueue, entranceBuffer(gateLevel)) },
    { label: 'HAL', pressure: clampPct(hallTotal, hallCap(hallLevel)) },
    { label: 'PERRONS', pressure: clampPct(maxPlatformWaiting, platformCap(platformLevel)) },
    { label: 'TREINEN', pressure: Math.min(199, Math.round((platformTotal / Math.max(1, trainCapacityNow)) * 100)) },
  ];
  const bottleneck = [...balance].sort((a, b) => b.pressure - a.pressure)[0].label;
  const blocked = outside[0] && platforms[outside[0].plannedLane] ? outside[0] : null;

  const moveParkingToEntrance = Math.min(parkingQueue, gateRate(gateLevel));
  const moveEntranceToHall = Math.min(entranceQueue, gateRate(gateLevel));
  const moveHallToPlatforms = Math.min(hallTotal, hallRate(hallLevel));

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="light-content" />
      <View style={styles.hud}>
        <View style={styles.hudCell}><Text style={styles.hudLabel}>KAS</Text><Text style={styles.hudMoney}>{money(cash)}</Text></View>
        <View style={styles.hudCell}><Text style={styles.hudLabel}>NIVEAU</Text><Text style={styles.hudValue}>{stationLevel}</Text></View>
        <View style={styles.hudCell}><Text style={styles.hudLabel}>IN SYSTEEM</Text><Text style={styles.hudValue}>{parkingQueue + entranceQueue + hallTotal + platformTotal}</Text></View>
        <View style={styles.hudCell}><Text style={styles.hudLabel}>KNELPUNT</Text><Text style={styles.hudWarn}>{bottleneck}</Text></View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.levelCard}>
          <View style={styles.levelTop}><Text style={styles.levelTitle}>STATIONNIVEAU {stationLevel}</Text><Text style={styles.levelXp}>{xp}/{levelTarget(stationLevel)} XP</Text></View>
          <View style={styles.levelTrack}><View style={[styles.levelFill, { width: `${clampPct(xp, levelTarget(stationLevel))}%` }]} /></View>
          <Text style={styles.levelHint}>{stationLevel === 1 ? 'Volgend niveau opent Oostpoort' : stationLevel === 2 ? 'Volgend niveau opent Luchthaven' : `${transported} reizigers vervoerd • ${lost} gemiste instroom`}</Text>
        </View>

        <BalanceBar data={balance} />

        <View style={styles.stationWorld}>
          <View style={styles.worldHead}><View><Text style={styles.worldKicker}>LIVE STATION</Text><Text style={styles.worldTitle}>ZIE DE REIZIGERSSTROOM</Text></View><Text style={styles.worldIncome}>{money(retailIncome(retailLevel))}/s</Text></View>

          <View style={styles.zone}>
            <View style={styles.zoneTitleRow}><View><Text style={styles.zoneStep}>1 • AANVOER</Text><Text style={styles.zoneTitle}>PARKEERPLAATS</Text></View><Text style={styles.zoneLv}>Lv {parkingLevel}</Text></View>
            <CarPark level={parkingLevel} queue={parkingQueue} />
            <Meter label="PARKEERBEZETTING" value={parkingQueue} max={parkingCap(parkingLevel)} subtitle={`${parkingInflow(parkingLevel)} nieuwe reizigers/sec door huidige parkeeromvang`} />
          </View>

          <FlowPeople amount={moveParkingToEntrance} label={`${moveParkingToEntrance}/s lopen naar entree`} />

          <View style={styles.zone}>
            <View style={styles.zoneTitleRow}><View><Text style={styles.zoneStep}>2 • BUFFER & TOEGANG</Text><Text style={styles.zoneTitle}>ENTREE & POORTJES</Text></View><Text style={styles.zoneLv}>Lv {gateLevel}</Text></View>
            <GateVisual level={gateLevel} />
            <Meter label="WACHT VOOR POORTJES" value={entranceQueue} max={entranceBuffer(gateLevel)} subtitle={`${gateRate(gateLevel)} reizigers/sec door de poortjes`} />
          </View>

          <FlowPeople amount={moveEntranceToHall} label={`${moveEntranceToHall}/s door naar hal`} />

          <View style={[styles.zone, styles.hallZone]}>
            <View style={styles.zoneTitleRow}><View><Text style={styles.zoneStep}>3 • VERDELING</Text><Text style={styles.zoneTitle}>STATIONSHAL</Text></View><Text style={styles.zoneLv}>Lv {hallLevel}</Text></View>
            <View style={styles.hallContent}><View><Text style={styles.bigNumber}>{hallTotal}</Text><Text style={styles.bigSub}>reizigers zoeken hun vertrekperron</Text><Text style={styles.smallInfo}>winkels Lv {retailLevel} • service Lv {ticketLevel}</Text></View><Crowd count={hallTotal} max={hallCap(hallLevel)} /></View>
            <Meter label="HALCAPACITEIT" value={hallTotal} max={hallCap(hallLevel)} subtitle={`${hallRate(hallLevel)} reizigers/sec kunnen richting perrons`} />
          </View>

          <FlowPeople amount={moveHallToPlatforms} label={`${moveHallToPlatforms}/s naar geplande perrons`} />

          <View style={styles.platformZone}>
            <View style={styles.zoneTitleRow}><View><Text style={styles.zoneStep}>4 • WACHTEN & INSTAPPEN</Text><Text style={styles.zoneTitle}>PERRONS</Text></View><Text style={styles.zoneLv}>Lv {platformLevel}</Text></View>
            {[1, 2, 3].map((lane) => {
              const locked = lane === 3 && !platform3;
              const waiting = DESTINATIONS.reduce((acc, d) => {
                const s = services.find((svc) => svc.destination.id === d.id && svc.status !== 'departed');
                return acc + ((s?.actualLane || s?.plannedLane) === lane ? platformDemand[d.id] : 0);
              }, 0);
              const train = platforms[lane];
              const depIn = train ? train.departureAt - now : 0;
              const ready = Boolean(train && train.status === 'ready' && depIn <= 0 && depIn >= -DELAY_MARGIN);
              const late = Boolean(train && train.status === 'ready' && depIn < -DELAY_MARGIN);
              return (
                <View key={lane} style={[styles.platformRow, locked && styles.locked]}>
                  <View style={styles.platformRowHead}><Text style={styles.platformName}>PERRON {lane}</Text><Text style={[styles.platformWaiting, waiting >= platformCap(platformLevel) * 0.9 && styles.dangerText]}>{locked ? 'BOUWTERREIN' : `${waiting}/${platformCap(platformLevel)} wachtend`}</Text></View>
                  <View style={styles.trackBox}>
                    {locked ? <Text style={styles.construct}>P3 NOG NIET GEBOUWD</Text> : train ? <View style={styles.trainWrap}><Train train={train} ready={ready} late={late} onPress={() => depart(lane)} /><Text style={[styles.trainLabel, ready && styles.readyText, late && styles.dangerText]}>{train.number} → {train.destination.name} • {train.status === 'ready' ? (depIn > 0 ? `vertrek over ${depIn}s` : depIn >= -DELAY_MARGIN ? `${DELAY_MARGIN + depIn}s marge` : `${Math.abs(depIn + DELAY_MARGIN)}s te laat`) : `${train.remaining}s halte`}</Text></View> : <Text style={styles.free}>vrij spoor</Text>}
                  </View>
                  {!locked ? <Crowd count={waiting} max={platformCap(platformLevel)} tiny /> : null}
                </View>
              );
            })}
          </View>

          <FlowPeople amount={Math.min(platformTotal, 18)} label="instappen in beschikbare treincapaciteit" />

          <View style={styles.trainCapacityCard}>
            <Text style={styles.trainCapacityTitle}>5 • TREINCAPACITEIT</Text>
            <Text style={styles.trainCapacityValue}>Vloot Lv {fleetLevel} • toekomstige treinen tot {fleetLevel <= 1 ? '1–2' : fleetLevel === 2 ? '2–3' : '3'} stellen</Text>
            <Text style={styles.trainCapacitySub}>Als perrons vol blijven ondanks voldoende spoorruimte, moet de trein langer worden.</Text>
          </View>
        </View>

        <View style={styles.message}><View style={styles.messageLamp} /><Text style={styles.messageText}>{message}</Text></View>

        {blocked ? (
          <View style={styles.blockedCard}>
            <View style={styles.blockedTop}><View><Text style={styles.blockedLabel}>TREIN WACHT VOOR STATION</Text><Text style={styles.blockedTrain}>{blocked.number} → {blocked.destination.name}</Text></View><Text style={styles.blockedDelay}>+{blocked.wait}s</Text></View>
            <Text style={styles.blockedReason}>Gepland P{blocked.plannedLane} is bezet. Laat hem wachten of stuur hem naar een ander vrij perron.</Text>
            <View style={styles.divertRow}>{[1, 2, 3].filter((lane) => lane !== blocked.plannedLane && (lane !== 3 || platform3)).map((lane) => <Pressable key={lane} disabled={Boolean(platforms[lane])} onPress={() => divert(lane)} style={[styles.divert, platforms[lane] && styles.locked]}><Text style={styles.divertSmall}>{platforms[lane] ? 'BEZET' : 'WIJK UIT'}</Text><Text style={styles.divertBig}>P{lane}</Text></Pressable>)}</View>
          </View>
        ) : null}

        <Timetable services={services} now={now} />

        <Text style={styles.sectionHeading}>BREID HET HUIDIGE KNELPUNT UIT</Text>
        <View style={styles.upgradeGrid}>
          <Upgrade title="PARKEERPLAATS" level={parkingLevel} description={`${parkingCap(parkingLevel)} plaatsen • ${parkingInflow(parkingLevel)}/s instroom. Elke upgrade trekt bewust méér reizigers aan.`} cost={parkingCost(parkingLevel)} cash={cash} onPress={upgradeParking} focus={bottleneck === 'PARKEREN'} />
          <Upgrade title="ENTREE & POORTJES" level={gateLevel} description={`${entranceBuffer(gateLevel)} buffer • ${gateRate(gateLevel)}/s doorstroom. Lost parkeren op, maar vult de hal sneller.`} cost={gateCost(gateLevel)} cash={cash} onPress={upgradeGates} focus={bottleneck === 'ENTREE'} />
          <Upgrade title="STATIONSHAL" level={hallLevel} description={`${hallCap(hallLevel)} capaciteit • ${hallRate(hallLevel)}/s naar perrons. Daarna verschuift druk naar perrons.`} cost={hallCost(hallLevel)} cash={cash} onPress={upgradeHall} focus={bottleneck === 'HAL'} />
          <Upgrade title="PERRONCAPACITEIT" level={platformLevel} description={`${platformCap(platformLevel)} wachtenden per perron. Grotere perrons vragen uiteindelijk grotere treinen.`} cost={platformCost(platformLevel)} cash={cash} onPress={upgradePlatforms} focus={bottleneck === 'PERRONS'} />
          <Upgrade title="TREINVLOOT" level={fleetLevel} description="Nieuwe treinen krijgen meer stellen en dus meer capaciteit. Dit verlicht de laatste schakel." cost={fleetCost(fleetLevel)} cash={cash} onPress={upgradeFleet} focus={bottleneck === 'TREINEN'} />
          <Upgrade title="PERRON 3" level={1} description="Extra spoor verdeelt reizigers en treinen over drie perrons." cost={platform3Cost} cash={cash} onPress={buildP3} done={platform3} />
          <Upgrade title="WINKELZONE" level={retailLevel} description={`${money(retailIncome(retailLevel))}/sec passief inkomen. Geen capaciteit, wel groeigeld.`} cost={retailCost(retailLevel)} cash={cash} onPress={upgradeRetail} />
          <Upgrade title="SERVICE & TICKETS" level={ticketLevel} description={`+${Math.round((fareMultiplier(ticketLevel) - 1) * 100)}% opbrengst per vervoerde reiziger.`} cost={ticketCost(ticketLevel)} cash={cash} onPress={upgradeTickets} />
        </View>

        <View style={styles.result}><Text style={styles.resultTitle}>STATIONBEDRIJF</Text><Text style={styles.resultText}>{transported} reizigers vervoerd • {handled} treinen • {onTime} binnen marge • {lost} reizigers afgehaakt door volle parkeerketen</Text></View>
      </ScrollView>
      <View style={styles.footer}><Text style={styles.footerText}>V0.11 • AUTO → PARKEERPLAATS → ENTREE → HAL → PERRON → TREIN</Text></View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#071016' }, scroll: { flex: 1 }, content: { paddingHorizontal: 10, paddingBottom: 28 },
  menu: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 }, kicker: { color: '#7ab4d2', fontSize: 10, fontWeight: '900', letterSpacing: 2, marginBottom: 10 }, logo: { color: '#edf4f7', fontSize: 47, lineHeight: 44, fontWeight: '900', letterSpacing: -2, textAlign: 'center' }, subtitle: { color: '#95a6af', fontSize: 14, lineHeight: 21, textAlign: 'center', maxWidth: 390, marginTop: 18, marginBottom: 24 }, primary: { backgroundColor: '#ffd65a', minWidth: 230, borderRadius: 9, paddingVertical: 16, alignItems: 'center' }, primaryText: { color: '#111820', fontSize: 15, fontWeight: '900', letterSpacing: 1 },

  hud: { flexDirection: 'row', paddingVertical: 9, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: '#17252d' }, hudCell: { flex: 1, alignItems: 'center' }, hudLabel: { color: '#607580', fontSize: 6.2, fontWeight: '900', letterSpacing: .5 }, hudValue: { color: '#e7eef1', fontSize: 12.5, fontWeight: '900', marginTop: 2 }, hudMoney: { color: '#65e394', fontSize: 12.5, fontWeight: '900', marginTop: 2 }, hudWarn: { color: '#ffd66a', fontSize: 7.8, fontWeight: '900', marginTop: 4, textAlign: 'center' },

  levelCard: { marginTop: 8, backgroundColor: '#0e1920', borderWidth: 1, borderColor: '#325064', borderRadius: 9, padding: 9 }, levelTop: { flexDirection: 'row', justifyContent: 'space-between' }, levelTitle: { color: '#dce9ee', fontSize: 9, fontWeight: '900' }, levelXp: { color: '#7da8bf', fontSize: 7.5, fontWeight: '900' }, levelTrack: { height: 7, marginTop: 6, backgroundColor: '#1b2931', borderRadius: 4, overflow: 'hidden' }, levelFill: { height: '100%', backgroundColor: '#58b9ff' }, levelHint: { color: '#71858f', fontSize: 7, marginTop: 5, fontWeight: '700' },

  balanceCard: { marginTop: 8, backgroundColor: '#121b20', borderWidth: 1, borderColor: '#3b4b54', borderRadius: 9, padding: 9 }, balanceHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, balanceTitle: { color: '#8a9da7', fontSize: 6.3, fontWeight: '900', letterSpacing: .8 }, balanceWorst: { color: '#ffd66a', fontSize: 6.5, fontWeight: '900' }, balanceStages: { flexDirection: 'row', alignItems: 'center', marginTop: 8 }, balanceArrow: { color: '#5f7079', fontSize: 15, fontWeight: '900', marginHorizontal: 2 }, balanceStage: { flex: 1, minHeight: 38, borderRadius: 5, borderWidth: 1, borderColor: '#2c3d46', backgroundColor: '#172229', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 }, balanceStageBad: { borderColor: '#d46a5c', backgroundColor: '#2a1b1a' }, balanceStageLabel: { color: '#899aa4', fontSize: 5.2, fontWeight: '900', textAlign: 'center' }, balanceStageValue: { color: '#e7eef1', fontSize: 9, fontWeight: '900', marginTop: 2 }, balanceHint: { color: '#677a84', fontSize: 6.5, marginTop: 7 },

  stationWorld: { marginTop: 8, backgroundColor: '#0b151a', borderWidth: 1, borderColor: '#2c4653', borderRadius: 11, overflow: 'hidden' }, worldHead: { minHeight: 50, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: '#0e1b21', borderBottomWidth: 1, borderBottomColor: '#263b46', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, worldKicker: { color: '#6e8793', fontSize: 6.2, fontWeight: '900', letterSpacing: .9 }, worldTitle: { color: '#e5eef2', fontSize: 13, fontWeight: '900', marginTop: 2 }, worldIncome: { color: '#62df91', fontSize: 10, fontWeight: '900' },

  zone: { marginHorizontal: 8, marginTop: 8, backgroundColor: '#121e24', borderWidth: 1, borderColor: '#30434d', borderRadius: 8, padding: 9 }, hallZone: { minHeight: 135 }, zoneTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, zoneStep: { color: '#697f8a', fontSize: 5.5, fontWeight: '900', letterSpacing: .7 }, zoneTitle: { color: '#dce7eb', fontSize: 10.5, fontWeight: '900', marginTop: 1 }, zoneLv: { color: '#79c4eb', fontSize: 8, fontWeight: '900' },
  carGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 8, padding: 6, backgroundColor: '#19262c', borderRadius: 6 }, carSlot: { width: 24, height: 18, borderWidth: 1, borderColor: '#44535a', borderRadius: 2, alignItems: 'center', justifyContent: 'center' }, carSlotBusy: { backgroundColor: '#36576a', borderColor: '#6d99b2' }, carGlyph: { color: '#d7e4ea', fontSize: 8, fontWeight: '900' },
  gates: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 9, marginBottom: 4 }, gate: { width: 30, height: 23, borderWidth: 2, borderColor: '#5c707b', borderRadius: 3, backgroundColor: '#1b2a31', alignItems: 'center', justifyContent: 'center' }, gateLight: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#4fe189' },
  hallContent: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }, bigNumber: { color: '#eef4f6', fontSize: 27, fontWeight: '900' }, bigSub: { color: '#84969f', fontSize: 7, fontWeight: '800' }, smallInfo: { color: '#6f8792', fontSize: 6.2, fontWeight: '800', marginTop: 5 }, crowd: { width: '47%', flexDirection: 'row', flexWrap: 'wrap', gap: 4, justifyContent: 'flex-end' }, crowdTiny: { width: '100%', minHeight: 15, justifyContent: 'flex-start', marginTop: 4 }, crowdDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#7e949f' }, crowdDotAccent: { backgroundColor: '#f0c95f' },

  meter: { marginTop: 8 }, meterTop: { flexDirection: 'row', justifyContent: 'space-between' }, meterLabel: { color: '#6f828c', fontSize: 5.6, fontWeight: '900' }, meterValue: { color: '#dce6ea', fontSize: 7.2, fontWeight: '900' }, meterTrack: { height: 6, marginTop: 4, backgroundColor: '#253139', borderRadius: 3, overflow: 'hidden' }, meterFill: { height: '100%', backgroundColor: '#55b9ef' }, meterFillDanger: { backgroundColor: '#e56e62' }, meterSub: { color: '#657984', fontSize: 6, fontWeight: '700', marginTop: 3 }, dangerText: { color: '#ff897b' }, readyText: { color: '#5be795' },

  flow: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, flowVertical: { height: 54, marginHorizontal: 76 }, flowHorizontal: { height: 40 }, flowLabel: { position: 'absolute', top: 2, left: 0, right: 0, color: '#617781', fontSize: 5.7, fontWeight: '900', textAlign: 'center' }, flowTrack: { width: 58, height: 45, overflow: 'hidden', position: 'relative', marginTop: 9 }, person: { position: 'absolute', width: 6, height: 6, borderRadius: 3, backgroundColor: '#f1c75d' },

  platformZone: { margin: 8, marginTop: 0, backgroundColor: '#101a20', borderWidth: 1, borderColor: '#30434d', borderRadius: 8, padding: 9 }, platformRow: { minHeight: 92, borderTopWidth: 1, borderTopColor: '#22323b', paddingTop: 6 }, platformRowHead: { flexDirection: 'row', justifyContent: 'space-between' }, platformName: { color: '#91a5af', fontSize: 6.5, fontWeight: '900' }, platformWaiting: { color: '#b1bec4', fontSize: 6.4, fontWeight: '900' }, trackBox: { height: 43, marginTop: 4, backgroundColor: '#091217', borderRadius: 5, alignItems: 'center', justifyContent: 'center', borderTopWidth: 5, borderTopColor: '#47565d' }, trainWrap: { alignItems: 'center' }, free: { color: '#53636b', fontSize: 6.4, fontWeight: '800' }, construct: { color: '#a18c59', fontSize: 6.4, fontWeight: '900' }, trainLabel: { color: '#9babb3', fontSize: 5.8, fontWeight: '900', marginTop: 2, textAlign: 'center' }, locked: { opacity: .35 },
  trainCapacityCard: { margin: 8, marginTop: 0, backgroundColor: '#142026', borderWidth: 1, borderColor: '#344a55', borderRadius: 8, padding: 9 }, trainCapacityTitle: { color: '#718791', fontSize: 5.8, fontWeight: '900', letterSpacing: .7 }, trainCapacityValue: { color: '#dfe9ed', fontSize: 9, fontWeight: '900', marginTop: 3 }, trainCapacitySub: { color: '#758892', fontSize: 6.5, lineHeight: 10, marginTop: 3 },

  trainBodyRow: { flexDirection: 'row', alignItems: 'center' }, trainSet: { width: 42, height: 18, backgroundColor: '#d9edf8', borderWidth: 1.5, borderColor: '#0b151b', borderRadius: 3, overflow: 'hidden', position: 'relative', justifyContent: 'center' }, trainSetReady: { backgroundColor: '#9cf0b9' }, trainSetLate: { backgroundColor: '#f5a0aa' }, cab: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 5, backgroundColor: '#659bb7' }, windows: { position: 'absolute', left: 9, right: 4, top: 3, flexDirection: 'row', justifyContent: 'space-around' }, window: { width: 5, height: 3, borderRadius: 1, backgroundColor: '#31556a' }, trainCode: { color: '#173443', fontSize: 5.5, fontWeight: '900', textAlign: 'center', marginTop: 6 }, coupler: { width: 5, height: 3, backgroundColor: '#6b7980' }, trainPress: { padding: 3, borderRadius: 4 },

  message: { minHeight: 40, flexDirection: 'row', alignItems: 'center', marginTop: 8, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: '#0a1218', borderWidth: 1, borderColor: '#20313a', borderRadius: 8 }, messageLamp: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#58b9ff', marginRight: 8 }, messageText: { flex: 1, color: '#a4b2ba', fontSize: 8.5, lineHeight: 12, fontWeight: '700' },

  blockedCard: { marginTop: 8, backgroundColor: '#271a0d', borderWidth: 1.5, borderColor: '#d0953d', borderRadius: 9, padding: 9 }, blockedTop: { flexDirection: 'row', justifyContent: 'space-between' }, blockedLabel: { color: '#b89257', fontSize: 6.5, fontWeight: '900' }, blockedTrain: { color: '#ffe6b2', fontSize: 14, fontWeight: '900', marginTop: 2 }, blockedDelay: { color: '#ffbc55', fontSize: 16, fontWeight: '900' }, blockedReason: { color: '#ba9d70', fontSize: 8, lineHeight: 11, marginTop: 6 }, divertRow: { flexDirection: 'row', gap: 7, marginTop: 8 }, divert: { flex: 1, minHeight: 45, borderRadius: 7, borderWidth: 1, borderColor: '#d1953d', backgroundColor: '#33230f', alignItems: 'center', justifyContent: 'center' }, divertSmall: { color: '#c3a36b', fontSize: 6, fontWeight: '900' }, divertBig: { color: '#ffda91', fontSize: 16, fontWeight: '900' },

  card: { marginTop: 8, backgroundColor: '#0d161d', borderWidth: 1, borderColor: '#2b3b45', borderRadius: 9, padding: 9 }, cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, cardTitle: { color: '#718591', fontSize: 6.8, fontWeight: '900', letterSpacing: 1 }, clock: { color: '#ffd65a', fontSize: 13, fontWeight: '900' }, serviceRow: { minHeight: 38, flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#182630' }, serviceTime: { width: 42, color: '#70d29a', fontSize: 8.5, fontWeight: '900' }, serviceMain: { flex: 1 }, serviceId: { color: '#e2ebef', fontSize: 9.5, fontWeight: '900' }, serviceDest: { color: '#7c919c', fontSize: 6.8, fontWeight: '800' }, servicePlatform: { width: 26, color: '#58b9ff', fontSize: 8.5, fontWeight: '900', textAlign: 'center' }, serviceStatus: { width: 74, color: '#c5d1d7', fontSize: 6.3, fontWeight: '900', textAlign: 'right' },

  sectionHeading: { color: '#78909c', fontSize: 7.2, fontWeight: '900', letterSpacing: 1.1, textAlign: 'center', marginTop: 14, marginBottom: 7 }, upgradeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, upgrade: { width: '48.7%', minHeight: 126, backgroundColor: '#0d161d', borderWidth: 1, borderColor: '#2b3b45', borderRadius: 8, padding: 9 }, upgradeAffordable: { borderColor: '#d5aa49', backgroundColor: '#18170f' }, upgradeFocus: { borderColor: '#eb7562', borderWidth: 2 }, upgradeDone: { borderColor: '#3d9e68', backgroundColor: '#0d1b14' }, upgradeTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 5 }, upgradeTitle: { flex: 1, color: '#dfe9ed', fontSize: 7.7, fontWeight: '900' }, upgradeLevel: { color: '#76c7f2', fontSize: 7.5, fontWeight: '900' }, upgradeDesc: { color: '#71838d', fontSize: 6.7, lineHeight: 10, marginTop: 7, flex: 1 }, upgradeCost: { color: '#ffd65a', fontSize: 10.5, fontWeight: '900', marginTop: 7 },

  result: { marginTop: 12, backgroundColor: '#0b141a', borderWidth: 1, borderColor: '#22333d', borderRadius: 8, padding: 10 }, resultTitle: { color: '#667b87', fontSize: 6.2, fontWeight: '900', letterSpacing: 1 }, resultText: { color: '#9aaab3', fontSize: 8, fontWeight: '800', marginTop: 4 }, footer: { alignItems: 'center', paddingVertical: 7, paddingHorizontal: 8, borderTopWidth: 1, borderTopColor: '#14212a' }, footerText: { color: '#42535e', fontSize: 6, fontWeight: '900', textAlign: 'center' },
});