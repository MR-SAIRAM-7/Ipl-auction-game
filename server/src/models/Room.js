import mongoose from 'mongoose';

const { Schema } = mongoose;

const StatsSchema = new Schema(
  {
    matches: Number,
    battingAverage: Number,
    strikeRate: Number,
    wickets: Number,
    economy: Number,
    bowlingAverage: Number,
    catches: Number,
  },
  { _id: false },
);

const PlayerSchema = new Schema(
  {
    id: String,
    name: String,
    role: String,
    country: String,
    age: Number,
    overseas: Boolean,
    battingStyle: String,
    bowlingStyle: String,
    rating: Number,
    basePrice: Number,
    tags: [String],
    blurb: String,
    stats: StatsSchema,
    set: String,
    setLabel: String,
    profile: {
      type: new Schema(
        { legacy: Number, primeForm: Number, formatFit: Number },
        { _id: false },
      ),
      default: undefined,
    },
    aiGenerated: Boolean,
    price: Number,
    soldToTeamId: String,
  },
  { _id: false },
);

/** A franchise's chosen side, submitted after the auction closes. */
const XISchema = new Schema(
  {
    xiIds: [String],
    captainId: String,
    keeperId: String,
    impactId: String,
    auto: Boolean,
    submittedAt: Date,
  },
  { _id: false },
);

/** Everyone sitting at a franchise's table. Any of them can raise the paddle. */
const MemberSchema = new Schema(
  {
    playerId: String,
    name: String,
    isOwner: Boolean,
    connected: Boolean,
  },
  { _id: false },
);

const TeamSchema = new Schema(
  {
    id: String,
    name: String,
    shortName: String,
    color: String,
    ownerId: String,
    ownerName: String,
    members: [MemberSchema],
    purse: Number,
    squad: [PlayerSchema],
    xi: { type: XISchema, default: undefined },
    connected: Boolean,
    isHost: Boolean,
  },
  { _id: false },
);

const SaleSchema = new Schema(
  {
    player: PlayerSchema,
    teamId: String,
    teamName: String,
    byName: String,
    price: Number,
    status: { type: String, enum: ['sold', 'unsold'] },
    at: Date,
  },
  { _id: false },
);

const RoomSchema = new Schema(
  {
    code: { type: String, unique: true, index: true, required: true },
    hostId: String,
    status: { type: String, enum: ['lobby', 'generating', 'auction', 'finished'], default: 'lobby' },
    settings: {
      format: String,
      purse: Number,
      squadSize: Number,
      minSquad: Number,
      bidTimerSec: Number,
      poolSize: Number,
      maxBid: Number,
    },
    theme: String,
    poolSource: String,
    teams: [TeamSchema],
    pool: [PlayerSchema],
    lotIndex: { type: Number, default: -1 },
    history: [SaleSchema],
    unsoldQueue: [PlayerSchema],
    secondRoundDone: { type: Boolean, default: false },
    result: Schema.Types.Mixed,
    finishedAt: Date,
  },
  { timestamps: true },
);

export const RoomModel = mongoose.models.Room || mongoose.model('Room', RoomSchema);
