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
import Svg, { Circle, Path, Rect, Text as SvgText } from 'react-native-svg';

const LANES = [1, 2, 3];
const TRACK_Y = { 1: 55, 2: 140, 3: 225 };
const ARRIVAL_MS = 4200;
const DEPARTURE_MS = 3500;
const SERVICE_INTERVAL = 9;
const DELAY_MARGIN_SECONDS = 12;
const MOTION_RANGE = [0, 0.16, 0.32, 0.5, 0.68, 0.84, 1];
const BOARD_W = 460;
const BOARD_H = 280;
const PLATFORM_START = 264;
const PLATFORM_END = 430;
const TRAIN_STOP_X = 350;

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

const SEGMENTS = {
  IN: 'M 15 95 H 85', WIN: 'M 85 95 L 110 110', U0: 'M 110 110 H 135',
  EW_U: 'M 135 110 H 175', EW_L: 'M 135 170 H 175', EW_X1: 'M 135 110 L 175 170', EW_X2: 'M 135 170 L 175 110',
  U1: 'M 175 110 H 195', L1: 'M 175 170 H 195',
  K_U: 'M 195 110 H 235', K_L: 'M 195 170 H 235', K_X1: 'M 195 110 L 235 170', K_X2: 'M 195 170 L 235 110',
  P1: `M 235 110 L 260 55 H ${PLATFORM_END}`,
  P2U: 'M 235 110 L 260 140', P2L: 'M 235 170 L 260 140', P2: `M 260 140 H ${PLATFORM_END}`,
  P3: `M 235 170 L 260 225 H ${PLATFORM_END}`,
  L0: 'M 110 170 H 135', WOUT: 'M 85 185 L 110 170', OUT: 'M 15 185 H 85',
};

const ARRIVAL_ROUTES = {
  1: { segments: ['IN', 'WIN', 'U0', 'EW_U', 'U1', 'K_U', 'P1'], locks: ['EW_TOP', 'K_TOP', 'P1'] },
  2: { segments: ['IN', 'WIN', 'U0', 'EW_U', 'U1', 'K_U', 'P2U', 'P2'], locks: ['EW_TOP', 'K_TOP', 'P2'] },
  3: { segments: ['IN', 'WIN', 'U0', 'EW_X1', 'L1', 'K_L', 'P3'], locks: ['EW_TOP', 'EW_BOTTOM', 'K_BOTTOM', 'P3'] },
};

const DEPARTURE_ROUTES = {
  1: { segments: ['P1', 'K_X2', 'L1', 'EW_L', 'L0', 'WOUT', 'OUT'], locks: ['P1', 'K_TOP', 'K_BOTTOM', 'EW_BOTTOM'] },
  2: { segments: ['P2', 'P2L', 'K_L', 'L1', 'EW_L', 'L0', 'WOUT', 'OUT'], locks: ['P2', 'K_BOTTOM', 'EW_BOTTOM'] },
  3: { segments: ['P3', 'K_L', 'L1', 'EW_L', 'L0', 'WOUT', 'OUT'], locks: ['P3', 'K_BOTTOM', 'EW_BOTTOM'] },
};

const ARRIVAL_POINTS = {
  1: [[15, 95], [85, 95], [110, 110], [175, 110], [235, 110], [260, 55], [TRAIN_STOP_X, 55]],
  2: [[15, 95], [85, 95], [110, 110], [175, 110], [235, 110], [260, 140], [TRAIN_STOP_X, 140]],
  3: [[15, 95], [85, 95], [110, 110], [175, 170], [235, 170], [260, 225], [TRAIN_STOP_X, 225]],
};

const DEPARTURE_POINTS = {
  1: [[TRAIN_STOP_X, 55], [260, 55], [235, 110], [195, 170], [135, 170], [85, 185], [15, 185]],
  2: [[TRAIN_STOP_X, 140], [260, 140], [235, 170], [195, 170], [135, 170], [85, 185], [15, 185]],
  3: [[TRAIN_STOP_X, 225], [260, 225], [235, 170], [195, 170], [135, 170], [85, 185], [15, 185]],
};

const routesConflict = (a, b) => Boolean(a && b && a.locks.some((lock) => b.locks.includes(lock)));
const pct = (value, max) => Math.max(0, Math.min(100, Math.round((value / Math.max(1, max)) * 100)));
const levelTarget = (level) => 320 + level * 180;
const hallCost = (level) => 650 + level * 450;
const retailCost = (level) => 700 + level * 500;
const ticketCost = (level) => 850 + level * 550;
const platform3Cost = 2200;
const formatMoney = (value) => `€${Math.max(0, Math.round(value)).toLocaleString('nl-NL')}`;

