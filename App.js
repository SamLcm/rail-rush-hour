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
const WEST_IN_Y = 100;
const WEST_OUT_Y = 160;
const DWELL_SECONDS = 8;
const SPAWN_MS = 6500;

const arrivalPath = (lane) => {
  if (lane === 1) return 'M 18 100 H 105 L 205 55 H 315';
  if (lane === 2) return 'M 18 100 H 105 L 175 130 H 315';
  return 'M 18 100 H 105 L 205 205 H 315';
};

const departurePath = (lane) => {
  if (lane === 1) return 'M 315 55 H 220 L 110 160 H 18';
  if (lane === 2) return 'M 315 130 H 185 L 110 160 H 18';
  return 'M 315 205 H 220 L 110 160 H 18';
};

function Signal({ x, y, green = false, label }) {
  return (
    <>
      <Line x1={x} y1={y + 9} x2={x} y2={y + 24} stroke="#74808b" strokeWidth="3" />
      <Rect x={x - 8} y={y - 11} width="16" height="22" rx="5" fill="#101820" stroke="#697580" strokeWidth="2" />
      <Circle cx={x} cy={y - 4} r="4.7" fill={green ? '#38e27d' : '#ff4d5f'} />
      <Circle cx={x} cy={y + 5} r="2.7" fill="#26313b" />
      {label ? (
        <SvgText x={x - 13} y={y + 37} fill="#71808d" fontSize="8.5" fontWeight="700">
          {label}
        </SvgText>
      ) : null}
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
  const scaleX = boardSize.width / 360 || 1;
  const scaleY = boardSize.height / 260 || 1;

  const arrivalX = arrivalProgress.interpolate({
    inputRange: [0, 0.34, 0.68, 1],
    outputRange: [18 * scaleX - 25, 105 * scaleX - 25, 205 * scaleX - 25, 274 * scaleX - 25],
  });
  const arrivalY = arrivalProgress.interpolate({
    inputRange: [0, 0.34, 0.68, 1],
    outputRange: [
      WEST_IN_Y * scaleY - 14,
      WEST_IN_Y * scaleY - 14,
      (arrivalLane ? TRACK_Y[arrivalLane] : WEST_IN_Y) * scaleY - 14,
      (arrivalLane ? TRACK_Y[arrivalLane] : WEST_IN_Y) * scaleY - 14,
    ],
  });

  const departureX = departureProgress.interpolate({
    inputRange: [0, 0.34, 0.7, 1],
    outputRange: [274 * scaleX - 25, 220 * scaleX - 25, 110 * scaleX - 25, 18 * scaleX - 25],
  });
  const departureY = departureProgress.interpolate({
    inputRange: [0, 0.34, 0.7, 1],
    outputRange: [
      (departureLane ? TRACK_Y[departureLane] : WEST_OUT_Y) * scaleY - 14,
      (departureLane ? TRACK_Y[departureLane] : WEST_OUT_Y) * scaleY - 14,
      WEST_OUT_Y * scaleY - 14,
      WEST_OUT_Y * scaleY - 14,
    ],
  });

  let status = 'POST ACTIEF';
  if (arrivalTrain && departureTrain) status = 'AANKOMST + VERTREK';
  else if (arrivalTrain) status = 'AANKOMST IN BEWEGING';
  else if (departureTrain) status = 'VERTREK IN BEWEGING';
  else if (queueHead) status = 'TREIN WACHT OP RIJWEG';

  return (
    <View style={styles.tableauFrame}>
      <View style={styles.tableauHeader}>
        <Text style={styles.tableauTitle}>POST RAIL RUSH — DUBBELSPORIGE AANSLUITING</Text>
        <Text style={styles.tableauStatus}>{status}</Text>
      </View>

      <View style={styles.svgArea} onLayout={(event) => onLayout(event.nativeEvent.layout)}>
        <Svg width="100%" height="100%" viewBox="0 0 360 260">
          <Rect x="1" y="1" width="358" height="258" rx="10" fill="#081016" stroke="#26343f" strokeWidth="2" />

          <Line x1="18" y1={WEST_IN_Y} x2="105" y2={WEST_IN_Y} stroke="#56636d" strokeWidth="5" strokeLinecap="round" />
          <Line x1="18" y1={WEST_OUT_Y} x2="110" y2={WEST_OUT_Y} stroke="#56636d" strokeWidth="5" strokeLinecap="round" />

          {ROUTES.map((lane) => (
            <React.Fragment key={`base-${lane}`}>
              <Path d={arrivalPath(lane)} fill="none" stroke="#45525c" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
              <Path d={departurePath(lane)} fill="none" stroke="#45525c" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
            </React.Fragment>
          ))}

          {ROUTES.map((lane) => platforms[lane] ? (
            <Line
              key={`occupied-${lane}`}
              x1="232"
              y1={TRACK_Y[lane]}
              x2="315"
              y2={TRACK_Y[lane]}
              stroke="#ff4d6d"
              strokeWidth="9"
              strokeLinecap="round"
            />
          ) : null)}

          {arrivalTrain && arrivalLane ? (
            <Path d={arrivalPath(arrivalLane)} fill="none" stroke="#ffd65a" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
          ) : null}
          {departureTrain && departureLane ? (
            <Path d={departurePath(departureLane)} fill="none" stroke="#ffd65a" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
          ) : null}

          <Circle cx="105" cy={WEST_IN_Y} r="7" fill="#0b151d" stroke={arrivalTrain ? '#ffd65a' : '#93a0aa'} strokeWidth="3" />
          <SvgText x="90" y="84" fill="#83919d" fontSize="9" fontWeight="700">W1</SvgText>
          <Circle cx="110" cy={WEST_OUT_Y} r="7" fill="#0b151d" stroke={departureTrain ? '#ffd65a' : '#93a0aa'} strokeWidth="3" />
          <SvgText x="94" y="183" fill="#83919d" fontSize="9" fontWeight="700">W2</SvgText>

          <Signal x={62} y={73} green={Boolean(arrivalTrain)} label="S1" />
          <Signal x={62} y={187} green={Boolean(departureTrain)} label="S2" />

          {ROUTES.map((lane) => (
            <Signal
              key={`d-${lane}`}
              x={238}
              y={TRACK_Y[lane] - 23}
              green={Boolean(departureTrain) && departureLane === lane}
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

          {queueHead ? (
            <Circle cx="343" cy={TRACK_Y[queueHead.target] - 22} r="5" fill="#58b9ff" />
          ) : null}

          <SvgText x="14" y="90" fill="#6f808b" fontSize="8" fontWeight="800">WEST IN →</SvgText>
          <SvgText x="14" y="177" fill="#6f808b" fontSize="8" fontWeight="800">← WEST UIT</SvgText>
          <SvgText x="286" y="240" fill="#596b76" fontSize="8" fontWeight="800">PERRONS</SvgText>
        </Svg>

        {boardSize.width > 0 && ROUTES.map((lane) => {
          const train = platforms[lane];
          if (!train || (departureTrain && departureTrain.id === train.id)) return null;
          return (
            <TrainBlock
              key={train.id}
              id={train.id}
              detail={train.status === 'ready' ? 'GEREED' : `${train.remaining}s`}
              style={{
                position: 'absolute',
                left: 250 * scaleX - 29,
                top: TRACK_Y[lane] * scaleY - 14,
              }}
            />
          );
        })}

        {boardSize.width > 0 && arrivalTrain ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.trainBlock,
              styles.movingTrain,
              { transform: [{ translateX: arrivalX }, { translateY: arrivalY }] },
            ]}
          >
            <Text style={styles.trainBlockId}>{arrivalTrain.id}</Text>
            <Text style={styles.trainBlockDest}>→ P{arrivalLane}</Text>
          </Animated.View>
        ) : null}

        {boardSize.width > 0 && departureTrain ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.trainBlock,
              styles.movingTrain,
              { transform: [{ translateX: departureX }, { translateY: departureY }] },
            ]}
          >
            <Text style={styles.trainBlockId}>{departureTrain.id}</Text>
            <Text style={styles.trainBlockDest}>← WEST</Text>
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

  const createTrain = () => {
    trainSequence.current += Math.random() > 0.5 ? 2 : 4;
    return {
      id: `IC ${trainSequence.current}`,
      target: Math.floor(Math.random() * 3) + 1,
      wait: 0,
    };
  };

  useEffect(() => {
    if (phase !== 'playing') return undefined;

    const clock = setInterval(() => {
      setQueue((current) => {
        const updated = current.map((train) => ({ ...train, wait: train.wait + 1 }));
        const delayed = updated.filter((train) => train.wait > 5).length;
        if (delayed > 0) setTotalDelay((value) => value + delayed);
        return updated;
      });

      setPlatforms((current) => {
        let changed = false;
        const next = { ...current };
        ROUTES.forEach((lane) => {
          const train = current[lane];
          if (!train || train.status !== 'dwelling') return;
          changed = true;
          const remaining = Math.max(0, train.remaining - 1);
          next[lane] = {
            ...train,
            remaining,
            status: remaining === 0 ? 'ready' : 'dwelling',
          };
        });
        return changed ? next : current;
      });
    }, 1000);

    const spawner = setInterval(() => {
      setQueue((current) => [...current, createTrain()]);
    }, SPAWN_MS);

    return () => {
      clearInterval(clock);
      clearInterval(spawner);
    };
  }, [phase]);

  useEffect(() => () => {
    if (arrivalAnimation.current) arrivalAnimation.current.stop();
    if (departureAnimation.current) departureAnimation.current.stop();
  }, []);

  const setGameOverIfNeeded = (nextLives) => {
    if (nextLives <= 0) {
      setTimeout(() => setPhase('gameover'), 350);
      return true;
    }
    return false;
  };

  const chooseArrivalRoute = (lane) => {
    if (phase !== 'playing' || arrivalTrain || queue.length === 0 || platforms[lane]) return;

    const train = queue[0];
    setQueue((current) => current.slice(1));
    setArrivalTrain(train);
    setArrivalLane(lane);
    arrivalProgress.setValue(0);
    setMessage(`${train.id}: rijweg WEST IN → P${lane} ingesteld.`);

    const duration = Math.max(1300, 2500 - Math.floor(scoreRef.current / 70) * 90);
    const animation = Animated.timing(arrivalProgress, {
      toValue: 1,
      duration,
      useNativeDriver: true,
    });
    arrivalAnimation.current = animation;
    animation.start(({ finished }) => {
      if (!finished) return;

      const correct = lane === train.target;
      setPlatforms((current) => ({
        ...current,
        [lane]: { ...train, lane, status: 'dwelling', remaining: DWELL_SECONDS },
      }));
      setArrivalTrain(null);
      setArrivalLane(null);

      if (correct) {
        const nextCombo = comboRef.current + 1;
        const gained = 15 + Math.min(45, nextCombo * 3);
        comboRef.current = nextCombo;
        scoreRef.current += gained;
        setCombo(nextCombo);
        setScore(scoreRef.current);
        setCoins((value) => value + 1);
        setMessage(`${train.id} correct binnen op P${lane}. +${gained}`);
      } else {
        comboRef.current = 0;
        setCombo(0);
        const nextLives = livesRef.current - 1;
        livesRef.current = nextLives;
        setLives(nextLives);
        setMessage(`${train.id} staat op P${lane}; gepland was P${train.target}.`);
        setGameOverIfNeeded(nextLives);
      }
    });
  };

  const dispatchDeparture = (lane) => {
    if (phase !== 'playing' || departureTrain) return;
    const train = platforms[lane];
    if (!train || train.status !== 'ready') return;

    setDepartureTrain(train);
    setDepartureLane(lane);
    setPlatforms((current) => ({
      ...current,
      [lane]: { ...current[lane], status: 'departing' },
    }));
    departureProgress.setValue(0);
    setMessage(`${train.id}: uitrijweg P${lane} → WEST UIT ingesteld.`);

    const animation = Animated.timing(departureProgress, {
      toValue: 1,
      duration: 2000,
      useNativeDriver: true,
    });
    departureAnimation.current = animation;
    animation.start(({ finished }) => {
      if (!finished) return;
      setPlatforms((current) => ({ ...current, [lane]: null }));
      setDepartureTrain(null);
      setDepartureLane(null);
      scoreRef.current += 5;
      setScore(scoreRef.current);
      setMessage(`${train.id} is via WEST UIT vertrokken. P${lane} vrij. +5`);
    });
  };

  const startGame = () => {
    if (arrivalAnimation.current) arrivalAnimation.current.stop();
    if (departureAnimation.current) departureAnimation.current.stop();

    trainSequence.current = 280;
    scoreRef.current = 0;
    comboRef.current = 0;
    livesRef.current = 3;

    setScore(0);
    setCoins(0);
    setLives(3);
    setCombo(0);
    setTotalDelay(0);
    setPlatforms({ 1: null, 2: null, 3: null });
    setArrivalTrain(null);
    setArrivalLane(null);
    setDepartureTrain(null);
    setDepartureLane(null);
    setQueue([createTrain()]);
    setMessage('Post geopend. Eerste trein meldt zich op WEST IN.');
    setPhase('playing');
  };

  if (phase === 'menu') {
    return (
      <SafeAreaView style={styles.screen}>
        <StatusBar barStyle="light-content" />
        <View style={styles.menuWrap}>
          <View style={styles.brandPlate}>
            <Text style={styles.kicker}>MULTI-TRAIN DISPATCHER / V0.4</Text>
            <Text style={styles.title}>RAIL{`\n`}RUSH HOUR</Text>
            <View style={styles.menuTrack}>
              <View style={[styles.menuTrackLine, { top: 10 }]} />
              <View style={[styles.menuTrackLine, { top: 27 }]} />
              <View style={[styles.menuSignal, styles.menuSignalGreen]} />
              <View style={[styles.menuSignal, styles.menuSignalRed]} />
            </View>
            <Text style={styles.subtitle}>
              Regel meerdere treinen tegelijk. Houd perrons vrij, haal treinen binnen via WEST IN en laat gekeerde treinen vertrekken via WEST UIT.
            </Text>
          </View>
          <Pressable style={styles.primaryButton} onPress={startGame}>
            <Text style={styles.primaryButtonText}>START DIENST</Text>
          </Pressable>
          <Text style={styles.tip}>aankomst + vertrek • wachtrij • spoorbezetting • vertraging</Text>
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
            <Text style={styles.resultCoins}>COINS {coins}  •  VERTRAGING {totalDelay}s</Text>
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

  const queueHead = queue[0] || null;
  const readyLanes = ROUTES.filter((lane) => platforms[lane]?.status === 'ready');
  const occupiedCount = ROUTES.filter((lane) => Boolean(platforms[lane])).length;

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
        <View style={[styles.hudCell, styles.hudCenter]}>
          <Text style={styles.hudLabel}>VERTR.</Text>
          <Text style={styles.hudValue}>{totalDelay}s</Text>
        </View>
        <View style={[styles.hudCell, styles.hudRight]}>
          <Text style={styles.hudLabel}>LEVENS</Text>
          <Text style={styles.lifeText}>{'●'.repeat(lives)}{'○'.repeat(3 - lives)}</Text>
        </View>
      </View>

      <View style={styles.content}>
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
            <View style={styles.panelTitleRow}>
              <Text style={styles.panelLabel}>WEST IN — WACHTRIJ</Text>
              <Text style={styles.panelCount}>{queue.length}</Text>
            </View>
            {queue.length === 0 ? (
              <Text style={styles.emptyText}>Geen trein wacht</Text>
            ) : (
              queue.slice(0, 2).map((train, index) => (
                <View key={train.id} style={styles.queueRow}>
                  <Text style={styles.queuePos}>{index + 1}</Text>
                  <Text style={styles.queueTrain}>{train.id}</Text>
                  <Text style={styles.queueTarget}>→ P{train.target}</Text>
                  <Text style={[styles.queueWait, train.wait > 5 && styles.queueWaitLate]}>{train.wait}s</Text>
                </View>
              ))
            )}
            {queue.length > 2 ? <Text style={styles.moreText}>+ {queue.length - 2} meer</Text> : null}
          </View>

          <View style={styles.platformPanel}>
            <View style={styles.panelTitleRow}>
              <Text style={styles.panelLabel}>PERRONS BEZET</Text>
              <Text style={styles.panelCount}>{occupiedCount}/3</Text>
            </View>
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
          <Text style={styles.controlsLabel}>AANKOMST — STEL RIJWEG IN VOOR {queueHead ? `${queueHead.id} → P${queueHead.target}` : 'VOLGENDE TREIN'}</Text>
          <View style={styles.routeRow}>
            {ROUTES.map((lane) => {
              const occupied = Boolean(platforms[lane]);
              const disabled = !queueHead || Boolean(arrivalTrain) || occupied;
              const target = queueHead?.target === lane;
              return (
                <Pressable
                  key={lane}
                  disabled={disabled}
                  style={[
                    styles.routeButton,
                    target && styles.routeButtonTarget,
                    disabled && styles.routeButtonDisabled,
                  ]}
                  onPress={() => chooseArrivalRoute(lane)}
                >
                  <Text style={styles.routeButtonSmall}>{occupied ? 'BEZET' : target ? 'GEPLAND' : 'ROUTE'}</Text>
                  <Text style={styles.routeButtonBig}>P{lane}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.departureArea}>
          <Text style={styles.controlsLabel}>VERTREK — WEST UIT</Text>
          {readyLanes.length === 0 ? (
            <View style={styles.noDeparture}>
              <Text style={styles.noDepartureText}>{departureTrain ? `${departureTrain.id} rijdt uit` : 'Geen trein gereed voor vertrek'}</Text>
            </View>
          ) : (
            <View style={styles.departureRow}>
              {readyLanes.map((lane) => (
                <Pressable
                  key={lane}
                  disabled={Boolean(departureTrain)}
                  style={[styles.departureButton, departureTrain && styles.routeButtonDisabled]}
                  onPress={() => dispatchDeparture(lane)}
                >
                  <Text style={styles.departureSmall}>{platforms[lane].id}</Text>
                  <Text style={styles.departureBig}>P{lane} → WEST</Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>COINS {coins}  •  W1/S1 WEST IN  •  W2/S2 WEST UIT  •  D1–D3</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#070d12' },
  content: { flex: 1, paddingHorizontal: 11 },
  menuWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 26 },
  brandPlate: { width: '100%', maxWidth: 420, alignItems: 'center', marginBottom: 28 },
  kicker: { color: '#79a8c7', fontSize: 10, fontWeight: '900', letterSpacing: 2.1, marginBottom: 12, textAlign: 'center' },
  title: { color: '#edf4f7', fontSize: 47, lineHeight: 45, fontWeight: '900', letterSpacing: -2, textAlign: 'center' },
  subtitle: { color: '#93a3ae', fontSize: 16, lineHeight: 23, textAlign: 'center', marginTop: 18, maxWidth: 360 },
  menuTrack: { width: 220, height: 42, marginTop: 17, position: 'relative' },
  menuTrackLine: { position: 'absolute', left: 0, width: '100%', height: 4, backgroundColor: '#72808a' },
  menuSignal: { position: 'absolute', width: 12, height: 12, borderRadius: 6, right: 8 },
  menuSignalGreen: { top: 6, backgroundColor: '#38e27d' },
  menuSignalRed: { top: 23, backgroundColor: '#ff4d5f' },
  primaryButton: { backgroundColor: '#ffd65a', minWidth: 230, paddingVertical: 16, paddingHorizontal: 24, alignItems: 'center', borderRadius: 9, borderWidth: 2, borderColor: '#ffe795' },
  primaryButtonText: { color: '#111820', fontWeight: '900', fontSize: 16, letterSpacing: 1.2 },
  secondaryButton: { paddingVertical: 13, paddingHorizontal: 24, marginTop: 7 },
  secondaryButtonText: { color: '#7f919d', fontWeight: '800', fontSize: 12, letterSpacing: 1 },
  tip: { color: '#53636f', fontSize: 11, fontWeight: '700', marginTop: 18 },
  gameOverTitle: { color: '#ff5968', fontSize: 42, fontWeight: '900', letterSpacing: -1, marginBottom: 20 },
  resultCard: { width: 270, alignItems: 'center', backgroundColor: '#0d151c', borderWidth: 1, borderColor: '#26343d', borderRadius: 10, paddingVertical: 18, marginBottom: 22 },
  resultLabel: { color: '#6f818d', fontSize: 9, fontWeight: '900', letterSpacing: 2 },
  resultScore: { color: '#edf4f7', fontSize: 38, fontWeight: '900', marginVertical: 3 },
  resultDivider: { width: 110, height: 1, backgroundColor: '#25333c', marginVertical: 9 },
  resultCoins: { color: '#ffd65a', fontSize: 11, fontWeight: '900', letterSpacing: 0.6 },

  hud: { flexDirection: 'row', paddingHorizontal: 15, paddingTop: 10, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#16232c' },
  hudCell: { flex: 1 },
  hudCenter: { alignItems: 'center' },
  hudRight: { alignItems: 'flex-end' },
  hudLabel: { color: '#5e707c', fontSize: 7.5, fontWeight: '900', letterSpacing: 1.2 },
  hudValue: { color: '#dfe9ee', fontSize: 16, fontWeight: '900', marginTop: 2 },
  lifeText: { color: '#ff5c68', fontSize: 15, fontWeight: '900', marginTop: 2, letterSpacing: 1.5 },

  tableauFrame: { marginTop: 9, backgroundColor: '#0a1218', borderWidth: 1, borderColor: '#263741', borderRadius: 11, overflow: 'hidden' },
  tableauHeader: { minHeight: 39, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: '#263741' },
  tableauTitle: { color: '#9eb0bb', fontSize: 7.8, fontWeight: '900', letterSpacing: 0.8 },
  tableauStatus: { color: '#ffd65a', fontSize: 7.2, fontWeight: '900', letterSpacing: 0.7 },
  svgArea: { height: 245, position: 'relative', overflow: 'hidden' },
  trainBlock: { width: 58, minHeight: 28, borderRadius: 4, backgroundColor: '#d9edf8', borderWidth: 2, borderColor: '#081016', paddingHorizontal: 3, paddingVertical: 2, alignItems: 'center', justifyContent: 'center' },
  movingTrain: { position: 'absolute', left: 0, top: 0 },
  trainBlockId: { color: '#0a141b', fontSize: 8, fontWeight: '900' },
  trainBlockDest: { color: '#31566c', fontSize: 7, fontWeight: '900', marginTop: 1 },
  legendRow: { minHeight: 31, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 12, borderTopWidth: 1, borderTopColor: '#1d2a33' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 7, height: 7, borderRadius: 4 },
  legendLine: { width: 14, height: 3, borderRadius: 2 },
  legendText: { color: '#657783', fontSize: 6.5, fontWeight: '900', letterSpacing: 0.6 },

  infoGrid: { flexDirection: 'row', gap: 8, marginTop: 8 },
  queuePanel: { flex: 1.18, minHeight: 83, backgroundColor: '#0d161d', borderWidth: 1, borderColor: '#263640', borderRadius: 8, padding: 8 },
  platformPanel: { flex: 0.82, minHeight: 83, backgroundColor: '#0d161d', borderWidth: 1, borderColor: '#263640', borderRadius: 8, padding: 8 },
  panelTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
  panelLabel: { color: '#647986', fontSize: 6.8, fontWeight: '900', letterSpacing: 0.9 },
  panelCount: { color: '#dce7ec', fontSize: 10, fontWeight: '900' },
  emptyText: { color: '#52636e', fontSize: 9, fontWeight: '700', paddingTop: 9 },
  queueRow: { flexDirection: 'row', alignItems: 'center', minHeight: 23, borderTopWidth: 1, borderTopColor: '#17242d' },
  queuePos: { width: 18, color: '#5e717d', fontSize: 8, fontWeight: '900' },
  queueTrain: { flex: 1, color: '#dce7ec', fontSize: 9, fontWeight: '900' },
  queueTarget: { color: '#58b9ff', fontSize: 8, fontWeight: '900', marginRight: 7 },
  queueWait: { color: '#7f919c', fontSize: 8, fontWeight: '900' },
  queueWaitLate: { color: '#ff7182' },
  moreText: { color: '#657783', fontSize: 7.5, fontWeight: '800', marginTop: 3 },
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
  routeButtonDisabled: { opacity: 0.34 },
  routeButtonSmall: { color: '#748691', fontSize: 6.5, fontWeight: '900', letterSpacing: 1 },
  routeButtonBig: { color: '#e7eff3', fontSize: 19, fontWeight: '900', marginTop: 2 },

  departureArea: { marginTop: 8, paddingBottom: 5 },
  departureRow: { flexDirection: 'row', gap: 6 },
  departureButton: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: '#2a2410', borderWidth: 1.5, borderColor: '#ffd65a', borderRadius: 7 },
  departureSmall: { color: '#ad973a', fontSize: 6.5, fontWeight: '900', letterSpacing: 0.7 },
  departureBig: { color: '#ffe278', fontSize: 12, fontWeight: '900', marginTop: 2 },
  noDeparture: { minHeight: 38, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0a1218', borderWidth: 1, borderColor: '#1e2d36', borderRadius: 7 },
  noDepartureText: { color: '#52636e', fontSize: 8, fontWeight: '800' },

  footer: { alignItems: 'center', paddingVertical: 7, borderTopWidth: 1, borderTopColor: '#14212a' },
  footerText: { color: '#42535e', fontSize: 7, fontWeight: '900', letterSpacing: 0.7 },
});