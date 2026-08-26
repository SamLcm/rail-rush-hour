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

const LANES = [1, 2, 3];
const ARRIVAL_MS = 4200;
const DEPARTURE_MS = 3500;
const SERVICE_INTERVAL = 12;
const DELAY_MARGIN_SECONDS = 12;
const SAVE_KEY = 'rail-rush-hour-v09';
const OFFLINE_CAP_SECONDS = 2 * 60 * 60;

const DESTINATIONS = [
  { id: 'noorddam', name: 'Noorddam', code: 'NDR', fare: 1, unlockLevel: 1 },
  { id: 'havenstad', name: 'Havenstad', code: 'HVN', fare: 2, unlockLevel: 1 },
  { id: 'oostpoort', name: 'Oostpoort', code: 'OOS', fare: 3, unlockLevel: 2 },
  { id: 'luchthaven', name: 'Luchthaven', code: 'AIR', fare: 4, unlockLevel: 3 },
];

const TRAIN_TYPES = [
  { code: 'SPR', name: 'Sprinter S', setLength: 55, setCapacity: 220, minSets: 1, maxSets: 3, dwell: 8, boardRate: 34 },
  { code: 'IC', name: 'Intercity X', setLength: 82, setCapacity: 330, minSets: 1, maxSets: 3, dwell: 10, boardRate: 46 },
  { code: 'EXP', name: 'Express E', setLength: 105, setCapacity: 430, minSets: 1, maxSets: 2, dwell: 12, boardRate: 54 },
];

const ARRIVAL_ROUTES = {
  1: { locks: ['EW_TOP', 'K_TOP', 'P1'] },
  2: { locks: ['EW_TOP', 'K_TOP', 'P2'] },
  3: { locks: ['EW_TOP', 'EW_BOTTOM', 'K_BOTTOM', 'P3'] },
};

const DEPARTURE_ROUTES = {
  1: { locks: ['P1', 'K_TOP', 'K_BOTTOM', 'EW_BOTTOM'] },
  2: { locks: ['P2', 'K_BOTTOM', 'EW_BOTTOM'] },
  3: { locks: ['P3', 'K_BOTTOM', 'EW_BOTTOM'] },
};

const routesConflict = (a, b) => Boolean(a && b && a.locks.some((lock) => b.locks.includes(lock)));
const pct = (value, max) => Math.max(0, Math.min(100, Math.round((value / Math.max(1, max)) * 100)));
const levelTarget = (level) => 380 + level * 220;
const hallCost = (level) => 650 + level * 450;
const retailCost = (level) => 700 + level * 500;
const ticketCost = (level) => 850 + level * 550;
const platform3Cost = 2200;
const formatMoney = (value) => `€${Math.max(0, Math.round(value)).toLocaleString('nl-NL')}`;
const hallCapacity = (level) => 420 + level * 260;
const passivePerSecond = (retailLevel) => 2 + retailLevel * 2;
const serviceLane = (service) => service?.actualLane || service?.plannedLane || null;

const formatClock = (seconds) => {
  const base = 8 * 3600 + Math.max(0, Math.round(seconds));
  const h = Math.floor(base / 3600) % 24;
  const m = Math.floor((base % 3600) / 60);
  const s = base % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

const departureInfo = (train, now) => {
  if (!train) return null;
  const untilDeparture = train.departureAt - now;
  if (untilDeparture > 0) return { state: 'early', detail: `nog ${untilDeparture}s`, canDepart: false, marginLeft: DELAY_MARGIN_SECONDS };
  const marginLeft = train.departureAt + DELAY_MARGIN_SECONDS - now;
  if (marginLeft >= 0) return { state: 'window', detail: `${marginLeft}s marge`, canDepart: true, marginLeft };
  return { state: 'late', detail: `+${Math.abs(marginLeft)}s te laat`, canDepart: true, marginLeft: 0 };
};

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
    // Native persistence comes later; web prototype keeps playing normally.
  }
};

function TrainStrip({ train, ready, late, onPress, compact = false }) {
  const content = (
    <View style={styles.trainStripInner}>
      {Array.from({ length: train.sets }).map((_, index) => (
        <React.Fragment key={`${train.id}-${index}`}>
          {index > 0 ? <View style={[styles.trainCoupler, compact && styles.trainCouplerCompact]} /> : null}
          <View style={[styles.trainSet, compact && styles.trainSetCompact, ready && styles.trainSetReady, late && styles.trainSetLate]}>
            <View style={styles.trainCab} />
            <View style={styles.trainWindows}><View style={styles.trainWindow} /><View style={styles.trainWindow} /><View style={styles.trainWindow} /></View>
            <Text style={[styles.trainSetText, compact && styles.trainSetTextCompact]}>{train.type.code}</Text>
          </View>
        </React.Fragment>
      ))}
    </View>
  );
  if (!onPress) return content;
  return <Pressable hitSlop={12} onPress={onPress} style={styles.trainPress}>{content}</Pressable>;
}

function BuildingBlock({ title, sub, width, accent }) {
  return (
    <View style={[styles.buildingBlock, { width }, accent && styles.buildingAccent]}>
      <View style={styles.buildingRoof} />
      <Text style={styles.buildingTitle}>{title}</Text>
      <Text style={styles.buildingSub}>{sub}</Text>
    </View>
  );
}

