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

function DispatcherTableau({ selectedLane, targetLane, trainProgress, boardSize, onLayout, trainId, roundState }) {
  const scaleX = boardSize.width / 360 || 1;
  const scaleY = boardSize.height / 260 || 1;
  const targetY = TRACK_Y[selectedLane || 2];

  const trainX = trainProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [22 * scaleX - 22, 304 * scaleX - 22],
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

  return (
    <View style={styles.tableauFrame}>
      <View style={styles.tableauHeader}>
        <Text style={styles.tableauTitle}>POST RAIL RUSH — SPOORPLAN</Text>
        <Text style={styles.tableauStatus}>
          {roundState === 'waiting' ? 'RIJWEG VRIJGEVEN' : roundState === 'running' ? 'TREINBEWEGING' : 'AFHANDELING'}
        </Text>
      </View>

      <View style={styles.svgArea} onLayout={(event) => onLayout(event.nativeEvent.layout)}>
        <Svg width="100%" height="100%" viewBox="0 0 360 260">
          <Rect x="1" y="1" width="358" height="258" rx="10" fill="#081016" stroke="#26343f" strokeWidth="2" />

          {/* Basis-spoorplan */}
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

          {/* Actieve rijweg */}
          {selectedLane ? (
            <Path
              d={routePath(selectedLane)}
              fill="none"
              stroke="#ffd65a"
              strokeWidth="7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {/* Wisselpunten */}
          <Circle cx="130" cy="130" r="8" fill="#0b151d" stroke={selectedLane ? '#ffd65a' : '#93a0aa'} strokeWidth="3" />
          <Circle cx="205" cy="55" r="5" fill="#0b151d" stroke="#7f8b96" strokeWidth="2" />
          <Circle cx="205" cy="205" r="5" fill="#0b151d" stroke="#7f8b96" strokeWidth="2" />
          <SvgText x="115" y="114" fill="#83919d" fontSize="10" fontWeight="700">W1</SvgText>

          {/* Inrijsein */}
          <Signal x={69} y={102} green={Boolean(selectedLane) && roundState === 'running'} label="S1" />

          {/* Perronseinen */}
          {ROUTES.map((lane) => (
            <Signal
              key={`signal-${lane}`}
              x={314}
              y={TRACK_Y[lane] - 23}
              green={selectedLane === lane && roundState === 'running'}
              label={`P${lane}`}
            />
          ))}

          {/* Perronlabels */}
          {ROUTES.map((lane) => (
            <React.Fragment key={`label-${lane}`}>
              <Rect x="326" y={TRACK_Y[lane] - 14} width="27" height="28" rx="5" fill="#101b23" stroke="#364650" />
              <SvgText x="339.5" y={TRACK_Y[lane] + 5} fill="#e8eef2" fontSize="13" fontWeight="800" textAnchor="middle">
                {lane}
              </SvgText>
            </React.Fragment>
          ))}

          {/* Doelmarkering */}
          <Circle cx="343" cy={TRACK_Y[targetLane] - 22} r="5" fill="#58b9ff" />
          <SvgText x="18" y="153" fill="#71808d" fontSize="9" fontWeight="700">IN</SvgText>
        </Svg>

        {boardSize.width > 0 ? (
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
            <Text style={styles.trainBlockDest}>→ P{targetLane}</Text>
          </Animated.View>
        ) : null}
      </View>

      <View style={styles.legendRow}>
        <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: '#ff4d5f' }]} /><Text style={styles.legendText}>STOP</Text></View>
        <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: '#38e27d' }]} /><Text style={styles.legendText}>VEILIG</Text></View>
        <View style={styles.legendItem}><View style={[styles.legendLine, { backgroundColor: '#ffd65a' }]} /><Text style={styles.legendText}>RIJWEG</Text></View>
      </View>
    </View>
  );
}

