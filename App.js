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

const LANES = [1, 2, 3];
const ARRIVAL_MS = 4200;
const DEPARTURE_MS = 3500;
const SERVICE_INTERVAL = 15;
const DELAY_MARGIN_SECONDS = 12;
const SAVE_KEY = 'rail-rush-hour-v010';
const LEGACY_SAVE_KEY = 'rail-rush-hour-v09';
const OFFLINE_CAP_SECONDS = 2 * 60 * 60;

const DESTINATIONS = [
  { id: 'noorddam', name: 'Noorddam', code: 'NDR', fare: 1, unlockLevel: 1 },
  { id: 'havenstad', name: 'Havenstad', code: 'HVN', fare: 2, unlockLevel: 1 },
  { id: 'oostpoort', name: 'Oostpoort', code: 'OOS', fare: 3, unlockLevel: 2 },
  { id: 'luchthaven', name: 'Luchthaven', code: 'AIR', fare: 4, unlockLevel: 3 },
];

const TRAIN_TYPES = [
  { code: 'SPR', name: 'Sprinter S', setLength: 55, setCapacity: 220, dwell: 8, boardRate: 34 },
  { code: 'IC', name: 'Intercity X', setLength: 82, setCapacity: 330, dwell: 10, boardRate: 46 },
  { code: 'EXP', name: 'Express E', setLength: 105, setCapacity: 430, dwell: 12, boardRate: 54 },
];

const ARRIVAL_ROUTES = {
  1: { locks: ['EW_TOP', 'K_TOP', 'P1'] },
  2: { locks: ['EW_TOP', 'K_TOP', 'P2'] },
  3: { locks: ['EW_TOP', 'EW_BOTTOM', 'K_BOTTOM', 'P3'] },
};

const DEPARTURE_ROUTES = {
  1: { locks: ['P1', 'K_TOP', 'K_BOTTOM', 'EW_BOTTOM'] },
  2: { locks: ['P2', 'K_BOTTOM', 'EW_BOTTOM'] },
  3: { locks: ['P3', 'K_BOTTOM', 'EW_BOTTOM'] },
};

const routesConflict = (a, b) => Boolean(a && b && a.locks.some((lock) => b.locks.includes(lock)));
const sumValues = (object) => Object.values(object).reduce((sum, value) => sum + value, 0);
const pct = (value, max) => Math.max(0, Math.min(100, Math.round((value / Math.max(1, max)) * 100)));
const formatMoney = (value) => `€${Math.max(0, Math.round(value)).toLocaleString('nl-NL')}`;
const levelTarget = (level) => 420 + level * 240;

const parkingCapacity = (level) => 70 + level * 70;
const parkingDemandPerSecond = (level) => 3 + level * 3;
const parkingCost = (level) => 500 + level * 500;
const gateThroughput = (level) => 7 + level * 6;
const gateCost = (level) => 650 + level * 600;
const hallCapacity = (level) => 180 + level * 220;
const hallThroughput = (level) => 9 + level * 7;
const hallCost = (level) => 800 + level * 700;
const platformCapacity = (level) => 110 + level * 95;
const platformCost = (level) => 900 + level * 800;
const fleetCost = (level) => 1100 + level * 950;
const retailCost = (level) => 700 + level * 600;
const ticketCost = (level) => 800 + level * 650;
const platform3Cost = 2600;
const passivePerSecond = (retailLevel) => 2 + retailLevel * 2;
const revenueMultiplier = (ticketLevel) => 1 + (ticketLevel - 1) * 0.12;
const fleetSetRange = (level, typeCode) => {
  if (level <= 1) return typeCode === 'EXP' ? [1, 1] : [1, 2];
  if (level === 2) return typeCode === 'EXP' ? [1, 2] : [1, 3];
  return typeCode === 'EXP' ? [2, 2] : [2, 3];
};
const serviceLane = (service) => service?.actualLane || service?.plannedLane || null;

const formatClock = (seconds) => {
  const base = 8 * 3600 + Math.max(0, Math.round(seconds));
  const h = Math.floor(base / 3600) % 24;
  const m = Math.floor((base % 3600) / 60);
  const s = base % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

const departureInfo = (train, now) => {
  if (!train) return null;
  const untilDeparture = train.departureAt - now;
  if (untilDeparture > 0) return { state: 'early', detail: `nog ${untilDeparture}s`, canDepart: false, marginLeft: DELAY_MARGIN_SECONDS };
  const marginLeft = train.departureAt + DELAY_MARGIN_SECONDS - now;
  if (marginLeft >= 0) return { state: 'window', detail: `${marginLeft}s marge`, canDepart: true, marginLeft };
  return { state: 'late', detail: `+${Math.abs(marginLeft)}s te laat`, canDepart: true, marginLeft: 0 };
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
    // Web persistence is optional in this prototype.
  }
};

const nextServiceForDestination = (destinationId, timetable) => timetable
  .filter((service) => service.destination.id === destinationId && !['departed', 'departing'].includes(service.status))
  .sort((a, b) => a.scheduledAt - b.scheduledAt)[0] || null;

