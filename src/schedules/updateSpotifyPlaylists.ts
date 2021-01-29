import cron from "node-cron";
import { youtubeScrapSearch } from "../initializations/youtube_api";
import {
  spotifyAPI,
  SpotifyPlaylists,
  SpotifyPlaylistsId,
} from "../initializations/spotify_api";
import Playlist, {
  PlaylistTrack,
} from "../initializations/mongo_models/Playlists";

function includesMultiple(
  src: string,
  arr: string[],
  matchAll: boolean = true
) {
  const testExp = (val: string) => src.includes(val);
  if (matchAll) arr.every(testExp);
  return arr.some(testExp);
}

export function updateSpotifyPlaylist(
  time: string,
  playlistId: SpotifyPlaylistsId,
  playlistName: SpotifyPlaylists
) {
  cron.schedule(time, () => spotifyCronJob(playlistId, playlistName));
}

/**
 * queries through youtube for provided spotify track object compares
 * `{channel.name}` with `item.track.artists[0]` & `{track.title}` with
 * youtubeQ query result's `{title}`
 * @author KR Tirtho
 * @param {SpotifyApi.PlaylistTrackObject} item
 * @param {number} index
 * @param {number} tracksLength
 * @return {*}  {(Promise<PlaylistTrack | undefined>)}
 */
async function ytTrackSearch(
  item: SpotifyApi.PlaylistTrackObject,
  index: number,
  tracksLength: number
): Promise<PlaylistTrack | undefined> {
  try {
    // getting the artists formatted for query
    const artists = item.track.artists
      .map((artist, index) => {
        if (index === 0) {
          return `${artist.name} `;
        } else if (index === 1) {
          return `feat. ${artist.name}`;
        }
        return `, ${artist.name}`;
      })
      .join("");
    // querying for matching data
    const ytQResults = await youtubeScrapSearch(
      `${artists} ${item.track.name} official video`
    );
    if (ytQResults) {
      /**
       * Decides matches with following `{ytResult.channel.name}`, `{item.track.artists[0]}`& `{includesMultiple(queryResult.title, [track_name, track_artists])}`
       */
      const matchedRes = ytQResults.filter((qRes) => {
        // temporarily using this later will be replaced
        if (
          qRes.channel.name.includes(item.track.artists[0].name) &&
          includesMultiple(qRes.title!, [
            item.track.name,
            ...item.track.artists.map((v) => v.name),
          ])
        ) {
          return true;
        }
        return false;
      });

      if (matchedRes.length > 0) {
        console.log(
          "Total matched query result is",
          matchedRes.length,
          "in track no.",
          index,
          "total of",
          tracksLength,
          "tracks"
        );
        // returning the properties for the perfect matches
        return {
          name: item.track.name,
          artists: artists,
          url: `https://youtube.com/watch?v=${matchedRes[0].id}`,
        };
      }
    }
  } catch (err) {
    console.error(err);
  }
}

/**
 * spotify playlist updater function which updates database with new
 * music from spotify playlist
 * @author KR Tirtho
 * @param {SpotifyPlaylistsId} playlistId
 * @param {SpotifyPlaylists} playlistName
 */
async function spotifyCronJob(
  playlistId: SpotifyPlaylistsId,
  playlistName: SpotifyPlaylists
) {
  console.log(
    `------------------------------------------------------\nCron Job of ${playlistName} playlist\nDate: ${new Date().toUTCString()}\n------------------------------------------------------
    `
  );
  try {
    const {
      body: { access_token },
    } = await spotifyAPI.clientCredentialsGrant();
    spotifyAPI.setAccessToken(access_token);

    /**
     * this gives a routinely updated playlist which contains infos about
     * tracks that can be used in together with `{youtubeScrapSearch}`
     */
    const { tracks } = (await spotifyAPI.getPlaylist(playlistId)).body;
    console.log(
      "Got new tracks in",
      playlistName,
      "total of",
      tracks.items.length
    );

    const isLongList = tracks.items.length > 25;
    const isTooLongList = tracks.items.length > 60;
    /**
     * stores all the searched track from youtube & filters out the best
     * match that can be found on the spotify playlist tracks
     *
     * It's basically an Array calling & merging @function ytTrackSearch &
     * its return @type {PlaylistTrack[]}
     */
    const availableTracks = [
      /* For below or equal 25 tracks */
      ...(await Promise.all(
        tracks.items
          .slice(1, isLongList ? 25 : tracks.items.length)
          .map((x, i) => ytTrackSearch(x, i, tracks.items.length))
      )),
      /* For below or equal 60 tracks */
      ...(isLongList
        ? await Promise.all(
            tracks.items
              .slice(26, isTooLongList ? 60 : tracks.items.length)
              .map((x, i) => ytTrackSearch(x, i, tracks.items.length))
          )
        : []),
      /* For grater than 60 tracks */
      ...(isTooLongList
        ? await Promise.all(
            tracks.items
              .slice(61, tracks.items.length)
              .map((x, i) => ytTrackSearch(x, i, tracks.items.length))
          )
        : []),
    ].filter(Boolean) as PlaylistTrack[];

    console.log(
      "Total availableTracks",
      availableTracks.length,
      "of",
      tracks.items.length
    );

    const playlist = await Playlist.findOne({ name: playlistName }).exec();

    if (!playlist) {
      /* Creating new playlist due to no playlist available in {name: playlistName} */
      const newPlaylist = await Playlist.create({
        name: playlistName,
        tracks: availableTracks,
      });
      console.log(
        "Created new Playlist with",
        newPlaylist.tracks.length,
        "tracks"
      );
    } else {
      const playlistTracks: PlaylistTrack[] = playlist.tracks;
      /* Filtering out all the tracks that aren't already available in {playlistTrack} */
      const availableUniqueTracks = availableTracks.filter((avTrack) => {
        return !playlistTracks.some((track) => avTrack.name === track.name);
      });
      console.log(
        "Filtered available #Unique tracks",
        availableUniqueTracks.length,
        "of total availableTracks",
        availableTracks.length
      );
      if (availableUniqueTracks.length > 0) {
        // why update if there is no new tracks available
        console.log("Updated Playlist total of", 1);
        /* Updating the playlist with all new musics */
        await Playlist.updateOne(
          { name: playlistName },
          {
            tracks: [...availableUniqueTracks, ...playlistTracks],
            name: playlistName,
          },
          { new: true }
        );
      } else {
        console.log(
          ':"( No new music today due to',
          availableUniqueTracks.length,
          "unique match"
        );
      }
    }
  } catch (err) {
    console.error(err);
  } finally {
    console.log(
      "Finished Cron Job of",
      playlistName,
      "in",
      new Date().toUTCString()
    );
  }
}