export default function App() {
  const [phase, setPhase] = useState('menu');
  const [targetLane, setTargetLane] = useState(2);
  const [selectedLane, setSelectedLane] = useState(null);
  const [score, setScore] = useState(0);
  const [coins, setCoins] = useState(0);
  const [lives, setLives] = useState(3);
  const [combo, setCombo] = useState(0);
  const [message, setMessage] = useState('');
  const [roundState, setRoundState] = useState('waiting');
  const [trainId, setTrainId] = useState('IC 284');
  const [boardSize, setBoardSize] = useState({ width: 0, height: 0 });

  const trainProgress = useRef(new Animated.Value(0)).current;
  const selectedLaneRef = useRef(null);
  const targetLaneRef = useRef(2);
  const scoreRef = useRef(0);
  const livesRef = useRef(3);
  const comboRef = useRef(0);
  const roundTimer = useRef(null);
  const animationRef = useRef(null);
  const trainSequence = useRef(284);

  useEffect(() => {
    return () => {
      if (roundTimer.current) clearTimeout(roundTimer.current);
      if (animationRef.current) animationRef.current.stop();
    };
  }, []);

  const pickTarget = () => Math.floor(Math.random() * 3) + 1;

  const startRound = () => {
    if (animationRef.current) animationRef.current.stop();
    const nextTarget = pickTarget();
    trainSequence.current += Math.random() > 0.5 ? 2 : 4;
    const nextId = `IC ${trainSequence.current}`;

    targetLaneRef.current = nextTarget;
    selectedLaneRef.current = null;
    setTargetLane(nextTarget);
    setSelectedLane(null);
    setTrainId(nextId);
    setRoundState('waiting');
    setMessage('Stel de rijweg in voor de aankomende trein.');
    trainProgress.setValue(0);
  };

  const resolveRound = () => {
    const correct = selectedLaneRef.current === targetLaneRef.current;
    setRoundState('feedback');

    if (correct) {
      const nextCombo = comboRef.current + 1;
      const gained = 10 + Math.min(50, nextCombo * 3);
      const nextScore = scoreRef.current + gained;
      comboRef.current = nextCombo;
      scoreRef.current = nextScore;
      setCombo(nextCombo);
      setScore(nextScore);
      setCoins((value) => value + 1);
      setMessage(`Rijweg correct — ${trainId} afgehandeld. +${gained}`);
      roundTimer.current = setTimeout(startRound, 850);
      return;
    }

    const nextLives = livesRef.current - 1;
    livesRef.current = nextLives;
    comboRef.current = 0;
    setLives(nextLives);
    setCombo(0);
    setMessage(`Verkeerde rijweg — ${trainId} moest naar P${targetLaneRef.current}.`);

    if (nextLives <= 0) {
      roundTimer.current = setTimeout(() => setPhase('gameover'), 950);
    } else {
      roundTimer.current = setTimeout(startRound, 1000);
    }
  };

  const chooseRoute = (lane) => {
    if (phase !== 'playing' || roundState !== 'waiting') return;

    selectedLaneRef.current = lane;
    setSelectedLane(lane);
    setRoundState('running');
    setMessage(`Rijweg naar P${lane} ingesteld — sein S1 veilig.`);

    const duration = Math.max(1450, 3000 - Math.floor(scoreRef.current / 10) * 35);
    roundTimer.current = setTimeout(() => {
      const animation = Animated.timing(trainProgress, {
        toValue: 1,
        duration,
        useNativeDriver: true,
      });
      animationRef.current = animation;
      animation.start(({ finished }) => {
        if (finished) resolveRound();
      });
    }, 260);
  };

  const startGame = () => {
    if (roundTimer.current) clearTimeout(roundTimer.current);
    if (animationRef.current) animationRef.current.stop();

    scoreRef.current = 0;
    livesRef.current = 3;
    comboRef.current = 0;
    trainSequence.current = 280;
    setScore(0);
    setCoins(0);
    setLives(3);
    setCombo(0);
    setSelectedLane(null);
    setMessage('');
    setPhase('playing');
    setTimeout(startRound, 80);
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
            <Text style={styles.subtitle}>Stel de rijweg in, bedien de seinen en stuur iedere trein naar het juiste perron.</Text>
          </View>
          <Pressable style={styles.primaryButton} onPress={startGame}>
            <Text style={styles.primaryButtonText}>START DIENST</Text>
          </Pressable>
          <Text style={styles.tip}>3 perronsporen • wisselstraat • rijwegseinen</Text>
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
        />

        <View style={styles.orderPanel}>
          <View style={styles.orderTopRow}>
            <View>
              <Text style={styles.orderLabel}>AANKOMENDE TREIN</Text>
              <Text style={styles.orderTrain}>{trainId}</Text>
            </View>
            <View style={styles.targetBox}>
              <Text style={styles.targetLabel}>NAAR</Text>
              <Text style={styles.targetText}>P{targetLane}</Text>
            </View>
          </View>
          <View style={styles.statusStrip}>
            <View style={[styles.statusLamp, roundState === 'running' ? styles.statusLampGreen : styles.statusLampAmber]} />
            <Text style={styles.statusText}>{message}</Text>
          </View>
        </View>

        <View style={styles.controlPanel}>
          <Text style={styles.controlTitle}>RIJWEG INSTELLEN</Text>
          <View style={styles.routeRow}>
            {ROUTES.map((lane) => {
              const active = selectedLane === lane;
              return (
                <Pressable
                  key={lane}
                  onPress={() => chooseRoute(lane)}
                  style={({ pressed }) => [
                    styles.routeButton,
                    active && styles.routeButtonActive,
                    roundState !== 'waiting' && !active && styles.routeButtonDisabled,
                    pressed && roundState === 'waiting' && styles.routeButtonPressed,
                  ]}
                >
                  <View style={[styles.routeLamp, active && styles.routeLampActive]} />
                  <Text style={[styles.routeSmall, active && styles.routeTextActive]}>ROUTE</Text>
                  <Text style={[styles.routeBig, active && styles.routeTextActive]}>P{lane}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.controlHint}>
            {roundState === 'waiting' ? `Kies het gevraagde perron P${targetLane}` : 'Rijweg vergrendeld tot de trein binnen is'}
          </Text>
        </View>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>DIENSTCOINS {coins}  •  RAIL RUSH CONTROL v0.2</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#060b0f',
  },
  content: {
    flex: 1,
    paddingHorizontal: 12,
  },
  menuWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 26,
  },
  brandPlate: {
    alignItems: 'center',
    width: '100%',
    maxWidth: 430,
  },
  kicker: {
    color: '#7d91a0',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2.1,
    marginBottom: 13,
    textAlign: 'center',
  },
  title: {
    color: '#edf3f6',
    fontSize: 48,
    lineHeight: 46,
    textAlign: 'center',
    fontWeight: '900',
    letterSpacing: -2,
  },
  subtitle: {
    color: '#8fa0ac',
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
    marginTop: 22,
    marginBottom: 32,
    maxWidth: 350,
  },
  menuTrack: {
    marginTop: 25,
    width: 220,
    height: 38,
    justifyContent: 'center',
  },
  menuTrackLine: {
    height: 4,
    backgroundColor: '#52616c',
    borderRadius: 2,
  },
  menuSwitchDot: {
    position: 'absolute',
    left: 103,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#ffd65a',
    borderWidth: 3,
    borderColor: '#1a252d',
  },
  menuSignal: {
    position: 'absolute',
    width: 11,
    height: 11,
    borderRadius: 6,
    top: 13,
  },
  menuSignalRed: { left: 14, backgroundColor: '#ff4d5f' },
  menuSignalGreen: { right: 14, backgroundColor: '#38e27d' },
  primaryButton: {
    backgroundColor: '#d7e0e5',
    borderRadius: 9,
    minWidth: 230,
    paddingVertical: 16,
    paddingHorizontal: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ffffff',
  },
  primaryButtonText: {
    color: '#071016',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  secondaryButton: {
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  secondaryButtonText: {
    color: '#7d8e9a',
    fontWeight: '800',
    letterSpacing: 1,
  },
  tip: {
    color: '#53636f',
    marginTop: 18,
    fontSize: 12,
  },
  hud: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#162129',
  },
  hudCell: { flex: 1 },
  hudCenter: { alignItems: 'center' },
  hudRight: { alignItems: 'flex-end' },
  hudLabel: {
    color: '#5f707c',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  hudValue: {
    color: '#e9eff2',
    fontSize: 19,
    fontWeight: '900',
    marginTop: 2,
  },
  lifeText: {
    color: '#ff6472',
    fontSize: 18,
    fontWeight: '900',
    marginTop: 2,
    letterSpacing: 2,
  },
  tableauFrame: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#25343e',
    backgroundColor: '#0a1116',
    borderRadius: 12,
    overflow: 'hidden',
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
  },
  tableauHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#1d2a33',
  },
  tableauTitle: {
    color: '#8697a3',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
  },
  tableauStatus: {
    color: '#ffd65a',
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1,
  },
  svgArea: {
    width: '100%',
    aspectRatio: 360 / 260,
    position: 'relative',
  },
  trainBlock: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 44,
    height: 24,
    borderRadius: 4,
    backgroundColor: '#58b9ff',
    borderWidth: 2,
    borderColor: '#bde3ff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#58b9ff',
    shadowOpacity: 0.35,
    shadowRadius: 8,
  },
  trainBlockId: {
    color: '#041019',
    fontSize: 7,
    lineHeight: 8,
    fontWeight: '900',
  },
  trainBlockDest: {
    color: '#041019',
    fontSize: 7,
    lineHeight: 8,
    fontWeight: '800',
  },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 18,
    paddingVertical: 7,
    borderTopWidth: 1,
    borderTopColor: '#1d2a33',
  },
  legendItem: { flexDirection: 'row', alignItems: 'center' },
  legendDot: { width: 7, height: 7, borderRadius: 4, marginRight: 5 },
  legendLine: { width: 14, height: 3, borderRadius: 2, marginRight: 5 },
  legendText: { color: '#61727e', fontSize: 8, fontWeight: '800', letterSpacing: 0.6 },
  orderPanel: {
    marginTop: 10,
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#25343e',
    backgroundColor: '#0b1319',
    overflow: 'hidden',
  },
  orderTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  orderLabel: { color: '#61727e', fontSize: 8, fontWeight: '900', letterSpacing: 1.2 },
  orderTrain: { color: '#e8eef2', fontSize: 20, fontWeight: '900', marginTop: 2 },
  targetBox: {
    minWidth: 62,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 7,
    backgroundColor: '#102332',
    borderWidth: 1,
    borderColor: '#28506b',
    alignItems: 'center',
  },
  targetLabel: { color: '#6b879a', fontSize: 7, fontWeight: '900', letterSpacing: 1 },
  targetText: { color: '#58b9ff', fontSize: 22, fontWeight: '900' },
  statusStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 34,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: '#071016',
    borderTopWidth: 1,
    borderTopColor: '#1b2932',
  },
  statusLamp: { width: 8, height: 8, borderRadius: 4, marginRight: 9 },
  statusLampGreen: { backgroundColor: '#38e27d' },
  statusLampAmber: { backgroundColor: '#ffd65a' },
  statusText: { flex: 1, color: '#92a1ab', fontSize: 11, fontWeight: '700' },
  controlPanel: {
    flex: 1,
    justifyContent: 'center',
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    paddingVertical: 10,
  },
  controlTitle: {
    color: '#61727e',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.5,
    textAlign: 'center',
    marginBottom: 8,
  },
  routeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  routeButton: {
    flex: 1,
    minHeight: 72,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#32434e',
    backgroundColor: '#101920',
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeButtonActive: {
    backgroundColor: '#3b3317',
    borderColor: '#ffd65a',
    borderWidth: 2,
  },
  routeButtonDisabled: { opacity: 0.42 },
  routeButtonPressed: { backgroundColor: '#17242c' },
  routeLamp: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ff4d5f',
    marginBottom: 4,
  },
  routeLampActive: { backgroundColor: '#38e27d' },
  routeSmall: { color: '#687985', fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  routeBig: { color: '#e0e8ec', fontSize: 22, fontWeight: '900', marginTop: -1 },
  routeTextActive: { color: '#ffe182' },
  controlHint: {
    color: '#5d6c77',
    textAlign: 'center',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 7,
  },
  footer: {
    alignItems: 'center',
    paddingBottom: 10,
    paddingTop: 3,
  },
  footerText: {
    color: '#43525d',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  gameOverTitle: {
    color: '#ff6875',
    fontSize: 43,
    fontWeight: '900',
    letterSpacing: -1,
    marginBottom: 24,
  },
  resultCard: {
    width: '100%',
    maxWidth: 300,
    backgroundColor: '#0d161c',
    borderWidth: 1,
    borderColor: '#293943',
    borderRadius: 11,
    alignItems: 'center',
    paddingVertical: 20,
    marginBottom: 24,
  },
  resultLabel: { color: '#687985', fontSize: 9, fontWeight: '900', letterSpacing: 1.5 },
  resultScore: { color: '#eef4f7', fontSize: 48, fontWeight: '900', marginVertical: 3 },
  resultDivider: { width: 90, height: 1, backgroundColor: '#25333c', marginVertical: 9 },
  resultCoins: { color: '#ffd65a', fontSize: 12, fontWeight: '900', letterSpacing: 1 },
});
