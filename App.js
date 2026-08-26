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
const SPAWN_MS = 7800;
const ARRIVAL_MS = 4300;
const DEPARTURE_MS = 3700;
const MOTION_RANGE = [0, 0.16, 0.32, 0.5, 0.68, 0.84, 1];
const BOARD_W = 460;
const BOARD_H = 280;
const PLATFORM_START = 264;
const PLATFORM_END = 430;
const TRAIN_STOP_X = 350;

const TRAIN_TYPES = [
  { code: 'SPR', name: 'Sprinter S', setLength: 55, setCapacity: 220, minSets: 1, maxSets: 3, dwell: 9, boardRate: 34 },
  { code: 'IC', name: 'Intercity X', setLength: 82, setCapacity: 330, minSets: 1, maxSets: 3, dwell: 11, boardRate: 46 },
  { code: 'EXP', name: 'Express E', setLength: 105, setCapacity: 430, minSets: 1, maxSets: 2, dwell: 13, boardRate: 54 },
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

const unitWidth = (train) => {
  if (train.type.code === 'EXP') return 38;
  if (train.type.code === 'IC') return 34;
  return 28;
};

const consistWidth = (train) => train.sets * unitWidth(train) + Math.max(0, train.sets - 1) * 5;

function movementPosition(progress, points, scaleX, scaleY, train) {
  const width = consistWidth(train);
  return {
    x: progress.interpolate({ inputRange: MOTION_RANGE, outputRange: points.map(([x]) => x * scaleX - width / 2) }),
    y: progress.interpolate({ inputRange: MOTION_RANGE, outputRange: points.map(([, y]) => y * scaleY - 15) }),
  };
}

function RouteHighlight({ route, color }) {
  if (!route) return null;
  return route.segments.map((id) => (
    <Path key={`${color}-${id}`} d={SEGMENTS[id]} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
  ));
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

function TrainConsist({ train, detail, style, compact = false }) {
  const width = unitWidth(train);
  return (
    <View pointerEvents="none" style={[styles.consistWrap, style]}>
      <View style={styles.consistUnits}>
        {Array.from({ length: train.sets }).map((_, index) => (
          <React.Fragment key={`${train.id}-unit-${index}`}>
            {index > 0 ? <View style={styles.coupler} /> : null}
            <View style={[styles.consistUnit, { width }, compact && styles.consistUnitCompact]}>
              <View style={styles.cabBand} />
              <View style={styles.windowsRow}>
                <View style={styles.windowDot} />
                <View style={styles.windowDot} />
                {width >= 34 ? <View style={styles.windowDot} /> : null}
              </View>
              <Text style={styles.consistCode}>{train.type.code}</Text>
            </View>
          </React.Fragment>
        ))}
      </View>
      <Text numberOfLines={1} style={styles.consistId}>{train.id}</Text>
      <Text numberOfLines={1} style={styles.consistDetail}>{detail || `${train.sets} stellen • ${train.length} m`}</Text>
    </View>
  );
}

function DispatcherTableau({ boardSize, onLayout, platforms, arrivalTrain, arrivalLane, arrivalProgress, departureTrain, departureLane, departureProgress }) {
  const scaleX = boardSize.width / BOARD_W || 1;
  const scaleY = boardSize.height / BOARD_H || 1;
  const arrivalPos = arrivalTrain ? movementPosition(arrivalProgress, ARRIVAL_POINTS[arrivalLane || 1], scaleX, scaleY, arrivalTrain) : null;
  const departurePos = departureTrain ? movementPosition(departureProgress, DEPARTURE_POINTS[departureLane || 1], scaleX, scaleY, departureTrain) : null;

  return (
    <View style={styles.tableauFrame}>
      <View style={styles.tableauHeader}>
        <Text style={styles.tableauTitle}>SPOORLAAG — WISSELSTRAAT + VOLLEDIGE PERRONS</Text>
        <Text style={styles.tableauStatus}>{arrivalTrain && departureTrain ? '2 RIJWEGEN' : arrivalTrain || departureTrain ? 'RIJWEG ACTIEF' : 'VRIJ'}</Text>
      </View>
      <View style={styles.svgArea} onLayout={(e) => onLayout(e.nativeEvent.layout)}>
        <Svg width="100%" height="100%" viewBox={`0 0 ${BOARD_W} ${BOARD_H}`}>
          <Rect x="1" y="1" width={BOARD_W - 2} height={BOARD_H - 2} rx="10" fill="#081016" stroke="#26343f" strokeWidth="2" />

          {LANES.map((lane) => (
            <React.Fragment key={`platform-${lane}`}>
              <Rect x={PLATFORM_START} y={TRACK_Y[lane] + 10} width={PLATFORM_END - PLATFORM_START} height="12" rx="3" fill="#18242c" stroke="#3c4c56" strokeWidth="1" />
              <Path d={`M ${PLATFORM_START + 4} ${TRACK_Y[lane] + 13} H ${PLATFORM_END - 4}`} stroke="#6e7d86" strokeWidth="1" strokeDasharray="4 4" />
              <SvgText x={PLATFORM_END - 2} y={TRACK_Y[lane] + 35} fill="#657681" fontSize="7.5" fontWeight="900" textAnchor="end">P{lane} • 240 m</SvgText>
            </React.Fragment>
          ))}

          {Object.entries(SEGMENTS).map(([id, d]) => <Path key={id} d={d} fill="none" stroke="#45525c" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />)}
          {LANES.map((lane) => platforms[lane] ? (
            <Path key={`occ-${lane}`} d={`M ${PLATFORM_START + 4} ${TRACK_Y[lane]} H ${PLATFORM_END}`} fill="none" stroke="#ff4d6d" strokeWidth="8" strokeLinecap="round" />
          ) : null)}
          <RouteHighlight route={arrivalTrain ? ARRIVAL_ROUTES[arrivalLane] : null} color="#ffd65a" />
          <RouteHighlight route={departureTrain ? DEPARTURE_ROUTES[departureLane] : null} color="#66d8ff" />

          <Rect x="132" y="103" width="46" height="74" rx="5" fill="none" stroke="#657783" strokeWidth="1" strokeDasharray="3 3" />
          <SvgText x="139" y="99" fill="#9aa8b1" fontSize="8" fontWeight="900">EW1</SvgText>
          <Circle cx="215" cy="140" r="7" fill="#0b151d" stroke="#657783" strokeWidth="1.5" />
          <SvgText x="206" y="132" fill="#9aa8b1" fontSize="8" fontWeight="900">K1</SvgText>
          <Signal x={52} y={70} green={Boolean(arrivalTrain)} label="S1" />
          <Signal x={52} y={210} green={Boolean(departureTrain)} label="S2" />
          {LANES.map((lane) => <Signal key={lane} x={286} y={TRACK_Y[lane] - 23} green={Boolean(departureTrain) && departureLane === lane} label={`D${lane}`} />)}
          {LANES.map((lane) => (
            <React.Fragment key={`p-${lane}`}>
              <Rect x="435" y={TRACK_Y[lane] - 13} width="20" height="26" rx="4" fill="#101b23" stroke="#364650" />
              <SvgText x="445" y={TRACK_Y[lane] + 5} fill="#e8eef2" fontSize="11" fontWeight="900" textAnchor="middle">{lane}</SvgText>
            </React.Fragment>
          ))}
          <SvgText x="13" y="84" fill="#6f808b" fontSize="8" fontWeight="800">WEST IN →</SvgText>
          <SvgText x="13" y="204" fill="#6f808b" fontSize="8" fontWeight="800">← WEST UIT</SvgText>
        </Svg>

        {boardSize.width > 0 && LANES.map((lane) => {
          const train = platforms[lane];
          if (!train || (departureTrain && departureTrain.id === train.id)) return null;
          const width = consistWidth(train);
          return (
            <TrainConsist
              key={train.id}
              train={train}
              compact
              detail={`${pct(train.onboard, train.capacity)}% • ${train.sets}×`}
              style={{ position: 'absolute', left: TRAIN_STOP_X * scaleX - width / 2, top: TRACK_Y[lane] * scaleY - 15 }}
            />
          );
        })}

        {boardSize.width > 0 && arrivalTrain && arrivalPos ? (
          <Animated.View pointerEvents="none" style={[styles.movingConsist, { transform: [{ translateX: arrivalPos.x }, { translateY: arrivalPos.y }] }]}>
            <TrainConsist train={arrivalTrain} compact detail={`→ P${arrivalLane} • ${arrivalTrain.sets}×`} />
          </Animated.View>
        ) : null}

        {boardSize.width > 0 && departureTrain && departurePos ? (
          <Animated.View pointerEvents="none" style={[styles.movingConsist, { transform: [{ translateX: departurePos.x }, { translateY: departurePos.y }] }]}>
            <TrainConsist train={departureTrain} compact detail={`← WEST • ${departureTrain.sets}×`} />
          </Animated.View>
        ) : null}
      </View>
    </View>
  );
}

function Bar({ value, max, warningAt = 85 }) {
  const valuePct = pct(value, max);
  return (
    <View style={styles.barTrack}>
      <View style={[styles.barFill, valuePct >= warningAt && styles.barFillWarning, { width: `${valuePct}%` }]} />
    </View>
  );
}

function TrainComposition({ train }) {
  return (
    <View style={styles.compositionRow}>
      {Array.from({ length: train.sets }).map((_, index) => (
        <React.Fragment key={index}>
          {index > 0 ? <View style={styles.compositionCoupler} /> : null}
          <View style={[styles.setBlock, { flexBasis: `${Math.min(32, 100 / train.sets)}%` }]}>
            <Text style={styles.setBlockText}>{train.type.code} {index + 1}</Text>
          </View>
        </React.Fragment>
      ))}
    </View>
  );
}

function PlatformCard({ lane, train, waiting, onDepart, departureBlocked }) {
  const crowdCapacity = 360;
  if (!train) {
    return (
      <View style={styles.platformCard}>
        <View style={styles.platformTop}><Text style={styles.platformTitle}>PERRON {lane}</Text><Text style={styles.freeBadge}>VRIJ</Text></View>
        <View style={styles.platformSchematic}><View style={styles.platformEdge} /><Text style={styles.platformLengthLabel}>240 m perronlengte</Text></View>
        <Text style={styles.waitingBig}>{waiting}</Text><Text style={styles.waitingLabel}>wachtende reizigers</Text>
        <Bar value={waiting} max={crowdCapacity} />
        <Text style={styles.platformHint}>Volgend materieel kan hier worden binnengehaald.</Text>
      </View>
    );
  }

  const fill = pct(train.onboard, train.capacity);
  const freeSeats = Math.max(0, train.capacity - train.onboard);
  const crowd = pct(waiting, crowdCapacity);
  const canDepart = train.status === 'ready' && !departureBlocked;

  return (
    <View style={[styles.platformCard, crowd >= 85 && styles.platformCardCrowded]}>
      <View style={styles.platformTop}>
        <View><Text style={styles.platformTitle}>PERRON {lane}</Text><Text style={styles.trainName}>{train.id} • {train.type.name}</Text></View>
        <Text style={[styles.statusBadge, train.status === 'ready' && styles.readyBadge]}>{train.status === 'ready' ? 'GEREED' : `${train.remaining}s`}</Text>
      </View>

      <View style={styles.platformSchematic}>
        <View style={styles.platformEdge} />
        <TrainComposition train={train} />
        <Text style={styles.platformLengthLabel}>{train.length} m trein op 240 m perron</Text>
      </View>

      <View style={styles.trainMetaRow}>
        <View style={styles.metaCell}><Text style={styles.metaLabel}>STELLEN</Text><Text style={styles.metaValue}>{train.sets}×</Text></View>
        <View style={styles.metaCell}><Text style={styles.metaLabel}>LENGTE</Text><Text style={styles.metaValue}>{train.length} m</Text></View>
        <View style={styles.metaCell}><Text style={styles.metaLabel}>CAPACITEIT</Text><Text style={styles.metaValue}>{train.capacity}</Text></View>
      </View>

      <View style={styles.metricHeader}><Text style={styles.metricLabel}>TREINBEZETTING</Text><Text style={styles.metricValue}>{train.onboard} / {train.capacity} • {fill}%</Text></View>
      <Bar value={train.onboard} max={train.capacity} warningAt={94} />
      <Text style={styles.miniInfo}>{freeSeats} plaatsen vrij</Text>

      <View style={styles.metricHeader}><Text style={styles.metricLabel}>WACHTEND OP PERRON</Text><Text style={[styles.metricValue, crowd >= 85 && styles.dangerText]}>{waiting} • {crowd}% drukte</Text></View>
      <Bar value={waiting} max={crowdCapacity} warningAt={85} />

      <Pressable disabled={!canDepart} style={[styles.departButton, !canDepart && styles.buttonDisabled]} onPress={() => onDepart(lane)}>
        <Text style={styles.departButtonText}>{departureBlocked ? 'RIJWEGCONFLICT' : train.status !== 'ready' ? 'INSTAPPEN / HALTEREN' : `VERTREK ${train.id}`}</Text>
      </Pressable>
      {train.status === 'ready' && waiting > 0 ? <Text style={styles.holdHint}>Je kunt wachten op meer instappers, maar het vertrek loopt dan vertraging op.</Text> : null}
    </View>
  );
}

export default function App() {
  const [phase, setPhase] = useState('menu');
  const [queue, setQueue] = useState([]);
  const [platforms, setPlatforms] = useState({ 1: null, 2: null, 3: null });
  const [waiting, setWaiting] = useState({ 1: 75, 2: 125, 3: 55 });
  const [arrivalTrain, setArrivalTrain] = useState(null);
  const [arrivalLane, setArrivalLane] = useState(null);
  const [departureTrain, setDepartureTrain] = useState(null);
  const [departureLane, setDepartureLane] = useState(null);
  const [boardSize, setBoardSize] = useState({ width: 0, height: 0 });
  const [message, setMessage] = useState('');
  const [boardedTotal, setBoardedTotal] = useState(0);
  const [handled, setHandled] = useState(0);
  const [delay, setDelay] = useState(0);

  const arrivalProgress = useRef(new Animated.Value(0)).current;
  const departureProgress = useRef(new Animated.Value(0)).current;
  const queueRef = useRef([]);
  const platformsRef = useRef({ 1: null, 2: null, 3: null });
  const waitingRef = useRef({ 1: 75, 2: 125, 3: 55 });
  const arrivalBusyRef = useRef(false);
  const departureBusyRef = useRef(false);
  const arrivalLaneRef = useRef(null);
  const departureLaneRef = useRef(null);
  const sequence = useRef(1700);

  const syncQueue = (next) => { queueRef.current = next; setQueue(next); };
  const syncPlatforms = (next) => { platformsRef.current = next; setPlatforms(next); };
  const syncWaiting = (next) => { waitingRef.current = next; setWaiting(next); };

  const createTrain = () => {
    sequence.current += Math.random() > 0.5 ? 2 : 4;
    const type = TRAIN_TYPES[Math.floor(Math.random() * TRAIN_TYPES.length)];
    const sets = type.minSets + Math.floor(Math.random() * (type.maxSets - type.minSets + 1));
    const capacity = type.setCapacity * sets;
    const onboard = Math.round(capacity * (0.35 + Math.random() * 0.48));
    return {
      id: `${type.code} ${sequence.current}`,
      type,
      sets,
      length: type.setLength * sets,
      capacity,
      onboard,
      target: 1 + Math.floor(Math.random() * 3),
      wait: 0,
    };
  };

  useEffect(() => {
    if (phase !== 'playing') return undefined;
    const clock = setInterval(() => {
      const nextWaiting = { ...waitingRef.current };
      LANES.forEach((lane) => { nextWaiting[lane] += 5 + Math.floor(Math.random() * (lane === 2 ? 14 : 10)); });

      const nextPlatforms = { ...platformsRef.current };
      let boardedThisTick = 0;
      let addedDelay = 0;
      LANES.forEach((lane) => {
        const currentTrain = nextPlatforms[lane];
        if (!currentTrain || currentTrain.status === 'departing') return;
        const train = { ...currentTrain };

        const free = Math.max(0, train.capacity - train.onboard);
        const board = Math.min(free, nextWaiting[lane], train.type.boardRate);
        if (board > 0) {
          nextWaiting[lane] -= board;
          train.onboard += board;
          boardedThisTick += board;
        }

        if (train.status === 'dwelling') {
          train.remaining = Math.max(0, train.remaining - 1);
          if (train.remaining === 0) train.status = 'ready';
        } else if (train.status === 'ready') {
          train.readyWait = (train.readyWait || 0) + 1;
          addedDelay += 1;
        }
        nextPlatforms[lane] = train;
      });

      const nextQueue = queueRef.current.map((train) => ({ ...train, wait: train.wait + 1 }));
      addedDelay += nextQueue.filter((train) => train.wait > 8).length;
      syncQueue(nextQueue);
      syncWaiting(nextWaiting);
      syncPlatforms(nextPlatforms);
      if (boardedThisTick) setBoardedTotal((v) => v + boardedThisTick);
      if (addedDelay) setDelay((v) => v + addedDelay);
    }, 1000);

    const spawner = setInterval(() => syncQueue([...queueRef.current, createTrain()]), SPAWN_MS);
    return () => { clearInterval(clock); clearInterval(spawner); };
  }, [phase]);

  const arrivalConflict = (lane) => departureBusyRef.current && routesConflict(ARRIVAL_ROUTES[lane], DEPARTURE_ROUTES[departureLaneRef.current]);
  const departureConflict = (lane) => arrivalBusyRef.current && routesConflict(DEPARTURE_ROUTES[lane], ARRIVAL_ROUTES[arrivalLaneRef.current]);

  const routeArrival = (lane) => {
    const train = queueRef.current[0];
    if (!train || arrivalBusyRef.current || platformsRef.current[lane]) return;
    if (arrivalConflict(lane)) { setMessage(`Rijweg naar P${lane} conflicteert met de actieve uitrijweg.`); return; }

    arrivalBusyRef.current = true;
    arrivalLaneRef.current = lane;
    syncQueue(queueRef.current.slice(1));
    setArrivalTrain(train);
    setArrivalLane(lane);
    arrivalProgress.setValue(0);
    setMessage(`${train.id} (${train.sets} stellen / ${train.length} m) binnen naar P${lane}${lane !== train.target ? ` — spoorwijziging vanaf P${train.target}` : ''}.`);

    Animated.timing(arrivalProgress, { toValue: 1, duration: ARRIVAL_MS, useNativeDriver: true }).start(({ finished }) => {
      arrivalBusyRef.current = false;
      arrivalLaneRef.current = null;
      if (!finished) return;
      const next = { ...platformsRef.current, [lane]: { ...train, lane, status: 'dwelling', remaining: train.type.dwell, readyWait: 0 } };
      syncPlatforms(next);
      setArrivalTrain(null);
      setArrivalLane(null);
      setMessage(`${train.id} volledig langs P${lane}: deuren open, reizigers wisselen.`);
    });
  };

  const depart = (lane) => {
    const train = platformsRef.current[lane];
    if (!train || train.status !== 'ready' || departureBusyRef.current) return;
    if (departureConflict(lane)) { setMessage(`Uitrijweg P${lane} → WEST conflicteert met de actieve aankomstrijweg.`); return; }

    departureBusyRef.current = true;
    departureLaneRef.current = lane;
    syncPlatforms({ ...platformsRef.current, [lane]: { ...train, status: 'departing' } });
    setDepartureTrain(train);
    setDepartureLane(lane);
    departureProgress.setValue(0);
    setMessage(`${train.id} vertrekt als ${train.sets}-delige samenstelling van P${lane} met ${train.onboard}/${train.capacity} reizigers.`);

    Animated.timing(departureProgress, { toValue: 1, duration: DEPARTURE_MS, useNativeDriver: true }).start(({ finished }) => {
      departureBusyRef.current = false;
      departureLaneRef.current = null;
      if (!finished) return;
      syncPlatforms({ ...platformsRef.current, [lane]: null });
      setDepartureTrain(null);
      setDepartureLane(null);
      setHandled((v) => v + 1);
      setMessage(`${train.id} afgehandeld. P${lane} is over de volledige lengte vrij.`);
    });
  };

  const startGame = () => {
    sequence.current = 1700;
    arrivalBusyRef.current = false;
    departureBusyRef.current = false;
    arrivalLaneRef.current = null;
    departureLaneRef.current = null;
    const firstQueue = [createTrain(), createTrain()];
    const firstWaiting = { 1: 75, 2: 125, 3: 55 };
    syncQueue(firstQueue);
    syncPlatforms({ 1: null, 2: null, 3: null });
    syncWaiting(firstWaiting);
    setArrivalTrain(null); setArrivalLane(null); setDepartureTrain(null); setDepartureLane(null);
    setBoardedTotal(0); setHandled(0); setDelay(0);
    setMessage('Station geopend. Kies een vrij perron voor de eerste trein.');
    setPhase('playing');
  };

  if (phase === 'menu') {
    return (
      <SafeAreaView style={styles.screen}>
        <StatusBar barStyle="light-content" />
        <View style={styles.menuWrap}>
          <Text style={styles.kicker}>STATION OPERATIONS / V0.6.1</Text>
          <Text style={styles.title}>RAIL{`\n`}RUSH HOUR</Text>
          <Text style={styles.subtitle}>Beheer materieelcapaciteit, volledige perrons en reizigersstromen. Iedere rijdende trein toont nu zijn echte samenstelling in stellen.</Text>
          <Pressable style={styles.primaryButton} onPress={startGame}><Text style={styles.primaryButtonText}>OPEN STATION</Text></Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const totalWaiting = waiting[1] + waiting[2] + waiting[3];
  const queueHead = queue[0];

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="light-content" />
      <View style={styles.hud}>
        <View style={styles.hudCell}><Text style={styles.hudLabel}>VERVOERD</Text><Text style={styles.hudValue}>{boardedTotal}</Text></View>
        <View style={[styles.hudCell, styles.hudCenter]}><Text style={styles.hudLabel}>WACHTEND</Text><Text style={styles.hudValue}>{totalWaiting}</Text></View>
        <View style={[styles.hudCell, styles.hudCenter]}><Text style={styles.hudLabel}>TREINEN</Text><Text style={styles.hudValue}>{handled}</Text></View>
        <View style={[styles.hudCell, styles.hudRight]}><Text style={styles.hudLabel}>VERTRAGING</Text><Text style={styles.hudValue}>{delay}s</Text></View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <DispatcherTableau
          boardSize={boardSize}
          onLayout={({ width, height }) => setBoardSize({ width, height })}
          platforms={platforms}
          arrivalTrain={arrivalTrain}
          arrivalLane={arrivalLane}
          arrivalProgress={arrivalProgress}
          departureTrain={departureTrain}
          departureLane={departureLane}
          departureProgress={departureProgress}
        />

        <View style={styles.messageStrip}><View style={styles.messageLamp} /><Text style={styles.messageText}>{message}</Text></View>

        <View style={styles.incomingCard}>
          <View style={styles.cardTitleRow}><Text style={styles.sectionLabel}>AANKOMEND MATERIEEL</Text><Text style={styles.queueCount}>{queue.length} wacht</Text></View>
          {queueHead ? (
            <>
              <View style={styles.incomingMain}><View><Text style={styles.incomingId}>{queueHead.id}</Text><Text style={styles.incomingType}>{queueHead.type.name} • gepland P{queueHead.target}</Text></View><Text style={styles.incomingWait}>{queueHead.wait}s</Text></View>
              <View style={styles.trainMetaRow}>
                <View style={styles.metaCell}><Text style={styles.metaLabel}>STELLEN</Text><Text style={styles.metaValue}>{queueHead.sets}×</Text></View>
                <View style={styles.metaCell}><Text style={styles.metaLabel}>LENGTE</Text><Text style={styles.metaValue}>{queueHead.length} m</Text></View>
                <View style={styles.metaCell}><Text style={styles.metaLabel}>VULLING</Text><Text style={styles.metaValue}>{pct(queueHead.onboard, queueHead.capacity)}%</Text></View>
              </View>
              <TrainComposition train={queueHead} />
              <View style={styles.routeRow}>
                {LANES.map((lane) => {
                  const occupied = Boolean(platforms[lane]);
                  const conflict = arrivalConflict(lane);
                  const disabled = occupied || Boolean(arrivalTrain);
                  return (
                    <Pressable key={lane} disabled={disabled} style={[styles.routeButton, queueHead.target === lane && styles.routeButtonPlanned, conflict && styles.routeButtonConflict, disabled && styles.buttonDisabled]} onPress={() => routeArrival(lane)}>
                      <Text style={styles.routeSmall}>{occupied ? 'BEZET' : conflict ? 'CONFLICT' : queueHead.target === lane ? 'GEPLAND' : 'ALTERNATIEF'}</Text>
                      <Text style={styles.routeBig}>P{lane}</Text>
                      <Text style={styles.routeCrowd}>{waiting[lane]} wachtend</Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          ) : <Text style={styles.emptyText}>Geen trein op WEST IN.</Text>}
        </View>

        <Text style={styles.stationHeading}>PERRONS & REIZIGERSSTROMEN</Text>
        {LANES.map((lane) => (
          <PlatformCard key={lane} lane={lane} train={platforms[lane]} waiting={waiting[lane]} onDepart={depart} departureBlocked={Boolean(platforms[lane]?.status === 'ready' && departureConflict(lane))} />
        ))}
      </ScrollView>

      <View style={styles.footer}><Text style={styles.footerText}>V0.6.1 • VOLLEDIGE PERRONS • ZICHTBARE TREINSTELLEN • CAPACITEIT • HANDMATIG VERTREK</Text></View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#070d12' },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 11, paddingBottom: 30 },
  menuWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  kicker: { color: '#78a8c6', fontSize: 10, fontWeight: '900', letterSpacing: 2.2, marginBottom: 12 },
  title: { color: '#edf4f7', fontSize: 48, lineHeight: 45, fontWeight: '900', letterSpacing: -2, textAlign: 'center' },
  subtitle: { color: '#94a4ae', fontSize: 15, lineHeight: 22, textAlign: 'center', marginTop: 20, marginBottom: 28, maxWidth: 370 },
  primaryButton: { backgroundColor: '#ffd65a', minWidth: 230, paddingVertical: 16, alignItems: 'center', borderRadius: 9, borderWidth: 2, borderColor: '#ffe795' },
  primaryButtonText: { color: '#101820', fontWeight: '900', fontSize: 15, letterSpacing: 1.2 },

  hud: { flexDirection: 'row', paddingHorizontal: 14, paddingTop: 10, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#16232c' },
  hudCell: { flex: 1 }, hudCenter: { alignItems: 'center' }, hudRight: { alignItems: 'flex-end' },
  hudLabel: { color: '#5f717d', fontSize: 7.5, fontWeight: '900', letterSpacing: 1 },
  hudValue: { color: '#e3edf1', fontSize: 16, fontWeight: '900', marginTop: 2 },

  tableauFrame: { marginTop: 9, backgroundColor: '#0a1218', borderWidth: 1, borderColor: '#263741', borderRadius: 11, overflow: 'hidden' },
  tableauHeader: { minHeight: 37, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: '#263741' },
  tableauTitle: { flex: 1, color: '#9eb0bb', fontSize: 7.2, fontWeight: '900', letterSpacing: 0.6 },
  tableauStatus: { color: '#ffd65a', fontSize: 7, fontWeight: '900', marginLeft: 8 },
  svgArea: { height: 226, position: 'relative', overflow: 'hidden' },

  consistWrap: { alignItems: 'center', justifyContent: 'center' },
  consistUnits: { flexDirection: 'row', alignItems: 'center', height: 19 },
  consistUnit: { height: 17, backgroundColor: '#d9edf8', borderWidth: 1.5, borderColor: '#081016', borderRadius: 3, overflow: 'hidden', justifyContent: 'center' },
  consistUnitCompact: { height: 15 },
  cabBand: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: '#6ba5c3' },
  windowsRow: { position: 'absolute', left: 7, right: 3, top: 3, flexDirection: 'row', justifyContent: 'space-around' },
  windowDot: { width: 4, height: 3, borderRadius: 1, backgroundColor: '#31566c' },
  consistCode: { color: '#173443', fontSize: 5.5, fontWeight: '900', textAlign: 'center', marginTop: 5 },
  coupler: { width: 5, height: 3, backgroundColor: '#6f7c84' },
  consistId: { color: '#d8e8ef', fontSize: 6.4, lineHeight: 8, fontWeight: '900', backgroundColor: '#101920', paddingHorizontal: 3, borderRadius: 2, marginTop: 1 },
  consistDetail: { color: '#7a9daf', fontSize: 5.4, lineHeight: 7, fontWeight: '900', backgroundColor: '#101920', paddingHorizontal: 2, borderRadius: 2 },
  movingConsist: { position: 'absolute', left: 0, top: 0 },

  messageStrip: { minHeight: 37, flexDirection: 'row', alignItems: 'center', marginTop: 8, paddingHorizontal: 10, backgroundColor: '#0a1218', borderWidth: 1, borderColor: '#20303a', borderRadius: 8 },
  messageLamp: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#58b9ff', marginRight: 8 },
  messageText: { flex: 1, color: '#a3b1ba', fontSize: 9, lineHeight: 12, fontWeight: '700' },

  incomingCard: { marginTop: 9, backgroundColor: '#0d161d', borderWidth: 1, borderColor: '#2b3b45', borderRadius: 10, padding: 10 },
  cardTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionLabel: { color: '#718591', fontSize: 7.2, fontWeight: '900', letterSpacing: 1.1 }, queueCount: { color: '#78909e', fontSize: 8, fontWeight: '900' },
  incomingMain: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 8 },
  incomingId: { color: '#edf4f7', fontSize: 20, fontWeight: '900' }, incomingType: { color: '#7f929d', fontSize: 9, fontWeight: '800', marginTop: 2 }, incomingWait: { color: '#ffd65a', fontSize: 15, fontWeight: '900' },

  trainMetaRow: { flexDirection: 'row', gap: 6, marginTop: 9 },
  metaCell: { flex: 1, backgroundColor: '#091117', borderRadius: 6, paddingVertical: 6, alignItems: 'center' },
  metaLabel: { color: '#5f7480', fontSize: 6.2, fontWeight: '900', letterSpacing: 0.7 }, metaValue: { color: '#dce7ec', fontSize: 11, fontWeight: '900', marginTop: 2 },

  compositionRow: { flexDirection: 'row', alignItems: 'center', gap: 0, marginTop: 7 },
  compositionCoupler: { width: 5, height: 3, backgroundColor: '#71808a' },
  setBlock: { maxWidth: 105, minWidth: 45, height: 14, backgroundColor: '#40677d', borderRadius: 3, alignItems: 'center', justifyContent: 'center' },
  setBlockText: { color: '#d8edf7', fontSize: 6, fontWeight: '900' },

  routeRow: { flexDirection: 'row', gap: 6, marginTop: 10 },
  routeButton: { flex: 1, minHeight: 58, alignItems: 'center', justifyContent: 'center', backgroundColor: '#111c23', borderWidth: 1, borderColor: '#40505a', borderRadius: 7 },
  routeButtonPlanned: { borderColor: '#58b9ff', backgroundColor: '#10202a' }, routeButtonConflict: { borderColor: '#ff5968', backgroundColor: '#24161a' },
  routeSmall: { color: '#71838e', fontSize: 5.8, fontWeight: '900', letterSpacing: 0.6 }, routeBig: { color: '#e8f0f4', fontSize: 17, fontWeight: '900', marginVertical: 1 }, routeCrowd: { color: '#778995', fontSize: 6.6, fontWeight: '800' },

  stationHeading: { color: '#78909c', fontSize: 7.5, fontWeight: '900', letterSpacing: 1.2, textAlign: 'center', marginTop: 14, marginBottom: 7 },
  platformCard: { marginBottom: 8, backgroundColor: '#0d161d', borderWidth: 1, borderColor: '#263842', borderRadius: 10, padding: 10 },
  platformCardCrowded: { borderColor: '#79424c' },
  platformTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  platformTitle: { color: '#7d919c', fontSize: 7, fontWeight: '900', letterSpacing: 1 }, trainName: { color: '#e4edf1', fontSize: 15, fontWeight: '900', marginTop: 2 },
  statusBadge: { color: '#ffd65a', fontSize: 8, fontWeight: '900', backgroundColor: '#27210e', paddingHorizontal: 7, paddingVertical: 4, borderRadius: 5 },
  readyBadge: { color: '#54e78d', backgroundColor: '#10251a' }, freeBadge: { color: '#54e78d', fontSize: 8, fontWeight: '900', backgroundColor: '#10251a', paddingHorizontal: 7, paddingVertical: 4, borderRadius: 5 },
  waitingBig: { color: '#e6eef2', fontSize: 28, fontWeight: '900', marginTop: 9 }, waitingLabel: { color: '#758893', fontSize: 8, fontWeight: '800', marginBottom: 6 },
  platformHint: { color: '#53656f', fontSize: 8, fontWeight: '700', marginTop: 7 },

  platformSchematic: { marginTop: 8, paddingTop: 7, paddingBottom: 5, minHeight: 38, justifyContent: 'center' },
  platformEdge: { position: 'absolute', left: 0, right: 0, top: 1, height: 6, borderRadius: 2, backgroundColor: '#26343d', borderTopWidth: 1, borderTopColor: '#64737c' },
  platformLengthLabel: { color: '#596d78', fontSize: 6.5, fontWeight: '800', marginTop: 4 },

  metricHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 9, marginBottom: 4 },
  metricLabel: { color: '#647985', fontSize: 6.5, fontWeight: '900', letterSpacing: 0.7 }, metricValue: { color: '#d5e0e5', fontSize: 8.5, fontWeight: '900' }, dangerText: { color: '#ff7182' },
  barTrack: { height: 8, borderRadius: 4, backgroundColor: '#1a2730', overflow: 'hidden' }, barFill: { height: '100%', borderRadius: 4, backgroundColor: '#58b9ff' }, barFillWarning: { backgroundColor: '#ff6677' },
  miniInfo: { color: '#667984', fontSize: 7, fontWeight: '700', marginTop: 3 },

  departButton: { minHeight: 43, marginTop: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: '#102b21', borderWidth: 1.5, borderColor: '#3fd47b', borderRadius: 7 },
  departButtonText: { color: '#66ec9b', fontSize: 10, fontWeight: '900', letterSpacing: 0.6 }, buttonDisabled: { opacity: 0.32 },
  holdHint: { color: '#b49c53', fontSize: 7.5, lineHeight: 11, textAlign: 'center', marginTop: 6, fontWeight: '700' },
  emptyText: { color: '#60717c', fontSize: 9, fontWeight: '700', marginTop: 10 },

  footer: { alignItems: 'center', paddingVertical: 7, paddingHorizontal: 8, borderTopWidth: 1, borderTopColor: '#14212a' }, footerText: { color: '#42535e', fontSize: 6.3, fontWeight: '900', textAlign: 'center' },
});