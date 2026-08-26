import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  { code: 'SPR', name: 'Sprinter', setCapacity: 180, dwell: 7 },
  { code: 'IC', name: 'Intercity', setCapacity: 260, dwell: 9 },
  { code: 'EXP', name: 'Express', setCapacity: 340, dwell: 11 },
];

const SAVE_KEY = 'rail-rush-hour-v014';
const LEGACY_SAVE_KEY = 'rail-rush-hour-v013';
const TICK_MS = 1000;
const SERVICE_INTERVAL = 16;
const DELAY_MARGIN = 12;
const ARRIVAL_MS = 2600;
const DEPARTURE_MS = 3000;
const WORLD_WIDTH = 1420;
const WORLD_HEIGHT = 540;
const LANE_TOP = { 1: 122, 2: 240, 3: 358 };

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

const diamond = (cx, cy, w, h) => `${cx},${cy - h / 2} ${cx + w / 2},${cy} ${cx},${cy + h / 2} ${cx - w / 2},${cy}`;
const isoRect = (x, y, w, h) => `${x},${y} ${x + w},${y - w * 0.24} ${x + w + h},${y + h * 0.76} ${x + h},${y + h}`;

function TravelerStream({ left, top, width, amount, color, label }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(anim, { toValue: 1, duration: 1750, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [anim]);
  const count = Math.min(10, Math.max(1, Math.ceil(amount / 3)));
  const move = anim.interpolate({ inputRange: [0, 1], outputRange: [0, width - 24] });
  return (
    <View pointerEvents="none" style={[styles.flowOverlay, { left, top, width }]}>
      <Text style={styles.flowLabel}>{label}</Text>
      <View style={[styles.flowPath, { backgroundColor: color }]} />
      {Array.from({ length: count }).map((_, i) => (
        <Animated.View key={i} style={[styles.personSprite, { left: -12 - i * 17, transform: [{ translateX: move }] }]}>
          <View style={[styles.personHead, { backgroundColor: i % 3 === 0 ? color : '#f0c69a' }]} />
          <View style={styles.personBody} />
        </Animated.View>
      ))}
      <Text style={[styles.flowChevrons, { color }]}>›››</Text>
    </View>
  );
}

function TrafficCar({ delay = 0, color = '#4aa8ff', top = 388 }) {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(progress, { toValue: 1, duration: 4400, useNativeDriver: true }),
        Animated.timing(progress, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [delay, progress]);
  const tx = progress.interpolate({ inputRange: [0, 1], outputRange: [-90, 360] });
  const ty = progress.interpolate({ inputRange: [0, 1], outputRange: [18, -65] });
  return (
    <Animated.View pointerEvents="none" style={[styles.trafficCar, { top, backgroundColor: color, transform: [{ translateX: tx }, { translateY: ty }, { rotateZ: '-13deg' }] }]}>
      <View style={styles.trafficWindow} />
    </Animated.View>
  );
}

function Tree({ x, y, scale = 1 }) {
  return (
    <G>
      <Rect x={x - 2 * scale} y={y} width={4 * scale} height={10 * scale} fill="#6c4b2d" />
      <Circle cx={x} cy={y - 3 * scale} r={10 * scale} fill="#2f7b47" />
      <Circle cx={x - 6 * scale} cy={y + 2 * scale} r={7 * scale} fill="#3e9257" />
      <Circle cx={x + 6 * scale} cy={y + 2 * scale} r={7 * scale} fill="#27693d" />
    </G>
  );
}

function CarSvg({ x, y, color = '#4aa8ff' }) {
  return (
    <G>
      <Polygon points={`${x},${y} ${x + 22},${y - 6} ${x + 32},${y + 3} ${x + 10},${y + 9}`} fill="#0e171c" opacity="0.4" />
      <Polygon points={`${x},${y - 4} ${x + 20},${y - 10} ${x + 28},${y - 3} ${x + 8},${y + 3}`} fill={color} stroke="#d8edf6" strokeWidth="1" />
      <Polygon points={`${x + 7},${y - 6} ${x + 15},${y - 8.5} ${x + 20},${y - 4} ${x + 12},${y - 1.5}`} fill="#294d61" />
      <Circle cx={x + 6} cy={y + 1.5} r="2" fill="#10171a" />
      <Circle cx={x + 24} cy={y - 3.8} r="2" fill="#10171a" />
    </G>
  );
}

function TinyPersonSvg({ x, y, color = '#5c91ad', accent = '#f0c69a' }) {
  return (
    <G>
      <Circle cx={x} cy={y} r="3" fill={accent} />
      <Rect x={x - 3} y={y + 3} width="6" height="8" rx="2" fill={color} />
      <Line x1={x - 2} y1={y + 11} x2={x - 4} y2={y + 16} stroke="#24323a" strokeWidth="2" />
      <Line x1={x + 2} y1={y + 11} x2={x + 4} y2={y + 16} stroke="#24323a" strokeWidth="2" />
    </G>
  );
}

function CapacityBadge({ x, y, label, value, max, hot }) {
  const p = pct(value, max);
  return (
    <G>
      <Rect x={x} y={y} width="110" height="39" rx="7" fill={hot ? '#4a2521' : '#0a171d'} stroke={hot ? '#ff785f' : '#52707d'} strokeWidth="1.5" />
      <SvgText x={x + 7} y={y + 12} fontSize="7" fontWeight="900" fill="#8da5b0">{label}</SvgText>
      <SvgText x={x + 7} y={y + 25} fontSize="10" fontWeight="900" fill="#edf5f7">{value}/{max}</SvgText>
      <Rect x={x + 58} y={y + 20} width="45" height="6" rx="3" fill="#203039" />
      <Rect x={x + 58} y={y + 20} width={45 * p / 100} height="6" rx="3" fill={hot ? '#ed765f' : '#58b9ee'} />
    </G>
  );
}

function TrainSprite({ train, ready = false, late = false, moving = false, onPress, doorsOpen = false }) {
  if (!train) return null;
  const body = (
    <View style={[styles.trainSprite, moving && styles.trainSpriteMoving]}>
      {Array.from({ length: train.sets }).map((_, i) => (
        <React.Fragment key={`${train.id}-${i}`}>
          {i > 0 ? <View style={styles.trainCoupler} /> : null}
          <View style={[styles.trainSet, { borderColor: train.destination.color }, ready && styles.trainSetReady, late && styles.trainSetLate]}>
            <View style={[styles.trainNose, { backgroundColor: train.destination.color }]} />
            <View style={styles.trainWindows}>
              <View style={styles.trainWindow} /><View style={styles.trainWindow} /><View style={styles.trainWindow} />
            </View>
            <View style={[styles.trainDoor, doorsOpen && styles.trainDoorOpen]} />
            <Text style={styles.trainCode}>{train.type.code}</Text>
          </View>
        </React.Fragment>
      ))}
    </View>
  );
  if (!onPress) return body;
  return <Pressable hitSlop={14} onPress={onPress} style={styles.trainTap}>{body}</Pressable>;
}

function ExchangeFlow({ train, lane, visible }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!visible) return undefined;
    anim.setValue(0);
    const loop = Animated.loop(Animated.timing(anim, { toValue: 1, duration: 1150, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [visible, anim]);
  if (!visible || !train) return null;
  const moveIn = anim.interpolate({ inputRange: [0, 1], outputRange: [0, 34] });
  const moveOut = anim.interpolate({ inputRange: [0, 1], outputRange: [28, -6] });
  const top = LANE_TOP[lane] + 34;
  return (
    <View pointerEvents="none" style={[styles.exchangeWrap, { left: 1035, top }]}>
      <Text style={styles.exchangeLabel}>DEUREN OPEN • IN / UIT</Text>
      {[0, 1, 2].map((i) => (
        <Animated.View key={`in-${i}`} style={[styles.exchangePerson, { left: 5 + i * 10, backgroundColor: train.destination.color, transform: [{ translateX: moveIn }] }]} />
      ))}
      {[0, 1].map((i) => (
        <Animated.View key={`out-${i}`} style={[styles.exchangePerson, styles.exchangeOut, { left: 53 + i * 10, transform: [{ translateX: moveOut }] }]} />
      ))}
    </View>
  );
}

function PlatformCrowd({ lane, count, color }) {
  const dots = Math.min(22, Math.max(0, Math.ceil(count / 9)));
  return (
    <View pointerEvents="none" style={[styles.platformCrowd, { top: LANE_TOP[lane] + 2 }]}>
      {Array.from({ length: dots }).map((_, i) => (
        <View key={i} style={styles.platformPerson}>
          <View style={[styles.platformHead, i % 4 === 0 && { backgroundColor: color }]} />
          <View style={styles.platformBody} />
        </View>
      ))}
    </View>
  );
}

function SceneBase({ parkingLevel, gateLevel, hallLevel, retailLevel, ticketLevel, platformLevel, platform3, parkingQueue, entranceQueue, hallDemand, platformDemand, platforms, services, bottleneck }) {
  const hallTotal = sum(hallDemand);
  const parkingSlots = Math.min(24, 8 + parkingLevel * 4);
  const occupiedCars = Math.min(parkingSlots, Math.ceil((parkingQueue / Math.max(1, parkingCap(parkingLevel))) * parkingSlots));
  const gates = Math.min(7, 1 + gateLevel);
  const hallWidth = 190 + hallLevel * 14;
  const kioskCount = Math.min(4, retailLevel);
  return (
    <Svg width={WORLD_WIDTH} height={WORLD_HEIGHT} viewBox={`0 0 ${WORLD_WIDTH} ${WORLD_HEIGHT}`}>
      <Rect x="0" y="0" width={WORLD_WIDTH} height={WORLD_HEIGHT} fill="#cfe4b5" />
      <Polygon points="0,430 1420,170 1420,540 0,540" fill="#98ba79" />
      <Polygon points="0,397 1420,137 1420,237 0,497" fill="#5d6667" />
      <Line x1="0" y1="432" x2="1420" y2="172" stroke="#d7dcda" strokeWidth="3" strokeDasharray="18 13" opacity="0.5" />
      {[70, 150, 230, 465, 520, 600, 1280, 1330].map((x, i) => <Tree key={i} x={x} y={i % 2 ? 365 : 340} scale={0.8 + (i % 3) * 0.12} />)}

      <Polygon points={diamond(190, 270, 330, 175)} fill="#8b9797" stroke={bottleneck === 'PARKEREN' ? '#ff6e57' : '#d5dddd'} strokeWidth={bottleneck === 'PARKEREN' ? 5 : 2} />
      <Polygon points={diamond(190, 245, 306, 145)} fill="#525f61" stroke="#bac5c5" strokeWidth="1" />
      <SvgText x="53" y="145" fontSize="13" fontWeight="900" fill="#17384a">1  PARKEREN</SvgText>
      <SvgText x="53" y="162" fontSize="9" fontWeight="700" fill="#45616b">Level {parkingLevel} • +{parkingInflow(parkingLevel)}/s reizigers</SvgText>
      {Array.from({ length: parkingSlots }).map((_, i) => {
        const row = Math.floor(i / 6);
        const col = i % 6;
        const x = 85 + col * 36 + row * 15;
        const y = 205 + row * 25 - col * 8;
        return (
          <G key={i}>
            <Polygon points={`${x},${y} ${x + 27},${y - 6.5} ${x + 36},${y + 1} ${x + 9},${y + 7.5}`} fill="none" stroke="#d6dddd" strokeWidth="1" opacity="0.8" />
            {i < occupiedCars ? <CarSvg x={x + 2} y={y + 1} color={i % 4 === 0 ? '#ef6d62' : i % 4 === 1 ? '#4aa8ff' : i % 4 === 2 ? '#efc64f' : '#e8eef0'} /> : null}
          </G>
        );
      })}
      <CapacityBadge x={115} y={343} label="PARKEERBEZETTING" value={parkingQueue} max={parkingCap(parkingLevel)} hot={bottleneck === 'PARKEREN'} />

      <Polygon points={diamond(485, 238, 250, 150)} fill="#9ba5a5" stroke={bottleneck === 'ENTREE' ? '#ff6e57' : '#d9dfdf'} strokeWidth={bottleneck === 'ENTREE' ? 5 : 2} />
      <SvgText x="385" y="130" fontSize="13" fontWeight="900" fill="#17384a">2  ENTREE & POORTJES</SvgText>
      <SvgText x="385" y="147" fontSize="9" fontWeight="700" fill="#45616b">Level {gateLevel} • {gateRate(gateLevel)}/s doorstroom</SvgText>
      <Polygon points="411,220 505,198 555,236 461,258" fill="#364a50" stroke="#718993" strokeWidth="2" />
      <Polygon points="411,220 461,258 461,302 411,264" fill="#26383e" />
      <Polygon points="461,258 555,236 555,280 461,302" fill="#1f3137" />
      {Array.from({ length: gates }).map((_, i) => {
        const gx = 424 + i * 21;
        const gy = 233 - i * 5;
        return <G key={i}><Rect x={gx} y={gy} width="9" height="29" fill="#4f6872" stroke="#9bb0b8" strokeWidth="1" /><Circle cx={gx + 4.5} cy={gy + 7} r="2.2" fill="#50e18a" /></G>;
      })}
      {Array.from({ length: Math.min(18, Math.ceil(entranceQueue / 4)) }).map((_, i) => <TinyPersonSvg key={i} x={395 + (i % 6) * 19 + Math.floor(i / 6) * 8} y={309 - (i % 6) * 4 + Math.floor(i / 6) * 16} color={bottleneck === 'ENTREE' ? '#d66a56' : '#507f9a'} />)}
      <CapacityBadge x={430} y={344} label="WACHT VOOR POORTJES" value={entranceQueue} max={entranceBuffer(gateLevel)} hot={bottleneck === 'ENTREE'} />

      <Polygon points={diamond(760, 235, 330 + hallLevel * 15, 205)} fill="#b6b6aa" stroke={bottleneck === 'HAL' ? '#ff6e57' : '#e8e3d5'} strokeWidth={bottleneck === 'HAL' ? 5 : 2} />
      <SvgText x="640" y="89" fontSize="13" fontWeight="900" fill="#17384a">3  STATIONSHAL</SvgText>
      <SvgText x="640" y="106" fontSize="9" fontWeight="700" fill="#45616b">Level {hallLevel} • winkels {retailLevel} • service {ticketLevel}</SvgText>
      <Polygon points={`${690},${185} ${690 + hallWidth},${185 - hallWidth * 0.24} ${690 + hallWidth + 45},${218} ${735},${263}`} fill="#566f7b" stroke="#d5e5eb" strokeWidth="2" />
      <Polygon points={`${690},${185} ${735},${263} ${735},${325} ${690},${247}`} fill="#344b55" />
      <Polygon points={`${735},${263} ${690 + hallWidth + 45},${218} ${690 + hallWidth + 45},${280} ${735},${325}`} fill="#405b66" />
      <Polygon points={`${705},${178} ${690 + hallWidth - 10},${178 - (hallWidth - 15) * 0.24} ${690 + hallWidth + 26},${208} ${741},${252}`} fill="#243944" />
      <SvgText x="737" y="205" fontSize="10" fontWeight="900" fill="#e8f4f7">CENTRAAL STATION</SvgText>
      {Array.from({ length: 6 }).map((_, i) => <Polygon key={i} points={`${748 + i * 27},${269 - i * 6} ${763 + i * 27},${265.5 - i * 6} ${763 + i * 27},${288 - i * 6} ${748 + i * 27},${292 - i * 6}`} fill="#79b5cf" stroke="#c8e7f2" strokeWidth="1" />)}
      {Array.from({ length: kioskCount }).map((_, i) => <G key={i}><Polygon points={`${660 + i * 48},${333 - i * 10} ${690 + i * 48},${326 - i * 10} ${709 + i * 48},${340 - i * 10} ${679 + i * 48},${347 - i * 10}`} fill={i % 2 ? '#785a37' : '#6d4631'} stroke="#d2b27a" strokeWidth="1" /><SvgText x={674 + i * 48} y={341 - i * 10} fontSize="6" fontWeight="900" fill="#ffe2b0">{i % 2 ? 'SHOP' : 'CAFE'}</SvgText></G>)}
      {Array.from({ length: Math.min(28, Math.ceil(hallTotal / 8)) }).map((_, i) => <TinyPersonSvg key={i} x={660 + (i % 10) * 27 + Math.floor(i / 10) * 10} y={376 - (i % 10) * 6 + Math.floor(i / 10) * 22} color={i % 4 === 0 ? '#d09547' : '#507f9a'} />)}
      <CapacityBadge x={730} y={412} label="HALCAPACITEIT" value={hallTotal} max={hallCap(hallLevel)} hot={bottleneck === 'HAL'} />

      <SvgText x="1017" y="42" fontSize="13" fontWeight="900" fill="#17384a">4  PERRONS & TREINEN</SvgText>
      <SvgText x="1017" y="59" fontSize="9" fontWeight="700" fill="#45616b">Level {platformLevel} • tik een groene trein voor vertrek</SvgText>
      {[1, 2, 3].map((lane) => {
        const locked = lane === 3 && !platform3;
        const serviceForLane = (d) => services.find((s) => s.destination.id === d.id && s.status !== 'departed');
        const waiting = DESTINATIONS.reduce((acc, d) => acc + (((serviceForLane(d)?.actualLane || serviceForLane(d)?.plannedLane) === lane) ? platformDemand[d.id] : 0), 0);
        const train = platforms[lane];
        const color = train?.destination?.color || '#7b8f99';
        const y = LANE_TOP[lane];
        return (
          <G key={lane}>
            <Polygon points={isoRect(990, y, 325, 58)} fill={locked ? '#817c70' : '#a9a79b'} stroke={(bottleneck === 'PERRONS' || bottleneck === 'TREINEN') && !locked ? '#ff6e57' : '#e1ded2'} strokeWidth={(bottleneck === 'PERRONS' || bottleneck === 'TREINEN') && !locked ? 4 : 2} opacity={locked ? 0.55 : 1} />
            <Polygon points={isoRect(1005, y + 38, 315, 30)} fill="#273237" />
            <Line x1="1014" y1={y + 48} x2="1328" y2={y - 27} stroke="#b5bec1" strokeWidth="3" />
            <Line x1="1025" y1={y + 62} x2="1339" y2={y - 13} stroke="#b5bec1" strokeWidth="3" />
            <Polygon points={isoRect(1015, y - 8, 190, 20)} fill="#5d696c" opacity="0.9" />
            {Array.from({ length: Math.min(3, 1 + Math.floor(platformLevel / 2)) }).map((_, i) => <G key={i}><Line x1={1045 + i * 75} y1={y + 10 - i * 18} x2={1045 + i * 75} y2={y - 17 - i * 18} stroke="#45545a" strokeWidth="4" /><Line x1={1035 + i * 75} y1={y - 15 - i * 18} x2={1075 + i * 75} y2={y - 25 - i * 18} stroke="#596a70" strokeWidth="6" /></G>)}
            <Rect x="1000" y={y - 2} width="48" height="27" rx="5" fill="#0a171d" />
            <SvgText x="1008" y={y + 10} fontSize="9" fontWeight="900" fill="#fff">P{lane}</SvgText>
            <SvgText x="1008" y={y + 21} fontSize="7" fontWeight="900" fill={locked ? '#d6bf85' : color}>{locked ? 'BOUW' : train ? train.destination.code : 'VRIJ'}</SvgText>
            {locked ? <SvgText x="1115" y={y + 22} fontSize="12" fontWeight="900" fill="#f0d48b">NIEUW PERRON</SvgText> : null}
            {!locked ? <G><Rect x="1250" y={y + 62} width="85" height="25" rx="5" fill="#0a171d" opacity="0.9" /><SvgText x="1258" y={y + 72} fontSize="6" fontWeight="900" fill="#849aa4">WACHTEND</SvgText><SvgText x="1258" y={y + 82} fontSize="8" fontWeight="900" fill={waiting >= platformCap(platformLevel) * 0.9 ? '#ff806d' : '#e5eef1'}>{waiting}/{platformCap(platformLevel)}</SvgText></G> : null}
          </G>
        );
      })}

      <Polygon points={diamond(1370, 355, 95, 95)} fill="#789d71" stroke="#d7e5d1" strokeWidth="2" strokeDasharray="8 6" />
      <SvgText x="1336" y="345" fontSize="10" fontWeight="900" fill="#234b39">WERELD</SvgText>
      <SvgText x="1338" y="360" fontSize="10" fontWeight="900" fill="#234b39">VERDER »</SvgText>
      <SvgText x="1338" y="378" fontSize="7" fontWeight="700" fill="#446b59">opstelterrein</SvgText>
      <SvgText x="1343" y="390" fontSize="7" fontWeight="700" fill="#446b59">bus • taxi</SvgText>
    </Svg>
  );
}

function IsometricScene({
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
  const platformTotal = sum(platformDemand);
  const arrivalX = arrivalProgress.interpolate({ inputRange: [0, 1], outputRange: [320, 0] });
  const arrivalY = arrivalProgress.interpolate({ inputRange: [0, 1], outputRange: [-76, 0] });
  const departureX = departureProgress.interpolate({ inputRange: [0, 1], outputRange: [0, 360] });
  const departureY = departureProgress.interpolate({ inputRange: [0, 1], outputRange: [0, -86] });

  return (
    <View style={styles.sceneCanvas}>
      <SceneBase
        parkingLevel={parkingLevel}
        gateLevel={gateLevel}
        hallLevel={hallLevel}
        retailLevel={retailLevel}
        ticketLevel={ticketLevel}
        platformLevel={platformLevel}
        platform3={platform3}
        parkingQueue={parkingQueue}
        entranceQueue={entranceQueue}
        hallDemand={hallDemand}
        platformDemand={platformDemand}
        platforms={platforms}
        services={services}
        bottleneck={bottleneck}
      />

      <TrafficCar delay={0} color="#4aa8ff" top={392} />
      <TrafficCar delay={1600} color="#ef6d62" top={402} />
      <TrafficCar delay={3100} color="#efc64f" top={414} />

      <TravelerStream left={300} top={205} width={150} amount={Math.min(parkingQueue, gateRate(gateLevel))} color="#52bfff" label="naar poortjes" />
      <TravelerStream left={545} top={192} width={150} amount={Math.min(entranceQueue, gateRate(gateLevel))} color="#ffd25e" label="naar hal" />
      <TravelerStream left={875} top={176} width={150} amount={Math.min(hallTotal, hallRate(hallLevel))} color="#64db93" label="naar perrons" />

      {[1, 2, 3].map((lane) => {
        if (lane === 3 && !platform3) return null;
        const waiting = DESTINATIONS.reduce((acc, d) => {
          const s = services.find((svc) => svc.destination.id === d.id && svc.status !== 'departed');
          return acc + ((s?.actualLane || s?.plannedLane) === lane ? platformDemand[d.id] : 0);
        }, 0);
        const train = platforms[lane];
        const hiddenByMotion = (arrivalTrain && arrivalLane === lane) || (departureTrain && departureLane === lane);
        const depIn = train ? train.departureAt - now : 0;
        const ready = Boolean(train && train.status === 'ready' && depIn <= 0 && depIn >= -DELAY_MARGIN);
        const late = Boolean(train && train.status === 'ready' && depIn < -DELAY_MARGIN);
        return (
          <React.Fragment key={lane}>
            <PlatformCrowd lane={lane} count={waiting} color={train?.destination?.color || '#7b8f99'} />
            {train && !hiddenByMotion ? (
              <View style={[styles.stationaryTrain, { top: LANE_TOP[lane] + 42 }]}>
                <TrainSprite train={train} ready={ready} late={late} doorsOpen={train.status === 'dwelling'} onPress={() => onDepart(lane)} />
                <View style={[styles.trainStatusBadge, ready && styles.trainStatusReady, late && styles.trainStatusLate]}>
                  <Text style={styles.trainStatusText}>{train.number} • {train.status === 'dwelling' ? `${train.remaining}s HALTE` : depIn > 0 ? `VERTREK OVER ${depIn}s` : depIn >= -DELAY_MARGIN ? `TIK • ${DELAY_MARGIN + depIn}s MARGE` : `+${Math.abs(depIn + DELAY_MARGIN)}s`}</Text>
                </View>
              </View>
            ) : null}
            <ExchangeFlow train={train} lane={lane} visible={Boolean(train && train.status === 'dwelling' && !hiddenByMotion)} />
          </React.Fragment>
        );
      })}

      {arrivalTrain && arrivalLane ? (
        <Animated.View pointerEvents="none" style={[styles.movingTrainWrap, { top: LANE_TOP[arrivalLane] + 42, transform: [{ translateX: arrivalX }, { translateY: arrivalY }] }]}>
          <TrainSprite train={arrivalTrain} moving />
          <Text style={styles.motionLabel}>BINNEN → P{arrivalLane}</Text>
        </Animated.View>
      ) : null}

      {departureTrain && departureLane ? (
        <Animated.View pointerEvents="none" style={[styles.movingTrainWrap, { top: LANE_TOP[departureLane] + 42, transform: [{ translateX: departureX }, { translateY: departureY }] }]}>
          <TrainSprite train={departureTrain} moving ready />
          <Text style={styles.motionLabel}>→ {departureTrain.destination.code}</Text>
        </Animated.View>
      ) : null}

      <View style={styles.sceneLegend}>
        <Text style={styles.sceneLegendText}>STATION Lv {stationLevel}</Text>
        <Text style={styles.sceneLegendText}>👥 {parkingQueue + entranceQueue + hallTotal + platformTotal} in systeem</Text>
        <Text style={styles.sceneLegendText}>🚗 live verkeer • 🚆 live treinbewegingen</Text>
      </View>
    </View>
  );
}

function BalanceBar({ data }) {
  const worst = [...data].sort((a, b) => b.pressure - a.pressure)[0];
  return (
    <View style={styles.balanceCard}>
      <View style={styles.balanceHead}><Text style={styles.balanceTitle}>CAPACITEITSKETEN</Text><Text style={styles.balanceWorst}>KNELPUNT: {worst.label}</Text></View>
      <View style={styles.balanceStages}>
        {data.map((item, index) => <React.Fragment key={item.label}>{index > 0 ? <Text style={styles.balanceArrow}>›</Text> : null}<View style={[styles.balanceStage, item.pressure >= 90 && styles.balanceStageBad]}><Text style={styles.balanceStageLabel}>{item.label}</Text><Text style={styles.balanceStageValue}>{Math.min(999, item.pressure)}%</Text></View></React.Fragment>)}
      </View>
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
    <Pressable disabled={done} onPress={onPress} style={[styles.upgrade, cash >= cost && !done && styles.upgradeAffordable, focus && styles.upgradeFocus, done && styles.upgradeDone]}>
      <Text style={styles.upgradeIcon}>{icon}</Text>
      <Text style={styles.upgradeTitle}>{title}</Text>
      <Text style={styles.upgradeLevel}>{done ? 'OPEN' : `LEVEL ${level}`}</Text>
      <Text style={styles.upgradeDesc}>{description}</Text>
      <View style={styles.upgradeButton}><Text style={styles.upgradeButtonText}>{done ? 'ACTIEF' : `UPGRADE  ${money(cost)}`}</Text></View>
    </Pressable>
  );
}

export default function App() {
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

  const persist = () => safeSave({
    cash: Math.round(cashRef.current), stationLevel: stationLevelRef.current, xp: Math.round(xpRef.current),
    parkingLevel: parkingLevelRef.current, gateLevel: gateLevelRef.current, hallLevel: hallLevelRef.current,
    platformLevel: platformLevelRef.current, fleetLevel: fleetLevelRef.current, retailLevel: retailLevelRef.current,
    ticketLevel: ticketLevelRef.current, platform3: platform3Ref.current, handled: handledRef.current,
    lost: lostRef.current, transported: transportedRef.current, onTime: onTimeRef.current, lastSaved: Date.now(),
  });
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

  const distributeTransfers = (train, transferCount) => {
    const next = { ...hallRef.current };
    const choices = DESTINATIONS.filter((d) => d.unlock <= stationLevelRef.current && d.id !== train.destination.id);
    for (let i = 0; i < transferCount && choices.length; i += 1) next[choices[i % choices.length].id] += 1;
    syncHall(next);
  };

  const startArrival = (train, lane, diverted = false) => {
    if (!train || arrivalBusy.current || platformsRef.current[lane] || (lane === 3 && !platform3Ref.current)) return false;
    arrivalBusy.current = true;
    syncOutside(outsideRef.current.filter((item) => item.id !== train.id));
    updateService(train.id, { status: 'arriving', actualLane: lane });
    const moving = { ...train, actualLane: lane };
    setArrivalTrain(moving); setArrivalLane(lane); arrivalProgress.setValue(0);
    setMessage(diverted ? `${train.number} wijkt uit naar P${lane}.` : `${train.number} rijdt automatisch richting P${lane}.`);
    Animated.timing(arrivalProgress, { toValue: 1, duration: ARRIVAL_MS, useNativeDriver: true }).start(({ finished }) => {
      arrivalBusy.current = false;
      if (!finished) return;
      const alight = Math.min(moving.onboard, Math.round(moving.onboard * (0.18 + Math.random() * 0.17)));
      const transfer = Math.round(alight * (0.22 + Math.random() * 0.28));
      distributeTransfers(moving, transfer);
      const atPlatform = { ...moving, status: 'dwelling', actualLane: lane, remaining: moving.type.dwell, onboard: moving.onboard - alight, lastAlight: alight, lastTransfer: transfer };
      syncPlatforms({ ...platformsRef.current, [lane]: atPlatform });
      updateService(moving.id, { status: 'platform', actualLane: lane });
      setArrivalTrain(null); setArrivalLane(null);
      setMessage(`${moving.number} op P${lane}: ${alight} uitgestapt, ${transfer} overstappers. Deuren open.`);
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
      addCash(revenue + (within ? 75 : 0)); awardXp(Math.round(train.onboard / 4) + (within ? 45 : 10));
      setMessage(`${train.number} → ${train.destination.name}: ${money(revenue)}${within ? ' + €75 op-tijdbonus' : ''}.`);
      persist(); setTimeout(tryArrival, 100);
    });
  };

  useEffect(() => {
    if (phase !== 'playing') return undefined;
    const timer = setInterval(() => {
      const t = nowRef.current + 1;
      nowRef.current = t; setNow(t);

      let nextServices = [...servicesRef.current];
      while (nextServices.filter((s) => s.status === 'scheduled').length < 6) {
        nextServices.push(makeService(nextServiceAt.current));
        nextServiceAt.current += SERVICE_INTERVAL;
      }
      const newlyDue = [];
      nextServices = nextServices.map((s) => {
        if (s.status === 'scheduled' && s.arrivalAt <= t) { const due = { ...s, status: 'waiting', wait: 0 }; newlyDue.push(due); return due; }
        return s;
      });
      syncServices(nextServices);
      if (newlyDue.length) syncOutside([...outsideRef.current, ...newlyDue]);
      if (outsideRef.current.length) syncOutside(outsideRef.current.map((s) => ({ ...s, wait: (s.wait || 0) + 1 })));

      const inflow = parkingInflow(parkingLevelRef.current);
      const freeParking = Math.max(0, parkingCap(parkingLevelRef.current) - parkingRef.current);
      const enterParking = Math.min(inflow, freeParking);
      const rejected = inflow - enterParking;
      if (rejected > 0) { lostRef.current += rejected; setLost(lostRef.current); }
      let nextParking = parkingRef.current + enterParking;

      const freeEntrance = Math.max(0, entranceBuffer(gateLevelRef.current) - entranceRef.current);
      const toEntrance = Math.min(nextParking, gateRate(gateLevelRef.current), freeEntrance);
      nextParking -= toEntrance;
      let nextEntrance = entranceRef.current + toEntrance;

      const nextHall = { ...hallRef.current };
      const hallSpace = Math.max(0, hallCap(hallLevelRef.current) - sum(nextHall));
      const throughGates = Math.min(nextEntrance, gateRate(gateLevelRef.current), hallSpace);
      nextEntrance -= throughGates;
      const unlocked = DESTINATIONS.filter((d) => d.unlock <= stationLevelRef.current);
      for (let i = 0; i < throughGates; i += 1) { const d = unlocked[(demandCursor.current + i) % unlocked.length]; nextHall[d.id] += 1; }
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
        nextPlatformDemand[train.destination.id] -= board;
        train.onboard += board;
        train.lastBoard = board;
        if (train.status === 'dwelling') {
          train.remaining = Math.max(0, train.remaining - 1);
          if (train.remaining === 0) train.status = 'ready';
        }
        nextPlatforms[lane] = train;
      });

      syncParking(nextParking); syncEntrance(nextEntrance); syncHall(nextHall); syncPlatformDemand(nextPlatformDemand); syncPlatforms(nextPlatforms);
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
    setMessage('Station geopend. Auto’s rijden aan, reizigers lopen door de keten en treinen bewegen zichtbaar binnen en buiten.');
    setPhase('playing');
  };

  const doUpgrade = (kind) => {
    const map = {
      parking: [parkingCost(parkingLevelRef.current), parkingLevelRef, setParkingLevel, 'Parkeren uitgebreid: meer vakken en meer reizigersaanvoer.'],
      gates: [gateCost(gateLevelRef.current), gateLevelRef, setGateLevel, 'Meer poortjes zichtbaar: de wachtrij stroomt sneller door.'],
      hall: [hallCost(hallLevelRef.current), hallLevelRef, setHallLevel, 'Stationshal fysiek groter: meer ruimte en hogere doorstroming.'],
      platforms: [platformCost(platformLevelRef.current), platformLevelRef, setPlatformLevel, 'Perrons uitgebreid: meer ruimte en extra overkappingen.'],
      fleet: [fleetCost(fleetLevelRef.current), fleetLevelRef, setFleetLevel, 'Treinvloot uitgebreid: toekomstige treinen krijgen meer stellen.'],
      retail: [retailCost(retailLevelRef.current), retailLevelRef, setRetailLevel, 'Extra winkelunit gebouwd: meer passief inkomen.'],
      tickets: [ticketCost(ticketLevelRef.current), ticketLevelRef, setTicketLevel, 'Service verbeterd: hogere opbrengst per vervoerde reiziger.'],
    };
    const entry = map[kind]; if (!entry) return;
    const [cost, ref, setter, text] = entry;
    if (!spend(cost)) return setMessage('Niet genoeg geld voor deze uitbreiding.');
    ref.current += 1; setter(ref.current); setMessage(text); persist();
  };

  const buildP3 = () => {
    if (platform3Ref.current) return;
    if (!spend(platform3Cost)) return setMessage('Niet genoeg geld voor Perron 3.');
    platform3Ref.current = true; setPlatform3(true); setMessage('Perron 3 gebouwd: bouwterrein verandert direct in een volwaardig perron.'); persist();
  };

  if (phase === 'menu') {
    return (
      <SafeAreaView style={styles.screen}>
        <StatusBar barStyle="light-content" />
        <View style={styles.menu}>
          <Text style={styles.kicker}>LIVING MOTION / V0.14</Text>
          <Text style={styles.logo}>RAIL{`\n`}RUSH HOUR</Text>
          <Text style={styles.subtitle}>De stationwereld leeft: auto’s rijden aan, reizigers lopen door het station, treinen rijden zichtbaar binnen en vertrekken, deuren openen en overstappers keren terug de hal in.</Text>
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
        <View style={styles.levelCard}>
          <View style={styles.levelTop}><Text style={styles.levelTitle}>STATIONNIVEAU {stationLevel}</Text><Text style={styles.levelXp}>{xp}/{levelTarget(stationLevel)} XP</Text></View>
          <View style={styles.levelTrack}><View style={[styles.levelFill, { width: `${pct(xp, levelTarget(stationLevel))}%` }]} /></View>
          <Text style={styles.levelHint}>{transported} vervoerd • {handled} treinen • {onTime} binnen marge • {lost} gemiste instroom</Text>
        </View>

        <BalanceBar data={balance} />

        <View style={styles.worldFrame}>
          <View style={styles.worldFrameHead}>
            <View><Text style={styles.worldKicker}>V0.14 • LIVING MOTION</Text><Text style={styles.worldTitle}>SWIPE • KIJK • GRIJP IN</Text></View>
            <Text style={styles.swipeHint}>↔ LIVE WERELD</Text>
          </View>
          <View style={styles.jumpRow}>
            <Pressable style={styles.jumpButton} onPress={() => worldScrollRef.current?.scrollTo({ x: 0, animated: true })}><Text style={styles.jumpText}>🚗 PARKEREN</Text></Pressable>
            <Pressable style={styles.jumpButton} onPress={() => worldScrollRef.current?.scrollTo({ x: 480, animated: true })}><Text style={styles.jumpText}>🏢 STATION</Text></Pressable>
            <Pressable style={styles.jumpButton} onPress={() => worldScrollRef.current?.scrollTo({ x: 900, animated: true })}><Text style={styles.jumpText}>🚆 PERRONS</Text></Pressable>
          </View>
          <ScrollView ref={worldScrollRef} horizontal showsHorizontalScrollIndicator={false} nestedScrollEnabled contentContainerStyle={{ width: WORLD_WIDTH }}>
            <IsometricScene
              parkingLevel={parkingLevel} gateLevel={gateLevel} hallLevel={hallLevel} retailLevel={retailLevel} ticketLevel={ticketLevel}
              platformLevel={platformLevel} stationLevel={stationLevel} platform3={platform3} parkingQueue={parkingQueue} entranceQueue={entranceQueue}
              hallDemand={hallDemand} platformDemand={platformDemand} platforms={platforms} services={services} now={now} bottleneck={bottleneck} onDepart={depart}
              arrivalTrain={arrivalTrain} arrivalLane={arrivalLane} arrivalProgress={arrivalProgress}
              departureTrain={departureTrain} departureLane={departureLane} departureProgress={departureProgress}
            />
          </ScrollView>
        </View>

        <View style={styles.message}><View style={styles.messageLamp} /><Text style={styles.messageText}>{message}</Text></View>

        {blocked ? (
          <View style={styles.blockedCard}>
            <View style={styles.blockedTop}><View><Text style={styles.blockedLabel}>TREIN WACHT BUITEN</Text><Text style={styles.blockedTrain}>{blocked.number} → {blocked.destination.name}</Text></View><Text style={styles.blockedDelay}>+{blocked.wait}s</Text></View>
            <Text style={styles.blockedReason}>P{blocked.plannedLane} is bezet. Laat wachten of wijk uit naar een ander vrij perron.</Text>
            <View style={styles.divertRow}>{[1, 2, 3].filter((lane) => lane !== blocked.plannedLane && (lane !== 3 || platform3)).map((lane) => <Pressable key={lane} disabled={Boolean(platforms[lane])} onPress={() => divert(lane)} style={[styles.divert, platforms[lane] && styles.disabled]}><Text style={styles.divertSmall}>{platforms[lane] ? 'BEZET' : 'WIJK UIT'}</Text><Text style={styles.divertBig}>P{lane}</Text></Pressable>)}</View>
          </View>
        ) : null}

        <Timetable services={services} now={now} />

        <Text style={styles.sectionHeading}>BOUW & GROEI</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.upgradeRail} nestedScrollEnabled>
          <Upgrade icon="🚗" title="PARKEREN" level={parkingLevel} description={`${parkingCap(parkingLevel)} plaatsen • +${parkingInflow(parkingLevel)}/s vraag`} cost={parkingCost(parkingLevel)} cash={cash} onPress={() => doUpgrade('parking')} focus={bottleneck === 'PARKEREN'} />
          <Upgrade icon="🚪" title="POORTJES" level={gateLevel} description={`${gateRate(gateLevel)}/s doorstroom`} cost={gateCost(gateLevel)} cash={cash} onPress={() => doUpgrade('gates')} focus={bottleneck === 'ENTREE'} />
          <Upgrade icon="🏢" title="HAL" level={hallLevel} description={`${hallCap(hallLevel)} capaciteit`} cost={hallCost(hallLevel)} cash={cash} onPress={() => doUpgrade('hall')} focus={bottleneck === 'HAL'} />
          <Upgrade icon="🚉" title="PERRONS" level={platformLevel} description={`${platformCap(platformLevel)} wachtenden/perron`} cost={platformCost(platformLevel)} cash={cash} onPress={() => doUpgrade('platforms')} focus={bottleneck === 'PERRONS'} />
          <Upgrade icon="🚆" title="TREINVLOOT" level={fleetLevel} description="Langere toekomstige treinen" cost={fleetCost(fleetLevel)} cash={cash} onPress={() => doUpgrade('fleet')} focus={bottleneck === 'TREINEN'} />
          <Upgrade icon="➕" title="PERRON 3" level={1} description="Bouw een derde perron" cost={platform3Cost} cash={cash} onPress={buildP3} done={platform3} />
          <Upgrade icon="☕" title="WINKELS" level={retailLevel} description={`${money(retailIncome(retailLevel))}/s passief`} cost={retailCost(retailLevel)} cash={cash} onPress={() => doUpgrade('retail')} />
          <Upgrade icon="🎫" title="SERVICE" level={ticketLevel} description={`+${Math.round((fareMultiplier(ticketLevel) - 1) * 100)}% ritopbrengst`} cost={ticketCost(ticketLevel)} cash={cash} onPress={() => doUpgrade('tickets')} />
        </ScrollView>
      </ScrollView>

      <View style={styles.footer}><Text style={styles.footerText}>V0.14 • AUTO’S • PASSAGIERS • DEUREN • AANKOMST • VERTREK • LIVE</Text></View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#071017' },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 10, paddingBottom: 28 },
  menu: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  kicker: { color: '#77b9dc', fontSize: 10, fontWeight: '900', letterSpacing: 2, marginBottom: 11 },
  logo: { color: '#f0f5f7', fontSize: 48, lineHeight: 44, fontWeight: '900', letterSpacing: -2, textAlign: 'center' },
  subtitle: { color: '#98a9b2', fontSize: 14, lineHeight: 21, textAlign: 'center', maxWidth: 390, marginTop: 18, marginBottom: 25 },
  primary: { backgroundColor: '#ffd45f', minWidth: 230, borderRadius: 10, paddingVertical: 16, alignItems: 'center' },
  primaryText: { color: '#111820', fontSize: 15, fontWeight: '900', letterSpacing: 1 },

  hud: { flexDirection: 'row', paddingVertical: 9, paddingHorizontal: 6, backgroundColor: '#0a151c', borderBottomWidth: 1, borderBottomColor: '#21333d' },
  hudCell: { flex: 1, alignItems: 'center' },
  hudLabel: { color: '#647a86', fontSize: 6.2, fontWeight: '900' },
  hudValue: { color: '#e8eff2', fontSize: 12.5, fontWeight: '900', marginTop: 2 },
  hudMoney: { color: '#67e396', fontSize: 12.5, fontWeight: '900', marginTop: 2 },
  hudWarn: { color: '#ffca62', fontSize: 7.8, fontWeight: '900', marginTop: 4 },

  levelCard: { marginTop: 8, backgroundColor: '#0f1b22', borderWidth: 1, borderColor: '#315064', borderRadius: 10, padding: 9 },
  levelTop: { flexDirection: 'row', justifyContent: 'space-between' },
  levelTitle: { color: '#dce9ee', fontSize: 9, fontWeight: '900' },
  levelXp: { color: '#82afc6', fontSize: 7.5, fontWeight: '900' },
  levelTrack: { height: 7, marginTop: 6, backgroundColor: '#1c2a32', borderRadius: 4, overflow: 'hidden' },
  levelFill: { height: '100%', backgroundColor: '#58b9ff' },
  levelHint: { color: '#71858f', fontSize: 6.8, marginTop: 5, fontWeight: '700' },

  balanceCard: { marginTop: 8, backgroundColor: '#121b20', borderWidth: 1, borderColor: '#394a54', borderRadius: 9, padding: 9 },
  balanceHead: { flexDirection: 'row', justifyContent: 'space-between' },
  balanceTitle: { color: '#8b9ea7', fontSize: 6.4, fontWeight: '900' },
  balanceWorst: { color: '#ffd267', fontSize: 6.6, fontWeight: '900' },
  balanceStages: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  balanceArrow: { color: '#60717a', fontSize: 14, marginHorizontal: 2 },
  balanceStage: { flex: 1, minHeight: 35, borderRadius: 5, borderWidth: 1, borderColor: '#2c3d46', backgroundColor: '#172229', alignItems: 'center', justifyContent: 'center' },
  balanceStageBad: { borderColor: '#e16e5d', backgroundColor: '#2b1b1a' },
  balanceStageLabel: { color: '#899aa4', fontSize: 5.1, fontWeight: '900' },
  balanceStageValue: { color: '#eef2f4', fontSize: 9, fontWeight: '900', marginTop: 2 },

  worldFrame: { marginTop: 8, borderWidth: 1, borderColor: '#345464', borderRadius: 12, overflow: 'hidden', backgroundColor: '#0a151b' },
  worldFrameHead: { minHeight: 50, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: '#0d1b22', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  worldKicker: { color: '#6d8b98', fontSize: 6.2, fontWeight: '900', letterSpacing: 1 },
  worldTitle: { color: '#e7f0f3', fontSize: 13, fontWeight: '900', marginTop: 2 },
  swipeHint: { color: '#79c9f5', fontSize: 8, fontWeight: '900' },
  jumpRow: { flexDirection: 'row', gap: 5, padding: 6, borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#223741' },
  jumpButton: { flex: 1, backgroundColor: '#14242d', borderWidth: 1, borderColor: '#315266', paddingVertical: 6, borderRadius: 6, alignItems: 'center' },
  jumpText: { color: '#b8d0db', fontSize: 6.2, fontWeight: '900' },
  sceneCanvas: { width: WORLD_WIDTH, height: WORLD_HEIGHT, position: 'relative', backgroundColor: '#cfe4b5' },

  flowOverlay: { position: 'absolute', height: 62, zIndex: 20, overflow: 'hidden' },
  flowPath: { position: 'absolute', top: 36, left: 0, right: 0, height: 4, opacity: 0.38, borderRadius: 2 },
  flowLabel: { position: 'absolute', top: 2, left: 0, right: 0, textAlign: 'center', color: '#17384a', fontSize: 7, fontWeight: '900' },
  personSprite: { position: 'absolute', top: 22, width: 9, height: 22, alignItems: 'center' },
  personHead: { width: 7, height: 7, borderRadius: 4 },
  personBody: { width: 7, height: 10, borderRadius: 2, backgroundColor: '#496978', marginTop: 1 },
  flowChevrons: { position: 'absolute', right: 4, top: 24, fontSize: 18, fontWeight: '900' },

  trafficCar: { position: 'absolute', left: 0, width: 34, height: 15, borderRadius: 5, borderWidth: 1, borderColor: '#eef8fb', zIndex: 17 },
  trafficWindow: { width: 14, height: 6, borderRadius: 2, backgroundColor: '#2d5366', alignSelf: 'center', marginTop: 3 },

  stationaryTrain: { position: 'absolute', left: 1070, zIndex: 35, alignItems: 'flex-start' },
  movingTrainWrap: { position: 'absolute', left: 1070, zIndex: 45, alignItems: 'flex-start' },
  trainSprite: { flexDirection: 'row', alignItems: 'center', transform: [{ rotateZ: '-13deg' }] },
  trainSpriteMoving: { opacity: 0.98 },
  trainSet: { width: 63, height: 24, borderWidth: 2, borderRadius: 6, backgroundColor: '#e4eef2', overflow: 'hidden', position: 'relative' },
  trainSetReady: { backgroundColor: '#aef0c2' },
  trainSetLate: { backgroundColor: '#f3a0aa' },
  trainNose: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 8 },
  trainWindows: { position: 'absolute', top: 4, left: 15, right: 8, flexDirection: 'row', justifyContent: 'space-around' },
  trainWindow: { width: 8, height: 4, borderRadius: 1, backgroundColor: '#315a70' },
  trainDoor: { position: 'absolute', bottom: 2, right: 12, width: 8, height: 10, backgroundColor: '#8ca5b1', borderWidth: 1, borderColor: '#5e7782' },
  trainDoorOpen: { backgroundColor: '#ffe46e', borderColor: '#fff3b7' },
  trainCode: { color: '#183848', fontSize: 6, fontWeight: '900', marginTop: 10, textAlign: 'center' },
  trainCoupler: { width: 5, height: 3, backgroundColor: '#6e7f87' },
  trainTap: { padding: 3 },
  trainStatusBadge: { marginTop: 2, backgroundColor: '#0a171d', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 3 },
  trainStatusReady: { backgroundColor: '#145c38' },
  trainStatusLate: { backgroundColor: '#792f34' },
  trainStatusText: { color: '#edf5f7', fontSize: 6.3, fontWeight: '900' },
  motionLabel: { marginTop: 3, color: '#fff', backgroundColor: 'rgba(10,23,29,0.9)', fontSize: 6.5, fontWeight: '900', borderRadius: 3, paddingHorizontal: 5, paddingVertical: 2 },

  platformCrowd: { position: 'absolute', left: 1048, width: 210, zIndex: 28, flexDirection: 'row', flexWrap: 'wrap', gap: 3 },
  platformPerson: { width: 7, height: 14, alignItems: 'center' },
  platformHead: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#f0c69a' },
  platformBody: { width: 6, height: 7, borderRadius: 2, backgroundColor: '#637f8f', marginTop: 1 },

  exchangeWrap: { position: 'absolute', width: 95, height: 32, zIndex: 55, backgroundColor: 'rgba(9,23,29,0.77)', borderRadius: 5, paddingTop: 12, overflow: 'hidden' },
  exchangeLabel: { position: 'absolute', top: 2, left: 3, right: 3, color: '#fff2a8', fontSize: 5.4, fontWeight: '900', textAlign: 'center' },
  exchangePerson: { position: 'absolute', top: 17, width: 6, height: 9, borderRadius: 3 },
  exchangeOut: { backgroundColor: '#f0c69a' },

  sceneLegend: { position: 'absolute', left: 12, bottom: 10, flexDirection: 'row', gap: 7, zIndex: 60 },
  sceneLegendText: { backgroundColor: 'rgba(7,16,22,0.84)', color: '#e5eef1', fontSize: 7, fontWeight: '900', borderRadius: 5, paddingHorizontal: 7, paddingVertical: 5 },

  message: { minHeight: 42, flexDirection: 'row', alignItems: 'center', marginTop: 8, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#0a1218', borderWidth: 1, borderColor: '#20323b', borderRadius: 8 },
  messageLamp: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#5bbcf2', marginRight: 8 },
  messageText: { flex: 1, color: '#a6b5bd', fontSize: 8.5, lineHeight: 12, fontWeight: '700' },

  blockedCard: { marginTop: 8, backgroundColor: '#2a1b0d', borderWidth: 1.5, borderColor: '#d3953c', borderRadius: 9, padding: 9 },
  blockedTop: { flexDirection: 'row', justifyContent: 'space-between' },
  blockedLabel: { color: '#bd9459', fontSize: 6.5, fontWeight: '900' },
  blockedTrain: { color: '#ffe7b6', fontSize: 13, fontWeight: '900', marginTop: 2 },
  blockedDelay: { color: '#ffc05b', fontSize: 15, fontWeight: '900' },
  blockedReason: { color: '#bca071', fontSize: 8, marginTop: 6 },
  divertRow: { flexDirection: 'row', gap: 7, marginTop: 8 },
  divert: { flex: 1, minHeight: 44, borderRadius: 7, borderWidth: 1, borderColor: '#d1953d', backgroundColor: '#34240f', alignItems: 'center', justifyContent: 'center' },
  divertSmall: { color: '#c4a46d', fontSize: 6, fontWeight: '900' },
  divertBig: { color: '#ffda91', fontSize: 16, fontWeight: '900' },
  disabled: { opacity: 0.3 },

  card: { marginTop: 8, backgroundColor: '#0d161d', borderWidth: 1, borderColor: '#2b3b45', borderRadius: 9, padding: 9 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { color: '#718591', fontSize: 6.8, fontWeight: '900' },
  clock: { color: '#ffd65a', fontSize: 13, fontWeight: '900' },
  serviceRow: { minHeight: 38, flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#182630' },
  serviceTime: { width: 42, color: '#70d29a', fontSize: 8.5, fontWeight: '900' },
  serviceMain: { flex: 1 },
  serviceId: { color: '#e2ebef', fontSize: 9.5, fontWeight: '900' },
  serviceDest: { fontSize: 6.8, fontWeight: '900' },
  servicePlatform: { width: 26, color: '#58b9ff', fontSize: 8.5, fontWeight: '900', textAlign: 'center' },
  serviceStatus: { width: 76, color: '#c5d1d7', fontSize: 6.3, fontWeight: '900', textAlign: 'right' },

  sectionHeading: { color: '#78909c', fontSize: 7.2, fontWeight: '900', letterSpacing: 1.1, textAlign: 'center', marginTop: 14, marginBottom: 7 },
  upgradeRail: { paddingRight: 10, gap: 8 },
  upgrade: { width: 145, minHeight: 170, backgroundColor: '#eef2f4', borderWidth: 2, borderColor: '#486375', borderRadius: 11, padding: 9, alignItems: 'center' },
  upgradeAffordable: { borderColor: '#e1b54f' },
  upgradeFocus: { borderColor: '#ef755e', borderWidth: 3 },
  upgradeDone: { borderColor: '#45a873', backgroundColor: '#e7f6ec' },
  upgradeIcon: { fontSize: 28 },
  upgradeTitle: { color: '#19354a', fontSize: 9, fontWeight: '900', marginTop: 4 },
  upgradeLevel: { color: '#3977a4', fontSize: 7, fontWeight: '900', marginTop: 2 },
  upgradeDesc: { color: '#647985', fontSize: 6.4, textAlign: 'center', lineHeight: 9, marginTop: 7, flex: 1 },
  upgradeButton: { width: '100%', backgroundColor: '#3c9f4b', borderRadius: 7, paddingVertical: 8, alignItems: 'center', marginTop: 8 },
  upgradeButtonText: { color: '#fff', fontSize: 7, fontWeight: '900' },
  footer: { alignItems: 'center', paddingVertical: 7, paddingHorizontal: 8, borderTopWidth: 1, borderTopColor: '#14212a' },
  footerText: { color: '#42535e', fontSize: 6, fontWeight: '900', textAlign: 'center' },
});