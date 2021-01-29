import { updateSpotifyPlaylist } from "./schedules/updateSpotifyPlaylists";
import {
  SpotifyPlaylists,
  SpotifyPlaylistsId,
} from "./initializations/spotify_api";
import {MONGO_URI} from "./conf"
import mongoose from "mongoose";

mongoose.connect(MONGO_URI as string, { useNewUrlParser: true, useUnifiedTopology: true }, (err) => {
  if (err) console.log("Failed to connect:", err);
  return console.log("Connection Established to: ", MONGO_URI);
});

mongoose.set("useCreateIndex", true);
mongoose.set("useFindAndModify", false);
updateSpotifyPlaylist(
  "0 0 13 * * *",
  SpotifyPlaylistsId.daily,
  SpotifyPlaylists.daily
); //everyday 1PM

updateSpotifyPlaylist(
  "0 0 14 */2 * *",
  SpotifyPlaylistsId.releases,
  SpotifyPlaylists.releases
); //every two day 2PM

updateSpotifyPlaylist(
  "0 0 15 * * 7",
  SpotifyPlaylistsId.weekly,
  SpotifyPlaylists.weekly
); // every sunday 3PM

(mongoose as any).Promise = global.Promise;