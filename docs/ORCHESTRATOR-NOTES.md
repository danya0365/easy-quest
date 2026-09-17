# Orchestrator notes — issues spotted between waves (for the next smoother)
- 2026-09-18 00:57 — shots/smooth2-final-play/11-on-the-bridge.png: Bram stands ON the stream next to the bridge,
  not on the bridge. Water must be solid (or wading-only at the very edge); only the bridge deck is walkable.
- Smoother report: the real P07 Bram (a six-year-old) reads clearly smaller on screen than the placeholder the
  approved frames were composed around — camera distance/FOV or hero scale needs a pass so the hero reads.
- Smoother report: chars.js id is 'hero' (CANON id), not 'bram'.
- Smoother report: demos/P27.html times out waiting for sampled instruments; demos/P28.html fails its own
  hit-envelope assertion (audio agents were mid-edit). Re-check both at the next smoothing pass.
- Smoother report: walking straight up the lane stops ~2.3 from the signpost, just outside its 2.2 reach.
