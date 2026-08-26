import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Pressable,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';

const { width } = Dimensions.get('window');
const LANES = [1, 2, 3];

export default function App() {
  const [phase, setPhase] = useState('menu');
  const [targetLane, setTargetLane] = useState(2);
  const [selectedLane, setSelectedLane] = useState(2);
  const [score, setScore] = useState(0);
  const [coins, setCoins] = useState(0);
  const [lives, setLives] = useState(3);
  const [combo, setCombo] = useState(0);
  const [message, setMessage] = useState('');

  const trainX = useRef(new Animated.Value(-80)).current;
  const selectedLaneRef = useRef(2);
  const targetLaneRef = useRef(2);
  const scoreRef = useRef(0);
  const livesRef = useRef(3);
  const nextRoundTimer = useRef(null);
  const animationRef = useRef(null);

  useEffect(() => {
    return () => {
      if (nextRoundTimer.current) clearTimeout(nextRoundTimer.current);
      if (animationRef.current) animationRef.current.stop();
    };
  }, []);

  const pickTarget = () => Math.floor(Math.random() * 3) + 1;

  const startRound = () => {
    const nextTarget = pickTarget();
    targetLaneRef.current = nextTarget;
    setTargetLane(nextTarget);
    setMessage('');
    trainX.setValue(-80);

    const duration = Math.max(1350, 3200 - scoreRef.current * 18);
    const animation = Animated.timing(trainX, {
      toValue: width + 70,
      duration,
      useNativeDriver: true,
    });

    animationRef.current = animation;
    animation.start(({ finished }) => {
      if (!finished) return;
      resolveRound();
    });
  };

  const resolveRound = () => {
    const correct = selectedLaneRef.current === targetLaneRef.current;

    if (correct) {
      const nextCombo = combo + 1;
      const gained = 10 + Math.min(40, nextCombo * 2);
      const nextScore = scoreRef.current + gained;
      scoreRef.current = nextScore;
      setScore(nextScore);
      setCoins((value) => value + 1);
      setCombo(nextCombo);
      setMessage(`✓ Goed! +${gained}`);
      nextRoundTimer.current = setTimeout(startRound, 650);
      return;
    }

    const nextLives = livesRef.current - 1;
    livesRef.current = nextLives;
    setLives(nextLives);
    setCombo(0);
    setMessage(`✕ Verkeerd spoor — trein moest naar ${targetLaneRef.current}`);

    if (nextLives <= 0) {
      nextRoundTimer.current = setTimeout(() => setPhase('gameover'), 750);
    } else {
      nextRoundTimer.current = setTimeout(startRound, 850);
    }
  };

  const startGame = () => {
    if (nextRoundTimer.current) clearTimeout(nextRoundTimer.current);
    if (animationRef.current) animationRef.current.stop();

    selectedLaneRef.current = 2;
    scoreRef.current = 0;
    livesRef.current = 3;
    setSelectedLane(2);
    setScore(0);
    setCoins(0);
    setLives(3);
    setCombo(0);
    setMessage('');
    setPhase('playing');

    nextRoundTimer.current = setTimeout(startRound, 300);
  };

  const changeSwitch = () => {
    if (phase !== 'playing') return;
    const next = selectedLaneRef.current === 3 ? 1 : selectedLaneRef.current + 1;
    selectedLaneRef.current = next;
    setSelectedLane(next);
  };

  if (phase === 'menu') {
    return (
      <SafeAreaView style={styles.screen}>
        <StatusBar barStyle="light-content" />
        <View style={styles.centered}>
          <Text style={styles.kicker}>ARCADE RAIL CONTROL</Text>
          <Text style={styles.title}>RAIL{`\n`}RUSH HOUR</Text>
          <Text style={styles.subtitle}>
            Zet de wissel op tijd en stuur iedere trein naar het juiste perron.
          </Text>
          <Pressable style={styles.primaryButton} onPress={startGame}>
            <Text style={styles.primaryButtonText}>START DIENST</Text>
          </Pressable>
          <Text style={styles.tip}>1 tik • 3 sporen • steeds sneller</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (phase === 'gameover') {
    return (
      <SafeAreaView style={styles.screen}>
        <StatusBar barStyle="light-content" />
        <View style={styles.centered}>
          <Text style={styles.kicker}>EINDE DIENST</Text>
          <Text style={styles.gameOverTitle}>GAME OVER</Text>
          <View style={styles.resultCard}>
            <Text style={styles.resultLabel}>SCORE</Text>
            <Text style={styles.resultScore}>{score}</Text>
            <Text style={styles.resultCoins}>🪙 {coins} verdiend</Text>
          </View>
          <Pressable style={styles.primaryButton} onPress={startGame}>
            <Text style={styles.primaryButtonText}>OPNIEUW</Text>
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
        <View>
          <Text style={styles.hudLabel}>SCORE</Text>
          <Text style={styles.hudValue}>{score}</Text>
        </View>
        <View style={styles.hudMiddle}>
          <Text style={styles.hudLabel}>COMBO</Text>
          <Text style={styles.hudValue}>x{combo}</Text>
        </View>
        <View style={styles.hudRight}>
          <Text style={styles.hudLabel}>LEVENS</Text>
          <Text style={styles.hudValue}>{'●'.repeat(lives)}{'○'.repeat(3 - lives)}</Text>
        </View>
      </View>

      <View style={styles.destinationCard}>
        <Text style={styles.destinationLabel}>VOLGENDE TREIN</Text>
        <Text style={styles.destinationText}>PERRON {targetLane}</Text>
      </View>

      <View style={styles.railYard}>
        {LANES.map((lane) => (
          <View key={lane} style={[styles.lane, lane === selectedLane && styles.activeLane]}>
            <View style={styles.railTop} />
            <View style={styles.sleepers} />
            <View style={styles.railBottom} />
            <View style={[styles.platformSign, lane === selectedLane && styles.platformSignActive]}>
              <Text style={styles.platformNumber}>{lane}</Text>
            </View>
          </View>
        ))}

        <Animated.View
          pointerEvents="none"
          style={[
            styles.train,
            {
              top: 28 + (selectedLane - 1) * 112,
              transform: [{ translateX: trainX }],
            },
          ]}
        >
          <View style={styles.trainTargetBadge}>
            <Text style={styles.trainTargetText}>{targetLane}</Text>
          </View>
          <Text style={styles.trainEmoji}>🚆</Text>
        </Animated.View>
      </View>

      <View style={styles.feedbackArea}>
        <Text style={styles.feedback}>{message || `Wissel staat naar spoor ${selectedLane}`}</Text>
      </View>

      <View style={styles.controls}>
        <Pressable style={styles.switchButton} onPress={changeSwitch}>
          <Text style={styles.switchSmall}>WISSEL</Text>
          <Text style={styles.switchBig}>{selectedLane} → {selectedLane === 3 ? 1 : selectedLane + 1}</Text>
          <Text style={styles.switchHint}>TIK</Text>
        </Pressable>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>🪙 {coins}   •   Stuur de trein naar perron {targetLane}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0b1118',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  kicker: {
    color: '#f0b429',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2.4,
    marginBottom: 14,
  },
  title: {
    color: '#ffffff',
    fontSize: 48,
    lineHeight: 47,
    textAlign: 'center',
    fontWeight: '900',
    letterSpacing: -2,
  },
  subtitle: {
    color: '#9aabba',
    fontSize: 17,
    lineHeight: 25,
    textAlign: 'center',
    marginTop: 22,
    marginBottom: 34,
    maxWidth: 340,
  },
  primaryButton: {
    backgroundColor: '#f0b429',
    borderRadius: 18,
    minWidth: 230,
    paddingVertical: 17,
    paddingHorizontal: 28,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#0b1118',
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: 1,
  },
  secondaryButton: {
    marginTop: 14,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  secondaryButtonText: {
    color: '#8fa2b3',
    fontWeight: '800',
  },
  tip: {
    color: '#617080',
    marginTop: 20,
    fontSize: 13,
  },
  hud: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 10,
  },
  hudMiddle: { alignItems: 'center' },
  hudRight: { alignItems: 'flex-end' },
  hudLabel: {
    color: '#617080',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  hudValue: {
    color: '#f7f9fb',
    fontSize: 20,
    fontWeight: '900',
    marginTop: 3,
  },
  destinationCard: {
    alignSelf: 'center',
    backgroundColor: '#16212b',
    borderWidth: 1,
    borderColor: '#263747',
    borderRadius: 15,
    paddingHorizontal: 28,
    paddingVertical: 11,
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 14,
  },
  destinationLabel: {
    color: '#6f8597',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.6,
  },
  destinationText: {
    color: '#f0b429',
    fontSize: 23,
    fontWeight: '900',
    marginTop: 2,
  },
  railYard: {
    height: 336,
    marginTop: 4,
    overflow: 'hidden',
  },
  lane: {
    height: 96,
    marginVertical: 8,
    justifyContent: 'center',
    opacity: 0.55,
  },
  activeLane: {
    opacity: 1,
    backgroundColor: '#0f1922',
  },
  railTop: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 36,
    height: 4,
    backgroundColor: '#9da5ad',
  },
  railBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 36,
    height: 4,
    backgroundColor: '#9da5ad',
  },
  sleepers: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 30,
    height: 36,
    borderTopWidth: 3,
    borderBottomWidth: 3,
    borderColor: '#48535d',
    borderStyle: 'dashed',
  },
  platformSign: {
    position: 'absolute',
    right: 15,
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#27333e',
    borderWidth: 2,
    borderColor: '#52616e',
  },
  platformSignActive: {
    backgroundColor: '#f0b429',
    borderColor: '#ffe092',
  },
  platformNumber: {
    color: '#101820',
    fontSize: 20,
    fontWeight: '900',
  },
  train: {
    position: 'absolute',
    left: 0,
    width: 78,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trainEmoji: {
    fontSize: 52,
  },
  trainTargetBadge: {
    position: 'absolute',
    top: -9,
    right: -2,
    zIndex: 2,
    width: 25,
    height: 25,
    borderRadius: 13,
    backgroundColor: '#f0b429',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff1bc',
  },
  trainTargetText: {
    color: '#101820',
    fontWeight: '900',
    fontSize: 13,
  },
  feedbackArea: {
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  feedback: {
    color: '#a9bac7',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  controls: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 10,
  },
  switchButton: {
    width: 184,
    height: 116,
    borderRadius: 30,
    backgroundColor: '#f0b429',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 5,
    borderColor: '#263747',
  },
  switchSmall: {
    color: '#3d321b',
    fontWeight: '900',
    fontSize: 11,
    letterSpacing: 2,
  },
  switchBig: {
    color: '#0b1118',
    fontSize: 30,
    fontWeight: '900',
    marginVertical: 2,
  },
  switchHint: {
    color: '#64501d',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2,
  },
  footer: {
    alignItems: 'center',
    paddingBottom: 14,
    paddingTop: 5,
  },
  footerText: {
    color: '#718392',
    fontSize: 12,
    fontWeight: '700',
  },
  gameOverTitle: {
    color: '#ffffff',
    fontSize: 46,
    fontWeight: '900',
    letterSpacing: -1.8,
  },
  resultCard: {
    width: 230,
    backgroundColor: '#16212b',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#263747',
    alignItems: 'center',
    marginVertical: 28,
    paddingVertical: 22,
  },
  resultLabel: {
    color: '#718392',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2,
  },
  resultScore: {
    color: '#f0b429',
    fontSize: 52,
    fontWeight: '900',
    marginVertical: 2,
  },
  resultCoins: {
    color: '#dce5ec',
    fontSize: 14,
    fontWeight: '700',
  },
});