const formatClock = (seconds) => {
  const base = 8 * 3600 + Math.max(0, Math.round(seconds));
  const h = Math.floor(base / 3600) % 24;
  const m = Math.floor((base % 3600) / 60);
  const s = base % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

const departureInfo = (train, now) => {
  if (!train) return null;
  const departureAt = train.departureAt ?? train.scheduledAt;
  const untilDeparture = departureAt - now;
  if (untilDeparture > 0) return { state: 'early', detail: `nog ${untilDeparture}s`, canDepart: false, marginLeft: DELAY_MARGIN_SECONDS };
  const marginLeft = departureAt + DELAY_MARGIN_SECONDS - now;
  if (marginLeft >= 0) return { state: 'window', detail: `${marginLeft}s marge`, canDepart: true, marginLeft };
  return { state: 'late', detail: `+${Math.abs(marginLeft)}s te laat`, canDepart: true, marginLeft: 0 };
};

const unitWidth = (train) => train.type.code === 'EXP' ? 38 : train.type.code === 'IC' ? 34 : 28;
const consistWidth = (train) => train.sets * unitWidth(train) + Math.max(0, train.sets - 1) * 5;
const serviceLane = (service) => service?.actualLane || service?.plannedLane || null;

function movementPosition(progress, points, scaleX, scaleY, train) {
  const width = consistWidth(train);
  return {
    x: progress.interpolate({ inputRange: MOTION_RANGE, outputRange: points.map(([x]) => x * scaleX - width / 2) }),
    y: progress.interpolate({ inputRange: MOTION_RANGE, outputRange: points.map(([, y]) => y * scaleY - 15) }),
  };
}

function RouteHighlight({ route, color }) {
  if (!route) return null;
  return route.segments.map((id) => <Path key={`${color}-${id}`} d={SEGMENTS[id]} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />);
}

function Signal({ x, y, green, label }) {
  return (
    <>
      <Path d={`M ${x} ${y + 8} V ${y + 22}`} stroke="#74808b" strokeWidth="3" />
      <Rect x={x - 7} y={y - 10} width="14" height="20" rx="4" fill="#101820" stroke="#697580" strokeWidth="1.5" />
      <Circle cx={x} cy={y - 3} r="4.4" fill={green ? '#38e27d' : '#ff4d5f'} />
      <SvgText x={x - 11} y={y + 33} fill="#71808d" fontSize="8" fontWeight="800">{label}</SvgText>
    </>
  );
}

function TrainConsist({ train, detail, style, onPress, departureState }) {
  const width = unitWidth(train);
  const body = (
    <>
      <View style={styles.consistUnits}>
        {Array.from({ length: train.sets }).map((_, index) => (
          <React.Fragment key={`${train.id}-${index}`}>
            {index > 0 ? <View style={styles.coupler} /> : null}
            <View style={[styles.consistUnit, { width }]}>
              <View style={styles.cabBand} />
              <View style={styles.windowsRow}><View style={styles.windowDot} /><View style={styles.windowDot} />{width >= 34 ? <View style={styles.windowDot} /> : null}</View>
              <Text style={styles.consistCode}>{train.type.code}</Text>
            </View>
          </React.Fragment>
        ))}
      </View>
      <Text style={styles.consistId}>{train.id}</Text>
      <Text style={styles.consistDetail}>{detail || train.destination.name}</Text>
    </>
  );
  if (!onPress) return <View pointerEvents="none" style={[styles.consistWrap, style]}>{body}</View>;
  return (
    <Pressable hitSlop={12} onPress={onPress} style={[styles.consistWrap, styles.consistTouchable, departureState === 'window' && styles.consistReady, departureState === 'late' && styles.consistLate, style]}>
      {body}
    </Pressable>
  );
}

function StationView({ boardSize, onLayout, platforms, arrivalTrain, arrivalLane, arrivalProgress, departureTrain, departureLane, departureProgress, onTrainPress, now, platform3Unlocked }) {
  const scaleX = boardSize.width / BOARD_W || 1;
  const scaleY = boardSize.height / BOARD_H || 1;
  const arrivalPos = arrivalTrain ? movementPosition(arrivalProgress, ARRIVAL_POINTS[arrivalLane], scaleX, scaleY, arrivalTrain) : null;
  const departurePos = departureTrain ? movementPosition(departureProgress, DEPARTURE_POINTS[departureLane], scaleX, scaleY, departureTrain) : null;
  return (
    <View style={styles.stationFrame}>
      <View style={styles.stationHeader}><Text style={styles.stationHeaderTitle}>LIVE STATION</Text><Text style={styles.stationHeaderHint}>groene trein = tik voor vertrek</Text></View>
      <View style={styles.svgArea} onLayout={(e) => onLayout(e.nativeEvent.layout)}>
        <Svg width="100%" height="100%" viewBox={`0 0 ${BOARD_W} ${BOARD_H}`}>
          <Rect x="1" y="1" width={BOARD_W - 2} height={BOARD_H - 2} rx="10" fill="#081016" stroke="#26343f" strokeWidth="2" />
          {LANES.map((lane) => (
            <React.Fragment key={lane}>
              <Rect x={PLATFORM_START} y={TRACK_Y[lane] + 10} width={PLATFORM_END - PLATFORM_START} height="12" rx="3" fill={lane === 3 && !platform3Unlocked ? '#15191c' : '#18242c'} stroke="#3c4c56" />
              <SvgText x={PLATFORM_END - 2} y={TRACK_Y[lane] + 35} fill={lane === 3 && !platform3Unlocked ? '#4c5358' : '#657681'} fontSize="7.5" fontWeight="900" textAnchor="end">P{lane}{lane === 3 && !platform3Unlocked ? ' GESLOTEN' : ''}</SvgText>
            </React.Fragment>
          ))}
          {Object.entries(SEGMENTS).map(([id, d]) => <Path key={id} d={d} fill="none" stroke="#45525c" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />)}
          {LANES.map((lane) => platforms[lane] ? <Path key={`occ-${lane}`} d={`M ${PLATFORM_START + 4} ${TRACK_Y[lane]} H ${PLATFORM_END}`} fill="none" stroke="#ff4d6d" strokeWidth="8" strokeLinecap="round" /> : null)}
          <RouteHighlight route={arrivalTrain ? ARRIVAL_ROUTES[arrivalLane] : null} color="#ffd65a" />
          <RouteHighlight route={departureTrain ? DEPARTURE_ROUTES[departureLane] : null} color="#66d8ff" />
          <Rect x="132" y="103" width="46" height="74" rx="5" fill="none" stroke="#657783" strokeWidth="1" strokeDasharray="3 3" />
          <SvgText x="139" y="99" fill="#9aa8b1" fontSize="8" fontWeight="900">EW1</SvgText>
          <Circle cx="215" cy="140" r="7" fill="#0b151d" stroke="#657783" strokeWidth="1.5" />
          <Signal x={52} y={70} green={Boolean(arrivalTrain)} label="IN" />
          <Signal x={52} y={210} green={Boolean(departureTrain)} label="UIT" />
          {LANES.map((lane) => <Signal key={lane} x={286} y={TRACK_Y[lane] - 23} green={Boolean(departureTrain) && departureLane === lane} label={`P${lane}`} />)}
        </Svg>

        {boardSize.width > 0 && LANES.map((lane) => {
          const train = platforms[lane];
          if (!train || (departureTrain && departureTrain.id === train.id)) return null;
          const timing = departureInfo(train, now);
          const state = train.status === 'ready' ? timing.state : 'early';
          const width = consistWidth(train);
          const detail = train.status !== 'ready' ? `${train.remaining}s halte` : timing.state === 'window' ? `VERTREK • ${timing.marginLeft}s` : timing.state === 'late' ? 'VERTREK NU' : `over ${train.departureAt - now}s`;
          return <TrainConsist key={train.id} train={train} detail={detail} departureState={state} onPress={() => onTrainPress(lane)} style={{ position: 'absolute', left: TRAIN_STOP_X * scaleX - width / 2, top: TRACK_Y[lane] * scaleY - 15 }} />;
        })}
        {arrivalTrain && arrivalPos ? <Animated.View pointerEvents="none" style={[styles.movingConsist, { transform: [{ translateX: arrivalPos.x }, { translateY: arrivalPos.y }] }]}><TrainConsist train={arrivalTrain} detail={`→ ${arrivalTrain.destination.name}`} /></Animated.View> : null}
        {departureTrain && departurePos ? <Animated.View pointerEvents="none" style={[styles.movingConsist, { transform: [{ translateX: departurePos.x }, { translateY: departurePos.y }] }]}><TrainConsist train={departureTrain} detail={`→ ${departureTrain.destination.name}`} /></Animated.View> : null}
      </View>
    </View>
  );
}

function Timetable({ timetable, now }) {
  const visible = timetable.filter((s) => s.status !== 'departed').slice(0, 5);
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}><Text style={styles.cardLabel}>DIENSTREGELING</Text><Text style={styles.clock}>{formatClock(now)}</Text></View>
      {visible.map((service) => {
        const timing = departureInfo(service, now);
        let status = service.status === 'scheduled' ? `in ${Math.max(0, service.scheduledAt - now)}s` : service.status === 'waiting' ? `WACHT P${service.plannedLane}` : service.status === 'arriving' ? `→ P${service.actualLane}` : service.status === 'at_platform' ? (timing.state === 'early' ? `V over ${service.departureAt - now}s` : timing.state === 'window' ? `V ${timing.marginLeft}s` : `V +${now - service.departureAt}s`) : 'VERTREKT';
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

function DemandBoard({ passengers, timetable, stationLevel }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}><Text style={styles.cardLabel}>REIZIGERS & BESTEMMINGEN</Text><Text style={styles.cardSub}>niveau {stationLevel}</Text></View>
      {DESTINATIONS.map((destination) => {
        const locked = destination.unlockLevel > stationLevel;
        const service = timetable.find((s) => s.destination.id === destination.id && !['departed', 'departing'].includes(s.status));
        return (
          <View key={destination.id} style={[styles.demandRow, locked && styles.lockedRow]}>
            <View style={styles.demandNameWrap}><Text style={styles.demandName}>{locked ? '🔒 ' : ''}{destination.name}</Text><Text style={styles.demandSub}>{locked ? `vrij vanaf stationniveau ${destination.unlockLevel}` : service ? `${service.id} • P${serviceLane(service)}` : 'volgende trein wordt gepland'}</Text></View>
            <Text style={styles.demandCount}>{locked ? '—' : passengers[destination.id] || 0}</Text>
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

function PlatformCard({ lane, train, waiting, onTrainPress, now, locked }) {
  if (locked) return <View style={[styles.platformCard, styles.platformLocked]}><Text style={styles.platformTitle}>PERRON {lane}</Text><Text style={styles.platformLockedText}>GESLOTEN • vrij te spelen in stationontwikkeling</Text></View>;
  if (!train) return <View style={styles.platformCard}><View style={styles.platformTop}><Text style={styles.platformTitle}>PERRON {lane}</Text><Text style={styles.freeBadge}>VRIJ</Text></View><Text style={styles.emptyPlatform}>{waiting} reizigers toegewezen aan dit perron</Text></View>;
  const timing = departureInfo(train, now);
  const canDepart = train.status === 'ready' && timing.canDepart;
  return (
    <View style={[styles.platformCard, canDepart && styles.platformReady]}>
      <View style={styles.platformTop}><View><Text style={styles.platformTitle}>PERRON {lane}</Text><Text style={styles.trainTitle}>{train.id} → {train.destination.name}</Text></View><Text style={[styles.trainState, timing.state === 'window' && styles.stateGreen, timing.state === 'late' && styles.stateRed]}>{train.status === 'ready' ? timing.detail : `${train.remaining}s HALTE`}</Text></View>
      <Pressable hitSlop={10} onPress={() => onTrainPress(lane)} style={styles.platformTrainTap}>
        <View style={styles.largeConsist}>{Array.from({ length: train.sets }).map((_, i) => <React.Fragment key={i}>{i > 0 ? <View style={styles.largeCoupler} /> : null}<View style={[styles.largeSet, canDepart && styles.largeSetReady]}><Text style={styles.largeSetText}>{train.type.code}</Text></View></React.Fragment>)}</View>
      </Pressable>
      <View style={styles.platformStats}><Text style={styles.statText}>{train.onboard}/{train.capacity} in trein</Text><Text style={styles.statText}>{waiting} wachtend</Text><Text style={styles.statText}>vertrek {formatClock(train.departureAt).slice(0, 5)}</Text></View>
      <Text style={[styles.tapHint, canDepart && styles.tapHintReady]}>{canDepart ? 'TIK OP TREIN OM TE VERTREKKEN' : timing.state === 'early' ? `vertrek over ${Math.max(0, train.departureAt - now)}s` : 'reizigerswissel bezig'}</Text>
    </View>
  );
}

export default function App() {
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
  const [boardSize, setBoardSize] = useState({ width: 0, height: 0 });
  const [message, setMessage] = useState('');

  const [cash, setCash] = useState(350);
  const [stationLevel, setStationLevel] = useState(1);
  const [stationXp, setStationXp] = useState(0);
  const [hallLevel, setHallLevel] = useState(1);
  const [retailLevel, setRetailLevel] = useState(1);
  const [ticketLevel, setTicketLevel] = useState(1);
  const [platform3Unlocked, setPlatform3Unlocked] = useState(false);
  const [handled, setHandled] = useState(0);
  const [onTime, setOnTime] = useState(0);
  const [late, setLate] = useState(0);
  const [departedPassengers, setDepartedPassengers] = useState(0);

  const arrivalProgress = useRef(new Animated.Value(0)).current;
  const departureProgress = useRef(new Animated.Value(0)).current;
  const timeRef = useRef(0);
  const timetableRef = useRef([]);
  const passengersRef = useRef({ noorddam: 70, havenstad: 95, oostpoort: 0, luchthaven: 0 });
  const outsideRef = useRef([]);
  const platformsRef = useRef({ 1: null, 2: null, 3: null });
  const cashRef = useRef(350);
  const stationLevelRef = useRef(1);
  const stationXpRef = useRef(0);
  const hallLevelRef = useRef(1);
  const retailLevelRef = useRef(1);
  const ticketLevelRef = useRef(1);
  const platform3Ref = useRef(false);
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

  const awardXp = (amount) => {
    let xp = stationXpRef.current + amount;
    let level = stationLevelRef.current;
    let leveled = false;
    while (xp >= levelTarget(level)) {
      xp -= levelTarget(level);
      level += 1;
      leveled = true;
    }
    stationXpRef.current = xp;
    stationLevelRef.current = level;
    setStationXp(Math.round(xp));
    setStationLevel(level);
    if (leveled) setMessage(`Stationniveau ${level}! ${level === 2 ? 'Nieuwe route Oostpoort ontgrendeld.' : level === 3 ? 'Luchthavenroute ontgrendeld.' : 'Meer groeiruimte beschikbaar.'}`);
  };

  const createService = (scheduledAt) => {
    const index = serviceCounter.current++;
    sequence.current += index % 3 === 0 ? 4 : 2;
    const type = TRAIN_TYPES[index % TRAIN_TYPES.length];
    const destinations = DESTINATIONS.filter((d) => d.unlockLevel <= stationLevelRef.current);
    const destination = destinations[index % destinations.length];
    const availableLanes = platform3Ref.current ? [1, 2, 3] : [1, 2];
    const plannedLane = availableLanes[index % availableLanes.length];
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
    if (train.plannedLane === 3 && !platform3Ref.current) return;
    if (platformsRef.current[train.plannedLane] || arrivalConflict(train.plannedLane)) return;
    startArrival(train, train.plannedLane, false);
  };

  const startArrival = (train, lane, diverted) => {
    if (!train || arrivalBusyRef.current || platformsRef.current[lane] || arrivalConflict(lane) || (lane === 3 && !platform3Ref.current)) return false;
    arrivalBusyRef.current = true;
    arrivalLaneRef.current = lane;
    syncOutside(outsideRef.current.filter((item) => item.serviceId !== train.serviceId));
    updateService(train.serviceId, { status: 'arriving', actualLane: lane });
    const moving = { ...train, actualLane: lane };
    setArrivalTrain(moving); setArrivalLane(lane); arrivalProgress.setValue(0);
    setMessage(diverted ? `${train.id} wijkt uit van P${train.plannedLane} naar P${lane}.` : `${train.id} rijdt automatisch binnen op P${lane}.`);
    Animated.timing(arrivalProgress, { toValue: 1, duration: ARRIVAL_MS, useNativeDriver: true }).start(({ finished }) => {
      arrivalBusyRef.current = false; arrivalLaneRef.current = null;
      if (!finished) return;
      const alight = Math.min(moving.onboard, Math.round(moving.onboard * (0.23 + Math.random() * 0.18)));
      const transfer = Math.round(alight * (0.25 + Math.random() * 0.25));
      const nextPassengers = { ...passengersRef.current };
      const transferChoices = DESTINATIONS.filter((d) => d.unlockLevel <= stationLevelRef.current && d.id !== moving.destination.id);
      if (transferChoices.length) {
        for (let i = 0; i < transfer; i += 1) nextPassengers[transferChoices[i % transferChoices.length].id] += 1;
      }
      const platformTrain = { ...moving, lane, onboard: moving.onboard - alight, status: 'dwelling', remaining: moving.type.dwell, lastAlight: alight, lastTransfer: transfer };
      syncPassengers(nextPassengers);
      syncPlatforms({ ...platformsRef.current, [lane]: platformTrain });
      updateService(moving.serviceId, { status: 'at_platform', actualLane: lane });
      setArrivalTrain(null); setArrivalLane(null);
      setMessage(`${moving.id} op P${lane}: ${alight} uitgestapt, ${transfer} overstappers. Vertrek ${formatClock(moving.departureAt).slice(0, 5)}.`);
      setTimeout(tryAutoArrival, 60);
    });
    return true;
  };

  const divertOutside = (lane) => {
    const train = outsideRef.current[0];
    if (!train || platformsRef.current[lane] || (lane === 3 && !platform3Ref.current)) return;
    if (arrivalConflict(lane)) { setMessage(`P${lane} is vrij, maar de rijweg is bezet.`); return; }
    startArrival(train, lane, true);
  };

  const depart = (lane) => {
    const train = platformsRef.current[lane];
    if (!train || departureBusyRef.current) return;
    if (train.status !== 'ready') { setMessage(`${train.id}: reizigerswissel nog ${train.remaining || 0}s.`); return; }
    const timing = departureInfo(train, timeRef.current);
    if (!timing.canDepart) { setMessage(`${train.id} mag nog niet vertrekken — nog ${train.departureAt - timeRef.current}s.`); return; }
    if (departureConflict(lane)) { setMessage(`${train.id} mag vertrekken, maar de uitrijweg is bezet.`); return; }

    departureBusyRef.current = true;
    departureLaneRef.current = lane;
    const delay = Math.max(0, timeRef.current - train.departureAt);
    syncPlatforms({ ...platformsRef.current, [lane]: { ...train, status: 'departing' } });
    updateService(train.serviceId, { status: 'departing', actualDepartureAt: timeRef.current, departureDelay: delay });
    setDepartureTrain(train); setDepartureLane(lane); departureProgress.setValue(0);

    Animated.timing(departureProgress, { toValue: 1, duration: DEPARTURE_MS, useNativeDriver: true }).start(({ finished }) => {
      departureBusyRef.current = false; departureLaneRef.current = null;
      if (!finished) return;
      const fareMultiplier = 1 + (ticketLevelRef.current - 1) * 0.15;
      const revenue = Math.round(train.onboard * train.destination.fare * fareMultiplier);
      const withinMargin = delay <= DELAY_MARGIN_SECONDS;
      syncPlatforms({ ...platformsRef.current, [lane]: null });
      updateService(train.serviceId, { status: 'departed' });
      setDepartureTrain(null); setDepartureLane(null);
      setHandled((v) => v + 1);
      setDepartedPassengers((v) => v + train.onboard);
      if (withinMargin) setOnTime((v) => v + 1); else setLate((v) => v + 1);
      addCash(revenue + (withinMargin ? 80 : 0));
      awardXp(Math.round(train.onboard / 3) + (withinMargin ? 60 : 15));
      setMessage(`${train.id} vertrokken naar ${train.destination.name}. Opbrengst ${formatMoney(revenue)}${withinMargin ? ' + €80 punctualiteitsbonus' : ''}.`);
      setTimeout(tryAutoArrival, 60);
    });
  };

  const buyHall = () => {
    const cost = hallCost(hallLevelRef.current);
    if (!spendCash(cost)) { setMessage('Onvoldoende geld voor uitbreiding van de stationshal.'); return; }
    hallLevelRef.current += 1; setHallLevel(hallLevelRef.current); setMessage(`Stationshal niveau ${hallLevelRef.current}: reizigersvraag groeit sneller.`);
  };
  const buyRetail = () => {
    const cost = retailCost(retailLevelRef.current);
    if (!spendCash(cost)) { setMessage('Onvoldoende geld voor winkeluitbreiding.'); return; }
    retailLevelRef.current += 1; setRetailLevel(retailLevelRef.current); setMessage(`Winkels niveau ${retailLevelRef.current}: meer passieve inkomsten.`);
  };
  const buyTickets = () => {
    const cost = ticketCost(ticketLevelRef.current);
    if (!spendCash(cost)) { setMessage('Onvoldoende geld voor ticket/service-upgrade.'); return; }
    ticketLevelRef.current += 1; setTicketLevel(ticketLevelRef.current); setMessage(`Ticketservice niveau ${ticketLevelRef.current}: hogere opbrengst per vervoerde reiziger.`);
  };
  const buyPlatform3 = () => {
    if (platform3Ref.current) return;
    if (!spendCash(platform3Cost)) { setMessage('Onvoldoende geld om perron 3 te openen.'); return; }
    platform3Ref.current = true; setPlatform3Unlocked(true); setMessage('Perron 3 geopend. Nieuwe diensten kunnen nu over drie perrons worden verdeeld.');
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
      const demandMultiplier = 1 + (hallLevelRef.current - 1) * 0.15;
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

      addCash(retailLevelRef.current * 2);
      setTimeout(tryAutoArrival, 30);
    }, 1000);
    return () => clearInterval(timer);
  }, [phase]);

  const startGame = () => {
    timeRef.current = 0; sequence.current = 1700; serviceCounter.current = 0; nextServiceAt.current = 3;
    arrivalBusyRef.current = false; departureBusyRef.current = false; arrivalLaneRef.current = null; departureLaneRef.current = null;
    cashRef.current = 350; stationLevelRef.current = 1; stationXpRef.current = 0; hallLevelRef.current = 1; retailLevelRef.current = 1; ticketLevelRef.current = 1; platform3Ref.current = false;
    setCash(350); setStationLevel(1); setStationXp(0); setHallLevel(1); setRetailLevel(1); setTicketLevel(1); setPlatform3Unlocked(false);
    const initial = [];
    for (let i = 0; i < 7; i += 1) { initial.push(createService(nextServiceAt.current)); nextServiceAt.current += SERVICE_INTERVAL; }
    syncTimetable(initial); syncPassengers({ noorddam: 70, havenstad: 95, oostpoort: 0, luchthaven: 0 }); syncOutside([]); syncPlatforms({ 1: null, 2: null, 3: null });
    setServiceTime(0); setArrivalTrain(null); setArrivalLane(null); setDepartureTrain(null); setDepartureLane(null); setHandled(0); setOnTime(0); setLate(0); setDepartedPassengers(0);
    setMessage('Station geopend. Treinen komen automatisch binnen; verdien aan reizigers en ontwikkel het station.'); setPhase('playing');
  };

  if (phase === 'menu') {
    return (
      <SafeAreaView style={styles.screen}>
        <StatusBar barStyle="light-content" />
        <View style={styles.menuWrap}>
          <Text style={styles.kicker}>STATION TYCOON / V0.8</Text><Text style={styles.title}>RAIL{`\n`}RUSH HOUR</Text>
          <Text style={styles.subtitle}>Een idle stationgame met echte operatie: bouw inkomsten op, ontgrendel routes en capaciteit, maar blijf zelf de drukke vertrekmomenten en perronconflicten managen.</Text>
          <Pressable style={styles.primaryButton} onPress={startGame}><Text style={styles.primaryButtonText}>OPEN STATION</Text></Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const blockedTrain = outside[0] && platforms[outside[0].plannedLane] ? outside[0] : null;
  const waitingForLane = (lane) => DESTINATIONS.filter((d) => d.unlockLevel <= stationLevel).reduce((sum, d) => {
    const next = timetable.find((s) => s.destination.id === d.id && !['departed', 'departing'].includes(s.status));
    return sum + (serviceLane(next) === lane ? passengers[d.id] || 0 : 0);
  }, 0);
  const xpTarget = levelTarget(stationLevel);
  const hallPrice = hallCost(hallLevel);
  const retailPrice = retailCost(retailLevel);
  const ticketPrice = ticketCost(ticketLevel);

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="light-content" />
      <View style={styles.hud}>
        <View style={styles.hudCell}><Text style={styles.hudLabel}>KAS</Text><Text style={styles.hudMoney}>{formatMoney(cash)}</Text></View>
        <View style={styles.hudCell}><Text style={styles.hudLabel}>STATION</Text><Text style={styles.hudValue}>Lv {stationLevel}</Text></View>
        <View style={styles.hudCell}><Text style={styles.hudLabel}>PAX WEG</Text><Text style={styles.hudValue}>{departedPassengers}</Text></View>
        <View style={styles.hudCell}><Text style={styles.hudLabel}>OP TIJD</Text><Text style={styles.hudValue}>{onTime}/{handled}</Text></View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.levelCard}>
          <View style={styles.levelTop}><Text style={styles.levelTitle}>STATIONNIVEAU {stationLevel}</Text><Text style={styles.levelXp}>{stationXp}/{xpTarget} XP</Text></View>
          <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${pct(stationXp, xpTarget)}%` }]} /></View>
          <Text style={styles.levelHint}>{stationLevel === 1 ? 'Volgend niveau: route Oostpoort' : stationLevel === 2 ? 'Volgend niveau: route Luchthaven' : 'Hoger niveau verhoogt toekomstige groeimogelijkheden'}</Text>
        </View>

        <Timetable timetable={timetable} now={serviceTime} />
        <DemandBoard passengers={passengers} timetable={timetable} stationLevel={stationLevel} />

        {blockedTrain ? (
          <View style={styles.blockedCard}>
            <View style={styles.blockedTop}><View><Text style={styles.blockedLabel}>TREIN WACHT VOOR STATION</Text><Text style={styles.blockedTrain}>{blockedTrain.id} → {blockedTrain.destination.name}</Text></View><Text style={styles.blockedTime}>+{blockedTrain.wait}s</Text></View>
            <Text style={styles.blockedReason}>Gepland P{blockedTrain.plannedLane} is bezet. Laat de trein wachten of wijk uit naar een ander geopend perron.</Text>
            <View style={styles.divertRow}>{LANES.filter((lane) => lane !== blockedTrain.plannedLane && (lane !== 3 || platform3Unlocked)).map((lane) => <Pressable key={lane} disabled={Boolean(platforms[lane])} style={[styles.divertButton, platforms[lane] && styles.disabled]} onPress={() => divertOutside(lane)}><Text style={styles.divertSmall}>{platforms[lane] ? 'BEZET' : 'WIJK UIT'}</Text><Text style={styles.divertBig}>P{lane}</Text></Pressable>)}</View>
          </View>
        ) : null}

        <StationView boardSize={boardSize} onLayout={({ width, height }) => setBoardSize({ width, height })} platforms={platforms} arrivalTrain={arrivalTrain} arrivalLane={arrivalLane} arrivalProgress={arrivalProgress} departureTrain={departureTrain} departureLane={departureLane} departureProgress={departureProgress} onTrainPress={depart} now={serviceTime} platform3Unlocked={platform3Unlocked} />
        <View style={styles.messageStrip}><View style={styles.messageLamp} /><Text style={styles.messageText}>{message}</Text></View>

        <Text style={styles.sectionHeading}>LIVE PERRONS</Text>
        {LANES.map((lane) => <PlatformCard key={lane} lane={lane} train={platforms[lane]} waiting={waitingForLane(lane)} onTrainPress={depart} now={serviceTime} locked={lane === 3 && !platform3Unlocked} />)}

        <Text style={styles.sectionHeading}>ONTWIKKEL STATION</Text>
        <View style={styles.upgradeGrid}>
          <UpgradeCard title="STATIONSHAL" value={`Lv ${hallLevel}`} description={`+${15 * (hallLevel - 1)}% huidige reizigersgroei; volgende upgrade +15%`} cost={hallPrice} affordable={cash >= hallPrice} onPress={buyHall} />
          <UpgradeCard title="WINKELS" value={`Lv ${retailLevel}`} description={`${formatMoney(retailLevel * 2)}/sec passief inkomen`} cost={retailPrice} affordable={cash >= retailPrice} onPress={buyRetail} />
          <UpgradeCard title="TICKETS & SERVICE" value={`Lv ${ticketLevel}`} description={`+${15 * (ticketLevel - 1)}% huidige ritopbrengst; volgende upgrade +15%`} cost={ticketPrice} affordable={cash >= ticketPrice} onPress={buyTickets} />
          <UpgradeCard title="PERRON 3" value={platform3Unlocked ? 'OPEN' : 'GESLOTEN'} description="Derde perron geeft echte extra capaciteit en wordt meegenomen in nieuwe dienstregelingen." cost={platform3Cost} affordable={cash >= platform3Cost} onPress={buyPlatform3} done={platform3Unlocked} />
        </View>

        <View style={styles.resultCard}><Text style={styles.resultTitle}>OPERATIE</Text><Text style={styles.resultText}>{handled} treinen afgehandeld • {onTime} binnen marge • {late} te laat • winkels {formatMoney(retailLevel * 2)}/sec</Text></View>
      </ScrollView>
      <View style={styles.footer}><Text style={styles.footerText}>V0.8 • IDLE ECONOMIE + LIVE STATIONOPERATIE</Text></View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#070d12' }, scroll: { flex: 1 }, content: { paddingHorizontal: 11, paddingBottom: 30 },
  menuWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 }, kicker: { color: '#78a8c6', fontSize: 10, fontWeight: '900', letterSpacing: 2.2, marginBottom: 12 },
  title: { color: '#edf4f7', fontSize: 48, lineHeight: 45, fontWeight: '900', letterSpacing: -2, textAlign: 'center' }, subtitle: { color: '#94a4ae', fontSize: 15, lineHeight: 22, textAlign: 'center', marginTop: 20, marginBottom: 28, maxWidth: 380 },
  primaryButton: { backgroundColor: '#ffd65a', minWidth: 230, paddingVertical: 16, alignItems: 'center', borderRadius: 9, borderWidth: 2, borderColor: '#ffe795' }, primaryButtonText: { color: '#101820', fontWeight: '900', fontSize: 15, letterSpacing: 1.2 },

  hud: { flexDirection: 'row', paddingHorizontal: 12, paddingTop: 10, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#16232c' }, hudCell: { flex: 1, alignItems: 'center' },
  hudLabel: { color: '#5f717d', fontSize: 7, fontWeight: '900', letterSpacing: 0.8 }, hudValue: { color: '#e3edf1', fontSize: 14, fontWeight: '900', marginTop: 2 }, hudMoney: { color: '#67e89a', fontSize: 14, fontWeight: '900', marginTop: 2 },

  levelCard: { marginTop: 9, backgroundColor: '#10191f', borderWidth: 1, borderColor: '#325267', borderRadius: 10, padding: 10 }, levelTop: { flexDirection: 'row', justifyContent: 'space-between' }, levelTitle: { color: '#d9e8ef', fontSize: 10, fontWeight: '900' }, levelXp: { color: '#87b6cf', fontSize: 8, fontWeight: '900' },
  progressTrack: { height: 8, marginTop: 7, backgroundColor: '#1b2a33', borderRadius: 4, overflow: 'hidden' }, progressFill: { height: '100%', backgroundColor: '#58b9ff' }, levelHint: { color: '#70858f', fontSize: 7.4, fontWeight: '700', marginTop: 5 },

  card: { marginTop: 8, backgroundColor: '#0d161d', borderWidth: 1, borderColor: '#2b3b45', borderRadius: 10, padding: 10 }, cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, cardLabel: { color: '#718591', fontSize: 7.2, fontWeight: '900', letterSpacing: 1.1 }, cardSub: { color: '#78909e', fontSize: 8, fontWeight: '900' }, clock: { color: '#ffd65a', fontSize: 14, fontWeight: '900' },
  serviceRow: { minHeight: 38, flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#182630' }, serviceTime: { width: 42, color: '#70d29a', fontSize: 9, fontWeight: '900' }, serviceMain: { flex: 1 }, serviceId: { color: '#e2ebef', fontSize: 10, fontWeight: '900' }, serviceDest: { color: '#7c919c', fontSize: 7.2, fontWeight: '800' }, serviceLane: { width: 26, color: '#58b9ff', fontSize: 9, fontWeight: '900', textAlign: 'center' }, serviceStatus: { width: 72, color: '#c5d1d7', fontSize: 6.8, fontWeight: '900', textAlign: 'right' },

  demandRow: { minHeight: 42, flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#182630' }, lockedRow: { opacity: 0.42 }, demandNameWrap: { flex: 1 }, demandName: { color: '#e4edf1', fontSize: 11, fontWeight: '900' }, demandSub: { color: '#687d88', fontSize: 7.1, marginTop: 2 }, demandCount: { color: '#f0f5f7', fontSize: 18, fontWeight: '900' },

  blockedCard: { marginTop: 8, backgroundColor: '#271a0d', borderWidth: 1.5, borderColor: '#d1953d', borderRadius: 10, padding: 10 }, blockedTop: { flexDirection: 'row', justifyContent: 'space-between' }, blockedLabel: { color: '#b79056', fontSize: 7, fontWeight: '900' }, blockedTrain: { color: '#ffe6b1', fontSize: 15, fontWeight: '900', marginTop: 2 }, blockedTime: { color: '#ffbc55', fontSize: 17, fontWeight: '900' }, blockedReason: { color: '#ba9d70', fontSize: 8.5, lineHeight: 12, marginTop: 7 }, divertRow: { flexDirection: 'row', gap: 7, marginTop: 8 }, divertButton: { flex: 1, minHeight: 46, borderRadius: 7, borderWidth: 1, borderColor: '#d1953d', backgroundColor: '#33230f', alignItems: 'center', justifyContent: 'center' }, divertSmall: { color: '#c3a36b', fontSize: 6.5, fontWeight: '900' }, divertBig: { color: '#ffda91', fontSize: 17, fontWeight: '900' }, disabled: { opacity: 0.3 },

  stationFrame: { marginTop: 8, backgroundColor: '#0a1218', borderWidth: 1, borderColor: '#263741', borderRadius: 11, overflow: 'hidden' }, stationHeader: { minHeight: 35, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: '#263741' }, stationHeaderTitle: { color: '#9eb0bb', fontSize: 8, fontWeight: '900', letterSpacing: 0.8 }, stationHeaderHint: { color: '#55d889', fontSize: 6.8, fontWeight: '900' }, svgArea: { height: 220, position: 'relative', overflow: 'hidden' },
  consistWrap: { alignItems: 'center', justifyContent: 'center' }, consistTouchable: { paddingHorizontal: 3, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: '#56636b', backgroundColor: 'rgba(7,13,18,0.78)' }, consistReady: { borderColor: '#43df82', backgroundColor: 'rgba(20,65,42,0.85)' }, consistLate: { borderColor: '#ff6677', backgroundColor: 'rgba(72,25,31,0.88)' }, consistUnits: { flexDirection: 'row', alignItems: 'center', height: 19 }, consistUnit: { height: 17, backgroundColor: '#d9edf8', borderWidth: 1.5, borderColor: '#081016', borderRadius: 3, overflow: 'hidden', justifyContent: 'center' }, cabBand: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: '#6ba5c3' }, windowsRow: { position: 'absolute', left: 7, right: 3, top: 3, flexDirection: 'row', justifyContent: 'space-around' }, windowDot: { width: 4, height: 3, borderRadius: 1, backgroundColor: '#31566c' }, consistCode: { color: '#173443', fontSize: 5.5, fontWeight: '900', textAlign: 'center', marginTop: 5 }, coupler: { width: 5, height: 3, backgroundColor: '#6f7c84' }, consistId: { color: '#d8e8ef', fontSize: 6.3, fontWeight: '900', backgroundColor: '#101920', paddingHorizontal: 3, borderRadius: 2 }, consistDetail: { color: '#9fc1d2', fontSize: 5.4, fontWeight: '900', backgroundColor: '#101920', paddingHorizontal: 2, borderRadius: 2 }, movingConsist: { position: 'absolute', left: 0, top: 0 },

  messageStrip: { minHeight: 40, flexDirection: 'row', alignItems: 'center', marginTop: 8, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: '#0a1218', borderWidth: 1, borderColor: '#20303a', borderRadius: 8 }, messageLamp: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#58b9ff', marginRight: 8 }, messageText: { flex: 1, color: '#a3b1ba', fontSize: 9, lineHeight: 12, fontWeight: '700' },
  sectionHeading: { color: '#78909c', fontSize: 7.5, fontWeight: '900', letterSpacing: 1.2, textAlign: 'center', marginTop: 14, marginBottom: 7 },

  platformCard: { marginBottom: 8, backgroundColor: '#0d161d', borderWidth: 1, borderColor: '#263842', borderRadius: 10, padding: 10 }, platformReady: { borderColor: '#3bd27a' }, platformLocked: { opacity: 0.48, minHeight: 67 }, platformTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }, platformTitle: { color: '#7d919c', fontSize: 7, fontWeight: '900', letterSpacing: 1 }, platformLockedText: { color: '#82919a', fontSize: 9, fontWeight: '800', marginTop: 10 }, freeBadge: { color: '#54e78d', fontSize: 8, fontWeight: '900', backgroundColor: '#10251a', paddingHorizontal: 7, paddingVertical: 4, borderRadius: 5 }, emptyPlatform: { color: '#768892', fontSize: 9, fontWeight: '700', marginTop: 11 }, trainTitle: { color: '#e4edf1', fontSize: 14, fontWeight: '900', marginTop: 2 }, trainState: { color: '#ffd65a', fontSize: 8, fontWeight: '900', backgroundColor: '#27210e', paddingHorizontal: 7, paddingVertical: 4, borderRadius: 5 }, stateGreen: { color: '#54e78d', backgroundColor: '#10251a' }, stateRed: { color: '#ff7887', backgroundColor: '#30161b' }, platformTrainTap: { marginTop: 7, paddingVertical: 7, backgroundColor: '#091117', borderRadius: 7 }, largeConsist: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 }, largeSet: { flex: 1, maxWidth: 100, minWidth: 45, height: 17, backgroundColor: '#40677d', borderRadius: 3, alignItems: 'center', justifyContent: 'center' }, largeSetReady: { backgroundColor: '#288756' }, largeSetText: { color: '#e0f0f7', fontSize: 7, fontWeight: '900' }, largeCoupler: { width: 6, height: 3, backgroundColor: '#71808a' }, platformStats: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 7 }, statText: { color: '#8799a2', fontSize: 7.3, fontWeight: '800' }, tapHint: { color: '#81919a', fontSize: 7.3, textAlign: 'center', marginTop: 8, fontWeight: '900' }, tapHintReady: { color: '#58e691' },

  upgradeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, upgradeCard: { width: '48.7%', minHeight: 118, backgroundColor: '#0d161d', borderWidth: 1, borderColor: '#2b3b45', borderRadius: 9, padding: 9 }, upgradeAffordable: { borderColor: '#d4a947', backgroundColor: '#18170f' }, upgradeDone: { borderColor: '#3c9f68', backgroundColor: '#0d1b14' }, upgradeTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 5 }, upgradeTitle: { flex: 1, color: '#dfe9ed', fontSize: 8, fontWeight: '900' }, upgradeValue: { color: '#75c9f5', fontSize: 8, fontWeight: '900' }, upgradeDescription: { color: '#71838d', fontSize: 7, lineHeight: 10, marginTop: 8, flex: 1 }, upgradeCost: { color: '#ffd65a', fontSize: 11, fontWeight: '900', marginTop: 7 },

  resultCard: { marginTop: 12, backgroundColor: '#0b141a', borderWidth: 1, borderColor: '#22333d', borderRadius: 8, padding: 10 }, resultTitle: { color: '#667b87', fontSize: 6.5, fontWeight: '900', letterSpacing: 1 }, resultText: { color: '#9aaab3', fontSize: 8.5, fontWeight: '800', marginTop: 4 },
  footer: { alignItems: 'center', paddingVertical: 7, paddingHorizontal: 8, borderTopWidth: 1, borderTopColor: '#14212a' }, footerText: { color: '#42535e', fontSize: 6.2, fontWeight: '900', textAlign: 'center' },
});