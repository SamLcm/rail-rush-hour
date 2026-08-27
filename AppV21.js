import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import AppV20 from './AppV20';

// DEV-ONLY controller for the web prototype.
// It intentionally leaves AppV20 intact and auto-clicks affordable upgrade cards.
// Replace with native in-game automation before release.

const UPGRADE_TITLES = ['Entree', 'Tickets', 'Security', 'Hal', 'Perron', 'Treinen', 'Retail', 'Manager'];

const parseEuro = (text = '') => {
  const match = text.match(/€\s*([\d.]+)/);
  return match ? Number(match[1].replace(/\./g, '')) : null;
};

const parseLevel = (text = '') => {
  const match = text.match(/Lv\s*(\d+)/i);
  return match ? Number(match[1]) : 0;
};

export default function AppV21() {
  const [enabled, setEnabled] = useState(true);
  const [lastBuy, setLastBuy] = useState('wacht op inkomsten');

  useEffect(() => {
    if (!enabled || typeof document === 'undefined') return undefined;

    const timer = setInterval(() => {
      const bodyText = document.body?.innerText || '';
      const cashMatch = bodyText.match(/KAS\s*€\s*([\d.]+)/i);
      const cash = cashMatch ? Number(cashMatch[1].replace(/\./g, '')) : 0;
      if (!cash) return;

      const buttons = Array.from(document.querySelectorAll('[role="button"], button'));
      const options = buttons
        .map((node) => {
          const text = node.innerText || node.textContent || '';
          const title = UPGRADE_TITLES.find((name) => text.includes(name));
          const cost = parseEuro(text);
          if (!title || cost == null) return null;
          return { node, title, cost, level: parseLevel(text) };
        })
        .filter(Boolean)
        .filter((item) => item.cost <= cash)
        .sort((a, b) => a.level - b.level || a.cost - b.cost);

      const next = options[0];
      if (!next) return;

      next.node.click();
      setLastBuy(`${next.title} Lv ${next.level + 1} • €${next.cost.toLocaleString('nl-NL')}`);
    }, 700);

    return () => clearInterval(timer);
  }, [enabled]);

  return (
    <View style={styles.root}>
      <AppV20 />
      <Pressable onPress={() => setEnabled((value) => !value)} style={[styles.auto, enabled && styles.autoOn]}>
        <Text style={[styles.autoTitle, enabled && styles.autoTitleOn]}>⚙ AUTO-UPGRADE {enabled ? 'AAN' : 'UIT'}</Text>
        <Text style={styles.autoSub}>{enabled ? lastBuy : 'handmatig upgraden'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, position: 'relative', backgroundColor: '#081218' },
  auto: {
    position: 'absolute',
    right: 8,
    top: 98,
    minWidth: 135,
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#596a72',
    backgroundColor: 'rgba(10,23,31,0.94)',
    zIndex: 999,
  },
  autoOn: { borderColor: '#57c982', backgroundColor: 'rgba(12,48,31,0.95)' },
  autoTitle: { color: '#bccbd1', fontSize: 6.5, fontWeight: '900', textAlign: 'center' },
  autoTitleOn: { color: '#72e39b' },
  autoSub: { color: '#8ea2aa', fontSize: 5.2, fontWeight: '700', textAlign: 'center', marginTop: 2 },
});
