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
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  Line,
  LinearGradient,
  Path,
  Polygon,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';

const DESTINATIONS = [
  { id: 'noorddam', name: 'Noorddam', code: 'NDR', fare: 1, unlock: 1, color: '#4aa8ff' },
  { id: 'havenstad', name: 'Havenstad', code: 'HVN', fare: 2, unlock: 1, color: '#43d88e' },
  { id: 'oostpoort', name: 'Oostpoort', code: 'OOS', fare: 3, unlock: 2, color: '#ffad55' },
  { id: 'luchthaven', name: 'Luchthaven', code: 'AIR', fare: 4, unlock: 3, color: '#b38cff' },
];

const TRAIN_TYPES = [
  { code: 'SPR', name: 'Sprinter', setCapacity: 180, dwell: 7, visualWidth: 96 },
  { code: 'IC', name: 'Intercity', setCapacity: 260, dwell: 9, visualWidth: 112 },
  { code: 'EXP', name: 'Express', setCapacity: 340, dwell: 11, visualWidth: 126 },
];

const SAVE_KEY = 'rail-rush-hour-v019';
const LEGACY_SAVE_KEY = 'rail-rush-hour-v018';
const TICK_MS = 1000;
const SERVICE_INTERVAL = 17;
const DELAY_MARGIN = 12;
const ARRIVAL_MS = 2800;
const DEPARTURE_MS = 3100;

const WORLD_WIDTH = 1500;
const WORLD_HEIGHT = 1040;
const ISO = 0.14;
const PLATFORM_X = 610;
const PLATFORM_LENGTH = 720;
const TRAIN_X = 725;
const LANE_Y = { 1: 225, 2: 345, 3: 465 };

const money = (value) => `€${Math.max(0, Math.round(value)).toLocaleString('nl-NL')}`;
const sum = (obj) => Object.values(obj).reduce((a, b) => a + b, 0);
const pct = (value, max) => Math.max(0, Math.min(100, Math.round((value / Math.max(1, max)) * 100)));
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
const emptyDemand = () => ({ noorddam: 0, havenstad: 0, oostpoort: 0, luchthaven: 0 });

