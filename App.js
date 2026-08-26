import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

const ROUTES = [1, 2, 3];
const TRACK_Y = { 1: 55, 2: 130, 3: 205 };
const BASE_Y = 130;
const DWELL_SECONDS = 6;

const routePath = (lane) => {
  if (lane === 1) return 'M 18 130 H 130 L 205 55 H 315';
  if (lane === 2) return 'M 18 130 H 315';
  return 'M 18 130 H 130 L 205 205 H 315';
};

function Signal({ x, y, green = false, label }) {
  return (
    <>
      <Line x1={x} y1={y + 9} x2={x} y2={y + 25} stroke="#74808b" strokeWidth="3" />
      <Rect x={x - 8} y={y - 11} width="16" height="22" rx="5" fill="#101820" stroke="#697580" strokeWidth="2" />
      <Circle cx={x} cy={y - 4} r="4.7" fill={green ? '#38e27d' : '#ff4d5f'} />
      <Circle cx={x} cy={y + 5} r="2.7" fill="#26313b" />
      {label ? (
        <SvgText x={x - 13} y={y + 38} fill="#71808d" fontSize="9" fontWeight="700">
          {label}
        </SvgText>
      ) : null}
    </>
  );
}

function DispatcherTableau({
  selectedLane,
  targetLane,
  trainProgress,
  boardSize,
  onLayout,
  trainId,
  roundState,
  occupiedLane,
  trainVisible,
}) {
  const scaleX = boardSize.width / 360 || 1;
  const scaleY = boardSize.height / 260 || 1;
  const movementLane = selectedLane || occupiedLane || targetLane || 2;
  const targetY = TRACK_Y[movementLane];
  const activeRoute = roundState === 'running' || roundState === 'departing' ? movementLane : null;

  const trainX = trainProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [22 * scaleX - 22, 286 * scaleX - 22],
  });

  const trainY = trainProgress.interpolate({
    inputRange: [0, 0.36, 0.68, 1],
    outputRange: [
      BASE_Y * scaleY - 12,
      BASE_Y * scaleY - 12,
      targetY * scaleY - 12,
      targetY * scaleY - 12,
    ],
  });

  const statusText = {
    waiting: 'AANKOMST — RIJWEG INSTELLEN',
    running: 'AANKOMST — TREINBEWEGING',
    dwelling: 'PERRON BEZET — HALTEERTIJD',
    departureReady: 'VERTREK GEREED',
    departing: 'UITRIJDEN — TREINBEWEGING',
    feedback: 'AFHANDELING',
  }[roundState] || 'TREINDIENST';

  return (
    <View style={styles.tableauFrame}>
      <View style={styles.tableauHeader}>
        <Text style={styles.tableauTitle}>POST RAIL RUSH — SPOORPLAN</Text>
        <Text style={styles.tableauStatus}>{statusText}</Text>
      </View>

      <View style={styles.svgArea} onLayout={(event) => onLayout(event.nativeEvent.layout)}>
        <Svg width="100%" height="100%" viewBox="0 0 360 260">
          <Rect x="1" y="1" width="358" height="258" rx="10" fill="#081016" stroke="#26343f" strokeWidth="2" />

          {ROUTES.map((lane) => (
            <Path
              key={`base-${lane}`}
              d={routePath(lane)}
              fill="none"
              stroke="#49555f"
              strokeWidth="5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}

          {occupiedLane ? (
            <Line
              x1="214"
              y1={TRACK_Y[occupiedLane]}
              x2="315"
              y2={TRACK_Y[occupiedLane]}
              stroke="#ff4d6d"
              strokeWidth="9"
              strokeLinecap="round"
            />
          ) : null}

          {activeRoute ? (
            <Path
              d={routePath(activeRoute)}
              fill="none"
              stroke="#ffd65a"
              strokeWidth="7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          <Circle cx="130" cy="130" r="8" fill="#0b151d" stroke={activeRoute ? '#ffd65a' : '#93a0aa'} strokeWidth="3" />
          <Circle cx="205" cy="55" r="5" fill="#0b151d" stroke="#7f8b96" strokeWidth="2" />
          <Circle cx="205" cy="205" r="5" fill="#0b151d" stroke="#7f8b96" strokeWidth="2" />
          <SvgText x="115" y="114" fill="#83919d" fontSize="10" fontWeight="700">W1</SvgText>

          <Signal x={69} y={102} green={roundState === 'running'} label="S1" />

          {ROUTES.map((lane) => (
            <Signal
              key={`departure-signal-${lane}`}
              x={239}
              y={TRACK_Y[lane] - 23}
              green={roundState === 'departing' && occupiedLane === lane}
              label={`D${lane}`}
            />
          ))}

          {ROUTES.map((lane) => (
            <React.Fragment key={`label-${lane}`}>
              <Rect x="326" y={TRACK_Y[lane] - 14} width="27" height="28" rx="5" fill="#101b23" stroke="#364650" />
              <SvgText x="339.5" y={TRACK_Y[lane] + 5} fill="#e8eef2" fontSize="13" fontWeight="800" textAnchor="middle">
                {lane}
              </SvgText>
            </React.Fragment>
          ))}

          {roundState === 'waiting' || roundState === 'running' ? (
            <Circle cx="343" cy={TRACK_Y[targetLane] - 22} r="5" fill="#58b9ff" />
          ) : null}

          <SvgText x="18" y="153" fill="#71808d" fontSize="9" fontWeight="700">WEST</SvgText>
          <SvgText x="288" y="239" fill="#71808d" fontSize="9" fontWeight="700">PERRONS</SvgText>
        </Svg>

        {boardSize.width > 0 && trainVisible ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.trainBlock,
              {
                transform: [{ translateX: trainX }, { translateY: trainY }],
              },
            ]}
          >
            <Text style={styles.trainBlockId}>{trainId}</Text>
            <Text style={styles.trainBlockDest}>
              {roundState === 'departing' ? '← WEST' : `P${movementLane}`}
            </Text>
          </Animated.View>
        ) : null}
      </View>

      <View style={styles.legendRow}>
        <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: '#ff4d5f' }]} /><Text style={styles.legendText}>STOP</Text></View>
        <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: '#38e27d' }]} /><Text style={styles.legendText}>VEILIG</Text></View>
        <View style={styles.legendItem}><View style={[styles.legendLine, { backgroundColor: '#ffd65a' }]} /><Text style={styles.legendText}>RIJWEG</Text></View>
        <View style={styles.legendItem}><View style={[styles.legendLine, { backgroundColor: '#ff4d6d' }]} /><Text style={styles.legendText}>BEZET</Text></View>
      </View>
    </View>
  );
}

