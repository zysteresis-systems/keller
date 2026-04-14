/**
 * vcdParser.js
 * ─────────────
 * Parses IEEE 1364 VCD (Value Change Dump) text into structured signal data
 * for the waveform viewer component.
 *
 * VCD format reference: IEEE Std 1364-2005, Section 18
 *
 * Output shape:
 * {
 *   timescale: string,
 *   endTime: number,
 *   signals: [
 *     {
 *       name: string,
 *       id: string,
 *       width: number,
 *       scope: string,
 *       changes: [ { time: number, value: string } ]
 *     }
 *   ]
 * }
 */

export function parseVCD(vcdText) {
  const lines = vcdText.split('\n');
  const signals = {};
  const signalOrder = [];
  let timescale = '1ns';
  let currentScope = '';
  let endTime = 0;
  let i = 0;

  // ── Phase 1: Parse header (definitions) ──
  while (i < lines.length) {
    const line = lines[i].trim();

    if (line.startsWith('$timescale')) {
      // Timescale can be on same line or next line
      const match = line.match(/\$timescale\s+(.+?)(?:\s+\$end)?$/);
      if (match) {
        timescale = match[1].trim();
        if (timescale.endsWith('$end')) {
          timescale = timescale.replace('$end', '').trim();
        }
      } else {
        i++;
        timescale = lines[i]?.trim().replace('$end', '').trim() || '1ns';
      }
    }

    if (line.startsWith('$scope')) {
      const match = line.match(/\$scope\s+\w+\s+(\S+)/);
      if (match) {
        currentScope = currentScope ? `${currentScope}.${match[1]}` : match[1];
      }
    }

    if (line.startsWith('$upscope')) {
      const parts = currentScope.split('.');
      parts.pop();
      currentScope = parts.join('.');
    }

    if (line.startsWith('$var')) {
      const match = line.match(/\$var\s+(\w+)\s+(\d+)\s+(\S+)\s+(\S+)(?:\s+\[.*?\])?\s+\$end/);
      if (match) {
        const [, type, widthStr, id, name] = match;
        const width = parseInt(widthStr, 10);
        signals[id] = {
          name,
          id,
          width,
          type,
          scope: currentScope,
          changes: [],
        };
        signalOrder.push(id);
      }
    }

    if (line.startsWith('$enddefinitions')) {
      i++;
      break;
    }

    i++;
  }

  // ── Phase 2: Parse value changes ──
  let currentTime = 0;

  while (i < lines.length) {
    const line = lines[i].trim();

    if (!line || line.startsWith('$')) {
      i++;
      continue;
    }

    // Timestamp line: #<number>
    if (line.startsWith('#')) {
      currentTime = parseInt(line.substring(1), 10);
      if (currentTime > endTime) endTime = currentTime;
      i++;
      continue;
    }

    // Single-bit value change: <value><id>  (e.g., "0!", "1#", "x$")
    if (/^[01xXzZ]/.test(line) && !line.startsWith('b') && !line.startsWith('B')) {
      const value = line[0];
      const id = line.substring(1);
      if (signals[id]) {
        signals[id].changes.push({ time: currentTime, value });
      }
      i++;
      continue;
    }

    // Multi-bit value change: b<binary> <id>  (e.g., "b0011 !")
    if (line.startsWith('b') || line.startsWith('B')) {
      const match = line.match(/^[bB](\S+)\s+(\S+)/);
      if (match) {
        const [, value, id] = match;
        if (signals[id]) {
          signals[id].changes.push({ time: currentTime, value });
        }
      }
      i++;
      continue;
    }

    i++;
  }

  // ── Phase 3: Build output ──
  const orderedSignals = signalOrder
    .filter(id => signals[id])
    .map(id => signals[id]);

  return {
    timescale,
    endTime,
    signals: orderedSignals,
  };
}
