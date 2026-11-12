const KEY = 'slidey_lang';

const DICT = {
  en: {
    settings: 'SETTINGS',
    restart: 'RESTART',
    resume: 'RESUME',
    mode: 'MODE',
    map: 'MAP',
    difficulty: 'DIFFICULTY',
    easy: 'EASY',
    normal: 'NORMAL',
    classic: 'CLASSIC',
    shaped: 'SHAPED',
    standard: 'STANDARD',
    tetris: 'TETRIS',
    'totem-building': 'CREATURES',
    gameOver: 'MOUTH FULL!',
    noMoves: 'NO MOVES LEFT',
    score: 'FULLNESS',
    newHigh: 'BIGGEST FEAST!',
    highScore: 'BEST FULLNESS',
    best: 'BEST',
    nextJunior: 'NEXT JUNIOR',
    juniorIncoming: 'JUNIORS INCOMING!',
    juniorTools: 'JUNIOR\nTOOLS',
    juniorPower0: 'CROWN · ROW SWEEP',
    juniorPower1: 'SPROUT · GROWTH',
    juniorPower2: 'HORNS · BLAST',
    juniorPower3: 'BOW · SPLIT',
    juniorDesc0: 'Clear whole food tiles touching a row.',
    juniorDesc1: 'Grow one junior +1 stage (max 3).',
    juniorDesc2: 'Cut food within 3×3 of drop.',
    juniorDesc3: 'Halve all food tiles (1-cell tiles stay).',
    juniorUse: 'Drag onto the board · One use each',
    nextMeal: 'NEXT FEAST',
    mealUp: 'BIGGER FEAST!',
    nextRow: 'NEXT BITE',
    nextDrop: 'NEXT',
    boardShape: 'BOARD\nSHAPE',
    corridorSelector: 'WINDING\nCORRIDOR',
    random: 'RANDOM',
    funnel: 'FUNNEL',
    hourglass: 'HOURGLASS',
    diamond: 'DIAMOND',
    corridor: 'WINDING CORRIDOR',
    hintClassic: 'Each full row adds fullness.',
    hintShaped: 'Edges nibble food · Fill a row to eat',
    hintTetris: 'Fill rows to eat food and break pieces',
    hintTotemBuilding: 'Juniors collect immediately when fully grown.',
    hintTotemBuilding2: 'Clear rows to grow and collect juniors.',
    hintJuniorPowers: 'Drag collected juniors to use tools.',
    buildingRules: 'CREATURE RULES',
    buildingMode1: 'JUNIOR DROP',
    buildingMode2: 'GROW UP',
    combo: 'COMBO',
    powerMode: 'FRENZY',
    powerButton: 'FRENZY BUTTON',
    on: 'ON',
    off: 'OFF',
    powerModeActivated: 'FEEDING FRENZY!',
    soundOn: 'SOUND ON',
    soundOff: 'SOUND OFF'
  },
  zh: {
    settings: '设置',
    restart: '重新开始',
    resume: '继续',
    mode: '模式',
    map: '地图',
    difficulty: '难度',
    easy: '简单',
    normal: '普通',
    classic: '经典',
    shaped: '异形',
    standard: '标准',
    tetris: '俄罗斯方块',
    'totem-building': '小怪兽',
    gameOver: '嘴巴塞满啦！',
    noMoves: '无路可走',
    score: '饱腹值',
    newHigh: '最丰盛的一餐！',
    highScore: '最高饱腹值',
    best: '最高',
    nextJunior: '下一只幼崽',
    juniorIncoming: '幼崽来啦！',
    juniorTools: '幼崽\n工具',
    juniorPower0: '皇冠 · 横扫',
    juniorPower1: '嫩芽 · 成长',
    juniorPower2: '犄角 · 爆破',
    juniorPower3: '蝴蝶结 · 分切',
    juniorDesc0: '清除所选行触及的整块食物。',
    juniorDesc1: '所选幼崽成长1阶段（上限3）。',
    juniorDesc2: '切除落点周围3×3内的食物。',
    juniorDesc3: '所有食物块切成两半（单格不变）。',
    juniorUse: '拖到棋盘上使用 · 每只仅用一次',
    nextMeal: '下一场盛宴',
    mealUp: '盛宴加量！',
    nextRow: '下一口',
    nextDrop: '下一块',
    boardShape: '棋盘形状',
    corridorSelector: '蜿蜒走廊',
    random: '随机',
    funnel: '漏斗',
    hourglass: '沙漏',
    diamond: '菱形',
    corridor: '蜿蜒走廊',
    hintClassic: '每次消行都能增加饱腹值。',
    hintShaped: '边缘会啃掉食物 · 填满一行开吃',
    hintTetris: '填满一行，吃掉食物并打碎拼块',
    hintTotemBuilding: '幼崽完全长大后，立即原地收集。',
    hintTotemBuilding2: '消行养大幼崽，即可收集。',
    hintJuniorPowers: '拖动收集的幼崽，使用工具。',
    buildingRules: '幼崽规则',
    buildingMode1: '幼崽掉落',
    buildingMode2: '喂养长大',
    combo: '连击',
    powerMode: '开饭',
    powerButton: '盛宴按钮',
    on: '开',
    off: '关',
    powerModeActivated: '开饭狂欢！',
    soundOn: '音效开',
    soundOff: '音效关'
  }
};

let lang = 'zh';

export function getLang() {
  return lang;
}

export function setLang(next) {
  lang = next === 'zh' ? 'zh' : 'en';
  try { localStorage.setItem(KEY, lang); } catch {}
  return lang;
}

export function loadLang() {
  try {
    const stored = localStorage.getItem(KEY);
    if (stored === 'zh' || stored === 'en') lang = stored;
  } catch {}
  return lang;
}

export function t(key) {
  return DICT[lang][key] ?? DICT.en[key] ?? key;
}

export function modeLabel(id, fallback) {
  return DICT[lang][id] ?? fallback;
}
