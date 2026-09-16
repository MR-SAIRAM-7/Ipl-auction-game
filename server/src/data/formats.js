/**
 * The three formats an auction can be played for.
 *
 * A format is not cosmetic: it changes which players are worth money, what a legal
 * XI looks like, and how the squads are judged at the end. A death-overs specialist
 * who is priceless in the IPL is close to useless in a Test, and a batter averaging
 * 45 at a strike rate of 70 is the other way round. Everything downstream - the pool
 * ordering, the XI validator and both verdict paths - reads these tables rather than
 * hardcoding T20 assumptions.
 *
 * `weights` are the metric mix used to score a side. They are per format and need not
 * sum to anything in particular; the scorer normalises them.
 */

/** Metric labels, kept here so the client can name whatever it is sent. */
export const METRIC_LABELS = {
  topOrder: 'Top-order runs',
  middleOrder: 'Middle-order',
  powerplay: 'Powerplay impact',
  deathOvers: 'Death overs',
  finishing: 'Finishing',
  paceAttack: 'Pace attack',
  spinAttack: 'Spin attack',
  wicketTaking: 'Wicket-taking',
  containment: 'Containment',
  allRoundBalance: 'All-round balance',
  battingDepth: 'Batting depth',
  endurance: 'Endurance',
  technique: 'Technique',
  keeping: 'Keeping & fielding',
  experience: 'Experience',
  legacy: 'Pedigree',
  primeForm: 'Current form',
  squadBalance: 'Squad balance',
  valueForMoney: 'Value for money',
};