function FlowDots({ active = 0, vertical = false, reverse = false, label }) {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const animation = Animated.loop(Animated.timing(progress, { toValue: 1, duration: 1700, useNativeDriver: true }));
    animation.start();
    return () => animation.stop();
  }, [progress]);

  const count = Math.max(0, Math.min(9, Math.ceil(active / 8)));
  const move = progress.interpolate({ inputRange: [0, 1], outputRange: reverse ? [54, 0] : [0, 54] });
  return (
    <View style={[styles.flowLane, vertical && styles.flowLaneVertical]}>
      {label ? <Text style={styles.flowLabel}>{label}</Text> : null}
      <View style={[styles.flowDotsTrack, vertical && styles.flowDotsTrackVertical]}>
        {Array.from({ length: count }).map((_, index) => (
          <Animated.View
            key={index}
            style={[
              styles.flowDot,
              vertical ? { left: 5 + (index % 3) * 9, top: 1 + Math.floor(index / 3) * 3, transform: [{ translateY: move }] } : { left: 1 + index * 7, top: 8 + (index % 2) * 6, transform: [{ translateX: move }] },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

function CapacityMeter({ label, value, max, subtitle, pressure }) {
  const percentage = pct(value, max);
  const danger = pressure ?? percentage >= 90;
  return (
    <View style={styles.capacityMeter}>
      <View style={styles.capacityTop}><Text style={styles.capacityLabel}>{label}</Text><Text style={[styles.capacityValue, danger && styles.capacityDanger]}>{value}/{max}</Text></View>
      <View style={styles.capacityTrack}><View style={[styles.capacityFill, danger && styles.capacityFillDanger, { width: `${percentage}%` }]} /></View>
      <Text style={styles.capacitySub}>{subtitle}</Text>
    </View>
  );
}

function TrainStrip({ train, ready, late, onPress, compact = false }) {
  const content = (
    <View style={styles.trainStripInner}>
      {Array.from({ length: train.sets }).map((_, index) => (
        <React.Fragment key={`${train.id}-${index}`}>
          {index > 0 ? <View style={[styles.trainCoupler, compact && styles.trainCouplerCompact]} /> : null}
          <View style={[styles.trainSet, compact && styles.trainSetCompact, ready && styles.trainSetReady, late && styles.trainSetLate]}>
            <View style={styles.trainCab} />
            <View style={styles.trainWindows}><View style={styles.trainWindow} /><View style={styles.trainWindow} /><View style={styles.trainWindow} /></View>
            <Text style={[styles.trainSetText, compact && styles.trainSetTextCompact]}>{train.type.code}</Text>
          </View>
        </React.Fragment>
      ))}
    </View>
  );
  if (!onPress) return content;
  return <Pressable hitSlop={12} onPress={onPress} style={styles.trainPress}>{content}</Pressable>;
}

function CarGrid({ capacity, waiting }) {
  const spaces = Math.min(20, Math.max(8, Math.round(capacity / 30)));
  const occupied = Math.min(spaces, Math.round((waiting / Math.max(1, capacity)) * spaces));
  return (
    <View style={styles.carGrid}>
      {Array.from({ length: spaces }).map((_, index) => <View key={index} style={[styles.carSpace, index < occupied && styles.carSpaceBusy]}><Text style={styles.carText}>{index < occupied ? '▰' : '·'}</Text></View>)}
    </View>
  );
}

function GateRow({ level }) {
  const gates = Math.min(6, 2 + level);
  return <View style={styles.gateRow}>{Array.from({ length: gates }).map((_, index) => <View key={index} style={styles.gate}><View style={styles.gateLight} /></View>)}</View>;
}

function CrowdDots({ count, capacity }) {
  const density = Math.min(34, Math.max(2, Math.round((count / Math.max(1, capacity)) * 34)));
  return <View style={styles.crowdDots}>{Array.from({ length: density }).map((_, index) => <View key={index} style={[styles.crowdDot, index % 5 === 0 && styles.crowdDotAccent]} />)}</View>;
}

function BalanceStrip({ stages }) {
  const highest = [...stages].sort((a, b) => b.pressure - a.pressure)[0];
  return (
    <View style={styles.balanceCard}>
      <View style={styles.balanceTop}><Text style={styles.balanceTitle}>CAPACITEITSBALANS</Text><Text style={styles.bottleneck}>KNELPUNT: {highest.label}</Text></View>
      <View style={styles.balanceRow}>
        {stages.map((stage, index) => (
          <React.Fragment key={stage.label}>
            {index > 0 ? <Text style={styles.balanceArrow}>›</Text> : null}
            <View style={[styles.balanceStage, stage.pressure >= 90 && styles.balanceStageDanger]}>
              <Text style={styles.balanceStageLabel}>{stage.label}</Text><Text style={styles.balanceStagePct}>{Math.min(999, stage.pressure)}%</Text>
            </View>
          </React.Fragment>
        ))}
      </View>
      <Text style={styles.balanceHint}>Breid je een vroege schakel uit, dan groeit de druk automatisch door naar de volgende schakel.</Text>
    </View>
  );
}

function StationWorld({
  platforms,
  parkingWaiting,
  hallPassengers,
  platformPassengers,
  timetable,
  now,
  parkingLevel,
  gateLevel,
  hallLevel,
  platformLevel,
  retailLevel,
  ticketLevel,
  platform3Unlocked,
  arrivalTrain,
  arrivalLane,
  arrivalProgress,
  departureTrain,
  departureLane,
  departureProgress,
  onTrainPress,
  stationLevel,
}) {
  const hallTotal = sumValues(hallPassengers);
  const platformTotal = sumValues(platformPassengers);
  const parkingCap = parkingCapacity(parkingLevel);
  const hallCap = hallCapacity(hallLevel);
  const perronCap = platformCapacity(platformLevel);
  const parkingFlow = Math.min(parkingWaiting, gateThroughput(gateLevel));
  const hallFlow = Math.min(hallTotal, hallThroughput(hallLevel));
  const arrivalX = arrivalProgress.interpolate({ inputRange: [0, 1], outputRange: [-170, 42] });
  const departureX = departureProgress.interpolate({ inputRange: [0, 1], outputRange: [42, 380] });

  return (
    <View style={styles.worldCard}>
      <View style={styles.worldHeader}>
        <View><Text style={styles.worldKicker}>STATIONNIVEAU {stationLevel} • LIVE REIZIGERSSTROOM</Text><Text style={styles.worldTitle}>CENTRAAL STATION</Text></View>
        <Text style={styles.worldIncome}>{formatMoney(passivePerSecond(retailLevel))}/s</Text>
      </View>

      <View style={styles.zoneCard}>
        <View style={styles.zoneHeader}><View><Text style={styles.zoneKicker}>1 • AANVOER</Text><Text style={styles.zoneTitle}>PARKEERPLAATS</Text></View><Text style={styles.zoneLevel}>Lv {parkingLevel}</Text></View>
        <CarGrid capacity={parkingCap} waiting={parkingWaiting} />
        <CapacityMeter label="PARKEREN / AANKOMST" value={parkingWaiting} max={parkingCap} subtitle={`${parkingDemandPerSecond(parkingLevel)} nieuwe reizigers/sec bij vrije capaciteit`} />
      </View>

      <FlowDots active={parkingFlow} vertical label={`${parkingFlow}/s richting entree`} />

      <View style={styles.zoneCard}>
        <View style={styles.zoneHeader}><View><Text style={styles.zoneKicker}>2 • VERWERKING</Text><Text style={styles.zoneTitle}>ENTREE & POORTJES</Text></View><Text style={styles.zoneLevel}>Lv {gateLevel}</Text></View>
        <GateRow level={gateLevel} />
        <CapacityMeter label="DOORSTROOM" value={Math.min(parkingWaiting, gateThroughput(gateLevel))} max={gateThroughput(gateLevel)} subtitle={`max. ${gateThroughput(gateLevel)} reizigers/sec naar de hal`} pressure={parkingWaiting > gateThroughput(gateLevel) * 5} />
      </View>

      <FlowDots active={parkingFlow} vertical label="naar stationshal" />

      <View style={[styles.zoneCard, styles.hallZone, { minHeight: 112 + hallLevel * 7 }]}> 
        <View style={styles.zoneHeader}><View><Text style={styles.zoneKicker}>3 • VERDELEN</Text><Text style={styles.zoneTitle}>STATIONSHAL</Text></View><Text style={styles.zoneLevel}>Lv {hallLevel}</Text></View>
        <View style={styles.hallBody}><View style={styles.hallInfo}><Text style={styles.hallBig}>{hallTotal}</Text><Text style={styles.hallSmall}>reizigers zoeken hun perron</Text><Text style={styles.hallRetail}>winkels Lv {retailLevel} • service Lv {ticketLevel}</Text></View><CrowdDots count={hallTotal} capacity={hallCap} /></View>
        <CapacityMeter label="HALCAPACITEIT" value={hallTotal} max={hallCap} subtitle={`${hallThroughput(hallLevel)} reizigers/sec kunnen naar de perrons`} />
      </View>

      <FlowDots active={hallFlow} vertical label={`${hallFlow}/s naar geplande perrons`} />

      <View style={styles.platformWorld}>
        <View style={styles.zoneHeader}><View><Text style={styles.zoneKicker}>4 • WACHTEN & INSTAPPEN</Text><Text style={styles.zoneTitle}>PERRONS</Text></View><Text style={styles.zoneLevel}>Lv {platformLevel}</Text></View>
        {LANES.map((lane) => {
          const locked = lane === 3 && !platform3Unlocked;
          const waiting = DESTINATIONS.reduce((sum, destination) => {
            const service = nextServiceForDestination(destination.id, timetable);
            return sum + (serviceLane(service) === lane ? platformPassengers[destination.id] || 0 : 0);
          }, 0);
          const train = platforms[lane];
          const timing = train ? departureInfo(train, now) : null;
          const ready = Boolean(train && train.status === 'ready' && timing?.state === 'window');
          const late = Boolean(train && train.status === 'ready' && timing?.state === 'late');
          return (
            <View key={lane} style={[styles.platformLane, locked && styles.platformLaneLocked]}>
              <View style={styles.platformLaneHeader}><Text style={styles.platformLaneTitle}>PERRON {lane}</Text><Text style={[styles.platformLaneCount, waiting >= perronCap * 0.9 && styles.capacityDanger]}>{locked ? 'BOUWTERREIN' : `${waiting}/${perronCap} wachtend`}</Text></View>
              <View style={styles.platformTrack}><View style={styles.platformEdge} /><View style={styles.rails} />
                {locked ? <Text style={styles.constructionText}>P3 NOG NIET GEBOUWD</Text> : train && !(departureTrain && departureTrain.id === train.id) ? <View style={styles.staticTrain}><TrainStrip train={train} ready={ready} late={late} onPress={() => onTrainPress(lane)} compact /><Text style={[styles.trainCaption, ready && styles.trainCaptionReady, late && styles.trainCaptionLate]}>{train.id} → {train.destination.name} • {train.status === 'ready' ? timing.detail : `${train.remaining}s halte`}</Text></View> : <Text style={styles.freeTrackText}>vrij spoor</Text>}
              </View>
              {!locked ? <View style={styles.waitingDotsRow}>{Array.from({ length: Math.min(18, Math.ceil(waiting / 14)) }).map((_, i) => <View key={i} style={styles.platformPassengerDot} />)}</View> : null}
            </View>
          );
        })}

        {arrivalTrain ? <Animated.View pointerEvents="none" style={[styles.movingTrain, { top: 74 + (arrivalLane - 1) * 91, transform: [{ translateX: arrivalX }] }]}><TrainStrip train={arrivalTrain} compact /><Text style={styles.movingTrainLabel}>BINNEN → P{arrivalLane}</Text></Animated.View> : null}
        {departureTrain ? <Animated.View pointerEvents="none" style={[styles.movingTrain, { top: 74 + (departureLane - 1) * 91, transform: [{ translateX: departureX }] }]}><TrainStrip train={departureTrain} compact /><Text style={styles.movingTrainLabel}>→ {departureTrain.destination.code}</Text></Animated.View> : null}
      </View>

      <View style={styles.routeRibbon}>{DESTINATIONS.map((destination) => <View key={destination.id} style={[styles.routePill, destination.unlockLevel > stationLevel && styles.routePillLocked]}><Text style={styles.routeCode}>{destination.unlockLevel <= stationLevel ? destination.code : '🔒'}</Text><Text style={styles.routeName}>{destination.name}</Text></View>)}</View>
      <Text style={styles.worldFooterText}>{platformTotal} reizigers op de perrons • treinen blijven de laatste capaciteitsstap</Text>
    </View>
  );
}

function Timetable({ timetable, now }) {
  const visible = timetable.filter((service) => service.status !== 'departed').slice(0, 5);
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}><Text style={styles.cardLabel}>VOLGENDE TREINEN</Text><Text style={styles.clock}>{formatClock(now)}</Text></View>
      {visible.map((service) => {
        const timing = departureInfo(service, now);
        const status = service.status === 'scheduled' ? `in ${Math.max(0, service.scheduledAt - now)}s` : service.status === 'waiting' ? 'WACHT BUITEN' : service.status === 'arriving' ? `→ P${service.actualLane}` : service.status === 'at_platform' ? (timing.state === 'early' ? `V over ${service.departureAt - now}s` : timing.detail) : 'VERTREKT';
        return <View key={service.serviceId} style={styles.serviceRow}><Text style={styles.serviceTime}>{formatClock(service.departureAt).slice(0, 5)}</Text><View style={styles.serviceMain}><Text style={styles.serviceId}>{service.id}</Text><Text style={styles.serviceDest}>→ {service.destination.name}</Text></View><Text style={styles.serviceLane}>P{serviceLane(service)}</Text><Text style={styles.serviceStatus}>{status}</Text></View>;
      })}
    </View>
  );
}

function UpgradeCard({ title, value, description, cost, affordable, onPress, done, bottleneck }) {
  return (
    <Pressable disabled={done} onPress={onPress} style={[styles.upgradeCard, affordable && !done && styles.upgradeAffordable, done && styles.upgradeDone, bottleneck && styles.upgradeBottleneck]}>
      <View style={styles.upgradeTop}><Text style={styles.upgradeTitle}>{title}</Text><Text style={styles.upgradeValue}>{value}</Text></View>
      <Text style={styles.upgradeDescription}>{description}</Text>
      <Text style={styles.upgradeCost}>{done ? 'ACTIEF' : formatMoney(cost)}</Text>
    </Pressable>
  );
}

function PlatformDetail({ lane, train, waiting, now, locked, onTrainPress }) {
  if (locked) return null;
  if (!train) return <View style={styles.platformDetail}><Text style={styles.detailPlatform}>P{lane}</Text><Text style={styles.detailMuted}>Vrij • {waiting} reizigers wachten</Text></View>;
  const timing = departureInfo(train, now);
  const ready = train.status === 'ready' && timing.canDepart;
  return (
    <Pressable onPress={() => onTrainPress(lane)} style={[styles.platformDetail, ready && styles.platformDetailReady, timing.state === 'late' && styles.platformDetailLate]}>
      <View style={styles.detailTop}><Text style={styles.detailPlatform}>P{lane} • {train.id}</Text><Text style={styles.detailTime}>{formatClock(train.departureAt).slice(0, 5)}</Text></View>
      <Text style={styles.detailDestination}>→ {train.destination.name} • {train.sets} stellen • {train.onboard}/{train.capacity}</Text>
      <Text style={[styles.detailAction, ready && styles.detailActionReady]}>{train.status !== 'ready' ? `${train.remaining}s reizigerswissel` : timing.state === 'early' ? `vertrek over ${train.departureAt - now}s` : timing.state === 'window' ? `TIK VOOR VERTREK • ${timing.marginLeft}s marge` : `TIK NU • ${timing.detail}`}</Text>
    </Pressable>
  );
}

export default function App() {
  const initialSave = useRef(safeLoad()).current;
  const [phase, setPhase] = useState('menu');
  const [serviceTime, setServiceTime] = useState(0);
  const [timetable, setTimetable] = useState([]);
  const [parkingWaiting, setParkingWaiting] = useState(30);
  const [hallPassengers, setHallPassengers] = useState({ noorddam: 15, havenstad: 20, oostpoort: 0, luchthaven: 0 });
  const [platformPassengers, setPlatformPassengers] = useState({ noorddam: 20, havenstad: 30, oostpoort: 0, luchthaven: 0 });
  const [outside, setOutside] = useState([]);
  const [platforms, setPlatforms] = useState({ 1: null, 2: null, 3: null });
  const [arrivalTrain, setArrivalTrain] = useState(null);
  const [arrivalLane, setArrivalLane] = useState(null);
  const [departureTrain, setDepartureTrain] = useState(null);
  const [departureLane, setDepartureLane] = useState(null);
  const [message, setMessage] = useState('');

  const [cash, setCash] = useState(initialSave?.cash || 450);
  const [stationLevel, setStationLevel] = useState(initialSave?.stationLevel || 1);
  const [stationXp, setStationXp] = useState(initialSave?.stationXp || 0);
  const [parkingLevel, setParkingLevel] = useState(initialSave?.parkingLevel || 1);
  const [gateLevel, setGateLevel] = useState(initialSave?.gateLevel || initialSave?.ticketLevel || 1);
  const [hallLevel, setHallLevel] = useState(initialSave?.hallLevel || 1);
  const [platformLevel, setPlatformLevel] = useState(initialSave?.platformLevel || 1);
  const [fleetLevel, setFleetLevel] = useState(initialSave?.fleetLevel || 1);
  const [retailLevel, setRetailLevel] = useState(initialSave?.retailLevel || 1);
  const [ticketLevel, setTicketLevel] = useState(initialSave?.ticketLevel || 1);
  const [platform3Unlocked, setPlatform3Unlocked] = useState(Boolean(initialSave?.platform3Unlocked));
  const [handled, setHandled] = useState(initialSave?.handled || 0);
  const [onTime, setOnTime] = useState(initialSave?.onTime || 0);
  const [late, setLate] = useState(initialSave?.late || 0);
  const [departedPassengers, setDepartedPassengers] = useState(initialSave?.departedPassengers || 0);
  const [lostDemand, setLostDemand] = useState(initialSave?.lostDemand || 0);

  const arrivalProgress = useRef(new Animated.Value(0)).current;
  const departureProgress = useRef(new Animated.Value(0)).current;
  const timeRef = useRef(0);
  const timetableRef = useRef([]);
  const parkingWaitingRef = useRef(30);
  const hallPassengersRef = useRef({ noorddam: 15, havenstad: 20, oostpoort: 0, luchthaven: 0 });
  const platformPassengersRef = useRef({ noorddam: 20, havenstad: 30, oostpoort: 0, luchthaven: 0 });
  const outsideRef = useRef([]);
  const platformsRef = useRef({ 1: null, 2: null, 3: null });
  const cashRef = useRef(initialSave?.cash || 450);
  const stationLevelRef = useRef(initialSave?.stationLevel || 1);
  const stationXpRef = useRef(initialSave?.stationXp || 0);
  const parkingLevelRef = useRef(initialSave?.parkingLevel || 1);
  const gateLevelRef = useRef(initialSave?.gateLevel || initialSave?.ticketLevel || 1);
  const hallLevelRef = useRef(initialSave?.hallLevel || 1);
  const platformLevelRef = useRef(initialSave?.platformLevel || 1);
  const fleetLevelRef = useRef(initialSave?.fleetLevel || 1);
  const retailLevelRef = useRef(initialSave?.retailLevel || 1);
  const ticketLevelRef = useRef(initialSave?.ticketLevel || 1);
  const platform3Ref = useRef(Boolean(initialSave?.platform3Unlocked));
  const handledRef = useRef(initialSave?.handled || 0);
  const onTimeRef = useRef(initialSave?.onTime || 0);
  const lateRef = useRef(initialSave?.late || 0);
  const departedPassengersRef = useRef(initialSave?.departedPassengers || 0);
  const lostDemandRef = useRef(initialSave?.lostDemand || 0);
  const arrivalBusyRef = useRef(false);
  const departureBusyRef = useRef(false);
  const arrivalLaneRef = useRef(null);
  const departureLaneRef = useRef(null);
  const sequence = useRef(1700);
  const serviceCounter = useRef(0);
  const nextServiceAt = useRef(3);
  const demandCursor = useRef(0);

  const syncTimetable = (next) => { timetableRef.current = next; setTimetable(next); };
  const syncParking = (next) => { parkingWaitingRef.current = next; setParkingWaiting(next); };
  const syncHall = (next) => { hallPassengersRef.current = next; setHallPassengers(next); };
  const syncPlatformPassengers = (next) => { platformPassengersRef.current = next; setPlatformPassengers(next); };
  const syncOutside = (next) => { outsideRef.current = next; setOutside(next); };
  const syncPlatforms = (next) => { platformsRef.current = next; setPlatforms(next); };
  const addCash = (amount) => { cashRef.current += amount; setCash(Math.round(cashRef.current)); };
  const spendCash = (amount) => { if (cashRef.current < amount) return false; cashRef.current -= amount; setCash(Math.round(cashRef.current)); return true; };

  const persist = () => safeSave({
    cash: Math.round(cashRef.current), stationLevel: stationLevelRef.current, stationXp: Math.round(stationXpRef.current),
    parkingLevel: parkingLevelRef.current, gateLevel: gateLevelRef.current, hallLevel: hallLevelRef.current,
    platformLevel: platformLevelRef.current, fleetLevel: fleetLevelRef.current, retailLevel: retailLevelRef.current,
    ticketLevel: ticketLevelRef.current, platform3Unlocked: platform3Ref.current,
    handled: handledRef.current, onTime: onTimeRef.current, late: lateRef.current,
    departedPassengers: departedPassengersRef.current, lostDemand: lostDemandRef.current, lastSaved: Date.now(),
  });

  const awardXp = (amount) => {
    let xp = stationXpRef.current + amount;
    let level = stationLevelRef.current;
    let leveled = false;
    while (xp >= levelTarget(level)) { xp -= levelTarget(level); level += 1; leveled = true; }
    stationXpRef.current = xp; stationLevelRef.current = level;
    setStationXp(Math.round(xp)); setStationLevel(level);
    if (leveled) setMessage(`Stationniveau ${level}! ${level === 2 ? 'Oostpoort is nu aangesloten.' : level === 3 ? 'Luchthavenroute geopend.' : 'Meer groei en vraag beschikbaar.'}`);
  };

  const createService = (scheduledAt) => {
    const index = serviceCounter.current++;
    sequence.current += index % 3 === 0 ? 4 : 2;
    const type = TRAIN_TYPES[index % TRAIN_TYPES.length];
    const destinations = DESTINATIONS.filter((destination) => destination.unlockLevel <= stationLevelRef.current);
    const destination = destinations[index % destinations.length];
    const lanes = platform3Ref.current ? [1, 2, 3] : [1, 2];
    const plannedLane = lanes[index % lanes.length];
    const [minSets, maxSets] = fleetSetRange(fleetLevelRef.current, type.code);
    const sets = minSets + (index % (maxSets - minSets + 1));
    const capacity = type.setCapacity * sets;
    const onboard = Math.round(capacity * (0.35 + ((index * 9) % 25) / 100));
    const departureAt = scheduledAt + Math.ceil(ARRIVAL_MS / 1000) + type.dwell;
    return { serviceId: `svc-${index}-${scheduledAt}`, id: `${type.code} ${sequence.current}`, type, destination, plannedLane, actualLane: null, scheduledAt, departureAt, sets, length: type.setLength * sets, capacity, onboard, status: 'scheduled', wait: 0 };
  };

  const updateService = (serviceId, patch) => syncTimetable(timetableRef.current.map((service) => service.serviceId === serviceId ? { ...service, ...patch } : service));
  const arrivalConflict = (lane) => departureBusyRef.current && routesConflict(ARRIVAL_ROUTES[lane], DEPARTURE_ROUTES[departureLaneRef.current]);
  const departureConflict = (lane) => arrivalBusyRef.current && routesConflict(DEPARTURE_ROUTES[lane], ARRIVAL_ROUTES[arrivalLaneRef.current]);

  const tryAutoArrival = () => {
    if (arrivalBusyRef.current || !outsideRef.current.length) return;
    const train = outsideRef.current[0];
    if ((train.plannedLane === 3 && !platform3Ref.current) || platformsRef.current[train.plannedLane] || arrivalConflict(train.plannedLane)) return;
    startArrival(train, train.plannedLane, false);
  };

  const startArrival = (train, lane, diverted) => {
    if (!train || arrivalBusyRef.current || platformsRef.current[lane] || arrivalConflict(lane) || (lane === 3 && !platform3Ref.current)) return false;
    arrivalBusyRef.current = true; arrivalLaneRef.current = lane;
    syncOutside(outsideRef.current.filter((item) => item.serviceId !== train.serviceId));
    updateService(train.serviceId, { status: 'arriving', actualLane: lane });
    const moving = { ...train, actualLane: lane };
    setArrivalTrain(moving); setArrivalLane(lane); arrivalProgress.setValue(0);
    setMessage(diverted ? `${train.id} wijkt uit naar P${lane}. Wachtende reizigers verplaatsen naar het nieuwe perron.` : `${train.id} rijdt automatisch binnen op gepland P${lane}.`);
    Animated.timing(arrivalProgress, { toValue: 1, duration: ARRIVAL_MS, useNativeDriver: true }).start(({ finished }) => {
      arrivalBusyRef.current = false; arrivalLaneRef.current = null;
      if (!finished) return;
      const alight = Math.min(moving.onboard, Math.round(moving.onboard * (0.23 + Math.random() * 0.18)));
      const transfer = Math.round(alight * (0.26 + Math.random() * 0.26));
      const nextHall = { ...hallPassengersRef.current };
      const transferChoices = DESTINATIONS.filter((destination) => destination.unlockLevel <= stationLevelRef.current && destination.id !== moving.destination.id);
      for (let i = 0; i < transfer && transferChoices.length; i += 1) nextHall[transferChoices[i % transferChoices.length].id] += 1;
      const platformTrain = { ...moving, lane, onboard: moving.onboard - alight, status: 'dwelling', remaining: moving.type.dwell, lastAlight: alight, lastTransfer: transfer };
      syncHall(nextHall); syncPlatforms({ ...platformsRef.current, [lane]: platformTrain });
      updateService(moving.serviceId, { status: 'at_platform', actualLane: lane });
      setArrivalTrain(null); setArrivalLane(null);
      setMessage(`${moving.id} op P${lane}: ${alight} uitgestapt, ${transfer} overstappers stromen terug de hal in.`);
      setTimeout(tryAutoArrival, 60);
    });
    return true;
  };

  const divertOutside = (lane) => {
    const train = outsideRef.current[0];
    if (!train || platformsRef.current[lane] || (lane === 3 && !platform3Ref.current)) return;
    if (arrivalConflict(lane)) { setMessage(`P${lane} is vrij, maar de rijweg is tijdelijk bezet.`); return; }
    startArrival(train, lane, true);
  };

  const depart = (lane) => {
    const train = platformsRef.current[lane];
    if (!train || departureBusyRef.current) return;
    if (train.status !== 'ready') { setMessage(`${train.id}: reizigerswissel nog ${train.remaining || 0}s.`); return; }
    const timing = departureInfo(train, timeRef.current);
    if (!timing.canDepart) { setMessage(`${train.id} mag nog niet vertrekken — nog ${train.departureAt - timeRef.current}s.`); return; }
    if (departureConflict(lane)) { setMessage(`${train.id} mag vertrekken, maar de uitrijweg is nog bezet.`); return; }

    departureBusyRef.current = true; departureLaneRef.current = lane;
    const delay = Math.max(0, timeRef.current - train.departureAt);
    syncPlatforms({ ...platformsRef.current, [lane]: { ...train, status: 'departing' } });
    updateService(train.serviceId, { status: 'departing', actualDepartureAt: timeRef.current, departureDelay: delay });
    setDepartureTrain(train); setDepartureLane(lane); departureProgress.setValue(0);

    Animated.timing(departureProgress, { toValue: 1, duration: DEPARTURE_MS, useNativeDriver: true }).start(({ finished }) => {
      departureBusyRef.current = false; departureLaneRef.current = null;
      if (!finished) return;
      const revenue = Math.round(train.onboard * train.destination.fare * revenueMultiplier(ticketLevelRef.current));
      const withinMargin = delay <= DELAY_MARGIN_SECONDS;
      syncPlatforms({ ...platformsRef.current, [lane]: null }); updateService(train.serviceId, { status: 'departed' });
      setDepartureTrain(null); setDepartureLane(null);
      handledRef.current += 1; departedPassengersRef.current += train.onboard;
      setHandled(handledRef.current); setDepartedPassengers(departedPassengersRef.current);
      if (withinMargin) { onTimeRef.current += 1; setOnTime(onTimeRef.current); } else { lateRef.current += 1; setLate(lateRef.current); }
      addCash(revenue + (withinMargin ? 80 : 0)); awardXp(Math.round(train.onboard / 3) + (withinMargin ? 55 : 15));
      setMessage(`${train.id} vertrokken naar ${train.destination.name}. ${formatMoney(revenue)} opbrengst${withinMargin ? ' + €80 punctualiteitsbonus' : ''}.`);
      persist(); setTimeout(tryAutoArrival, 60);
    });
  };

  const buyParking = () => {
    const cost = parkingCost(parkingLevelRef.current);
    if (!spendCash(cost)) return setMessage('Onvoldoende geld om de parkeerplaats uit te breiden.');
    parkingLevelRef.current += 1; setParkingLevel(parkingLevelRef.current); setMessage(`Parkeerplaats Lv ${parkingLevelRef.current}: meer plaatsen én meer reizigersaanvoer. Controleer nu de druk bij de poortjes.`); persist();
  };
  const buyGates = () => {
    const cost = gateCost(gateLevelRef.current);
    if (!spendCash(cost)) return setMessage('Onvoldoende geld voor extra entreepoortjes.');
    gateLevelRef.current += 1; setGateLevel(gateLevelRef.current); setMessage(`Entree & poortjes Lv ${gateLevelRef.current}: ${gateThroughput(gateLevelRef.current)} reizigers/sec. De hal kan nu het volgende knelpunt worden.`); persist();
  };
  const buyHall = () => {
    const cost = hallCost(hallLevelRef.current);
    if (!spendCash(cost)) return setMessage('Onvoldoende geld voor uitbreiding van de stationshal.');
    hallLevelRef.current += 1; setHallLevel(hallLevelRef.current); setMessage(`Stationshal Lv ${hallLevelRef.current}: meer opslag en hogere doorstroming naar perrons.`); persist();
  };
  const buyPlatforms = () => {
    const cost = platformCost(platformLevelRef.current);
    if (!spendCash(cost)) return setMessage('Onvoldoende geld om de perroncapaciteit te vergroten.');
    platformLevelRef.current += 1; setPlatformLevel(platformLevelRef.current); setMessage(`Perrons Lv ${platformLevelRef.current}: ${platformCapacity(platformLevelRef.current)} wachtende reizigers per perron mogelijk.`); persist();
  };
  const buyFleet = () => {
    const cost = fleetCost(fleetLevelRef.current);
    if (!spendCash(cost)) return setMessage('Onvoldoende geld voor grotere treinsamenstellingen.');
    fleetLevelRef.current += 1; setFleetLevel(fleetLevelRef.current); setMessage(`Treinvloot Lv ${fleetLevelRef.current}: nieuwe diensten krijgen langere samenstellingen en meer capaciteit.`); persist();
  };
  const buyRetail = () => {
    const cost = retailCost(retailLevelRef.current);
    if (!spendCash(cost)) return setMessage('Onvoldoende geld voor uitbreiding van de winkelzone.');
    retailLevelRef.current += 1; setRetailLevel(retailLevelRef.current); setMessage(`Winkelzone Lv ${retailLevelRef.current}: passief inkomen ${formatMoney(passivePerSecond(retailLevelRef.current))}/sec.`); persist();
  };
  const buyTickets = () => {
    const cost = ticketCost(ticketLevelRef.current);
    if (!spendCash(cost)) return setMessage('Onvoldoende geld voor service-upgrade.');
    ticketLevelRef.current += 1; setTicketLevel(ticketLevelRef.current); setMessage(`Service Lv ${ticketLevelRef.current}: hogere opbrengst per vervoerde reiziger.`); persist();
  };
  const buyPlatform3 = () => {
    if (platform3Ref.current) return;
    if (!spendCash(platform3Cost)) return setMessage('Onvoldoende geld om perron 3 te bouwen.');
    platform3Ref.current = true; setPlatform3Unlocked(true); setMessage('Perron 3 geopend. Je hebt meer spoorcapaciteit, maar ook meer reizigers kunnen tegelijk op perrons wachten.'); persist();
  };

  useEffect(() => {
    if (phase !== 'playing') return undefined;
    const timer = setInterval(() => {
      const now = timeRef.current + 1;
      timeRef.current = now; setServiceTime(now);

      let nextTable = [...timetableRef.current];
      if (nextTable.filter((service) => service.status === 'scheduled').length < 6) {
        for (let i = 0; i < 5; i += 1) { nextTable.push(createService(nextServiceAt.current)); nextServiceAt.current += SERVICE_INTERVAL; }
      }
      const due = [];
      nextTable = nextTable.map((service) => {
        if (service.status === 'scheduled' && service.scheduledAt <= now) { const waiting = { ...service, status: 'waiting', wait: 0 }; due.push(waiting); return waiting; }
        return service;
      });
      syncTimetable(nextTable);
      if (due.length) syncOutside([...outsideRef.current, ...due]);
      if (outsideRef.current.length) syncOutside(outsideRef.current.map((train) => ({ ...train, wait: (train.wait || 0) + 1 })));

      const incoming = parkingDemandPerSecond(parkingLevelRef.current);
      const freeParking = Math.max(0, parkingCapacity(parkingLevelRef.current) - parkingWaitingRef.current);
      const admittedToParking = Math.min(incoming, freeParking);
      const refused = incoming - admittedToParking;
      if (refused > 0) { lostDemandRef.current += refused; setLostDemand(lostDemandRef.current); }
      let nextParking = parkingWaitingRef.current + admittedToParking;

      const nextHall = { ...hallPassengersRef.current };
      const hallFree = Math.max(0, hallCapacity(hallLevelRef.current) - sumValues(nextHall));
      const throughGates = Math.min(nextParking, gateThroughput(gateLevelRef.current), hallFree);
      nextParking -= throughGates;
      const activeDestinations = DESTINATIONS.filter((destination) => destination.unlockLevel <= stationLevelRef.current);
      for (let i = 0; i < throughGates; i += 1) {
        const destination = activeDestinations[(demandCursor.current + i) % activeDestinations.length];
        nextHall[destination.id] += 1;
      }
      demandCursor.current += throughGates;

      const nextPlatformPassengers = { ...platformPassengersRef.current };
      let flowBudget = hallThroughput(hallLevelRef.current);
      activeDestinations.forEach((destination) => {
        if (flowBudget <= 0 || nextHall[destination.id] <= 0) return;
        const service = nextServiceForDestination(destination.id, timetableRef.current);
        const lane = serviceLane(service);
        if (!lane || (lane === 3 && !platform3Ref.current)) return;
        const laneWaiting = activeDestinations.reduce((sum, candidate) => {
          const candidateService = nextServiceForDestination(candidate.id, timetableRef.current);
          return sum + (serviceLane(candidateService) === lane ? nextPlatformPassengers[candidate.id] || 0 : 0);
        }, 0);
        const laneFree = Math.max(0, platformCapacity(platformLevelRef.current) - laneWaiting);
        const moved = Math.min(nextHall[destination.id], flowBudget, laneFree);
        if (moved > 0) {
          nextHall[destination.id] -= moved;
          nextPlatformPassengers[destination.id] += moved;
          flowBudget -= moved;
        }
      });

      const nextPlatforms = { ...platformsRef.current };
      LANES.forEach((lane) => {
        const current = nextPlatforms[lane];
        if (!current || current.status === 'departing') return;
        const train = { ...current };
        const free = Math.max(0, train.capacity - train.onboard);
        const board = Math.min(free, nextPlatformPassengers[train.destination.id] || 0, train.type.boardRate);
        if (board > 0) { nextPlatformPassengers[train.destination.id] -= board; train.onboard += board; }
        if (train.status === 'dwelling') { train.remaining = Math.max(0, train.remaining - 1); if (train.remaining === 0) train.status = 'ready'; }
        nextPlatforms[lane] = train;
      });

      syncParking(nextParking); syncHall(nextHall); syncPlatformPassengers(nextPlatformPassengers); syncPlatforms(nextPlatforms);
      addCash(passivePerSecond(retailLevelRef.current));
      if (now % 10 === 0) persist();
      setTimeout(tryAutoArrival, 30);
    }, 1000);
    return () => clearInterval(timer);
  }, [phase]);

  const startGame = () => {
    const saved = safeLoad();
    const restore = saved || {};
    const offlineSeconds = saved?.lastSaved ? Math.min(OFFLINE_CAP_SECONDS, Math.max(0, Math.floor((Date.now() - saved.lastSaved) / 1000))) : 0;
    const restoredRetail = restore.retailLevel || 1;
    const offlineIncome = offlineSeconds > 5 ? Math.round(offlineSeconds * passivePerSecond(restoredRetail) * 0.65) : 0;

    cashRef.current = (restore.cash || 450) + offlineIncome;
    stationLevelRef.current = restore.stationLevel || 1; stationXpRef.current = restore.stationXp || 0;
    parkingLevelRef.current = restore.parkingLevel || 1; gateLevelRef.current = restore.gateLevel || restore.ticketLevel || 1;
    hallLevelRef.current = restore.hallLevel || 1; platformLevelRef.current = restore.platformLevel || 1; fleetLevelRef.current = restore.fleetLevel || 1;
    retailLevelRef.current = restoredRetail; ticketLevelRef.current = restore.ticketLevel || 1; platform3Ref.current = Boolean(restore.platform3Unlocked);
    handledRef.current = restore.handled || 0; onTimeRef.current = restore.onTime || 0; lateRef.current = restore.late || 0; departedPassengersRef.current = restore.departedPassengers || 0; lostDemandRef.current = restore.lostDemand || 0;

    setCash(cashRef.current); setStationLevel(stationLevelRef.current); setStationXp(stationXpRef.current);
    setParkingLevel(parkingLevelRef.current); setGateLevel(gateLevelRef.current); setHallLevel(hallLevelRef.current); setPlatformLevel(platformLevelRef.current); setFleetLevel(fleetLevelRef.current);
    setRetailLevel(retailLevelRef.current); setTicketLevel(ticketLevelRef.current); setPlatform3Unlocked(platform3Ref.current);
    setHandled(handledRef.current); setOnTime(onTimeRef.current); setLate(lateRef.current); setDepartedPassengers(departedPassengersRef.current); setLostDemand(lostDemandRef.current);

    timeRef.current = 0; sequence.current = 1700; serviceCounter.current = 0; nextServiceAt.current = 3; demandCursor.current = 0;
    arrivalBusyRef.current = false; departureBusyRef.current = false; arrivalLaneRef.current = null; departureLaneRef.current = null;
    const initial = [];
    for (let i = 0; i < 8; i += 1) { initial.push(createService(nextServiceAt.current)); nextServiceAt.current += SERVICE_INTERVAL; }
    const initialHall = { noorddam: 15, havenstad: 20, oostpoort: stationLevelRef.current >= 2 ? 12 : 0, luchthaven: stationLevelRef.current >= 3 ? 8 : 0 };
    const initialPlatforms = { noorddam: 20, havenstad: 30, oostpoort: stationLevelRef.current >= 2 ? 15 : 0, luchthaven: stationLevelRef.current >= 3 ? 10 : 0 };
    syncTimetable(initial); syncParking(30); syncHall(initialHall); syncPlatformPassengers(initialPlatforms); syncOutside([]); syncPlatforms({ 1: null, 2: null, 3: null });
    setServiceTime(0); setArrivalTrain(null); setArrivalLane(null); setDepartureTrain(null); setDepartureLane(null);
    setMessage(offlineIncome > 0 ? `Welkom terug. De winkelzone verdiende ${formatMoney(offlineIncome)} tijdens je afwezigheid.` : 'Station geopend. Vergroot capaciteit stap voor stap en voorkom dat het volgende onderdeel vastloopt.');
    setPhase('playing');
  };

  if (phase === 'menu') {
    return (
      <SafeAreaView style={styles.screen}>
        <StatusBar barStyle="light-content" />
        <View style={styles.menuWrap}>
          <Text style={styles.kicker}>PASSENGER FLOW / V0.10</Text><Text style={styles.title}>RAIL{`\n`}RUSH HOUR</Text>
          <Text style={styles.subtitle}>Bouw een station als een keten: parkeren → poortjes → hal → perrons → trein. Elke uitbreiding creëert nieuwe reizigers en kan het volgende onderdeel overbelasten.</Text>
          {initialSave ? <View style={styles.savePreview}><Text style={styles.savePreviewTitle}>STATION Lv {initialSave.stationLevel || 1}</Text><Text style={styles.savePreviewText}>{formatMoney(initialSave.cash || 0)} kas • parkeren Lv {initialSave.parkingLevel || 1} • hal Lv {initialSave.hallLevel || 1}</Text></View> : null}
          <Pressable style={styles.primaryButton} onPress={startGame}><Text style={styles.primaryButtonText}>{initialSave ? 'GA VERDER' : 'OPEN STATION'}</Text></Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const parkingCap = parkingCapacity(parkingLevel);
  const hallTotal = sumValues(hallPassengers);
  const hallCap = hallCapacity(hallLevel);
  const platformTotal = sumValues(platformPassengers);
  const perronCap = platformCapacity(platformLevel);
  const openPlatforms = platform3Unlocked ? 3 : 2;
  const maxLaneWaiting = Math.max(...LANES.filter((lane) => lane !== 3 || platform3Unlocked).map((lane) => DESTINATIONS.reduce((sum, destination) => {
    const service = nextServiceForDestination(destination.id, timetable);
    return sum + (serviceLane(service) === lane ? platformPassengers[destination.id] || 0 : 0);
  }, 0)));
  const gatePressure = Math.min(199, Math.round((parkingWaiting / Math.max(1, gateThroughput(gateLevel) * 5)) * 100));
  const trainPressure = Math.min(199, Math.round((platformTotal / Math.max(1, openPlatforms * 260 * fleetLevel)) * 100));
  const stages = [
    { label: 'PARKEREN', pressure: pct(parkingWaiting, parkingCap) },
    { label: 'POORTJES', pressure: gatePressure },
    { label: 'HAL', pressure: pct(hallTotal, hallCap) },
    { label: 'PERRONS', pressure: pct(maxLaneWaiting, perronCap) },
    { label: 'TREINEN', pressure: trainPressure },
  ];
  const bottleneck = [...stages].sort((a, b) => b.pressure - a.pressure)[0]?.label;
  const blockedTrain = outside[0] && platforms[outside[0].plannedLane] ? outside[0] : null;
  const waitingForLane = (lane) => DESTINATIONS.reduce((sum, destination) => {
    const service = nextServiceForDestination(destination.id, timetable);
    return sum + (serviceLane(service) === lane ? platformPassengers[destination.id] || 0 : 0);
  }, 0);
  const xpTarget = levelTarget(stationLevel);

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="light-content" />
      <View style={styles.hud}>
        <View style={styles.hudCell}><Text style={styles.hudLabel}>KAS</Text><Text style={styles.hudMoney}>{formatMoney(cash)}</Text></View>
        <View style={styles.hudCell}><Text style={styles.hudLabel}>STATION</Text><Text style={styles.hudValue}>Lv {stationLevel}</Text></View>
        <View style={styles.hudCell}><Text style={styles.hudLabel}>IN STATION</Text><Text style={styles.hudValue}>{parkingWaiting + hallTotal + platformTotal}</Text></View>
        <View style={styles.hudCell}><Text style={styles.hudLabel}>KNELPUNT</Text><Text style={styles.hudWarning}>{bottleneck}</Text></View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.levelCard}>
          <View style={styles.levelTop}><Text style={styles.levelTitle}>STATIONNIVEAU {stationLevel}</Text><Text style={styles.levelXp}>{stationXp}/{xpTarget} XP</Text></View>
          <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${pct(stationXp, xpTarget)}%` }]} /></View>
          <Text style={styles.levelHint}>{stationLevel === 1 ? 'Volgend niveau opent Oostpoort' : stationLevel === 2 ? 'Volgend niveau opent Luchthaven' : `${handled} treinen • ${departedPassengers} reizigers vervoerd • ${lostDemand} gemiste vraag`}</Text>
        </View>

        <BalanceStrip stages={stages} />

        <StationWorld
          platforms={platforms}
          parkingWaiting={parkingWaiting}
          hallPassengers={hallPassengers}
          platformPassengers={platformPassengers}
          timetable={timetable}
          now={serviceTime}
          parkingLevel={parkingLevel}
          gateLevel={gateLevel}
          hallLevel={hallLevel}
          platformLevel={platformLevel}
          retailLevel={retailLevel}
          ticketLevel={ticketLevel}
          platform3Unlocked={platform3Unlocked}
          arrivalTrain={arrivalTrain}
          arrivalLane={arrivalLane}
          arrivalProgress={arrivalProgress}
          departureTrain={departureTrain}
          departureLane={departureLane}
          departureProgress={departureProgress}
          onTrainPress={depart}
          stationLevel={stationLevel}
        />

        <View style={styles.messageStrip}><View style={styles.messageLamp} /><Text style={styles.messageText}>{message}</Text></View>

        {blockedTrain ? (
          <View style={styles.blockedCard}>
            <View style={styles.blockedTop}><View><Text style={styles.blockedLabel}>TREIN WACHT VOOR STATION</Text><Text style={styles.blockedTrain}>{blockedTrain.id} → {blockedTrain.destination.name}</Text></View><Text style={styles.blockedTime}>+{blockedTrain.wait}s</Text></View>
            <Text style={styles.blockedReason}>Gepland P{blockedTrain.plannedLane} is bezet. Laat hem wachten of wijk uit; de reizigersstroom past zich aan.</Text>
            <View style={styles.divertRow}>{LANES.filter((lane) => lane !== blockedTrain.plannedLane && (lane !== 3 || platform3Unlocked)).map((lane) => <Pressable key={lane} disabled={Boolean(platforms[lane])} style={[styles.divertButton, platforms[lane] && styles.disabled]} onPress={() => divertOutside(lane)}><Text style={styles.divertSmall}>{platforms[lane] ? 'BEZET' : 'WIJK UIT'}</Text><Text style={styles.divertBig}>P{lane}</Text></Pressable>)}</View>
          </View>
        ) : null}

        <Timetable timetable={timetable} now={serviceTime} />

        <Text style={styles.sectionHeading}>VERTREKCONTROLE</Text>
        {LANES.map((lane) => <PlatformDetail key={lane} lane={lane} train={platforms[lane]} waiting={waitingForLane(lane)} now={serviceTime} locked={lane === 3 && !platform3Unlocked} onTrainPress={depart} />)}

        <Text style={styles.sectionHeading}>BOUW DE VOLGENDE SCHAKEL</Text>
        <View style={styles.upgradeGrid}>
          <UpgradeCard title="PARKEERPLAATS" value={`Lv ${parkingLevel}`} description={`${parkingCapacity(parkingLevel)} plaatsen • ${parkingDemandPerSecond(parkingLevel)} reizigers/sec vraag. Meer parkeren = direct meer druk op poortjes.`} cost={parkingCost(parkingLevel)} affordable={cash >= parkingCost(parkingLevel)} onPress={buyParking} bottleneck={bottleneck === 'PARKEREN'} />
          <UpgradeCard title="ENTREE & POORTJES" value={`Lv ${gateLevel}`} description={`${gateThroughput(gateLevel)} reizigers/sec. Verwijdert de wachtrij bij parkeren, maar vult de hal sneller.`} cost={gateCost(gateLevel)} affordable={cash >= gateCost(gateLevel)} onPress={buyGates} bottleneck={bottleneck === 'POORTJES'} />
          <UpgradeCard title="STATIONSHAL" value={`Lv ${hallLevel}`} description={`${hallCapacity(hallLevel)} capaciteit • ${hallThroughput(hallLevel)}/sec naar perrons. Grotere hal verplaatst het knelpunt naar perrons.`} cost={hallCost(hallLevel)} affordable={cash >= hallCost(hallLevel)} onPress={buyHall} bottleneck={bottleneck === 'HAL'} />
          <UpgradeCard title="PERRONCAPACITEIT" value={`Lv ${platformLevel}`} description={`${platformCapacity(platformLevel)} wachtenden per perron. Meer ruimte voorkomt dat de hal niet kan leegstromen.`} cost={platformCost(platformLevel)} affordable={cash >= platformCost(platformLevel)} onPress={buyPlatforms} bottleneck={bottleneck === 'PERRONS'} />
          <UpgradeCard title="TREINVLOOT" value={`Lv ${fleetLevel}`} description="Nieuwe treinen krijgen meer stellen. Dat is de laatste stap als de perrons vol blijven lopen." cost={fleetCost(fleetLevel)} affordable={cash >= fleetCost(fleetLevel)} onPress={buyFleet} bottleneck={bottleneck === 'TREINEN'} />
          <UpgradeCard title="PERRON 3" value={platform3Unlocked ? 'OPEN' : 'BOUW'} description="Een extra spoor geeft meer operationele capaciteit en spreidt reizigers over drie perrons." cost={platform3Cost} affordable={cash >= platform3Cost} onPress={buyPlatform3} done={platform3Unlocked} />
          <UpgradeCard title="WINKELZONE" value={`Lv ${retailLevel}`} description={`${formatMoney(passivePerSecond(retailLevel))}/sec actief inkomen + offline inkomsten.`} cost={retailCost(retailLevel)} affordable={cash >= retailCost(retailLevel)} onPress={buyRetail} />
          <UpgradeCard title="SERVICE & TICKETS" value={`Lv ${ticketLevel}`} description={`+${Math.round((revenueMultiplier(ticketLevel) - 1) * 100)}% ritopbrengst. Verdient meer aan dezelfde reizigersstroom.`} cost={ticketCost(ticketLevel)} affordable={cash >= ticketCost(ticketLevel)} onPress={buyTickets} />
        </View>

        <View style={styles.resultCard}><Text style={styles.resultTitle}>STATIONBEDRIJF</Text><Text style={styles.resultText}>{departedPassengers} reizigers vervoerd • {handled} treinen • {onTime} binnen marge • {late} te laat • {lostDemand} reizigers konden niet parkeren</Text></View>
      </ScrollView>
      <View style={styles.footer}><Text style={styles.footerText}>V0.10 • PARKEREN → POORTJES → HAL → PERRON → TREIN</Text></View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#071016' }, scroll: { flex: 1 }, content: { paddingHorizontal: 11, paddingBottom: 30 },
  menuWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 }, kicker: { color: '#78a8c6', fontSize: 10, fontWeight: '900', letterSpacing: 2.2, marginBottom: 12 },
  title: { color: '#edf4f7', fontSize: 48, lineHeight: 45, fontWeight: '900', letterSpacing: -2, textAlign: 'center' }, subtitle: { color: '#94a4ae', fontSize: 15, lineHeight: 22, textAlign: 'center', marginTop: 20, marginBottom: 18, maxWidth: 390 },
  savePreview: { width: '100%', maxWidth: 360, backgroundColor: '#0d1b22', borderWidth: 1, borderColor: '#284553', borderRadius: 9, padding: 11, marginBottom: 15, alignItems: 'center' }, savePreviewTitle: { color: '#dceaf0', fontSize: 12, fontWeight: '900' }, savePreviewText: { color: '#7e949f', fontSize: 8.5, fontWeight: '800', marginTop: 4 },
  primaryButton: { backgroundColor: '#ffd65a', minWidth: 230, paddingVertical: 16, alignItems: 'center', borderRadius: 9, borderWidth: 2, borderColor: '#ffe795' }, primaryButtonText: { color: '#101820', fontWeight: '900', fontSize: 15, letterSpacing: 1.2 },

  hud: { flexDirection: 'row', paddingHorizontal: 7, paddingTop: 10, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#16232c' }, hudCell: { flex: 1, alignItems: 'center' },
  hudLabel: { color: '#5f717d', fontSize: 6.2, fontWeight: '900', letterSpacing: 0.6 }, hudValue: { color: '#e3edf1', fontSize: 12.5, fontWeight: '900', marginTop: 2 }, hudMoney: { color: '#67e89a', fontSize: 12.5, fontWeight: '900', marginTop: 2 }, hudWarning: { color: '#ffd66d', fontSize: 8.5, fontWeight: '900', marginTop: 4, textAlign: 'center' },

  levelCard: { marginTop: 9, backgroundColor: '#10191f', borderWidth: 1, borderColor: '#325267', borderRadius: 10, padding: 10 }, levelTop: { flexDirection: 'row', justifyContent: 'space-between' }, levelTitle: { color: '#d9e8ef', fontSize: 10, fontWeight: '900' }, levelXp: { color: '#87b6cf', fontSize: 8, fontWeight: '900' }, progressTrack: { height: 8, marginTop: 7, backgroundColor: '#1b2a33', borderRadius: 4, overflow: 'hidden' }, progressFill: { height: '100%', backgroundColor: '#58b9ff' }, levelHint: { color: '#70858f', fontSize: 7.4, fontWeight: '700', marginTop: 5 },

  balanceCard: { marginTop: 8, backgroundColor: '#121a1e', borderWidth: 1, borderColor: '#3a4a53', borderRadius: 10, padding: 9 }, balanceTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, balanceTitle: { color: '#8599a4', fontSize: 6.8, fontWeight: '900', letterSpacing: 1 }, bottleneck: { color: '#ffd56a', fontSize: 7.2, fontWeight: '900' }, balanceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }, balanceArrow: { color: '#5c6c75', fontSize: 16, fontWeight: '900' }, balanceStage: { flex: 1, minHeight: 39, backgroundColor: '#172229', borderWidth: 1, borderColor: '#2c3e48', borderRadius: 5, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 }, balanceStageDanger: { borderColor: '#c96a58', backgroundColor: '#2a1b19' }, balanceStageLabel: { color: '#8fa0aa', fontSize: 5.4, fontWeight: '900', textAlign: 'center' }, balanceStagePct: { color: '#e4edf1', fontSize: 9.5, fontWeight: '900', marginTop: 2 }, balanceHint: { color: '#687b85', fontSize: 6.7, lineHeight: 10, marginTop: 7 },

  worldCard: { marginTop: 9, backgroundColor: '#0b151b', borderWidth: 1, borderColor: '#2d4653', borderRadius: 12, overflow: 'hidden' }, worldHeader: { minHeight: 52, paddingHorizontal: 11, paddingVertical: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#0e1b22', borderBottomWidth: 1, borderBottomColor: '#263a45' }, worldKicker: { color: '#6f8996', fontSize: 6.5, fontWeight: '900', letterSpacing: 0.9 }, worldTitle: { color: '#e5f0f4', fontSize: 15, fontWeight: '900', marginTop: 2 }, worldIncome: { color: '#65e397', fontSize: 11, fontWeight: '900' },
  zoneCard: { marginHorizontal: 8, marginTop: 8, backgroundColor: '#121e24', borderWidth: 1, borderColor: '#30434d', borderRadius: 8, padding: 9 }, zoneHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, zoneKicker: { color: '#6c838f', fontSize: 5.8, fontWeight: '900', letterSpacing: 0.8 }, zoneTitle: { color: '#dbe7eb', fontSize: 11, fontWeight: '900', marginTop: 1 }, zoneLevel: { color: '#76bee5', fontSize: 8.5, fontWeight: '900' },
  carGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 8, padding: 6, backgroundColor: '#19252a', borderRadius: 6 }, carSpace: { width: 22, height: 17, borderWidth: 1, borderColor: '#44535a', borderRadius: 2, alignItems: 'center', justifyContent: 'center' }, carSpaceBusy: { backgroundColor: '#38566a', borderColor: '#6e9ab4' }, carText: { color: '#d4e3ea', fontSize: 8, fontWeight: '900' },
  gateRow: { flexDirection: 'row', gap: 7, justifyContent: 'center', marginTop: 9, marginBottom: 4 }, gate: { width: 28, height: 22, borderWidth: 2, borderColor: '#596d78', borderRadius: 3, backgroundColor: '#1c2b32', alignItems: 'center', justifyContent: 'center' }, gateLight: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#4fe08a' },
  hallZone: { overflow: 'hidden' }, hallBody: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 7 }, hallInfo: { flex: 1 }, hallBig: { color: '#eef4f6', fontSize: 26, fontWeight: '900' }, hallSmall: { color: '#83949d', fontSize: 7.3, fontWeight: '800' }, hallRetail: { color: '#6f8996', fontSize: 6.5, fontWeight: '800', marginTop: 5 }, crowdDots: { width: '48%', flexDirection: 'row', flexWrap: 'wrap', gap: 4, justifyContent: 'flex-end' }, crowdDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#78919e' }, crowdDotAccent: { backgroundColor: '#f3cb64' },
  capacityMeter: { marginTop: 8 }, capacityTop: { flexDirection: 'row', justifyContent: 'space-between' }, capacityLabel: { color: '#6e818b', fontSize: 5.8, fontWeight: '900' }, capacityValue: { color: '#dce6ea', fontSize: 7.5, fontWeight: '900' }, capacityDanger: { color: '#ff8b7d' }, capacityTrack: { height: 6, marginTop: 4, borderRadius: 3, backgroundColor: '#243139', overflow: 'hidden' }, capacityFill: { height: '100%', backgroundColor: '#55b9ef' }, capacityFillDanger: { backgroundColor: '#e76e62' }, capacitySub: { color: '#657984', fontSize: 6.2, marginTop: 3, fontWeight: '700' },
  flowLane: { height: 31, marginHorizontal: 58, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }, flowLaneVertical: { height: 46 }, flowLabel: { position: 'absolute', left: 42, right: 42, top: 3, color: '#5f7681', fontSize: 5.7, fontWeight: '900', textAlign: 'center' }, flowDotsTrack: { height: 26, width: 118, overflow: 'hidden', position: 'relative' }, flowDotsTrackVertical: { height: 40, width: 34 }, flowDot: { position: 'absolute', width: 5, height: 5, borderRadius: 3, backgroundColor: '#f0c85f' },

  platformWorld: { margin: 8, marginTop: 0, backgroundColor: '#101a20', borderWidth: 1, borderColor: '#30434d', borderRadius: 8, padding: 9, position: 'relative', overflow: 'hidden' }, platformLane: { minHeight: 86, borderTopWidth: 1, borderTopColor: '#22333c', paddingTop: 6 }, platformLaneLocked: { opacity: 0.45 }, platformLaneHeader: { flexDirection: 'row', justifyContent: 'space-between' }, platformLaneTitle: { color: '#91a5af', fontSize: 6.7, fontWeight: '900' }, platformLaneCount: { color: '#aebdc4', fontSize: 6.5, fontWeight: '900' }, platformTrack: { height: 42, marginTop: 4, backgroundColor: '#0a1217', borderRadius: 5, position: 'relative', justifyContent: 'center', paddingHorizontal: 7 }, platformEdge: { position: 'absolute', left: 0, right: 0, top: 0, height: 7, backgroundColor: '#46545b' }, rails: { position: 'absolute', left: 7, right: 7, bottom: 7, height: 5, borderTopWidth: 2, borderBottomWidth: 2, borderColor: '#6f7d84' }, staticTrain: { alignSelf: 'center', alignItems: 'center' }, trainCaption: { color: '#9babb3', fontSize: 5.8, fontWeight: '900', marginTop: 2 }, trainCaptionReady: { color: '#5be695' }, trainCaptionLate: { color: '#ff7f8d' }, freeTrackText: { color: '#53636b', fontSize: 6.5, fontWeight: '800', textAlign: 'center' }, constructionText: { color: '#9d8a5b', fontSize: 6.7, fontWeight: '900', textAlign: 'center' }, waitingDotsRow: { minHeight: 15, flexDirection: 'row', gap: 3, paddingTop: 3, flexWrap: 'wrap' }, platformPassengerDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#dcbf62' },
  movingTrain: { position: 'absolute', left: 0, zIndex: 20, alignItems: 'center' }, movingTrainLabel: { color: '#dfe9ed', backgroundColor: '#0e161b', paddingHorizontal: 4, borderRadius: 2, fontSize: 5.5, fontWeight: '900' },
  routeRibbon: { flexDirection: 'row', gap: 5, paddingHorizontal: 8, paddingBottom: 8 }, routePill: { flex: 1, backgroundColor: '#11232d', borderWidth: 1, borderColor: '#31536a', borderRadius: 5, paddingVertical: 5, alignItems: 'center' }, routePillLocked: { opacity: 0.35 }, routeCode: { color: '#7fd1ff', fontSize: 7, fontWeight: '900' }, routeName: { color: '#718893', fontSize: 5.2, fontWeight: '800', marginTop: 1 }, worldFooterText: { color: '#5f747e', fontSize: 6.3, fontWeight: '800', textAlign: 'center', paddingBottom: 9 },

  trainStripInner: { flexDirection: 'row', alignItems: 'center' }, trainSet: { width: 48, height: 20, backgroundColor: '#d9edf8', borderWidth: 1.5, borderColor: '#0b151b', borderRadius: 3, position: 'relative', justifyContent: 'center', overflow: 'hidden' }, trainSetCompact: { width: 40, height: 17 }, trainSetReady: { backgroundColor: '#9ff2bd' }, trainSetLate: { backgroundColor: '#f7a3ad' }, trainCab: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 5, backgroundColor: '#669db8' }, trainWindows: { position: 'absolute', top: 3, left: 9, right: 4, flexDirection: 'row', justifyContent: 'space-around' }, trainWindow: { width: 5, height: 3, borderRadius: 1, backgroundColor: '#31566c' }, trainSetText: { color: '#173443', fontSize: 6.5, fontWeight: '900', textAlign: 'center', marginTop: 6 }, trainSetTextCompact: { fontSize: 5.4 }, trainCoupler: { width: 6, height: 3, backgroundColor: '#697880' }, trainCouplerCompact: { width: 4 }, trainPress: { padding: 3, borderRadius: 5 },

  card: { marginTop: 8, backgroundColor: '#0d161d', borderWidth: 1, borderColor: '#2b3b45', borderRadius: 10, padding: 10 }, cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, cardLabel: { color: '#718591', fontSize: 7.2, fontWeight: '900', letterSpacing: 1.1 }, clock: { color: '#ffd65a', fontSize: 14, fontWeight: '900' }, serviceRow: { minHeight: 38, flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#182630' }, serviceTime: { width: 42, color: '#70d29a', fontSize: 9, fontWeight: '900' }, serviceMain: { flex: 1 }, serviceId: { color: '#e2ebef', fontSize: 10, fontWeight: '900' }, serviceDest: { color: '#7c919c', fontSize: 7.2, fontWeight: '800' }, serviceLane: { width: 26, color: '#58b9ff', fontSize: 9, fontWeight: '900', textAlign: 'center' }, serviceStatus: { width: 72, color: '#c5d1d7', fontSize: 6.8, fontWeight: '900', textAlign: 'right' },

  messageStrip: { minHeight: 40, flexDirection: 'row', alignItems: 'center', marginTop: 8, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: '#0a1218', borderWidth: 1, borderColor: '#20303a', borderRadius: 8 }, messageLamp: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#58b9ff', marginRight: 8 }, messageText: { flex: 1, color: '#a3b1ba', fontSize: 9, lineHeight: 12, fontWeight: '700' },
  sectionHeading: { color: '#78909c', fontSize: 7.5, fontWeight: '900', letterSpacing: 1.2, textAlign: 'center', marginTop: 14, marginBottom: 7 },

  blockedCard: { marginTop: 8, backgroundColor: '#271a0d', borderWidth: 1.5, borderColor: '#d1953d', borderRadius: 10, padding: 10 }, blockedTop: { flexDirection: 'row', justifyContent: 'space-between' }, blockedLabel: { color: '#b79056', fontSize: 7, fontWeight: '900' }, blockedTrain: { color: '#ffe6b1', fontSize: 15, fontWeight: '900', marginTop: 2 }, blockedTime: { color: '#ffbc55', fontSize: 17, fontWeight: '900' }, blockedReason: { color: '#ba9d70', fontSize: 8.5, lineHeight: 12, marginTop: 7 }, divertRow: { flexDirection: 'row', gap: 7, marginTop: 8 }, divertButton: { flex: 1, minHeight: 46, borderRadius: 7, borderWidth: 1, borderColor: '#d1953d', backgroundColor: '#33230f', alignItems: 'center', justifyContent: 'center' }, divertSmall: { color: '#c3a36b', fontSize: 6.5, fontWeight: '900' }, divertBig: { color: '#ffda91', fontSize: 17, fontWeight: '900' }, disabled: { opacity: 0.3 },

  platformDetail: { marginBottom: 6, backgroundColor: '#0d161d', borderWidth: 1, borderColor: '#283842', borderRadius: 8, padding: 9 }, platformDetailReady: { borderColor: '#3bd27a', backgroundColor: '#0e1d15' }, platformDetailLate: { borderColor: '#d15160', backgroundColor: '#211216' }, detailTop: { flexDirection: 'row', justifyContent: 'space-between' }, detailPlatform: { color: '#dce7eb', fontSize: 9, fontWeight: '900' }, detailTime: { color: '#7bc7ee', fontSize: 9, fontWeight: '900' }, detailDestination: { color: '#7f929c', fontSize: 7.2, fontWeight: '800', marginTop: 4 }, detailAction: { color: '#9f8d55', fontSize: 7, fontWeight: '900', marginTop: 5 }, detailActionReady: { color: '#58e691' }, detailMuted: { color: '#71828b', fontSize: 7.5, fontWeight: '700', marginTop: 3 },

  upgradeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, upgradeCard: { width: '48.7%', minHeight: 128, backgroundColor: '#0d161d', borderWidth: 1, borderColor: '#2b3b45', borderRadius: 9, padding: 9 }, upgradeAffordable: { borderColor: '#d4a947', backgroundColor: '#18170f' }, upgradeDone: { borderColor: '#3c9f68', backgroundColor: '#0d1b14' }, upgradeBottleneck: { borderColor: '#e37261', borderWidth: 2 }, upgradeTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 5 }, upgradeTitle: { flex: 1, color: '#dfe9ed', fontSize: 8, fontWeight: '900' }, upgradeValue: { color: '#75c9f5', fontSize: 8, fontWeight: '900' }, upgradeDescription: { color: '#71838d', fontSize: 7, lineHeight: 10, marginTop: 8, flex: 1 }, upgradeCost: { color: '#ffd65a', fontSize: 11, fontWeight: '900', marginTop: 7 },

  resultCard: { marginTop: 12, backgroundColor: '#0b141a', borderWidth: 1, borderColor: '#22333d', borderRadius: 8, padding: 10 }, resultTitle: { color: '#667b87', fontSize: 6.5, fontWeight: '900', letterSpacing: 1 }, resultText: { color: '#9aaab3', fontSize: 8.5, fontWeight: '800', marginTop: 4 },
  footer: { alignItems: 'center', paddingVertical: 7, paddingHorizontal: 8, borderTopWidth: 1, borderTopColor: '#14212a' }, footerText: { color: '#42535e', fontSize: 6.2, fontWeight: '900', textAlign: 'center' },
});