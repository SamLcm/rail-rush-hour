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
import Svg, { Circle, G, Line, Polygon, Rect, Text as SvgText } from 'react-native-svg';

const DESTINATIONS = [
  { id: 'noorddam', name: 'Noorddam', code: 'NDR', fare: 1, unlock: 1, color: '#4aa8ff' },
  { id: 'havenstad', name: 'Havenstad', code: 'HVN', fare: 2, unlock: 1, color: '#43d88e' },
  { id: 'oostpoort', name: 'Oostpoort', code: 'OOS', fare: 3, unlock: 2, color: '#ffad55' },
  { id: 'luchthaven', name: 'Luchthaven', code: 'AIR', fare: 4, unlock: 3, color: '#b38cff' },
];

const TRAIN_TYPES = [
  { code: 'SPR', name: 'Sprinter', setCapacity: 180, dwell: 7, visualWidth: 92 },
  { code: 'IC', name: 'Intercity', setCapacity: 260, dwell: 9, visualWidth: 108 },
  { code: 'EXP', name: 'Express', setCapacity: 340, dwell: 11, visualWidth: 122 },
];

const SAVE_KEY = 'rail-rush-hour-v017';
const LEGACY_SAVE_KEY = 'rail-rush-hour-v016';
const TICK_MS = 1000;
const SERVICE_INTERVAL = 17;
const DELAY_MARGIN = 12;
const ARRIVAL_MS = 2900;
const DEPARTURE_MS = 3200;
const WORLD_WIDTH = 1500;
const WORLD_HEIGHT = 1020;
const ISO = 0.14;
const PLATFORM_X = 500;
const PLATFORM_LENGTH = 790;
const TRAIN_X = 625;
const LANE_Y = { 1: 230, 2: 350, 3: 470 };

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

const isoStrip = (x, y, w, d) =>
  `${x},${y} ${x + w},${y - w * ISO} ${x + w + d},${y - w * ISO + d * 0.72} ${x + d},${y + d * 0.72}`;

function Tree({ x, y, scale = 1 }) {
  return (
    <G>
      <Rect x={x - 1.4 * scale} y={y} width={2.8 * scale} height={8 * scale} fill="#704b2c" />
      <Circle cx={x} cy={y - 4 * scale} r={7 * scale} fill="#2f7b47" />
      <Circle cx={x - 4 * scale} cy={y} r={5 * scale} fill="#3d9257" />
      <Circle cx={x + 4 * scale} cy={y} r={5 * scale} fill="#286d3f" />
    </G>
  );
}

function CarSvg({ x, y, color = '#4aa8ff' }) {
  return (
    <G>
      <Polygon points={`${x},${y} ${x + 15},${y - 4} ${x + 21},${y + 1} ${x + 6},${y + 5}`} fill="#10171a" opacity="0.28" />
      <Polygon points={`${x},${y - 3} ${x + 14},${y - 7} ${x + 20},${y - 2} ${x + 6},${y + 2}`} fill={color} stroke="#e2eff4" strokeWidth="0.7" />
      <Polygon points={`${x + 5},${y - 4.5} ${x + 10},${y - 6} ${x + 14},${y - 3} ${x + 9},${y - 1.5}`} fill="#294d61" />
    </G>
  );
}

function PersonSvg({ x, y, color = '#597f94', accent = '#efc79d' }) {
  return (
    <G>
      <Circle cx={x} cy={y} r="2" fill={accent} />
      <Rect x={x - 2} y={y + 2} width="4" height="6" rx="1.2" fill={color} />
    </G>
  );
}

function ZoneMeter({ x, y, title, value, max, hot, accent = '#58b9ee' }) {
  const p = pct(value, max);
  return (
    <G>
      <Rect x={x} y={y} width="100" height="29" rx="6" fill="rgba(9,22,28,0.90)" stroke={hot ? '#ff735e' : '#617982'} strokeWidth={hot ? 1.8 : 0.9} />
      <SvgText x={x + 7} y={y + 10} fontSize="5.5" fontWeight="900" fill="#9bb0b8">{title}</SvgText>
      <SvgText x={x + 7} y={y + 22} fontSize="8" fontWeight="900" fill="#eff5f6">{value}/{max}</SvgText>
      <Rect x={x + 49} y={y + 17} width="43" height="4" rx="2" fill="#263a42" />
      <Rect x={x + 49} y={y + 17} width={43 * p / 100} height="4" rx="2" fill={hot ? '#ff735e' : accent} />
    </G>
  );
}

function FlowRoute({ x, y, dx, dy, amount, color, duration = 2200 }) {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(progress, { toValue: 1, duration, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [duration, progress]);

  const tx = progress.interpolate({ inputRange: [0, 1], outputRange: [0, dx] });
  const ty = progress.interpolate({ inputRange: [0, 1], outputRange: [0, dy] });
  const count = Math.min(9, Math.max(1, Math.ceil(amount / 4)));

  return (
    <View pointerEvents="none" style={styles.motionLayer}>
      {Array.from({ length: count }).map((_, i) => (
        <Animated.View
          key={i}
          style={[styles.walker, { left: x - i * 15, top: y + (i % 3) * 4, transform: [{ translateX: tx }, { translateY: ty }] }]}
        >
          <View style={[styles.walkerHead, i % 4 === 0 && { backgroundColor: color }]} />
          <View style={styles.walkerBody} />
        </Animated.View>
      ))}
    </View>
  );
}

function TrafficCar({ delay, color, startX = 30, startY = 925, dx = 370, dy = -115 }) {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(progress, { toValue: 1, duration: 5200, useNativeDriver: true }),
        Animated.timing(progress, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [delay, progress]);
  const tx = progress.interpolate({ inputRange: [0, 1], outputRange: [0, dx] });
  const ty = progress.interpolate({ inputRange: [0, 1], outputRange: [0, dy] });
  return (
    <Animated.View pointerEvents="none" style={[styles.trafficCar, { left: startX, top: startY, backgroundColor: color, transform: [{ translateX: tx }, { translateY: ty }, { rotateZ: '-17deg' }] }]}>
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
            <View style={styles.trainWindowRow}>
              {Array.from({ length: Math.max(4, Math.round(setWidth / 20)) }).map((_, w) => <View key={w} style={styles.trainWindow} />)}
            </View>
            <View style={[styles.trainDoor, doorsOpen && styles.trainDoorOpen]} />
            <Text style={styles.trainCode}>{train.type.code}</Text>
          </View>
        </React.Fragment>
      ))}
    </View>
  );
  return onPress ? <Pressable hitSlop={16} onPress={onPress} style={styles.trainTap}>{body}</Pressable> : body;
}

