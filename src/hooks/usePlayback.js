import { usePlaybackContext } from "../context/PlaybackContext";

export function usePlayback() {
  return usePlaybackContext();
}
