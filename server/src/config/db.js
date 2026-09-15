import mongoose from 'mongoose';

let connected = false;

export const dbReady = () => connected;

export async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.log('[db] MONGODB_URI not set - running with in-memory rooms only (nothing is persisted).');
    return false;
  }
  try {
    mongoose.set('strictQuery', true);
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 6000 });
    connected = true;
    console.log('[db] MongoDB connected');
    return true;
  } catch (err) {
    console.warn(`[db] MongoDB unavailable (${err.message}) - falling back to in-memory rooms.`);
    return false;
  }
}