export const FORMATS = {
  ipl: {
    id: 'ipl',
    name: 'IPL',
    longName: 'Franchise T20',
    tagline: 'Twenty overs. An overseas cap, an impact player, and no time to rebuild an innings.',
    overs: 20,
    xiSize: 11,
    /** The IPL fields a maximum of four overseas players in its XI. */
    maxOverseasInXI: 4,
    /** Only the IPL has the impact substitute. */
    impactPlayer: true,
    defaultSquadSize: 15,
    defaultMinSquad: 11,
    /** What a sane XI looks like. `min` is enforced, `ideal` is what scoring rewards. */
    shape: {
      Batter: { min: 2, ideal: 4 },
      'Wicket-keeper': { min: 1, ideal: 1 },
      'All-rounder': { min: 1, ideal: 3 },
      Bowler: { min: 3, ideal: 3 },
    },
    /** Twenty overs at four per bowler means five bowling options, no fewer. */
    minBowlingOptions: 5,
    weights: {
      powerplay: 1.15,
      deathOvers: 1.2,
      finishing: 1.0,
      middleOrder: 0.85,
      spinAttack: 0.95,
      paceAttack: 0.95,
      allRoundBalance: 1.1,
      keeping: 0.6,
      primeForm: 0.9,
      squadBalance: 0.9,
      valueForMoney: 0.8,
    },
    /** How a player's worth is computed in this format. See playerModel.js. */
    scoring: {
      strikeRate: 1.0,
      // Not as low as T20 folklore suggests: the sides that win keep someone in.
      battingAverage: 0.55,
      economy: 1.0,
      bowlingAverage: 0.4,
      wickets: 0.6,
      experience: 0.2,
      legacy: 0.35,
      primeForm: 0.6,
    },
    /** Tags worth more than their raw numbers suggest, and the multiplier they earn. */
    prizedTags: {
      'Death-overs specialist': 1.14,
      'Yorker machine': 1.12,
      Finisher: 1.12,
      'Powerplay enforcer': 1.1,
      '360-degree hitter': 1.1,
      'Death-overs hitter': 1.1,
      'Chase master': 1.1,
      'Mystery spinner': 1.08,
      'Slower-ball king': 1.06,
      'Spin hitter': 1.05,
      // An anchor who bats through twenty overs wins as many games as a slogger.
      Anchor: 1.06,
    },
    discountedTags: {},
  },

  odi: {
    id: 'odi',
    name: 'ODI',
    longName: 'One Day International',
    tagline: 'Fifty overs. Someone has to bat through, and every bowler owes you ten.',
    overs: 50,
    xiSize: 11,
    maxOverseasInXI: null,
    impactPlayer: false,
    defaultSquadSize: 15,
    defaultMinSquad: 11,
    shape: {
      Batter: { min: 3, ideal: 5 },
      'Wicket-keeper': { min: 1, ideal: 1 },
      'All-rounder': { min: 1, ideal: 2 },
      Bowler: { min: 3, ideal: 3 },
    },
    minBowlingOptions: 5,
    weights: {
      topOrder: 1.15,
      middleOrder: 1.1,
      battingDepth: 1.0,
      wicketTaking: 1.1,
      containment: 0.95,
      spinAttack: 1.0,
      paceAttack: 1.0,
      allRoundBalance: 1.05,
      keeping: 0.7,
      endurance: 0.85,
      primeForm: 0.85,
      squadBalance: 0.9,
      valueForMoney: 0.7,
    },
    scoring: {
      strikeRate: 0.5,
      battingAverage: 0.95,
      economy: 0.8,
      bowlingAverage: 0.8,
      wickets: 0.9,
      experience: 0.5,
      legacy: 0.5,
      primeForm: 0.6,
    },
    prizedTags: {
      Anchor: 1.12,
      'Chase master': 1.12,
      'Wicket-taker': 1.1,
      'Spin wizard': 1.06,
      'New-ball enforcer': 1.06,
      Captain: 1.04,
    },
    discountedTags: {
      'Death-overs hitter': 0.96,
    },
  },

  test: {
    id: 'test',
    name: 'Test',
    longName: 'Five-day Test',
    tagline: 'Five days. Averages beat strike rates, and you must bowl a side out twice.',
    overs: null,
    xiSize: 11,
    maxOverseasInXI: null,
    impactPlayer: false,
    defaultSquadSize: 16,
    defaultMinSquad: 11,
    shape: {
      Batter: { min: 4, ideal: 5 },
      'Wicket-keeper': { min: 1, ideal: 1 },
      'All-rounder': { min: 0, ideal: 1 },
      Bowler: { min: 3, ideal: 4 },
    },
    /** Twenty wickets is the job, so four frontline bowlers at minimum. */
    minBowlingOptions: 4,
    weights: {
      technique: 1.25,
      topOrder: 1.2,
      battingDepth: 0.95,
      wicketTaking: 1.3,
      paceAttack: 1.1,
      spinAttack: 1.1,
      endurance: 1.15,
      experience: 1.05,
      legacy: 1.0,
      keeping: 0.75,
      squadBalance: 0.85,
      valueForMoney: 0.6,
    },
    scoring: {
      strikeRate: 0.1,
      battingAverage: 1.35,
      economy: 0.45,
      bowlingAverage: 1.25,
      wickets: 1.15,
      experience: 0.95,
      legacy: 0.9,
      primeForm: 0.35,
    },
    prizedTags: {
      Anchor: 1.18,
      Legend: 1.12,
      'Wicket-taker': 1.12,
      'New-ball enforcer': 1.12,
      'Express pace': 1.08,
      // A white-ball wrist spinner is not automatically a red-ball one, so this is
      // worth less here than the T20 reputation implies.
      'Spin wizard': 1.04,
      Veteran: 1.06,
    },
    /** A T20 slogger's virtues do not survive contact with a red ball. */
    discountedTags: {
      Finisher: 0.82,
      'Death-overs specialist': 0.84,
      'Death-overs hitter': 0.78,
      '360-degree hitter': 0.9,
      'Slower-ball king': 0.86,
      'Mystery spinner': 0.92,
      'Powerplay enforcer': 0.9,
      'Spin hitter': 0.92,
    },
  },
};

export const FORMAT_IDS = Object.keys(FORMATS);

export const DEFAULT_FORMAT = 'ipl';

/** Never returns undefined, so a stale room or a tampered payload still plays. */
export const getFormat = (id) => FORMATS[id] || FORMATS[DEFAULT_FORMAT];

/** The metric keys a format is scored on, in display order. */
export const metricKeysFor = (id) => Object.keys(getFormat(id).weights);

/** What the lobby needs to draw the picker, without shipping the scoring tables. */
export const formatSummaries = () =>
  FORMAT_IDS.map((id) => {
    const f = FORMATS[id];
    return {
      id: f.id,
      name: f.name,
      longName: f.longName,
      tagline: f.tagline,
      xiSize: f.xiSize,
      impactPlayer: f.impactPlayer,
      maxOverseasInXI: f.maxOverseasInXI,
      defaultSquadSize: f.defaultSquadSize,
      defaultMinSquad: f.defaultMinSquad,
      shape: f.shape,
      minBowlingOptions: f.minBowlingOptions,
    };
  });
