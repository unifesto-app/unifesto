/* The two video cuts. orbit.html (picture) and soundtrack.py (sound) both read this file, so cuts land on the beat.
   120 BPM: one bar = 2 s, so every scene is a whole number of bars. kick = [from, to] seconds where the kick drum plays.
   long:  YouTube, 1.43:1, stage 1536x1074 css px at dpr 8/3 = 4096x2864 exactly.
   short: YouTube Shorts and Instagram Reels, 9:16, stage 1080x1920 at dpr 2, scaled down to 1080x1920 (supersampled). */
window.CUTS = {
  "bpm": 120,
  "fps": 30,
  "long": {
    "w": 1536, "h": 1074, "dpr": 2.6666666666666665, "out": [4096, 2864], "kick": [6, 84],
    "scenes": [["intro", 6], ["hook", 6], ["system", 10], ["id", 10], ["stops", 10], ["start", 8], ["tiers", 10], ["kit", 8], ["who", 6], ["map", 6], ["close", 8]]
  },
  "short": {
    "w": 1080, "h": 1920, "dpr": 2, "out": [1080, 1920], "kick": [0, 26],
    "scenes": [["hook", 4], ["system", 5], ["id", 5], ["stops", 5], ["tiers", 5], ["close", 6]]
  }
};
