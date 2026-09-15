/**
 * A roster of real cricketers for the auction pool.
 *
 * Identity fields - name, role, country, batting hand, bowling style, overseas -
 * are accurate. The STATS ARE INDICATIVE, not official records: they are rounded
 * career-shape T20 numbers meant to make a player feel right at the auction table,
 * not to be quoted. The `rating` is an editorial T20 value score, not a stat.
 *
 * Set GEMINI_API_KEY to have Gemini build a fresher pool instead; this list is what
 * the game falls back to, and it works with no network at all.
 *
 * Shorthand: n name, r role, c country, b batting, bw bowling, rt rating,
 * s [matches, battingAvg, strikeRate, wickets, economy, bowlingAvg, catches],
 * t tags, d one-line scouting note.
 */

const RHB = 'Right-hand bat';
const LHB = 'Left-hand bat';

const ROSTER = [
  /* ---------------- India · batters ---------------- */
  { n: 'Virat Kohli', r: 'Batter', c: 'India', b: RHB, rt: 95, s: [250, 38.7, 131, 4, 8.8, 92, 100], t: ['Anchor', 'Chase master'], d: 'Relentless accumulator who bats deep and finishes games.' },
  { n: 'Rohit Sharma', r: 'Batter', c: 'India', b: RHB, rt: 90, s: [257, 29.6, 131, 15, 8.0, 34, 90], t: ['Powerplay enforcer', 'Captain'], d: 'Effortless timer of the ball with a big-match record.' },
  { n: 'Shubman Gill', r: 'Batter', c: 'India', b: RHB, rt: 89, s: [103, 39.0, 136, 0, 0, 0, 35], t: ['Anchor', 'Powerplay enforcer'], d: 'Silky top-order batter who converts starts into hundreds.' },
  { n: 'Suryakumar Yadav', r: 'Batter', c: 'India', b: RHB, rt: 91, s: [139, 32.0, 145, 0, 0, 0, 55], t: ['360-degree hitter', 'Middle-order'], d: 'Plays shots to parts of the ground nobody else finds.' },
  { n: 'Yashasvi Jaiswal', r: 'Batter', c: 'India', b: LHB, rt: 86, s: [60, 32.0, 150, 0, 0, 0, 20], t: ['Powerplay enforcer', 'Left-handed'], d: 'Fearless opener who takes the new ball on immediately.' },
  { n: 'Ruturaj Gaikwad', r: 'Batter', c: 'India', b: RHB, rt: 85, s: [70, 39.0, 136, 0, 0, 0, 25], t: ['Anchor', 'Captain'], d: 'Classical opener who makes big scores look serene.' },
  { n: 'Shreyas Iyer', r: 'Batter', c: 'India', b: RHB, rt: 84, s: [115, 31.5, 127, 0, 0, 0, 45], t: ['Middle-order', 'Captain'], d: 'Strong against pace and a proven leader of a batting unit.' },
  { n: 'Tilak Varma', r: 'Batter', c: 'India', b: LHB, rt: 82, s: [45, 36.0, 143, 0, 0, 0, 15], t: ['Finisher', 'Left-handed'], d: 'Young left-hander with a cool head in a chase.' },
  { n: 'Rinku Singh', r: 'Batter', c: 'India', b: LHB, rt: 82, s: [50, 35.0, 148, 0, 0, 0, 20], t: ['Finisher', 'Death-overs hitter'], d: 'Specialist finisher who treats the last over as his own.' },
  { n: 'Devdutt Padikkal', r: 'Batter', c: 'India', b: LHB, rt: 76, s: [65, 28.0, 128, 0, 0, 0, 20], t: ['Anchor', 'Left-handed'], d: 'Elegant left-hander who builds an innings from the top.' },
  { n: 'Rajat Patidar', r: 'Batter', c: 'India', b: RHB, rt: 78, s: [40, 31.0, 148, 0, 0, 0, 15], t: ['Middle-order', 'Spin hitter'], d: 'Clean striker who attacks spin from the moment he arrives.' },
  { n: 'Sai Sudharsan', r: 'Batter', c: 'India', b: LHB, rt: 80, s: [35, 42.0, 140, 0, 0, 0, 12], t: ['Anchor', 'Left-handed'], d: 'Composed left-hander with a very high conversion rate.' },
  { n: 'Ajinkya Rahane', r: 'Batter', c: 'India', b: RHB, rt: 72, s: [185, 30.0, 123, 0, 0, 0, 70], t: ['Anchor', 'Veteran'], d: 'Experienced top-order batter who steadies a wobbling chase.' },
  { n: 'Prithvi Shaw', r: 'Batter', c: 'India', b: RHB, rt: 72, s: [79, 24.0, 147, 0, 0, 0, 25], t: ['Powerplay enforcer'], d: 'All-out attack inside the first six overs.' },
  { n: 'Mayank Agarwal', r: 'Batter', c: 'India', b: RHB, rt: 70, s: [127, 22.0, 134, 0, 0, 0, 40], t: ['Powerplay enforcer'], d: 'Aggressive opener who can take a game away early.' },
  { n: 'Manish Pandey', r: 'Batter', c: 'India', b: RHB, rt: 69, s: [170, 29.0, 121, 0, 0, 0, 60], t: ['Middle-order', 'Fielding livewire'], d: 'Dependable middle-order option and a superb fielder.' },
  { n: 'Nitish Rana', r: 'Batter', c: 'India', b: LHB, rt: 74, s: [110, 27.5, 135, 10, 8.5, 40, 35], t: ['Spin hitter', 'Left-handed'], d: 'Takes on spin early and bowls a tidy over when needed.' },

  /* ---------------- India · wicket-keepers ---------------- */
  { n: 'MS Dhoni', r: 'Wicket-keeper', c: 'India', b: RHB, rt: 88, s: [264, 39.0, 137, 0, 0, 0, 150], t: ['Finisher', 'Legend', 'Captain'], d: 'The coldest finisher the format has produced.' },
  { n: 'Rishabh Pant', r: 'Wicket-keeper', c: 'India', b: LHB, rt: 88, s: [111, 35.0, 148, 0, 0, 0, 85], t: ['360-degree hitter', 'Left-handed'], d: 'Counter-attacking keeper who changes a game in one over.' },
  { n: 'KL Rahul', r: 'Wicket-keeper', c: 'India', b: RHB, rt: 87, s: [132, 46.0, 134, 0, 0, 0, 75], t: ['Anchor', 'Captain'], d: 'Averages enormously and keeps well enough to bat anywhere.' },
  { n: 'Sanju Samson', r: 'Wicket-keeper', c: 'India', b: RHB, rt: 84, s: [160, 30.0, 139, 0, 0, 0, 95], t: ['360-degree hitter', 'Captain'], d: 'Wristy strokeplayer with a gear nobody else has.' },
  { n: 'Ishan Kishan', r: 'Wicket-keeper', c: 'India', b: LHB, rt: 80, s: [105, 28.5, 136, 0, 0, 0, 60], t: ['Powerplay enforcer', 'Left-handed'], d: 'Left-handed keeper who attacks from the first ball.' },
  { n: 'Dhruv Jurel', r: 'Wicket-keeper', c: 'India', b: RHB, rt: 74, s: [30, 28.0, 145, 0, 0, 0, 20], t: ['Finisher', 'Lightning glovework'], d: 'Sharp glovework and a fearless lower-order hitter.' },
  { n: 'Jitesh Sharma', r: 'Wicket-keeper', c: 'India', b: RHB, rt: 73, s: [45, 24.0, 152, 0, 0, 0, 25], t: ['Finisher', 'Death-overs hitter'], d: 'Explosive keeper built for the last four overs.' },

  /* ---------------- India · all-rounders ---------------- */
  { n: 'Hardik Pandya', r: 'All-rounder', c: 'India', b: RHB, bw: 'Right-arm fast-medium', rt: 90, s: [140, 29.0, 146, 60, 8.9, 32, 50], t: ['Finisher', 'Captain', 'Sixth-bowler option'], d: 'Genuine seam-bowling all-rounder who hits the long ball.' },
  { n: 'Ravindra Jadeja', r: 'All-rounder', c: 'India', b: LHB, bw: 'Left-arm orthodox', rt: 89, s: [240, 27.0, 133, 160, 7.6, 29, 100], t: ['Fielding livewire', 'Spin wizard'], d: 'Elite in all three disciplines and the best fielder in the format.' },
  { n: 'Axar Patel', r: 'All-rounder', c: 'India', b: LHB, bw: 'Left-arm orthodox', rt: 84, s: [160, 22.0, 133, 120, 7.3, 30, 50], t: ['Spin wizard', 'Left-handed'], d: 'Miserly left-arm spin and a useful left-handed hitter.' },
  { n: 'Shivam Dube', r: 'All-rounder', c: 'India', b: LHB, bw: 'Right-arm medium', rt: 81, s: [80, 29.0, 152, 12, 9.4, 45, 20], t: ['Spin hitter', 'Left-handed'], d: 'Destroys spin in the middle overs with sheer power.' },
  { n: 'Washington Sundar', r: 'All-rounder', c: 'India', b: LHB, bw: 'Right-arm off-break', rt: 78, s: [60, 20.0, 128, 35, 7.2, 38, 20], t: ['Powerplay bowler', 'Spin wizard'], d: 'Bowls his off-spin in the powerplay and bats sensibly.' },
  { n: 'Abhishek Sharma', r: 'All-rounder', c: 'India', b: LHB, bw: 'Left-arm orthodox', rt: 83, s: [60, 26.0, 165, 10, 8.8, 50, 20], t: ['Powerplay enforcer', 'Left-handed'], d: 'Takes the powerplay apart and rolls his arm over.' },
  { n: 'Ravichandran Ashwin', r: 'All-rounder', c: 'India', b: RHB, bw: 'Right-arm off-break', rt: 78, s: [210, 14.0, 115, 180, 7.2, 30, 45], t: ['Spin wizard', 'Veteran'], d: 'Endlessly inventive off-spinner who thinks batters out.' },
  { n: 'Krunal Pandya', r: 'All-rounder', c: 'India', b: LHB, bw: 'Left-arm orthodox', rt: 74, s: [120, 22.0, 136, 75, 7.4, 34, 35], t: ['Spin wizard', 'Left-handed'], d: 'Holds an innings together with the ball and slogs at the end.' },
  { n: 'Rahul Tewatia', r: 'All-rounder', c: 'India', b: LHB, bw: 'Leg-break', rt: 73, s: [90, 24.0, 140, 25, 8.4, 40, 25], t: ['Finisher', 'Left-handed'], d: 'Has pulled off more improbable finishes than anyone.' },
  { n: 'Shardul Thakur', r: 'All-rounder', c: 'India', b: RHB, bw: 'Right-arm fast-medium', rt: 72, s: [100, 15.0, 145, 95, 9.1, 30, 25], t: ['Wicket-taker', 'Sixth-bowler option'], d: 'Buys wickets and swings the bat without a care.' },
  { n: 'Venkatesh Iyer', r: 'All-rounder', c: 'India', b: LHB, bw: 'Right-arm medium', rt: 75, s: [55, 29.0, 140, 5, 8.9, 60, 18], t: ['Powerplay enforcer', 'Left-handed'], d: 'Tall left-hander who clears the ropes from ball one.' },

  /* ---------------- India · bowlers ---------------- */
  { n: 'Jasprit Bumrah', r: 'Bowler', c: 'India', b: RHB, bw: 'Right-arm fast', rt: 95, s: [140, 8.0, 85, 170, 7.3, 22, 25], t: ['Death-overs specialist', 'Yorker machine'], d: 'The best death bowler in the world, and not close.' },
  { n: 'Mohammed Shami', r: 'Bowler', c: 'India', b: RHB, bw: 'Right-arm fast', rt: 84, s: [110, 9.0, 95, 130, 8.3, 26, 20], t: ['New-ball enforcer', 'Wicket-taker'], d: 'Wicked seam movement with the new ball.' },
  { n: 'Mohammed Siraj', r: 'Bowler', c: 'India', b: RHB, bw: 'Right-arm fast', rt: 82, s: [100, 6.0, 80, 100, 8.6, 28, 20], t: ['New-ball enforcer'], d: 'Hits the seam hard and swings it both ways up front.' },
  { n: 'Arshdeep Singh', r: 'Bowler', c: 'India', b: LHB, bw: 'Left-arm fast-medium', rt: 82, s: [75, 5.0, 90, 95, 8.7, 24, 15], t: ['Death-overs specialist', 'Left-arm'], d: 'Left-arm angle and a yorker he can land under pressure.' },
  { n: 'Yuzvendra Chahal', r: 'Bowler', c: 'India', b: RHB, bw: 'Leg-break googly', rt: 85, s: [160, 6.0, 65, 205, 7.8, 22, 30], t: ['Spin wizard', 'Wicket-taker'], d: 'Tosses it up and takes wickets when others contain.' },
  { n: 'Kuldeep Yadav', r: 'Bowler', c: 'India', b: LHB, bw: 'Left-arm wrist-spin', rt: 83, s: [90, 6.0, 70, 100, 8.1, 24, 15], t: ['Mystery spinner', 'Wicket-taker'], d: 'Left-arm wrist spin that batters simply cannot read.' },
  { n: 'Varun Chakravarthy', r: 'Bowler', c: 'India', b: RHB, bw: 'Right-arm off-break', rt: 82, s: [80, 4.0, 60, 90, 7.5, 25, 15], t: ['Mystery spinner'], d: 'A carrom ball and a knuckle ball nobody has solved.' },
  { n: 'Ravi Bishnoi', r: 'Bowler', c: 'India', b: RHB, bw: 'Leg-break googly', rt: 77, s: [70, 4.0, 60, 70, 8.0, 27, 12], t: ['Spin wizard', 'Powerplay bowler'], d: 'Quick leg-spin that works in any phase of the innings.' },
  { n: 'Bhuvneshwar Kumar', r: 'Bowler', c: 'India', b: RHB, bw: 'Right-arm medium', rt: 79, s: [175, 10.0, 95, 180, 7.6, 27, 25], t: ['New-ball enforcer', 'Veteran'], d: 'Swings the new ball and still nails his death overs.' },
  { n: 'Harshal Patel', r: 'Bowler', c: 'India', b: RHB, bw: 'Right-arm medium', rt: 78, s: [110, 12.0, 120, 140, 8.7, 22, 25], t: ['Death-overs specialist', 'Slower-ball king'], d: 'A bag of slower balls and a remarkable wicket rate.' },
  { n: 'Avesh Khan', r: 'Bowler', c: 'India', b: RHB, bw: 'Right-arm fast', rt: 74, s: [65, 5.0, 85, 65, 8.8, 27, 12], t: ['Wicket-taker'], d: 'Heavy-ball quick who hurries batters on any surface.' },
  { n: 'T Natarajan', r: 'Bowler', c: 'India', b: LHB, bw: 'Left-arm fast-medium', rt: 74, s: [60, 4.0, 80, 65, 8.7, 26, 10], t: ['Yorker machine', 'Left-arm'], d: 'Left-arm yorkers on demand at the death.' },
  { n: 'Khaleel Ahmed', r: 'Bowler', c: 'India', b: LHB, bw: 'Left-arm fast-medium', rt: 73, s: [60, 4.0, 75, 60, 8.6, 28, 10], t: ['New-ball enforcer', 'Left-arm'], d: 'Left-arm swing that takes the ball across the right-hander.' },
  { n: 'Prasidh Krishna', r: 'Bowler', c: 'India', b: RHB, bw: 'Right-arm fast', rt: 75, s: [55, 4.0, 70, 55, 8.5, 28, 10], t: ['New-ball enforcer'], d: 'Extra bounce from a high release point.' },
  { n: 'Mayank Yadav', r: 'Bowler', c: 'India', b: RHB, bw: 'Right-arm fast', rt: 76, s: [15, 3.0, 60, 15, 7.8, 20, 3], t: ['Express pace', 'Uncapped gem'], d: 'Genuinely rapid — the fastest spells of recent seasons.' },
  { n: 'Umran Malik', r: 'Bowler', c: 'India', b: RHB, bw: 'Right-arm fast', rt: 71, s: [40, 3.0, 65, 40, 9.2, 30, 8], t: ['Express pace'], d: 'Raw speed that can blow a top order away on its day.' },
  { n: 'Mukesh Kumar', r: 'Bowler', c: 'India', b: RHB, bw: 'Right-arm medium', rt: 69, s: [35, 4.0, 70, 30, 9.4, 32, 6], t: ['Wicket-taker'], d: 'Skiddy seamer who keeps finding the edge.' },

  /* ---------------- Overseas · batters ---------------- */
  { n: 'David Warner', r: 'Batter', c: 'Australia', b: LHB, rt: 86, s: [184, 40.0, 139, 0, 0, 0, 60], t: ['Powerplay enforcer', 'Left-handed'], d: 'One of the most prolific openers the tournament has seen.' },
  { n: 'Faf du Plessis', r: 'Batter', c: 'South Africa', b: RHB, rt: 83, s: [145, 35.0, 134, 0, 0, 0, 70], t: ['Anchor', 'Captain'], d: 'Tough opener and a shrewd, aggressive captain.' },
  { n: 'Travis Head', r: 'Batter', c: 'Australia', b: LHB, rt: 87, s: [50, 32.0, 175, 5, 8.6, 45, 20], t: ['Powerplay enforcer', 'Left-handed'], d: 'Takes down the new ball faster than almost anyone alive.' },
  { n: 'Aiden Markram', r: 'Batter', c: 'South Africa', b: RHB, bw: 'Right-arm off-break', rt: 78, s: [60, 30.0, 135, 8, 8.3, 40, 25], t: ['Anchor', 'Captain'], d: 'Calm top-order batter who can bowl a few overs of off-spin.' },
  { n: 'Shimron Hetmyer', r: 'Batter', c: 'West Indies', b: LHB, rt: 79, s: [80, 30.0, 155, 0, 0, 0, 25], t: ['Finisher', 'Left-handed'], d: 'Brutal left-handed finisher against pace and spin alike.' },
  { n: 'Tim David', r: 'Batter', c: 'Australia', b: RHB, rt: 78, s: [55, 26.0, 165, 0, 0, 0, 20], t: ['Finisher', 'Death-overs hitter'], d: 'Built purely for the last three overs.' },
  { n: 'Rilee Rossouw', r: 'Batter', c: 'South Africa', b: LHB, rt: 74, s: [40, 27.0, 150, 0, 0, 0, 15], t: ['Middle-order', 'Left-handed'], d: 'Powerful left-hander who clears the ropes square of the wicket.' },
  { n: 'Rachin Ravindra', r: 'Batter', c: 'New Zealand', b: LHB, bw: 'Left-arm orthodox', rt: 78, s: [35, 30.0, 145, 8, 8.4, 45, 12], t: ['Powerplay enforcer', 'Left-handed'], d: 'Attacking left-hander who also bowls tidy left-arm spin.' },

  /* ---------------- Overseas · wicket-keepers ---------------- */
  { n: 'Jos Buttler', r: 'Wicket-keeper', c: 'England', b: RHB, rt: 91, s: [110, 38.0, 149, 0, 0, 0, 60], t: ['Powerplay enforcer', '360-degree hitter'], d: 'When he gets going nobody in the world scores faster.' },
  { n: 'Heinrich Klaasen', r: 'Wicket-keeper', c: 'South Africa', b: RHB, rt: 88, s: [55, 38.0, 172, 0, 0, 0, 30], t: ['Spin hitter', 'Finisher'], d: 'Hits spin into orbit in the middle overs.' },
  { n: 'Nicholas Pooran', r: 'Wicket-keeper', c: 'West Indies', b: LHB, rt: 87, s: [95, 30.0, 162, 0, 0, 0, 45], t: ['Finisher', 'Left-handed'], d: 'Left-handed power hitter with a ridiculous strike rate.' },
  { n: 'Quinton de Kock', r: 'Wicket-keeper', c: 'South Africa', b: LHB, rt: 84, s: [110, 32.0, 134, 0, 0, 0, 65], t: ['Powerplay enforcer', 'Left-handed'], d: 'Fluent left-handed opener who keeps neatly.' },
  { n: 'Phil Salt', r: 'Wicket-keeper', c: 'England', b: RHB, rt: 83, s: [40, 30.0, 165, 0, 0, 0, 20], t: ['Powerplay enforcer'], d: 'Comes out swinging and rarely stops.' },
  { n: 'Devon Conway', r: 'Wicket-keeper', c: 'New Zealand', b: LHB, rt: 80, s: [40, 42.0, 140, 0, 0, 0, 18], t: ['Anchor', 'Left-handed'], d: 'Silky left-hander who makes batting look straightforward.' },
  { n: 'Rahmanullah Gurbaz', r: 'Wicket-keeper', c: 'Afghanistan', b: RHB, rt: 77, s: [40, 27.0, 140, 0, 0, 0, 20], t: ['Powerplay enforcer'], d: 'Hard-hitting Afghan opener who attacks spin well.' },

  /* ---------------- Overseas · all-rounders ---------------- */
  { n: 'Andre Russell', r: 'All-rounder', c: 'West Indies', b: RHB, bw: 'Right-arm fast', rt: 88, s: [135, 28.0, 175, 110, 9.2, 26, 45], t: ['Finisher', 'Death-overs specialist'], d: 'Match-winning power hitting plus overs at the death.' },
  { n: 'Sunil Narine', r: 'All-rounder', c: 'West Indies', b: LHB, bw: 'Right-arm off-break', rt: 87, s: [180, 18.0, 165, 180, 6.8, 25, 45], t: ['Mystery spinner', 'Powerplay enforcer'], d: 'Opens the batting and bowls the most economical spin going.' },
  { n: 'Glenn Maxwell', r: 'All-rounder', c: 'Australia', b: RHB, bw: 'Right-arm off-break', rt: 85, s: [140, 26.0, 155, 35, 8.0, 40, 60], t: ['360-degree hitter', 'Sixth-bowler option'], d: 'Explosive, unorthodox and bowls handy off-spin.' },
  { n: 'Rashid Khan', r: 'All-rounder', c: 'Afghanistan', b: RHB, bw: 'Leg-break googly', rt: 92, s: [130, 16.0, 155, 160, 6.9, 21, 40], t: ['Spin wizard', 'Wicket-taker'], d: 'The most valuable spinner in franchise cricket, and he can hit.' },
  { n: 'Marcus Stoinis', r: 'All-rounder', c: 'Australia', b: RHB, bw: 'Right-arm medium', rt: 81, s: [100, 28.0, 148, 40, 9.3, 35, 30], t: ['Finisher', 'Sixth-bowler option'], d: 'Big-hitting all-rounder who bowls in the middle overs.' },
  { n: 'Liam Livingstone', r: 'All-rounder', c: 'England', b: RHB, bw: 'Leg-break', rt: 80, s: [60, 26.0, 160, 20, 8.6, 42, 25], t: ['Spin hitter', 'Sixth-bowler option'], d: 'Enormous hitter who bowls both off-spin and leg-spin.' },
  { n: 'Sam Curran', r: 'All-rounder', c: 'England', b: LHB, bw: 'Left-arm fast-medium', rt: 79, s: [70, 22.0, 140, 55, 9.0, 28, 20], t: ['Left-arm', 'Finisher'], d: 'Left-arm swing, death overs and useful runs down the order.' },
  { n: 'Mitchell Marsh', r: 'All-rounder', c: 'Australia', b: RHB, bw: 'Right-arm fast-medium', rt: 79, s: [55, 28.0, 145, 30, 8.7, 32, 20], t: ['Powerplay enforcer', 'Sixth-bowler option'], d: 'Powerful top-order batter and a genuine fourth seamer.' },
  { n: 'Cameron Green', r: 'All-rounder', c: 'Australia', b: RHB, bw: 'Right-arm fast-medium', rt: 80, s: [40, 32.0, 150, 20, 9.0, 34, 15], t: ['Finisher', 'Sixth-bowler option'], d: 'Tall all-rounder with pace and enormous reach.' },
  { n: 'Moeen Ali', r: 'All-rounder', c: 'England', b: LHB, bw: 'Right-arm off-break', rt: 76, s: [70, 25.0, 148, 35, 7.6, 32, 20], t: ['Spin wizard', 'Left-handed'], d: 'Attacking left-hander who bowls in the powerplay.' },
  { n: 'Wanindu Hasaranga', r: 'All-rounder', c: 'Sri Lanka', b: RHB, bw: 'Leg-break googly', rt: 81, s: [50, 15.0, 140, 60, 8.2, 22, 15], t: ['Spin wizard', 'Wicket-taker'], d: 'Attacking leg-spinner who strikes every other over.' },
  { n: 'Jason Holder', r: 'All-rounder', c: 'West Indies', b: RHB, bw: 'Right-arm fast-medium', rt: 74, s: [50, 18.0, 135, 45, 8.6, 26, 18], t: ['Death-overs specialist'], d: 'Height, bounce and clever variations at the death.' },
  { n: 'Azmatullah Omarzai', r: 'All-rounder', c: 'Afghanistan', b: RHB, bw: 'Right-arm fast-medium', rt: 74, s: [25, 25.0, 145, 18, 8.8, 30, 8], t: ['Finisher', 'Sixth-bowler option'], d: 'Powerful Afghan all-rounder growing into the format.' },
  { n: 'Will Jacks', r: 'All-rounder', c: 'England', b: RHB, bw: 'Right-arm off-break', rt: 76, s: [35, 27.0, 158, 12, 8.4, 38, 12], t: ['Powerplay enforcer', 'Sixth-bowler option'], d: 'Ball-striker at the top who turns his arm over.' },

  /* ---------------- Overseas · bowlers ---------------- */
  { n: 'Kagiso Rabada', r: 'Bowler', c: 'South Africa', b: RHB, bw: 'Right-arm fast', rt: 87, s: [100, 8.0, 95, 130, 8.3, 20, 20], t: ['New-ball enforcer', 'Wicket-taker'], d: 'Genuine pace and a strike rate few seamers match.' },
  { n: 'Trent Boult', r: 'Bowler', c: 'New Zealand', b: RHB, bw: 'Left-arm fast-medium', rt: 85, s: [120, 6.0, 85, 130, 8.2, 26, 25], t: ['New-ball enforcer', 'Left-arm'], d: 'Swings it back into the right-hander from ball one.' },
  { n: 'Mitchell Starc', r: 'Bowler', c: 'Australia', b: LHB, bw: 'Left-arm fast', rt: 84, s: [45, 8.0, 100, 55, 8.5, 24, 10], t: ['Yorker machine', 'Left-arm'], d: 'Left-arm thunderbolts, new ball or death.' },
  { n: 'Pat Cummins', r: 'Bowler', c: 'Australia', b: RHB, bw: 'Right-arm fast', rt: 83, s: [60, 15.0, 140, 55, 8.5, 28, 15], t: ['Captain', 'Wicket-taker'], d: 'World-class quick and an outstanding leader.' },
  { n: 'Josh Hazlewood', r: 'Bowler', c: 'Australia', b: RHB, bw: 'Right-arm fast-medium', rt: 82, s: [40, 5.0, 80, 45, 7.9, 23, 8], t: ['New-ball enforcer'], d: 'Relentless accuracy that dries a scoring rate up completely.' },
  { n: 'Anrich Nortje', r: 'Bowler', c: 'South Africa', b: RHB, bw: 'Right-arm fast', rt: 81, s: [50, 5.0, 85, 60, 8.3, 22, 10], t: ['Express pace', 'Wicket-taker'], d: 'Consistently the fastest bowler on the park.' },
  { n: 'Jofra Archer', r: 'Bowler', c: 'England', b: RHB, bw: 'Right-arm fast', rt: 82, s: [50, 10.0, 130, 55, 7.9, 22, 12], t: ['Express pace', 'Death-overs specialist'], d: 'Effortless pace with a bouncer nobody enjoys.' },
  { n: 'Matheesha Pathirana', r: 'Bowler', c: 'Sri Lanka', b: RHB, bw: 'Right-arm fast', rt: 80, s: [30, 3.0, 60, 40, 8.2, 20, 5], t: ['Death-overs specialist', 'Slinger'], d: 'Slingy round-arm action and pinpoint death yorkers.' },
  { n: 'Maheesh Theekshana', r: 'Bowler', c: 'Sri Lanka', b: RHB, bw: 'Right-arm off-break', rt: 76, s: [40, 5.0, 70, 40, 7.7, 28, 10], t: ['Mystery spinner'], d: 'Hides the carrom ball better than most.' },
  { n: 'Noor Ahmad', r: 'Bowler', c: 'Afghanistan', b: LHB, bw: 'Left-arm wrist-spin', rt: 79, s: [35, 4.0, 65, 45, 7.6, 22, 8], t: ['Mystery spinner', 'Left-arm'], d: 'Young left-arm wrist spinner with a lethal wrong-un.' },
  { n: 'Adam Zampa', r: 'Bowler', c: 'Australia', b: RHB, bw: 'Leg-break googly', rt: 75, s: [60, 6.0, 80, 55, 8.1, 27, 15], t: ['Spin wizard'], d: 'Canny leg-spinner who controls the middle overs.' },
  { n: 'Lockie Ferguson', r: 'Bowler', c: 'New Zealand', b: RHB, bw: 'Right-arm fast', rt: 76, s: [50, 5.0, 90, 45, 8.6, 29, 10], t: ['Express pace'], d: 'Pure speed and a well-disguised slower ball.' },
  { n: 'Alzarri Joseph', r: 'Bowler', c: 'West Indies', b: RHB, bw: 'Right-arm fast', rt: 74, s: [40, 6.0, 95, 45, 8.7, 26, 8], t: ['Wicket-taker'], d: 'Hit-the-deck quick who takes wickets in clusters.' },
  { n: 'Mustafizur Rahman', r: 'Bowler', c: 'Bangladesh', b: LHB, bw: 'Left-arm fast-medium', rt: 74, s: [60, 4.0, 70, 60, 8.5, 26, 10], t: ['Slower-ball king', 'Left-arm'], d: 'The cutter that made his name still baffles batters.' },
  { n: 'Gerald Coetzee', r: 'Bowler', c: 'South Africa', b: RHB, bw: 'Right-arm fast', rt: 72, s: [20, 6.0, 110, 20, 9.4, 28, 5], t: ['Express pace'], d: 'Quick, aggressive and improving fast.' },
  { n: 'Fazalhaq Farooqi', r: 'Bowler', c: 'Afghanistan', b: LHB, bw: 'Left-arm fast-medium', rt: 73, s: [25, 3.0, 60, 28, 8.4, 25, 5], t: ['New-ball enforcer', 'Left-arm'], d: 'Left-arm swing that sets up right-handers early.' },

  /* ---------------- Legends of the tournament ---------------- */
  { n: 'AB de Villiers', r: 'Batter', c: 'South Africa', b: RHB, rt: 93, s: [184, 39.7, 151, 0, 0, 0, 100], t: ['360-degree hitter', 'Legend'], d: 'Mr 360 — scored to places that should not exist.' },
  { n: 'Chris Gayle', r: 'Batter', c: 'West Indies', b: LHB, rt: 89, s: [142, 39.7, 148, 18, 7.5, 40, 45], t: ['Powerplay enforcer', 'Legend'], d: 'The Universe Boss and the most destructive opener of all.' },
  { n: 'Kieron Pollard', r: 'All-rounder', c: 'West Indies', b: RHB, bw: 'Right-arm medium', rt: 82, s: [189, 28.7, 147, 69, 8.8, 32, 100], t: ['Finisher', 'Legend'], d: 'Enormous hitter, handy seamer and a freakish fielder.' },
  { n: 'Dwayne Bravo', r: 'All-rounder', c: 'West Indies', b: RHB, bw: 'Right-arm fast-medium', rt: 81, s: [161, 22.0, 129, 183, 8.4, 24, 55], t: ['Death-overs specialist', 'Legend'], d: 'The original death-bowling all-rounder.' },
  { n: 'Lasith Malinga', r: 'Bowler', c: 'Sri Lanka', b: RHB, bw: 'Right-arm fast', rt: 88, s: [122, 5.0, 70, 170, 7.1, 19, 15], t: ['Yorker machine', 'Legend'], d: 'The toe-crushing yorker that defined death bowling.' },
  { n: 'Suresh Raina', r: 'Batter', c: 'India', b: LHB, rt: 84, s: [205, 32.5, 136, 25, 7.5, 35, 100], t: ['Middle-order', 'Legend'], d: 'Mr IPL — thousands of runs and a cover fielder without equal.' },
  { n: 'Yuvraj Singh', r: 'All-rounder', c: 'India', b: LHB, bw: 'Left-arm orthodox', rt: 78, s: [132, 24.8, 130, 36, 7.7, 34, 40], t: ['Spin hitter', 'Legend'], d: 'Six sixes in an over — power the format was built around.' },
  { n: 'Virender Sehwag', r: 'Batter', c: 'India', b: RHB, rt: 83, s: [104, 27.6, 155, 6, 7.6, 60, 30], t: ['Powerplay enforcer', 'Legend'], d: 'Saw ball, hit ball, from the very first delivery.' },
  { n: 'Adam Gilchrist', r: 'Wicket-keeper', c: 'Australia', b: LHB, rt: 82, s: [80, 27.2, 133, 0, 0, 0, 55], t: ['Powerplay enforcer', 'Legend'], d: 'The keeper-opener template every side has copied since.' },
  { n: 'Brendon McCullum', r: 'Wicket-keeper', c: 'New Zealand', b: RHB, rt: 78, s: [109, 27.7, 132, 0, 0, 0, 55], t: ['Powerplay enforcer', 'Legend'], d: 'Hit the very first century of the tournament and never slowed.' },
  { n: 'Shane Watson', r: 'All-rounder', c: 'Australia', b: RHB, bw: 'Right-arm fast-medium', rt: 82, s: [145, 30.9, 137, 92, 7.9, 30, 50], t: ['Powerplay enforcer', 'Legend'], d: 'A genuine top-order all-rounder who won finals on his own.' },
  { n: 'Harbhajan Singh', r: 'Bowler', c: 'India', b: RHB, bw: 'Right-arm off-break', rt: 74, s: [163, 10.0, 120, 150, 7.1, 27, 30], t: ['Spin wizard', 'Legend'], d: 'The doosra and a fierce competitive streak.' },
  { n: 'Amit Mishra', r: 'Bowler', c: 'India', b: RHB, bw: 'Leg-break googly', rt: 73, s: [162, 7.0, 90, 174, 7.4, 24, 25], t: ['Spin wizard', 'Legend'], d: 'Three hat-tricks and an unfailing appetite for wickets.' },
  { n: 'Zaheer Khan', r: 'Bowler', c: 'India', b: RHB, bw: 'Left-arm fast-medium', rt: 74, s: [100, 8.0, 95, 102, 7.6, 26, 15], t: ['New-ball enforcer', 'Legend'], d: 'Left-arm swing and the best reverse in the business.' },
  { n: 'Gautam Gambhir', r: 'Batter', c: 'India', b: LHB, rt: 78, s: [154, 31.0, 123, 0, 0, 0, 60], t: ['Anchor', 'Legend', 'Captain'], d: 'Two titles as captain and an opener who never took a backward step.' },
  { n: 'Rahul Dravid', r: 'Batter', c: 'India', b: RHB, rt: 70, s: [89, 28.2, 115, 0, 0, 0, 40], t: ['Anchor', 'Legend'], d: 'The Wall — technique first, always.' },
  { n: 'Jacques Kallis', r: 'All-rounder', c: 'South Africa', b: RHB, bw: 'Right-arm fast-medium', rt: 76, s: [98, 28.0, 108, 65, 7.1, 30, 35], t: ['Anchor', 'Legend'], d: 'The most complete all-rounder the game has produced.' },
  { n: 'Ricky Ponting', r: 'Batter', c: 'Australia', b: RHB, rt: 71, s: [10, 15.0, 110, 0, 0, 0, 5], t: ['Legend', 'Captain'], d: 'A titan of the game, if never quite at home in this format.' },
];

const ROLE_OK = new Set(['Batter', 'Bowler', 'All-rounder', 'Wicket-keeper']);

/** Normalised once at import so callers get the same shape as the Gemini pool. */
export const REAL_PLAYERS = ROSTER.map((p, i) => {
  const [matches, battingAverage, strikeRate, wickets, economy, bowlingAverage, catches] = p.s;
  const bowls = p.r === 'Bowler' || p.r === 'All-rounder';
  return {
    key: `real_${i}`,
    name: p.n,
    role: ROLE_OK.has(p.r) ? p.r : 'Batter',
    country: p.c,
    overseas: p.c !== 'India',
    battingStyle: p.b,
    bowlingStyle: p.bw || (bowls ? 'Right-arm medium' : 'None'),
    rating: p.rt,
    tags: p.t,
    blurb: p.d,
    stats: {
      matches,
      battingAverage,
      strikeRate,
      wickets: bowls ? wickets : 0,
      economy: bowls ? economy : 0,
      bowlingAverage: bowls ? bowlingAverage : 0,
      catches,
    },
  };
});

export const rosterSize = () => REAL_PLAYERS.length;
