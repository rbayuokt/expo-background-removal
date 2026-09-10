import { StyleSheet, Text, View } from 'react-native';

import { color, font } from '../theme';

type Props = { note: string | null; failed: boolean };

export function StatusNote({ note, failed }: Props) {
  if (!note) {
    return null;
  }
  return (
    <View style={styles.chip}>
      <Text style={[styles.note, failed && styles.failed]} numberOfLines={2}>
        {note}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    backgroundColor: 'rgba(244,245,238,0.92)',
    borderRadius: 3,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  note: { fontFamily: font.mono, fontSize: 11, lineHeight: 15, color: color.ink },
  failed: { color: color.alert },
});