const clock = (seconds) => {
  const total = 8 * 3600 + Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600) % 24;
  const m = Math.floor((total % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

const safeLoad = () => {
  try {
    if (!globalThis?.localStorage) return null;
    const current = globalThis.localStorage.getItem(SAVE_KEY);
    if (current) return JSON.parse(current);
    const legacy = globalThis.localStorage.getItem(LEGACY_SAVE_KEY);
    return legacy ? JSON.parse(legacy) : null;
  } catch {
    return null;
  }
};

const safeSave = (data) => {
  try {
    if (globalThis?.localStorage) globalThis.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    // Optional for the web prototype.
  }
};

const isoStrip = (x, y, w, d) =>
  `${x},${y} ${x + w},${y - w * ISO} ${x + w + d},${y - w * ISO + d * 0.72} ${x + d},${y + d * 0.72}`;

function Tree({ x, y, scale = 1 }) {
  return (
    <G>
      <Ellipse cx={x + 5 * scale} cy={y + 8 * scale} rx={9 * scale} ry={3.5 * scale} fill="#47673d" opacity="0.28" />
      <Rect x={x - 1.4 * scale} y={y} width={2.8 * scale} height={9 * scale} fill="#755035" />
      <Circle cx={x} cy={y - 5 * scale} r={7.5 * scale} fill="#2f7846" />
      <Circle cx={x - 5 * scale} cy={y - 1 * scale} r={5.4 * scale} fill="#3e9258" />
      <Circle cx={x + 5 * scale} cy={y - 1 * scale} r={5.7 * scale} fill="#27683c" />
      <Circle cx={x - 1 * scale} cy={y - 9 * scale} r={4.4 * scale} fill="#4aa164" />
    </G>
  );
}

function CarSvg({ x, y, color = '#4aa8ff' }) {
  return (
    <G>
      <Ellipse cx={x + 13} cy={y + 3} rx="12" ry="3.5" fill="#18292f" opacity="0.22" />
      <Polygon points={`${x},${y - 3} ${x + 14},${y - 7} ${x + 21},${y - 2} ${x + 6},${y + 2}`} fill={color} stroke="#eef5f6" strokeWidth="0.7" />
      <Polygon points={`${x + 5},${y - 4.5} ${x + 10},${y - 6} ${x + 15},${y - 3.1} ${x + 9},${y - 1.7}`} fill="#294d61" />
      <Circle cx={x + 5} cy={y + 1.5} r="1.5" fill="#26343a" />
      <Circle cx={x + 17} cy={y - 1} r="1.5" fill="#26343a" />
    </G>
  );
}

function PersonSvg({ x, y, color = '#567c90' }) {
  return (
    <G>
      <Ellipse cx={x + 1.4} cy={y + 9} rx="3" ry="1.3" fill="#38555f" opacity="0.18" />
      <Circle cx={x} cy={y} r="2.1" fill="#efc79d" />
      <Rect x={x - 2.1} y={y + 2} width="4.2" height="6.2" rx="1.2" fill={color} />
      <Line x1={x - 1} y1={y + 8} x2={x - 1.5} y2={y + 11} stroke="#374b55" strokeWidth="0.8" />
      <Line x1={x + 1} y1={y + 8} x2={x + 1.5} y2={y + 11} stroke="#374b55" strokeWidth="0.8" />
    </G>
  );
}

function ZoneMeter({ x, y, title, value, max, hot, accent = '#58b9ee' }) {
  const p = pct(value, max);
  return (
    <G>
      <Rect x={x + 2} y={y + 3} width="104" height="33" rx="7" fill="#0b1419" opacity="0.2" />
      <Rect x={x} y={y} width="104" height="33" rx="7" fill="rgba(8,20,26,0.94)" stroke={hot ? '#ff765f' : '#6b828b'} strokeWidth={hot ? 2 : 1} />
      <SvgText x={x + 8} y={y + 11} fontSize="5.5" fontWeight="900" fill="#9eb3bb">{title}</SvgText>
      <SvgText x={x + 8} y={y + 25} fontSize="9" fontWeight="900" fill="#f3f7f8">{value}/{max}</SvgText>
      <Rect x={x + 53} y={y + 19} width="43" height="5" rx="2.5" fill="#24383f" />
      <Rect x={x + 53} y={y + 19} width={43 * p / 100} height="5" rx="2.5" fill={hot ? '#ff765f' : accent} />
    </G>
  );
}

function FlowRoute({ x, y, dx, dy, amount, color, duration = 2100 }) {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(progress, { toValue: 1, duration, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [duration, progress]);
  const tx = progress.interpolate({ inputRange: [0, 1], outputRange: [0, dx] });
  const ty = progress.interpolate({ inputRange: [0, 1], outputRange: [0, dy] });
  const count = Math.min(10, Math.max(1, Math.ceil(amount / 4)));
  return (
    <View pointerEvents="none" style={styles.motionLayer}>
      {Array.from({ length: count }).map((_, i) => (
        <Animated.View key={i} style={[styles.walker, { left: x - i * 13, top: y + (i % 3) * 4, transform: [{ translateX: tx }, { translateY: ty }] }]}>
          <View style={[styles.walkerHead, i % 4 === 0 && { backgroundColor: color }]} />
          <View style={[styles.walkerBody, { backgroundColor: i % 3 === 0 ? '#426c81' : i % 3 === 1 ? '#704f77' : '#527b8f' }]} />
          <View style={styles.walkerLegs} />
        </Animated.View>
      ))}
    </View>
  );
}

function TrainSprite({ train, ready, late, doorsOpen, onPress }) {
  if (!train) return null;
  const body = (
    <View style={styles.trainConsist}>
      {Array.from({ length: train.sets }).map((_, i) => (
        <React.Fragment key={`${train.id}-${i}`}>
          {i > 0 ? <View style={styles.coupler} /> : null}
          <View style={[styles.trainSetShadow, { width: train.type.visualWidth + 3 }]} />
          <View style={[styles.trainSet, { width: train.type.visualWidth, borderColor: train.destination.color }, ready && styles.trainReady, late && styles.trainLate]}>
            <View style={styles.trainRoof} />
            <View style={[styles.trainNose, { backgroundColor: train.destination.color }]} />
            <View style={styles.trainBelt} />
            <View style={styles.trainWindowRow}>{Array.from({ length: 5 }).map((__, w) => <View key={w} style={styles.trainWindow} />)}</View>
            <View style={[styles.trainDoor, doorsOpen && styles.trainDoorOpen]} />
            <View style={styles.trainUnderframe} />
            <View style={[styles.bogie, styles.bogieA]}><View style={styles.wheel} /><View style={styles.wheel} /></View>
            <View style={[styles.bogie, styles.bogieB]}><View style={styles.wheel} /><View style={styles.wheel} /></View>
            <Text style={styles.trainCode}>{train.type.code}</Text>
          </View>
        </React.Fragment>
      ))}
    </View>
  );
  return onPress ? <Pressable hitSlop={16} onPress={onPress}>{body}</Pressable> : body;
}

function Upgrade({ icon, title, detail, cost, cash, onPress, focus, done }) {
  return (
    <Pressable disabled={done} onPress={onPress} style={[styles.upgrade, cash >= cost && !done && styles.affordable, focus && styles.focus, done && styles.done]}>
      <View style={styles.upgradeIconWrap}><Text style={styles.upgradeIcon}>{icon}</Text></View>
      <View style={styles.upgradeText}><Text style={styles.upgradeTitle}>{title}</Text><Text style={styles.upgradeDesc}>{detail}</Text></View>
      <Text style={styles.upgradeCost}>{done ? 'ACTIEF' : money(cost)}</Text>
    </Pressable>
  );
}

function StationMap({
  parkingLevel,
  gateLevel,
  hallLevel,
  retailLevel,
  ticketLevel,
  platformLevel,
  platform3,
  parkingQueue,
  entranceQueue,
  hallDemand,
  platformDemand,
  platforms,
  services,
  now,
  bottleneck,
  onDepart,
  arrivalTrain,
  arrivalLane,
  arrivalProgress,
  departureTrain,
  departureLane,
  departureProgress,
}) {
  const hallTotal = sum(hallDemand);
  const parkingRows = Math.min(5, 2 + parkingLevel);
  const parkingCols = 7;
  const parkingSlots = parkingRows * parkingCols;
  const occupiedCars = Math.min(parkingSlots, Math.ceil((parkingQueue / Math.max(1, parkingCap(parkingLevel))) * parkingSlots));
  const gates = Math.min(8, 2 + gateLevel);
  const hallWidth = 420 + Math.min(80, hallLevel * 15);
  const kioskCount = Math.min(5, retailLevel);

  const arrivalX = arrivalProgress.interpolate({ inputRange: [0, 1], outputRange: [500, 0] });
  const arrivalY = arrivalProgress.interpolate({ inputRange: [0, 1], outputRange: [-70, 0] });
  const departureX = departureProgress.interpolate({ inputRange: [0, 1], outputRange: [0, 650] });
  const departureY = departureProgress.interpolate({ inputRange: [0, 1], outputRange: [0, -92] });

  const laneWaiting = (lane) => DESTINATIONS.reduce((acc, d) => {
    const s = services.find((svc) => svc.destination.id === d.id && svc.status !== 'departed');
    return acc + ((s?.actualLane || s?.plannedLane) === lane ? platformDemand[d.id] : 0);
  }, 0);

  const stationShadow = `${440},595 ${440 + hallWidth + 175},${595 - hallWidth * ISO + 125} ${440 + hallWidth + 198},${595 - hallWidth * ISO + 143} ${463},613`;

  return (
    <View style={styles.worldCanvas}>
      <Svg width={WORLD_WIDTH} height={WORLD_HEIGHT} viewBox={`0 0 ${WORLD_WIDTH} ${WORLD_HEIGHT}`}>
        <Defs>
          <LinearGradient id="grass" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#d8ebc5" />
            <Stop offset="1" stopColor="#8fb477" />
          </LinearGradient>
          <LinearGradient id="stationRoof" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#3b5562" />
            <Stop offset="1" stopColor="#20333d" />
          </LinearGradient>
          <LinearGradient id="glass" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#a9d8ec" stopOpacity="0.96" />
            <Stop offset="1" stopColor="#5488a0" stopOpacity="0.9" />
          </LinearGradient>
          <LinearGradient id="platformTop" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#d7d4cb" />
            <Stop offset="1" stopColor="#a9a79d" />
          </LinearGradient>
          <LinearGradient id="plaza" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#dedbd3" />
            <Stop offset="1" stopColor="#b9b5a9" />
          </LinearGradient>
        </Defs>

        <Rect x="0" y="0" width={WORLD_WIDTH} height={WORLD_HEIGHT} fill="url(#grass)" />
        <Polygon points="0,1040 0,600 1500,245 1500,1040" fill="#9fbd82" opacity="0.65" />
        <Path d="M 1020 910 C 1130 850, 1250 810, 1450 780" fill="none" stroke="#82a469" strokeWidth="42" opacity="0.35" />

        {/* Rail corridor with ballast and sleepers. */}
        <Polygon points="520,575 1367,365 1460,426 612,640" fill="#6d746d" opacity="0.82" />
        {[1, 2, 3].map((lane) => {
          const y = LANE_Y[lane] + 45;
          return (
            <G key={`ballast-${lane}`}>
              <Polygon points={isoStrip(PLATFORM_X + 2, y, PLATFORM_LENGTH + 20, 36)} fill="#596267" opacity="0.78" />
              {Array.from({ length: 21 }).map((_, i) => {
                const sx = PLATFORM_X + 28 + i * 34;
                const sy = y + 15 - (sx - PLATFORM_X) * ISO;
                return <Line key={i} x1={sx} y1={sy} x2={sx + 20} y2={sy + 10} stroke="#5c4635" strokeWidth="3" opacity="0.9" />;
              })}
              <Line x1={PLATFORM_X + 18} y1={y + 2} x2={PLATFORM_X + PLATFORM_LENGTH + 15} y2={y + 2 - (PLATFORM_LENGTH - 3) * ISO} stroke="#d7dde0" strokeWidth="2.6" />
              <Line x1={PLATFORM_X + 30} y1={y + 14} x2={PLATFORM_X + PLATFORM_LENGTH + 27} y2={y + 14 - (PLATFORM_LENGTH - 3) * ISO} stroke="#d7dde0" strokeWidth="2.6" />
            </G>
          );
        })}

        {/* Platforms with side faces, tactile strips, shelters and furniture. */}
        {[1, 2, 3].map((lane) => {
          const locked = lane === 3 && !platform3;
          const y = LANE_Y[lane];
          const train = platforms[lane];
          const waiting = laneWaiting(lane);
          const hot = (bottleneck === 'PERRONS' || bottleneck === 'TREINEN') && !locked;
          return (
            <G key={lane} opacity={locked ? 0.48 : 1}>
              <Polygon points={isoStrip(PLATFORM_X + 7, y + 12, PLATFORM_LENGTH, 58)} fill="#596469" opacity="0.28" />
              <Polygon points={isoStrip(PLATFORM_X, y, PLATFORM_LENGTH, 54)} fill={locked ? '#8b8273' : 'url(#platformTop)'} stroke={hot ? '#ff735e' : '#ece8df'} strokeWidth={hot ? 3 : 1.4} />
              <Polygon points={`${PLATFORM_X},${y + 1} ${PLATFORM_X + 54},${y + 39} ${PLATFORM_X + PLATFORM_LENGTH + 54},${y + 39 - PLATFORM_LENGTH * ISO} ${PLATFORM_X + PLATFORM_LENGTH},${y - PLATFORM_LENGTH * ISO}`} fill="#8d8c84" opacity="0.5" />
              <Line x1={PLATFORM_X + 24} y1={y + 13} x2={PLATFORM_X + PLATFORM_LENGTH - 8} y2={y + 13 - (PLATFORM_LENGTH - 32) * ISO} stroke="#e3c85f" strokeWidth="3.2" opacity="0.95" />
              <Line x1={PLATFORM_X + 25} y1={y + 18} x2={PLATFORM_X + PLATFORM_LENGTH - 7} y2={y + 18 - (PLATFORM_LENGTH - 32) * ISO} stroke="#eee8cf" strokeWidth="1.1" strokeDasharray="2 3" opacity="0.8" />
              <Rect x={PLATFORM_X + 12} y={y - 5} width="43" height="25" rx="5" fill="#0a171d" stroke="#5b7681" strokeWidth="0.9" />
              <SvgText x={PLATFORM_X + 20} y={y + 10} fontSize="9" fontWeight="900" fill="#fff">P{lane}</SvgText>
              <Circle cx={PLATFORM_X + 47} cy={y + 5} r="3" fill={train?.destination?.color || '#71848d'} />
              {locked ? <SvgText x={PLATFORM_X + 250} y={y + 17} fontSize="9" fontWeight="900" fill="#f0d48b">BOUWTERREIN PERRON 3</SvgText> : null}

              {!locked && Array.from({ length: Math.min(4, 1 + Math.floor(platformLevel / 2)) }).map((_, i) => {
                const px = PLATFORM_X + 135 + i * 135;
                const py = y - 13 - i * 18.8;
                return (
                  <G key={i}>
                    <Ellipse cx={px + 12} cy={py + 31} rx="40" ry="7" fill="#17282f" opacity="0.13" />
                    <Line x1={px - 22} y1={py + 31} x2={px - 22} y2={py + 8} stroke="#4e5f65" strokeWidth="3" />
                    <Line x1={px + 42} y1={py + 22} x2={px + 42} y2={py - 1} stroke="#4e5f65" strokeWidth="3" />
                    <Polygon points={`${px - 29},${py + 8} ${px + 48},${py - 3} ${px + 58},${py + 3} ${px - 18},${py + 15}`} fill="#54717d" stroke="#b6c8ce" strokeWidth="0.8" />
                    <Polygon points={`${px - 22},${py + 10} ${px + 42},${py + 1} ${px + 42},${py + 13} ${px - 22},${py + 22}`} fill="#7db3c8" opacity="0.34" />
                    <Rect x={px - 7} y={py + 18} width="28" height="4" rx="1.5" fill="#6b503b" />
                  </G>
                );
              })}

              {!locked && [0, 1, 2].map((i) => {
                const lx = PLATFORM_X + 95 + i * 205;
                const ly = y + 17 - i * 28.5;
                return (
                  <G key={`lamp-${i}`}>
                    <Line x1={lx} y1={ly} x2={lx} y2={ly - 21} stroke="#44555d" strokeWidth="2" />
                    <Line x1={lx} y1={ly - 21} x2={lx + 9} y2={ly - 22.5} stroke="#44555d" strokeWidth="2" />
                    <Circle cx={lx + 10} cy={ly - 22.5} r="2.5" fill="#fff4bf" />
                  </G>
                );
              })}

              {!locked ? <ZoneMeter x={PLATFORM_X + 590} y={y + 50} title={`P${lane} WACHT`} value={waiting} max={platformCap(platformLevel)} hot={hot} accent={train?.destination?.color || '#58b9ee'} /> : null}
            </G>
          );
        })}

        {/* Overhead structures visually tie the platform heads into one station. */}
        <Polygon points={isoStrip(515, 505, 360, 90)} fill="#7e8d91" stroke="#dce4e5" strokeWidth="1.5" />
        <Polygon points={isoStrip(565, 470, 265, 64)} fill="#9ea9a9" stroke="#f0f2ef" strokeWidth="1" />
        <Polygon points={isoStrip(592, 461, 210, 45)} fill="#7695a1" opacity="0.42" stroke="#c9dfe6" strokeWidth="0.9" />
        <Line x1="610" y1="512" x2="610" y2="542" stroke="#4b6069" strokeWidth="3" />
        <Line x1="820" y1="482" x2="820" y2="512" stroke="#4b6069" strokeWidth="3" />
        <Rect x="625" y="505" width="150" height="22" rx="5" fill="#1b2c34" stroke="#68818b" strokeWidth="0.8" />
        <SvgText x="642" y="520" fontSize="7" fontWeight="900" fill="#f3f8f9">CENTRALE PERRONPASSAGE</SvgText>

        {/* Main station building: shadow, side faces, roof, glass front and canopy. */}
        <Polygon points={stationShadow} fill="#203038" opacity="0.16" />
        <Polygon points={isoStrip(430, 575, hallWidth, 165)} fill="#536f7b" stroke={bottleneck === 'HAL' ? '#ff735e' : '#dce8eb'} strokeWidth={bottleneck === 'HAL' ? 3.2 : 1.5} />
        <Polygon points={`${430},575 548,660 548,795 430,710`} fill="#304650" />
        <Polygon points={`${548},660 ${430 + hallWidth + 165},${575 - hallWidth * ISO + 119} ${430 + hallWidth + 165},${710 - hallWidth * ISO + 119} ${548},795`} fill="#3a5662" />
        <Polygon points={isoStrip(447, 555, hallWidth - 34, 132)} fill="url(#stationRoof)" stroke="#6e8994" strokeWidth="1" />
        <Line x1="456" y1="561" x2={430 + hallWidth} y2={561 - (hallWidth - 26) * ISO} stroke="#7e9aa6" strokeWidth="1.3" opacity="0.65" />

        <Rect x="552" y="650" width="230" height="76" rx="3" fill="#20343e" opacity="0.55" />
        {Array.from({ length: 8 }).map((_, i) => (
          <G key={`glass-${i}`}>
            <Rect x={560 + i * 27} y={660 - i * 3.8} width="20" height="42" fill="url(#glass)" stroke="#d4eef5" strokeWidth="0.8" />
            <Line x1={570 + i * 27} y1={661 - i * 3.8} x2={570 + i * 27} y2={700 - i * 3.8} stroke="#3f7388" strokeWidth="0.6" opacity="0.7" />
          </G>
        ))}
        <Rect x="575" y="618" width="200" height="28" rx="6" fill="#102129" opacity="0.9" />
        <SvgText x="604" y="636" fontSize="14" fontWeight="900" fill="#f4f9fa">CENTRAAL STATION</SvgText>
        <Circle cx="591" cy="631" r="7" fill="#e8f1f4" stroke="#546e79" strokeWidth="1" />
        <Line x1="591" y1="631" x2="591" y2="626" stroke="#344c56" strokeWidth="1" />
        <Line x1="591" y1="631" x2="595" y2="633" stroke="#344c56" strokeWidth="1" />
        <SvgText x="610" y="653" fontSize="6.4" fontWeight="800" fill="#c3d7df">HAL Lv {hallLevel} • SERVICE Lv {ticketLevel}</SvgText>

        {/* Entrance is integrated into the glass frontage. */}
        <Polygon points={isoStrip(410, 727, 235, 54)} fill="#344950" stroke={bottleneck === 'ENTREE' ? '#ff735e' : '#81969f'} strokeWidth={bottleneck === 'ENTREE' ? 2.8 : 1.1} />
        <Polygon points={isoStrip(428, 711, 190, 34)} fill="#6e8f9b" stroke="#c5d9df" strokeWidth="0.8" opacity="0.95" />
        {Array.from({ length: gates }).map((_, i) => {
          const gx = 438 + i * 19;
          const gy = 750 - i * 2.7;
          return <G key={i}><Rect x={gx} y={gy} width="8" height="23" rx="1" fill="#536d76" stroke="#b1c3c9" strokeWidth="0.7" /><Circle cx={gx + 4} cy={gy + 5} r="1.5" fill="#50e18a" /><Rect x={gx + 1.5} y={gy + 9} width="5" height="7" rx="0.8" fill="#263d47" /></G>;
        })}
        <ZoneMeter x={455} y={800} title="ENTREE" value={entranceQueue} max={entranceBuffer(gateLevel)} hot={bottleneck === 'ENTREE'} accent="#ffd25e" />

        {/* Hall crowd visible through the station footprint. */}
        {Array.from({ length: Math.min(38, Math.ceil(hallTotal / 7)) }).map((_, i) => <PersonSvg key={i} x={565 + (i % 12) * 21 + Math.floor(i / 12) * 7} y={760 - (i % 12) * 3 + Math.floor(i / 12) * 15} color={i % 5 === 0 ? '#d09547' : i % 4 === 0 ? '#7d5c8b' : '#507f9a'} />)}
        <ZoneMeter x={735} y={760} title="STATIONSHAL" value={hallTotal} max={hallCap(hallLevel)} hot={bottleneck === 'HAL'} accent="#64db93" />

        {/* Retail is visually embedded into the frontage. */}
        {Array.from({ length: kioskCount }).map((_, i) => (
          <G key={i}>
            <Ellipse cx={670 + i * 51} cy={821 - i * 7.2} rx="22" ry="5" fill="#182a31" opacity="0.13" />
            <Polygon points={isoStrip(650 + i * 51, 805 - i * 7.2, 37, 22)} fill={i % 2 ? '#755638' : '#734730'} stroke="#e1c28e" strokeWidth="0.8" />
            <Polygon points={isoStrip(651 + i * 51, 801 - i * 7.2, 35, 11)} fill={i % 2 ? '#e0ae5f' : '#c47a52'} />
            <SvgText x={657 + i * 51} y={815 - i * 7.2} fontSize="5" fontWeight="900" fill="#fff0cf">{i % 2 ? 'SHOP' : 'CAFE'}</SvgText>
          </G>
        ))}

        {/* Forecourt: tiled, landscaped and physically connected to the station. */}
        <Polygon points={isoStrip(275, 795, 625, 175)} fill="url(#plaza)" stroke="#ebe7df" strokeWidth="1.3" />
        {Array.from({ length: 7 }).map((_, i) => {
          const px = 350 + i * 70;
          const py = 858 - i * 9.8;
          return <Line key={`tile-${i}`} x1={px} y1={py} x2={px + 120} y2={py + 58} stroke="#9c9a92" strokeWidth="0.7" opacity="0.38" />;
        })}
        <Polygon points={isoStrip(390, 790, 350, 78)} fill="#d5d0c5" stroke="#f0ece3" strokeWidth="1" />
        <SvgText x="515" y="826" fontSize="7" fontWeight="900" fill="#55666d">STATIONSPLEIN</SvgText>
        {[0, 1, 2].map((i) => <G key={`bench-${i}`}><Rect x={410 + i * 90} y={874 - i * 13} width="30" height="4" rx="1" fill="#76553b" /><Line x1={415 + i * 90} y1={878 - i * 13} x2={413 + i * 90} y2={883 - i * 13} stroke="#536066" strokeWidth="1.4" /><Line x1={435 + i * 90} y1={875 - i * 13} x2={438 + i * 90} y2={880 - i * 13} stroke="#536066" strokeWidth="1.4" /></G>)}

        {/* Parking as one wing of the same forecourt. */}
        <Polygon points={isoStrip(65, 820, 350 + Math.min(75, parkingLevel * 12), 170)} fill="#8b9698" stroke={bottleneck === 'PARKEREN' ? '#ff735e' : '#d7dddd'} strokeWidth={bottleneck === 'PARKEREN' ? 3.2 : 1.2} />
        <Polygon points={isoStrip(74, 827, 334 + Math.min(75, parkingLevel * 12), 154)} fill="#7f8a8c" opacity="0.35" />
        {Array.from({ length: parkingSlots }).map((_, i) => {
          const row = Math.floor(i / parkingCols);
          const col = i % parkingCols;
          const x = 95 + col * 42 + row * 10;
          const y = 875 + row * 27 - col * 5.8;
          return <G key={i}><Polygon points={`${x},${y} ${x + 31},${y - 4.4} ${x + 37},${y + 1} ${x + 6},${y + 5.5}`} fill="none" stroke="#e8ece9" strokeWidth="0.9" />{i < occupiedCars ? <CarSvg x={x + 8} y={y} color={i % 4 === 0 ? '#ed6d62' : i % 4 === 1 ? '#4aa8ff' : i % 4 === 2 ? '#f0c64f' : '#e8eef0'} /> : null}</G>;
        })}
        <Rect x="87" y="796" width="70" height="24" rx="6" fill="#21333a" stroke="#708890" strokeWidth="0.8" />
        <SvgText x="104" y="812" fontSize="8" fontWeight="900" fill="#f4f8f9">PARKING</SvgText>
        <ZoneMeter x={245} y={965} title="PARKEREN" value={parkingQueue} max={parkingCap(parkingLevel)} hot={bottleneck === 'PARKEREN'} />

        {/* Access road. */}
        <Polygon points="0,995 315,900 430,932 92,1035" fill="#566164" />
        <Polygon points="18,991 313,904 414,932 96,1028" fill="#626d70" opacity="0.55" />
        <Line x1="25" y1="1000" x2="392" y2="892" stroke="#f2eee0" strokeWidth="2" strokeDasharray="12 11" opacity="0.64" />

        {/* Catenary masts and landscaping add depth. */}
        {[0, 1, 2, 3].map((i) => {
          const x = 790 + i * 180;
          const y = 183 - i * 25;
          return <G key={`mast-${i}`}><Line x1={x} y1={y + 80} x2={x} y2={y} stroke="#4d5b60" strokeWidth="3" /><Line x1={x - 7} y1={y + 8} x2={x + 42} y2={y + 1} stroke="#4d5b60" strokeWidth="2" /><Line x1={x + 38} y1={y + 2} x2={x + 38} y2={y + 17} stroke="#4d5b60" strokeWidth="1.4" /></G>;
        })}
        <Line x1="785" y1="205" x2="1342" y2="127" stroke="#3f4d52" strokeWidth="1" opacity="0.75" />
        {[65, 145, 1015, 1100, 1320, 1400].map((x, i) => <Tree key={i} x={x} y={i < 2 ? 780 - i * 45 : 830 - (i - 2) * 60} scale={0.75 + (i % 3) * 0.09} />)}
      </Svg>

      {/* Visible walking chain follows the station's actual route. */}
      <FlowRoute x={365} y={900} dx={125} dy={-92} amount={Math.min(parkingQueue, gateRate(gateLevel))} color="#52bfff" />
      <FlowRoute x={500} y={785} dx={115} dy={-78} amount={Math.min(entranceQueue, gateRate(gateLevel))} color="#ffd25e" />
      <FlowRoute x={665} y={695} dx={20} dy={-155} amount={Math.min(hallTotal, hallRate(hallLevel))} color="#64db93" />

      {[1, 2, 3].map((lane) => {
        if (lane === 3 && !platform3) return null;
        const train = platforms[lane];
        const hidden = (arrivalTrain && arrivalLane === lane) || (departureTrain && departureLane === lane);
        const depIn = train ? train.departureAt - now : 0;
        const ready = Boolean(train && train.status === 'ready' && depIn <= 0 && depIn >= -DELAY_MARGIN);
        const late = Boolean(train && train.status === 'ready' && depIn < -DELAY_MARGIN);
        const waiting = laneWaiting(lane);
        return (
          <React.Fragment key={lane}>
            <View pointerEvents="none" style={[styles.platformCrowd, { top: LANE_Y[lane] - 3 }]}>
              {Array.from({ length: Math.min(30, Math.ceil(waiting / 8)) }).map((_, i) => <View key={i} style={styles.platformPerson}><View style={[styles.platformHead, i % 4 === 0 && { backgroundColor: train?.destination?.color || '#58b9ee' }]} /><View style={[styles.platformBody, { backgroundColor: i % 3 === 0 ? '#557e93' : i % 3 === 1 ? '#866654' : '#665a82' }]} /><View style={styles.platformLegs} /></View>)}
            </View>
            {train && !hidden ? (
              <View style={[styles.trainAtPlatform, { top: LANE_Y[lane] + 42 }]}>
                <TrainSprite train={train} ready={ready} late={late} doorsOpen={train.status === 'dwelling'} onPress={() => onDepart(lane)} />
                <Text style={[styles.trainStatus, ready && styles.readyText, late && styles.lateText]}>{train.number} → {train.destination.name} • {train.onboard}/{train.capacity} • {train.status === 'dwelling' ? `${train.remaining}s halte` : depIn > 0 ? `vertrek over ${depIn}s` : depIn >= -DELAY_MARGIN ? `VERTREK • ${DELAY_MARGIN + depIn}s marge` : `+${Math.abs(depIn + DELAY_MARGIN)}s te laat`}</Text>
              </View>
            ) : null}
          </React.Fragment>
        );
      })}

      {arrivalTrain ? <Animated.View pointerEvents="none" style={[styles.trainAtPlatform, { top: LANE_Y[arrivalLane] + 42, transform: [{ translateX: arrivalX }, { translateY: arrivalY }] }]}><TrainSprite train={arrivalTrain} /><Text style={styles.motionStatus}>BINNENKOMST → P{arrivalLane}</Text></Animated.View> : null}
      {departureTrain ? <Animated.View pointerEvents="none" style={[styles.trainAtPlatform, { top: LANE_Y[departureLane] + 42, transform: [{ translateX: departureX }, { translateY: departureY }] }]}><TrainSprite train={departureTrain} /><Text style={styles.motionStatus}>VERTREK → {departureTrain.destination.name}</Text></Animated.View> : null}
    </View>
  );
}

export default function AppV19() {
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
  const [arrivalTrain, setArrivalTrain] = useState(null);
  const [arrivalLane, setArrivalLane] = useState(null);
  const [departureTrain, setDepartureTrain] = useState(null);
  const [departureLane, setDepartureLane] = useState(null);
  const [viewport, setViewport] = useState({ width: 390, height: 520 });

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
  const departureBusy = useRef(false);
  const arrivalProgress = useRef(new Animated.Value(0)).current;
  const departureProgress = useRef(new Animated.Value(0)).current;

  const camera = useRef(new Animated.ValueXY({ x: -430, y: -330 })).current;
  const cameraCurrent = useRef({ x: -430, y: -330 });
  const panStart = useRef({ x: -430, y: -330 });
  const viewportRef = useRef(viewport);
  useEffect(() => { viewportRef.current = viewport; }, [viewport]);

  const clampCamera = (x, y) => {
    const v = viewportRef.current;
    return {
      x: Math.max(-(WORLD_WIDTH - v.width), Math.min(0, x)),
      y: Math.max(-(WORLD_HEIGHT - v.height), Math.min(0, y)),
    };
  };

  const jumpTo = (wx, wy) => {
    const v = viewportRef.current;
    const next = clampCamera(v.width / 2 - wx, v.height / 2 - wy);
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
    onPanResponderRelease: () => {},
    onPanResponderTerminationRequest: () => true,
  })).current;

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
    while (nextXp >= levelTarget(nextLevel)) { nextXp -= levelTarget(nextLevel); nextLevel += 1; }
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
    return { id: `svc-${i}-${arrivalAt}`, number: `${type.code} ${1700 + i * 4 + 2}`, type, destination, plannedLane, actualLane: null, arrivalAt, departureAt: arrivalAt + type.dwell + 5, sets, capacity, onboard: Math.round(capacity * 0.38), status: 'scheduled', remaining: type.dwell, wait: 0 };
  };

  const updateService = (id, patch) => syncServices(servicesRef.current.map((s) => s.id === id ? { ...s, ...patch } : s));

  const distributeTransfers = (train, count) => {
    const next = { ...hallRef.current };
    const choices = DESTINATIONS.filter((d) => d.unlock <= stationLevelRef.current && d.id !== train.destination.id);
    for (let i = 0; i < count && choices.length; i += 1) next[choices[i % choices.length].id] += 1;
    syncHall(next);
  };

  const startArrival = (train, lane, diverted = false) => {
    if (!train || arrivalBusy.current || platformsRef.current[lane] || (lane === 3 && !platform3Ref.current)) return false;
    arrivalBusy.current = true;
    syncOutside(outsideRef.current.filter((item) => item.id !== train.id));
    updateService(train.id, { status: 'arriving', actualLane: lane });
    const moving = { ...train, actualLane: lane };
    setArrivalTrain(moving); setArrivalLane(lane); arrivalProgress.setValue(0);
    setMessage(diverted ? `${train.number} wijkt uit naar P${lane}.` : `${train.number} rijdt naar P${lane}.`);
    Animated.timing(arrivalProgress, { toValue: 1, duration: ARRIVAL_MS, useNativeDriver: true }).start(({ finished }) => {
      arrivalBusy.current = false;
      if (!finished) return;
      const alight = Math.min(moving.onboard, Math.round(moving.onboard * (0.18 + Math.random() * 0.17)));
      const transfer = Math.round(alight * (0.22 + Math.random() * 0.28));
      distributeTransfers(moving, transfer);
      const atPlatform = { ...moving, status: 'dwelling', remaining: moving.type.dwell, onboard: moving.onboard - alight };
      syncPlatforms({ ...platformsRef.current, [lane]: atPlatform });
      updateService(moving.id, { status: 'platform', actualLane: lane });
      setArrivalTrain(null); setArrivalLane(null);
      setMessage(`${moving.number} P${lane}: ${alight} uitstappers, ${transfer} overstappers.`);
      setTimeout(tryArrival, 80);
    });
    return true;
  };

  const tryArrival = () => {
    if (arrivalBusy.current || !outsideRef.current.length) return;
    const train = outsideRef.current[0];
    if (!platformsRef.current[train.plannedLane]) startArrival(train, train.plannedLane, false);
  };

  const divert = (lane) => {
    const train = outsideRef.current[0];
    if (!train || platformsRef.current[lane] || (lane === 3 && !platform3Ref.current)) return;
    startArrival(train, lane, true);
  };

  const depart = (lane) => {
    const train = platformsRef.current[lane];
    if (!train || departureBusy.current) return;
    if (train.status !== 'ready') return setMessage(`${train.number}: nog ${train.remaining || 0}s reizigerswissel.`);
    if (nowRef.current < train.departureAt) return setMessage(`${train.number} mag over ${train.departureAt - nowRef.current}s vertrekken.`);
    departureBusy.current = true;
    const delay = Math.max(0, nowRef.current - train.departureAt);
    const moving = { ...train, status: 'departing' };
    syncPlatforms({ ...platformsRef.current, [lane]: moving });
    updateService(train.id, { status: 'departing' });
    setDepartureTrain(moving); setDepartureLane(lane); departureProgress.setValue(0);
    setMessage(`${train.number} vertrekt van P${lane}.`);
    Animated.timing(departureProgress, { toValue: 1, duration: DEPARTURE_MS, useNativeDriver: true }).start(({ finished }) => {
      departureBusy.current = false;
      if (!finished) return;
      const within = delay <= DELAY_MARGIN;
      const revenue = Math.round(train.onboard * train.destination.fare * fareMultiplier(ticketLevelRef.current));
      syncPlatforms({ ...platformsRef.current, [lane]: null });
      updateService(train.id, { status: 'departed' });
      setDepartureTrain(null); setDepartureLane(null);
      handledRef.current += 1; transportedRef.current += train.onboard; if (within) onTimeRef.current += 1;
      setHandled(handledRef.current); setTransported(transportedRef.current); setOnTime(onTimeRef.current);
      addCash(revenue + (within ? 75 : 0));
      awardXp(Math.round(train.onboard / 4) + (within ? 45 : 10));
      setMessage(`${train.number} → ${train.destination.name}: ${money(revenue)}${within ? ' + €75 bonus' : ''}.`);
      persist();
      setTimeout(tryArrival, 100);
    });
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
      const enterParking = Math.min(inflow, Math.max(0, parkingCap(parkingLevelRef.current) - parkingRef.current));
      const rejected = inflow - enterParking;
      if (rejected > 0) { lostRef.current += rejected; setLost(lostRef.current); }
      let nextParking = parkingRef.current + enterParking;

      const toEntrance = Math.min(nextParking, gateRate(gateLevelRef.current), Math.max(0, entranceBuffer(gateLevelRef.current) - entranceRef.current));
      nextParking -= toEntrance;
      let nextEntrance = entranceRef.current + toEntrance;

      const nextHall = { ...hallRef.current };
      const throughGates = Math.min(nextEntrance, gateRate(gateLevelRef.current), Math.max(0, hallCap(hallLevelRef.current) - sum(nextHall)));
      nextEntrance -= throughGates;
      const unlocked = DESTINATIONS.filter((d) => d.unlock <= stationLevelRef.current);
      for (let i = 0; i < throughGates; i += 1) nextHall[unlocked[(demandCursor.current + i) % unlocked.length].id] += 1;
      demandCursor.current += throughGates;

      const nextPlatformDemand = { ...platformDemandRef.current };
      let hallFlowBudget = hallRate(hallLevelRef.current);
      unlocked.forEach((d) => {
        if (hallFlowBudget <= 0 || nextHall[d.id] <= 0) return;
        const nextService = servicesRef.current.find((s) => s.destination.id === d.id && s.status !== 'departed');
        const lane = nextService?.actualLane || nextService?.plannedLane;
        if (!lane || (lane === 3 && !platform3Ref.current)) return;
        const waitingOnLane = unlocked.reduce((acc, candidate) => {
          const cs = servicesRef.current.find((s) => s.destination.id === candidate.id && s.status !== 'departed');
          return acc + ((cs?.actualLane || cs?.plannedLane) === lane ? nextPlatformDemand[candidate.id] : 0);
        }, 0);
        const moved = Math.min(nextHall[d.id], hallFlowBudget, Math.max(0, platformCap(platformLevelRef.current) - waitingOnLane));
        nextHall[d.id] -= moved;
        nextPlatformDemand[d.id] += moved;
        hallFlowBudget -= moved;
      });

      const nextPlatforms = { ...platformsRef.current };
      [1, 2, 3].forEach((lane) => {
        const current = nextPlatforms[lane];
        if (!current || current.status === 'departing') return;
        const train = { ...current };
        const board = Math.min(nextPlatformDemand[train.destination.id] || 0, Math.max(0, train.capacity - train.onboard), 30 + train.sets * 12);
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
      setTimeout(tryArrival, 35);
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [phase]);

  const begin = () => {
    nowRef.current = 0; serviceIndex.current = 0; nextServiceAt.current = 3; demandCursor.current = 0;
    arrivalBusy.current = false; departureBusy.current = false; arrivalProgress.setValue(0); departureProgress.setValue(0);
    syncParking(15); syncEntrance(8);
    syncHall({ noorddam: 8, havenstad: 10, oostpoort: stationLevelRef.current >= 2 ? 5 : 0, luchthaven: stationLevelRef.current >= 3 ? 4 : 0 });
    syncPlatformDemand({ noorddam: 12, havenstad: 18, oostpoort: stationLevelRef.current >= 2 ? 7 : 0, luchthaven: stationLevelRef.current >= 3 ? 5 : 0 });
    syncPlatforms({ 1: null, 2: null, 3: null }); syncOutside([]);
    setArrivalTrain(null); setArrivalLane(null); setDepartureTrain(null); setDepartureLane(null);
    const initial = [];
    for (let i = 0; i < 8; i += 1) { initial.push(makeService(nextServiceAt.current)); nextServiceAt.current += SERVICE_INTERVAL; }
    syncServices(initial); setNow(0);
    setMessage('Visual Quality Pass: hetzelfde station, nu met meer diepte, materiaal en spoorwegdetail.');
    setPhase('playing');
    setTimeout(() => jumpTo(660, 650), 60);
  };

  const doUpgrade = (kind) => {
    const map = {
      parking: [parkingCost(parkingLevelRef.current), parkingLevelRef, setParkingLevel, 'Parkeerwing van het station uitgebreid.'],
      gates: [gateCost(gateLevelRef.current), gateLevelRef, setGateLevel, 'Hoofdentree verbreed met extra poortjes.'],
      hall: [hallCost(hallLevelRef.current), hallLevelRef, setHallLevel, 'Stationshal binnen hetzelfde gebouw uitgebreid.'],
      platforms: [platformCost(platformLevelRef.current), platformLevelRef, setPlatformLevel, 'Perroncapaciteit en overkappingen verbeterd.'],
      fleet: [fleetCost(fleetLevelRef.current), fleetLevelRef, setFleetLevel, 'Toekomstige treinen krijgen meer stellen.'],
      retail: [retailCost(retailLevelRef.current), retailLevelRef, setRetailLevel, 'Extra winkel in de stationshal geopend.'],
      tickets: [ticketCost(ticketLevelRef.current), ticketLevelRef, setTicketLevel, 'Stationsservice verbeterd.'],
    };
    const entry = map[kind];
    if (!entry) return;
    const [cost, ref, setter, text] = entry;
    if (!spend(cost)) return setMessage('Niet genoeg geld voor deze uitbreiding.');
    ref.current += 1;
    setter(ref.current);
    setMessage(text);
    persist();
  };

  const buildP3 = () => {
    if (platform3Ref.current) return;
    if (!spend(platform3Cost)) return setMessage('Niet genoeg geld voor Perron 3.');
    platform3Ref.current = true;
    setPlatform3(true);
    setMessage('Perron 3 geopend en direct aangesloten op de centrale passage.');
    persist();
  };

  if (phase === 'menu') {
    return (
      <SafeAreaView style={styles.screen}>
        <StatusBar barStyle="light-content" />
        <View style={styles.menu}>
          <Text style={styles.kicker}>VISUAL QUALITY PASS / V0.19</Text>
          <Text style={styles.logo}>RAIL{`\n`}RUSH HOUR</Text>
          <Text style={styles.subtitle}>Hetzelfde geïntegreerde station, maar nu met duidelijkere architectuur, glas en materialen, rijkere perrons, spoorinfrastructuur, treindetails en meer visuele diepte.</Text>
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
    return acc + ((s?.actualLane || s?.plannedLane) === lane ? platformDemand[d.id] : 0);
  }, 0)));
  const trainCapacityNow = Object.values(platforms).filter(Boolean).reduce((acc, t) => acc + t.capacity, 0) || openPlatforms * 180 * Math.max(1, fleetLevel);
  const balance = [
    { label: 'PARKEREN', pressure: pct(parkingQueue, parkingCap(parkingLevel)) },
    { label: 'ENTREE', pressure: pct(entranceQueue, entranceBuffer(gateLevel)) },
    { label: 'HAL', pressure: pct(hallTotal, hallCap(hallLevel)) },
    { label: 'PERRONS', pressure: pct(maxPlatformWaiting, platformCap(platformLevel)) },
    { label: 'TREINEN', pressure: Math.min(199, Math.round((platformTotal / Math.max(1, trainCapacityNow)) * 100)) },
  ];
  const bottleneck = [...balance].sort((a, b) => b.pressure - a.pressure)[0];
  const blocked = outside[0] && platforms[outside[0].plannedLane] ? outside[0] : null;
  const bottleneckPoint = bottleneck.label === 'PARKEREN' ? [260, 890] : bottleneck.label === 'ENTREE' ? [520, 760] : bottleneck.label === 'HAL' ? [680, 680] : [880, 355];
  const readyLane = [1, 2, 3].find((lane) => platforms[lane]?.status === 'ready');

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="light-content" />
      <View style={styles.hud}>
        <View style={styles.hudCell}><Text style={styles.hudLabel}>KAS</Text><Text style={styles.hudMoney}>{money(cash)}</Text></View>
        <View style={styles.hudCell}><Text style={styles.hudLabel}>STATION</Text><Text style={styles.hudValue}>Lv {stationLevel}</Text></View>
        <View style={styles.hudCell}><Text style={styles.hudLabel}>TIJD</Text><Text style={styles.hudValue}>{clock(now)}</Text></View>
        <Pressable style={styles.hudCell} onPress={() => jumpTo(...bottleneckPoint)}><Text style={styles.hudLabel}>KNELPUNT</Text><Text style={styles.hudWarn}>{bottleneck.label} {bottleneck.pressure}%</Text></Pressable>
      </View>

      <View style={styles.cameraBar}>
        <Pressable style={styles.cameraButton} onPress={() => jumpTo(660, 650)}><Text style={styles.cameraText}>◎ HELE STATION</Text></Pressable>
        <Pressable style={styles.cameraButton} onPress={() => jumpTo(350, 850)}><Text style={styles.cameraText}>🚗 VOORZIJDE</Text></Pressable>
        <Pressable style={[styles.cameraButton, styles.cameraWarn]} onPress={() => jumpTo(...bottleneckPoint)}><Text style={styles.cameraText}>⚠ KNELPUNT</Text></Pressable>
        <Pressable style={styles.cameraButton} onPress={() => jumpTo(readyLane ? 850 : 860, readyLane ? LANE_Y[readyLane] + 45 : 350)}><Text style={styles.cameraText}>🚆 PERRONS</Text></Pressable>
      </View>

      <View style={styles.viewport} onLayout={(e) => setViewport({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })} {...panResponder.panHandlers}>
        <Animated.View style={[styles.worldMover, { transform: [{ translateX: camera.x }, { translateY: camera.y }] }]}>
          <StationMap
            parkingLevel={parkingLevel} gateLevel={gateLevel} hallLevel={hallLevel} retailLevel={retailLevel} ticketLevel={ticketLevel}
            platformLevel={platformLevel} platform3={platform3} parkingQueue={parkingQueue} entranceQueue={entranceQueue}
            hallDemand={hallDemand} platformDemand={platformDemand} platforms={platforms} services={services} now={now}
            bottleneck={bottleneck.label} onDepart={depart} arrivalTrain={arrivalTrain} arrivalLane={arrivalLane}
            arrivalProgress={arrivalProgress} departureTrain={departureTrain} departureLane={departureLane} departureProgress={departureProgress}
          />
        </Animated.View>
        <View pointerEvents="none" style={styles.dragHint}><Text style={styles.dragHintText}>↔↕ SLEEP OVER HET STATION</Text></View>
        <View style={styles.messageFloat}><View style={styles.messageLamp} /><Text style={styles.messageText}>{message}</Text></View>
        {blocked ? (
          <View style={styles.blockedFloat}>
            <View style={styles.blockedTop}><Text style={styles.blockedTrain}>{blocked.number} wacht • P{blocked.plannedLane} bezet</Text><Text style={styles.blockedDelay}>+{blocked.wait}s</Text></View>
            <View style={styles.divertRow}>{[1, 2, 3].filter((lane) => lane !== blocked.plannedLane && (lane !== 3 || platform3)).map((lane) => <Pressable key={lane} disabled={Boolean(platforms[lane])} onPress={() => divert(lane)} style={[styles.divert, platforms[lane] && styles.disabled]}><Text style={styles.divertText}>{platforms[lane] ? `P${lane} BEZET` : `WIJK UIT → P${lane}`}</Text></Pressable>)}</View>
          </View>
        ) : null}
      </View>

      <View style={styles.progressBar}><View style={styles.progressTop}><Text style={styles.progressTitle}>Lv {stationLevel} • {xp}/{levelTarget(stationLevel)} XP</Text><Text style={styles.progressMeta}>{transported} reizigers • {handled} treinen • {onTime} op tijd • {lost} gemist</Text></View><View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${pct(xp, levelTarget(stationLevel))}%` }]} /></View></View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.upgradeRail} style={styles.upgradeDock}>
        <Upgrade icon="🚗" title="Parkeren" detail={`Lv ${parkingLevel} • ${parkingCap(parkingLevel)} pl.`} cost={parkingCost(parkingLevel)} cash={cash} onPress={() => doUpgrade('parking')} focus={bottleneck.label === 'PARKEREN'} />
        <Upgrade icon="🚪" title="Hoofdentree" detail={`Lv ${gateLevel} • ${gateRate(gateLevel)}/s`} cost={gateCost(gateLevel)} cash={cash} onPress={() => doUpgrade('gates')} focus={bottleneck.label === 'ENTREE'} />
        <Upgrade icon="🏢" title="Stationshal" detail={`Lv ${hallLevel} • ${hallCap(hallLevel)} cap.`} cost={hallCost(hallLevel)} cash={cash} onPress={() => doUpgrade('hall')} focus={bottleneck.label === 'HAL'} />
        <Upgrade icon="🚉" title="Perrons" detail={`Lv ${platformLevel} • ${platformCap(platformLevel)} cap.`} cost={platformCost(platformLevel)} cash={cash} onPress={() => doUpgrade('platforms')} focus={bottleneck.label === 'PERRONS'} />
        <Upgrade icon="🚆" title="Treinvloot" detail={`Lv ${fleetLevel} • langere treinen`} cost={fleetCost(fleetLevel)} cash={cash} onPress={() => doUpgrade('fleet')} focus={bottleneck.label === 'TREINEN'} />
        <Upgrade icon="➕" title="Perron 3" detail="aangesloten op passage" cost={platform3Cost} cash={cash} onPress={buildP3} done={platform3} />
        <Upgrade icon="☕" title="Winkels" detail={`Lv ${retailLevel} • ${money(retailIncome(retailLevel))}/s`} cost={retailCost(retailLevel)} cash={cash} onPress={() => doUpgrade('retail')} />
        <Upgrade icon="🎫" title="Service" detail={`Lv ${ticketLevel} • +${Math.round((fareMultiplier(ticketLevel) - 1) * 100)}%`} cost={ticketCost(ticketLevel)} cash={cash} onPress={() => doUpgrade('tickets')} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#071017' },
  menu: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, backgroundColor: '#08131a' },
  kicker: { color: '#7dc4e8', fontSize: 10, fontWeight: '900', letterSpacing: 2, marginBottom: 11 },
  logo: { color: '#f3f7f8', fontSize: 48, lineHeight: 44, fontWeight: '900', letterSpacing: -2, textAlign: 'center' },
  subtitle: { color: '#9eb0b8', fontSize: 14, lineHeight: 21, textAlign: 'center', maxWidth: 390, marginTop: 18, marginBottom: 25 },
  primary: { backgroundColor: '#f4c95d', minWidth: 230, borderRadius: 12, paddingVertical: 16, alignItems: 'center', borderWidth: 1, borderColor: '#ffe39a' },
  primaryText: { color: '#111820', fontSize: 15, fontWeight: '900', letterSpacing: 1 },

  hud: { flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 6, backgroundColor: '#08141b', borderBottomWidth: 1, borderBottomColor: '#29404b' },
  hudCell: { flex: 1, alignItems: 'center' },
  hudLabel: { color: '#708792', fontSize: 6.2, fontWeight: '900', letterSpacing: 0.5 },
  hudValue: { color: '#eef4f6', fontSize: 12.5, fontWeight: '900', marginTop: 2 },
  hudMoney: { color: '#68e39a', fontSize: 12.5, fontWeight: '900', marginTop: 2 },
  hudWarn: { color: '#ffd06d', fontSize: 7.4, fontWeight: '900', marginTop: 4 },

  cameraBar: { flexDirection: 'row', gap: 4, padding: 5, backgroundColor: '#0c1b23', borderBottomWidth: 1, borderBottomColor: '#29414c' },
  cameraButton: { flex: 1, minHeight: 31, borderRadius: 7, borderWidth: 1, borderColor: '#385d70', backgroundColor: '#13252e', alignItems: 'center', justifyContent: 'center' },
  cameraWarn: { borderColor: '#b88742', backgroundColor: '#272319' },
  cameraText: { color: '#c5dce5', fontSize: 5.7, fontWeight: '900' },

  viewport: { flex: 1, overflow: 'hidden', backgroundColor: '#cfe4b7', position: 'relative' },
  worldMover: { position: 'absolute', left: 0, top: 0, width: WORLD_WIDTH, height: WORLD_HEIGHT },
  worldCanvas: { width: WORLD_WIDTH, height: WORLD_HEIGHT, position: 'relative', overflow: 'hidden', backgroundColor: '#cfe4b7' },
  motionLayer: { position: 'absolute', left: 0, top: 0, width: WORLD_WIDTH, height: WORLD_HEIGHT, zIndex: 16 },
  walker: { position: 'absolute', width: 7, height: 17, alignItems: 'center' },
  walkerHead: { width: 4.2, height: 4.2, borderRadius: 3, backgroundColor: '#efc79d' },
  walkerBody: { width: 4.5, height: 7, borderRadius: 1.2, marginTop: 1 },
  walkerLegs: { width: 5, height: 3, borderLeftWidth: 1.2, borderRightWidth: 1.2, borderColor: '#334952', marginTop: 0.5 },

  platformCrowd: { position: 'absolute', left: PLATFORM_X + 78, width: 500, minHeight: 44, zIndex: 18, flexDirection: 'row', flexWrap: 'wrap', gap: 4, transform: [{ rotateZ: '-8deg' }] },
  platformPerson: { width: 7, height: 14, alignItems: 'center' },
  platformHead: { width: 3.8, height: 3.8, borderRadius: 2.2, backgroundColor: '#efc79d' },
  platformBody: { width: 4.4, height: 6.3, borderRadius: 1, marginTop: 1 },
  platformLegs: { width: 4.8, height: 2.8, borderLeftWidth: 1, borderRightWidth: 1, borderColor: '#344750' },

  trainAtPlatform: { position: 'absolute', left: TRAIN_X, zIndex: 24, alignItems: 'flex-start' },
  trainConsist: { flexDirection: 'row', alignItems: 'center', transform: [{ rotateZ: '-8deg' }], position: 'relative' },
  trainSetShadow: { height: 8, marginRight: -1, marginLeft: -2, marginTop: 20, backgroundColor: 'rgba(10,20,25,0.18)', borderRadius: 5, position: 'absolute' },
  trainSet: { height: 31, backgroundColor: '#edf3f5', borderWidth: 2, borderRadius: 6, overflow: 'hidden', position: 'relative' },
  trainReady: { backgroundColor: '#baf5ca' },
  trainLate: { backgroundColor: '#f4adb5' },
  trainRoof: { position: 'absolute', left: 7, right: 7, top: 1, height: 3, borderRadius: 2, backgroundColor: '#c4d1d6' },
  trainNose: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 10 },
  trainBelt: { position: 'absolute', left: 10, right: 0, top: 13, height: 2, backgroundColor: '#8299a3' },
  trainWindowRow: { position: 'absolute', left: 17, right: 10, top: 6, flexDirection: 'row', justifyContent: 'space-around' },
  trainWindow: { width: 11, height: 5, borderRadius: 1.3, backgroundColor: '#264d61', borderWidth: 0.5, borderColor: '#8cb6c8' },
  trainDoor: { position: 'absolute', right: 9, bottom: 5, width: 9, height: 12, borderWidth: 1, borderColor: '#59727e', backgroundColor: '#cbdde4' },
  trainDoorOpen: { backgroundColor: '#13242c', borderColor: '#536b76' },
  trainUnderframe: { position: 'absolute', left: 12, right: 8, bottom: 0, height: 4, backgroundColor: '#4f5b60' },
  bogie: { position: 'absolute', bottom: -2, width: 18, height: 5, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bogieA: { left: 18 },
  bogieB: { right: 18 },
  wheel: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#273238', borderWidth: 1, borderColor: '#66747a' },
  trainCode: { color: '#173748', fontSize: 6.2, fontWeight: '900', textAlign: 'center', marginTop: 16 },
  coupler: { width: 7, height: 3, backgroundColor: '#68777d' },
  trainStatus: { color: '#e1ebee', backgroundColor: 'rgba(7,17,23,0.94)', borderRadius: 5, borderWidth: 1, borderColor: '#314953', paddingHorizontal: 6, paddingVertical: 4, fontSize: 5.8, fontWeight: '900', marginTop: 6, maxWidth: 435 },
  motionStatus: { color: '#e0ebee', backgroundColor: 'rgba(7,17,23,0.9)', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 4, fontSize: 6, fontWeight: '900', marginTop: 5 },
  readyText: { color: '#69e99b', borderColor: '#4ea16d' },
  lateText: { color: '#ff8b77', borderColor: '#9c4c43' },

  dragHint: { position: 'absolute', right: 8, top: 8, backgroundColor: 'rgba(7,17,23,0.78)', borderRadius: 6, borderWidth: 1, borderColor: '#405761', paddingHorizontal: 8, paddingVertical: 5 },
  dragHintText: { color: '#dce9ed', fontSize: 6.2, fontWeight: '900' },
  messageFloat: { position: 'absolute', left: 8, right: 8, bottom: 8, minHeight: 40, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, backgroundColor: 'rgba(7,16,22,0.94)', borderRadius: 9, borderWidth: 1, borderColor: '#34505e' },
  messageLamp: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#5bc2f4', marginRight: 8, borderWidth: 1, borderColor: '#a9e2fb' },
  messageText: { flex: 1, color: '#c8d7dd', fontSize: 7.8, lineHeight: 11, fontWeight: '700' },

  blockedFloat: { position: 'absolute', left: 8, right: 8, bottom: 56, backgroundColor: 'rgba(49,31,12,0.97)', borderWidth: 1, borderColor: '#d49b47', borderRadius: 9, padding: 8 },
  blockedTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  blockedTrain: { color: '#ffe8b9', fontSize: 8, fontWeight: '900' },
  blockedDelay: { color: '#ffc565', fontSize: 11, fontWeight: '900' },
  divertRow: { flexDirection: 'row', gap: 5, marginTop: 6 },
  divert: { flex: 1, minHeight: 29, borderRadius: 6, borderWidth: 1, borderColor: '#d29a47', backgroundColor: '#382b18', alignItems: 'center', justifyContent: 'center' },
  divertText: { color: '#ffdc9b', fontSize: 7, fontWeight: '900' },
  disabled: { opacity: 0.3 },

  progressBar: { backgroundColor: '#0c1820', borderTopWidth: 1, borderTopColor: '#263c47', paddingHorizontal: 8, paddingVertical: 5 },
  progressTop: { flexDirection: 'row', justifyContent: 'space-between' },
  progressTitle: { color: '#d3e4ea', fontSize: 6.5, fontWeight: '900' },
  progressMeta: { color: '#708995', fontSize: 5.6, fontWeight: '800' },
  progressTrack: { height: 5, borderRadius: 2.5, overflow: 'hidden', backgroundColor: '#1c2d35', marginTop: 4 },
  progressFill: { height: '100%', backgroundColor: '#59bdf4' },

  upgradeDock: { maxHeight: 108, backgroundColor: '#071116', borderTopWidth: 1, borderTopColor: '#263a43' },
  upgradeRail: { gap: 7, paddingHorizontal: 7, paddingVertical: 7 },
  upgrade: { width: 144, minHeight: 91, backgroundColor: '#edf2f3', borderWidth: 2, borderColor: '#526d7b', borderRadius: 11, padding: 7, flexDirection: 'row', alignItems: 'center', gap: 7 },
  affordable: { borderColor: '#d9af4b' },
  focus: { borderColor: '#ef765f', borderWidth: 3, backgroundColor: '#fff1ed' },
  done: { borderColor: '#4eaf79', backgroundColor: '#e6f5eb' },
  upgradeIconWrap: { width: 31, height: 31, borderRadius: 9, backgroundColor: '#d8e4e8', alignItems: 'center', justifyContent: 'center' },
  upgradeIcon: { fontSize: 19 },
  upgradeText: { flex: 1 },
  upgradeTitle: { color: '#173547', fontSize: 7.6, fontWeight: '900' },
  upgradeDesc: { color: '#647b86', fontSize: 5.4, marginTop: 2, fontWeight: '700' },
  upgradeCost: { color: '#2f7d49', fontSize: 5.9, fontWeight: '900' },
});