function PlatformCrowd({ lane, count, color }) {
  const dots = Math.min(26, Math.max(0, Math.ceil(count / 9)));
  return (
    <View pointerEvents="none" style={[styles.platformCrowd, { top: LANE_Y[lane] - 5 }]}>
      {Array.from({ length: dots }).map((_, i) => (
        <View key={i} style={styles.platformPerson}>
          <View style={[styles.platformHead, i % 4 === 0 && { backgroundColor: color }]} />
          <View style={styles.platformBody} />
        </View>
      ))}
    </View>
  );
}

function StationWorldBase({
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
  bottleneck,
}) {
  const hallTotal = sum(hallDemand);
  const parkingRows = Math.min(5, 2 + parkingLevel);
  const parkingCols = 7;
  const parkingSlots = parkingRows * parkingCols;
  const occupiedCars = Math.min(parkingSlots, Math.ceil((parkingQueue / Math.max(1, parkingCap(parkingLevel))) * parkingSlots));
  const gates = Math.min(8, 2 + gateLevel);
  const hallW = 330 + Math.min(75, hallLevel * 15);
  const kioskCount = Math.min(5, retailLevel);

  return (
    <Svg width={WORLD_WIDTH} height={WORLD_HEIGHT} viewBox={`0 0 ${WORLD_WIDTH} ${WORLD_HEIGHT}`}>
      <Rect x="0" y="0" width={WORLD_WIDTH} height={WORLD_HEIGHT} fill="#cfe4b7" />
      <Polygon points="0,1020 0,585 1500,235 1500,1020" fill="#9fbd82" />
      <Polygon points="390,875 1350,600 1470,675 510,952" fill="#a8c18e" opacity="0.85" />
      <Polygon points="420,575 1345,355 1415,415 490,635" fill="#667463" opacity="0.45" />

      <Polygon points="0,956 365,846 500,875 118,1000" fill="#596365" />
      <Polygon points="355,846 615,770 687,810 470,883" fill="#596365" />
      <Line x1="35" y1="960" x2="625" y2="789" stroke="#e1e4df" strokeWidth="2" strokeDasharray="12 11" opacity="0.58" />

      <Polygon points={isoStrip(430, 740, 410, 125)} fill="#c4c0b3" stroke="#e0ddd3" strokeWidth="1.2" />
      <Polygon points={isoStrip(510, 705, 300, 70)} fill="#d0ccc0" stroke="#e8e5dc" strokeWidth="1" />

      <Polygon points={isoStrip(105, 775, 355 + Math.min(75, parkingLevel * 12), 180)} fill="#8d9899" stroke={bottleneck === 'PARKEREN' ? '#ff735e' : '#d7dddd'} strokeWidth={bottleneck === 'PARKEREN' ? 3.2 : 1.2} />
      <Rect x="115" y="695" width="65" height="23" rx="6" fill="#25373e" />
      <SvgText x="127" y="710" fontSize="9" fontWeight="900" fill="#fff">PARKING</SvgText>
      {Array.from({ length: parkingSlots }).map((_, i) => {
        const row = Math.floor(i / parkingCols);
        const col = i % parkingCols;
        const x = 135 + col * 42 + row * 10;
        const y = 805 + row * 28 - col * 5.8;
        return (
          <G key={i}>
            <Polygon points={`${x},${y} ${x + 31},${y - 4.4} ${x + 37},${y + 1} ${x + 6},${y + 5.5}`} fill="none" stroke="#dce1df" strokeWidth="0.75" />
            {i < occupiedCars ? <CarSvg x={x + 8} y={y} color={i % 4 === 0 ? '#ed6d62' : i % 4 === 1 ? '#4aa8ff' : i % 4 === 2 ? '#f0c64f' : '#e8eef0'} /> : null}
          </G>
        );
      })}
      <ZoneMeter x={270} y={930} title="PARKEREN" value={parkingQueue} max={parkingCap(parkingLevel)} hot={bottleneck === 'PARKEREN'} />

      <Polygon points={isoStrip(535, 585, hallW, 120)} fill="#536e7a" stroke={bottleneck === 'HAL' ? '#ff735e' : '#d8e5e9'} strokeWidth={bottleneck === 'HAL' ? 3.2 : 1.5} />
      <Polygon points={`${535},585 ${620},646 ${620},746 ${535},685`} fill="#344b55" />
      <Polygon points={`${620},646 ${535 + hallW + 120},${585 - hallW * ISO + 86} ${535 + hallW + 120},${685 - hallW * ISO + 86} ${620},746`} fill="#405b66" />
      <Polygon points={isoStrip(553, 570, hallW - 35, 92)} fill="#263a44" />
      <SvgText x="625" y="628" fontSize="13" fontWeight="900" fill="#f1f7f9">CENTRAAL STATION</SvgText>
      <SvgText x="628" y="645" fontSize="6.5" fontWeight="800" fill="#b8d0d9">HAL Lv {hallLevel} • SERVICE Lv {ticketLevel}</SvgText>
      {Array.from({ length: 8 }).map((_, i) => <Rect key={i} x={630 + i * 27} y={672 - i * 3.8} width="14" height="22" fill="#7ebad2" stroke="#d1e9f1" strokeWidth="0.8" />)}

      <Polygon points={isoStrip(500, 710, 175, 44)} fill="#354a50" stroke={bottleneck === 'ENTREE' ? '#ff735e' : '#718993'} strokeWidth={bottleneck === 'ENTREE' ? 2.8 : 1.2} />
      {Array.from({ length: gates }).map((_, i) => {
        const gx = 520 + i * 17;
        const gy = 733 - i * 2.4;
        return <G key={i}><Rect x={gx} y={gy} width="7" height="22" fill="#536d76" stroke="#a3b7be" strokeWidth="0.7" /><Circle cx={gx + 3.5} cy={gy + 5} r="1.4" fill="#50e18a" /></G>;
      })}
      {Array.from({ length: Math.min(18, Math.ceil(entranceQueue / 4)) }).map((_, i) => <PersonSvg key={i} x={452 + (i % 7) * 15 + Math.floor(i / 7) * 5} y={786 - (i % 7) * 2.2 + Math.floor(i / 7) * 13} color={bottleneck === 'ENTREE' ? '#d66a56' : '#507f9a'} />)}
      <ZoneMeter x={470} y={820} title="POORTJES" value={entranceQueue} max={entranceBuffer(gateLevel)} hot={bottleneck === 'ENTREE'} accent="#ffd25e" />

      {Array.from({ length: kioskCount }).map((_, i) => (
        <G key={i}>
          <Polygon points={isoStrip(700 + i * 52, 760 - i * 7.3, 38, 22)} fill={i % 2 ? '#795a37' : '#6d4631'} stroke="#d2b27a" strokeWidth="0.8" />
          <SvgText x={708 + i * 52} y={770 - i * 7.3} fontSize="5" fontWeight="900" fill="#ffe2b0">{i % 2 ? 'SHOP' : 'CAFE'}</SvgText>
        </G>
      ))}

      {Array.from({ length: Math.min(34, Math.ceil(hallTotal / 7)) }).map((_, i) => (
        <PersonSvg key={i} x={625 + (i % 12) * 21 + Math.floor(i / 12) * 7} y={805 - (i % 12) * 3 + Math.floor(i / 12) * 15} color={i % 5 === 0 ? '#d09547' : '#507f9a'} />
      ))}
      <ZoneMeter x={760} y={820} title="STATIONSHAL" value={hallTotal} max={hallCap(hallLevel)} hot={bottleneck === 'HAL'} accent="#64db93" />

      <Polygon points={isoStrip(650, 555, 250, 58)} fill="#738287" stroke="#d9e1e2" strokeWidth="1.2" />
      <Polygon points={isoStrip(720, 505, 130, 44)} fill="#859397" stroke="#dce4e5" strokeWidth="1" />
      <Rect x="708" y="523" width="92" height="20" rx="5" fill="#26383f" opacity="0.9" />
      <SvgText x="721" y="537" fontSize="6" fontWeight="900" fill="#eef6f8">PERRONPASSAGE</SvgText>

      {[1, 2, 3].map((lane) => {
        const locked = lane === 3 && !platform3;
        const serviceForLane = (d) => services.find((s) => s.destination.id === d.id && s.status !== 'departed');
        const waiting = DESTINATIONS.reduce((acc, d) => acc + (((serviceForLane(d)?.actualLane || serviceForLane(d)?.plannedLane) === lane) ? platformDemand[d.id] : 0), 0);
        const train = platforms[lane];
        const color = train?.destination?.color || '#778a93';
        const y = LANE_Y[lane];
        const hot = (bottleneck === 'PERRONS' || bottleneck === 'TREINEN') && !locked;
        return (
          <G key={lane} opacity={locked ? 0.55 : 1}>
            <Polygon points={isoStrip(PLATFORM_X, y, PLATFORM_LENGTH, 52)} fill={locked ? '#8b8273' : '#aaa89d'} stroke={hot ? '#ff735e' : '#e3e0d5'} strokeWidth={hot ? 3.1 : 1.4} />
            <Polygon points={isoStrip(PLATFORM_X + 10, y + 44, PLATFORM_LENGTH - 4, 25)} fill="#263136" />
            <Line x1={PLATFORM_X + 18} y1={y + 52} x2={PLATFORM_X + PLATFORM_LENGTH} y2={y + 52 - (PLATFORM_LENGTH - 18) * ISO} stroke="#bcc5c8" strokeWidth="2.4" />
            <Line x1={PLATFORM_X + 26} y1={y + 63} x2={PLATFORM_X + PLATFORM_LENGTH + 8} y2={y + 63 - (PLATFORM_LENGTH - 18) * ISO} stroke="#bcc5c8" strokeWidth="2.4" />
            <Rect x={PLATFORM_X + 8} y={y - 4} width="42" height="24" rx="4" fill="#0a171d" />
            <SvgText x={PLATFORM_X + 15} y={y + 7} fontSize="8" fontWeight="900" fill="#fff">P{lane}</SvgText>
            <SvgText x={PLATFORM_X + 15} y={y + 17} fontSize="6" fontWeight="900" fill={locked ? '#d7c084' : color}>{locked ? 'BOUW' : train ? train.destination.code : 'VRIJ'}</SvgText>
            {!locked && Array.from({ length: Math.min(5, 1 + Math.floor(platformLevel / 2)) }).map((_, i) => {
              const px = PLATFORM_X + 105 + i * 125;
              const py = y - 16 - i * 17.5;
              return <G key={i}><Line x1={px} y1={py + 34} x2={px} y2={py + 10} stroke="#4d5d62" strokeWidth="3" /><Line x1={px - 27} y1={py + 10} x2={px + 45} y2={py - 1} stroke="#66777b" strokeWidth="5" /></G>;
            })}
            {locked ? <SvgText x={PLATFORM_X + 270} y={y + 20} fontSize="10" fontWeight="900" fill="#f0d48b">BOUWTERREIN PERRON 3</SvgText> : null}
            {!locked ? (
              <G>
                <Rect x={PLATFORM_X + 665} y={y + 53} width="94" height="23" rx="4" fill="#0a171d" opacity="0.9" />
                <SvgText x={PLATFORM_X + 673} y={y + 63} fontSize="5.5" fontWeight="900" fill="#849aa4">WACHTEND</SvgText>
                <SvgText x={PLATFORM_X + 673} y={y + 73} fontSize="8" fontWeight="900" fill={waiting >= platformCap(platformLevel) * 0.9 ? '#ff806d' : '#eef4f6'}>{waiting}</SvgText>
              </G>
            ) : null}
          </G>
        );
      })}

      {[75, 155, 1030, 1120, 1325, 1400].map((x, i) => <Tree key={i} x={x} y={i < 2 ? 920 - i * 45 : 825 - (i - 2) * 58} scale={0.75 + (i % 3) * 0.08} />)}
      <Polygon points={isoStrip(1040, 755, 180, 60)} fill="#758f72" stroke="#d8e5d1" strokeWidth="1" strokeDasharray="7 5" />
      <SvgText x="1082" y="775" fontSize="7" fontWeight="900" fill="#274b38">UITBREIDINGSZONE</SvgText>
      <SvgText x="1080" y="786" fontSize="5.5" fill="#416852">bus • taxi • fietsen</SvgText>
    </Svg>
  );
}

