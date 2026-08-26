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
import Svg, { Circle, G, Line, Polygon, Rect, Text as SvgText } from 'react-native-svg';

const DESTINATIONS = [
  { id: 'noorddam', name: 'Noorddam', code: 'NDR', fare: 1, unlock: 1, color: '#4aa8ff' },
  { id: 'havenstad', name: 'Havenstad', code: 'HVN', fare: 2, unlock: 1, color: '#43d88e' },
  { id: 'oostpoort', name: 'Oostpoort', code: 'OOS', fare: 3, unlock: 2, color: '#ffad55' },
  { id: 'luchthaven', name: 'Luchthaven', code: 'AIR', fare: 4, unlock: 3, color: '#b38cff' },
];

const TRAIN_TYPES = [
  { code: 'SPR', name: 'Sprinter', setCapacity: 180, dwell: 7, visualWidth: 100 },
  { code: 'IC', name: 'Intercity', setCapacity: 260, dwell: 9, visualWidth: 116 },
  { code: 'EXP', name: 'Express', setCapacity: 340, dwell: 11, visualWidth: 130 },
];

const SAVE_KEY = 'rail-rush-hour-v015';
const LEGACY_SAVE_KEY = 'rail-rush-hour-v014';
const TICK_MS = 1000;
const SERVICE_INTERVAL = 17;
const DELAY_MARGIN = 12;
const ARRIVAL_MS = 2900;
const DEPARTURE_MS = 3200;
const WORLD_WIDTH = 1920;
const WORLD_HEIGHT = 560;
const ISO_SLOPE = 0.16;
const PLATFORM_X = 1160;
const PLATFORM_LENGTH = 630;
const TRAIN_X = 1280;
const LANE_Y = { 1: 150, 2: 292, 3: 434 };

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
  const s = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
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
    // Persistence is optional in the web prototype.
  }
};

const isoStrip = (x, y, w, d) => `${x},${y} ${x + w},${y - w * ISO_SLOPE} ${x + w + d},${y - w * ISO_SLOPE + d * 0.72} ${x + d},${y + d * 0.72}`;
const diamond = (cx, cy, w, h) => `${cx},${cy - h / 2} ${cx + w / 2},${cy} ${cx},${cy + h / 2} ${cx - w / 2},${cy}`;

function Tree({ x, y, scale = 1 }) {
  return (
    <G>
      <Rect x={x - 1.5 * scale} y={y} width={3 * scale} height={8 * scale} fill="#704b2c" />
      <Circle cx={x} cy={y - 4 * scale} r={7 * scale} fill="#2f7b47" />
      <Circle cx={x - 4 * scale} cy={y} r={5 * scale} fill="#3d9257" />
      <Circle cx={x + 4 * scale} cy={y} r={5 * scale} fill="#286d3f" />
    </G>
  );
}

function CarSvg({ x, y, color = '#4aa8ff' }) {
  return (
    <G>
      <Polygon points={`${x},${y} ${x + 15},${y - 4} ${x + 21},${y + 1} ${x + 6},${y + 5}`} fill="#10171a" opacity="0.32" />
      <Polygon points={`${x},${y - 3} ${x + 14},${y - 7} ${x + 20},${y - 2} ${x + 6},${y + 2}`} fill={color} stroke="#e2eff4" strokeWidth="0.7" />
      <Polygon points={`${x + 5},${y - 4.5} ${x + 10},${y - 6} ${x + 14},${y - 3} ${x + 9},${y - 1.5}`} fill="#294d61" />
      <Circle cx={x + 4} cy={y + 1} r="1.4" fill="#10171a" />
      <Circle cx={x + 16} cy={y - 2.2} r="1.4" fill="#10171a" />
    </G>
  );
}

function PersonSvg({ x, y, color = '#597f94', accent = '#efc79d' }) {
  return (
    <G>
      <Circle cx={x} cy={y} r="2" fill={accent} />
      <Rect x={x - 2} y={y + 2} width="4" height="6" rx="1.2" fill={color} />
      <Line x1={x - 1} y1={y + 8} x2={x - 2} y2={y + 11} stroke="#26343b" strokeWidth="1.2" />
      <Line x1={x + 1} y1={y + 8} x2={x + 2} y2={y + 11} stroke="#26343b" strokeWidth="1.2" />
    </G>
  );
}

function CapacityBadge({ x, y, label, value, max, hot }) {
  const p = pct(value, max);
  return (
    <G>
      <Rect x={x} y={y} width="118" height="36" rx="6" fill={hot ? '#4a2521' : '#0a171d'} stroke={hot ? '#ff785f' : '#52707d'} strokeWidth="1.2" />
      <SvgText x={x + 7} y={y + 11} fontSize="6" fontWeight="900" fill="#8da5b0">{label}</SvgText>
      <SvgText x={x + 7} y={y + 24} fontSize="9" fontWeight="900" fill="#edf5f7">{value}/{max}</SvgText>
      <Rect x={x + 63} y={y + 19} width="47" height="5" rx="2.5" fill="#203039" />
      <Rect x={x + 63} y={y + 19} width={47 * p / 100} height="5" rx="2.5" fill={hot ? '#ed765f' : '#58b9ee'} />
    </G>
  );
}

