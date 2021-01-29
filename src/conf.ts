import dotenv from "dotenv"; 
import path from "path"

dotenv.config({ path: path.resolve(__dirname, "..", ".env")});
export const PORT = process.env.PORT;
export const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
export const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
export const MONGO_URI = process.env.MONGO_URI;