function LivingStation({
  width,
  onLayout,
  platforms,
  passengers,
  now,
  hallLevel,
  retailLevel,
  ticketLevel,
  platform3Unlocked,
  arrivalTrain,
  arrivalLane,
  arrivalProgress,
  departureTrain,
  departureLane,
  departureProgress,
  onTrainPress,
  stationLevel,
}) {
  const totalWaiting = Object.values(passengers).reduce((sum, value) => sum + value, 0);
  const capacity = hallCapacity(hallLevel);
  const crowdPct = pct(totalWaiting, capacity);
  const activeDots = Math.min(26, Math.max(4, Math.round(crowdPct / 4)));
  const usableWidth = Math.max(280, width || 360);
  const trainLeft = Math.round(usableWidth * 0.43);
  const movingDistance = Math.round(usableWidth * 0.82);
  const arrivalX = arrivalProgress.interpolate({ inputRange: [0, 1], outputRange: [-150, trainLeft] });
  const departureX = departureProgress.interpolate({ inputRange: [0, 1], outputRange: [trainLeft, movingDistance] });
  const laneTop = { 1: 156, 2: 218, 3: 280 };

  return (
    <View style={styles.worldCard} onLayout={(e) => onLayout(e.nativeEvent.layout)}>
      <View style={styles.worldHeader}>
        <View><Text style={styles.worldKicker}>JOUW STATION • NIVEAU {stationLevel}</Text><Text style={styles.worldTitle}>CENTRAAL STATION</Text></View>
        <View style={[styles.crowdBadge, crowdPct >= 90 && styles.crowdBadgeDanger]}><Text style={styles.crowdBadgeText}>{crowdPct}% DRUK</Text></View>
      </View>

      <View style={styles.stationCampus}>
        <View style={styles.buildingRow}>
          <BuildingBlock title="STATIONSHAL" sub={`Lv ${hallLevel} • cap. ${capacity}`} width={`${Math.min(52, 34 + hallLevel * 4)}%`} accent />
          <BuildingBlock title="SERVICE" sub={`Lv ${ticketLevel}`} width="21%" />
          <BuildingBlock title="WINKELS" sub={`${retailLevel} units`} width="21%" />
        </View>

        <View style={styles.concourse}>
          <View><Text style={styles.concourseTitle}>REIZIGERSHAL</Text><Text style={styles.concourseSub}>{totalWaiting} reizigers • capaciteit {capacity}</Text></View>
          <View style={styles.passengerDots}>
            {Array.from({ length: activeDots }).map((_, i) => <View key={i} style={[styles.passengerDot, i % 4 === 0 && styles.passengerDotAccent]} />)}
          </View>
        </View>

        {LANES.map((lane) => {
          const locked = lane === 3 && !platform3Unlocked;
          const train = platforms[lane];
          const timing = train ? departureInfo(train, now) : null;
          const ready = Boolean(train && train.status === 'ready' && timing?.state === 'window');
          const late = Boolean(train && train.status === 'ready' && timing?.state === 'late');
          return (
            <View key={lane} style={[styles.worldPlatform, locked && styles.worldPlatformLocked]}>
              <View style={styles.platformLabelBox}><Text style={styles.platformLabel}>P{lane}</Text></View>
              <View style={styles.platformEdgeWorld} />
              <View style={styles.railLine}><View style={styles.railInner} /></View>
              {locked ? (
                <View style={styles.construction}><Text style={styles.constructionText}>BOUWTERREIN • PERRON 3</Text></View>
              ) : train && !(departureTrain && departureTrain.id === train.id) ? (
                <View style={styles.staticTrainWorld}>
                  <TrainStrip train={train} ready={ready} late={late} onPress={() => onTrainPress(lane)} compact />
                  <Text style={[styles.worldTrainLabel, ready && styles.worldTrainLabelReady, late && styles.worldTrainLabelLate]}>
                    {train.id} → {train.destination.name} • {train.status === 'ready' ? timing.detail : `${train.remaining}s halte`}
                  </Text>
                </View>
              ) : (
                <Text style={styles.emptyTrackText}>vrij spoor</Text>
              )}
            </View>
          );
        })}

        {arrivalTrain ? (
          <Animated.View pointerEvents="none" style={[styles.movingTrainWorld, { top: laneTop[arrivalLane] || laneTop[1], transform: [{ translateX: arrivalX }] }]}>
            <TrainStrip train={arrivalTrain} compact />
            <Text style={styles.movingLabel}>BINNEN → P{arrivalLane}</Text>
          </Animated.View>
        ) : null}

        {departureTrain ? (
          <Animated.View pointerEvents="none" style={[styles.movingTrainWorld, { top: laneTop[departureLane] || laneTop[1], transform: [{ translateX: departureX }] }]}>
            <TrainStrip train={departureTrain} compact />
            <Text style={styles.movingLabel}>→ {departureTrain.destination.code}</Text>
          </Animated.View>
        ) : null}
      </View>

      <View style={styles.routeRibbon}>
        {DESTINATIONS.map((destination) => {
          const unlocked = destination.unlockLevel <= stationLevel;
          return <View key={destination.id} style={[styles.routePill, !unlocked && styles.routePillLocked]}><Text style={styles.routePillCode}>{unlocked ? destination.code : '🔒'}</Text><Text style={styles.routePillName}>{destination.name}</Text></View>;
        })}
      </View>
    </View>
  );
}

function Timetable({ timetable, now }) {
  const visible = timetable.filter((s) => s.status !== 'departed').slice(0, 5);
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}><Text style={styles.cardLabel}>VOLGENDE TREINEN</Text><Text style={styles.clock}>{formatClock(now)}</Text></View>
      {visible.map((service) => {
        const timing = departureInfo(service, now);
        const status = service.status === 'scheduled' ? `in ${Math.max(0, service.scheduledAt - now)}s` : service.status === 'waiting' ? 'WACHT BUITEN' : service.status === 'arriving' ? `→ P${service.actualLane}` : service.status === 'at_platform' ? (timing.state === 'early' ? `V over ${service.departureAt - now}s` : timing.detail) : 'VERTREKT';
        return (
          <View key={service.serviceId} style={styles.serviceRow}>
            <Text style={styles.serviceTime}>{formatClock(service.departureAt).slice(0, 5)}</Text>
            <View style={styles.serviceMain}><Text style={styles.serviceId}>{service.id}</Text><Text style={styles.serviceDest}>→ {service.destination.name}</Text></View>
            <Text style={styles.serviceLane}>P{serviceLane(service)}</Text><Text style={styles.serviceStatus}>{status}</Text>
          </View>
        );
      })}
    </View>
  );
}

function UpgradeCard({ title, value, description, cost, affordable, onPress, done }) {
  return (
    <Pressable disabled={done} onPress={onPress} style={[styles.upgradeCard, affordable && !done && styles.upgradeAffordable, done && styles.upgradeDone]}>
      <View style={styles.upgradeTop}><Text style={styles.upgradeTitle}>{title}</Text><Text style={styles.upgradeValue}>{value}</Text></View>
      <Text style={styles.upgradeDescription}>{description}</Text>
      <Text style={styles.upgradeCost}>{done ? 'ACTIEF' : formatMoney(cost)}</Text>
    </Pressable>
  );
}

function PlatformDetail({ lane, train, waiting, now, locked, onTrainPress }) {
  if (locked) return null;
  if (!train) return <View style={styles.platformDetail}><Text style={styles.detailPlatform}>P{lane}</Text><Text style={styles.detailMuted}>Vrij • {waiting} reizigers gepland</Text></View>;
  const timing = departureInfo(train, now);
  const ready = train.status === 'ready' && timing.canDepart;
  return (
    <Pressable onPress={() => onTrainPress(lane)} style={[styles.platformDetail, ready && styles.platformDetailReady, timing.state === 'late' && styles.platformDetailLate]}>
      <View style={styles.detailTop}><Text style={styles.detailPlatform}>P{lane} • {train.id}</Text><Text style={styles.detailTime}>{formatClock(train.departureAt).slice(0, 5)}</Text></View>
      <Text style={styles.detailDestination}>→ {train.destination.name} • {train.sets} stellen • {train.onboard}/{train.capacity}</Text>
      <Text style={[styles.detailAction, ready && styles.detailActionReady]}>{train.status !== 'ready' ? `${train.remaining}s reizigerswissel` : timing.state === 'early' ? `vertrek over ${train.departureAt - now}s` : timing.state === 'window' ? `TIK VOOR VERTREK • ${timing.marginLeft}s marge` : `TIK NU • ${timing.detail}`}</Text>
    </Pressable>
  );
}

