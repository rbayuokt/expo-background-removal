import { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { color } from './theme';

const TILE = 12;

/** Alpha checkerboard, so a transparent specimen reads as transparent. */
export function Checkerboard() {
  const [size, setSize] = useState({ width: 0, height: 0 });

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize((current) =>
      current.width === width && current.height === height ? current : { width, height }
    );
  };

  const columns = Math.ceil(size.width / TILE);
  const rows = Math.ceil(size.height / TILE);

  return (
    <View style={[StyleSheet.absoluteFill, styles.board]} onLayout={onLayout}>
      {Array.from({ length: rows * columns }, (_, index) => (
        <View
          key={index}
          style={{
            width: TILE,
            height: TILE,
            backgroundColor:
              (Math.floor(index / columns) + (index % columns)) % 2 === 0
                ? color.checkA
                : color.checkB,
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  board: { flexDirection: 'row', flexWrap: 'wrap', overflow: 'hidden' },
});
