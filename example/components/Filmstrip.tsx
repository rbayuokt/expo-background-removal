import { Image } from 'expo-image';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Checkerboard } from './Checkerboard';
import { color, font } from '../theme';
import type { Specimen } from '../types';

/** The files a call wrote, each on a checkerboard so alpha reads as alpha. */
export function Filmstrip({ specimens }: { specimens: Specimen[] }) {
  if (specimens.length === 0) {
    return null;
  }
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
      {specimens.map((file) => (
        <View key={file.uri} style={styles.specimen}>
          <View style={styles.frame}>
            <Checkerboard />
            <Image source={{ uri: file.uri }} style={StyleSheet.absoluteFill} contentFit="contain" />
          </View>
          <Text style={styles.label} numberOfLines={1}>
            {file.label}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  strip: { gap: 10, paddingRight: 4 },
  specimen: { width: 88, gap: 5 },
  frame: {
    height: 110,
    backgroundColor: color.mat,
    borderRadius: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.rule,
    overflow: 'hidden',
  },
  label: {
    fontFamily: font.sans,
    fontSize: 11,
    fontWeight: '600',
    color: color.ink,
    textShadowColor: 'rgba(244,245,238,0.9)',
    textShadowRadius: 3,
  },
});
