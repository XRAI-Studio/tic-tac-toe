// DB-free unit tests: deterministic daily config + injection-safe OG rendering.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dailyConfig, buildOgSvg, escapeXml } from '../app.js';

test('dailyConfig is deterministic and matches known vectors', () => {
  // Vectors computed from the md5-seeded generator (epoch 2026-02-19).
  const d1 = dailyConfig('2026-02-19');
  assert.equal(d1.day_number, 1);
  assert.equal(d1.board_size, 3);
  assert.equal(d1.ai_difficulty, 'hard');
  assert.equal(d1.par, 9);
  assert.deepEqual(d1.starting_moves, [{ player: 0, flat: 10 }, { player: 1, flat: 2 }]);

  const d2 = dailyConfig('2026-06-09');
  assert.equal(d2.day_number, 111);
  assert.deepEqual(d2.starting_moves, [{ player: 0, flat: 10 }, { player: 1, flat: 20 }]);

  // Same input → same output (determinism).
  assert.deepEqual(dailyConfig('2026-06-09'), d2);
});

test('escapeXml neutralizes HTML/SVG metacharacters', () => {
  assert.equal(escapeXml('<b>"&\'</b>'), '&lt;b&gt;&quot;&amp;&#39;&lt;/b&gt;');
});

test('buildOgSvg escapes a hostile player_name (no injection)', () => {
  const svg = buildOgSvg({
    board_size: 3,
    moves: [{ player: 0, flat: 0 }, { player: 1, flat: 1 }],
    winner: 0,
    result: 'win',
    player_name: '</text><script>alert(1)</script>"&',
  });
  assert.ok(!svg.includes('<script>'), 'raw <script> must not appear in SVG');
  assert.ok(svg.includes('&lt;script&gt;'), 'script tag must be escaped');
  assert.ok(svg.includes('&amp;'), 'ampersand must be escaped');
  // The card still renders the brand + outcome.
  assert.ok(svg.startsWith('<svg'));
  assert.ok(svg.includes('Blue wins'));
});

test('buildOgSvg caps an over-long player_name', () => {
  const longName = 'A'.repeat(500);
  const svg = buildOgSvg({ board_size: 3, moves: [], winner: null, result: null, player_name: longName });
  // Name is capped at 40 chars before rendering.
  assert.ok(!svg.includes('A'.repeat(41)), 'player_name should be truncated to <= 40 chars');
});