function World({ props, onDepart, arrivalTrain, arrivalLane, arrivalProgress, departureTrain, departureLane, departureProgress }) {
  const {
    parkingLevel,
    gateLevel,
    hallLevel,
    platform3,
    parkingQueue,
    entranceQueue,
    hallDemand,
    platformDemand,
    platforms,
    services,
    now,
    bottleneck,
  } = props;
  const hallTotal = sum(hallDemand);

  const arrivalX = arrivalProgress.interpolate({ inputRange: [0, 1], outputRange: [520, 0] });
  const arrivalY = arrivalProgress.interpolate({ inputRange: [0, 1], outputRange: [-73, 0] });
  const departureX = departureProgress.interpolate({ inputRange: [0, 1], outputRange: [0, 650] });
  const departureY = departureProgress.interpolate({ inputRange: [0, 1], outputRange: [0, -91] });

  return (
    <View style={styles.worldCanvas}>
      <StationWorldBase {...props} />

      <TrafficCar delay={0} color="#4aa8ff" />
      <TrafficCar delay={1700} color="#ef6d62" startY={940} />
      <TrafficCar delay={3400} color="#efc64f" startY={955} />

      <FlowRoute x={390} y={835} dx={135} dy={-66} amount={Math.min(parkingQueue, gateRate(gateLevel))} color="#52bfff" />
      <FlowRoute x={570} y={745} dx={90} dy={-50} amount={Math.min(entranceQueue, gateRate(gateLevel))} color="#ffd25e" />
      <FlowRoute x={735} y={635} dx={35} dy={-118} amount={Math.min(hallTotal, hallRate(hallLevel))} color="#64db93" />

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
                  {train.number} → {train.destination.name} • {train.onboard}/{train.capacity} • {train.status === 'dwelling'
                    ? `${train.remaining}s halte`
                    : depIn > 0
                      ? `vertrek over ${depIn}s`
                      : depIn >= -DELAY_MARGIN
                        ? `VERTREK • ${DELAY_MARGIN + depIn}s marge`
                        : `+${Math.abs(depIn + DELAY_MARGIN)}s te laat`}
                </Text>
              </View>
            ) : null}
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
    </View>
  );
}