export default function App() {
  const initialSave = useRef(safeLoad()).current;
  const [phase, setPhase] = useState('menu');
  const [serviceTime, setServiceTime] = useState(0);
  const [timetable, setTimetable] = useState([]);
  const [passengers, setPassengers] = useState({ noorddam: 70, havenstad: 95, oostpoort: 0, luchthaven: 0 });
  const [outside, setOutside] = useState([]);
  const [platforms, setPlatforms] = useState({ 1: null, 2: null, 3: null });
  const [arrivalTrain, setArrivalTrain] = useState(null);
  const [arrivalLane, setArrivalLane] = useState(null);
  const [departureTrain, setDepartureTrain] = useState(null);
  const [departureLane, setDepartureLane] = useState(null);
  const [worldWidth, setWorldWidth] = useState(0);
  const [message, setMessage] = useState('');

  const [cash, setCash] = useState(initialSave?.cash || 350);
  const [stationLevel, setStationLevel] = useState(initialSave?.stationLevel || 1);
  const [stationXp, setStationXp] = useState(initialSave?.stationXp || 0);
  const [hallLevel, setHallLevel] = useState(initialSave?.hallLevel || 1);
  const [retailLevel, setRetailLevel] = useState(initialSave?.retailLevel || 1);
  const [ticketLevel, setTicketLevel] = useState(initialSave?.ticketLevel || 1);
  const [platform3Unlocked, setPlatform3Unlocked] = useState(Boolean(initialSave?.platform3Unlocked));
  const [handled, setHandled] = useState(initialSave?.handled || 0);
  const [onTime, setOnTime] = useState(initialSave?.onTime || 0);
  const [late, setLate] = useState(initialSave?.late || 0);
  const [departedPassengers, setDepartedPassengers] = useState(initialSave?.departedPassengers || 0);

  const arrivalProgress = useRef(new Animated.Value(0)).current;
  const departureProgress = useRef(new Animated.Value(0)).current;
  const timeRef = useRef(0);
  const timetableRef = useRef([]);
  const passengersRef = useRef({ noorddam: 70, havenstad: 95, oostpoort: 0, luchthaven: 0 });
  const outsideRef = useRef([]);
  const platformsRef = useRef({ 1: null, 2: null, 3: null });
  const cashRef = useRef(initialSave?.cash || 350);
  const stationLevelRef = useRef(initialSave?.stationLevel || 1);
  const stationXpRef = useRef(initialSave?.stationXp || 0);
  const hallLevelRef = useRef(initialSave?.hallLevel || 1);
  const retailLevelRef = useRef(initialSave?.retailLevel || 1);
  const ticketLevelRef = useRef(initialSave?.ticketLevel || 1);
  const platform3Ref = useRef(Boolean(initialSave?.platform3Unlocked));
  const handledRef = useRef(initialSave?.handled || 0);
  const onTimeRef = useRef(initialSave?.onTime || 0);
  const lateRef = useRef(initialSave?.late || 0);
  const departedPassengersRef = useRef(initialSave?.departedPassengers || 0);
  const arrivalBusyRef = useRef(false);
  const departureBusyRef = useRef(false);
  const arrivalLaneRef = useRef(null);
  const departureLaneRef = useRef(null);
  const sequence = useRef(1700);
  const serviceCounter = useRef(0);
  const nextServiceAt = useRef(3);

  const syncTimetable = (next) => { timetableRef.current = next; setTimetable(next); };
  const syncPassengers = (next) => { passengersRef.current = next; setPassengers(next); };
  const syncOutside = (next) => { outsideRef.current = next; setOutside(next); };
  const syncPlatforms = (next) => { platformsRef.current = next; setPlatforms(next); };
  const addCash = (amount) => { cashRef.current += amount; setCash(Math.round(cashRef.current)); };
  const spendCash = (amount) => { if (cashRef.current < amount) return false; cashRef.current -= amount; setCash(Math.round(cashRef.current)); return true; };

  const persist = () => safeSave({
    cash: Math.round(cashRef.current), stationLevel: stationLevelRef.current, stationXp: Math.round(stationXpRef.current),
    hallLevel: hallLevelRef.current, retailLevel: retailLevelRef.current, ticketLevel: ticketLevelRef.current,
    platform3Unlocked: platform3Ref.current, handled: handledRef.current, onTime: onTimeRef.current,
    late: lateRef.current, departedPassengers: departedPassengersRef.current, lastSaved: Date.now(),
  });

  const awardXp = (amount) => {
    let xp = stationXpRef.current + amount;
    let level = stationLevelRef.current;
    let leveled = false;
    while (xp >= levelTarget(level)) { xp -= levelTarget(level); level += 1; leveled = true; }
    stationXpRef.current = xp; stationLevelRef.current = level;
    setStationXp(Math.round(xp)); setStationLevel(level);
    if (leveled) setMessage(`Stationniveau ${level}! ${level === 2 ? 'Oostpoort is nu aangesloten.' : level === 3 ? 'Luchthavenroute geopend.' : 'Nieuwe groeiruimte beschikbaar.'}`);
  };

  const createService = (scheduledAt) => {
    const index = serviceCounter.current++;
    sequence.current += index % 3 === 0 ? 4 : 2;
    const type = TRAIN_TYPES[index % TRAIN_TYPES.length];
    const destinations = DESTINATIONS.filter((d) => d.unlockLevel <= stationLevelRef.current);
    const destination = destinations[index % destinations.length];
    const lanes = platform3Ref.current ? [1, 2, 3] : [1, 2];
    const plannedLane = lanes[index % lanes.length];
    const sets = type.minSets + (index % (type.maxSets - type.minSets + 1));
    const capacity = type.setCapacity * sets;
    const onboard = Math.round(capacity * (0.38 + ((index * 11) % 28) / 100));
    const departureAt = scheduledAt + Math.ceil(ARRIVAL_MS / 1000) + type.dwell;
    return { serviceId: `svc-${index}-${scheduledAt}`, id: `${type.code} ${sequence.current}`, type, destination, plannedLane, actualLane: null, scheduledAt, departureAt, sets, length: type.setLength * sets, capacity, onboard, status: 'scheduled', wait: 0 };
  };

  const updateService = (serviceId, patch) => syncTimetable(timetableRef.current.map((s) => s.serviceId === serviceId ? { ...s, ...patch } : s));
  const arrivalConflict = (lane) => departureBusyRef.current && routesConflict(ARRIVAL_ROUTES[lane], DEPARTURE_ROUTES[departureLaneRef.current]);
  const departureConflict = (lane) => arrivalBusyRef.current && routesConflict(DEPARTURE_ROUTES[lane], ARRIVAL_ROUTES[arrivalLaneRef.current]);

  const tryAutoArrival = () => {
    if (arrivalBusyRef.current || !outsideRef.current.length) return;
    const train = outsideRef.current[0];
    if ((train.plannedLane === 3 && !platform3Ref.current) || platformsRef.current[train.plannedLane] || arrivalConflict(train.plannedLane)) return;
    startArrival(train, train.plannedLane, false);
  };

  const startArrival = (train, lane, diverted) => {
    if (!train || arrivalBusyRef.current || platformsRef.current[lane] || arrivalConflict(lane) || (lane === 3 && !platform3Ref.current)) return false;
    arrivalBusyRef.current = true; arrivalLaneRef.current = lane;
    syncOutside(outsideRef.current.filter((item) => item.serviceId !== train.serviceId));
    updateService(train.serviceId, { status: 'arriving', actualLane: lane });
    const moving = { ...train, actualLane: lane };
    setArrivalTrain(moving); setArrivalLane(lane); arrivalProgress.setValue(0);
    setMessage(diverted ? `${train.id} wijkt uit van P${train.plannedLane} naar P${lane}. Reizigers lopen naar het nieuwe perron.` : `${train.id} rijdt automatisch binnen op gepland P${lane}.`);
    Animated.timing(arrivalProgress, { toValue: 1, duration: ARRIVAL_MS, useNativeDriver: true }).start(({ finished }) => {
      arrivalBusyRef.current = false; arrivalLaneRef.current = null;
      if (!finished) return;
      const alight = Math.min(moving.onboard, Math.round(moving.onboard * (0.23 + Math.random() * 0.18)));
      const transfer = Math.round(alight * (0.25 + Math.random() * 0.25));
      const nextPassengers = { ...passengersRef.current };
      const transferChoices = DESTINATIONS.filter((d) => d.unlockLevel <= stationLevelRef.current && d.id !== moving.destination.id);
      if (transferChoices.length) for (let i = 0; i < transfer; i += 1) nextPassengers[transferChoices[i % transferChoices.length].id] += 1;
      const platformTrain = { ...moving, lane, onboard: moving.onboard - alight, status: 'dwelling', remaining: moving.type.dwell, lastAlight: alight, lastTransfer: transfer };
      syncPassengers(nextPassengers); syncPlatforms({ ...platformsRef.current, [lane]: platformTrain });
      updateService(moving.serviceId, { status: 'at_platform', actualLane: lane });
      setArrivalTrain(null); setArrivalLane(null);
      setMessage(`${moving.id} op P${lane}: ${alight} uitgestapt, ${transfer} stappen over. Vertrek ${formatClock(moving.departureAt).slice(0, 5)}.`);
      setTimeout(tryAutoArrival, 60);
    });
    return true;
  };

  const divertOutside = (lane) => {
    const train = outsideRef.current[0];
    if (!train || platformsRef.current[lane] || (lane === 3 && !platform3Ref.current)) return;
    if (arrivalConflict(lane)) { setMessage(`P${lane} is vrij, maar de rijweg is tijdelijk bezet.`); return; }
    startArrival(train, lane, true);
  };

  const depart = (lane) => {
    const train = platformsRef.current[lane];
    if (!train || departureBusyRef.current) return;
    if (train.status !== 'ready') { setMessage(`${train.id}: reizigerswissel nog ${train.remaining || 0}s.`); return; }
    const timing = departureInfo(train, timeRef.current);
    if (!timing.canDepart) { setMessage(`${train.id} mag nog niet vertrekken — nog ${train.departureAt - timeRef.current}s.`); return; }
    if (departureConflict(lane)) { setMessage(`${train.id} mag vertrekken, maar de uitrijweg is nog bezet.`); return; }

    departureBusyRef.current = true; departureLaneRef.current = lane;
    const delay = Math.max(0, timeRef.current - train.departureAt);
    syncPlatforms({ ...platformsRef.current, [lane]: { ...train, status: 'departing' } });
    updateService(train.serviceId, { status: 'departing', actualDepartureAt: timeRef.current, departureDelay: delay });
    setDepartureTrain(train); setDepartureLane(lane); departureProgress.setValue(0);

    Animated.timing(departureProgress, { toValue: 1, duration: DEPARTURE_MS, useNativeDriver: true }).start(({ finished }) => {
      departureBusyRef.current = false; departureLaneRef.current = null;
      if (!finished) return;
      const totalWaiting = Object.values(passengersRef.current).reduce((a, b) => a + b, 0);
      const crowdPenalty = totalWaiting > hallCapacity(hallLevelRef.current) ? 0.82 : 1;
      const fareMultiplier = (1 + (ticketLevelRef.current - 1) * 0.15) * crowdPenalty;
      const revenue = Math.round(train.onboard * train.destination.fare * fareMultiplier);
      const withinMargin = delay <= DELAY_MARGIN_SECONDS;
      syncPlatforms({ ...platformsRef.current, [lane]: null }); updateService(train.serviceId, { status: 'departed' });
      setDepartureTrain(null); setDepartureLane(null);
      handledRef.current += 1; departedPassengersRef.current += train.onboard;
      setHandled(handledRef.current); setDepartedPassengers(departedPassengersRef.current);
      if (withinMargin) { onTimeRef.current += 1; setOnTime(onTimeRef.current); } else { lateRef.current += 1; setLate(lateRef.current); }
      addCash(revenue + (withinMargin ? 80 : 0)); awardXp(Math.round(train.onboard / 3) + (withinMargin ? 60 : 15));
      setMessage(`${train.id} vertrokken naar ${train.destination.name}. ${formatMoney(revenue)} opbrengst${withinMargin ? ' + €80 punctualiteitsbonus' : ''}.`);
      persist(); setTimeout(tryAutoArrival, 60);
    });
  };

  const buyHall = () => {
    const cost = hallCost(hallLevelRef.current);
    if (!spendCash(cost)) return setMessage('Onvoldoende geld voor uitbreiding van de stationshal.');
    hallLevelRef.current += 1; setHallLevel(hallLevelRef.current); setMessage(`Stationshal uitgebreid naar niveau ${hallLevelRef.current}. De hal is zichtbaar groter en kan meer reizigers verwerken.`); persist();
  };
  const buyRetail = () => {
    const cost = retailCost(retailLevelRef.current);
    if (!spendCash(cost)) return setMessage('Onvoldoende geld voor meer winkels.');
    retailLevelRef.current += 1; setRetailLevel(retailLevelRef.current); setMessage(`Winkelzone niveau ${retailLevelRef.current}. Passief inkomen stijgt naar ${formatMoney(passivePerSecond(retailLevelRef.current))}/sec.`); persist();
  };
  const buyTickets = () => {
    const cost = ticketCost(ticketLevelRef.current);
    if (!spendCash(cost)) return setMessage('Onvoldoende geld voor tickets & service.');
    ticketLevelRef.current += 1; setTicketLevel(ticketLevelRef.current); setMessage(`Tickets & service niveau ${ticketLevelRef.current}. Hogere opbrengst per reiziger.`); persist();
  };
  const buyPlatform3 = () => {
    if (platform3Ref.current) return;
    if (!spendCash(platform3Cost)) return setMessage('Onvoldoende geld om perron 3 te bouwen.');
    platform3Ref.current = true; setPlatform3Unlocked(true); setMessage('Perron 3 geopend. Het bouwterrein is nu een volwaardig perron en nieuwe diensten gebruiken drie sporen.'); persist();
  };

  useEffect(() => {
    if (phase !== 'playing') return undefined;
    const timer = setInterval(() => {
      const now = timeRef.current + 1;
      timeRef.current = now; setServiceTime(now);

      let nextTable = [...timetableRef.current];
      if (nextTable.filter((s) => s.status === 'scheduled').length < 6) {
        for (let i = 0; i < 5; i += 1) { nextTable.push(createService(nextServiceAt.current)); nextServiceAt.current += SERVICE_INTERVAL; }
      }
      const due = [];
      nextTable = nextTable.map((s) => {
        if (s.status === 'scheduled' && s.scheduledAt <= now) { const waiting = { ...s, status: 'waiting', wait: 0 }; due.push(waiting); return waiting; }
        return s;
      });
      syncTimetable(nextTable);
      if (due.length) syncOutside([...outsideRef.current, ...due]);
      if (outsideRef.current.length) syncOutside(outsideRef.current.map((t) => ({ ...t, wait: (t.wait || 0) + 1 })));

      const nextPassengers = { ...passengersRef.current };
      const activeDestinations = DESTINATIONS.filter((d) => d.unlockLevel <= stationLevelRef.current);
      const totalWaiting = Object.values(nextPassengers).reduce((a, b) => a + b, 0);
      const crowdFactor = totalWaiting > hallCapacity(hallLevelRef.current) ? 0.45 : 1;
      const demandMultiplier = (1 + (hallLevelRef.current - 1) * 0.12) * crowdFactor;
      activeDestinations.forEach((destination, index) => { nextPassengers[destination.id] += Math.max(1, Math.round((2 + ((now + index * 2) % 5)) * demandMultiplier)); });

      const nextPlatforms = { ...platformsRef.current };
      LANES.forEach((lane) => {
        const current = nextPlatforms[lane];
        if (!current || current.status === 'departing') return;
        const train = { ...current };
        const free = Math.max(0, train.capacity - train.onboard);
        const board = Math.min(free, nextPassengers[train.destination.id] || 0, train.type.boardRate);
        if (board > 0) { nextPassengers[train.destination.id] -= board; train.onboard += board; }
        if (train.status === 'dwelling') { train.remaining = Math.max(0, train.remaining - 1); if (train.remaining === 0) train.status = 'ready'; }
        nextPlatforms[lane] = train;
      });
      syncPassengers(nextPassengers); syncPlatforms(nextPlatforms);
      addCash(passivePerSecond(retailLevelRef.current));
      if (now % 10 === 0) persist();
      setTimeout(tryAutoArrival, 30);
    }, 1000);
    return () => clearInterval(timer);
  }, [phase]);

  const startGame = () => {
    const saved = safeLoad();
    const restore = saved || {};
    const offlineSeconds = saved?.lastSaved ? Math.min(OFFLINE_CAP_SECONDS, Math.max(0, Math.floor((Date.now() - saved.lastSaved) / 1000))) : 0;
    const restoredRetail = restore.retailLevel || 1;
    const offlineIncome = offlineSeconds > 5 ? Math.round(offlineSeconds * passivePerSecond(restoredRetail) * 0.65) : 0;

    cashRef.current = (restore.cash || 350) + offlineIncome;
    stationLevelRef.current = restore.stationLevel || 1; stationXpRef.current = restore.stationXp || 0;
    hallLevelRef.current = restore.hallLevel || 1; retailLevelRef.current = restoredRetail; ticketLevelRef.current = restore.ticketLevel || 1;
    platform3Ref.current = Boolean(restore.platform3Unlocked);
    handledRef.current = restore.handled || 0; onTimeRef.current = restore.onTime || 0; lateRef.current = restore.late || 0; departedPassengersRef.current = restore.departedPassengers || 0;

    setCash(cashRef.current); setStationLevel(stationLevelRef.current); setStationXp(stationXpRef.current); setHallLevel(hallLevelRef.current); setRetailLevel(retailLevelRef.current); setTicketLevel(ticketLevelRef.current); setPlatform3Unlocked(platform3Ref.current);
    setHandled(handledRef.current); setOnTime(onTimeRef.current); setLate(lateRef.current); setDepartedPassengers(departedPassengersRef.current);

    timeRef.current = 0; sequence.current = 1700; serviceCounter.current = 0; nextServiceAt.current = 3;
    arrivalBusyRef.current = false; departureBusyRef.current = false; arrivalLaneRef.current = null; departureLaneRef.current = null;
    const initial = [];
    for (let i = 0; i < 8; i += 1) { initial.push(createService(nextServiceAt.current)); nextServiceAt.current += SERVICE_INTERVAL; }
    const initialPassengers = { noorddam: 70, havenstad: 95, oostpoort: stationLevelRef.current >= 2 ? 55 : 0, luchthaven: stationLevelRef.current >= 3 ? 45 : 0 };
    syncTimetable(initial); syncPassengers(initialPassengers); syncOutside([]); syncPlatforms({ 1: null, 2: null, 3: null });
    setServiceTime(0); setArrivalTrain(null); setArrivalLane(null); setDepartureTrain(null); setDepartureLane(null);
    setMessage(offlineIncome > 0 ? `Welkom terug. Winkels verdienden ${formatMoney(offlineIncome)} tijdens je afwezigheid.` : 'Station geopend. Treinen komen automatisch binnen; jij bouwt én bewaakt de vertrekken.');
    setPhase('playing');
  };

  if (phase === 'menu') {
    return (
      <SafeAreaView style={styles.screen}>
        <StatusBar barStyle="light-content" />
        <View style={styles.menuWrap}>
          <Text style={styles.kicker}>LIVING STATION / V0.9</Text><Text style={styles.title}>RAIL{`\n`}RUSH HOUR</Text>
          <Text style={styles.subtitle}>Bouw een levend station dat zichtbaar groeit. Reizigers, winkels, routes en perrons draaien door terwijl jij de belangrijke treinvertrekken en conflicten beheert.</Text>
          {initialSave ? <View style={styles.savePreview}><Text style={styles.savePreviewTitle}>STATION Lv {initialSave.stationLevel || 1}</Text><Text style={styles.savePreviewText}>{formatMoney(initialSave.cash || 0)} kas • hal Lv {initialSave.hallLevel || 1} • winkels Lv {initialSave.retailLevel || 1}</Text></View> : null}
          <Pressable style={styles.primaryButton} onPress={startGame}><Text style={styles.primaryButtonText}>{initialSave ? 'GA VERDER' : 'OPEN STATION'}</Text></Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const totalWaiting = Object.values(passengers).reduce((a, b) => a + b, 0);
  const capacity = hallCapacity(hallLevel);
  const blockedTrain = outside[0] && platforms[outside[0].plannedLane] ? outside[0] : null;
  const waitingForLane = (lane) => DESTINATIONS.filter((d) => d.unlockLevel <= stationLevel).reduce((sum, d) => {
    const next = timetable.find((s) => s.destination.id === d.id && !['departed', 'departing'].includes(s.status));
    return sum + (serviceLane(next) === lane ? passengers[d.id] || 0 : 0);
  }, 0);
  const xpTarget = levelTarget(stationLevel);

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="light-content" />
      <View style={styles.hud}>
        <View style={styles.hudCell}><Text style={styles.hudLabel}>KAS</Text><Text style={styles.hudMoney}>{formatMoney(cash)}</Text></View>
        <View style={styles.hudCell}><Text style={styles.hudLabel}>STATION</Text><Text style={styles.hudValue}>Lv {stationLevel}</Text></View>
        <View style={styles.hudCell}><Text style={styles.hudLabel}>REIZIGERS</Text><Text style={styles.hudValue}>{totalWaiting}/{capacity}</Text></View>
        <View style={styles.hudCell}><Text style={styles.hudLabel}>INKOMEN</Text><Text style={styles.hudMoney}>{formatMoney(passivePerSecond(retailLevel))}/s</Text></View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.levelCard}>
          <View style={styles.levelTop}><Text style={styles.levelTitle}>STATIONNIVEAU {stationLevel}</Text><Text style={styles.levelXp}>{stationXp}/{xpTarget} XP</Text></View>
          <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${pct(stationXp, xpTarget)}%` }]} /></View>
          <Text style={styles.levelHint}>{stationLevel === 1 ? 'Volgend niveau opent Oostpoort' : stationLevel === 2 ? 'Volgend niveau opent Luchthaven' : `${handled} treinen afgehandeld • ${onTime} binnen marge • ${late} te laat`}</Text>
        </View>

        <LivingStation
          width={worldWidth}
          onLayout={({ width }) => setWorldWidth(width)}
          platforms={platforms}
          passengers={passengers}
          now={serviceTime}
          hallLevel={hallLevel}
          retailLevel={retailLevel}
          ticketLevel={ticketLevel}
          platform3Unlocked={platform3Unlocked}
          arrivalTrain={arrivalTrain}
          arrivalLane={arrivalLane}
          arrivalProgress={arrivalProgress}
          departureTrain={departureTrain}
          departureLane={departureLane}
          departureProgress={departureProgress}
          onTrainPress={depart}
          stationLevel={stationLevel}
        />

        <View style={styles.messageStrip}><View style={styles.messageLamp} /><Text style={styles.messageText}>{message}</Text></View>

        {blockedTrain ? (
          <View style={styles.blockedCard}>
            <View style={styles.blockedTop}><View><Text style={styles.blockedLabel}>TREIN WACHT VOOR STATION</Text><Text style={styles.blockedTrain}>{blockedTrain.id} → {blockedTrain.destination.name}</Text></View><Text style={styles.blockedTime}>+{blockedTrain.wait}s</Text></View>
            <Text style={styles.blockedReason}>Gepland P{blockedTrain.plannedLane} is bezet. Laat hem wachten of wijk uit.</Text>
            <View style={styles.divertRow}>{LANES.filter((lane) => lane !== blockedTrain.plannedLane && (lane !== 3 || platform3Unlocked)).map((lane) => <Pressable key={lane} disabled={Boolean(platforms[lane])} style={[styles.divertButton, platforms[lane] && styles.disabled]} onPress={() => divertOutside(lane)}><Text style={styles.divertSmall}>{platforms[lane] ? 'BEZET' : 'WIJK UIT'}</Text><Text style={styles.divertBig}>P{lane}</Text></Pressable>)}</View>
          </View>
        ) : null}

        <Timetable timetable={timetable} now={serviceTime} />

        <Text style={styles.sectionHeading}>VERTREKCONTROLE</Text>
        {LANES.map((lane) => <PlatformDetail key={lane} lane={lane} train={platforms[lane]} waiting={waitingForLane(lane)} now={serviceTime} locked={lane === 3 && !platform3Unlocked} onTrainPress={depart} />)}

        <Text style={styles.sectionHeading}>BOUW & ONTWIKKEL</Text>
        <View style={styles.upgradeGrid}>
          <UpgradeCard title="STATIONSHAL" value={`Lv ${hallLevel}`} description={`Capaciteit ${capacity}. Grotere hal voorkomt overdrukte en laat de reizigersvraag verder groeien.`} cost={hallCost(hallLevel)} affordable={cash >= hallCost(hallLevel)} onPress={buyHall} />
          <UpgradeCard title="WINKELZONE" value={`Lv ${retailLevel}`} description={`${formatMoney(passivePerSecond(retailLevel))}/sec actief inkomen + offline inkomsten wanneer je terugkomt.`} cost={retailCost(retailLevel)} affordable={cash >= retailCost(retailLevel)} onPress={buyRetail} />
          <UpgradeCard title="TICKETS & SERVICE" value={`Lv ${ticketLevel}`} description={`+${15 * (ticketLevel - 1)}% opbrengst per reiziger. Servicegebouw groeit mee in het station.`} cost={ticketCost(ticketLevel)} affordable={cash >= ticketCost(ticketLevel)} onPress={buyTickets} />
          <UpgradeCard title="PERRON 3" value={platform3Unlocked ? 'OPEN' : 'BOUW'} description="Verandert het bouwterrein zichtbaar in een derde perron en vergroot de echte treinencapaciteit." cost={platform3Cost} affordable={cash >= platform3Cost} onPress={buyPlatform3} done={platform3Unlocked} />
        </View>

        <View style={styles.resultCard}><Text style={styles.resultTitle}>STATIONBEDRIJF</Text><Text style={styles.resultText}>{departedPassengers} reizigers vervoerd • {handled} treinen • {onTime} binnen marge • {late} te laat</Text></View>
      </ScrollView>
      <View style={styles.footer}><Text style={styles.footerText}>V0.9 • LEVEND STATION • ZICHTBARE GROEI • IDLE INKOMEN • LIVE VERTREKKEN</Text></View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#071016' }, scroll: { flex: 1 }, content: { paddingHorizontal: 11, paddingBottom: 30 },
  menuWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 }, kicker: { color: '#78a8c6', fontSize: 10, fontWeight: '900', letterSpacing: 2.2, marginBottom: 12 },
  title: { color: '#edf4f7', fontSize: 48, lineHeight: 45, fontWeight: '900', letterSpacing: -2, textAlign: 'center' }, subtitle: { color: '#94a4ae', fontSize: 15, lineHeight: 22, textAlign: 'center', marginTop: 20, marginBottom: 18, maxWidth: 390 },
  savePreview: { width: '100%', maxWidth: 360, backgroundColor: '#0d1b22', borderWidth: 1, borderColor: '#284553', borderRadius: 9, padding: 11, marginBottom: 15, alignItems: 'center' }, savePreviewTitle: { color: '#dceaf0', fontSize: 12, fontWeight: '900' }, savePreviewText: { color: '#7e949f', fontSize: 8.5, fontWeight: '800', marginTop: 4 },
  primaryButton: { backgroundColor: '#ffd65a', minWidth: 230, paddingVertical: 16, alignItems: 'center', borderRadius: 9, borderWidth: 2, borderColor: '#ffe795' }, primaryButtonText: { color: '#101820', fontWeight: '900', fontSize: 15, letterSpacing: 1.2 },

  hud: { flexDirection: 'row', paddingHorizontal: 8, paddingTop: 10, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#16232c' }, hudCell: { flex: 1, alignItems: 'center' },
  hudLabel: { color: '#5f717d', fontSize: 6.7, fontWeight: '900', letterSpacing: 0.7 }, hudValue: { color: '#e3edf1', fontSize: 13.5, fontWeight: '900', marginTop: 2 }, hudMoney: { color: '#67e89a', fontSize: 13.5, fontWeight: '900', marginTop: 2 },

  levelCard: { marginTop: 9, backgroundColor: '#10191f', borderWidth: 1, borderColor: '#325267', borderRadius: 10, padding: 10 }, levelTop: { flexDirection: 'row', justifyContent: 'space-between' }, levelTitle: { color: '#d9e8ef', fontSize: 10, fontWeight: '900' }, levelXp: { color: '#87b6cf', fontSize: 8, fontWeight: '900' }, progressTrack: { height: 8, marginTop: 7, backgroundColor: '#1b2a33', borderRadius: 4, overflow: 'hidden' }, progressFill: { height: '100%', backgroundColor: '#58b9ff' }, levelHint: { color: '#70858f', fontSize: 7.4, fontWeight: '700', marginTop: 5 },

  worldCard: { marginTop: 9, backgroundColor: '#0b151b', borderWidth: 1, borderColor: '#2d4653', borderRadius: 12, overflow: 'hidden' }, worldHeader: { minHeight: 51, paddingHorizontal: 11, paddingVertical: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#0e1b22', borderBottomWidth: 1, borderBottomColor: '#263a45' }, worldKicker: { color: '#6f8996', fontSize: 6.7, fontWeight: '900', letterSpacing: 1 }, worldTitle: { color: '#e5f0f4', fontSize: 15, fontWeight: '900', marginTop: 2 }, crowdBadge: { backgroundColor: '#17382a', borderWidth: 1, borderColor: '#3aa96b', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 5 }, crowdBadgeDanger: { backgroundColor: '#3a1d22', borderColor: '#c95563' }, crowdBadgeText: { color: '#e4eef2', fontSize: 7, fontWeight: '900' },
  stationCampus: { height: 346, backgroundColor: '#10191d', position: 'relative', padding: 9 }, buildingRow: { height: 70, flexDirection: 'row', gap: 6, alignItems: 'flex-end' }, buildingBlock: { height: 57, minWidth: 60, backgroundColor: '#273944', borderWidth: 1, borderColor: '#465d69', borderRadius: 5, padding: 7, justifyContent: 'flex-end', overflow: 'hidden' }, buildingAccent: { backgroundColor: '#304a59', borderColor: '#6c9bb4' }, buildingRoof: { position: 'absolute', left: 0, right: 0, top: 0, height: 8, backgroundColor: '#14252f' }, buildingTitle: { color: '#e1ebef', fontSize: 7, fontWeight: '900' }, buildingSub: { color: '#87a0ad', fontSize: 6, fontWeight: '800', marginTop: 2 },
  concourse: { height: 65, marginTop: 4, backgroundColor: '#1a252b', borderWidth: 1, borderColor: '#394a53', borderRadius: 5, paddingHorizontal: 9, paddingVertical: 7, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, concourseTitle: { color: '#b9c8cf', fontSize: 7, fontWeight: '900' }, concourseSub: { color: '#71858f', fontSize: 6.5, fontWeight: '800', marginTop: 2 }, passengerDots: { width: '49%', flexDirection: 'row', flexWrap: 'wrap', gap: 4, justifyContent: 'flex-end' }, passengerDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#9eb0b8' }, passengerDotAccent: { backgroundColor: '#68c6f5' },
  worldPlatform: { height: 58, marginTop: 4, position: 'relative', justifyContent: 'center', paddingLeft: 38, overflow: 'hidden' }, worldPlatformLocked: { opacity: 0.55 }, platformLabelBox: { position: 'absolute', left: 3, top: 17, width: 28, height: 25, borderRadius: 4, alignItems: 'center', justifyContent: 'center', backgroundColor: '#17252d', borderWidth: 1, borderColor: '#405661' }, platformLabel: { color: '#d9e5ea', fontSize: 9, fontWeight: '900' }, platformEdgeWorld: { position: 'absolute', left: 38, right: 4, top: 4, height: 10, borderRadius: 3, backgroundColor: '#3b454b', borderTopWidth: 2, borderTopColor: '#77838a' }, railLine: { position: 'absolute', left: 38, right: 4, top: 35, height: 8, backgroundColor: '#3d464b' }, railInner: { position: 'absolute', left: 0, right: 0, top: 3, height: 2, backgroundColor: '#9ba4a8' }, staticTrainWorld: { marginTop: 11, alignSelf: 'flex-start' }, worldTrainLabel: { color: '#9cb0ba', fontSize: 6.2, fontWeight: '900', marginTop: 2 }, worldTrainLabelReady: { color: '#5de590' }, worldTrainLabelLate: { color: '#ff7a89' }, emptyTrackText: { color: '#53656f', fontSize: 6.5, fontWeight: '800', marginTop: 12 }, construction: { marginTop: 11, height: 27, borderWidth: 1, borderStyle: 'dashed', borderColor: '#876f3c', backgroundColor: '#282317', borderRadius: 4, justifyContent: 'center', alignItems: 'center' }, constructionText: { color: '#c4a767', fontSize: 6.5, fontWeight: '900', letterSpacing: 0.5 },
  movingTrainWorld: { position: 'absolute', left: 0, zIndex: 8, alignItems: 'flex-start' }, movingLabel: { color: '#ffd65a', fontSize: 6, fontWeight: '900', marginTop: 1 },
  routeRibbon: { padding: 9, flexDirection: 'row', gap: 6, backgroundColor: '#0d171d', borderTopWidth: 1, borderTopColor: '#263943' }, routePill: { flex: 1, minHeight: 46, borderRadius: 6, backgroundColor: '#112735', borderWidth: 1, borderColor: '#326580', padding: 6, alignItems: 'center' }, routePillLocked: { opacity: 0.35, backgroundColor: '#181d20', borderColor: '#3d4448' }, routePillCode: { color: '#7bd5ff', fontSize: 8.5, fontWeight: '900' }, routePillName: { color: '#97aab3', fontSize: 5.8, fontWeight: '800', marginTop: 2, textAlign: 'center' },

  trainPress: { borderRadius: 5 }, trainStripInner: { flexDirection: 'row', alignItems: 'center' }, trainSet: { width: 54, height: 20, backgroundColor: '#dbeaf1', borderWidth: 1, borderColor: '#1b303a', borderRadius: 3, overflow: 'hidden', justifyContent: 'center' }, trainSetCompact: { width: 44, height: 17 }, trainSetReady: { backgroundColor: '#bcebd0', borderColor: '#2e9f60' }, trainSetLate: { backgroundColor: '#f0c5ca', borderColor: '#b94452' }, trainCoupler: { width: 7, height: 3, backgroundColor: '#75838a' }, trainCouplerCompact: { width: 5 }, trainCab: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 5, backgroundColor: '#5993b0' }, trainWindows: { position: 'absolute', left: 10, right: 4, top: 4, flexDirection: 'row', justifyContent: 'space-around' }, trainWindow: { width: 7, height: 4, borderRadius: 1, backgroundColor: '#31566c' }, trainSetText: { color: '#183541', fontSize: 6.5, fontWeight: '900', textAlign: 'center', marginTop: 7 }, trainSetTextCompact: { fontSize: 5.5, marginTop: 5 },

  messageStrip: { minHeight: 40, flexDirection: 'row', alignItems: 'center', marginTop: 8, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: '#0a1218', borderWidth: 1, borderColor: '#20303a', borderRadius: 8 }, messageLamp: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#58b9ff', marginRight: 8 }, messageText: { flex: 1, color: '#a3b1ba', fontSize: 9, lineHeight: 12, fontWeight: '700' },
  blockedCard: { marginTop: 8, backgroundColor: '#271a0d', borderWidth: 1.5, borderColor: '#d1953d', borderRadius: 10, padding: 10 }, blockedTop: { flexDirection: 'row', justifyContent: 'space-between' }, blockedLabel: { color: '#b79056', fontSize: 7, fontWeight: '900' }, blockedTrain: { color: '#ffe6b1', fontSize: 15, fontWeight: '900', marginTop: 2 }, blockedTime: { color: '#ffbc55', fontSize: 17, fontWeight: '900' }, blockedReason: { color: '#ba9d70', fontSize: 8.5, lineHeight: 12, marginTop: 7 }, divertRow: { flexDirection: 'row', gap: 7, marginTop: 8 }, divertButton: { flex: 1, minHeight: 46, borderRadius: 7, borderWidth: 1, borderColor: '#d1953d', backgroundColor: '#33230f', alignItems: 'center', justifyContent: 'center' }, divertSmall: { color: '#c3a36b', fontSize: 6.5, fontWeight: '900' }, divertBig: { color: '#ffda91', fontSize: 17, fontWeight: '900' }, disabled: { opacity: 0.3 },

  card: { marginTop: 8, backgroundColor: '#0d161d', borderWidth: 1, borderColor: '#2b3b45', borderRadius: 10, padding: 10 }, cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, cardLabel: { color: '#718591', fontSize: 7.2, fontWeight: '900', letterSpacing: 1.1 }, clock: { color: '#ffd65a', fontSize: 14, fontWeight: '900' }, serviceRow: { minHeight: 38, flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#182630' }, serviceTime: { width: 42, color: '#70d29a', fontSize: 9, fontWeight: '900' }, serviceMain: { flex: 1 }, serviceId: { color: '#e2ebef', fontSize: 10, fontWeight: '900' }, serviceDest: { color: '#7c919c', fontSize: 7.2, fontWeight: '800' }, serviceLane: { width: 26, color: '#58b9ff', fontSize: 9, fontWeight: '900', textAlign: 'center' }, serviceStatus: { width: 76, color: '#c5d1d7', fontSize: 6.8, fontWeight: '900', textAlign: 'right' },

  sectionHeading: { color: '#78909c', fontSize: 7.5, fontWeight: '900', letterSpacing: 1.2, textAlign: 'center', marginTop: 14, marginBottom: 7 }, platformDetail: { marginBottom: 6, minHeight: 66, backgroundColor: '#0d161d', borderWidth: 1, borderColor: '#263842', borderRadius: 9, padding: 9 }, platformDetailReady: { borderColor: '#3bd27a', backgroundColor: '#0e1d16' }, platformDetailLate: { borderColor: '#d95664', backgroundColor: '#211317' }, detailTop: { flexDirection: 'row', justifyContent: 'space-between' }, detailPlatform: { color: '#dfe9ed', fontSize: 9.5, fontWeight: '900' }, detailTime: { color: '#ffd65a', fontSize: 9.5, fontWeight: '900' }, detailDestination: { color: '#7d929d', fontSize: 7.5, fontWeight: '800', marginTop: 5 }, detailMuted: { color: '#738690', fontSize: 8, fontWeight: '800', marginTop: 8 }, detailAction: { color: '#8b9ca5', fontSize: 7.3, fontWeight: '900', marginTop: 6 }, detailActionReady: { color: '#59e493' },

  upgradeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, upgradeCard: { width: '48.7%', minHeight: 128, backgroundColor: '#0d161d', borderWidth: 1, borderColor: '#2b3b45', borderRadius: 9, padding: 9 }, upgradeAffordable: { borderColor: '#d4a947', backgroundColor: '#18170f' }, upgradeDone: { borderColor: '#3c9f68', backgroundColor: '#0d1b14' }, upgradeTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 5 }, upgradeTitle: { flex: 1, color: '#dfe9ed', fontSize: 8, fontWeight: '900' }, upgradeValue: { color: '#75c9f5', fontSize: 8, fontWeight: '900' }, upgradeDescription: { color: '#71838d', fontSize: 7, lineHeight: 10, marginTop: 8, flex: 1 }, upgradeCost: { color: '#ffd65a', fontSize: 11, fontWeight: '900', marginTop: 7 },
  resultCard: { marginTop: 12, backgroundColor: '#0b141a', borderWidth: 1, borderColor: '#22333d', borderRadius: 8, padding: 10 }, resultTitle: { color: '#667b87', fontSize: 6.5, fontWeight: '900', letterSpacing: 1 }, resultText: { color: '#9aaab3', fontSize: 8.5, fontWeight: '800', marginTop: 4 },
  footer: { alignItems: 'center', paddingVertical: 7, paddingHorizontal: 8, borderTopWidth: 1, borderTopColor: '#14212a' }, footerText: { color: '#42535e', fontSize: 6.2, fontWeight: '900', textAlign: 'center' },
});