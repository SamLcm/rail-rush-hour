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

const ROUTES = [1, 2, 3];
const TRACK_Y = { 1: 55, 2: 140, 3: 225 };
const WEST_IN_Y = 95;
const WEST_OUT_Y = 185;
const DWELL_SECONDS = 8;
const SPAWN_MS = 7200;
const ARRIVAL_BASE_MS = 4200;
const ARRIVAL_MIN_MS = 3200;
const DEPARTURE_MS = 3600;
const MOTION_RANGE = [0, 0.16, 0.32, 0.5, 0.68, 0.84, 1];

const SEGMENTS = {
  IN: 'M 15 95 H 85',
  WIN: 'M 85 95 L 110 110',
  U0: 'M 110 110 H 135',
  EW_U: 'M 135 110 H 175',
  EW_L: 'M 135 170 H 175',
  EW_X1: 'M 135 110 L 175 170',
  EW_X2: 'M 135 170 L 175 110',
  U1: 'M 175 110 H 195',
  L1: 'M 175 170 H 195',
  K_U: 'M 195 110 H 235',
  K_L: 'M 195 170 H 235',
  K_X1: 'M 195 110 L 235 170',
  K_X2: 'M 195 170 L 235 110',
  P1: 'M 235 110 L 260 55 H 335',
  P2U: 'M 235 110 L 260 140',
  P2L: 'M 235 170 L 260 140',
  P2: 'M 260 140 H 335',
  P3: 'M 235 170 L 260 225 H 335',
  L0: 'M 110 170 H 135',
  WOUT: 'M 85 185 L 110 170',
  OUT: 'M 15 185 H 85',
};

const ARRIVAL_ROUTES = {
  1: {
    name: 'WEST IN → P1',
    segments: ['IN', 'WIN', 'U0', 'EW_U', 'U1', 'K_U', 'P1'],
    locks: ['IN', 'EW_TOP', 'K_TOP', 'P1'],
  },
  2: {
    name: 'WEST IN → P2',
    segments: ['IN', 'WIN', 'U0', 'EW_U', 'U1', 'K_U', 'P2U', 'P2'],
    locks: ['IN', 'EW_TOP', 'K_TOP', 'P2'],
  },
  3: {
    name: 'WEST IN → P3',
    segments: ['IN', 'WIN', 'U0', 'EW_X1', 'L1', 'K_L', 'P3'],
    locks: ['IN', 'EW_TOP', 'EW_BOTTOM', 'K_BOTTOM', 'P3'],
  },
};

const DEPARTURE_ROUTES = {
  1: {
    name: 'P1 → WEST UIT',
    segments: ['P1', 'K_X2', 'L1', 'EW_L', 'L0', 'WOUT', 'OUT'],
    locks: ['P1', 'K_TOP', 'K_BOTTOM', 'EW_BOTTOM', 'OUT'],
  },
  2: {
    name: 'P2 → WEST UIT',
    segments: ['P2', 'P2L', 'K_L', 'L1', 'EW_L', 'L0', 'WOUT', 'OUT'],
    locks: ['P2', 'K_BOTTOM', 'EW_BOTTOM', 'OUT'],
  },
  3: {
    name: 'P3 → WEST UIT',
    segments: ['P3', 'K_L', 'L1', 'EW_L', 'L0', 'WOUT', 'OUT'],
    locks: ['P3', 'K_BOTTOM', 'EW_BOTTOM', 'OUT'],
  },
};

const ARRIVAL_POINTS = {
  1: [[15, 95], [85, 95], [110, 110], [175, 110], [235, 110], [260, 55], [305, 55]],
  2: [[15, 95], [85, 95], [110, 110], [175, 110], [235, 110], [260, 140], [305, 140]],
  3: [[15, 95], [85, 95], [110, 110], [175, 170], [235, 170], [260, 225], [305, 225]],
};

const DEPARTURE_POINTS = {
  1: [[305, 55], [260, 55], [235, 110], [195, 170], [135, 170], [85, 185], [15, 185]],
  2: [[305, 140], [260, 140], [235, 170], [195, 170], [135, 170], [85, 185], [15, 185]],
  3: [[305, 225], [260, 225], [235, 170], [195, 170], [135, 170], [85, 185], [15, 185]],
};

const routesConflict = (a, b) => Boolean(a && b && a.locks.some((lock) => b.locks.includes(lock)));

function Signal({ x, y, green = false, label }) {
  return (
    <>
      <Path d={`M ${x} ${y + 9} V ${y + 24}`} stroke="#74808b" strokeWidth="3" />
      <Rect x={x - 8} y={y - 11} width="16" height="22" rx="5" fill="#101820" stroke="#697580" strokeWidth="2" />
      <Circle cx={x} cy={y - 4} r="4.7" fill={green ? '#38e27d' : '#ff4d5f'} />
      <Circle cx={x} cy={y + 5} r="2.7" fill="#26313b" />
      <SvgText x={x - 13} y={y + 37} fill="#71808d" fontSize="8.5" fontWeight="700">{label}</SvgText>
    </>
  );
}

