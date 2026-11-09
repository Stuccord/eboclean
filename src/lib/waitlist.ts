// Early-access waitlist. Each signup is stored as a "waitlist.join" event, so it needs no extra
// table, shows up in the admin Activity log, and can be exported from /api/admin/waitlist.

export const WAITLIST_EVENT = "waitlist.join";
/** "Messiest spot" answered after joining (the join itself is not repeated). */
export const WAITLIST_SPOT_EVENT = "waitlist.spot";
/** Clicked unsubscribe in a waitlist email. */
export const WAITLIST_UNSUB_EVENT = "waitlist.unsubscribed";

/** "What's your messiest spot?" answers. */
export const SPOTS = ["bedroom", "kitchen", "desk", "living room", "bathroom", "car", "everywhere"] as const;
export type Spot = (typeof SPOTS)[number];

/** Early-bird offer shown on the page. Change the wording here and it updates everywhere. */
export const EARLY_BIRD_SPOTS = 500;
export const EARLY_BIRD_OFFER = "50% off your first year";
