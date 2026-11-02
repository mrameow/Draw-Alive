/* Draw Alive – colour-in templates (black & white outlines).
 * All side-view animals face LEFT, the app's default facing direction.
 * Shapes are closed so the app can work out the silhouette to crop. */
(function () {
  'use strict';
  const DA = window.DA;

  const eye = (x, y, r) => `<circle cx="${x}" cy="${y}" r="${r || 13}"/><circle cx="${x - 2}" cy="${y}" r="${(r || 13) * 0.45}" fill="#111" stroke="none"/>`;
  const N = 'fill="none"';

  const T = [
    { id: 'fish', name: 'Fish', cat: 'Ocean', svg: `
      <path d="M298,150 L372,88 Q352,150 372,212 Z"/>
      <path d="M160,82 Q205,22 262,92 Z"/>
      <path d="M190,212 Q215,258 245,214 Z"/>
      <ellipse cx="190" cy="150" rx="122" ry="76"/>
      <path ${N} d="M138,92 Q118,150 138,208"/>
      <path ${N} d="M205,78 Q185,150 205,224"/>
      <path ${N} d="M255,92 Q240,150 255,208"/>
      <path ${N} d="M78,166 Q92,176 106,166"/>
      ${eye(108, 128, 15)}` },

    { id: 'whale', name: 'Whale', cat: 'Ocean', svg: `
      <path d="M48,170 Q48,80 180,80 Q285,80 318,148 Q336,118 368,96 Q380,142 352,170 Q374,196 378,234 Q340,216 318,188 Q280,232 170,232 Q48,232 48,170 Z"/>
      <path ${N} d="M66,190 Q170,262 300,184"/>
      <path ${N} d="M110,214 L118,226 M150,224 L154,236 M190,226 L192,238 M230,220 L234,232"/>
      <path d="M180,196 Q200,252 236,212 Z"/>
      <path ${N} d="M160,78 Q152,44 126,36 M162,78 Q172,40 198,34 M161,78 L161,40"/>
      <path ${N} d="M66,184 Q82,192 98,186"/>
      ${eye(104, 150, 12)}` },

    { id: 'turtle', name: 'Turtle', cat: 'Ocean', svg: `
      <ellipse cx="128" cy="214" rx="24" ry="34" transform="rotate(25 128 214)"/>
      <ellipse cx="292" cy="214" rx="24" ry="34" transform="rotate(-25 292 214)"/>
      <path d="M318,182 L372,196 L318,206 Z"/>
      <circle cx="74" cy="168" r="38"/>
      <path d="M96,192 Q104,66 210,66 Q316,66 324,192 Z"/>
      <path d="M90,192 L330,192 Q330,214 304,214 L116,214 Q90,214 90,192 Z"/>
      <path d="M180,104 L240,104 L262,146 L240,184 L180,184 L158,146 Z"/>
      <path ${N} d="M180,104 L160,76 M240,104 L262,76 M262,146 L318,150 M240,184 L248,192 M180,184 L172,192 M158,146 L102,150"/>
      <path ${N} d="M46,182 Q58,192 72,186"/>
      ${eye(62, 158, 11)}` },

    { id: 'octopus', name: 'Octopus', cat: 'Ocean', svg: `
      ${[0, 1, 2, 3, 4, 5].map((i) => { const x = 125 + i * 30; const d = i < 3 ? -1 : 1; const s = 0.6 + Math.abs(i - 2.5) * 0.25;
        return `<path d="M${x - 14},160 C${x - 14},205 ${x + d * 40 * s - 14},215 ${x + d * 44 * s},258 Q${x + d * 48 * s + d * 16},270 ${x + d * 50 * s + d * 8},246 C${x + d * 40 * s + 14},210 ${x + 14},200 ${x + 14},160 Z"/>`; }).join('')}
      <ellipse cx="200" cy="116" rx="98" ry="88"/>
      <path ${N} d="M178,150 Q200,170 222,150"/>
      <ellipse cx="140" cy="148" rx="12" ry="7"/><ellipse cx="260" cy="148" rx="12" ry="7"/>
      <circle cx="150" cy="70" r="10"/><circle cx="176" cy="54" r="7"/>
      ${eye(168, 116, 18)}${eye(234, 116, 18)}` },

    { id: 'crab', name: 'Crab', cat: 'Ocean', svg: `
      <path ${N} d="M118,190 L66,206 L50,244 M126,208 L82,236 L76,272 M144,222 L118,258 L120,286"/>
      <path ${N} d="M282,190 L334,206 L350,244 M274,208 L318,236 L324,272 M256,222 L282,258 L280,286"/>
      <path ${N} d="M146,140 L100,112 M254,140 L300,112"/>
      <path d="M84,52 C30,56 34,138 92,128 L84,102 L118,92 C122,66 110,50 84,52 Z"/>
      <path d="M316,52 C370,56 366,138 308,128 L316,102 L282,92 C278,66 290,50 316,52 Z"/>
      <path ${N} d="M178,120 L170,78 M222,120 L230,78"/>
      <ellipse cx="200" cy="172" rx="100" ry="62"/>
      <path ${N} d="M176,190 Q200,206 224,190"/>
      <path ${N} d="M140,150 Q150,140 160,150 M240,150 Q250,140 260,150"/>
      ${eye(170, 70, 14)}${eye(232, 70, 14)}` },

    { id: 'jellyfish', name: 'Jellyfish', cat: 'Ocean', svg: `
      ${[118, 152, 186, 220, 254, 284].map((x, i) => `<path ${N} d="M${x},170 q${i % 2 ? 14 : -14},24 0,46 q${i % 2 ? -14 : 14},24 0,48"/>`).join('')}
      <path d="M86,162 Q86,46 200,46 Q314,46 314,162 Q294,180 274,162 Q254,180 234,162 Q214,180 194,162 Q174,180 154,162 Q134,180 114,162 Q100,176 86,162 Z"/>
      <path ${N} d="M120,96 Q140,70 168,62"/>
      <path ${N} d="M184,126 Q200,140 216,126"/>
      <ellipse cx="148" cy="128" rx="13" ry="7"/><ellipse cx="252" cy="128" rx="13" ry="7"/>
      ${eye(168, 106, 13)}${eye(232, 106, 13)}` },

    { id: 'starfish', name: 'Starfish', cat: 'Ocean', svg: `
      <path d="M200,22 L236,108 L328,112 L256,170 L282,262 L200,212 L118,262 L144,170 L72,112 L164,108 Z"/>
      <path ${N} d="M184,166 Q200,180 216,166"/>
      <circle cx="200" cy="66" r="5"/><circle cx="268" cy="128" r="5"/><circle cx="132" cy="128" r="5"/><circle cx="246" cy="222" r="5"/><circle cx="154" cy="222" r="5"/>
      ${eye(180, 140, 11)}${eye(220, 140, 11)}` },

    { id: 'cat', name: 'Cat', cat: 'Land', svg: `
      <path d="M312,168 Q378,150 356,82 Q370,74 378,92 Q392,166 318,190 Z"/>
      <rect x="140" y="196" width="28" height="70" rx="12"/><rect x="180" y="200" width="28" height="66" rx="12"/>
      <rect x="250" y="200" width="28" height="66" rx="12"/><rect x="290" y="196" width="28" height="70" rx="12"/>
      <ellipse cx="228" cy="176" rx="104" ry="56"/>
      <path ${N} d="M240,128 Q232,150 244,170 M272,132 Q264,152 276,172"/>
      <path d="M62,104 L66,40 L104,82 Z"/><path d="M118,80 L150,40 L156,104 Z"/>
      <circle cx="108" cy="132" r="54"/>
      <path ${N} d="M72,58 L80,82 M140,58 L134,82"/>
      <path d="M98,150 L112,150 L105,160 Z" fill="#111"/>
      <path ${N} d="M105,160 Q98,170 90,166 M105,160 Q112,170 120,166"/>
      <path ${N} d="M80,152 L36,144 M80,162 L38,170 M132,152 L170,146 M132,162 L168,170"/>
      ${eye(86, 126, 11)}${eye(128, 126, 11)}` },

    { id: 'dog', name: 'Dog', cat: 'Land', svg: `
      <path d="M318,150 Q352,104 340,86 Q356,82 360,98 Q366,138 326,172 Z"/>
      <rect x="146" y="192" width="30" height="74" rx="12"/><rect x="186" y="196" width="30" height="70" rx="12"/>
      <rect x="252" y="196" width="30" height="70" rx="12"/><rect x="292" y="192" width="30" height="74" rx="12"/>
      <ellipse cx="232" cy="172" rx="104" ry="52"/>
      <ellipse cx="270" cy="160" rx="32" ry="24"/>
      <ellipse cx="112" cy="122" rx="56" ry="50"/>
      <ellipse cx="64" cy="146" rx="34" ry="24"/>
      <ellipse cx="38" cy="138" rx="11" ry="9" fill="#111"/>
      <path ${N} d="M44,162 Q60,172 76,160"/>
      <path d="M118,80 Q162,88 154,166 Q130,174 118,132 Z"/>
      <path d="M150,156 Q140,186 110,176 L114,164 Q138,170 144,150 Z"/>
      <circle cx="132" cy="184" r="9"/>
      ${eye(98, 112, 11)}` },

    { id: 'rabbit', name: 'Rabbit', cat: 'Land', svg: `
      <circle cx="304" cy="210" r="24"/>
      <ellipse cx="220" cy="196" rx="88" ry="70"/>
      <path ${N} d="M256,150 Q300,180 278,236"/>
      <ellipse cx="174" cy="262" rx="44" ry="15"/><ellipse cx="270" cy="262" rx="36" ry="14"/>
      <ellipse cx="120" cy="62" rx="19" ry="52" transform="rotate(-14 120 62)"/>
      <ellipse cx="164" cy="66" rx="19" ry="52" transform="rotate(16 164 66)"/>
      <ellipse ${N} cx="120" cy="66" rx="7" ry="34" transform="rotate(-14 120 66)"/>
      <ellipse ${N} cx="164" cy="70" rx="7" ry="34" transform="rotate(16 164 70)"/>
      <circle cx="132" cy="138" r="52"/>
      <ellipse cx="88" cy="148" rx="8" ry="6" fill="#111"/>
      <path ${N} d="M88,154 Q92,166 104,164 M86,150 L54,144 M86,158 L56,166"/>
      <circle cx="112" cy="160" r="10"/>
      ${eye(114, 126, 11)}` },

    { id: 'bear', name: 'Bear', cat: 'Land', svg: `
      <circle cx="144" cy="58" r="26"/><circle cx="256" cy="58" r="26"/>
      <circle ${N} cx="144" cy="58" r="12"/><circle ${N} cx="256" cy="58" r="12"/>
      <ellipse cx="200" cy="222" rx="88" ry="70"/>
      <ellipse cx="200" cy="236" rx="46" ry="40"/>
      <ellipse cx="116" cy="210" rx="22" ry="38" transform="rotate(20 116 210)"/>
      <ellipse cx="284" cy="210" rx="22" ry="38" transform="rotate(-20 284 210)"/>
      <ellipse cx="150" cy="274" rx="34" ry="18"/><ellipse cx="250" cy="274" rx="34" ry="18"/>
      <circle cx="200" cy="114" r="72"/>
      <ellipse cx="200" cy="142" rx="34" ry="26"/>
      <ellipse cx="200" cy="130" rx="12" ry="8" fill="#111"/>
      <path ${N} d="M200,138 L200,150 Q190,160 182,154 M200,150 Q210,160 218,154"/>
      ${eye(172, 100, 11)}${eye(228, 100, 11)}` },

    { id: 'elephant', name: 'Elephant', cat: 'Land', svg: `
      <path ${N} d="M336,150 Q356,176 348,196"/>
      <rect x="150" y="190" width="36" height="76" rx="12"/><rect x="196" y="196" width="36" height="70" rx="12"/>
      <rect x="262" y="196" width="36" height="70" rx="12"/><rect x="300" y="190" width="36" height="76" rx="12"/>
      <ellipse cx="240" cy="158" rx="106" ry="72"/>
      <path d="M78,148 Q40,196 58,252 Q74,264 86,250 Q72,206 104,170 Z"/>
      <circle cx="116" cy="128" r="56"/>
      <path d="M104,170 Q96,186 76,188 L80,178 Q92,176 96,166 Z"/>
      <path d="M140,84 Q214,78 206,150 Q196,196 150,176 Q128,140 140,84 Z"/>
      <path ${N} d="M66,214 L80,212 M62,232 L76,232"/>
      ${eye(96, 116, 11)}` },

    { id: 'dino', name: 'Dinosaur', cat: 'Land', svg: `
      ${[[176, 112], [210, 106], [244, 112], [278, 126], [310, 146]].map(([x, y]) => `<path d="M${x - 16},${y + 8} L${x},${y - 24} L${x + 16},${y + 8} Z"/>`).join('')}
      <path d="M58,92 Q58,52 102,52 Q146,52 144,94 L148,128 Q192,108 252,120 Q324,134 384,206 Q324,186 292,198 L292,254 L258,254 L254,218 L204,218 L198,254 L164,254 L160,206 Q122,186 118,142 L110,114 Q80,124 58,112 Z"/>
      <path ${N} d="M140,170 L120,178 L122,192"/>
      <path ${N} d="M62,102 Q84,108 104,100"/>
      <path ${N} d="M170,160 Q220,196 280,170"/>
      ${eye(96, 78, 11)}` },

    { id: 'penguin', name: 'Penguin', cat: 'Land', svg: `
      <ellipse cx="166" cy="276" rx="30" ry="12"/><ellipse cx="234" cy="276" rx="30" ry="12"/>
      <ellipse cx="200" cy="156" rx="82" ry="116"/>
      <path d="M126,130 Q80,190 102,236 Q130,210 136,170 Z"/>
      <path d="M274,130 Q320,190 298,236 Q270,210 264,170 Z"/>
      <path d="M200,72 Q252,72 254,140 Q262,250 200,256 Q138,250 146,140 Q148,72 200,72 Z"/>
      <path d="M182,120 L218,120 L200,142 Z"/>
      <ellipse cx="160" cy="132" rx="11" ry="6"/><ellipse cx="240" cy="132" rx="11" ry="6"/>
      ${eye(178, 102, 11)}${eye(222, 102, 11)}` },

    { id: 'bird', name: 'Bird', cat: 'Sky', svg: `
      <path ${N} d="M184,220 L180,266 L166,276 M180,266 L194,278 M220,220 L218,266 L204,276 M218,266 L232,278"/>
      <path d="M278,150 L352,116 L340,164 L358,196 L276,184 Z"/>
      <ellipse cx="200" cy="164" rx="92" ry="64"/>
      <path d="M180,140 Q250,112 290,160 Q240,214 178,178 Z"/>
      <path ${N} d="M206,158 Q240,150 262,166 M204,174 Q232,172 250,184"/>
      <circle cx="120" cy="116" r="46"/>
      <path d="M80,104 L36,120 L80,132 Z"/>
      <path ${N} d="M80,118 L54,120"/>
      <circle cx="122" cy="140" r="9"/>
      ${eye(110, 106, 11)}` },

    { id: 'owl', name: 'Owl', cat: 'Sky', svg: `
      <path d="M126,78 L114,24 L162,58 Z"/><path d="M274,78 L286,24 L238,58 Z"/>
      <ellipse cx="200" cy="164" rx="94" ry="112"/>
      <ellipse cx="108" cy="186" rx="26" ry="64" transform="rotate(10 108 186)"/>
      <ellipse cx="292" cy="186" rx="26" ry="64" transform="rotate(-10 292 186)"/>
      <ellipse cx="200" cy="208" rx="54" ry="58"/>
      <path ${N} d="M172,196 q8,10 16,0 q8,10 16,0 q8,10 16,0 M164,222 q8,10 16,0 q8,10 16,0 q8,10 16,0 q8,10 16,0 M176,248 q8,10 16,0 q8,10 16,0 q8,10 16,0"/>
      <path d="M170,272 l-8,16 M178,272 l0,18 M186,272 l8,16 M214,272 l-8,16 M222,272 l0,18 M230,272 l8,16"/>
      <circle cx="160" cy="118" r="34"/><circle cx="240" cy="118" r="34"/>
      <path d="M188,146 L212,146 L200,170 Z"/>
      ${eye(160, 118, 16)}${eye(240, 118, 16)}` },

    { id: 'butterfly', name: 'Butterfly', cat: 'Sky', svg: `
      <path d="M196,140 Q120,20 60,52 Q20,90 80,150 Q140,170 196,150 Z"/>
      <path d="M204,140 Q280,20 340,52 Q380,90 320,150 Q260,170 204,150 Z"/>
      <path d="M196,156 Q120,160 92,210 Q90,262 140,250 Q190,230 196,172 Z"/>
      <path d="M204,156 Q280,160 308,210 Q310,262 260,250 Q210,230 204,172 Z"/>
      <circle cx="110" cy="96" r="22"/><circle cx="290" cy="96" r="22"/>
      <circle cx="140" cy="206" r="16"/><circle cx="260" cy="206" r="16"/>
      <path ${N} d="M192,74 Q170,36 150,30 M208,74 Q230,36 250,30"/>
      <circle cx="148" cy="28" r="7" fill="#111"/><circle cx="252" cy="28" r="7" fill="#111"/>
      <ellipse cx="200" cy="160" rx="14" ry="92"/>
      <path ${N} d="M188,120 L212,120 M187,150 L213,150 M188,180 L212,180 M190,210 L210,210"/>` },

    { id: 'alien', name: 'Alien', cat: 'Space', svg: `
      <path ${N} d="M170,60 Q160,30 140,20 M230,60 Q240,30 260,20"/>
      <circle cx="138" cy="20" r="11"/><circle cx="262" cy="20" r="11"/>
      <path d="M150,180 Q150,272 200,272 Q250,272 250,180 Z"/>
      <path d="M156,196 Q110,214 104,252 Q120,256 130,240 Q140,224 160,220 Z"/>
      <path d="M244,196 Q290,214 296,252 Q280,256 270,240 Q260,224 240,220 Z"/>
      <ellipse cx="200" cy="120" rx="96" ry="78"/>
      <ellipse cx="160" cy="118" rx="28" ry="20" fill="#111" transform="rotate(20 160 118)"/>
      <ellipse cx="240" cy="118" rx="28" ry="20" fill="#111" transform="rotate(-20 240 118)"/>
      <circle cx="152" cy="110" r="6" stroke="none"/><circle cx="232" cy="110" r="6" stroke="none"/>
      <path ${N} d="M176,160 Q200,180 224,160"/>
      <circle ${N} cx="200" cy="232" r="16"/>` },

    { id: 'rocket', name: 'Rocket', cat: 'Space', svg: `
      <path d="M150,230 Q200,296 250,230 Z"/>
      <path ${N} d="M178,236 Q200,272 222,236"/>
      <path d="M150,170 L104,236 L150,226 Z"/>
      <path d="M250,170 L296,236 L250,226 Z"/>
      <path d="M200,14 Q276,80 256,232 L144,232 Q124,80 200,14 Z"/>
      <path ${N} d="M156,70 L244,70 M142,206 L258,206"/>
      <circle cx="200" cy="124" r="32"/>
      <circle ${N} cx="200" cy="124" r="20"/>
      <path ${N} d="M200,212 L200,232"/>` }
  ];

  const HEAD = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="800" height="600">' +
    '<g fill="#fff" stroke="#111" stroke-width="6" stroke-linejoin="round" stroke-linecap="round">';
  const TAIL = '</g></svg>';

  T.forEach((t) => {
    t.full = HEAD + t.svg + TAIL;
    t.url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(t.full);
  });

  DA.TEMPLATES = T;
  DA.TEMPLATE_CATS = ['All', 'Ocean', 'Land', 'Sky', 'Space'];
})();