function TrainBlock({ id, detail, style }) {
  return (
    <View pointerEvents="none" style={[styles.trainBlock, style]}>
      <Text style={styles.trainBlockId}>{id}</Text>
      <Text style={styles.trainBlockDest}>{detail}</Text>
    </View>
  );
}

function movementPosition(progress, points, scaleX, scaleY) {
  return {
    x: progress.interpolate({
      inputRange: MOTION_RANGE,
      outputRange: points.map(([x]) => x * scaleX - 29),
    }),
    y: progress.interpolate({
      inputRange: MOTION_RANGE,
      outputRange: points.map(([, y]) => y * scaleY - 14),
    }),
  };
}

function RouteHighlight({ route, color }) {
  if (!route) return null;
  return route.segments.map((segmentId) => (
    <Path
      key={`${color}-${segmentId}`}
      d={SEGMENTS[segmentId]}
      fill="none"
      stroke={color}
      strokeWidth="7"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ));
}

function DispatcherTableau({
  boardSize,
  onLayout,
  platforms,
  arrivalTrain,
  arrivalLane,
  arrivalProgress,
  departureTrain,
  departureLane,
  departureProgress,
  queueHead,
}) {
  const scaleX = boardSize.width / 380 || 1;
  const scaleY = boardSize.height / 280 || 1;
  const arrivalRoute = arrivalLane ? ARRIVAL_ROUTES[arrivalLane] : null;
  const departureRoute = departureLane ? DEPARTURE_ROUTES[departureLane] : null;
  const arrivalPos = movementPosition(arrivalProgress, ARRIVAL_POINTS[arrivalLane || 1], scaleX, scaleY);
  const departurePos = movementPosition(departureProgress, DEPARTURE_POINTS[departureLane || 1], scaleX, scaleY);
  const activeCount = Number(Boolean(arrivalTrain)) + Number(Boolean(departureTrain));

  let status = 'INTERLOCKING VRIJ';
  if (activeCount === 2) status = '2 RIJWEGEN ACTIEF';
  else if (arrivalTrain) status = 'AANKOMSTRIJWEG ACTIEF';
  else if (departureTrain) status = 'UITRIJWEG ACTIEF';
  else if (queueHead) status = 'TREIN WACHT';

  return (
    <View style={styles.tableauFrame}>
      <View style={styles.tableauHeader}>
        <Text style={styles.tableauTitle}>POST RAIL RUSH — WISSELSTRAAT / INTERLOCKING</Text>
        <Text style={styles.tableauStatus}>{status}</Text>
      </View>

      <View style={styles.svgArea} onLayout={(event) => onLayout(event.nativeEvent.layout)}>
        <Svg width="100%" height="100%" viewBox="0 0 380 280">
          <Rect x="1" y="1" width="378" height="278" rx="10" fill="#081016" stroke="#26343f" strokeWidth="2" />

          {Object.entries(SEGMENTS).map(([id, d]) => (
            <Path key={id} d={d} fill="none" stroke="#45525c" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          ))}

          {ROUTES.map((lane) => platforms[lane] ? (
            <Path
              key={`occ-${lane}`}
              d={lane === 1 ? 'M 268 55 H 335' : lane === 2 ? 'M 268 140 H 335' : 'M 268 225 H 335'}
              fill="none"
              stroke="#ff4d6d"
              strokeWidth="9"
              strokeLinecap="round"
            />
          ) : null)}

          <RouteHighlight route={arrivalTrain ? arrivalRoute : null} color="#ffd65a" />
          <RouteHighlight route={departureTrain ? departureRoute : null} color="#66d8ff" />

          <Circle cx="85" cy="95" r="6" fill="#0b151d" stroke="#9aa7b0" strokeWidth="2.5" />
          <Circle cx="85" cy="185" r="6" fill="#0b151d" stroke="#9aa7b0" strokeWidth="2.5" />
          <Circle cx="235" cy="110" r="6" fill="#0b151d" stroke="#9aa7b0" strokeWidth="2.5" />
          <Circle cx="235" cy="170" r="6" fill="#0b151d" stroke="#9aa7b0" strokeWidth="2.5" />
          <Circle cx="260" cy="140" r="5" fill="#0b151d" stroke="#9aa7b0" strokeWidth="2" />

          <SvgText x="70" y="80" fill="#82919b" fontSize="9" fontWeight="800">W1</SvgText>
          <SvgText x="69" y="208" fill="#82919b" fontSize="9" fontWeight="800">W2</SvgText>
          <SvgText x="238" y="100" fill="#82919b" fontSize="8" fontWeight="800">W3</SvgText>
          <SvgText x="238" y="192" fill="#82919b" fontSize="8" fontWeight="800">W4</SvgText>
          <SvgText x="262" y="157" fill="#82919b" fontSize="8" fontWeight="800">W5</SvgText>

          <Rect x="132" y="103" width="46" height="74" rx="5" fill="none" stroke="#657783" strokeWidth="1" strokeDasharray="3 3" />
          <SvgText x="139" y="99" fill="#9aa8b1" fontSize="8" fontWeight="900">EW1</SvgText>
          <Circle cx="215" cy="140" r="7" fill="#0b151d" stroke="#657783" strokeWidth="1.5" />
          <SvgText x="206" y="132" fill="#9aa8b1" fontSize="8" fontWeight="900">K1</SvgText>

          <Signal x={52} y={70} green={Boolean(arrivalTrain)} label="S1" />
          <Signal x={52} y={210} green={Boolean(departureTrain)} label="S2" />
          {ROUTES.map((lane) => (
            <Signal
              key={`D${lane}`}
              x={284}
              y={TRACK_Y[lane] - 23}
              green={Boolean(departureTrain) && departureLane === lane}
              label={`D${lane}`}
            />
          ))}

          {ROUTES.map((lane) => (
            <React.Fragment key={`p-${lane}`}>
              <Rect x="342" y={TRACK_Y[lane] - 14} width="28" height="28" rx="5" fill="#101b23" stroke="#364650" />
              <SvgText x="356" y={TRACK_Y[lane] + 5} fill="#e8eef2" fontSize="13" fontWeight="800" textAnchor="middle">{lane}</SvgText>
            </React.Fragment>
          ))}

          {queueHead ? <Circle cx="369" cy={TRACK_Y[queueHead.target] - 22} r="4.5" fill="#58b9ff" /> : null}
          <SvgText x="13" y="84" fill="#6f808b" fontSize="8" fontWeight="800">WEST IN →</SvgText>
          <SvgText x="13" y="204" fill="#6f808b" fontSize="8" fontWeight="800">← WEST UIT</SvgText>
        </Svg>

        {boardSize.width > 0 && ROUTES.map((lane) => {
          const train = platforms[lane];
          if (!train || (departureTrain && departureTrain.id === train.id)) return null;
          return (
            <TrainBlock
              key={train.id}
              id={train.id}
              detail={train.status === 'ready' ? 'GEREED' : train.status === 'departing' ? 'UIT' : `${train.remaining}s`}
              style={{ position: 'absolute', left: 286 * scaleX - 29, top: TRACK_Y[lane] * scaleY - 14 }}
            />
          );
        })}

        {boardSize.width > 0 && arrivalTrain ? (
          <Animated.View
            pointerEvents="none"
            style={[styles.trainBlock, styles.movingTrain, { transform: [{ translateX: arrivalPos.x }, { translateY: arrivalPos.y }] }]}
          >
            <Text style={styles.trainBlockId}>{arrivalTrain.id}</Text>
            <Text style={styles.trainBlockDest}>→ P{arrivalLane}</Text>
          </Animated.View>
        ) : null}

        {boardSize.width > 0 && departureTrain ? (
          <Animated.View
            pointerEvents="none"
            style={[styles.trainBlock, styles.movingTrain, { transform: [{ translateX: departurePos.x }, { translateY: departurePos.y }] }]}
          >
            <Text style={styles.trainBlockId}>{departureTrain.id}</Text>
            <Text style={styles.trainBlockDest}>← WEST</Text>
          </Animated.View>
        ) : null}
      </View>

      <View style={styles.legendRow}>
        <View style={styles.legendItem}><View style={[styles.legendLine, { backgroundColor: '#ffd65a' }]} /><Text style={styles.legendText}>AANKOMST</Text></View>
        <View style={styles.legendItem}><View style={[styles.legendLine, { backgroundColor: '#66d8ff' }]} /><Text style={styles.legendText}>VERTREK</Text></View>
        <View style={styles.legendItem}><View style={[styles.legendLine, { backgroundColor: '#ff4d6d' }]} /><Text style={styles.legendText}>BEZET</Text></View>
        <View style={styles.legendItem}><Text style={styles.legendText}>EW1 ENGELS • K1 KRUISING</Text></View>
      </View>
    </View>
  );
}