function Upgrade({ icon, title, level, description, cost, cash, onPress, focus, done }) {
  return (
    <Pressable disabled={done} onPress={onPress} style={[styles.upgrade, cash >= cost && !done && styles.affordable, focus && styles.focus, done && styles.done]}>
      <Text style={styles.upgradeIcon}>{icon}</Text>
      <View style={styles.upgradeText}>
        <Text style={styles.upgradeTitle}>{title}</Text>
        <Text style={styles.upgradeDesc}>{done ? 'OPEN' : `Lv ${level} • ${description}`}</Text>
      </View>
      <Text style={styles.upgradeCost}>{done ? 'ACTIEF' : money(cost)}</Text>
    </Pressable>
  );
}

export default function AppV17() {
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

  const camera = useRef(new Animated.ValueXY({ x: -470, y: -310 })).current;
  const cameraCurrent = useRef({ x: -470, y: -310 });
  const panStart = useRef({ x: -470, y: -310 });
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
    cash: Math.round(cashRef.current),
    stationLevel: stationLevelRef.current,
    xp: Math.round(xpRef.current),
    parkingLevel: parkingLevelRef.current,
    gateLevel: gateLevelRef.current,
    hallLevel: hallLevelRef.current,
    platformLevel: platformLevelRef.current,
    fleetLevel: fleetLevelRef.current,
    retailLevel: retailLevelRef.current,
    ticketLevel: ticketLevelRef.current,
    platform3: platform3Ref.current,
    handled: handledRef.current,
    lost: lostRef.current,
    transported: transportedRef.current,
    onTime: onTimeRef.current,
    lastSaved: Date.now(),
  });

  const addCash = (value) => {
    cashRef.current += value;
    setCash(Math.round(cashRef.current));
  };

  const spend = (value) => {
    if (cashRef.current < value) return false;
    cashRef.current -= value;
    setCash(Math.round(cashRef.current));
    return true;
  };

  const awardXp = (value) => {
    let nextXp = xpRef.current + value;
    let nextLevel = stationLevelRef.current;
    while (nextXp >= levelTarget(nextLevel)) {
      nextXp -= levelTarget(nextLevel);
      nextLevel += 1;
    }
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
    return {
      id: `svc-${i}-${arrivalAt}`,
      number: `${type.code} ${1700 + i * 4 + 2}`,
      type,
      destination,
      plannedLane,
      actualLane: null,
      arrivalAt,
      departureAt: arrivalAt + type.dwell + 5,
      sets,
      capacity,
      onboard: Math.round(capacity * 0.38),
      status: 'scheduled',
      remaining: type.dwell,
      wait: 0,
    };
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
    setArrivalTrain(moving);
    setArrivalLane(lane);
    arrivalProgress.setValue(0);
    setMessage(diverted ? `${train.number} wijkt uit naar P${lane}.` : `${train.number} rijdt naar P${lane}.`);

    Animated.timing(arrivalProgress, { toValue: 1, duration: ARRIVAL_MS, useNativeDriver: true }).start(({ finished }) => {
      arrivalBusy.current = false;
      if (!finished) return;

      const alight = Math.min(moving.onboard, Math.round(moving.onboard * (0.18 + Math.random() * 0.17)));
      const transfer = Math.round(alight * (0.22 + Math.random() * 0.28));
      distributeTransfers(moving, transfer);

      const atPlatform = {
        ...moving,
        status: 'dwelling',
        remaining: moving.type.dwell,
        onboard: moving.onboard - alight,
      };
      syncPlatforms({ ...platformsRef.current, [lane]: atPlatform });
      updateService(moving.id, { status: 'platform', actualLane: lane });
      setArrivalTrain(null);
      setArrivalLane(null);
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
    setDepartureTrain(moving);
    setDepartureLane(lane);
    departureProgress.setValue(0);
    setMessage(`${train.number} vertrekt van P${lane}.`);

    Animated.timing(departureProgress, { toValue: 1, duration: DEPARTURE_MS, useNativeDriver: true }).start(({ finished }) => {
      departureBusy.current = false;
      if (!finished) return;

      const within = delay <= DELAY_MARGIN;
      const revenue = Math.round(train.onboard * train.destination.fare * fareMultiplier(ticketLevelRef.current));
      syncPlatforms({ ...platformsRef.current, [lane]: null });
      updateService(train.id, { status: 'departed' });
      setDepartureTrain(null);
      setDepartureLane(null);

      handledRef.current += 1;
      transportedRef.current += train.onboard;
      if (within) onTimeRef.current += 1;
      setHandled(handledRef.current);
      setTransported(transportedRef.current);
      setOnTime(onTimeRef.current);

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
      if (rejected > 0) {
        lostRef.current += rejected;
        setLost(lostRef.current);
      }

      let nextParking = parkingRef.current + enterParking;
      const toEntrance = Math.min(nextParking, gateRate(gateLevelRef.current), Math.max(0, entranceBuffer(gateLevelRef.current) - entranceRef.current));
      nextParking -= toEntrance;
      let nextEntrance = entranceRef.current + toEntrance;

      const nextHall = { ...hallRef.current };
      const throughGates = Math.min(nextEntrance, gateRate(gateLevelRef.current), Math.max(0, hallCap(hallLevelRef.current) - sum(nextHall)));
      nextEntrance -= throughGates;

      const unlocked = DESTINATIONS.filter((d) => d.unlock <= stationLevelRef.current);
      for (let i = 0; i < throughGates; i += 1) {
        nextHall[unlocked[(demandCursor.current + i) % unlocked.length].id] += 1;
      }
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

        const board = Math.min(
          nextPlatformDemand[train.destination.id] || 0,
          Math.max(0, train.capacity - train.onboard),
          30 + train.sets * 12
        );
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
    nowRef.current = 0;
    serviceIndex.current = 0;
    nextServiceAt.current = 3;
    demandCursor.current = 0;
    arrivalBusy.current = false;
    departureBusy.current = false;
    arrivalProgress.setValue(0);
    departureProgress.setValue(0);

    syncParking(15);
    syncEntrance(8);
    syncHall({
      noorddam: 8,
      havenstad: 10,
      oostpoort: stationLevelRef.current >= 2 ? 5 : 0,
      luchthaven: stationLevelRef.current >= 3 ? 4 : 0,
    });
    syncPlatformDemand({
      noorddam: 12,
      havenstad: 18,
      oostpoort: stationLevelRef.current >= 2 ? 7 : 0,
      luchthaven: stationLevelRef.current >= 3 ? 5 : 0,
    });

    syncPlatforms({ 1: null, 2: null, 3: null });
    syncOutside([]);
    setArrivalTrain(null);
    setArrivalLane(null);
    setDepartureTrain(null);
    setDepartureLane(null);

    const initial = [];
    for (let i = 0; i < 8; i += 1) {
      initial.push(makeService(nextServiceAt.current));
      nextServiceAt.current += SERVICE_INTERVAL;
    }
    syncServices(initial);
    setNow(0);
    setMessage('Eén station, één voorplein en één perroncomplex. Sleep om rond te kijken.');
    setPhase('playing');
    setTimeout(() => jumpTo(720, 610), 60);
  };

  const doUpgrade = (kind) => {
    const map = {
      parking: [parkingCost(parkingLevelRef.current), parkingLevelRef, setParkingLevel, 'Parkeren groeit mee met de stationsvoorzijde.'],
      gates: [gateCost(gateLevelRef.current), gateLevelRef, setGateLevel, 'Meer poortjes in de hoofdingang.'],
      hall: [hallCost(hallLevelRef.current), hallLevelRef, setHallLevel, 'Stationsgebouw en hal uitgebreid.'],
      platforms: [platformCost(platformLevelRef.current), platformLevelRef, setPlatformLevel, 'Perroncapaciteit verbeterd.'],
      fleet: [fleetCost(fleetLevelRef.current), fleetLevelRef, setFleetLevel, 'Toekomstige treinen krijgen meer stellen.'],
      retail: [retailCost(retailLevelRef.current), retailLevelRef, setRetailLevel, 'Extra winkel aan de stationsvoorzijde geopend.'],
      tickets: [ticketCost(ticketLevelRef.current), ticketLevelRef, setTicketLevel, 'Service verbeterd: hogere opbrengst.'],
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
    setMessage('Perron 3 geopend als onderdeel van hetzelfde perroncomplex.');
    persist();
  };

  if (phase === 'menu') {
    return (
      <SafeAreaView style={styles.screen}>
        <StatusBar barStyle="light-content" />
        <View style={styles.menu}>
          <Text style={styles.kicker}>ONE STATION / V0.17</Text>
          <Text style={styles.logo}>RAIL{`\n`}RUSH HOUR</Text>
          <Text style={styles.subtitle}>Dezelfde simulatie, maar opnieuw gecomponeerd als één herkenbaar stationsgebied: spoorzijde, stationsgebouw, voorplein en parkeren horen nu fysiek bij elkaar.</Text>
          <Pressable style={styles.primary} onPress={begin}><Text style={styles.primaryText}>{saved ? 'GA VERDER' : 'OPEN STATION'}</Text></Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const hallTotal = sum(hallDemand);
  const platformTotal = sum(platformDemand);
  const openPlatforms = platform3 ? 3 : 2;
  const maxPlatformWaiting = Math.max(
    0,
    ...[1, 2, 3].filter((lane) => lane !== 3 || platform3).map((lane) =>
      DESTINATIONS.reduce((acc, d) => {
        const s = services.find((svc) => svc.destination.id === d.id && svc.status !== 'departed');
        return acc + ((s?.actualLane || s?.plannedLane) === lane ? platformDemand[d.id] : 0);
      }, 0)
    )
  );
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

  const worldProps = {
    parkingLevel,
    gateLevel,
    hallLevel,
    retailLevel,
    ticketLevel,
    platformLevel,
    stationLevel,
    platform3,
    parkingQueue,
    entranceQueue,
    hallDemand,
    platformDemand,
    platforms,
    services,
    now,
    bottleneck: bottleneck.label,
  };

  const bottleneckPoint =
    bottleneck.label === 'PARKEREN' ? [300, 820]
      : bottleneck.label === 'ENTREE' ? [570, 730]
        : bottleneck.label === 'HAL' ? [730, 650]
          : [880, 365];

  const readyLane = [1, 2, 3].find((lane) => platforms[lane]?.status === 'ready');

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="light-content" />

      <View style={styles.hud}>
        <View style={styles.hudCell}><Text style={styles.hudLabel}>KAS</Text><Text style={styles.hudMoney}>{money(cash)}</Text></View>
        <View style={styles.hudCell}><Text style={styles.hudLabel}>STATION</Text><Text style={styles.hudValue}>Lv {stationLevel}</Text></View>
        <View style={styles.hudCell}><Text style={styles.hudLabel}>TIJD</Text><Text style={styles.hudValue}>{clock(now).slice(0, 5)}</Text></View>
        <Pressable style={styles.hudCell} onPress={() => jumpTo(...bottleneckPoint)}>
          <Text style={styles.hudLabel}>KNELPUNT</Text>
          <Text style={styles.hudWarn}>{bottleneck.label} {bottleneck.pressure}%</Text>
        </Pressable>
      </View>

      <View style={styles.cameraBar}>
        <Pressable style={styles.cameraButton} onPress={() => jumpTo(720, 610)}><Text style={styles.cameraText}>◎ STATION</Text></Pressable>
        <Pressable style={styles.cameraButton} onPress={() => jumpTo(300, 820)}><Text style={styles.cameraText}>🚗 VOORZIJDE</Text></Pressable>
        <Pressable style={[styles.cameraButton, styles.cameraWarn]} onPress={() => jumpTo(...bottleneckPoint)}><Text style={styles.cameraText}>⚠ KNELPUNT</Text></Pressable>
        <Pressable style={styles.cameraButton} onPress={() => jumpTo(readyLane ? 840 : 860, readyLane ? LANE_Y[readyLane] + 45 : 350)}><Text style={styles.cameraText}>🚆 PERRONS</Text></Pressable>
      </View>

      <View
        style={styles.viewport}
        onLayout={(e) => setViewport({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
        {...panResponder.panHandlers}
      >
        <Animated.View style={[styles.worldMover, { transform: [{ translateX: camera.x }, { translateY: camera.y }] }]}>
          <World
            props={worldProps}
            onDepart={depart}
            arrivalTrain={arrivalTrain}
            arrivalLane={arrivalLane}
            arrivalProgress={arrivalProgress}
            departureTrain={departureTrain}
            departureLane={departureLane}
            departureProgress={departureProgress}
          />
        </Animated.View>

        <View pointerEvents="none" style={styles.dragHint}><Text style={styles.dragHintText}>↔↕ SLEEP OM ROND TE KIJKEN</Text></View>
        <View style={styles.messageFloat}><View style={styles.messageLamp} /><Text style={styles.messageText}>{message}</Text></View>

        {blocked ? (
          <View style={styles.blockedFloat}>
            <View style={styles.blockedTop}>
              <Text style={styles.blockedTrain}>{blocked.number} wacht • P{blocked.plannedLane} bezet</Text>
              <Text style={styles.blockedDelay}>+{blocked.wait}s</Text>
            </View>
            <View style={styles.divertRow}>
              {[1, 2, 3]
                .filter((lane) => lane !== blocked.plannedLane && (lane !== 3 || platform3))
                .map((lane) => (
                  <Pressable key={lane} disabled={Boolean(platforms[lane])} onPress={() => divert(lane)} style={[styles.divert, platforms[lane] && styles.disabled]}>
                    <Text style={styles.divertText}>{platforms[lane] ? `P${lane} BEZET` : `WIJK UIT → P${lane}`}</Text>
                  </Pressable>
                ))}
            </View>
          </View>
        ) : null}
      </View>

      <View style={styles.progressBar}>
        <View style={styles.progressTop}>
          <Text style={styles.progressTitle}>Lv {stationLevel} • {xp}/{levelTarget(stationLevel)} XP</Text>
          <Text style={styles.progressMeta}>{transported} reizigers • {handled} treinen • {onTime} op tijd • {lost} gemist</Text>
        </View>
        <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${pct(xp, levelTarget(stationLevel))}%` }]} /></View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.upgradeRail} style={styles.upgradeDock}>
        <Upgrade icon="🚗" title="Parkeren" level={parkingLevel} description={`${parkingCap(parkingLevel)} pl.`} cost={parkingCost(parkingLevel)} cash={cash} onPress={() => doUpgrade('parking')} focus={bottleneck.label === 'PARKEREN'} />
        <Upgrade icon="🚪" title="Poortjes" level={gateLevel} description={`${gateRate(gateLevel)}/s`} cost={gateCost(gateLevel)} cash={cash} onPress={() => doUpgrade('gates')} focus={bottleneck.label === 'ENTREE'} />
        <Upgrade icon="🏢" title="Hal" level={hallLevel} description={`${hallCap(hallLevel)} cap.`} cost={hallCost(hallLevel)} cash={cash} onPress={() => doUpgrade('hall')} focus={bottleneck.label === 'HAL'} />
        <Upgrade icon="🚉" title="Perrons" level={platformLevel} description={`${platformCap(platformLevel)} cap.`} cost={platformCost(platformLevel)} cash={cash} onPress={() => doUpgrade('platforms')} focus={bottleneck.label === 'PERRONS'} />
        <Upgrade icon="🚆" title="Treinvloot" level={fleetLevel} description="langere treinen" cost={fleetCost(fleetLevel)} cash={cash} onPress={() => doUpgrade('fleet')} focus={bottleneck.label === 'TREINEN'} />
        <Upgrade icon="➕" title="Perron 3" level={1} description="extra perron" cost={platform3Cost} cash={cash} onPress={buildP3} done={platform3} />
        <Upgrade icon="☕" title="Winkels" level={retailLevel} description={`${money(retailIncome(retailLevel))}/s`} cost={retailCost(retailLevel)} cash={cash} onPress={() => doUpgrade('retail')} />
        <Upgrade icon="🎫" title="Service" level={ticketLevel} description={`+${Math.round((fareMultiplier(ticketLevel) - 1) * 100)}%`} cost={ticketCost(ticketLevel)} cash={cash} onPress={() => doUpgrade('tickets')} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#071017' },
  menu: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  kicker: { color: '#77b9dc', fontSize: 10, fontWeight: '900', letterSpacing: 2, marginBottom: 11 },
  logo: { color: '#f0f5f7', fontSize: 48, lineHeight: 44, fontWeight: '900', letterSpacing: -2, textAlign: 'center' },
  subtitle: { color: '#98a9b2', fontSize: 14, lineHeight: 21, textAlign: 'center', maxWidth: 390, marginTop: 18, marginBottom: 25 },
  primary: { backgroundColor: '#ffd45f', minWidth: 230, borderRadius: 10, paddingVertical: 16, alignItems: 'center' },
  primaryText: { color: '#111820', fontSize: 15, fontWeight: '900', letterSpacing: 1 },

  hud: { flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 6, backgroundColor: '#0a151c', borderBottomWidth: 1, borderBottomColor: '#21333d' },
  hudCell: { flex: 1, alignItems: 'center' },
  hudLabel: { color: '#647a86', fontSize: 6.2, fontWeight: '900' },
  hudValue: { color: '#e8eff2', fontSize: 12.5, fontWeight: '900', marginTop: 2 },
  hudMoney: { color: '#67e396', fontSize: 12.5, fontWeight: '900', marginTop: 2 },
  hudWarn: { color: '#ffca62', fontSize: 7.5, fontWeight: '900', marginTop: 4 },

  cameraBar: { flexDirection: 'row', gap: 4, padding: 5, backgroundColor: '#0d1b22', borderBottomWidth: 1, borderBottomColor: '#223741' },
  cameraButton: { flex: 1, minHeight: 30, borderRadius: 6, borderWidth: 1, borderColor: '#315266', backgroundColor: '#14242d', alignItems: 'center', justifyContent: 'center' },
  cameraWarn: { borderColor: '#a97936' },
  cameraText: { color: '#bdd4df', fontSize: 5.8, fontWeight: '900' },

  viewport: { flex: 1, overflow: 'hidden', backgroundColor: '#cfe4b7', position: 'relative' },
  worldMover: { position: 'absolute', left: 0, top: 0, width: WORLD_WIDTH, height: WORLD_HEIGHT },
  worldCanvas: { width: WORLD_WIDTH, height: WORLD_HEIGHT, position: 'relative', overflow: 'hidden', backgroundColor: '#cfe4b7' },

  motionLayer: { position: 'absolute', left: 0, top: 0, width: WORLD_WIDTH, height: WORLD_HEIGHT, zIndex: 16 },
  walker: { position: 'absolute', width: 6, height: 15, alignItems: 'center' },
  walkerHead: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#efc79d' },
  walkerBody: { width: 4, height: 7, borderRadius: 1, backgroundColor: '#527b8f', marginTop: 1 },

  trafficCar: { position: 'absolute', width: 22, height: 9, borderRadius: 3, borderWidth: 1, borderColor: '#e6f0f3', zIndex: 12 },
  trafficWindow: { width: 8, height: 4, borderRadius: 1, backgroundColor: '#294d61', marginLeft: 6, marginTop: 1 },

  platformCrowd: { position: 'absolute', left: PLATFORM_X + 80, width: 515, minHeight: 42, zIndex: 18, flexDirection: 'row', flexWrap: 'wrap', gap: 4, transform: [{ rotateZ: '-8deg' }] },
  platformPerson: { width: 6, height: 12, alignItems: 'center' },
  platformHead: { width: 3.5, height: 3.5, borderRadius: 2, backgroundColor: '#efc79d' },
  platformBody: { width: 4, height: 6, borderRadius: 1, backgroundColor: '#5b7e90', marginTop: 1 },

  trainAtPlatform: { position: 'absolute', left: TRAIN_X, zIndex: 24, alignItems: 'flex-start' },
  trainConsist: { flexDirection: 'row', alignItems: 'center', transform: [{ rotateZ: '-8deg' }] },
  trainMoving: {},
  trainTap: { padding: 4 },
  trainSet: { height: 27, backgroundColor: '#e8f0f3', borderWidth: 2, borderRadius: 5, overflow: 'hidden', position: 'relative' },
  trainReady: { backgroundColor: '#b6f4c8' },
  trainLate: { backgroundColor: '#f4aeb6' },
  trainNose: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 9 },
  trainWindowRow: { position: 'absolute', left: 16, right: 8, top: 5, flexDirection: 'row', justifyContent: 'space-around' },
  trainWindow: { width: 10, height: 4, borderRadius: 1, backgroundColor: '#31576b' },
  trainDoor: { position: 'absolute', right: 8, bottom: 3, width: 8, height: 10, borderWidth: 1, borderColor: '#4d6876', backgroundColor: '#c8dbe3' },
  trainDoorOpen: { backgroundColor: '#16242b' },
  trainCode: { color: '#173748', fontSize: 6.2, fontWeight: '900', textAlign: 'center', marginTop: 13 },
  coupler: { width: 7, height: 3, backgroundColor: '#6d7b81' },
  trainStatus: { color: '#dce8ec', backgroundColor: 'rgba(8,18,24,0.92)', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 3, fontSize: 5.7, fontWeight: '900', marginTop: 5, maxWidth: 430 },
  motionStatus: { color: '#d9e7eb', backgroundColor: 'rgba(8,18,24,0.86)', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 3, fontSize: 6, fontWeight: '900', marginTop: 4 },
  readyText: { color: '#5ee792' },
  lateText: { color: '#ff8875' },

  dragHint: { position: 'absolute', right: 8, top: 8, backgroundColor: 'rgba(8,18,24,0.72)', borderRadius: 5, paddingHorizontal: 7, paddingVertical: 4 },
  dragHintText: { color: '#d8e7ec', fontSize: 6.2, fontWeight: '900' },

  messageFloat: { position: 'absolute', left: 8, right: 8, bottom: 8, minHeight: 38, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 9, backgroundColor: 'rgba(7,16,22,0.92)', borderRadius: 8, borderWidth: 1, borderColor: '#2d4755' },
  messageLamp: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#5bbcf2', marginRight: 7 },
  messageText: { flex: 1, color: '#c3d1d7', fontSize: 7.7, lineHeight: 11, fontWeight: '700' },

  blockedFloat: { position: 'absolute', left: 8, right: 8, bottom: 54, backgroundColor: 'rgba(48,30,11,0.96)', borderWidth: 1, borderColor: '#d3953c', borderRadius: 8, padding: 7 },
  blockedTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  blockedTrain: { color: '#ffe6b2', fontSize: 8, fontWeight: '900' },
  blockedDelay: { color: '#ffc05b', fontSize: 11, fontWeight: '900' },
  divertRow: { flexDirection: 'row', gap: 5, marginTop: 6 },
  divert: { flex: 1, minHeight: 28, borderRadius: 5, borderWidth: 1, borderColor: '#d1953d', alignItems: 'center', justifyContent: 'center' },
  divertText: { color: '#ffd890', fontSize: 7, fontWeight: '900' },
  disabled: { opacity: 0.3 },

  progressBar: { backgroundColor: '#0e1920', borderTopWidth: 1, borderTopColor: '#21333d', paddingHorizontal: 8, paddingVertical: 5 },
  progressTop: { flexDirection: 'row', justifyContent: 'space-between' },
  progressTitle: { color: '#cfe0e7', fontSize: 6.5, fontWeight: '900' },
  progressMeta: { color: '#667f8b', fontSize: 5.6, fontWeight: '800' },
  progressTrack: { height: 4, borderRadius: 2, overflow: 'hidden', backgroundColor: '#1c2a32', marginTop: 4 },
  progressFill: { height: '100%', backgroundColor: '#58b9ff' },

  upgradeDock: { maxHeight: 105, backgroundColor: '#081218', borderTopWidth: 1, borderTopColor: '#20313a' },
  upgradeRail: { gap: 6, paddingHorizontal: 6, paddingVertical: 6 },
  upgrade: { width: 128, minHeight: 88, backgroundColor: '#e9eff1', borderWidth: 2, borderColor: '#486375', borderRadius: 9, padding: 7, flexDirection: 'row', alignItems: 'center', gap: 6 },
  affordable: { borderColor: '#ddb04a' },
  focus: { borderColor: '#ef755e', borderWidth: 3 },
  done: { borderColor: '#45a873', backgroundColor: '#e7f6ec' },
  upgradeIcon: { fontSize: 22 },
  upgradeText: { flex: 1 },
  upgradeTitle: { color: '#19354a', fontSize: 7.4, fontWeight: '900' },
  upgradeDesc: { color: '#647985', fontSize: 5.5, marginTop: 2, fontWeight: '700' },
  upgradeCost: { color: '#2f7a43', fontSize: 6, fontWeight: '900' },
});