export default function App() {
  const [phase, setPhase] = useState('menu');
  const [targetLane, setTargetLane] = useState(2);
  const [selectedLane, setSelectedLane] = useState(null);
  const [occupiedLane, setOccupiedLane] = useState(null);
  const [score, setScore] = useState(0);
  const [coins, setCoins] = useState(0);
  const [lives, setLives] = useState(3);
  const [combo, setCombo] = useState(0);
  const [message, setMessage] = useState('');
  const [roundState, setRoundState] = useState('waiting');
  const [trainId, setTrainId] = useState('IC 284');
  const [trainVisible, setTrainVisible] = useState(false);
  const [dwellSeconds, setDwellSeconds] = useState(DWELL_SECONDS);
  const [boardSize, setBoardSize] = useState({ width: 0, height: 0 });

  const trainProgress = useRef(new Animated.Value(0)).current;
  const selectedLaneRef = useRef(null);
  const targetLaneRef = useRef(2);
  const occupiedLaneRef = useRef(null);
  const scoreRef = useRef(0);
  const livesRef = useRef(3);
  const comboRef = useRef(0);
  const trainIdRef = useRef('IC 284');
  const roundTimer = useRef(null);
  const dwellTimer = useRef(null);
  const animationRef = useRef(null);
  const trainSequence = useRef(284);

  const clearTimers = () => {
    if (roundTimer.current) clearTimeout(roundTimer.current);
    if (dwellTimer.current) clearInterval(dwellTimer.current);
    roundTimer.current = null;
    dwellTimer.current = null;
  };

  useEffect(() => {
    return () => {
      clearTimers();
      if (animationRef.current) animationRef.current.stop();
    };
  }, []);

  const pickTarget = () => Math.floor(Math.random() * 3) + 1;

  const startArrival = () => {
    clearTimers();
    if (animationRef.current) animationRef.current.stop();

    const nextTarget = pickTarget();
    trainSequence.current += Math.random() > 0.5 ? 2 : 4;
    const nextId = `IC ${trainSequence.current}`;

    targetLaneRef.current = nextTarget;
    selectedLaneRef.current = null;
    occupiedLaneRef.current = null;
    trainIdRef.current = nextId;

    setTargetLane(nextTarget);
    setSelectedLane(null);
    setOccupiedLane(null);
    setTrainId(nextId);
    setTrainVisible(true);
    setRoundState('waiting');
    setDwellSeconds(DWELL_SECONDS);
    setMessage(`${nextId} meldt zich uit WEST. Stel de aankomstrijweg in.`);
    trainProgress.setValue(0);
  };

  const beginDwell = (lane) => {
    setSelectedLane(null);
    selectedLaneRef.current = null;
    setRoundState('dwelling');
    setDwellSeconds(DWELL_SECONDS);
    setMessage(`${trainIdRef.current} staat op P${lane}. Spoor bezet — reizigerswisseling.`);

    let remaining = DWELL_SECONDS;
    dwellTimer.current = setInterval(() => {
      remaining -= 1;
      setDwellSeconds(Math.max(remaining, 0));
      if (remaining <= 0) {
        clearInterval(dwellTimer.current);
        dwellTimer.current = null;
        setRoundState('departureReady');
        setMessage(`${trainIdRef.current} is gereed voor vertrek. Stel uitrijweg P${lane} → WEST in.`);
      }
    }, 1000);
  };

  const resolveArrival = () => {
    const chosenLane = selectedLaneRef.current;
    const correct = chosenLane === targetLaneRef.current;

    occupiedLaneRef.current = chosenLane;
    setOccupiedLane(chosenLane);

    if (correct) {
      const nextCombo = comboRef.current + 1;
      const gained = 10 + Math.min(50, nextCombo * 3);
      const nextScore = scoreRef.current + gained;
      comboRef.current = nextCombo;
      scoreRef.current = nextScore;
      setCombo(nextCombo);
      setScore(nextScore);
      setCoins((value) => value + 1);
      setMessage(`${trainIdRef.current} correct binnen op P${chosenLane}. +${gained}`);
      roundTimer.current = setTimeout(() => beginDwell(chosenLane), 650);
      return;
    }

    const nextLives = livesRef.current - 1;
    livesRef.current = nextLives;
    comboRef.current = 0;
    setLives(nextLives);
    setCombo(0);
    setMessage(`Verkeerd perron: ${trainIdRef.current} staat op P${chosenLane}, gepland was P${targetLaneRef.current}.`);

    if (nextLives <= 0) {
      roundTimer.current = setTimeout(() => setPhase('gameover'), 1200);
    } else {
      roundTimer.current = setTimeout(() => beginDwell(chosenLane), 900);
    }
  };

  const chooseArrivalRoute = (lane) => {
    if (phase !== 'playing' || roundState !== 'waiting') return;

    selectedLaneRef.current = lane;
    setSelectedLane(lane);
    setRoundState('running');
    setMessage(`Rijweg WEST → P${lane} ingesteld. Inrijsein S1 veilig.`);

    const duration = Math.max(1500, 3000 - Math.floor(scoreRef.current / 10) * 30);
    roundTimer.current = setTimeout(() => {
      const animation = Animated.timing(trainProgress, {
        toValue: 1,
        duration,
        useNativeDriver: true,
      });
      animationRef.current = animation;
      animation.start(({ finished }) => {
        if (finished) resolveArrival();
      });
    }, 220);
  };

  const dispatchDeparture = () => {
    if (phase !== 'playing' || roundState !== 'departureReady' || !occupiedLaneRef.current) return;

    const lane = occupiedLaneRef.current;
    selectedLaneRef.current = lane;
    setSelectedLane(lane);
    setRoundState('departing');
    setMessage(`Uitrijweg P${lane} → WEST ingesteld. Sein D${lane} veilig.`);

    const animation = Animated.timing(trainProgress, {
      toValue: 0,
      duration: 2200,
      useNativeDriver: true,
    });
    animationRef.current = animation;
    animation.start(({ finished }) => {
      if (!finished) return;
      occupiedLaneRef.current = null;
      selectedLaneRef.current = null;
      setOccupiedLane(null);
      setSelectedLane(null);
      setTrainVisible(false);
      setRoundState('feedback');
      setMessage(`${trainIdRef.current} is uitgereden. Perronspoor weer vrij.`);
      roundTimer.current = setTimeout(startArrival, 650);
    });
  };

  const startGame = () => {
    clearTimers();
    if (animationRef.current) animationRef.current.stop();

    scoreRef.current = 0;
    livesRef.current = 3;
    comboRef.current = 0;
    occupiedLaneRef.current = null;
    selectedLaneRef.current = null;
    trainSequence.current = 280;

    setScore(0);
    setCoins(0);
    setLives(3);
    setCombo(0);
    setSelectedLane(null);
    setOccupiedLane(null);
    setTrainVisible(false);
    setMessage('');
    setPhase('playing');
    roundTimer.current = setTimeout(startArrival, 100);
  };

  if (phase === 'menu') {
    return (
      <SafeAreaView style={styles.screen}>
        <StatusBar barStyle="light-content" />
        <View style={styles.menuWrap}>
          <View style={styles.brandPlate}>
            <Text style={styles.kicker}>TREINDIENSTLEIDING / DISPATCHER PANEL</Text>
            <Text style={styles.title}>RAIL{`\n`}RUSH HOUR</Text>
            <View style={styles.menuTrack}>
              <View style={styles.menuTrackLine} />
              <View style={styles.menuSwitchDot} />
              <View style={[styles.menuSignal, styles.menuSignalRed]} />
              <View style={[styles.menuSignal, styles.menuSignalGreen]} />
            </View>
            <Text style={styles.subtitle}>
              Haal treinen binnen, houd bezette perrons in de gaten en geef ze daarna weer vertrek naar WEST.
            </Text>
          </View>
          <Pressable style={styles.primaryButton} onPress={startGame}>
            <Text style={styles.primaryButtonText}>START DIENST</Text>
          </Pressable>
          <Text style={styles.tip}>aankomst • halteertijd • vertrek • spoorbezetting</Text>
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
            <View style={styles.resultDivider} />
            <Text style={styles.resultCoins}>DIENSTCOINS  {coins}</Text>
          </View>
          <Pressable style={styles.primaryButton} onPress={startGame}>
            <Text style={styles.primaryButtonText}>NIEUWE DIENST</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={() => setPhase('menu')}>
            <Text style={styles.secondaryButtonText}>HOOFDMENU</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const taskTitle = roundState === 'waiting' || roundState === 'running' ? 'AANKOMST' : 'TREIN AAN PERRON';
  const taskValue = roundState === 'waiting' || roundState === 'running'
    ? `${trainId} → P${targetLane}`
    : `${trainId}${occupiedLane ? ` • P${occupiedLane}` : ''}`;

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="light-content" />

      <View style={styles.hud}>
        <View style={styles.hudCell}>
          <Text style={styles.hudLabel}>SCORE</Text>
          <Text style={styles.hudValue}>{score}</Text>
        </View>
        <View style={[styles.hudCell, styles.hudCenter]}>
          <Text style={styles.hudLabel}>COMBO</Text>
          <Text style={styles.hudValue}>x{combo}</Text>
        </View>
        <View style={[styles.hudCell, styles.hudRight]}>
          <Text style={styles.hudLabel}>LEVENS</Text>
          <Text style={styles.lifeText}>{'●'.repeat(lives)}{'○'.repeat(3 - lives)}</Text>
        </View>
      </View>

      <View style={styles.content}>
        <DispatcherTableau
          selectedLane={selectedLane}
          targetLane={targetLane}
          trainProgress={trainProgress}
          boardSize={boardSize}
          onLayout={({ width, height }) => setBoardSize({ width, height })}
          trainId={trainId}
          roundState={roundState}
          occupiedLane={occupiedLane}
          trainVisible={trainVisible}
        />

        <View style={styles.orderPanel}>
          <View style={styles.orderTopRow}>
            <View style={styles.orderTextWrap}>
              <Text style={styles.orderLabel}>{taskTitle}</Text>
              <Text style={styles.orderTrain}>{taskValue}</Text>
            </View>
            {roundState === 'dwelling' ? (
              <View style={styles.countdownBox}>
                <Text style={styles.countdownLabel}>VERTREK IN</Text>
                <Text style={styles.countdownValue}>{dwellSeconds}s</Text>
              </View>
            ) : roundState === 'departureReady' ? (
              <View style={[styles.countdownBox, styles.readyBox]}>
                <Text style={styles.countdownLabel}>STATUS</Text>
                <Text style={styles.readyText}>GEREED</Text>
              </View>
            ) : (
              <View style={styles.targetBox}>
                <Text style={styles.targetLabel}>NAAR</Text>
                <Text style={styles.targetText}>{roundState === 'departing' ? 'WEST' : `P${targetLane}`}</Text>
              </View>
            )}
          </View>

          <View style={styles.statusStrip}>
            <View
              style={[
                styles.statusLamp,
                roundState === 'waiting' && styles.statusLampBlue,
                (roundState === 'running' || roundState === 'departing') && styles.statusLampGreen,
                roundState === 'dwelling' && styles.statusLampRed,
                roundState === 'departureReady' && styles.statusLampYellow,
              ]}
            />
            <Text style={styles.statusText}>{message}</Text>
          </View>
        </View>

        {roundState === 'waiting' ? (
          <View style={styles.controls}>
            <Text style={styles.controlsLabel}>STEL AANKOMSTRIJWEG IN</Text>
            <View style={styles.routeRow}>
              {ROUTES.map((lane) => (
                <Pressable key={lane} style={styles.routeButton} onPress={() => chooseArrivalRoute(lane)}>
                  <Text style={styles.routeButtonSmall}>ROUTE</Text>
                  <Text style={styles.routeButtonBig}>P{lane}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : roundState === 'departureReady' ? (
          <View style={styles.controls}>
            <Text style={styles.controlsLabel}>TREIN GEREED — STEL UITRIJWEG IN</Text>
            <Pressable style={styles.departureButton} onPress={dispatchDeparture}>
              <Text style={styles.departureSmall}>VERTREK</Text>
              <Text style={styles.departureBig}>P{occupiedLane} → WEST</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.controlsLocked}>
            <Text style={styles.controlsLockedText}>
              {roundState === 'dwelling'
                ? `P${occupiedLane} BEZET — HALTEERTIJD LOOPT`
                : roundState === 'departing'
                  ? `P${occupiedLane} → WEST • RIJWEG VERGRENDELD`
                  : 'RIJWEG VERGRENDELD'}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>COINS {coins}  •  POST RAIL RUSH  •  W1 / S1 / D1-D3</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#070d12' },
  content: { flex: 1, paddingHorizontal: 13 },
  menuWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 26 },
  brandPlate: { width: '100%', maxWidth: 420, alignItems: 'center', marginBottom: 30 },
  kicker: { color: '#79a8c7', fontSize: 10, fontWeight: '900', letterSpacing: 2.1, marginBottom: 12, textAlign: 'center' },
  title: { color: '#edf4f7', fontSize: 47, lineHeight: 45, fontWeight: '900', letterSpacing: -2, textAlign: 'center' },
  subtitle: { color: '#93a3ae', fontSize: 16, lineHeight: 23, textAlign: 'center', marginTop: 20, maxWidth: 360 },
  menuTrack: { width: 220, height: 38, marginTop: 21, justifyContent: 'center' },
  menuTrackLine: { height: 4, backgroundColor: '#72808a', width: '100%' },
  menuSwitchDot: { position: 'absolute', left: 82, width: 13, height: 13, borderRadius: 7, backgroundColor: '#ffd65a', borderWidth: 2, borderColor: '#15212a' },
  menuSignal: { position: 'absolute', width: 12, height: 12, borderRadius: 6, top: 13 },
  menuSignalRed: { right: 31, backgroundColor: '#ff4d5f' },
  menuSignalGreen: { right: 7, backgroundColor: '#38e27d' },
  primaryButton: { backgroundColor: '#ffd65a', minWidth: 230, paddingVertical: 16, paddingHorizontal: 24, alignItems: 'center', borderRadius: 9, borderWidth: 2, borderColor: '#ffe795' },
  primaryButtonText: { color: '#111820', fontWeight: '900', fontSize: 16, letterSpacing: 1.2 },
  secondaryButton: { paddingVertical: 13, paddingHorizontal: 24, marginTop: 7 },
  secondaryButtonText: { color: '#7f919d', fontWeight: '800', fontSize: 12, letterSpacing: 1 },
  tip: { color: '#53636f', fontSize: 11, fontWeight: '700', marginTop: 18 },
  gameOverTitle: { color: '#ff5968', fontSize: 42, fontWeight: '900', letterSpacing: -1, marginBottom: 20 },
  resultCard: { width: 230, alignItems: 'center', backgroundColor: '#0d151c', borderWidth: 1, borderColor: '#26343d', borderRadius: 10, paddingVertical: 18, marginBottom: 22 },
  resultLabel: { color: '#6f818d', fontSize: 9, fontWeight: '900', letterSpacing: 2 },
  resultScore: { color: '#edf4f7', fontSize: 38, fontWeight: '900', marginVertical: 3 },
  resultDivider: { width: 90, height: 1, backgroundColor: '#25333c', marginVertical: 9 },
  resultCoins: { color: '#ffd65a', fontSize: 12, fontWeight: '900', letterSpacing: 1 },

  hud: { flexDirection: 'row', paddingHorizontal: 18, paddingTop: 12, paddingBottom: 9, borderBottomWidth: 1, borderBottomColor: '#16232c' },
  hudCell: { flex: 1 },
  hudCenter: { alignItems: 'center' },
  hudRight: { alignItems: 'flex-end' },
  hudLabel: { color: '#5e707c', fontSize: 8, fontWeight: '900', letterSpacing: 1.5 },
  hudValue: { color: '#dfe9ee', fontSize: 18, fontWeight: '900', marginTop: 2 },
  lifeText: { color: '#ff5c68', fontSize: 17, fontWeight: '900', marginTop: 2, letterSpacing: 2 },

  tableauFrame: { marginTop: 12, backgroundColor: '#0a1218', borderWidth: 1, borderColor: '#263741', borderRadius: 12, overflow: 'hidden' },
  tableauHeader: { minHeight: 44, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#263741' },
  tableauTitle: { color: '#9eb0bb', fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  tableauStatus: { color: '#ffd65a', fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  svgArea: { height: 270, position: 'relative', overflow: 'hidden' },
  trainBlock: { position: 'absolute', left: 0, top: 0, width: 58, minHeight: 27, borderRadius: 4, backgroundColor: '#d9edf8', borderWidth: 2, borderColor: '#081016', paddingHorizontal: 3, paddingVertical: 2, alignItems: 'center', justifyContent: 'center' },
  trainBlockId: { color: '#0a141b', fontSize: 8, fontWeight: '900' },
  trainBlockDest: { color: '#31566c', fontSize: 7, fontWeight: '900', marginTop: 1 },
  legendRow: { minHeight: 34, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 14, borderTopWidth: 1, borderTopColor: '#1d2a33' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 7, height: 7, borderRadius: 4 },
  legendLine: { width: 15, height: 3, borderRadius: 2 },
  legendText: { color: '#657783', fontSize: 7, fontWeight: '900', letterSpacing: 0.7 },

  orderPanel: { marginTop: 10, backgroundColor: '#0d161d', borderWidth: 1, borderColor: '#263640', borderRadius: 10, overflow: 'hidden' },
  orderTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 11 },
  orderTextWrap: { flex: 1, paddingRight: 10 },
  orderLabel: { color: '#647986', fontSize: 8, fontWeight: '900', letterSpacing: 1.4 },
  orderTrain: { color: '#e7eff3', fontSize: 19, fontWeight: '900', marginTop: 3 },
  targetBox: { minWidth: 69, alignItems: 'center', backgroundColor: '#101e27', borderWidth: 1, borderColor: '#2b4454', borderRadius: 7, paddingHorizontal: 9, paddingVertical: 6 },
  targetLabel: { color: '#698291', fontSize: 7, fontWeight: '900', letterSpacing: 1.2 },
  targetText: { color: '#58b9ff', fontSize: 20, fontWeight: '900', marginTop: 1 },
  countdownBox: { minWidth: 77, alignItems: 'center', backgroundColor: '#24161a', borderWidth: 1, borderColor: '#5d2b36', borderRadius: 7, paddingHorizontal: 8, paddingVertical: 6 },
  countdownLabel: { color: '#a57c85', fontSize: 7, fontWeight: '900', letterSpacing: 1 },
  countdownValue: { color: '#ff7182', fontSize: 20, fontWeight: '900', marginTop: 1 },
  readyBox: { backgroundColor: '#231f10', borderColor: '#625827' },
  readyText: { color: '#ffd65a', fontSize: 14, fontWeight: '900', marginTop: 3 },
  statusStrip: { minHeight: 38, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13, paddingVertical: 8, backgroundColor: '#091117', borderTopWidth: 1, borderTopColor: '#1d2b34' },
  statusLamp: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#72808a', marginRight: 9 },
  statusLampBlue: { backgroundColor: '#58b9ff' },
  statusLampGreen: { backgroundColor: '#38e27d' },
  statusLampRed: { backgroundColor: '#ff4d6d' },
  statusLampYellow: { backgroundColor: '#ffd65a' },
  statusText: { flex: 1, color: '#9babb5', fontSize: 10, lineHeight: 14, fontWeight: '700' },

  controls: { paddingTop: 13, paddingBottom: 8, alignItems: 'center' },
  controlsLabel: { color: '#60727e', fontSize: 8, fontWeight: '900', letterSpacing: 1.6, marginBottom: 9 },
  routeRow: { flexDirection: 'row', width: '100%', gap: 8 },
  routeButton: { flex: 1, minHeight: 70, alignItems: 'center', justifyContent: 'center', backgroundColor: '#111c23', borderWidth: 1, borderColor: '#40505a', borderRadius: 8 },
  routeButtonSmall: { color: '#748691', fontSize: 7, fontWeight: '900', letterSpacing: 1.2 },
  routeButtonBig: { color: '#e7eff3', fontSize: 22, fontWeight: '900', marginTop: 3 },
  departureButton: { width: '100%', minHeight: 70, alignItems: 'center', justifyContent: 'center', backgroundColor: '#2a2410', borderWidth: 2, borderColor: '#ffd65a', borderRadius: 8 },
  departureSmall: { color: '#ad973a', fontSize: 8, fontWeight: '900', letterSpacing: 1.6 },
  departureBig: { color: '#ffe278', fontSize: 21, fontWeight: '900', marginTop: 3 },
  controlsLocked: { marginTop: 13, minHeight: 62, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0a1218', borderWidth: 1, borderColor: '#1e2d36', borderRadius: 8 },
  controlsLockedText: { color: '#586a75', fontSize: 9, fontWeight: '900', letterSpacing: 1, textAlign: 'center' },

  footer: { alignItems: 'center', paddingVertical: 9, borderTopWidth: 1, borderTopColor: '#14212a' },
  footerText: { color: '#42535e', fontSize: 8, fontWeight: '900', letterSpacing: 0.9 },
});