export default function App() {
  const [phase, setPhase] = useState('menu');
  const [queue, setQueue] = useState([]);
  const [platforms, setPlatforms] = useState({ 1: null, 2: null, 3: null });
  const [arrivalTrain, setArrivalTrain] = useState(null);
  const [arrivalLane, setArrivalLane] = useState(null);
  const [departureTrain, setDepartureTrain] = useState(null);
  const [departureLane, setDepartureLane] = useState(null);
  const [score, setScore] = useState(0);
  const [coins, setCoins] = useState(0);
  const [lives, setLives] = useState(3);
  const [combo, setCombo] = useState(0);
  const [totalDelay, setTotalDelay] = useState(0);
  const [message, setMessage] = useState('');
  const [boardSize, setBoardSize] = useState({ width: 0, height: 0 });

  const arrivalProgress = useRef(new Animated.Value(0)).current;
  const departureProgress = useRef(new Animated.Value(0)).current;
  const arrivalAnimation = useRef(null);
  const departureAnimation = useRef(null);
  const scoreRef = useRef(0);
  const comboRef = useRef(0);
  const livesRef = useRef(3);
  const trainSequence = useRef(280);
  const queueRef = useRef([]);
  const platformsRef = useRef({ 1: null, 2: null, 3: null });
  const arrivalBusyRef = useRef(false);
  const departureBusyRef = useRef(false);
  const arrivalLaneRef = useRef(null);
  const departureLaneRef = useRef(null);

  const replaceQueue = (updater) => {
    setQueue((current) => {
      const next = typeof updater === 'function' ? updater(current) : updater;
      queueRef.current = next;
      return next;
    });
  };

  const replacePlatforms = (updater) => {
    setPlatforms((current) => {
      const next = typeof updater === 'function' ? updater(current) : updater;
      platformsRef.current = next;
      return next;
    });
  };

  const createTrain = () => {
    trainSequence.current += Math.random() > 0.5 ? 2 : 4;
    return { id: `IC ${trainSequence.current}`, target: Math.floor(Math.random() * 3) + 1, wait: 0 };
  };

  useEffect(() => {
    if (phase !== 'playing') return undefined;

    const clock = setInterval(() => {
      replaceQueue((current) => {
        const updated = current.map((train) => ({ ...train, wait: train.wait + 1 }));
        const delayed = updated.filter((train) => train.wait > 7).length;
        if (delayed) setTotalDelay((value) => value + delayed);
        return updated;
      });

      replacePlatforms((current) => {
        const next = { ...current };
        let changed = false;
        ROUTES.forEach((lane) => {
          const train = current[lane];
          if (!train || train.status !== 'dwelling') return;
          changed = true;
          const remaining = Math.max(0, train.remaining - 1);
          next[lane] = { ...train, remaining, status: remaining === 0 ? 'ready' : 'dwelling' };
        });
        return changed ? next : current;
      });
    }, 1000);

    const spawner = setInterval(() => replaceQueue((current) => [...current, createTrain()]), SPAWN_MS);
    return () => { clearInterval(clock); clearInterval(spawner); };
  }, [phase]);

  useEffect(() => () => {
    if (arrivalAnimation.current) arrivalAnimation.current.stop();
    if (departureAnimation.current) departureAnimation.current.stop();
  }, []);

  const loseLife = () => {
    const nextLives = livesRef.current - 1;
    livesRef.current = nextLives;
    setLives(nextLives);
    comboRef.current = 0;
    setCombo(0);
    if (nextLives <= 0) setTimeout(() => setPhase('gameover'), 350);
  };

  const arrivalConflictsWithDeparture = (lane) => {
    if (!departureBusyRef.current || !departureLaneRef.current) return false;
    return routesConflict(ARRIVAL_ROUTES[lane], DEPARTURE_ROUTES[departureLaneRef.current]);
  };

  const departureConflictsWithArrival = (lane) => {
    if (!arrivalBusyRef.current || !arrivalLaneRef.current) return false;
    return routesConflict(DEPARTURE_ROUTES[lane], ARRIVAL_ROUTES[arrivalLaneRef.current]);
  };

  const chooseArrivalRoute = (lane) => {
    const waiting = queueRef.current[0];
    if (phase !== 'playing') return;
    if (arrivalBusyRef.current) { setMessage('WEST IN is al bezet door een aankomende trein.'); return; }
    if (!waiting) { setMessage('Geen trein wacht op WEST IN.'); return; }
    if (platformsRef.current[lane]) { setMessage(`P${lane} is bezet.`); return; }
    if (arrivalConflictsWithDeparture(lane)) {
      setMessage(`Rijwegconflict: WEST IN → P${lane} kruist de actieve uitrijweg bij EW1/K1.`);
      return;
    }

    arrivalBusyRef.current = true;
    arrivalLaneRef.current = lane;
    replaceQueue((current) => current.slice(1));
    setArrivalTrain(waiting);
    setArrivalLane(lane);
    arrivalProgress.setValue(0);
    setMessage(`${waiting.id}: ${ARRIVAL_ROUTES[lane].name} vastgelegd.`);

    const animation = Animated.timing(arrivalProgress, {
      toValue: 1,
      duration: Math.max(ARRIVAL_MIN_MS, ARRIVAL_BASE_MS - Math.floor(scoreRef.current / 120) * 80),
      useNativeDriver: true,
    });
    arrivalAnimation.current = animation;
    animation.start(({ finished }) => {
      arrivalBusyRef.current = false;
      arrivalLaneRef.current = null;
      if (!finished) return;

      replacePlatforms((current) => ({
        ...current,
        [lane]: { ...waiting, lane, status: 'dwelling', remaining: DWELL_SECONDS },
      }));
      setArrivalTrain(null);
      setArrivalLane(null);

      if (lane === waiting.target) {
        const nextCombo = comboRef.current + 1;
        const gained = 15 + Math.min(45, nextCombo * 3);
        comboRef.current = nextCombo;
        scoreRef.current += gained;
        setCombo(nextCombo);
        setScore(scoreRef.current);
        setCoins((value) => value + 1);
        setMessage(`${waiting.id} correct binnen op P${lane}. +${gained}`);
      } else {
        setMessage(`${waiting.id} staat op P${lane}; gepland was P${waiting.target}.`);
        loseLife();
      }
    });
  };

  const dispatchDeparture = (lane) => {
    if (phase !== 'playing') return;
    if (departureBusyRef.current) { setMessage('WEST UIT is al bezet door een vertrekkende trein.'); return; }

    const train = platformsRef.current[lane];
    if (!train) { setMessage(`P${lane} is al vrij.`); return; }
    if (train.status !== 'ready') { setMessage(`${train.id} op P${lane} is nog niet gereed.`); return; }
    if (departureConflictsWithArrival(lane)) {
      setMessage(`Rijwegconflict: P${lane} → WEST UIT kruist de actieve aankomstrijweg bij EW1/K1.`);
      return;
    }

    departureBusyRef.current = true;
    departureLaneRef.current = lane;
    replacePlatforms((current) => ({
      ...current,
      [lane]: current[lane] ? { ...current[lane], status: 'departing' } : null,
    }));
    setDepartureTrain(train);
    setDepartureLane(lane);
    departureProgress.setValue(0);
    setMessage(`${train.id}: ${DEPARTURE_ROUTES[lane].name} vastgelegd.`);

    const animation = Animated.timing(departureProgress, {
      toValue: 1,
      duration: DEPARTURE_MS,
      useNativeDriver: true,
    });
    departureAnimation.current = animation;
    animation.start(({ finished }) => {
      if (!finished) {
        departureBusyRef.current = false;
        departureLaneRef.current = null;
        return;
      }

      replacePlatforms((current) => ({ ...current, [lane]: null }));
      setDepartureTrain(null);
      setDepartureLane(null);
      departureBusyRef.current = false;
      departureLaneRef.current = null;
      scoreRef.current += 5;
      setScore(scoreRef.current);
      setMessage(`${train.id} via WEST UIT vertrokken. P${lane} vrij. +5`);
    });
  };

  const startGame = () => {
    if (arrivalAnimation.current) arrivalAnimation.current.stop();
    if (departureAnimation.current) departureAnimation.current.stop();

    trainSequence.current = 280;
    scoreRef.current = 0;
    comboRef.current = 0;
    livesRef.current = 3;
    arrivalBusyRef.current = false;
    departureBusyRef.current = false;
    arrivalLaneRef.current = null;
    departureLaneRef.current = null;

    const firstQueue = [createTrain()];
    queueRef.current = firstQueue;
    platformsRef.current = { 1: null, 2: null, 3: null };

    setQueue(firstQueue);
    setPlatforms(platformsRef.current);
    setArrivalTrain(null);
    setArrivalLane(null);
    setDepartureTrain(null);
    setDepartureLane(null);
    setScore(0);
    setCoins(0);
    setLives(3);
    setCombo(0);
    setTotalDelay(0);
    setMessage('Interlocking vrij. Eerste trein meldt zich op WEST IN.');
    setPhase('playing');
  };

  if (phase === 'menu') {
    return (
      <SafeAreaView style={styles.screen}>
        <StatusBar barStyle="light-content" />
        <View style={styles.menuWrap}>
          <Text style={styles.kicker}>INTERLOCKING DISPATCHER / V0.5.1</Text>
          <Text style={styles.title}>RAIL{`\n`}RUSH HOUR</Text>
          <Text style={styles.subtitle}>Bedien de wisselstraat, combineer niet-conflicterende rijwegen en houd overzicht wanneer het station voller wordt.</Text>
          <Pressable style={styles.primaryButton} onPress={startGame}><Text style={styles.primaryButtonText}>START DIENST</Text></Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (phase === 'gameover') {
    return (
      <SafeAreaView style={styles.screen}>
        <StatusBar barStyle="light-content" />
        <View style={styles.menuWrap}>
          <Text style={styles.kicker}>POST BUITEN DIENST</Text>
          <Text style={styles.gameOverTitle}>GAME OVER</Text>
          <View style={styles.resultCard}>
            <Text style={styles.resultLabel}>EINDSCORE</Text>
            <Text style={styles.resultScore}>{score}</Text>
            <Text style={styles.resultCoins}>COINS {coins} • VERTRAGING {totalDelay}s</Text>
          </View>
          <Pressable style={styles.primaryButton} onPress={startGame}><Text style={styles.primaryButtonText}>NIEUWE DIENST</Text></Pressable>
          <Pressable style={styles.secondaryButton} onPress={() => setPhase('menu')}><Text style={styles.secondaryButtonText}>HOOFDMENU</Text></Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const queueHead = queue[0] || null;
  const readyLanes = ROUTES.filter((lane) => platforms[lane]?.status === 'ready');
  const occupiedCount = ROUTES.filter((lane) => Boolean(platforms[lane])).length;

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="light-content" />
      <View style={styles.hud}>
        <View style={styles.hudCell}><Text style={styles.hudLabel}>SCORE</Text><Text style={styles.hudValue}>{score}</Text></View>
        <View style={[styles.hudCell, styles.hudCenter]}><Text style={styles.hudLabel}>COMBO</Text><Text style={styles.hudValue}>x{combo}</Text></View>
        <View style={[styles.hudCell, styles.hudCenter]}><Text style={styles.hudLabel}>VERTR.</Text><Text style={styles.hudValue}>{totalDelay}s</Text></View>
        <View style={[styles.hudCell, styles.hudRight]}><Text style={styles.hudLabel}>LEVENS</Text><Text style={styles.lifeText}>{'●'.repeat(lives)}{'○'.repeat(3 - lives)}</Text></View>
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
          queueHead={queueHead}
        />

        <View style={styles.infoGrid}>
          <View style={styles.queuePanel}>
            <View style={styles.panelTitleRow}><Text style={styles.panelLabel}>WEST IN — WACHTRIJ</Text><Text style={styles.panelCount}>{queue.length}</Text></View>
            {queue.length === 0 ? <Text style={styles.emptyText}>Geen trein wacht</Text> : queue.slice(0, 2).map((train, index) => (
              <View key={train.id} style={styles.queueRow}>
                <Text style={styles.queuePos}>{index + 1}</Text>
                <Text style={styles.queueTrain}>{train.id}</Text>
                <Text style={styles.queueTarget}>→ P{train.target}</Text>
                <Text style={[styles.queueWait, train.wait > 7 && styles.queueWaitLate]}>{train.wait}s</Text>
              </View>
            ))}
          </View>

          <View style={styles.platformPanel}>
            <View style={styles.panelTitleRow}><Text style={styles.panelLabel}>PERRONS</Text><Text style={styles.panelCount}>{occupiedCount}/3</Text></View>
            <View style={styles.platformMiniRow}>
              {ROUTES.map((lane) => {
                const train = platforms[lane];
                return (
                  <View key={lane} style={[styles.platformMini, train && styles.platformMiniOccupied]}>
                    <Text style={styles.platformMiniLabel}>P{lane}</Text>
                    <Text style={[styles.platformMiniStatus, train && styles.platformMiniStatusOccupied]}>
                      {!train ? 'VRIJ' : train.status === 'ready' ? 'GEREED' : train.status === 'departing' ? 'UIT' : `${train.remaining}s`}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        </View>

        <View style={styles.statusStrip}>
          <View style={[styles.statusLamp, arrivalTrain || departureTrain ? styles.statusLampGreen : styles.statusLampBlue]} />
          <Text style={styles.statusText}>{message}</Text>
        </View>

        <View style={styles.controlsBlock}>
          <Text style={styles.controlsLabel}>AANKOMST — {queueHead ? `${queueHead.id} → P${queueHead.target}` : 'GEEN TREIN WACHT'}</Text>
          <View style={styles.routeRow}>
            {ROUTES.map((lane) => {
              const occupied = Boolean(platforms[lane]);
              const conflict = Boolean(departureTrain) && routesConflict(ARRIVAL_ROUTES[lane], DEPARTURE_ROUTES[departureLane]);
              const disabled = !queueHead || Boolean(arrivalTrain) || occupied;
              const target = queueHead?.target === lane;
              return (
                <Pressable
                  key={lane}
                  disabled={disabled}
                  style={[styles.routeButton, target && styles.routeButtonTarget, conflict && styles.routeButtonConflict, disabled && styles.routeButtonDisabled]}
                  onPress={() => chooseArrivalRoute(lane)}
                >
                  <Text style={styles.routeButtonSmall}>{occupied ? 'BEZET' : conflict ? 'CONFLICT' : target ? 'GEPLAND' : 'RIJWEG'}</Text>
                  <Text style={styles.routeButtonBig}>P{lane}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.departureArea}>
          <Text style={styles.controlsLabel}>VERTREK — WEST UIT</Text>
          {readyLanes.length === 0 ? (
            <View style={styles.noDeparture}><Text style={styles.noDepartureText}>{departureTrain ? `${departureTrain.id} rijdt uit` : 'Geen trein gereed voor vertrek'}</Text></View>
          ) : (
            <View style={styles.departureRow}>
              {readyLanes.map((lane) => {
                const conflict = Boolean(arrivalTrain) && routesConflict(DEPARTURE_ROUTES[lane], ARRIVAL_ROUTES[arrivalLane]);
                return (
                  <Pressable
                    key={lane}
                    hitSlop={10}
                    style={[styles.departureButton, conflict && styles.departureButtonConflict, departureTrain && styles.routeButtonDisabled]}
                    onPress={() => dispatchDeparture(lane)}
                  >
                    <Text style={styles.departureSmall}>{conflict ? 'RIJWEGCONFLICT' : platforms[lane]?.id}</Text>
                    <Text style={styles.departureBig}>P{lane} → WEST UIT</Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Text style={styles.footerText}>W1–W5 • EW1 ENGELS WISSEL • K1 KRUISING • NIET-CONFLICTERENDE RIJWEGEN PARALLEL</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#070d12' },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 11, paddingBottom: 24 },
  menuWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 26 },
  kicker: { color: '#79a8c7', fontSize: 10, fontWeight: '900', letterSpacing: 2.1, marginBottom: 12, textAlign: 'center' },
  title: { color: '#edf4f7', fontSize: 47, lineHeight: 45, fontWeight: '900', letterSpacing: -2, textAlign: 'center' },
  subtitle: { color: '#93a3ae', fontSize: 16, lineHeight: 23, textAlign: 'center', marginTop: 18, marginBottom: 28, maxWidth: 360 },
  primaryButton: { backgroundColor: '#ffd65a', minWidth: 230, paddingVertical: 16, paddingHorizontal: 24, alignItems: 'center', borderRadius: 9, borderWidth: 2, borderColor: '#ffe795' },
  primaryButtonText: { color: '#111820', fontWeight: '900', fontSize: 16, letterSpacing: 1.2 },
  secondaryButton: { paddingVertical: 13, paddingHorizontal: 24, marginTop: 7 },
  secondaryButtonText: { color: '#7f919d', fontWeight: '800', fontSize: 12, letterSpacing: 1 },
  gameOverTitle: { color: '#ff5968', fontSize: 42, fontWeight: '900', marginBottom: 20 },
  resultCard: { width: 270, alignItems: 'center', backgroundColor: '#0d151c', borderWidth: 1, borderColor: '#26343d', borderRadius: 10, paddingVertical: 18, marginBottom: 22 },
  resultLabel: { color: '#6f818d', fontSize: 9, fontWeight: '900', letterSpacing: 2 },
  resultScore: { color: '#edf4f7', fontSize: 38, fontWeight: '900', marginVertical: 3 },
  resultCoins: { color: '#ffd65a', fontSize: 11, fontWeight: '900' },

  hud: { flexDirection: 'row', paddingHorizontal: 15, paddingTop: 10, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#16232c' },
  hudCell: { flex: 1 },
  hudCenter: { alignItems: 'center' },
  hudRight: { alignItems: 'flex-end' },
  hudLabel: { color: '#5e707c', fontSize: 7.5, fontWeight: '900', letterSpacing: 1.2 },
  hudValue: { color: '#dfe9ee', fontSize: 16, fontWeight: '900', marginTop: 2 },
  lifeText: { color: '#ff5c68', fontSize: 15, fontWeight: '900', marginTop: 2, letterSpacing: 1.5 },

  tableauFrame: { marginTop: 9, backgroundColor: '#0a1218', borderWidth: 1, borderColor: '#263741', borderRadius: 11, overflow: 'hidden' },
  tableauHeader: { minHeight: 39, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: '#263741' },
  tableauTitle: { color: '#9eb0bb', fontSize: 7.5, fontWeight: '900', letterSpacing: 0.6 },
  tableauStatus: { color: '#ffd65a', fontSize: 7.2, fontWeight: '900' },
  svgArea: { height: 260, position: 'relative', overflow: 'hidden' },
  trainBlock: { width: 58, minHeight: 28, borderRadius: 4, backgroundColor: '#d9edf8', borderWidth: 2, borderColor: '#081016', paddingHorizontal: 3, paddingVertical: 2, alignItems: 'center', justifyContent: 'center' },
  movingTrain: { position: 'absolute', left: 0, top: 0 },
  trainBlockId: { color: '#0a141b', fontSize: 8, fontWeight: '900' },
  trainBlockDest: { color: '#31566c', fontSize: 7, fontWeight: '900', marginTop: 1 },
  legendRow: { minHeight: 34, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: 10, paddingVertical: 4, borderTopWidth: 1, borderTopColor: '#1d2a33' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendLine: { width: 14, height: 3, borderRadius: 2 },
  legendText: { color: '#657783', fontSize: 6.2, fontWeight: '900' },

  infoGrid: { flexDirection: 'row', gap: 8, marginTop: 8 },
  queuePanel: { flex: 1.18, minHeight: 83, backgroundColor: '#0d161d', borderWidth: 1, borderColor: '#263640', borderRadius: 8, padding: 8 },
  platformPanel: { flex: 0.82, minHeight: 83, backgroundColor: '#0d161d', borderWidth: 1, borderColor: '#263640', borderRadius: 8, padding: 8 },
  panelTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
  panelLabel: { color: '#647986', fontSize: 6.8, fontWeight: '900' },
  panelCount: { color: '#dce7ec', fontSize: 10, fontWeight: '900' },
  emptyText: { color: '#52636e', fontSize: 9, fontWeight: '700', paddingTop: 9 },
  queueRow: { flexDirection: 'row', alignItems: 'center', minHeight: 23, borderTopWidth: 1, borderTopColor: '#17242d' },
  queuePos: { width: 18, color: '#5e717d', fontSize: 8, fontWeight: '900' },
  queueTrain: { flex: 1, color: '#dce7ec', fontSize: 9, fontWeight: '900' },
  queueTarget: { color: '#58b9ff', fontSize: 8, fontWeight: '900', marginRight: 7 },
  queueWait: { color: '#7f919c', fontSize: 8, fontWeight: '900' },
  queueWaitLate: { color: '#ff7182' },
  platformMiniRow: { flexDirection: 'row', gap: 4, paddingTop: 7 },
  platformMini: { flex: 1, minHeight: 39, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0a1218', borderWidth: 1, borderColor: '#253640', borderRadius: 5 },
  platformMiniOccupied: { backgroundColor: '#23151a', borderColor: '#5b2d38' },
  platformMiniLabel: { color: '#899ba6', fontSize: 8, fontWeight: '900' },
  platformMiniStatus: { color: '#527065', fontSize: 6.5, fontWeight: '900', marginTop: 3 },
  platformMiniStatusOccupied: { color: '#ff7182' },

  statusStrip: { minHeight: 35, flexDirection: 'row', alignItems: 'center', marginTop: 8, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#091117', borderWidth: 1, borderColor: '#1d2b34', borderRadius: 7 },
  statusLamp: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#72808a', marginRight: 8 },
  statusLampBlue: { backgroundColor: '#58b9ff' },
  statusLampGreen: { backgroundColor: '#38e27d' },
  statusText: { flex: 1, color: '#9babb5', fontSize: 9, lineHeight: 12, fontWeight: '700' },

  controlsBlock: { marginTop: 9 },
  controlsLabel: { color: '#60727e', fontSize: 7, fontWeight: '900', letterSpacing: 1, marginBottom: 6, textAlign: 'center' },
  routeRow: { flexDirection: 'row', width: '100%', gap: 6 },
  routeButton: { flex: 1, minHeight: 55, alignItems: 'center', justifyContent: 'center', backgroundColor: '#111c23', borderWidth: 1, borderColor: '#40505a', borderRadius: 7 },
  routeButtonTarget: { borderColor: '#58b9ff', backgroundColor: '#10202a' },
  routeButtonConflict: { borderColor: '#ff5968', backgroundColor: '#24161a' },
  routeButtonDisabled: { opacity: 0.34 },
  routeButtonSmall: { color: '#748691', fontSize: 6.5, fontWeight: '900', letterSpacing: 1 },
  routeButtonBig: { color: '#e7eff3', fontSize: 19, fontWeight: '900', marginTop: 2 },

  departureArea: { marginTop: 12, paddingBottom: 10 },
  departureRow: { flexDirection: 'row', gap: 6 },
  departureButton: { flex: 1, minHeight: 56, alignItems: 'center', justifyContent: 'center', backgroundColor: '#10212a', borderWidth: 2, borderColor: '#66d8ff', borderRadius: 8 },
  departureButtonConflict: { backgroundColor: '#24161a', borderColor: '#ff5968' },
  departureSmall: { color: '#80b6ca', fontSize: 7, fontWeight: '900' },
  departureBig: { color: '#9be7ff', fontSize: 12, fontWeight: '900', marginTop: 2 },
  noDeparture: { minHeight: 42, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0a1218', borderWidth: 1, borderColor: '#1e2d36', borderRadius: 7 },
  noDepartureText: { color: '#52636e', fontSize: 8, fontWeight: '800' },

  footer: { alignItems: 'center', paddingVertical: 7, paddingHorizontal: 8, borderTopWidth: 1, borderTopColor: '#14212a' },
  footerText: { color: '#42535e', fontSize: 6.5, fontWeight: '900', textAlign: 'center' },
});