function FlowRoute({ x, y, dx, dy, amount, color, label }) {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(progress, { toValue: 1, duration: 2100, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [progress]);
  const tx = progress.interpolate({ inputRange: [0, 1], outputRange: [0, dx] });
  const ty = progress.interpolate({ inputRange: [0, 1], outputRange: [0, dy] });
  const count = Math.min(11, Math.max(1, Math.ceil(amount / 3)));
  return (
    <View pointerEvents="none" style={styles.motionLayer}>
      <Text style={[styles.routeLabel, { left: x + dx * 0.45, top: y + dy * 0.45 - 18 }]}>{label}</Text>
      {Array.from({ length: count }).map((_, i) => (
        <Animated.View
          key={i}
          style={[
            styles.walker,
            { left: x - i * 14, top: y + (i % 3) * 5, transform: [{ translateX: tx }, { translateY: ty }] },
          ]}
        >
          <View style={[styles.walkerHead, i % 4 === 0 && { backgroundColor: color }]} />
          <View style={styles.walkerBody} />
        </Animated.View>
      ))}
    </View>
  );
}

function TrafficCar({ delay, color, startX = -60, startY = 440, dx = 520, dy = -83 }) {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.delay(delay),
      Animated.timing(progress, { toValue: 1, duration: 5200, useNativeDriver: true }),
      Animated.timing(progress, { toValue: 0, duration: 0, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [delay, progress]);
  const tx = progress.interpolate({ inputRange: [0, 1], outputRange: [0, dx] });
  const ty = progress.interpolate({ inputRange: [0, 1], outputRange: [0, dy] });
  return (
    <Animated.View pointerEvents="none" style={[styles.trafficCar, { left: startX, top: startY, backgroundColor: color, transform: [{ translateX: tx }, { translateY: ty }, { rotateZ: '-9deg' }] }]}>
      <View style={styles.trafficWindow} />
    </Animated.View>
  );
}

function TrainSprite({ train, ready, late, moving, doorsOpen, onPress }) {
  if (!train) return null;
  const setWidth = train.type.visualWidth;
  const body = (
    <View style={[styles.trainConsist, moving && styles.trainMoving]}>
      {Array.from({ length: train.sets }).map((_, i) => (
        <React.Fragment key={`${train.id}-${i}`}>
          {i > 0 ? <View style={styles.coupler} /> : null}
          <View style={[styles.trainSet, { width: setWidth, borderColor: train.destination.color }, ready && styles.trainReady, late && styles.trainLate]}>
            <View style={[styles.trainNose, { backgroundColor: train.destination.color }]} />
            <View style={styles.trainWindowRow}>{Array.from({ length: Math.max(4, Math.round(setWidth / 20)) }).map((_, w) => <View key={w} style={styles.trainWindow} />)}</View>
            <View style={[styles.trainDoor, doorsOpen && styles.trainDoorOpen]} />
            <View style={styles.trainFillTrack}><View style={[styles.trainFill, { width: `${Math.min(100, Math.round((train.onboard / Math.max(1, train.capacity)) * 100))}%` }]} /></View>
            <Text style={styles.trainCode}>{train.type.code}</Text>
          </View>
        </React.Fragment>
      ))}
    </View>
  );
  return onPress ? <Pressable hitSlop={16} onPress={onPress} style={styles.trainTap}>{body}</Pressable> : body;
}

function PlatformCrowd({ lane, count, color }) {
  const dots = Math.min(30, Math.max(0, Math.ceil(count / 8)));
  const top = LANE_Y[lane] - 2;
  return (
    <View pointerEvents="none" style={[styles.platformCrowd, { top }]}>
      {Array.from({ length: dots }).map((_, i) => (
        <View key={i} style={styles.platformPerson}>
          <View style={[styles.platformHead, i % 4 === 0 && { backgroundColor: color }]} />
          <View style={styles.platformBody} />
        </View>
      ))}
    </View>
  );
}

function ExchangeFlow({ train, lane, visible }) {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!visible) return undefined;
    const loop = Animated.loop(Animated.timing(progress, { toValue: 1, duration: 1250, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [visible, progress]);
  if (!train || !visible) return null;
  const txIn = progress.interpolate({ inputRange: [0, 1], outputRange: [0, 30] });
  const tyIn = progress.interpolate({ inputRange: [0, 1], outputRange: [0, -6] });
  const txOut = progress.interpolate({ inputRange: [0, 1], outputRange: [24, -8] });
  const tyOut = progress.interpolate({ inputRange: [0, 1], outputRange: [-5, 2] });
  return (
    <View pointerEvents="none" style={[styles.exchange, { top: LANE_Y[lane] + 49 }]}>
      <Text style={styles.exchangeText}>IN / UIT</Text>
      {[0, 1, 2].map((i) => <Animated.View key={`i-${i}`} style={[styles.exchangePerson, { left: i * 9, backgroundColor: train.destination.color, transform: [{ translateX: txIn }, { translateY: tyIn }] }]} />)}
      {[0, 1].map((i) => <Animated.View key={`o-${i}`} style={[styles.exchangePerson, styles.exchangeOut, { left: 44 + i * 9, transform: [{ translateX: txOut }, { translateY: tyOut }] }]} />)}
    </View>
  );
}

function SceneBase({ parkingLevel, gateLevel, hallLevel, retailLevel, ticketLevel, platformLevel, platform3, parkingQueue, entranceQueue, hallDemand, platformDemand, platforms, services, bottleneck }) {
  const hallTotal = sum(hallDemand);
  const parkingRows = Math.min(5, 2 + parkingLevel);
  const parkingCols = 8;
  const parkingSlots = parkingRows * parkingCols;
  const occupiedCars = Math.min(parkingSlots, Math.ceil((parkingQueue / Math.max(1, parkingCap(parkingLevel))) * parkingSlots));
  const gates = Math.min(8, 2 + gateLevel);
  const hallW = 245 + Math.min(70, hallLevel * 15);
  const kioskCount = Math.min(5, retailLevel);

  return (
    <Svg width={WORLD_WIDTH} height={WORLD_HEIGHT} viewBox={`0 0 ${WORLD_WIDTH} ${WORLD_HEIGHT}`}>
      <Rect x="0" y="0" width={WORLD_WIDTH} height={WORLD_HEIGHT} fill="#cfe4b5" />
      <Polygon points="0,405 1920,98 1920,560 0,560" fill="#9aba7d" />
      <Polygon points="-40,430 760,302 760,365 -40,493" fill="#596365" />
      <Line x1="-30" y1="463" x2="760" y2="337" stroke="#e2e4df" strokeWidth="2" strokeDasharray="13 12" opacity="0.58" />
      {[70, 155, 470, 610, 735, 1090, 1830, 1880].map((x, i) => <Tree key={i} x={x} y={i % 2 ? 405 : 375} scale={0.75 + (i % 3) * 0.08} />)}

      {/* Parking: deliberately broad, but cars remain small. */}
      <Polygon points={diamond(260, 270, 455 + Math.min(80, parkingLevel * 12), 210 + Math.min(45, parkingLevel * 6))} fill="#899597" stroke={bottleneck === 'PARKEREN' ? '#ff7058' : '#d5dddd'} strokeWidth={bottleneck === 'PARKEREN' ? 4 : 1.5} />
      <SvgText x="48" y="133" fontSize="12" fontWeight="900" fill="#17384a">1  PARKEREN</SvgText>
      <SvgText x="48" y="149" fontSize="8" fontWeight="700" fill="#48636d">Lv {parkingLevel} • +{parkingInflow(parkingLevel)}/s reizigersaanvoer</SvgText>
      {Array.from({ length: parkingSlots }).map((_, i) => {
        const row = Math.floor(i / parkingCols);
        const col = i % parkingCols;
        const x = 80 + col * 39 + row * 10;
        const y = 205 + row * 26 - col * 6.2;
        return <G key={i}><Polygon points={`${x},${y} ${x + 29},${y - 4.6} ${x + 35},${y + 1} ${x + 6},${y + 5.6}`} fill="none" stroke="#d9dfdf" strokeWidth="0.8" />{i < occupiedCars ? <CarSvg x={x + 7} y={y} color={i % 4 === 0 ? '#ed6d62' : i % 4 === 1 ? '#4aa8ff' : i % 4 === 2 ? '#f0c64f' : '#e8eef0'} /> : null}</G>;
      })}
      <CapacityBadge x={200} y={382} label="PARKEERBEZETTING" value={parkingQueue} max={parkingCap(parkingLevel)} hot={bottleneck === 'PARKEREN'} />

      {/* Entrance */}
      <Polygon points={diamond(620, 247, 230, 125)} fill="#a2abab" stroke={bottleneck === 'ENTREE' ? '#ff7058' : '#d8dfdf'} strokeWidth={bottleneck === 'ENTREE' ? 4 : 1.5} />
      <SvgText x="526" y="151" fontSize="12" fontWeight="900" fill="#17384a">2  POORTJES</SvgText>
      <SvgText x="526" y="167" fontSize="8" fontWeight="700" fill="#48636d">Lv {gateLevel} • {gateRate(gateLevel)}/s</SvgText>
      <Polygon points={isoStrip(550, 219, 120, 38)} fill="#354a50" stroke="#718993" strokeWidth="1.3" />
      {Array.from({ length: gates }).map((_, i) => {
        const gx = 565 + i * 15;
        const gy = 241 - i * 2.5;
        return <G key={i}><Rect x={gx} y={gy} width="6" height="21" fill="#536d76" stroke="#9eb3ba" strokeWidth="0.8" /><Circle cx={gx + 3} cy={gy + 5} r="1.5" fill="#50e18a" /></G>;
      })}
      {Array.from({ length: Math.min(22, Math.ceil(entranceQueue / 4)) }).map((_, i) => <PersonSvg key={i} x={535 + (i % 8) * 14 + Math.floor(i / 8) * 5} y={314 - (i % 8) * 2.4 + Math.floor(i / 8) * 13} color={bottleneck === 'ENTREE' ? '#d66a56' : '#507f9a'} />)}
      <CapacityBadge x={580} y={351} label="WACHTRIJ" value={entranceQueue} max={entranceBuffer(gateLevel)} hot={bottleneck === 'ENTREE'} />

      {/* Station building: a building, not an entire district. */}
      <Polygon points={diamond(880, 245, 390, 190)} fill="#b6b5aa" stroke={bottleneck === 'HAL' ? '#ff7058' : '#e5e0d5'} strokeWidth={bottleneck === 'HAL' ? 4 : 1.5} />
      <SvgText x="742" y="117" fontSize="12" fontWeight="900" fill="#17384a">3  STATIONSGEBOUW</SvgText>
      <SvgText x="742" y="133" fontSize="8" fontWeight="700" fill="#48636d">hal Lv {hallLevel} • winkels {retailLevel} • service {ticketLevel}</SvgText>
      <Polygon points={isoStrip(760, 202, hallW, 70)} fill="#5a7480" stroke="#d6e5eb" strokeWidth="1.5" />
      <Polygon points={`${760},${202} ${810},${238} ${810},${302} ${760},${266}`} fill="#354c56" />
      <Polygon points={`${810},${238} ${760 + hallW + 70},${202 - hallW * ISO_SLOPE + 50} ${760 + hallW + 70},${266 - hallW * ISO_SLOPE + 50} ${810},${302}`} fill="#415c67" />
      <Polygon points={isoStrip(775, 193, hallW - 24, 55)} fill="#273b45" />
      <SvgText x="820" y="226" fontSize="9" fontWeight="900" fill="#edf6f8">CENTRAAL</SvgText>
      {Array.from({ length: 6 }).map((_, i) => <Rect key={i} x={820 + i * 27} y={250 - i * 4.3} width="14" height="20" fill="#79b5cf" stroke="#c9e7f1" strokeWidth="0.8" />)}
      {Array.from({ length: kioskCount }).map((_, i) => <G key={i}><Polygon points={isoStrip(770 + i * 49, 333 - i * 8, 35, 19)} fill={i % 2 ? '#795a37' : '#6d4631'} stroke="#d2b27a" strokeWidth="0.8" /><SvgText x={777 + i * 49} y={342 - i * 8} fontSize="5" fontWeight="900" fill="#ffe2b0">{i % 2 ? 'SHOP' : 'CAFE'}</SvgText></G>)}
      {Array.from({ length: Math.min(34, Math.ceil(hallTotal / 7)) }).map((_, i) => <PersonSvg key={i} x={750 + (i % 12) * 20 + Math.floor(i / 12) * 6} y={382 - (i % 12) * 3.2 + Math.floor(i / 12) * 15} color={i % 5 === 0 ? '#d09547' : '#507f9a'} />)}
      <CapacityBadge x={850} y={410} label="HAL" value={hallTotal} max={hallCap(hallLevel)} hot={bottleneck === 'HAL'} />

      {/* Concourse / connector */}
      <Polygon points={isoStrip(1042, 238, 115, 34)} fill="#68777b" stroke="#d5dddd" strokeWidth="1" />
      <SvgText x="1058" y="245" fontSize="6" fontWeight="900" fill="#eef5f7">NAAR PERRONS</SvgText>

      {/* Platforms are now the dominant long objects. */}
      <SvgText x="1150" y="45" fontSize="12" fontWeight="900" fill="#17384a">4  PERRONS & TREINEN</SvgText>
      <SvgText x="1150" y="61" fontSize="8" fontWeight="700" fill="#48636d">lange perrons • treinlengte is de schaalreferentie</SvgText>
      {[1, 2, 3].map((lane) => {
        const locked = lane === 3 && !platform3;
        const serviceForLane = (d) => services.find((s) => s.destination.id === d.id && s.status !== 'departed');
        const waiting = DESTINATIONS.reduce((acc, d) => acc + (((serviceForLane(d)?.actualLane || serviceForLane(d)?.plannedLane) === lane) ? platformDemand[d.id] : 0), 0);
        const train = platforms[lane];
        const color = train?.destination?.color || '#778a93';
        const y = LANE_Y[lane];
        const hot = (bottleneck === 'PERRONS' || bottleneck === 'TREINEN') && !locked;
        return (
          <G key={lane} opacity={locked ? 0.56 : 1}>
            <Polygon points={isoStrip(PLATFORM_X, y, PLATFORM_LENGTH, 50)} fill={locked ? '#887f70' : '#aaa89c'} stroke={hot ? '#ff7058' : '#e2dfd4'} strokeWidth={hot ? 3.5 : 1.5} />
            <Polygon points={isoStrip(PLATFORM_X + 10, y + 42, PLATFORM_LENGTH - 5, 25)} fill="#263136" />
            <Line x1={PLATFORM_X + 18} y1={y + 50} x2={PLATFORM_X + PLATFORM_LENGTH} y2={y + 50 - (PLATFORM_LENGTH - 18) * ISO_SLOPE} stroke="#bac3c6" strokeWidth="2.4" />
            <Line x1={PLATFORM_X + 26} y1={y + 61} x2={PLATFORM_X + PLATFORM_LENGTH + 8} y2={y + 61 - (PLATFORM_LENGTH - 18) * ISO_SLOPE} stroke="#bac3c6" strokeWidth="2.4" />
            <Rect x={PLATFORM_X + 8} y={y - 4} width="42" height="24" rx="4" fill="#0a171d" />
            <SvgText x={PLATFORM_X + 15} y={y + 7} fontSize="8" fontWeight="900" fill="#fff">P{lane}</SvgText>
            <SvgText x={PLATFORM_X + 15} y={y + 17} fontSize="6" fontWeight="900" fill={locked ? '#d7c084' : color}>{locked ? 'BOUW' : train ? train.destination.code : 'VRIJ'}</SvgText>
            {!locked && Array.from({ length: Math.min(4, 1 + Math.floor(platformLevel / 2)) }).map((_, i) => {
              const px = PLATFORM_X + 115 + i * 120;
              const py = y - 18 - i * 19;
              return <G key={i}><Line x1={px} y1={py + 35} x2={px} y2={py + 10} stroke="#4d5d62" strokeWidth="3" /><Line x1={px - 28} y1={py + 10} x2={px + 45} y2={py - 2} stroke="#66777b" strokeWidth="5" /></G>;
            })}
            {locked ? <SvgText x={PLATFORM_X + 225} y={y + 20} fontSize="10" fontWeight="900" fill="#f0d48b">BOUWTERREIN PERRON 3</SvgText> : null}
            {!locked ? <G><Rect x={PLATFORM_X + 510} y={y + 52} width="100" height="25" rx="4" fill="#0a171d" opacity="0.92" /><SvgText x={PLATFORM_X + 518} y={y + 62} fontSize="5.5" fontWeight="900" fill="#849aa4">WACHTEND</SvgText><SvgText x={PLATFORM_X + 518} y={y + 73} fontSize="8" fontWeight="900" fill={waiting >= platformCap(platformLevel) * 0.9 ? '#ff806d' : '#eef4f6'}>{waiting}/{platformCap(platformLevel)}</SvgText></G> : null}
          </G>
        );
      })}

      <Polygon points={diamond(1870, 385, 80, 80)} fill="#7c9f73" stroke="#d8e5d1" strokeWidth="1.5" strokeDasharray="7 5" />
      <SvgText x="1843" y="380" fontSize="8" fontWeight="900" fill="#234b39">VERDER »</SvgText>
      <SvgText x="1840" y="393" fontSize="5.5" fill="#446b59">opstelterrein</SvgText>
    </Svg>
  );
}

function IsometricWorld(props) {
  const {
    parkingLevel, gateLevel, hallLevel, retailLevel, ticketLevel, platformLevel, stationLevel, platform3,
    parkingQueue, entranceQueue, hallDemand, platformDemand, platforms, services, now, bottleneck, onDepart,
    arrivalTrain, arrivalLane, arrivalProgress, departureTrain, departureLane, departureProgress,
  } = props;
  const hallTotal = sum(hallDemand);
  const platformTotal = sum(platformDemand);
  const arrivalX = arrivalProgress.interpolate({ inputRange: [0, 1], outputRange: [-520, 0] });
  const arrivalY = arrivalProgress.interpolate({ inputRange: [0, 1], outputRange: [83, 0] });
  const departureX = departureProgress.interpolate({ inputRange: [0, 1], outputRange: [0, 690] });
  const departureY = departureProgress.interpolate({ inputRange: [0, 1], outputRange: [0, -110] });

  return (
    <View style={styles.sceneCanvas}>
      <SceneBase {...props} />
      <TrafficCar delay={0} color="#4aa8ff" />
      <TrafficCar delay={1700} color="#ef6d62" startY={451} />
      <TrafficCar delay={3400} color="#efc64f" startY={461} />
      <FlowRoute x={410} y={292} dx={150} dy={-32} amount={Math.min(parkingQueue, gateRate(gateLevel))} color="#52bfff" label="naar poortjes" />
      <FlowRoute x={675} y={282} dx={125} dy={-22} amount={Math.min(entranceQueue, gateRate(gateLevel))} color="#ffd25e" label="naar hal" />
      <FlowRoute x={1010} y={268} dx={155} dy={-27} amount={Math.min(hallTotal, hallRate(hallLevel))} color="#64db93" label="naar perrons" />

      {[1, 2, 3].map((lane) => {
        if (lane === 3 && !platform3) return null;
        const waiting = DESTINATIONS.reduce((acc, d) => {
          const s = services.find((svc) => svc.destination.id === d.id && svc.status !== 'departed');
          return acc + ((s?.actualLane || s?.plannedLane) === lane ? platformDemand[d.id] : 0);
        }, 0);
        const train = platforms[lane];
        const hidden = (arrivalTrain && arrivalLane === lane) || (departureTrain && departureLane === lane);
        const depIn = train ? train.departureAt - now : 0;
        const ready = Boolean(train && train.status === 'ready' && depIn <= 0 && depIn >= -DELAY_MARGIN);
        const late = Boolean(train && train.status === 'ready' && depIn < -DELAY_MARGIN);
        return (
          <React.Fragment key={lane}>
            <PlatformCrowd lane={lane} count={waiting} color={train?.destination?.color || '#5e8395'} />
            {train && !hidden ? (
              <View style={[styles.trainAtPlatform, { top: LANE_Y[lane] + 42 }]}>
                <TrainSprite train={train} ready={ready} late={late} doorsOpen={train.status === 'dwelling'} onPress={() => onDepart(lane)} />
                <Text style={[styles.trainStatus, ready && styles.readyText, late && styles.lateText]}>
                  {train.number} → {train.destination.name} • {train.sets} stel{train.sets > 1 ? 'len' : ''} • {train.onboard}/{train.capacity} • {train.status === 'dwelling' ? `${train.remaining}s halte` : depIn > 0 ? `vertrek over ${depIn}s` : depIn >= -DELAY_MARGIN ? `VERTREK • ${DELAY_MARGIN + depIn}s marge` : `+${Math.abs(depIn + DELAY_MARGIN)}s te laat`}
                </Text>
              </View>
            ) : null}
            <ExchangeFlow train={train} lane={lane} visible={Boolean(train && train.status === 'dwelling' && !hidden)} />
          </React.Fragment>
        );
      })}

      {arrivalTrain ? (
        <Animated.View pointerEvents="none" style={[styles.trainAtPlatform, { top: LANE_Y[arrivalLane] + 42, transform: [{ translateX: arrivalX }, { translateY: arrivalY }] }]}>
          <TrainSprite train={arrivalTrain} moving />
          <Text style={styles.motionStatus}>BINNENKOMST → P{arrivalLane}</Text>
        </Animated.View>
      ) : null}
      {departureTrain ? (
        <Animated.View pointerEvents="none" style={[styles.trainAtPlatform, { top: LANE_Y[departureLane] + 42, transform: [{ translateX: departureX }, { translateY: departureY }] }]}>
          <TrainSprite train={departureTrain} moving />
          <Text style={styles.motionStatus}>VERTREK → {departureTrain.destination.name}</Text>
        </Animated.View>
      ) : null}

      <View style={styles.sceneLegend}>
        <Text style={styles.legendChip}>STATION Lv {stationLevel}</Text>
        <Text style={styles.legendChip}>👥 {parkingQueue + entranceQueue + hallTotal + platformTotal}</Text>
        <Text style={styles.legendChip}>SCHAAL: 🚗 1× • 🚆 stel ±6× auto</Text>
      </View>
    </View>
  );
}

function BalanceBar({ data }) {
  const worst = [...data].sort((a, b) => b.pressure - a.pressure)[0];
  return (
    <View style={styles.balanceCard}>
      <View style={styles.balanceHead}><Text style={styles.balanceTitle}>CAPACITEITSKETEN</Text><Text style={styles.balanceWorst}>KNELPUNT: {worst.label}</Text></View>
      <View style={styles.balanceStages}>{data.map((item, index) => <React.Fragment key={item.label}>{index > 0 ? <Text style={styles.balanceArrow}>›</Text> : null}<View style={[styles.balanceStage, item.pressure >= 90 && styles.balanceBad]}><Text style={styles.balanceLabel}>{item.label}</Text><Text style={styles.balanceValue}>{Math.min(999, item.pressure)}%</Text></View></React.Fragment>)}</View>
    </View>
  );
}

function Timetable({ services, now }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}><Text style={styles.cardTitle}>VOLGENDE TREINEN</Text><Text style={styles.clock}>{clock(now)}</Text></View>
      {services.filter((s) => s.status !== 'departed').slice(0, 5).map((s) => {
        const depIn = s.departureAt - now;
        const status = s.status === 'scheduled' ? `IN ${Math.max(0, s.arrivalAt - now)}s` : s.status === 'waiting' ? 'WACHT BUITEN' : s.status === 'arriving' ? `RIJDT → P${s.actualLane}` : s.status === 'departing' ? 'VERTREKT' : depIn > 0 ? `V OVER ${depIn}s` : depIn >= -DELAY_MARGIN ? `${Math.max(0, DELAY_MARGIN + depIn)}s MARGE` : `+${Math.abs(depIn + DELAY_MARGIN)}s`;
        return <View key={s.id} style={styles.serviceRow}><Text style={styles.serviceTime}>{clock(s.departureAt).slice(0, 5)}</Text><View style={styles.serviceMain}><Text style={styles.serviceId}>{s.number}</Text><Text style={[styles.serviceDest, { color: s.destination.color }]}>→ {s.destination.name}</Text></View><Text style={styles.servicePlatform}>P{s.actualLane || s.plannedLane}</Text><Text style={styles.serviceStatus}>{status}</Text></View>;
      })}
    </View>
  );
}

function Upgrade({ icon, title, level, description, cost, cash, onPress, focus, done }) {
  return (
    <Pressable disabled={done} onPress={onPress} style={[styles.upgrade, cash >= cost && !done && styles.affordable, focus && styles.focus, done && styles.done]}>
      <Text style={styles.upgradeIcon}>{icon}</Text><Text style={styles.upgradeTitle}>{title}</Text><Text style={styles.upgradeLevel}>{done ? 'OPEN' : `LEVEL ${level}`}</Text><Text style={styles.upgradeDesc}>{description}</Text><View style={styles.upgradeButton}><Text style={styles.upgradeButtonText}>{done ? 'ACTIEF' : `UPGRADE  ${money(cost)}`}</Text></View>
    </Pressable>
  );
}

export default function AppV15() {
  const saved = useRef(safeLoad()).current;
  const worldScrollRef = useRef(null);
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

  const syncParking = (v) => { parkingRef.current = v; setParkingQueue(v); };
  const syncEntrance = (v) => { entranceRef.current = v; setEntranceQueue(v); };
  const syncHall = (v) => { hallRef.current = v; setHallDemand(v); };
  const syncPlatformDemand = (v) => { platformDemandRef.current = v; setPlatformDemand(v); };
  const syncPlatforms = (v) => { platformsRef.current = v; setPlatforms(v); };
  const syncServices = (v) => { servicesRef.current = v; setServices(v); };
  const syncOutside = (v) => { outsideRef.current = v; setOutside(v); };

  const persist = () => safeSave({ cash: Math.round(cashRef.current), stationLevel: stationLevelRef.current, xp: Math.round(xpRef.current), parkingLevel: parkingLevelRef.current, gateLevel: gateLevelRef.current, hallLevel: hallLevelRef.current, platformLevel: platformLevelRef.current, fleetLevel: fleetLevelRef.current, retailLevel: retailLevelRef.current, ticketLevel: ticketLevelRef.current, platform3: platform3Ref.current, handled: handledRef.current, lost: lostRef.current, transported: transportedRef.current, onTime: onTimeRef.current, lastSaved: Date.now() });
  const addCash = (value) => { cashRef.current += value; setCash(Math.round(cashRef.current)); };
  const spend = (value) => { if (cashRef.current < value) return false; cashRef.current -= value; setCash(Math.round(cashRef.current)); return true; };
  const awardXp = (value) => {
    let nextXp = xpRef.current + value;
    let nextLevel = stationLevelRef.current;
    while (nextXp >= levelTarget(nextLevel)) { nextXp -= levelTarget(nextLevel); nextLevel += 1; }
    xpRef.current = nextXp; stationLevelRef.current = nextLevel; setXp(Math.round(nextXp)); setStationLevel(nextLevel);
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
    setMessage(diverted ? `${train.number} wijkt uit naar P${lane}.` : `${train.number} rijdt automatisch naar P${lane}.`);
    Animated.timing(arrivalProgress, { toValue: 1, duration: ARRIVAL_MS, useNativeDriver: true }).start(({ finished }) => {
      arrivalBusy.current = false;
      if (!finished) return;
      const alight = Math.min(moving.onboard, Math.round(moving.onboard * (0.18 + Math.random() * 0.17)));
      const transfer = Math.round(alight * (0.22 + Math.random() * 0.28));
      distributeTransfers(moving, transfer);
      const atPlatform = { ...moving, status: 'dwelling', remaining: moving.type.dwell, onboard: moving.onboard - alight, lastAlight: alight, lastTransfer: transfer };
      syncPlatforms({ ...platformsRef.current, [lane]: atPlatform });
      updateService(moving.id, { status: 'platform', actualLane: lane });
      setArrivalTrain(null); setArrivalLane(null);
      setMessage(`${moving.number} op P${lane}: ${alight} uitgestapt, ${transfer} overstappers.`);
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
    syncPlatforms({ ...platformsRef.current, [lane]: moving }); updateService(train.id, { status: 'departing' });
    setDepartureTrain(moving); setDepartureLane(lane); departureProgress.setValue(0); setMessage(`${train.number} vertrekt van P${lane}.`);
    Animated.timing(departureProgress, { toValue: 1, duration: DEPARTURE_MS, useNativeDriver: true }).start(({ finished }) => {
      departureBusy.current = false;
      if (!finished) return;
      const within = delay <= DELAY_MARGIN;
      const revenue = Math.round(train.onboard * train.destination.fare * fareMultiplier(ticketLevelRef.current));
      syncPlatforms({ ...platformsRef.current, [lane]: null }); updateService(train.id, { status: 'departed' });
      setDepartureTrain(null); setDepartureLane(null);
      handledRef.current += 1; transportedRef.current += train.onboard; if (within) onTimeRef.current += 1;
      setHandled(handledRef.current); setTransported(transportedRef.current); setOnTime(onTimeRef.current);
      addCash(revenue + (within ? 75 : 0)); awardXp(Math.round(train.onboard / 4) + (within ? 45 : 10));
      setMessage(`${train.number} → ${train.destination.name}: ${money(revenue)}${within ? ' + €75 op-tijdbonus' : ''}.`);
      persist(); setTimeout(tryArrival, 100);
    });
  };

  useEffect(() => {
    if (phase !== 'playing') return undefined;
    const timer = setInterval(() => {
      const t = nowRef.current + 1; nowRef.current = t; setNow(t);
      let nextServices = [...servicesRef.current];
      while (nextServices.filter((s) => s.status === 'scheduled').length < 6) { nextServices.push(makeService(nextServiceAt.current)); nextServiceAt.current += SERVICE_INTERVAL; }
      const newlyDue = [];
      nextServices = nextServices.map((s) => { if (s.status === 'scheduled' && s.arrivalAt <= t) { const due = { ...s, status: 'waiting', wait: 0 }; newlyDue.push(due); return due; } return s; });
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
        nextHall[d.id] -= moved; nextPlatformDemand[d.id] += moved; hallFlowBudget -= moved;
      });

      const nextPlatforms = { ...platformsRef.current };
      [1, 2, 3].forEach((lane) => {
        const current = nextPlatforms[lane];
        if (!current || current.status === 'departing') return;
        const train = { ...current };
        const board = Math.min(nextPlatformDemand[train.destination.id] || 0, Math.max(0, train.capacity - train.onboard), 30 + train.sets * 12);
        nextPlatformDemand[train.destination.id] -= board; train.onboard += board; train.lastBoard = board;
        if (train.status === 'dwelling') { train.remaining = Math.max(0, train.remaining - 1); if (train.remaining === 0) train.status = 'ready'; }
        nextPlatforms[lane] = train;
      });

      syncParking(nextParking); syncEntrance(nextEntrance); syncHall(nextHall); syncPlatformDemand(nextPlatformDemand); syncPlatforms(nextPlatforms);
      addCash(retailIncome(retailLevelRef.current)); if (t % 10 === 0) persist(); setTimeout(tryArrival, 35);
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [phase]);

  const begin = () => {
    nowRef.current = 0; serviceIndex.current = 0; nextServiceAt.current = 3; demandCursor.current = 0; arrivalBusy.current = false; departureBusy.current = false;
    arrivalProgress.setValue(0); departureProgress.setValue(0);
    syncParking(15); syncEntrance(8);
    syncHall({ noorddam: 8, havenstad: 10, oostpoort: stationLevelRef.current >= 2 ? 5 : 0, luchthaven: stationLevelRef.current >= 3 ? 4 : 0 });
    syncPlatformDemand({ noorddam: 12, havenstad: 18, oostpoort: stationLevelRef.current >= 2 ? 7 : 0, luchthaven: stationLevelRef.current >= 3 ? 5 : 0 });
    syncPlatforms({ 1: null, 2: null, 3: null }); syncOutside([]); setArrivalTrain(null); setArrivalLane(null); setDepartureTrain(null); setDepartureLane(null);
    const initial = []; for (let i = 0; i < 8; i += 1) { initial.push(makeService(nextServiceAt.current)); nextServiceAt.current += SERVICE_INTERVAL; }
    syncServices(initial); setNow(0); setMessage('De wereld is opnieuw op schaal gezet. Treinen en perrons zijn nu de maatstaf; auto’s en reizigers zijn bewust kleiner.'); setPhase('playing');
  };

  const doUpgrade = (kind) => {
    const map = {
      parking: [parkingCost(parkingLevelRef.current), parkingLevelRef, setParkingLevel, 'Parkeren uitgebreid: het terrein groeit en de reizigersaanvoer neemt toe.'],
      gates: [gateCost(gateLevelRef.current), gateLevelRef, setGateLevel, 'Meer poortjes: de wachtrij verwerkt sneller.'],
      hall: [hallCost(hallLevelRef.current), hallLevelRef, setHallLevel, 'Stationsgebouw uitgebreid zonder de schaalverhouding te verliezen.'],
      platforms: [platformCost(platformLevelRef.current), platformLevelRef, setPlatformLevel, 'Perrons verbeterd: meer capaciteit en meer overkappingen.'],
      fleet: [fleetCost(fleetLevelRef.current), fleetLevelRef, setFleetLevel, 'Treinvloot uitgebreid: toekomstige treinen krijgen meer stellen.'],
      retail: [retailCost(retailLevelRef.current), retailLevelRef, setRetailLevel, 'Extra winkelunit gebouwd.'],
      tickets: [ticketCost(ticketLevelRef.current), ticketLevelRef, setTicketLevel, 'Service verbeterd: hogere ritopbrengst.'],
    };
    const entry = map[kind]; if (!entry) return;
    const [cost, ref, setter, text] = entry;
    if (!spend(cost)) return setMessage('Niet genoeg geld voor deze uitbreiding.');
    ref.current += 1; setter(ref.current); setMessage(text); persist();
  };

  const buildP3 = () => {
    if (platform3Ref.current) return;
    if (!spend(platform3Cost)) return setMessage('Niet genoeg geld voor Perron 3.');
    platform3Ref.current = true; setPlatform3(true); setMessage('Perron 3 gebouwd: een volledig lang perron is toegevoegd.'); persist();
  };

  if (phase === 'menu') {
    return <SafeAreaView style={styles.screen}><StatusBar barStyle="light-content" /><View style={styles.menu}><Text style={styles.kicker}>SCALE & LAYOUT / V0.15</Text><Text style={styles.logo}>RAIL{`\n`}RUSH HOUR</Text><Text style={styles.subtitle}>De levende isometrische wereld, maar opnieuw op schaal: lange perrons, lange treinen, kleinere auto’s en reizigers en meer ruimte tussen de functies.</Text><Pressable style={styles.primary} onPress={begin}><Text style={styles.primaryText}>{saved ? 'GA VERDER' : 'OPEN STATION'}</Text></Pressable></View></SafeAreaView>;
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
  const bottleneck = [...balance].sort((a, b) => b.pressure - a.pressure)[0].label;
  const blocked = outside[0] && platforms[outside[0].plannedLane] ? outside[0] : null;

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="light-content" />
      <View style={styles.hud}>
        <View style={styles.hudCell}><Text style={styles.hudLabel}>KAS</Text><Text style={styles.hudMoney}>{money(cash)}</Text></View>
        <View style={styles.hudCell}><Text style={styles.hudLabel}>STATION</Text><Text style={styles.hudValue}>Lv {stationLevel}</Text></View>
        <View style={styles.hudCell}><Text style={styles.hudLabel}>TIJD</Text><Text style={styles.hudValue}>{clock(now).slice(0, 5)}</Text></View>
        <View style={styles.hudCell}><Text style={styles.hudLabel}>KNELPUNT</Text><Text style={styles.hudWarn}>{bottleneck}</Text></View>
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.levelCard}><View style={styles.levelTop}><Text style={styles.levelTitle}>STATIONNIVEAU {stationLevel}</Text><Text style={styles.levelXp}>{xp}/{levelTarget(stationLevel)} XP</Text></View><View style={styles.levelTrack}><View style={[styles.levelFill, { width: `${pct(xp, levelTarget(stationLevel))}%` }]} /></View><Text style={styles.levelHint}>{transported} vervoerd • {handled} treinen • {onTime} binnen marge • {lost} gemiste instroom</Text></View>
        <BalanceBar data={balance} />
        <View style={styles.worldFrame}>
          <View style={styles.worldHead}><View><Text style={styles.worldKicker}>V0.15 • PROPORTION PASS</Text><Text style={styles.worldTitle}>SWIPE DOOR HET STATION</Text></View><Text style={styles.swipe}>↔ 1.920 px WERELD</Text></View>
          <View style={styles.jumpRow}>
            <Pressable style={styles.jump} onPress={() => worldScrollRef.current?.scrollTo({ x: 0, animated: true })}><Text style={styles.jumpText}>🚗 PARKEREN</Text></Pressable>
            <Pressable style={styles.jump} onPress={() => worldScrollRef.current?.scrollTo({ x: 610, animated: true })}><Text style={styles.jumpText}>🏢 STATION</Text></Pressable>
            <Pressable style={styles.jump} onPress={() => worldScrollRef.current?.scrollTo({ x: 1110, animated: true })}><Text style={styles.jumpText}>🚆 PERRONS</Text></Pressable>
          </View>
          <ScrollView ref={worldScrollRef} horizontal showsHorizontalScrollIndicator={false} nestedScrollEnabled contentContainerStyle={{ width: WORLD_WIDTH }}>
            <IsometricWorld parkingLevel={parkingLevel} gateLevel={gateLevel} hallLevel={hallLevel} retailLevel={retailLevel} ticketLevel={ticketLevel} platformLevel={platformLevel} stationLevel={stationLevel} platform3={platform3} parkingQueue={parkingQueue} entranceQueue={entranceQueue} hallDemand={hallDemand} platformDemand={platformDemand} platforms={platforms} services={services} now={now} bottleneck={bottleneck} onDepart={depart} arrivalTrain={arrivalTrain} arrivalLane={arrivalLane} arrivalProgress={arrivalProgress} departureTrain={departureTrain} departureLane={departureLane} departureProgress={departureProgress} />
          </ScrollView>
        </View>
        <View style={styles.message}><View style={styles.messageLamp} /><Text style={styles.messageText}>{message}</Text></View>
        {blocked ? <View style={styles.blocked}><View style={styles.blockedTop}><View><Text style={styles.blockedLabel}>TREIN WACHT BUITEN</Text><Text style={styles.blockedTrain}>{blocked.number} → {blocked.destination.name}</Text></View><Text style={styles.blockedDelay}>+{blocked.wait}s</Text></View><Text style={styles.blockedReason}>P{blocked.plannedLane} is bezet. Laat wachten of wijk uit naar een vrij perron.</Text><View style={styles.divertRow}>{[1, 2, 3].filter((lane) => lane !== blocked.plannedLane && (lane !== 3 || platform3)).map((lane) => <Pressable key={lane} disabled={Boolean(platforms[lane])} onPress={() => divert(lane)} style={[styles.divert, platforms[lane] && styles.disabled]}><Text style={styles.divertSmall}>{platforms[lane] ? 'BEZET' : 'WIJK UIT'}</Text><Text style={styles.divertBig}>P{lane}</Text></Pressable>)}</View></View> : null}
        <Timetable services={services} now={now} />
        <Text style={styles.sectionHeading}>BOUW & GROEI</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.upgradeRail} nestedScrollEnabled>
          <Upgrade icon="🚗" title="PARKEREN" level={parkingLevel} description={`${parkingCap(parkingLevel)} plaatsen • +${parkingInflow(parkingLevel)}/s vraag`} cost={parkingCost(parkingLevel)} cash={cash} onPress={() => doUpgrade('parking')} focus={bottleneck === 'PARKEREN'} />
          <Upgrade icon="🚪" title="POORTJES" level={gateLevel} description={`${gateRate(gateLevel)}/s doorstroom`} cost={gateCost(gateLevel)} cash={cash} onPress={() => doUpgrade('gates')} focus={bottleneck === 'ENTREE'} />
          <Upgrade icon="🏢" title="HAL" level={hallLevel} description={`${hallCap(hallLevel)} capaciteit`} cost={hallCost(hallLevel)} cash={cash} onPress={() => doUpgrade('hall')} focus={bottleneck === 'HAL'} />
          <Upgrade icon="🚉" title="PERRONS" level={platformLevel} description={`${platformCap(platformLevel)} wachtenden/perron`} cost={platformCost(platformLevel)} cash={cash} onPress={() => doUpgrade('platforms')} focus={bottleneck === 'PERRONS'} />
          <Upgrade icon="🚆" title="TREINVLOOT" level={fleetLevel} description="Langere toekomstige treinen" cost={fleetCost(fleetLevel)} cash={cash} onPress={() => doUpgrade('fleet')} focus={bottleneck === 'TREINEN'} />
          <Upgrade icon="➕" title="PERRON 3" level={1} description="Bouw een derde lang perron" cost={platform3Cost} cash={cash} onPress={buildP3} done={platform3} />
          <Upgrade icon="☕" title="WINKELS" level={retailLevel} description={`${money(retailIncome(retailLevel))}/s passief`} cost={retailCost(retailLevel)} cash={cash} onPress={() => doUpgrade('retail')} />
          <Upgrade icon="🎫" title="SERVICE" level={ticketLevel} description={`+${Math.round((fareMultiplier(ticketLevel) - 1) * 100)}% ritopbrengst`} cost={ticketCost(ticketLevel)} cash={cash} onPress={() => doUpgrade('tickets')} />
        </ScrollView>
      </ScrollView>
      <View style={styles.footer}><Text style={styles.footerText}>V0.15 • SCHAALPASS • LANGE PERRONS • KLEINERE AUTO’S & REIZIGERS • TIK GROENE TREIN</Text></View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#071017' }, scroll: { flex: 1 }, content: { paddingHorizontal: 10, paddingBottom: 28 },
  menu: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 }, kicker: { color: '#77b9dc', fontSize: 10, fontWeight: '900', letterSpacing: 2, marginBottom: 11 }, logo: { color: '#f0f5f7', fontSize: 48, lineHeight: 44, fontWeight: '900', letterSpacing: -2, textAlign: 'center' }, subtitle: { color: '#98a9b2', fontSize: 14, lineHeight: 21, textAlign: 'center', maxWidth: 390, marginTop: 18, marginBottom: 25 }, primary: { backgroundColor: '#ffd45f', minWidth: 230, borderRadius: 10, paddingVertical: 16, alignItems: 'center' }, primaryText: { color: '#111820', fontSize: 15, fontWeight: '900', letterSpacing: 1 },
  hud: { flexDirection: 'row', paddingVertical: 9, paddingHorizontal: 6, backgroundColor: '#0a151c', borderBottomWidth: 1, borderBottomColor: '#21333d' }, hudCell: { flex: 1, alignItems: 'center' }, hudLabel: { color: '#647a86', fontSize: 6.2, fontWeight: '900' }, hudValue: { color: '#e8eff2', fontSize: 12.5, fontWeight: '900', marginTop: 2 }, hudMoney: { color: '#67e396', fontSize: 12.5, fontWeight: '900', marginTop: 2 }, hudWarn: { color: '#ffca62', fontSize: 7.8, fontWeight: '900', marginTop: 4 },
  levelCard: { marginTop: 8, backgroundColor: '#0f1b22', borderWidth: 1, borderColor: '#315064', borderRadius: 10, padding: 9 }, levelTop: { flexDirection: 'row', justifyContent: 'space-between' }, levelTitle: { color: '#dce9ee', fontSize: 9, fontWeight: '900' }, levelXp: { color: '#82afc6', fontSize: 7.5, fontWeight: '900' }, levelTrack: { height: 7, marginTop: 6, backgroundColor: '#1c2a32', borderRadius: 4, overflow: 'hidden' }, levelFill: { height: '100%', backgroundColor: '#58b9ff' }, levelHint: { color: '#71858f', fontSize: 6.8, marginTop: 5, fontWeight: '700' },
  balanceCard: { marginTop: 8, backgroundColor: '#121b20', borderWidth: 1, borderColor: '#394a54', borderRadius: 9, padding: 9 }, balanceHead: { flexDirection: 'row', justifyContent: 'space-between' }, balanceTitle: { color: '#8b9ea7', fontSize: 6.4, fontWeight: '900' }, balanceWorst: { color: '#ffd267', fontSize: 6.6, fontWeight: '900' }, balanceStages: { flexDirection: 'row', alignItems: 'center', marginTop: 8 }, balanceArrow: { color: '#60717a', fontSize: 14, marginHorizontal: 2 }, balanceStage: { flex: 1, minHeight: 35, borderRadius: 5, borderWidth: 1, borderColor: '#2c3d46', backgroundColor: '#172229', alignItems: 'center', justifyContent: 'center' }, balanceBad: { borderColor: '#e16e5d', backgroundColor: '#2b1b1a' }, balanceLabel: { color: '#899aa4', fontSize: 5.1, fontWeight: '900' }, balanceValue: { color: '#eef2f4', fontSize: 9, fontWeight: '900', marginTop: 2 },
  worldFrame: { marginTop: 8, borderWidth: 1, borderColor: '#345464', borderRadius: 12, overflow: 'hidden', backgroundColor: '#0a151b' }, worldHead: { minHeight: 50, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: '#0d1b22', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, worldKicker: { color: '#6d8b98', fontSize: 6.2, fontWeight: '900' }, worldTitle: { color: '#e7f0f3', fontSize: 13, fontWeight: '900', marginTop: 2 }, swipe: { color: '#79c9f5', fontSize: 7, fontWeight: '900' }, jumpRow: { flexDirection: 'row', gap: 5, padding: 6, borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#223741' }, jump: { flex: 1, backgroundColor: '#14242d', borderWidth: 1, borderColor: '#315266', paddingVertical: 6, borderRadius: 6, alignItems: 'center' }, jumpText: { color: '#b8d0db', fontSize: 6.2, fontWeight: '900' }, sceneCanvas: { width: WORLD_WIDTH, height: WORLD_HEIGHT, position: 'relative', overflow: 'hidden', backgroundColor: '#cfe4b5' },
  motionLayer: { position: 'absolute', left: 0, top: 0, width: WORLD_WIDTH, height: WORLD_HEIGHT, zIndex: 16 }, routeLabel: { position: 'absolute', color: '#17384a', backgroundColor: 'rgba(235,245,236,0.82)', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4, fontSize: 5.5, fontWeight: '900' }, walker: { position: 'absolute', width: 6, height: 15, alignItems: 'center' }, walkerHead: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#efc79d' }, walkerBody: { width: 4, height: 7, borderRadius: 1, backgroundColor: '#527b8f', marginTop: 1 }, trafficCar: { position: 'absolute', width: 22, height: 9, borderRadius: 3, borderWidth: 1, borderColor: '#e6f0f3', zIndex: 12 }, trafficWindow: { width: 8, height: 4, borderRadius: 1, backgroundColor: '#294d61', marginLeft: 6, marginTop: 1 },
  platformCrowd: { position: 'absolute', left: PLATFORM_X + 75, width: 420, minHeight: 40, zIndex: 18, flexDirection: 'row', flexWrap: 'wrap', gap: 4, transform: [{ rotateZ: '-9deg' }] }, platformPerson: { width: 6, height: 12, alignItems: 'center' }, platformHead: { width: 3.5, height: 3.5, borderRadius: 2, backgroundColor: '#efc79d' }, platformBody: { width: 4, height: 6, borderRadius: 1, backgroundColor: '#5b7e90', marginTop: 1 },
  trainAtPlatform: { position: 'absolute', left: TRAIN_X, zIndex: 24, alignItems: 'flex-start' }, trainConsist: { flexDirection: 'row', alignItems: 'center', transform: [{ rotateZ: '-9deg' }] }, trainMoving: {}, trainTap: { padding: 4 }, trainSet: { height: 27, backgroundColor: '#e8f0f3', borderWidth: 2, borderRadius: 5, overflow: 'hidden', position: 'relative' }, trainReady: { backgroundColor: '#b6f4c8' }, trainLate: { backgroundColor: '#f4aeb6' }, trainNose: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 9 }, trainWindowRow: { position: 'absolute', left: 16, right: 8, top: 5, flexDirection: 'row', justifyContent: 'space-around' }, trainWindow: { width: 10, height: 4, borderRadius: 1, backgroundColor: '#31576b' }, trainDoor: { position: 'absolute', right: 8, bottom: 3, width: 8, height: 10, borderWidth: 1, borderColor: '#4d6876', backgroundColor: '#c8dbe3' }, trainDoorOpen: { backgroundColor: '#16242b' }, trainFillTrack: { position: 'absolute', left: 15, right: 20, bottom: 3, height: 3, borderRadius: 2, backgroundColor: '#b9c9d0', overflow: 'hidden' }, trainFill: { height: '100%', backgroundColor: '#4aa8ff' }, trainCode: { color: '#173748', fontSize: 6.2, fontWeight: '900', textAlign: 'center', marginTop: 13 }, coupler: { width: 7, height: 3, backgroundColor: '#6d7b81' }, trainStatus: { color: '#dce8ec', backgroundColor: 'rgba(8,18,24,0.92)', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 3, fontSize: 5.7, fontWeight: '900', marginTop: 5, maxWidth: 410 }, motionStatus: { color: '#d9e7eb', backgroundColor: 'rgba(8,18,24,0.86)', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 3, fontSize: 6, fontWeight: '900', marginTop: 4 }, readyText: { color: '#5ee792' }, lateText: { color: '#ff8875' },
  exchange: { position: 'absolute', left: TRAIN_X - 38, width: 80, height: 34, zIndex: 25 }, exchangeText: { position: 'absolute', top: 21, left: 5, color: '#21404e', backgroundColor: 'rgba(237,245,238,0.85)', fontSize: 5, fontWeight: '900', paddingHorizontal: 3, borderRadius: 2 }, exchangePerson: { position: 'absolute', top: 6, width: 5, height: 10, borderRadius: 2 }, exchangeOut: { backgroundColor: '#d9905d' }, sceneLegend: { position: 'absolute', left: 12, bottom: 10, zIndex: 30, flexDirection: 'row', gap: 6 }, legendChip: { color: '#e7eef1', backgroundColor: 'rgba(7,16,22,0.84)', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 4, fontSize: 6, fontWeight: '900' },
  message: { minHeight: 42, flexDirection: 'row', alignItems: 'center', marginTop: 8, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#0a1218', borderWidth: 1, borderColor: '#20323b', borderRadius: 8 }, messageLamp: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#5bbcf2', marginRight: 8 }, messageText: { flex: 1, color: '#a6b5bd', fontSize: 8.5, lineHeight: 12, fontWeight: '700' },
  blocked: { marginTop: 8, backgroundColor: '#2a1b0d', borderWidth: 1.5, borderColor: '#d3953c', borderRadius: 9, padding: 9 }, blockedTop: { flexDirection: 'row', justifyContent: 'space-between' }, blockedLabel: { color: '#bd9459', fontSize: 6.5, fontWeight: '900' }, blockedTrain: { color: '#ffe7b6', fontSize: 13, fontWeight: '900', marginTop: 2 }, blockedDelay: { color: '#ffc05b', fontSize: 15, fontWeight: '900' }, blockedReason: { color: '#bca071', fontSize: 8, marginTop: 6 }, divertRow: { flexDirection: 'row', gap: 7, marginTop: 8 }, divert: { flex: 1, minHeight: 44, borderRadius: 7, borderWidth: 1, borderColor: '#d1953d', backgroundColor: '#34240f', alignItems: 'center', justifyContent: 'center' }, divertSmall: { color: '#c4a46d', fontSize: 6, fontWeight: '900' }, divertBig: { color: '#ffda91', fontSize: 16, fontWeight: '900' }, disabled: { opacity: 0.3 },
  card: { marginTop: 8, backgroundColor: '#0d161d', borderWidth: 1, borderColor: '#2b3b45', borderRadius: 9, padding: 9 }, cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, cardTitle: { color: '#718591', fontSize: 6.8, fontWeight: '900' }, clock: { color: '#ffd65a', fontSize: 13, fontWeight: '900' }, serviceRow: { minHeight: 38, flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#182630' }, serviceTime: { width: 42, color: '#70d29a', fontSize: 8.5, fontWeight: '900' }, serviceMain: { flex: 1 }, serviceId: { color: '#e2ebef', fontSize: 9.5, fontWeight: '900' }, serviceDest: { fontSize: 6.8, fontWeight: '900' }, servicePlatform: { width: 26, color: '#58b9ff', fontSize: 8.5, fontWeight: '900', textAlign: 'center' }, serviceStatus: { width: 74, color: '#c5d1d7', fontSize: 6.3, fontWeight: '900', textAlign: 'right' },
  sectionHeading: { color: '#78909c', fontSize: 7.2, fontWeight: '900', letterSpacing: 1.1, textAlign: 'center', marginTop: 14, marginBottom: 7 }, upgradeRail: { paddingRight: 10, gap: 8 }, upgrade: { width: 145, minHeight: 170, backgroundColor: '#eef2f4', borderWidth: 2, borderColor: '#486375', borderRadius: 11, padding: 9, alignItems: 'center' }, affordable: { borderColor: '#e1b54f' }, focus: { borderColor: '#ef755e', borderWidth: 3 }, done: { borderColor: '#45a873', backgroundColor: '#e7f6ec' }, upgradeIcon: { fontSize: 28 }, upgradeTitle: { color: '#19354a', fontSize: 9, fontWeight: '900', marginTop: 4 }, upgradeLevel: { color: '#3977a4', fontSize: 7, fontWeight: '900', marginTop: 2 }, upgradeDesc: { color: '#647985', fontSize: 6.4, textAlign: 'center', lineHeight: 9, marginTop: 7, flex: 1 }, upgradeButton: { width: '100%', backgroundColor: '#3c9f4b', borderRadius: 7, paddingVertical: 8, alignItems: 'center', marginTop: 8 }, upgradeButtonText: { color: '#fff', fontSize: 7, fontWeight: '900' }, footer: { alignItems: 'center', paddingVertical: 7, paddingHorizontal: 8, borderTopWidth: 1, borderTopColor: '#14212a' }, footerText: { color: '#42535e', fontSize: 6, fontWeight: '900', textAlign: 'center' },
});